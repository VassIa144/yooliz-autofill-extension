const vehicleData = {
  make: "Peugeot",
  model: "308",
  engine: "BlueHDi 130",
  fuelType: "Diesel",
  usageType: "Particulier"
};

function logStatus(message, data) {
  console.log(`[Popup] ${message}`, data ?? "");
}

async function getActiveTabId() {
  try {
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
