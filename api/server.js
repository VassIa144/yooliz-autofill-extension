require('dotenv').config();
const express = require('express');
const cors = require('cors');
const quotesRouter = require('./routes/quotes');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origine (ex: Postman) en développement
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // Autoriser les extensions Chrome
    if (origin && origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // Autoriser l'origine configurée
    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    if (allowedOrigin && origin === allowedOrigin) {
      return callback(null, true);
    }

    callback(new Error('Non autorisé par CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/quotes', quotesRouter);

// Route de santé
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('[Erreur]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erreur interne du serveur',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur API Yooliz démarré sur le port ${PORT}`);
  console.log(`📊 Spreadsheet ID: ${process.env.SPREADSHEET_ID}`);
  console.log(`📄 Range: ${process.env.QUOTES_RANGE}`);
});
