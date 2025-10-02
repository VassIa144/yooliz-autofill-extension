const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const fillInputValue = async (selector, value) => {
  const element = await waitForElement(selector);

  if (!element) {
    log(`Element not found for selector: ${selector}`);
    return false;
  }

  element.focus();
  element.value = value ?? "";
  triggerEvents(element, ["input", "change", "blur"]);

  log(`Filled ${selector} with value: ${value}`);
  return true;
};

const selectOptionValue = async (selector, value) => {
  const element = await waitForElement(selector);

  if (!element) {
    log(`Select element not found for selector: ${selector}`);
    return false;
  }

  const option = Array.from(element.options || []).find((item) => {
    const text = item.textContent?.trim();
    return item.value === value || (text && text === value);
  });

  if (option) {
    element.value = option.value;
  } else if (value !== undefined) {
    element.value = value;
  }

  triggerEvents(element, ["input", "change", "blur"]);

  log(`Selected ${selector} option: ${element.value}`);
  return true;
};

const setCheckboxState = async (selector, shouldCheck = true) => {
  const checkbox = await waitForElement(selector);

  if (!checkbox) {
    log(`Checkbox not found for selector: ${selector}`);
    return false;
  }

  if (checkbox.checked !== shouldCheck) {
    checkbox.checked = shouldCheck;
    triggerEvents(checkbox, ["input", "change", "click"]);
  }

  log(`Checkbox ${selector} set to ${shouldCheck}`);
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

  await delay(400);

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
  await ensureStep(
    selectOptionValue("#input_2_88", data.fuelType || "Diesel"),
    "Impossible de sélectionner le carburant."
  );
  await ensureStep(
    selectOptionValue("#input_2_142", data.usageType || "Particulier"),
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
