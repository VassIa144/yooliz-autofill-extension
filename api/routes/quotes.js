const express = require('express');
const router = express.Router();
const {
  getQuotes,
  deleteQuotesFromSheet,
  removeQuotesFromCache,
} = require('../services/googleSheets');

/**
 * GET /api/quotes
 * Récupère la liste des devis depuis Google Sheets
 * Query params:
 *   - forceRefresh: boolean (optionnel) - Force le rafraîchissement du cache
 */
router.get('/', async (req, res, next) => {
  try {
    const forceRefresh = req.query.forceRefresh === 'true';

    const result = await getQuotes({ forceRefresh });

    res.json({
      success: true,
      quotes: result.quotes,
      fromCache: result.fromCache,
      count: result.quotes.length,
    });
  } catch (error) {
    console.error('[API] Erreur lors de la récupération des devis:', error);
    next(error);
  }
});

/**
 * POST /api/quotes/delete
 * Supprime des devis utilisés depuis Google Sheets
 * Body: { quotes: Array<{ id, label, rowNumber }> }
 */
router.post('/delete', async (req, res, next) => {
  try {
    const { quotes } = req.body;

    if (!Array.isArray(quotes)) {
      return res.status(400).json({
        success: false,
        error: 'Le champ "quotes" doit être un tableau',
      });
    }

    if (quotes.length === 0) {
      return res.json({
        success: true,
        removed: 0,
        message: 'Aucun devis à supprimer',
      });
    }

    // Supprimer du Google Sheet
    const result = await deleteQuotesFromSheet(quotes);

    // Supprimer du cache local
    removeQuotesFromCache(quotes);

    res.json({
      success: true,
      removed: result.removed,
      message: `${result.removed} devis supprimé(s) avec succès`,
    });
  } catch (error) {
    console.error('[API] Erreur lors de la suppression des devis:', error);
    next(error);
  }
});

module.exports = router;
