const vehicleData = {
  registrationNumber: "AB-123-CD",
  vin: "VF3ABC12345678901",
  mileage: "120000",
  fuelType: "Diesel",
  usageType: "Particulier"
};

function logStatus(message, data) {
  console.log(`[Popup] ${message}`, data ?? "");
}

async function ensureTabsPermission() {
  try {
    const hasPermission = await chrome.permissions.contains({ permissions: ["tabs"] });

    if (hasPermission) {
      return true;
    }

    const granted = await chrome.permissions.request({ permissions: ["tabs"] });

    if (!granted) {
      logStatus("User denied optional tabs permission");
    }

    return granted;
  } catch (error) {
    console.error("[Popup] Failed to verify tabs permission", error);
    return false;
  }
}

async function getActiveTabId() {
  try {
    const hasTabsAccess = await ensureTabsPermission();

    if (!hasTabsAccess) {
      return null;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    return activeTab?.id ?? null;
  } catch (error) {
    console.error("[Popup] Failed to query active tab", error);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const testButton = document.getElementById("test-button");

  if (!testButton) {
    logStatus("Test button not found in the DOM");
    return;
  }

  testButton.addEventListener("click", async () => {
    logStatus("Test button clicked");

    const activeTabId = await getActiveTabId();

    if (!activeTabId) {
      logStatus("Unable to identify the active tab");
      return;
    }

    chrome.tabs.sendMessage(
      activeTabId,
      {
        action: "fillForm",
        data: vehicleData
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("[Popup] Error sending message", chrome.runtime.lastError);
          return;
        }

        logStatus("Auto-fill request sent to content script", vehicleData);
      }
    );
  });
});
