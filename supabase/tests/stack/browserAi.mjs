// Parcours navigateur du centre IA (Edge sans interface) sur la pile Supabase locale réelle.
// Appelé par browser.mjs avec la page de l'administrateur déjà connecté (MFA validée).
// Chaque action passe par l'interface ; le résultat est vérifié en base et sur l'API publique.

import os from 'node:os';
import path from 'node:path';

const GEMINI_KEY = 'CANARY-gemini-key-browser-0001';

export async function runAiDashboardScenarios(admin, ctx) {
  const { check, API, fakes, sqlValue } = ctx;
  const shots = process.env.E2E_SHOTS ?? os.tmpdir();
  const tab = name => admin.getByRole('button', { name, exact: true }).click();
  const seen = text => admin.getByText(text).first().waitFor({ timeout: 20000 });
  const featureCard = label => admin.locator('section', { has: admin.getByRole('heading', { name: label, exact: true }) });

  fakes.gemini.models = [{ id: 'gemini-3.8-flash' }, { id: 'gemini-navigateur-b' }];
  fakes.gemini.acceptedKeys = [GEMINI_KEY];

  console.log('▶ Centre IA dans le dashboard (navigateur)');
  await tab('Intelligence artificielle');
  await seen('Assistants actifs');
  check('navigateur : rubrique « Intelligence artificielle » du dashboard existant', await admin.getByRole('heading', { name: 'Intelligence artificielle' }).isVisible());

  // ── Clé API ──
  await tab('Fournisseurs et clés');
  const geminiCard = admin.locator('section', { has: admin.getByRole('heading', { name: /^Google Gemini/ }) });
  const keyInput = admin.getByLabel('Clé API Google Gemini');
  await keyInput.fill('CANARY-mauvaise-cle-navigateur');
  await geminiCard.getByRole('button', { name: /Enregistrer/ }).click();
  await seen('Le fournisseur a refusé cette clé');
  check('navigateur : clé refusée → message du serveur, rien enregistré', sqlValue("select count(*) from vault.secrets where name = 'ai_provider_gemini';") === '0');
  await keyInput.fill(GEMINI_KEY);
  await geminiCard.getByRole('button', { name: /Enregistrer/ }).click();
  await seen('Clé vérifiée par Google Gemini');
  check('navigateur : clé enregistrée dans Vault après confirmation du serveur', sqlValue("select count(*) from vault.secrets where name = 'ai_provider_gemini';") === '1');
  check('navigateur : champ vidé, clé absente de la page et du stockage local',
    (await keyInput.inputValue()) === '' && !(await admin.content()).includes(GEMINI_KEY)
    && !(await admin.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).includes('CANARY'));

  // ── Catalogue ──
  await geminiCard.getByRole('button', { name: /Modèles/ }).click();
  await admin.getByRole('tab', { name: 'Google Gemini' }).waitFor({ timeout: 10000 });
  await admin.locator('[data-model="gemini-navigateur-b"]').waitFor({ timeout: 15000 });
  check('navigateur : catalogue alimenté dès l’enregistrement de la clé', true);
  await admin.getByRole('button', { name: 'Actualiser les modèles' }).click();
  await seen('Catalogue actualisé');
  check('navigateur : actualisation et date affichées', await admin.getByText(/Actualisé le/).first().isVisible());

  await admin.locator('#ai-manual-model').fill('gemini-manuel-navigateur');
  await admin.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await seen('ajouté manuellement');
  check('navigateur : ajout manuel distingué', await admin.locator('[data-model="gemini-manuel-navigateur"]').getByText('Ajout manuel').isVisible());

  await admin.getByRole('button', { name: 'Supprimer gemini-navigateur-b' }).click();
  await seen('supprimé et exclu');
  check('navigateur : suppression par la croix, après confirmation',
    sqlValue("select count(*) from public.ai_models where model_id = 'gemini-navigateur-b';") === '0'
    && await admin.getByText('Exclus par l’administrateur').isVisible());
  await admin.getByRole('button', { name: 'Actualiser les modèles' }).click();
  await seen('exclu(s) ignoré(s)');
  check('navigateur : modèle exclu non réintroduit par l’actualisation', (await admin.locator('[data-model="gemini-navigateur-b"]').count()) === 0);
  await admin.getByRole('button', { name: 'Restaurer' }).click();
  await seen('restauré');
  check('navigateur : restauration', (await admin.locator('[data-model="gemini-navigateur-b"]').count()) === 1);

  await admin.getByRole('tab', { name: 'Groq' }).click();
  await admin.locator('[data-model="openai/gpt-oss-20b"]').waitFor({ timeout: 15000 });
  await admin.getByRole('button', { name: 'Supprimer openai/gpt-oss-20b' }).click();
  await admin.waitForTimeout(500);
  check('navigateur : modèle affecté à une fonctionnalité active non supprimable',
    sqlValue("select count(*) from public.ai_models where model_id = 'openai/gpt-oss-20b';") === '1');

  // ── Affectation ──
  await tab('Assistants et affectations');
  const latex = featureCard('LaTeX — amélioration');
  await latex.getByRole('button', { name: 'Configurer' }).click();
  await admin.locator('#assign-latex-improve-provider').selectOption('gemini');
  await admin.locator('#assign-latex-improve-model').selectOption('gemini-3.8-flash');
  await admin.getByLabel('Fonctionnalité active').check();
  await admin.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await seen('Testez d’abord');
  check('navigateur : activation sans test refusée, message explicite',
    sqlValue("select enabled from public.ai_feature_assignments where feature_id = 'latex.improve';") === 'f');

  const geminiBefore = fakes.gemini.calls.length;
  await admin.getByLabel(/Je comprends que le test envoie/).check();
  await admin.getByRole('button', { name: 'Tester la configuration' }).click();
  await seen('Test réussi');
  check('navigateur : test de compatibilité exécuté par le serveur', fakes.gemini.calls.length > geminiBefore);
  await admin.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await seen('configuration enregistrée et active');
  check('navigateur : affectation enregistrée en base',
    sqlValue("select provider_id || ':' || model_id || ':' || enabled::text from public.ai_feature_assignments where feature_id = 'latex.improve';") === 'gemini:gemini-3.8-flash:true');

  const run = await fetch(`${API}/api/ai/run/latex.improve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.200' },
    body: JSON.stringify({ input: { selection: '\\section{Profil}', instruction: 'Plus concis' } }),
  });
  check('navigateur : la requête suivante utilise la nouvelle affectation (Gemini, clé saisie)',
    run.status === 200 && fakes.gemini.calls.at(-1).url.includes('gemini-3.8-flash') && fakes.gemini.calls.at(-1).headers['x-goog-api-key'] === GEMINI_KEY,
    `HTTP ${run.status}`);

  // ── Budget, statistiques, historique ──
  await tab('Quotas et budgets');
  await admin.locator('#ai-budget-daily').fill('4');
  await admin.getByRole('button', { name: 'Enregistrer le budget' }).click();
  await seen('Budget global enregistré');
  check('navigateur : budget global enregistré', sqlValue("select value from public.ai_settings where key = 'daily_budget_micro_usd';") === '4000000');
  await admin.locator('#ai-budget-daily').fill('5');
  await admin.getByRole('button', { name: 'Enregistrer le budget' }).click();
  await seen('Budget global enregistré');

  await tab('Statistiques');
  await seen(/Total : \d+ requête/);
  await tab('Historique');
  await seen('Clé enregistrée');
  check('navigateur : statistiques et historique affichés', true);

  // ── Persistance après rechargement ──
  await admin.reload();
  await tab('Intelligence artificielle');
  await tab('Assistants et affectations');
  await featureCard('LaTeX — amélioration').getByText('gemini-3.8-flash').waitFor({ timeout: 20000 });
  check('navigateur : rechargement → affectation toujours affichée', true);

  // ── Affichage mobile ──
  await admin.setViewportSize({ width: 390, height: 844 });
  await tab('Fournisseurs et clés');
  await admin.waitForTimeout(500);
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await admin.screenshot({ path: path.join(shots, 'admin-ai-mobile.png'), fullPage: true }).catch(() => {});
  check('navigateur : affichage mobile sans débordement horizontal', overflow <= 1, `${overflow} px`);
  await admin.setViewportSize({ width: 1440, height: 900 });
  await tab('Vue d’ensemble');
  await admin.screenshot({ path: path.join(shots, 'admin-ai.png'), fullPage: true }).catch(() => {});
}
