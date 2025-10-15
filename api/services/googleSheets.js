const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const QUOTES_RANGE = process.env.QUOTES_RANGE || 'Sheet1!A1:Z';
const CACHE_DURATION_MS = parseInt(process.env.CACHE_DURATION_MS || '300000', 10);
const SHEET_METADATA_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 heure

// Cache en mémoire
let cachedQuotes = [];
let lastFetchTimestamp = 0;
let cachedSheetId = null;
let sheetIdFetchedAt = 0;

// Configuration des aliases pour les en-têtes
const HEADER_ALIASES = {
  id: ['id', 'numero', 'numero_devis', 'num_devis', 'devis', 'id_devis'],
  label: ['libelle', 'nom', 'description', 'titre', 'intitule'],
  make: ['marque', 'make'],
  model: ['modele', 'model'],
  engine: ['motorisation', 'engine', 'finition'],
  fuelType: ['carburant', 'fuel', 'fueltype', 'energie'],
  usageType: ['usage', 'usage_type', 'type_usage'],
  vehicleType: ['type_vehicule', 'vehicule_type', 'typevehicule', 'type'],
  vehicleCategory: [
    'categorie',
    'categorie_vehicule',
    'vehicle_category',
    'categorie_vehicule',
    'categorievehicule',
  ],
};

/**
 * Normalise les en-têtes de colonnes
 */
const normalizeHeader = (header = '') =>
  header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/**
 * Trouve une valeur dans l'objet ligne en utilisant les aliases
 */
const findValueByAliases = (rowObject, aliases = []) => {
  for (const alias of aliases) {
    if (rowObject[alias]) {
      return rowObject[alias];
    }
  }
  return '';
};

/**
 * Transforme une ligne de données en objet devis
 */
const transformRowToQuote = (rowObject, index) => {
  return {
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
    rowNumber: index + 2, // +2 car index 0 = ligne 2 (après l'en-tête)
  };
};

/**
 * Construit la liste des devis depuis les données de la feuille
 */
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
      rowObject[headerKey] = row[cellIndex] ?? '';
    });

    return transformRowToQuote(rowObject, rowIndex);
  });
};

/**
 * Crée un client Google Sheets authentifié
 */
const getAuthenticatedSheetsClient = () => {
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

  if (API_KEY) {
    // Utilisation de l'API Key pour les lectures seules
    return google.sheets({ version: 'v4', auth: API_KEY });
  }

  // Utilisation d'un Service Account ou OAuth2 pour les opérations d'écriture
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
};

/**
 * Crée un client OAuth2 pour les opérations nécessitant OAuth
 */
const getOAuth2Client = () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Charger le token depuis un fichier si disponible
  const tokenPath = path.join(__dirname, '..', 'token.json');
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oauth2Client.setCredentials(token);
  }

  return oauth2Client;
};

/**
 * Récupère les devis depuis Google Sheets
 */
const fetchQuotesFromSheet = async () => {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID non configuré');
  }

  const sheets = getAuthenticatedSheetsClient();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: QUOTES_RANGE,
    });

    return buildQuotesFromSheetData(response.data.values);
  } catch (error) {
    console.error('[Google Sheets] Erreur lors de la récupération des données:', error.message);
    throw new Error(`Erreur API Google Sheets: ${error.message}`);
  }
};

/**
 * Récupère les devis (avec cache)
 */
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

/**
 * Extrait le titre de l'onglet depuis le range
 */
const getSheetTitleFromRange = () => {
  if (!QUOTES_RANGE) {
    return null;
  }

  const [rawSheetTitle] = QUOTES_RANGE.split('!');

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

/**
 * Récupère l'ID de l'onglet Google Sheets
 */
const fetchSheetId = async () => {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID non configuré');
  }

  const sheetTitle = getSheetTitleFromRange();

  if (!sheetTitle) {
    throw new Error("Impossible de déterminer l'onglet cible à partir de QUOTES_RANGE");
  }

  const sheets = getAuthenticatedSheetsClient();

  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties(sheetId,title)',
    });

    const allSheets = Array.isArray(response.data.sheets) ? response.data.sheets : [];

    const matchingSheet = allSheets.find((sheet) => {
      const title = sheet?.properties?.title;
      return typeof title === 'string' && title === sheetTitle;
    });

    const sheetId = matchingSheet?.properties?.sheetId;

    if (typeof sheetId !== 'number') {
      throw new Error(`Aucun onglet nommé « ${sheetTitle} » trouvé`);
    }

    cachedSheetId = sheetId;
    sheetIdFetchedAt = Date.now();

    return sheetId;
  } catch (error) {
    console.error('[Google Sheets] Erreur lors de la récupération du Sheet ID:', error.message);
    throw new Error(`Erreur lors de la récupération des métadonnées: ${error.message}`);
  }
};

/**
 * Récupère l'ID de l'onglet (avec cache)
 */
const getSheetId = async () => {
  const now = Date.now();

  if (
    typeof cachedSheetId === 'number' &&
    now - sheetIdFetchedAt < SHEET_METADATA_CACHE_DURATION_MS
  ) {
    return cachedSheetId;
  }

  return fetchSheetId();
};

/**
 * Supprime des lignes du Google Sheet
 */
const deleteRowsFromSheet = async (rowNumbers = []) => {
  const normalizedRows = rowNumbers
    .map((rowNumber) => Number(rowNumber))
    .filter((rowNumber) => Number.isInteger(rowNumber) && rowNumber > 1);

  const uniqueRows = Array.from(new Set(normalizedRows));

  if (uniqueRows.length === 0) {
    return { success: true, removed: 0 };
  }

  const sheetId = await getSheetId();
  const oauth2Client = getOAuth2Client();

  if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
    throw new Error('OAuth2 non configuré. Veuillez vous authentifier.');
  }

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const requests = uniqueRows
    .sort((a, b) => b - a) // Trier en ordre décroissant pour éviter les décalages
    .map((rowNumber) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    }));

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });

    return { success: true, removed: uniqueRows.length };
  } catch (error) {
    console.error('[Google Sheets] Erreur lors de la suppression des lignes:', error.message);
    throw new Error(`Erreur lors de la suppression: ${error.message}`);
  }
};

/**
 * Supprime des devis (lignes) du Google Sheet
 */
const deleteQuotesFromSheet = async (quotes = []) => {
  if (!Array.isArray(quotes) || quotes.length === 0) {
    return { success: true, removed: 0 };
  }

  const rowNumbers = quotes.map((quote) => quote?.rowNumber).filter(Boolean);

  if (rowNumbers.length === 0) {
    return { success: true, removed: 0 };
  }

  return deleteRowsFromSheet(rowNumbers);
};

/**
 * Supprime des devis du cache local
 */
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

    if (typeof quote?.rowNumber === 'number') {
      rowNumbers.add(quote.rowNumber);
    }
  });

  cachedQuotes = cachedQuotes.filter((quote) => {
    const matchesId = quote?.id && ids.has(String(quote.id));
    const matchesRow = typeof quote?.rowNumber === 'number' && rowNumbers.has(quote.rowNumber);
    return !matchesId && !matchesRow;
  });

  lastFetchTimestamp = 0; // Invalider le cache
};

module.exports = {
  getQuotes,
  deleteQuotesFromSheet,
  removeQuotesFromCache,
  getOAuth2Client,
};
