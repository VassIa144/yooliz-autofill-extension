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

document.addEventListener("DOMContentLoaded", () => {
  const testButton = document.getElementById("test-button");

  if (!testButton) {
    logStatus("Test button not found in the DOM");
    return;
  }

  testButton.addEventListener("click", async () => {
    logStatus("Test button clicked");

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!activeTab?.id) {
        logStatus("Unable to identify the active tab");
        return;
      }

      chrome.tabs.sendMessage(
        activeTab.id,
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
    } catch (error) {
      console.error("[Popup] Failed to query active tab", error);
    }
  });
});
