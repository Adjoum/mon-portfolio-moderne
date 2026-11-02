// Parcours navigateur du centre IA (Edge sans interface) sur la pile Supabase locale réelle.
// Appelé par browser.mjs avec la page de l'administrateur déjà connecté (MFA validée).
// Chaque action passe par l'interface ; le résultat est vérifié en base et sur l'API publique.

import os from 'node:os';
import path from 'node:path';

const GEMINI_KEY = 'CANARY-gemini-key-browser-0001';

export async function runAiDashboardScenarios(admin, ctx) {
  const { check, API, WEB, fakes, sqlValue } = ctx;
  const shots = process.env.E2E_SHOTS ?? os.tmpdir();
  // Onglets du dashboard (role="tab" depuis P2) et rubriques du centre IA (boutons)
  const tab = name => admin.getByRole('tab', { name, exact: true }).or(admin.getByRole('button', { name, exact: true })).first().click();
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
  await admin.getByLabel(/J’autorise ce test réel|Je comprends que le test envoie/).check();
  await admin.getByRole('button', { name: 'Tester la configuration' }).click();
  await seen('Test réussi');
  check('navigateur : test de compatibilité exécuté par le serveur', fakes.gemini.calls.length > geminiBefore);
  await admin.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await seen('configuration enregistrée et active');
  check('navigateur : affectation enregistrée en base',
    sqlValue("select provider_id || ':' || model_id || ':' || enabled::text from public.ai_feature_assignments where feature_id = 'latex.improve';") === 'gemini:gemini-3.8-flash:true');

  const run = await fetch(`${API}/api/ai/run/latex.improve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.200' },
    body: JSON.stringify({ input: { selection: '\\section{Profil}', instruction: 'Plus concis', target: { organization: 'Organisme fictif du banc' } } }),
  });
  check('navigateur : la requête suivante utilise la nouvelle affectation (Gemini, clé saisie)',
    run.status === 200 && fakes.gemini.calls.at(-1).url.includes('gemini-3.8-flash') && fakes.gemini.calls.at(-1).headers['x-goog-api-key'] === GEMINI_KEY,
    `HTTP ${run.status}`);

  // ── P1 : sonde vision, états de capacité, jamais de succès vert pour un échec ──
  await tab('Assistants et affectations');
  const ocrCard = featureCard('Import de CV — lecture d’image (OCR)');
  await ocrCard.getByRole('button', { name: 'Configurer' }).click();
  await admin.locator('#assign-cv-import-ocr-provider').selectOption('openai');
  await admin.locator('#assign-cv-import-ocr-model option[value="gpt-6-astra"]').waitFor({ state: 'attached', timeout: 15000 });
  await admin.locator('#assign-cv-import-ocr-model').selectOption('gpt-6-astra');
  const estimate = ocrCard.locator('[data-testid="probe-estimate"]');
  await estimate.getByText(/2 requête\(s\)/).waitFor({ timeout: 15000 });
  check('navigateur P1 : estimation gratuite affichée avant autorisation (texte, image, 2 requêtes)', /texte, image/.test(await estimate.innerText()), await estimate.innerText());
  await ocrCard.locator('[data-profile]').waitFor({ timeout: 10000 });
  check('navigateur P1 : indices de la matrice (vision documentée, à confirmer)', /documentation officielle — à confirmer/.test(await ocrCard.locator('[data-profile]').innerText()));

  const previousBehavior = fakes.openai.behavior;
  const notice = () => ocrCard.locator('[data-notice]').first();
  const openaiBefore = fakes.openai.calls.length;
  await ocrCard.getByRole('button', { name: 'Vérifier la disponibilité' }).click();
  await ocrCard.getByText('Modèle présent dans le catalogue de ce compte').waitFor({ timeout: 15000 });
  check('navigateur P1 : disponibilité vérifiée gratuitement, sans génération', fakes.openai.calls.length === openaiBefore && (await notice().getAttribute('data-notice')) === 'success');

  const authorize = () => ocrCard.getByLabel(/J’autorise ce test réel|Je comprends que le test envoie/).check();
  const runProbe = async expected => {
    await authorize();
    await ocrCard.getByRole('button', { name: 'Tester la configuration' }).click();
    await ocrCard.locator('[data-notice]').getByText(expected).first().waitFor({ timeout: 30000 });
    return { type: await notice().getAttribute('data-notice'), text: await notice().innerText() };
  };

  fakes.openai.behavior = { kind: 'text-only' };
  const textOnly = await runProbe('Texte uniquement');
  await admin.screenshot({ path: path.join(shots, 'p1-texte-uniquement.png'), fullPage: false }).catch(() => {});
  check('navigateur P1 : modèle sans vision → « Texte uniquement », message rouge (alerte), jamais vert',
    textOnly.type === 'error' && (await ocrCard.locator('[data-notice="success"]').count()) === 0, textOnly.text.slice(0, 120));
  check('navigateur P1 : badge « Texte uniquement » dans l’éditeur', await ocrCard.getByText(/^Texte uniquement \(test du/).first().isVisible());

  fakes.openai.queue = [{ kind: 'ok', content: 'OK' }, { kind: 'error', status: 400, body: { error: { message: 'The image data you provided does not represent a valid image.', type: 'invalid_request_error', param: null, code: 'invalid_image_format' } } }];
  const malformed = await runProbe('Erreur de configuration');
  await admin.screenshot({ path: path.join(shots, 'p1-erreur-configuration.png'), fullPage: false }).catch(() => {});
  check('navigateur P1 : requête refusée (bad_request / image) → « Erreur de configuration », avertissement orange, jamais vert',
    malformed.type === 'warning' && /Rien n’est conclu sur le modèle/.test(malformed.text), malformed.text.slice(0, 120));

  fakes.openai.behavior = { kind: 'vision' };
  const seenOk = await runProbe('Test réussi');
  await admin.screenshot({ path: path.join(shots, 'p1-vision-confirmee.png'), fullPage: false }).catch(() => {});
  const code = /Image lue : « ([A-Z0-9]{3}) » \(attendu ([A-Z0-9]{3})\)/.exec(seenOk.text);
  check('navigateur P1 : modèle multimodal → image réellement lue, code identique à l’attendu', seenOk.type === 'success' && !!code && code[1] === code[2], seenOk.text.slice(0, 120));
  check('navigateur P1 : badge « Vision confirmée » après rechargement de l’état serveur', await ocrCard.getByText(/^Vision confirmée \(test du/).first().isVisible());
  check('navigateur P1 : résultat enregistré en base (compatible, texte + image, matrice versionnée)',
    sqlValue("select status || '|' || array_to_string(validated_capabilities, ',') || '|' || (details ? 'matrixVersion') from public.ai_model_feature_compat where feature_id = 'cv.import.ocr' and provider_id = 'openai' and model_id = 'gpt-6-astra';") === 'compatible|text,vision|true');
  fakes.openai.behavior = previousBehavior;
  fakes.openai.queue = [];
  await ocrCard.getByRole('button', { name: 'Fermer', exact: true }).click();

  await tab('Catalogue des modèles');
  await admin.getByRole('tab', { name: 'OpenAI' }).click();
  const astra = admin.locator('[data-model="gpt-6-astra"]');
  await astra.waitFor({ timeout: 15000 });
  check('navigateur P1 : catalogue → « Vision confirmée » pour le modèle testé', await astra.getByText('Vision confirmée', { exact: true }).first().isVisible());
  await astra.screenshot({ path: path.join(shots, 'p1-catalogue.png') }).catch(() => {});

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

  // ── InkSpace : adresse de l'API issue de la configuration du build ──
  const ink = await admin.context().newPage();
  const inkCalls = [];
  ink.on('request', r => { if (r.url().includes('/groq/generate')) inkCalls.push(r.url()); });
  await ink.goto(`${WEB}/inkspace/index.html`);
  await ink.waitForFunction(() => typeof App !== 'undefined' && !!window.INKSPACE_CONFIG, null, { timeout: 20000 });
  await ink.evaluate(() => { document.getElementById('ai-prompt').value = 'Les planètes'; return App.submitAI(); });
  const inkOutput = await ink.locator('#ai-output').innerText();
  check('navigateur : InkSpace appelle l’API configurée au build, jamais la production',
    inkCalls.length === 1 && inkCalls[0] === `${API}/api/groq/generate`, inkCalls.join(' ') || 'aucun appel');
  check('navigateur : InkSpace affiche le message du serveur (fournisseur sans clé)', /momentanément indisponible/.test(inkOutput), inkOutput.slice(0, 80));
  await ink.close();

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
