# Yooliz Auto-Fill Extension

Cette extension Chrome permet de récupérer la liste des devis depuis Google Sheets et de pré-remplir le formulaire Yooliz.

## Configuration

1. Renseignez dans `background.js` les constantes suivantes avec les valeurs fournies par Yooliz :
   - `GOOGLE_SHEETS_API_KEY`
   - `SPREADSHEET_ID`
   - `QUOTES_RANGE` (par défaut `Devis!A1:Z`)
2. Rechargez l’extension dans Chrome après toute modification.

## Utilisation

1. Ouvrez la page Yooliz « Créer un devis ».
2. Ouvrez le popup de l’extension : la liste des devis est chargée depuis Google Sheets.
3. Cliquez sur « Remplir » pour injecter les informations du devis sélectionné dans le formulaire.

Les appels Google Sheets sont mis en cache pendant 5 minutes pour limiter la consommation de l’API.
