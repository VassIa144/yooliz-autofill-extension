const GOOGLE_SHEETS_API_KEY = "AIzaSyAfy-Lq0veFj7v2oUZXSZbdOSn8pdOOTmY";
const SPREADSHEET_ID = "1wGfG-tNnxo17dnaQItdvAmrmcYm-2ofRcKmFQ2CI198";
const QUOTES_RANGE = "Sheet1!A1:Z";
const CACHE_DURATION_MS = 5 * 60 * 1000;
const SHEET_METADATA_CACHE_DURATION_MS = 60 * 60 * 1000;
const SHEETS_WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const OAUTH_CLIENT_ID_PLACEHOLDER =
  "REPLACE_WITH_OAUTH_CLIENT_ID.apps.googleusercontent.com";

const getConfiguredOAuthClientId = () => {
  try {
    const manifest = chrome?.runtime?.getManifest
      ? chrome.runtime.getManifest()
      : null;
    const manifestClientId = manifest?.oauth2?.client_id;
    return typeof manifestClientId === "string" ? manifestClientId.trim() : "";
  } catch (error) {
    console.warn("[Background] Impossible de lire la configuration OAuth", error);
    return "";
  }
};

const normalizeOAuthErrorMessage = (message) => {
  if (!message) {
    return "";
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("invalid_client") || normalized.includes("bad client id")) {
    return (
      "Client OAuth Google invalide. Vérifiez que manifest.json contient " +
      "l'identifiant OAuth 2.0 exact fourni par Google Cloud."
    );
  }

  if (normalized.includes("redirect_uri_mismatch")) {
    const extensionId = chrome?.runtime?.id;
    const redirectUri = extensionId
      ? `https://${extensionId}.chromiumapp.org/`
      : "https://<extension-id>.chromiumapp.org/";

    return (
      "Configuration OAuth incomplète. Ajoutez l'URL de redirection " +
      `${redirectUri} au client OAuth Google.`
    );
  }

  if (normalized.includes("access_denied")) {
    return "Autorisation Google Sheets annulée ou refusée par l'utilisateur.";
  }

  return message;
};

const ensureSheetsOAuthConfigured = () => {
  if (!chrome?.identity?.getAuthToken) {
    throw new Error(
      `La suppression des devis nécessite la permission Chrome Identity et un client OAuth valide (${SHEETS_WRITE_SCOPE}). Vérifiez la configuration dans manifest.json.`
    );
  }

  const clientId = getConfiguredOAuthClientId();

  if (!clientId) {
    throw new Error(
      "Client OAuth Google manquant. Déclarez un identifiant OAuth 2.0 valide dans manifest.json."
    );
  }

  if (clientId === OAUTH_CLIENT_ID_PLACEHOLDER) {
    throw new Error(
      "Client OAuth Google non configuré. Remplacez l'identifiant par défaut dans manifest.json par celui fourni par Google Cloud."
    );
  }

  return clientId;
};

const getIdentityAccessToken = ({ interactive = false } = {}) =>
  new Promise((resolve, reject) => {
    try {
      ensureSheetsOAuthConfigured();
    } catch (configError) {
      reject(configError);
      return;
    }

    if (!chrome?.identity?.getAuthToken) {
      reject(
        new Error(
          "Chrome Identity n'est pas disponible. Assurez-vous que l'extension dispose de la permission 'identity'."
        )
      );
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        const message = normalizeOAuthErrorMessage(
          chrome.runtime.lastError.message || "Échec de l'authentification Google."
        );
        reject(new Error(message));
        return;
      }

      if (!token) {
        reject(new Error("Authentification Google Sheets requise."));
        return;
      }

      resolve({ accessToken: token, tokenType: "Bearer" });
    });
  });

const removeCachedIdentityToken = (token) =>
  new Promise((resolve) => {
    if (!token || !chrome?.identity?.removeCachedAuthToken) {
      resolve();
      return;
    }

    chrome.identity.removeCachedAuthToken({ token }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Background] Impossible d'invalider le jeton OAuth",
          chrome.runtime.lastError
        );
      }

      resolve();
    });
  });

const shouldRetryInteractively = (error) => {
  if (!error?.message) {
    return false;
  }

  const normalized = error.message.toLowerCase();

  return (
    normalized.includes("interaction") ||
    normalized.includes("consent") ||
    normalized.includes("login") ||
    normalized.includes("authentification") ||
    normalized.includes("authorization")
  );
};

const performAuthorizedSheetsRequest = async ({
  url,
  method = "GET",
  body,
  headers = {},
}) => {
  const attempt = async (interactive) => {
    let tokens;

    try {
      tokens = await getIdentityAccessToken({ interactive });
    } catch (tokenError) {
      if (!interactive && shouldRetryInteractively(tokenError)) {
        return attempt(true);
      }

      throw tokenError;
    }

    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization: `${tokens.tokenType || "Bearer"} ${tokens.accessToken}`,
      },
      body,
    });

    if (response.status === 401) {
      await removeCachedIdentityToken(tokens.accessToken);

      if (!interactive) {
        return attempt(true);
      }

      const errorBody = await response.text().catch(() => "");
      let details = "";

      if (errorBody) {
        try {
          const parsed = JSON.parse(errorBody);
          const message = parsed?.error?.message;
          details = message ? ` ${message}` : ` Réponse: ${errorBody}`;
        } catch (parseError) {
          details = ` Réponse: ${errorBody}`;
        }
      }

      throw new Error(
        `Authentification Google Sheets requise (${response.status}).${details}`
      );
    }

    return response;
  };

  return attempt(false);
};

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
let cachedSheetId = null;
let sheetIdFetchedAt = 0;

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

const getQuotes = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  const isCacheValid = now - lastFetchTimestamp < CACHE_DURATION_MS;

  if (!forceRefresh && isCacheValid && cachedQuotes.length > 0) {
    return { quotes: cachedQuotes, fromCache: true };
  }

  const quotes = await fetchQuotesFromSheet();

  cachedQuotes = quotes;
  lastFetchTimestamp = now;

  return { quotes, fromCache: false };
};

const getSheetTitleFromRange = () => {
  if (!QUOTES_RANGE) {
    return null;
  }

  const [rawSheetTitle] = QUOTES_RANGE.split("!");

  if (!rawSheetTitle) {
    return null;
  }

  const trimmed = rawSheetTitle.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const fetchSheetId = async () => {
  if (!GOOGLE_SHEETS_API_KEY || !SPREADSHEET_ID) {
    throw new Error("La configuration Google Sheets est incomplète.");
  }

  const sheetTitle = getSheetTitleFromRange();

  if (!sheetTitle) {
    throw new Error(
      "Impossible de déterminer l'onglet cible à partir de QUOTES_RANGE."
    );
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties(sheetId,title)&key=${GOOGLE_SHEETS_API_KEY}`;

  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Erreur lors de la récupération des métadonnées de la feuille (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  const sheets = Array.isArray(data?.sheets) ? data.sheets : [];

  const matchingSheet = sheets.find((sheet) => {
    const title = sheet?.properties?.title;
    return typeof title === "string" && title === sheetTitle;
  });

  const sheetId = matchingSheet?.properties?.sheetId;

  if (typeof sheetId !== "number") {
    throw new Error(
      `Aucun onglet nommé « ${sheetTitle} » n'a été trouvé dans la feuille Google Sheets.`
    );
  }

  cachedSheetId = sheetId;
  sheetIdFetchedAt = Date.now();

  return sheetId;
};

const getSheetId = async () => {
  const now = Date.now();

  if (
    typeof cachedSheetId === "number" &&
    now - sheetIdFetchedAt < SHEET_METADATA_CACHE_DURATION_MS
  ) {
    return cachedSheetId;
  }

  return fetchSheetId();
};

const deleteRowsFromSheet = async (rowNumbers = []) => {
  const normalizedRows = rowNumbers
    .map((rowNumber) => Number(rowNumber))
    .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 1);

  const uniqueRows = Array.from(new Set(normalizedRows));

  if (uniqueRows.length === 0) {
    return { success: true, removed: 0 };
  }

  const sheetId = await getSheetId();

  const requests = uniqueRows
    .sort((a, b) => b - a)
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    }));

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`;

  const response = await performAuthorizedSheetsRequest({
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Erreur lors de la suppression des lignes Google Sheets (${response.status}): ${errorBody}`
    );
  }

  return { success: true, removed: uniqueRows.length };
};

const deleteQuotesFromSheet = async (quotes = []) => {
  if (!Array.isArray(quotes) || quotes.length === 0) {
    return { success: true, removed: 0 };
  }

  const rowNumbers = quotes.map((quote) => quote?.rowNumber);

  if (rowNumbers.length === 0) {
    return { success: true, removed: 0 };
  }

  return deleteRowsFromSheet(rowNumbers);
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
    const forceRefresh = Boolean(message?.forceRefresh);

    getQuotes({ forceRefresh })
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

    deleteQuotesFromSheet(quotesToRemove)
      .then((result) => {
        removeQuotesFromCache(quotesToRemove);
        sendResponse({ success: true, removed: result.removed });
      })
      .catch((error) => {
        console.error(
          "[Background] Erreur lors de la suppression des lignes Google Sheets",
          error
        );
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  return undefined;
});
