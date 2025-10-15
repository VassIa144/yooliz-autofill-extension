/**
 * SCRIPT D'EXTRACTION YOOLIZ - VERSION CORRIGÉE
 *
 * Copiez/collez ce script dans la console (F12) sur la page Yooliz
 */

(async function() {
  'use strict';

  console.log('🚀 Extraction Yooliz démarrée...\n');

  const SELECTORS = {
    make: '#input_2_15',
    model: '#input_2_16',
    engine: '#input_2_17',
  };

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const allResults = [];

  // ============ Interface visuelle ============
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:10px;right:10px;width:600px;height:700px;background:white;border:3px solid #4CAF50;border-radius:8px;z-index:999999;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:monospace;';

  const header = document.createElement('div');
  header.style.cssText = 'background:#4CAF50;color:white;padding:12px;font-weight:bold;font-size:14px;border-radius:5px 5px 0 0;';
  header.textContent = '🚀 Extraction en cours...';

  const stats = document.createElement('div');
  stats.style.cssText = 'padding:10px;background:#f5f5f5;border-bottom:1px solid #ddd;font-size:13px;';
  stats.innerHTML = `
    <div><strong>Marque actuelle:</strong> <span id="current-make">-</span></div>
    <div><strong>Modèle actuel:</strong> <span id="current-model">-</span></div>
    <div><strong>Motorisation:</strong> <span id="current-engine">-</span></div>
    <div><strong>Total entrées:</strong> <span id="count">0</span></div>
  `;

  const textarea = document.createElement('textarea');
  textarea.style.cssText = 'flex:1;padding:10px;border:none;font-size:11px;resize:none;line-height:1.4;';
  textarea.readOnly = true;
  textarea.placeholder = 'Les données apparaîtront ici en temps réel...';

  panel.appendChild(header);
  panel.appendChild(stats);
  panel.appendChild(textarea);
  document.body.appendChild(panel);

  console.log('✅ Panneau d\'affichage créé\n');

  // ============ Fonctions utilitaires ============
  function addLine(make, model, engine) {
    const line = `${make} | ${model} | ${engine || 'NULL'}`;
    textarea.value += line + '\n';
    textarea.scrollTop = textarea.scrollHeight;
    allResults.push({ make, model, engine: engine || 'NULL' });
    document.getElementById('count').textContent = allResults.length;
  }

  function getOptions(selector) {
    const select = document.querySelector(selector);
    if (!select) return [];
    return Array.from(select.options)
      .filter(opt => opt.value && opt.value !== '')
      .map(opt => ({ value: opt.value, text: opt.textContent.trim() }));
  }

  function selectAndTrigger(selector, value) {
    const select = document.querySelector(selector);
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) jQuery(select).val(value).trigger('change');
  }

  function resetSelect(selector) {
    const select = document.querySelector(selector);
    if (!select) return;
    select.value = '';
    select.selectedIndex = 0;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) jQuery(select).val('').trigger('change');
  }

  // ============ EXTRACTION ============
  const allMakes = getOptions(SELECTORS.make);
  const makes = allMakes; // EXTRACTION COMPLÈTE: toutes les marques

  console.log(`📊 ${makes.length} marques disponibles`);
  console.log(`🚀 EXTRACTION COMPLÈTE de toutes les marques\n`);

  // Pour chaque marque
  for (let i = 0; i < makes.length; i++) {
    const make = makes[i];

    console.log(`\n[${i + 1}/${makes.length}] 🚗 MARQUE: ${make.text}`);
    document.getElementById('current-make').textContent = make.text;
    document.getElementById('current-model').textContent = '-';
    document.getElementById('current-engine').textContent = '-';

    // Reset complet
    resetSelect(SELECTORS.model);
    resetSelect(SELECTORS.engine);
    await delay(200);

    // Sélectionner la marque et attendre 5 secondes
    console.log(`   ⏳ Sélection marque et attente 5 sec...`);
    selectAndTrigger(SELECTORS.make, make.value);
    await delay(5000);

    // Récupérer tous les modèles
    const models = getOptions(SELECTORS.model);

    if (models.length === 0) {
      console.log(`   ⚠️  Aucun modèle pour ${make.text}`);
      continue;
    }

    console.log(`   ✅ ${models.length} modèles chargés`);

    // Pour chaque modèle de cette marque
    for (let j = 0; j < models.length; j++) {
      const model = models[j];

      console.log(`\n   [${j + 1}/${models.length}] 📦 MODÈLE: ${model.text}`);
      document.getElementById('current-model').textContent = model.text;
      document.getElementById('current-engine').textContent = '-';

      // Reset motorisations
      resetSelect(SELECTORS.engine);
      await delay(200);

      // Sélectionner le modèle et attendre 5 secondes
      console.log(`      ⏳ Sélection modèle et attente 5 sec...`);
      selectAndTrigger(SELECTORS.model, model.value);
      await delay(5000);

      // Récupérer toutes les motorisations
      const engines = getOptions(SELECTORS.engine);

      if (engines.length === 0) {
        console.log(`      ⚠️  Aucune motorisation pour ${model.text}`);
        addLine(make.text, model.text, null);
      } else {
        console.log(`      ✅ ${engines.length} motorisations trouvées`);

        // REMPLIR chaque motorisation une par une avec 100ms entre chaque
        for (let k = 0; k < engines.length; k++) {
          const engine = engines[k];

          // Sélectionner cette motorisation
          selectAndTrigger(SELECTORS.engine, engine.value);

          // Enregistrer la combinaison
          addLine(make.text, model.text, engine.text);
          document.getElementById('current-engine').textContent = engine.text.substring(0, 30) + '...';

          console.log(`         [${k + 1}/${engines.length}] ✓ ${engine.text.substring(0, 40)}...`);

          // Attendre 100ms avant la prochaine motorisation
          await delay(100);
        }
      }

      // Attendre 5 secondes avant de passer au modèle suivant
      if (j < models.length - 1) {
        console.log(`      ⏳ Attente 5 sec avant modèle suivant...`);
        await delay(5000);
      }
    }

    // Attendre 5 secondes avant de passer à la marque suivante
    if (i < makes.length - 1) {
      console.log(`   ⏳ Attente 5 sec avant marque suivante...`);
      await delay(5000);
    }
  }

  // ============ TÉLÉCHARGEMENT CSV ============
  console.log('\n' + '='.repeat(60));
  console.log('📊 EXTRACTION TERMINÉE');
  console.log('='.repeat(60));
  console.log(`Total entrées: ${allResults.length}`);
  console.log('Génération du fichier CSV...\n');

  header.style.background = '#2196F3';
  header.textContent = '💾 Génération du CSV...';

  const csvLines = ['Marque,Modèle,Motorisation'];
  allResults.forEach(r => {
    csvLines.push(`"${r.make}","${r.model}","${r.engine}"`);
  });

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'possibles-champs-vehicules.csv';
  a.click();
  URL.revokeObjectURL(url);

  header.style.background = '#4CAF50';
  header.textContent = `✅ Terminé - ${allResults.length} entrées extraites`;

  console.log('✅ Fichier CSV téléchargé: possibles-champs-vehicules.csv');
  console.log(`📥 ${allResults.length} lignes (+ 1 ligne d'en-tête)`);

})();
