# Yooliz Auto-Fill Extension

Cette extension Chrome permet de récupérer la liste des devis depuis Google Sheets et de pré-remplir le formulaire Yooliz.

## Configuration

1. Les constantes `GOOGLE_SHEETS_API_KEY`, `SPREADSHEET_ID` et `QUOTES_RANGE` sont renseignées dans `background.js`.
   Adaptez-les si la source Google Sheets change.
2. Configurez un client OAuth 2.0 Desktop/Chrome App dans Google Cloud et remplacez
   `REPLACE_WITH_OAUTH_CLIENT_ID.apps.googleusercontent.com` dans `manifest.json` par
   l’identifiant réel. Le client doit être autorisé pour le scope
   `https://www.googleapis.com/auth/spreadsheets`.
3. Lors du premier clic sur « Supprimer les devis utilisés », Chrome affichera une
   fenêtre d’autorisation Google permettant de consentir à l’accès en écriture à la
   feuille. Validez-la pour que la suppression des lignes fonctionne.
4. Rechargez l’extension dans Chrome après toute modification.

## Utilisation

1. Ouvrez la page Yooliz « Créer un devis ».
2. Ouvrez le popup de l’extension : la liste des devis est chargée depuis Google Sheets.
   L’interface se synchronise automatiquement toutes les quelques secondes pour
   refléter les ajouts, suppressions ou modifications dans le fichier Google Sheets.
3. Cliquez sur « Remplir » pour injecter les informations du devis sélectionné dans le formulaire.

Lorsque Google Sheets ne contient aucune ligne fournisseur, aucun devis n’est
proposé dans l’interface. Dès qu’une nouvelle ligne est ajoutée dans la feuille,
elle apparaît automatiquement dans la liste sans recharger l’extension.

Lorsqu’un devis fournisseur est supprimé via « Supprimer les devis utilisés », l’extension appelle directement
l’API Google Sheets en utilisant l’autorisation OAuth 2.0 accordée pour effacer les lignes correspondantes.
