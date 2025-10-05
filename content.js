const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_WAIT_OPTIONS = { timeout: 5000, interval: 50 };

const log = (message, extra) => {
  if (extra !== undefined) {
    console.log(`[Content] ${message}`, extra);
  } else {
    console.log(`[Content] ${message}`);
  }
};

const waitForElement = (selector, { timeout = 5000, interval = 100 } = {}) =>
  new Promise((resolve) => {
    const startTime = Date.now();

    const checkElement = () => {
      const element = document.querySelector(selector);

      if (element) {
        resolve(element);
        return;
      }

      if (Date.now() - startTime >= timeout) {
        resolve(null);
        return;
      }

      setTimeout(checkElement, interval);
    };

    checkElement();
  });

const triggerEvents = (element, events) => {
  events.forEach((eventName) => {
    element.dispatchEvent(new Event(eventName, { bubbles: true }));
  });
};

const waitForSelectorsOrLabel = async (
  selectors = [],
  labelText,
  options = DEFAULT_WAIT_OPTIONS
) => {
  const uniqueSelectors = Array.from(
    new Set(selectors.filter((selector) => typeof selector === "string" && selector))
  );

  const tryResolve = () => {
    for (const selector of uniqueSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      } catch (error) {
        log(`Invalid selector skipped: ${selector}`, error);
      }
    }

    if (labelText) {
      const control = findElementByLabelText(labelText);
      if (control) {
        return control;
      }
    }

    return null;
  };

  const immediateMatch = tryResolve();
  if (immediateMatch) {
    return immediateMatch;
  }

  const startTime = Date.now();
  while (Date.now() - startTime < options.timeout) {
    await delay(options.interval);
    const nextMatch = tryResolve();
    if (nextMatch) {
      return nextMatch;
    }
  }

  return null;
};

const normalizeText = (text = "") =>
  text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const findElementByLabelText = (labelText) => {
  if (!labelText) {
    return null;
  }

  const normalizedTarget = normalizeText(labelText);

  const labels = Array.from(document.querySelectorAll("label"));
  for (const label of labels) {
    const normalizedLabel = normalizeText(label.textContent || "");

    if (!normalizedLabel || !normalizedLabel.includes(normalizedTarget)) {
      continue;
    }

    if (label.htmlFor) {
      const control = document.getElementById(label.htmlFor);
      if (control) {
        return control;
      }
    }

    const fallbackControl = label.querySelector("input, select, textarea");
    if (fallbackControl) {
      return fallbackControl;
    }
  }

  return null;
};

const waitForLabelElement = async (labelText, options = DEFAULT_WAIT_OPTIONS) => {
  const startTime = Date.now();

  while (Date.now() - startTime < options.timeout) {
    const control = findElementByLabelText(labelText);
    if (control) {
      return control;
    }

    await delay(options.interval);
  }

  return null;
};

const resolveElementTarget = async (target, options = DEFAULT_WAIT_OPTIONS) => {
  if (!target) {
    return null;
  }

  if (typeof target === "string") {
    return waitForElement(target, options);
  }

  if (Array.isArray(target)) {
    for (const candidate of target) {
      const element = await resolveElementTarget(candidate, options);
      if (element) {
        return element;
      }
    }

    return null;
  }

  if (typeof target === "object") {
    const selectors = [];

    if (typeof target.selector === "string") {
      selectors.push(target.selector);
    }

    if (Array.isArray(target.selectors)) {
      target.selectors
        .filter((item) => typeof item === "string")
        .forEach((item) => selectors.push(item));
    }

    const labelText = typeof target.labelText === "string" ? target.labelText : undefined;

    const directMatch = await waitForSelectorsOrLabel(selectors, labelText, options);
    if (directMatch) {
      return directMatch;
    }
  }

  return null;
};

const fillInputValue = async (target, value) => {
  const element = await resolveElementTarget(target);

  if (!element) {
    log(`Element not found for target`, target);
    return false;
  }

  element.focus();
  element.value = value ?? "";
  triggerEvents(element, ["input", "change", "blur"]);

  log("Filled field with value", { target, value });
  return true;
};

const selectOptionValue = async (target, value) => {
  let element = await resolveElementTarget(target);

  if (!element) {
    log(`Select element not found for target`, target);
    return false;
  }

  if (value === undefined || value === null || value === "") {
    log(`No value provided for select`, target);
    return true;
  }

  const normalizedValue = normalizeText(value);
  const maxAttempts = 6;

  const findMatchingOption = (selectElement) => {
    const options = Array.from(selectElement?.options || []);
    return (
      options.find((item) => {
        const optionValue = normalizeText(item.value ?? "");
        const optionText = normalizeText(item.textContent ?? "");
        return optionValue === normalizedValue || optionText === normalizedValue;
      }) ||
      options.find((item) => {
        const optionValue = normalizeText(item.value ?? "");
        const optionText = normalizeText(item.textContent ?? "");
        return optionText.includes(normalizedValue) || normalizedValue.includes(optionText);
      })
    );
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!element) {
      log("Select element became unavailable, tentative de nouvelle résolution", target);
      element = await resolveElementTarget(target);
      if (!element) {
        await delay(80);
        continue;
      }
    }

    const option = findMatchingOption(element);

    if (option) {
      element.value = option.value;
      triggerEvents(element, ["input", "change", "blur"]);

      log("Selected option for field", { target, value: element.value });
      return true;
    }

    await delay(100);

    if (!document.contains(element)) {
      element = null;
    }
  }

  log(`Option not found for value: ${value}`, target);
  return false;
};

const setCheckboxState = async (target, shouldCheck = true) => {
  const checkbox = await resolveElementTarget(target);

  if (!checkbox) {
    log(`Checkbox not found for target`, target);
    return false;
  }

  if (checkbox.checked !== shouldCheck) {
    checkbox.checked = shouldCheck;
    triggerEvents(checkbox, ["input", "change", "click"]);
  }

  log("Checkbox field updated", { target, shouldCheck });
  return true;
};

const ensureStep = async (stepPromise, errorMessage) => {
  const result = await stepPromise;

  if (!result) {
    throw new Error(errorMessage);
  }
};

const handleFillForm = async (data = {}) => {
  log("Received fillForm action", data);

  await ensureStep(
    setCheckboxState("#choice_2_131_1", true),
    "Impossible d'activer la saisie manuelle."
  );

  await ensureStep(
    fillInputValue("#input_2_127", data.make ?? ""),
    "Impossible de remplir le champ « Marque »"
  );
  await ensureStep(
    fillInputValue("#input_2_128", data.model ?? ""),
    "Impossible de remplir le champ « Modèle »"
  );
  await ensureStep(
    fillInputValue("#input_2_129", data.engine ?? ""),
    "Impossible de remplir le champ « Motorisation »"
  );
  if (data.vehicleType) {
    await ensureStep(
      selectOptionValue(
        { selectors: ["#input_2_130", "#input_2_87"], labelText: "Type de véhicule" },
        data.vehicleType
      ),
      "Impossible de sélectionner le type de véhicule."
    );
  } else {
    log("Vehicle type non fourni, étape ignorée.");
  }

  if (data.vehicleCategory) {
    await ensureStep(
      selectOptionValue(
        { selectors: ["#input_2_90", "#input_2_143"], labelText: "Catégorie" },
        data.vehicleCategory
      ),
      "Impossible de sélectionner la catégorie."
    );
  } else {
    log("Catégorie de véhicule non fournie, étape ignorée.");
  }
  try {
    await ensureStep(
      selectOptionValue("#input_2_88", data.fuelType || "Diesel"),
      "Impossible de sélectionner le carburant."
    );
  } catch (error) {
    log("Fuel selection step failed but continuing", error);
  }
  await ensureStep(
    selectOptionValue(
      {
        selectors: [
          "#input_2_142",
          "#input_2_91",
          "select[name='input_2_142']",
          "select[name='input_2_91']",
        ],
        labelText: "Usage",
      },
      data.usageType || "Particulier"
    ),
    "Impossible de sélectionner l'usage."
  );

  log("Form auto-fill completed");
};

const registerContentTab = ({ silent = false } = {}) => {
  try {
    chrome.runtime.sendMessage({ action: "registerContentTab" }, (response) => {
      if (chrome.runtime.lastError) {
        if (!silent) {
          log("Failed to register content tab", chrome.runtime.lastError);
        }
        return;
      }

      if (!response?.success) {
        if (!silent) {
          log("Background did not accept registration", response);
        }
        return;
      }

      if (!silent) {
        log("Content tab registered with background");
      }
    });
  } catch (error) {
    if (!silent) {
      log("Unexpected error while registering content tab", error);
    }
  }
};

registerContentTab();
setInterval(() => registerContentTab({ silent: true }), 15000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    registerContentTab({ silent: true });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "fillForm") {
    handleFillForm(message.data)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        log("Auto-fill failed", error);
        sendResponse({ success: false, error: error?.message || "Remplissage impossible." });
      });

    return true;
  }

  return undefined;
});
