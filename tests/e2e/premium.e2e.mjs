#!/usr/bin/env node
// Recette navigateur de la refonte premium (accueil, sessions admin, Clone IA, CV), sur la recette
// locale en marche (npm run recette:up, Vite en mode recette).
//
//   PLAYWRIGHT_CORE_DIR=<dossier contenant node_modules/playwright-core> node tests/e2e/premium.e2e.mjs [scénario…]
//   ENGINES=chromium (par défaut : chromium,webkit)
//
// Chromium et WebKit de Playwright déjà installés sur le poste ; aucune dépendance ajoutée au projet.
// Aucun appel IA réel : les réponses du Clone IA sont simulées par interception réseau.
// Les services tiers (géolocalisation IP, Google Analytics) sont neutralisés.
// Comptes : administrateurs temporaires créés puis supprimés (jamais le compte du propriétaire).
// Captures et rapport : secrets/recette/e2e/premium (ignoré par Git).

import fs from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, check, pw, results } from './premium/harness.mjs';
import { accueil } from './premium/accueil.mjs';
import { session } from './premium/session.mjs';
import { clone } from './premium/clone.mjs';

export const SCENARIOS = { accueil, session, clone };

const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'));
const engines = (process.env.ENGINES || 'chromium,webkit').split(',');
for (const engine of engines) {
  const browser = await pw[engine].launch();
  for (const name of wanted.length ? wanted : Object.keys(SCENARIOS)) {
    if (!SCENARIOS[name]) { console.error(`Scénario inconnu : ${name}`); process.exitCode = 2; continue; }
    try {
      await SCENARIOS[name](browser, engine);
    } catch (err) {
      check(`${engine} : scénario ${name} terminé sans exception`, false, err.message.split('\n')[0]);
    }
  }
  await browser.close();
}
fs.writeFileSync(path.join(OUT, `rapport-${wanted.join('-') || 'tout'}-${engines.join('-')}.json`), JSON.stringify(results.report, null, 2));
console.log(`\n${results.failures ? `✗ ${results.failures} échec(s)` : '✔ Tous les contrôles passent'} — captures et rapport : ${path.relative(ROOT, OUT)}`);
process.exitCode = results.failures ? 1 : process.exitCode;
