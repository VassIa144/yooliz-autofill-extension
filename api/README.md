# Yooliz API Server

Serveur backend pour l'extension Chrome Yooliz Auto-Fill. Ce serveur gère les interactions avec Google Sheets pour récupérer et supprimer les devis.

## Installation

```bash
cd api
npm install
```

## Configuration

1. Copiez le fichier `.env.example` en `.env` :
```bash
cp .env.example .env
```

2. Configurez les variables d'environnement dans `.env` :

### Pour la lecture des devis (API Key)
- `GOOGLE_SHEETS_API_KEY` : Clé API Google Sheets
- `SPREADSHEET_ID` : ID de la feuille Google Sheets
- `QUOTES_RANGE` : Plage de cellules (ex: `Sheet1!A1:Z`)

### Pour la suppression des devis (OAuth 2.0)
- `GOOGLE_CLIENT_ID` : Client ID OAuth 2.0
- `GOOGLE_CLIENT_SECRET` : Client Secret OAuth 2.0
- `GOOGLE_REDIRECT_URI` : URI de redirection (ex: `http://localhost:3000/oauth/callback`)

### Configuration du serveur
- `PORT` : Port du serveur (défaut: 3000)
- `CACHE_DURATION_MS` : Durée du cache en millisecondes (défaut: 300000 = 5 minutes)
- `ALLOWED_ORIGIN` : Origine autorisée pour CORS (ID de votre extension Chrome)

## Authentification OAuth

Pour utiliser la fonctionnalité de suppression de devis, vous devez configurer OAuth 2.0 :

1. Créez un projet dans Google Cloud Console
2. Activez l'API Google Sheets
3. Créez des identifiants OAuth 2.0
4. Ajoutez l'URI de redirection : `http://localhost:3000/oauth/callback`
5. Téléchargez les credentials et ajoutez-les à votre `.env`

## Démarrage

### Mode développement (avec rechargement automatique)
```bash
npm run dev
```

### Mode production
```bash
npm start
```

Le serveur démarre sur `http://localhost:3000` (ou le port configuré).

## Endpoints API

### GET /api/quotes
Récupère la liste des devis depuis Google Sheets.

**Query Parameters:**
- `forceRefresh` (optionnel) : Force le rafraîchissement du cache (valeur: `true`)

**Réponse:**
```json
{
  "success": true,
  "quotes": [...],
  "fromCache": false,
  "count": 10
}
```

### POST /api/quotes/delete
Supprime des devis utilisés depuis Google Sheets.

**Body:**
```json
{
  "quotes": [
    {
      "id": "devis-1",
      "label": "Devis 1",
      "rowNumber": 2
    }
  ]
}
```

**Réponse:**
```json
{
  "success": true,
  "removed": 1,
  "message": "1 devis supprimé(s) avec succès"
}
```

### GET /health
Vérifie l'état de santé du serveur.

**Réponse:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-07T12:00:00.000Z"
}
```

## Sécurité

- Le serveur utilise CORS pour limiter les origines autorisées
- Les extensions Chrome sont automatiquement autorisées en développement
- En production, configurez `ALLOWED_ORIGIN` avec l'ID exact de votre extension

## Structure du projet

```
api/
├── server.js              # Point d'entrée du serveur
├── routes/
│   └── quotes.js         # Routes pour les devis
├── services/
│   └── googleSheets.js   # Service Google Sheets
├── package.json          # Dépendances
├── .env.example          # Exemple de configuration
└── README.md             # Ce fichier
```

## Dépannage

### Erreur "SPREADSHEET_ID non configuré"
Vérifiez que la variable `SPREADSHEET_ID` est bien définie dans votre fichier `.env`.

### Erreur "OAuth2 non configuré"
La suppression de devis nécessite OAuth 2.0. Suivez les instructions d'authentification OAuth ci-dessus.

### Erreur CORS
Assurez-vous que l'ID de votre extension Chrome est correctement configuré dans `ALLOWED_ORIGIN`.
