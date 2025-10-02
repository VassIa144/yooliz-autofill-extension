// Remplacez ces constantes par l'identifiant et l'API key fournis par Yooliz.
const GOOGLE_SHEETS_API_KEY = "REPLACE_WITH_GOOGLE_SHEETS_API_KEY";
const SPREADSHEET_ID = "REPLACE_WITH_SPREADSHEET_ID";
const QUOTES_RANGE = "Devis!A1:Z";
const CACHE_DURATION_MS = 5 * 60 * 1000;

let registeredYoolizTabId = null;

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
    raw: rowObject,
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

const sendQuoteToContentScript = (payload) =>
  new Promise((resolve, reject) => {
    if (!registeredYoolizTabId) {
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
              registeredYoolizTabId = null;
            }

            reject(new Error(lastErrorMessage));
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
      registeredYoolizTabId = tabId;
      console.log("[Background] Onglet Yooliz enregistré", tabId);
      sendResponse({ success: true });
      return false;
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

  return undefined;
});
