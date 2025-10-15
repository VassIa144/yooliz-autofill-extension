# Yooliz Auto-Fill Extension

Extension Chrome pour remplir automatiquement les formulaires de devis Yooliz à partir d'un Google Sheets.

## 🎯 Deux approches disponibles

### Approche 1 : Accès direct (Version actuelle)
L'extension accède directement à Google Sheets API.

**✅ Avantages :**
- Configuration simple
- Pas de serveur à gérer
- Tout fonctionne côté client

**❌ Inconvénients :**
- Credentials stockés dans l'extension
- Difficile à maintenir
- Quotas API partagés

**Fichiers :**
- `manifest.json` - Configuration actuelle
- `background.js` - Service worker avec accès direct

### Approche 2 : API Backend (Recommandé) 🚀
L'extension communique avec un serveur backend qui gère Google Sheets.

**✅ Avantages :**
- Credentials sécurisés côté serveur
- Logique métier centralisée
- Meilleur contrôle des accès
- Mise à jour sans republier l'extension
- Cache côté serveur performant

**❌ Inconvénients :**
- Nécessite un serveur (peut être gratuit)
- Configuration légèrement plus complexe

**Fichiers :**
- `manifest-api.json` - Configuration pour l'API
- `background-api.js` - Service worker simplifié
- `api/` - Serveur backend Node.js/Express

## 🚀 Démarrage rapide

### Pour l'approche API (recommandé)

Suivez le guide de démarrage rapide : **[QUICKSTART.md](QUICKSTART.md)**

En résumé :
```bash
# 1. Installer les dépendances du serveur
cd api && npm install

# 2. Configurer (le fichier .env est déjà pré-rempli)
# Vérifiez api/.env et ajustez si nécessaire

# 3. Démarrer le serveur
npm start

# 4. Activer la version API de l'extension
cd ..
cp manifest-api.json manifest.json

# 5. Charger l'extension dans Chrome
# chrome://extensions/ > Mode développeur > Charger l'extension non empaquetée
```

### Pour l'approche directe (version actuelle)

L'extension est déjà configurée et prête à l'emploi :
```bash
# Charger l'extension dans Chrome
# chrome://extensions/ > Mode développeur > Charger l'extension non empaquetée
```

## 📁 Structure du projet

```
yooliz-autofill-extension/
├── manifest.json              # Manifest actuel (accès direct)
├── manifest-api.json          # Manifest pour l'API
├── background.js              # Service worker actuel (accès direct)
├── background-api.js          # Service worker pour l'API
├── content.js                 # Script d'injection dans les pages Yooliz
├── popup.html                 # Interface popup
├── popup.js                   # Logique du popup
├── styles.css                 # Styles de l'extension
│
├── api/                       # Serveur backend API
│   ├── server.js             # Serveur Express
│   ├── routes/
│   │   └── quotes.js         # Routes pour les devis
│   ├── services/
│   │   └── googleSheets.js   # Service Google Sheets
│   ├── package.json
│   ├── .env                  # Configuration (pré-rempli)
│   └── README.md             # Documentation API
│
├── QUICKSTART.md             # Guide de démarrage rapide
├── MIGRATION_API.md          # Guide de migration vers l'API
├── DEPLOYMENT.md             # Guide de déploiement en production
└── README.md                 # Ce fichier
```

## 📖 Documentation

### Guides principaux
- **[QUICKSTART.md](QUICKSTART.md)** - Démarrage rapide (5 minutes)
- **[MIGRATION_API.md](MIGRATION_API.md)** - Migration de l'approche directe vers l'API
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Déploiement en production

### Documentation technique
- **[api/README.md](api/README.md)** - Documentation du serveur API

## 🔧 Configuration Google Sheets

### Format attendu de la feuille

La première ligne doit contenir les en-têtes (peu importe l'ordre) :

| ID | Libellé | Marque | Modèle | Motorisation | Carburant | Usage | Type de véhicule | Catégorie |
|----|---------|--------|--------|--------------|-----------|-------|------------------|-----------|
| D001 | Devis 1 | Renault | Clio | 1.5 dCi | Diesel | Particulier | VP | CAT1 |
| D002 | Devis 2 | Peugeot | 208 | 1.2 PureTech | Essence | Professionnel | VP | CAT2 |

**Colonnes reconnues (avec aliases) :**
- **ID** : id, numero, numero_devis, num_devis, devis, id_devis
- **Libellé** : libelle, nom, description, titre, intitule
- **Marque** : marque, make
- **Modèle** : modele, model
- **Motorisation** : motorisation, engine, finition
- **Carburant** : carburant, fuel, fueltype, energie
- **Usage** : usage, usage_type, type_usage
- **Type de véhicule** : type_vehicule, vehicule_type, typevehicule, type
- **Catégorie** : categorie, categorie_vehicule, vehicle_category

## 🔑 Obtenir une clé API Google Sheets

1. Accédez à [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet ou sélectionnez-en un existant
3. Activez l'API Google Sheets :
   - Menu > APIs & Services > Library
   - Recherchez "Google Sheets API"
   - Cliquez sur "Enable"
4. Créez une clé API :
   - Menu > APIs & Services > Credentials
   - Create Credentials > API Key
   - Copiez la clé générée

## 📊 Endpoints API (approche backend)

### GET /api/quotes
Récupère la liste des devis.

**Paramètres :**
- `forceRefresh` (optionnel) : Force le rechargement du cache

**Réponse :**
```json
{
  "success": true,
  "quotes": [...],
  "fromCache": false,
  "count": 10
}
```

### POST /api/quotes/delete
Supprime des devis utilisés.

**Body :**
```json
{
  "quotes": [
    { "id": "D001", "label": "Devis 1", "rowNumber": 2 }
  ]
}
```

**Réponse :**
```json
{
  "success": true,
  "removed": 1,
  "message": "1 devis supprimé(s) avec succès"
}
```

## 🛠️ Développement

### Prérequis
- Node.js 18+
- Chrome ou Chromium
- Clé API Google Sheets

### Installation

```bash
# Cloner le repo
git clone https://github.com/votre-repo/yooliz-autofill-extension.git
cd yooliz-autofill-extension

# Installer les dépendances du serveur API
cd api
npm install

# Configurer les variables d'environnement
# Le fichier .env est déjà pré-rempli, ajustez si nécessaire
nano .env
```

### Lancement en développement

**Serveur API :**
```bash
cd api
npm run dev  # Avec rechargement automatique
```

**Extension Chrome :**
1. Ouvrez `chrome://extensions/`
2. Activez le "Mode développeur"
3. Cliquez sur "Charger l'extension non empaquetée"
4. Sélectionnez le dossier du projet

### Tests

```bash
# Tester l'état de santé du serveur
curl http://localhost:3000/health

# Tester la récupération des devis
curl http://localhost:3000/api/quotes

# Tester avec forceRefresh
curl http://localhost:3000/api/quotes?forceRefresh=true
```

### Logs

**Serveur :**
```bash
# Les logs apparaissent dans le terminal
```

**Extension :**
- Background : `chrome://extensions/` > Extension > "Service Worker" > Console
- Content Script : F12 sur la page Yooliz > Console
- Popup : Clic droit sur l'icône > Inspecter > Console

## 🚢 Déploiement en production

Consultez [DEPLOYMENT.md](DEPLOYMENT.md) pour des instructions détaillées.

**Options de déploiement :**
- **Heroku** (gratuit + facile) ⭐
- **Railway** (gratuit + GitHub intégré)
- **Render** (gratuit + SSL)
- **VPS** (DigitalOcean, AWS, etc.)
- **Docker** (conteneurisé)

## 🔒 Sécurité

### Approche directe
- ⚠️ Clé API stockée dans l'extension (visible dans le code)
- ⚠️ OAuth client ID exposé dans manifest.json

### Approche API
- ✅ Credentials uniquement sur le serveur
- ✅ CORS configuré pour limiter les accès
- ✅ Possibilité d'ajouter rate limiting
- ✅ Logs centralisés des accès

## 📈 Performances

### Cache
- **Extension** : 5 minutes (configurable)
- **Serveur API** : 5 minutes (configurable)
- **Google Sheets API** : Pas de cache

### Quotas Google Sheets API
- Lecture : 500 requêtes/100 secondes/utilisateur
- Écriture : 100 requêtes/100 secondes/utilisateur

Avec le cache activé, vous restez largement dans les quotas.

## 🐛 Dépannage

### Le serveur ne démarre pas
```bash
# Vérifiez Node.js
node --version  # Devrait être >= 18

# Réinstallez les dépendances
cd api && rm -rf node_modules && npm install
```

### L'extension ne charge pas les devis
1. Vérifiez que le serveur est démarré
2. Vérifiez l'URL dans `background-api.js` (ligne 2)
3. Ouvrez la console du popup (F12)
4. Regardez les erreurs

### Erreur CORS
- En développement, toutes les extensions Chrome sont autorisées
- En production, configurez `ALLOWED_ORIGIN` dans `.env`

### Les devis ne se chargent pas depuis Google Sheets
```bash
# Testez directement l'API Google Sheets
curl "https://sheets.googleapis.com/v4/spreadsheets/SPREADSHEET_ID/values/Sheet1!A1:Z?key=API_KEY"
```

## 🤝 Contribution

Les contributions sont bienvenues !

1. Fork le projet
2. Créez une branche (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push sur la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📝 Licence

Ce projet est sous licence MIT.

## 📧 Contact

Pour toute question ou support, ouvrez une issue sur GitHub.

## 🗺️ Roadmap

### Version actuelle (2.0)
- ✅ Approche API backend
- ✅ Service worker Manifest V3
- ✅ Cache optimisé
- ✅ Suppression de devis utilisés
- ✅ Documentation complète

### Prochaines fonctionnalités
- [ ] OAuth flow complet pour la suppression
- [ ] Interface d'administration web
- [ ] Support multi-utilisateurs
- [ ] Statistiques d'utilisation
- [ ] Tests automatisés
- [ ] CI/CD avec GitHub Actions

## 📚 Ressources

- [Documentation Google Sheets API](https://developers.google.com/sheets/api)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Express.js Documentation](https://expressjs.com/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
