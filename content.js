const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (message, extra) => {
  if (extra !== undefined) {
    console.log(`[Content] ${message}`, extra);
  } else {
    console.log(`[Content] ${message}`);
  }
};

const fillInputValue = (selector, value) => {
  const element = document.querySelector(selector);

  if (!element) {
    log(`Element not found for selector: ${selector}`);
    return false;
  }

  element.value = value ?? "";
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));

  log(`Filled ${selector} with value: ${value}`);
  return true;
};

const selectOptionValue = (selector, value) => {
  const element = document.querySelector(selector);

  if (!element) {
    log(`Select element not found for selector: ${selector}`);
    return false;
  }

  const option = Array.from(element.options).find(
    (item) => item.value === value || item.textContent?.trim() === value
  );

  if (option) {
    element.value = option.value;
  } else {
    element.value = value ?? "";
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));

  log(`Selected ${selector} option: ${element.value}`);
  return true;
};

const tickCheckbox = (selector) => {
  const checkbox = document.querySelector(selector);

  if (!checkbox) {
    log(`Checkbox not found for selector: ${selector}`);
    return false;
  }

  if (!checkbox.checked) {
    checkbox.click();
  }

  log(`Checkbox ${selector} checked`);
  return true;
};

const handleFillForm = async (data = {}) => {
  log("Received fillForm action", data);

  tickCheckbox("#choice_2_131_1");

  await delay(100);

  fillInputValue("#input_2_127", data.registrationNumber || "AB-123-CD");
  fillInputValue("#input_2_128", data.vin || "VF3ABC12345678901");
  fillInputValue("#input_2_129", data.mileage || "120000");
  selectOptionValue("#input_2_88", data.fuelType || "Diesel");
  selectOptionValue("#input_2_142", data.usageType || "Particulier");

  log("Form auto-fill completed");
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "fillForm") {
    handleFillForm(message.data);
  }
});
