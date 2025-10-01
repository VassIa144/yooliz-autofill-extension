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

const handleFillForm = async (data = {}) => {
  log("Received fillForm action", data);

  await setCheckboxState("#choice_2_131_1", true);

  await delay(400);

  await fillInputValue("#input_2_127", data.registrationNumber || "AB-123-CD");
  await fillInputValue("#input_2_128", data.vin || "VF3ABC12345678901");
  await fillInputValue("#input_2_129", data.mileage || "120000");
  await selectOptionValue("#input_2_88", data.fuelType || "Diesel");
  await selectOptionValue("#input_2_142", data.usageType || "Particulier");

  log("Form auto-fill completed");
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === "fillForm") {
    handleFillForm(message.data);
  }
});
