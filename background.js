const GOOGLE_SHEETS_API_KEY = "AIzaSyAfy-Lq0veFj7v2oUZXSZbdOSn8pdOOTmY";
const SPREADSHEET_ID = "1wGfG-tNnxo17dnaQItdvAmrmcYm-2ofRcKmFQ2CI198";
const QUOTES_RANGE = "Sheet1!A1:Z";
const CACHE_DURATION_MS = 5 * 60 * 1000;
const N8N_DELETE_WORKFLOW_URL = "https://n8n.example.com/webhook/delete-used-quotes";

let registeredYoolizTabId = null;

const storageSession = chrome.storage?.session;
const STORAGE_KEYS = {
  registeredTabId: "registeredYoolizTabId",
};

const persistRegisteredTabId = (tabId) =>
  new Promise((resolve) => {
    if (!storageSession) {
      registeredYoolizTabId = tabId;
      resolve();
      return;
    }

    if (typeof tabId === "number") {
      storageSession.set({ [STORAGE_KEYS.registeredTabId]: tabId }, () => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[Background] Échec de la persistance de l'onglet Yooliz",
            chrome.runtime.lastError
          );
        }

        registeredYoolizTabId = tabId;
        resolve();
      });
      return;
    }

    storageSession.remove(STORAGE_KEYS.registeredTabId, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Background] Échec de la suppression de l'onglet stocké",
          chrome.runtime.lastError
        );
      }

      registeredYoolizTabId = null;
      resolve();
    });
  });

const restoreRegisteredTabId = () => {
  if (!storageSession) {
    return;
  }

  storageSession.get(STORAGE_KEYS.registeredTabId, (result) => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[Background] Impossible de restaurer l'onglet Yooliz",
        chrome.runtime.lastError
      );
      return;
    }

    const storedTabId = result?.[STORAGE_KEYS.registeredTabId];

    if (typeof storedTabId === "number") {
      registeredYoolizTabId = storedTabId;
      console.log("[Background] Onglet Yooliz restauré", storedTabId);
    }
  });
};

restoreRegisteredTabId();

let cachedQuotes = [];
let lastFetchTimestamp = 0;

const HEADER_ALIASES = {
  id: ["id", "numero", "numero_devis", "num_devis", "devis", "id_devis"],
  label: ["libelle", "nom", "description", "titre", "intitule"],
  make: ["marque", "make"],
  model: ["modele", "model"],
  engine: ["motorisation", "engine", "finition"],
  fuelType: ["carburant", "fuel", "fueltype", "energie"],
  usageType: ["usage", "usage_type", "type_usage"],
  vehicleType: ["type_vehicule", "vehicule_type", "typevehicule", "type"],
  vehicleCategory: [
    "categorie",
    "categorie_vehicule",
    "vehicle_category",
    "categorie_vehicule",
    "categorievehicule",
  ],
};

const normalizeHeader = (header = "") =>
  header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const findValueByAliases = (rowObject, aliases = []) => {
  for (const alias of aliases) {
    if (rowObject[alias]) {
      return rowObject[alias];
    }
  }

  return "";
};

const transformRowToQuote = (rowObject, index) => {
  const quote = {
    id: findValueByAliases(rowObject, HEADER_ALIASES.id) || `devis-${index + 1}`,
    label:
      findValueByAliases(rowObject, HEADER_ALIASES.label) ||
      findValueByAliases(rowObject, HEADER_ALIASES.id) ||
      `Devis ${index + 1}`,
    make: findValueByAliases(rowObject, HEADER_ALIASES.make),
    model: findValueByAliases(rowObject, HEADER_ALIASES.model),
    engine: findValueByAliases(rowObject, HEADER_ALIASES.engine),
    fuelType: findValueByAliases(rowObject, HEADER_ALIASES.fuelType),
    usageType: findValueByAliases(rowObject, HEADER_ALIASES.usageType),
    vehicleType: findValueByAliases(rowObject, HEADER_ALIASES.vehicleType),
    vehicleCategory: findValueByAliases(rowObject, HEADER_ALIASES.vehicleCategory),
    raw: rowObject,
    rowNumber: index + 2,
  };

  return quote;
};

const buildQuotesFromSheetData = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = values;
  const normalizedHeaders = headerRow.map((header) => normalizeHeader(header));

  return dataRows.map((row, rowIndex) => {
    const rowObject = {};

    normalizedHeaders.forEach((headerKey, cellIndex) => {
      if (!headerKey) {
        return;
      }

      rowObject[headerKey] = row[cellIndex] ?? "";
    });

    return transformRowToQuote(rowObject, rowIndex);
  });
};

const fetchQuotesFromSheet = async () => {
  if (!GOOGLE_SHEETS_API_KEY || !SPREADSHEET_ID) {
    throw new Error("La configuration Google Sheets est incomplète.");
  }

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    QUOTES_RANGE
  )}`;

  const url = `${baseUrl}?key=${GOOGLE_SHEETS_API_KEY}`;

  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Erreur API Google Sheets (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return buildQuotesFromSheetData(data.values);
};

const getQuotes = async () => {
  const now = Date.now();
  const isCacheValid = now - lastFetchTimestamp < CACHE_DURATION_MS;

  if (isCacheValid && cachedQuotes.length > 0) {
    return { quotes: cachedQuotes, fromCache: true };
  }

  const quotes = await fetchQuotesFromSheet();

  cachedQuotes = quotes;
  lastFetchTimestamp = now;

  return { quotes, fromCache: false };
};

const ensureDeleteWorkflowConfigured = () => {
  if (!N8N_DELETE_WORKFLOW_URL) {
    throw new Error(
      "Le webhook n8n de suppression n'est pas configuré. Mettez à jour N8N_DELETE_WORKFLOW_URL dans background.js."
    );
  }
};

const triggerDeleteWorkflow = async (quotes = []) => {
  ensureDeleteWorkflowConfigured();

  if (!Array.isArray(quotes) || quotes.length === 0) {
    return { success: true, removed: 0 };
  }

  const response = await fetch(N8N_DELETE_WORKFLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ quotes }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Erreur lors de l'appel du workflow n8n (${response.status}): ${errorBody}`
    );
  }

  return { success: true, removed: quotes.length };
};

const removeQuotesFromCache = (quotes = []) => {
  if (!Array.isArray(quotes) || quotes.length === 0) {
    return;
  }

  const ids = new Set();
  const rowNumbers = new Set();

  quotes.forEach((quote) => {
    if (quote?.id) {
      ids.add(String(quote.id));
    }

    if (typeof quote?.rowNumber === "number") {
      rowNumbers.add(quote.rowNumber);
    }
  });

  cachedQuotes = cachedQuotes.filter((quote) => {
    const matchesId = quote?.id && ids.has(String(quote.id));
    const matchesRow = typeof quote?.rowNumber === "number" && rowNumbers.has(quote.rowNumber);
    return !matchesId && !matchesRow;
  });

  lastFetchTimestamp = 0;
};

const sendQuoteToContentScript = (payload) =>
  new Promise((resolve, reject) => {
    if (typeof registeredYoolizTabId !== "number") {
      reject(new Error("Aucun onglet Yooliz enregistré."));
      return;
    }

    try {
      chrome.tabs.sendMessage(
        registeredYoolizTabId,
        {
          action: "fillForm",
          data: payload,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            const lastErrorMessage = chrome.runtime.lastError.message || "Échec de l'envoi au contenu.";

            if (lastErrorMessage.includes("No tab with id")) {
              persistRegisteredTabId(null);
            }

            reject(new Error(lastErrorMessage));
            return;
          }

          if (response?.success === false) {
            reject(new Error(response?.error || "Le contenu a signalé un échec."));
            return;
          }

          resolve(response);
        }
      );
    } catch (error) {
      reject(error);
    }
  });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "registerContentTab") {
    const tabId = sender?.tab?.id;

    if (typeof tabId === "number") {
      persistRegisteredTabId(tabId).then(() => {
        console.log("[Background] Onglet Yooliz enregistré", tabId);
        sendResponse({ success: true });
      });
      return true;
    }

    sendResponse({ success: false, error: "Impossible d'identifier l'onglet du contenu." });
    return false;
  }

  if (message?.action === "fillQuote") {
    console.log("[Background] Requête de remplissage reçue", message.quoteId || "(sans identifiant)");
    if (!message?.data || typeof message.data !== "object") {
      sendResponse({ success: false, error: "Données de devis invalides." });
      return false;
    }

    if (typeof registeredYoolizTabId !== "number") {
      persistRegisteredTabId(null);
      sendResponse({ success: false, error: "Aucun onglet Yooliz prêt à recevoir les données." });
      return false;
    }

    sendQuoteToContentScript(message.data)
      .then((response) => {
        sendResponse({ success: true, response });
      })
      .catch((error) => {
        console.error("[Background] Erreur lors de l'envoi du devis au contenu", error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  if (message?.action === "getQuotes") {
    getQuotes()
      .then((result) => {
        sendResponse({ success: true, quotes: result.quotes, fromCache: result.fromCache });
      })
      .catch((error) => {
        console.error("[Background] Erreur lors de la récupération des devis", error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  if (message?.action === "removeUsedQuotes") {
    const quotesToRemove = Array.isArray(message?.quotes) ? message.quotes : [];

    triggerDeleteWorkflow(quotesToRemove)
      .then((result) => {
        removeQuotesFromCache(quotesToRemove);
        sendResponse({ success: true, removed: quotesToRemove.length, workflow: result });
      })
      .catch((error) => {
        console.error(
          "[Background] Erreur lors de la notification du workflow n8n pour suppression",
          error
        );
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  return undefined;
});
