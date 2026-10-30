-- Banc SQL du centre d'administration multi-IA : règles métier et droits, identité par identité.
-- Exécuté en supabase_admin sur une base jetable. Chaque contrôle écrit une ligne OK / KO.

create schema if not exists test;

create or replace function test.result(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  raise notice '% %', case when p_ok then 'OK' else 'KO' end, p_label;
end $$;

-- Exécute une commande sous une identité et renvoie le message d'erreur (null : réussite)
create or replace function test.try_as(p_role text, p_claims jsonb, p_sql text) returns text
language plpgsql as $$
declare v_error text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    v_error := sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v_error;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'user@example.test')
on conflict do nothing;
insert into public.admin_users (user_id, email) values ('00000000-0000-4000-8000-0000000000a1', 'admin@example.test')
on conflict do nothing;

create or replace function test.admin() returns jsonb language sql as $$
  select '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}'::jsonb $$;
create or replace function test.admin_aal1() returns jsonb language sql as $$
  select '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}'::jsonb $$;
create or replace function test.user_aal2() returns jsonb language sql as $$
  select '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","aal":"aal2"}'::jsonb $$;

-- Exécution administrateur : renvoie l'erreur éventuelle
create or replace function test.admin_do(p_sql text) returns text language sql as $$
  select test.try_as('authenticated', test.admin(), p_sql) $$;

do $$
declare
  v text;
  n integer;
  j jsonb;
  c text := 'select public.ai_admin_overview()';
begin
  -- ── Données initiales ──
  select count(*) into n from public.ai_providers;
  perform test.result('six fournisseurs initiaux', n = 6);
  select count(*) into n from public.ai_features;
  perform test.result('neuf fonctionnalités initiales', n = 9);
  select count(distinct provider_id) into n from public.ai_models;
  perform test.result('un catalogue par défaut pour chacun des six fournisseurs', n = 6);
  select count(*) into n from public.ai_models where model_id in ('gpt-6-astra', 'openai/gpt-oss-120b') and status = 'unverified';
  perform test.result('identifiants initiaux présents et marqués non vérifiés', n = 2);
  select count(*) into n from public.ai_feature_assignments where enabled;
  perform test.result('aucune fonctionnalité active au départ', n = 0);
  select (value #>> '{}')::bigint into n from public.ai_settings where key = 'daily_budget_micro_usd';
  perform test.result('budget initial de 5 USD par jour', n = 5000000);
  select (value #>> '{}')::bigint into n from public.ai_settings where key = 'monthly_budget_micro_usd';
  perform test.result('budget initial de 30 USD par mois', n = 30000000);
  select count(*) into n from public.ai_quota_rules where daily_budget_micro_usd is not null and monthly_budget_micro_usd is not null;
  perform test.result('sous-budget indépendant pour chaque fonctionnalité', n = 9);

  -- ── Droits : aucun accès direct ──
  foreach v in array array['ai_providers','ai_models','ai_feature_assignments','ai_settings','ai_usage_events','ai_config_audit','ai_model_exclusions'] loop
    perform test.result('anon : lecture directe refusée — ' || v, test.try_as('anon', null, format('select 1 from public.%I', v)) is not null);
    perform test.result('admin : lecture directe refusée — ' || v, test.admin_do(format('select 1 from public.%I', v)) is not null);
    perform test.result('ai_backend : lecture directe refusée — ' || v, test.try_as('ai_backend', null, format('select 1 from public.%I', v)) is not null);
  end loop;
  perform test.result('admin : écriture directe refusée', test.admin_do($q$update public.ai_settings set value = '0'$q$) is not null);
  perform test.result('ai_backend : Vault direct refusé', test.try_as('ai_backend', null, 'select 1 from vault.decrypted_secrets') is not null);
  perform test.result('authenticated : schéma privé refusé', test.admin_do('select ai_private.runtime_config()') is not null);
  perform test.result('anon : schéma privé refusé', test.try_as('anon', null, 'select ai_private.runtime_secret(''openai'')') is not null);
  perform test.result('ai_backend : fonctions admin refusées', test.try_as('ai_backend', null, c) is not null);

  perform test.result('anon : administration refusée', test.try_as('anon', null, c) is not null);
  perform test.result('utilisateur MFA non admin : refusé', test.try_as('authenticated', test.user_aal2(), c) like '%ai_forbidden%');
  perform test.result('admin sans MFA : refusé', test.try_as('authenticated', test.admin_aal1(), c) like '%ai_forbidden%');
  perform test.result('admin avec MFA : accepté', test.admin_do(c) is null);

  -- ── Clé : aucune activation sans clé ──
  perform test.result('fournisseur sans clé non activable', test.admin_do($q$select public.ai_admin_set_provider_enabled('xai', true)$q$) like '%ai_provider_without_key%');
  perform test.result('clé enregistrée dans Vault', test.admin_do($q$select public.ai_admin_set_provider_key('openai', 'CANARY_KEY_ONE', '0123456789abcdef')$q$) is null);
  perform test.result('ajout de clé : fournisseur activé, statut valide',
    (select enabled and key_status = 'valid' and key_fingerprint = '0123456789abcdef' from public.ai_providers where id = 'openai'));
  select ai_private.runtime_secret('openai') into v;
  perform test.result('lecture serveur de la clé', v = 'CANARY_KEY_ONE');
  perform test.admin_do($q$select public.ai_admin_set_provider_key('openai', 'CANARY_KEY_TWO', 'fedcba9876543210')$q$);
  select ai_private.runtime_secret('openai') into v;
  perform test.result('remplacement de clé effectif, sans doublon', v = 'CANARY_KEY_TWO' and (select count(*) from vault.secrets where name = 'ai_provider_openai') = 1);
  perform test.result('la vue d’ensemble ne contient aucune clé', test.admin_do(c) is null and position('CANARY' in ai_private.runtime_config()::text) = 0);
  perform test.result('audit : empreintes uniquement, jamais la clé',
    (select count(*) from public.ai_config_audit where action = 'provider.key.set') = 2
    and (select count(*) from public.ai_config_audit where (coalesce(before::text, '') || coalesce(after::text, '')) like '%CANARY%') = 0);
  perform test.result('clé trop courte refusée', test.admin_do($q$select public.ai_admin_set_provider_key('openai', 'court', '0123456789abcdef')$q$) like '%ai_invalid_key%');

  -- ── Catalogue : ajout manuel ──
  perform test.result('ajout manuel accepté', test.admin_do($q$select public.ai_admin_add_model('openai', 'mon-modele-x', 'Mon modèle')$q$) is null);
  perform test.result('modèle manuel marqué comme tel et non vérifié',
    (select origin = 'manual' and status = 'unverified' from public.ai_models where model_id = 'mon-modele-x'));
  perform test.result('doublon refusé', test.admin_do($q$select public.ai_admin_add_model('openai', 'mon-modele-x', '')$q$) like '%ai_model_exists%');
  perform test.result('traversée de chemin refusée', test.admin_do($q$select public.ai_admin_add_model('gemini', '../secret', '')$q$) like '%ai_invalid_model_id%');
  perform test.result('caractères interdits refusés', test.admin_do($q$select public.ai_admin_add_model('openai', 'a b', '')$q$) like '%ai_invalid_model_id%');

  -- ── Synchronisation ──
  perform test.admin_do($q$select public.ai_admin_add_model('openai', 'manuel-absent', '')$q$);
  perform test.result('synchronisation acceptée', test.admin_do($q$select public.ai_admin_sync_models('openai', '[
    {"id":"gpt-6-astra","displayName":"Astra","contextWindow":1000,"maxCompletionTokens":200,"vision":true},
    {"id":"modele-officiel"},
    {"id":"modele-retire","active":false},
    {"id":"modele-tarif","pricing":{"inputPerMTok":1000,"outputPerMTok":2000}}
  ]'::jsonb)$q$) is null);
  perform test.result('modèle initial confirmé par le catalogue',
    (select origin = 'official' and status = 'available' and display_name = 'Astra' and last_seen_at is not null from public.ai_models where model_id = 'gpt-6-astra'));
  perform test.result('nouveau modèle officiel disponible', (select origin = 'official' and status = 'available' from public.ai_models where model_id = 'modele-officiel'));
  perform test.result('modèle retiré marqué déprécié', (select status = 'deprecated' from public.ai_models where model_id = 'modele-retire'));
  perform test.result('tarif du catalogue enregistré', (select source = 'catalog' from public.ai_model_pricing where model_id = 'modele-tarif'));
  perform test.result('modèle manuel intact après synchronisation', (select origin = 'manual' and status = 'unverified' from public.ai_models where model_id = 'manuel-absent'));
  perform test.result('date de synchronisation enregistrée', (select last_sync_at is not null and last_sync_ok and last_sync_count = 4 from public.ai_providers where id = 'openai'));
  perform test.admin_do($q$select public.ai_admin_sync_models('openai', '[{"id":"gpt-6-astra"}]'::jsonb)$q$);
  perform test.result('modèle officiel disparu : déprécié, jamais supprimé', (select status = 'deprecated' from public.ai_models where model_id = 'modele-officiel'));
  v := test.admin_do($q$select public.ai_admin_sync_models('openai', '[{"id":"gpt-6-astra"},{"id":"mon-modele-x"}]'::jsonb)$q$);
  perform test.result('un manuel présent au catalogue devient disponible et reste manuel',
    v is null and (select origin = 'manual' and status = 'available' from public.ai_models where model_id = 'mon-modele-x'));

  perform test.result('échec de synchronisation enregistré', test.admin_do($q$select public.ai_admin_record_sync_failure('openai', 'unavailable')$q$) is null);
  perform test.result('échec : liste conservée, vraie date de réussite conservée',
    (select last_sync_ok = false and last_sync_code = 'unavailable' and last_sync_at is not null and last_sync_attempt_at >= last_sync_at from public.ai_providers where id = 'openai')
    and (select count(*) from public.ai_models where provider_id = 'openai') > 0);

  -- ── Suppression, exclusion, restauration ──
  perform test.result('suppression permanente acceptée', test.admin_do($q$select public.ai_admin_delete_model('openai', 'modele-officiel')$q$) is null);
  perform test.result('la ligne a réellement disparu', not exists (select 1 from public.ai_models where model_id = 'modele-officiel'));
  perform test.result('marqueur d’exclusion créé', exists (select 1 from public.ai_model_exclusions where model_id = 'modele-officiel'));
  perform test.admin_do($q$select public.ai_admin_sync_models('openai', '[{"id":"gpt-6-astra"},{"id":"modele-officiel"}]'::jsonb)$q$);
  perform test.result('non-réapparition après synchronisation', not exists (select 1 from public.ai_models where model_id = 'modele-officiel'));
  perform test.result('ajout manuel d’un exclu refusé', test.admin_do($q$select public.ai_admin_add_model('openai', 'modele-officiel', '')$q$) like '%ai_model_excluded%');
  perform test.result('restauration acceptée', test.admin_do($q$select public.ai_admin_restore_model('openai', 'modele-officiel')$q$) is null);
  perform test.result('modèle restauré non vérifié, exclusion levée',
    (select status = 'unverified' from public.ai_models where model_id = 'modele-officiel')
    and not exists (select 1 from public.ai_model_exclusions where model_id = 'modele-officiel'));
  perform test.result('restauration d’un inconnu refusée', test.admin_do($q$select public.ai_admin_restore_model('openai', 'inconnu')$q$) like '%ai_model_not_found%');

  -- ── Affectations indépendantes et activation ──
  perform test.admin_do($q$select public.ai_admin_set_provider_key('groq', 'CANARY_GROQ', '1111111111111111')$q$);

  perform test.result('activation refusée sans test',
    test.admin_do($q$select public.ai_admin_save_assignment('inkspace.generate', 'openai', 'gpt-6-astra', '{}', 1200, 30000, true, 1)$q$) like '%ai_activation_blocked%');
  perform test.result('affectation inchangée après refus', (select not enabled and version = 1 from public.ai_feature_assignments where feature_id = 'inkspace.generate'));

  perform test.result('test de compatibilité enregistré', test.admin_do($q$select public.ai_admin_record_compat('inkspace.generate', 'openai', 'gpt-6-astra', 'compatible', '{text,json}', null, 120)$q$) is null);
  perform test.result('capacité manquante : activation refusée',
    test.admin_do($q$select public.ai_admin_record_compat('cv.import.ocr', 'openai', 'gpt-6-astra', 'compatible', '{text}', null, 120)$q$) is null
    and test.admin_do($q$select public.ai_admin_save_assignment('cv.import.ocr', 'openai', 'gpt-6-astra', '{}', 2000, 60000, true, 1)$q$) like '%ai_activation_blocked%');
  perform test.result('modèle incompatible avec la vision jamais activable',
    test.admin_do($q$select public.ai_admin_record_compat('cv.import.ocr', 'groq', 'openai/gpt-oss-120b', 'incompatible', '{text}', 'bad_request', 90)$q$) is null
    and test.admin_do($q$select public.ai_admin_save_assignment('cv.import.ocr', 'groq', 'openai/gpt-oss-120b', '{}', 2000, 60000, true, 1)$q$) like '%ai_activation_blocked%');

  perform test.admin_do($q$select public.ai_admin_add_model('openai', 'sans-tarif', '')$q$);
  perform test.admin_do($q$select public.ai_admin_record_compat('inkspace.generate', 'openai', 'sans-tarif', 'compatible', '{text,json}', null, 120)$q$);
  perform test.result('modèle sans tarif : activation refusée',
    test.admin_do($q$select public.ai_admin_save_assignment('inkspace.generate', 'openai', 'sans-tarif', '{}', 1200, 30000, true, 1)$q$) like '%ai_activation_blocked%');
  perform test.result('tarif saisi par l’admin', test.admin_do($q$select public.ai_admin_set_pricing('openai', 'sans-tarif', 1000000, 2000000)$q$) is null);
  perform test.admin_do($q$select public.ai_admin_sync_models('openai', '[{"id":"gpt-6-astra"},{"id":"sans-tarif","pricing":{"inputPerMTok":1,"outputPerMTok":1}}]'::jsonb)$q$);
  perform test.result('un tarif admin n’est pas écrasé par le catalogue', (select source = 'admin' and input_per_mtok_micro_usd = 1000000 from public.ai_model_pricing where model_id = 'sans-tarif'));

  perform test.result('InkSpace activé sur OpenAI', test.admin_do($q$select public.ai_admin_save_assignment('inkspace.generate', 'openai', 'gpt-6-astra', '{"reasoning_effort":"low"}', 1200, 30000, true, 1)$q$) is null);
  perform test.result('conflit de version refusé', test.admin_do($q$select public.ai_admin_save_assignment('inkspace.generate', 'openai', 'gpt-6-astra', '{}', 1200, 30000, true, 1)$q$) like '%ai_conflict%');
  perform test.result('changement d’InkSpace sans effet sur NovaMind',
    (select provider_id = 'groq' and model_id = 'openai/gpt-oss-120b' and version = 1 from public.ai_feature_assignments where feature_id = 'novamind.diagram'));
  perform test.result('NovaMind passe sur un autre modèle', test.admin_do($q$select public.ai_admin_save_assignment('novamind.diagram', 'groq', 'openai/gpt-oss-20b', '{}', 2400, 45000, false, 1)$q$) is null);
  perform test.result('changement de NovaMind sans effet sur l’assistant',
    (select model_id = 'openai/gpt-oss-120b' and version = 1 from public.ai_feature_assignments where feature_id = 'agent.chat'));
  perform test.result('InkSpace inchangé', (select model_id = 'gpt-6-astra' and enabled from public.ai_feature_assignments where feature_id = 'inkspace.generate'));

  -- ── Suppression d'un modèle affecté ──
  perform test.result('suppression d’un modèle actif refusée', test.admin_do($q$select public.ai_admin_delete_model('openai', 'gpt-6-astra')$q$) like '%ai_model_in_use%');
  perform test.result('désactivation d’un modèle actif refusée', test.admin_do($q$select public.ai_admin_set_model_disabled('openai', 'gpt-6-astra', true)$q$) like '%ai_model_in_use%');
  perform test.result('le modèle et son affectation sont intacts',
    exists (select 1 from public.ai_models where model_id = 'gpt-6-astra') and (select enabled from public.ai_feature_assignments where feature_id = 'inkspace.generate'));
  perform test.result('la contrainte protège même sans la fonction',
    test.try_as('postgres', null, $q$delete from public.ai_models where model_id = 'gpt-6-astra'$q$) is not null);
  v := test.admin_do($q$select public.ai_admin_delete_model('groq', 'openai/gpt-oss-20b')$q$);
  perform test.result('suppression possible si les affectations concernées sont désactivées',
    v is null and (select model_id is null and version = 3 from public.ai_feature_assignments where feature_id = 'novamind.diagram'));

  v := test.admin_do($q$select public.ai_admin_set_model_disabled('openai', 'gpt-6-luna', true)$q$);
  perform test.result('modèle désactivé non sélectionnable',
    v is null and test.admin_do($q$select public.ai_admin_save_assignment('latex.improve', 'openai', 'gpt-6-luna', '{}', 1800, 60000, false, 1)$q$) like '%ai_model_unavailable%');
  perform test.result('modèle réactivé', test.admin_do($q$select public.ai_admin_set_model_disabled('openai', 'gpt-6-luna', false)$q$) is null);

  -- ── Fournisseur coupé ──
  select ai_private.runtime_config() into j;
  perform test.result('configuration d’exécution : InkSpace prêt', j #>> '{features,inkspace.generate,blocker}' is null and (j #>> '{features,inkspace.generate,enabled}')::boolean);
  perform test.admin_do($q$select public.ai_admin_set_provider_enabled('openai', false)$q$);
  select ai_private.runtime_config() into j;
  perform test.result('fournisseur désactivé : fonctionnalité bloquée, clé non servie',
    j #>> '{features,inkspace.generate,blocker}' = 'provider_disabled' and ai_private.runtime_secret('openai') is null);
  perform test.result('clé encore lisible pour le test admin uniquement', ai_private.runtime_admin_secret('openai') = 'CANARY_KEY_TWO');
  perform test.admin_do($q$select public.ai_admin_set_provider_enabled('openai', true)$q$);

  v := test.admin_do($q$select public.ai_admin_record_provider_check('groq', false, 'auth')$q$);
  perform test.result('clé refusée par le fournisseur : invalide et désactivée',
    v is null and (select key_status = 'invalid' and not enabled from public.ai_providers where id = 'groq'));
  v := test.admin_do($q$select public.ai_admin_record_provider_check('openai', false, 'unavailable')$q$);
  perform test.result('panne réseau : la clé reste valide',
    v is null and (select key_status = 'valid' and enabled from public.ai_providers where id = 'openai'));

  perform test.result('suppression de clé', test.admin_do($q$select public.ai_admin_delete_provider_key('groq')$q$) is null);
  perform test.result('clé retirée de Vault, fournisseur inactif',
    not exists (select 1 from vault.secrets where name = 'ai_provider_groq')
    and (select key_status = 'not_configured' and not enabled from public.ai_providers where id = 'groq'));
  perform test.result('nouvelle clé après suppression', test.admin_do($q$select public.ai_admin_set_provider_key('groq', 'CANARY_GROQ_2', '2222222222222222')$q$) is null);

  -- ── Quotas et budgets ──
  perform test.result('quotas enregistrés', test.admin_do($q$select public.ai_admin_save_quotas('inkspace.generate', 2, 3, 8, 3, 900, 2000, 1)$q$) is null);
  perform test.result('quota : réservation acceptée', (ai_private.runtime_reserve('inkspace.generate', 'sujet-a', 100) ->> 'ok')::boolean);
  perform test.result('quota : 2e réservation du même sujet', (ai_private.runtime_reserve('inkspace.generate', 'sujet-a', 100) ->> 'ok')::boolean);
  j := ai_private.runtime_reserve('inkspace.generate', 'sujet-a', 100);
  perform test.result('quota par sujet atteint', j ->> 'code' = 'AI_QUOTA_EXCEEDED' and j ->> 'scope' = 'subject' and (j ->> 'retryAfter')::int > 0);
  perform test.result('un autre visiteur reste autorisé', (ai_private.runtime_reserve('inkspace.generate', 'sujet-b', 100) ->> 'ok')::boolean);
  j := ai_private.runtime_reserve('inkspace.generate', 'sujet-c', 100);
  perform test.result('quota global atteint', j ->> 'code' = 'AI_QUOTA_EXCEEDED' and j ->> 'scope' = 'global');
  perform test.result('refus sans effet sur les compteurs',
    (select requests = 3 and cost_micro_usd = 300 from public.ai_usage_counters where scope = 'feature:inkspace.generate' and period = 'day'));

  perform test.admin_do($q$select public.ai_admin_save_quotas('inkspace.generate', 100, 100, 8, 3, 900, 2000, 2)$q$);
  j := ai_private.runtime_reserve('inkspace.generate', 'sujet-d', 700);
  perform test.result('sous-budget journalier dépassé', j ->> 'code' = 'AI_BUDGET_EXCEEDED' and j ->> 'scope' = 'feature_day');
  perform test.result('une autre fonctionnalité n’est pas touchée par ce sous-budget', (ai_private.runtime_reserve('agent.chat', 'sujet-d', 700) ->> 'ok')::boolean);

  perform ai_private.runtime_settle('agent.chat', (now() at time zone 'utc')::date, date_trunc('month', now() at time zone 'utc')::date, 700, 40,
    '{"requestId":"11111111-1111-4111-8111-111111111111","feature":"agent.chat","provider":"groq","model":"m","subject":"sujet-d","outcome":"ok","latencyMs":10,"inputTokens":5,"outputTokens":6,"costMicroUsd":40}');
  perform test.result('coût ajusté au réel après la réponse',
    (select cost_micro_usd = 40 from public.ai_usage_counters where scope = 'feature:agent.chat' and period = 'day'));
  perform test.result('événement d’usage enregistré, sans contenu',
    (select count(*) = 1 from public.ai_usage_events where feature_id = 'agent.chat' and outcome = 'ok'));
  perform ai_private.runtime_settle('agent.chat', (now() at time zone 'utc')::date, date_trunc('month', now() at time zone 'utc')::date, 40, 0,
    '{"requestId":"22222222-2222-4222-8222-222222222222","feature":"agent.chat","outcome":"error","code":"unavailable"}');
  perform test.result('échec du fournisseur : réservation rendue',
    (select cost_micro_usd = 0 from public.ai_usage_counters where scope = 'feature:agent.chat' and period = 'day'));

  perform test.admin_do($q$select public.ai_admin_save_budget(1000, 1000000, 8)$q$);
  j := ai_private.runtime_reserve('latex.improve', 'sujet-e', 2000);
  perform test.result('budget global journalier dépassé', j ->> 'code' = 'AI_BUDGET_EXCEEDED' and j ->> 'scope' = 'global_day');
  perform test.admin_do($q$select public.ai_admin_save_budget(5000000, 1000, 8)$q$);
  j := ai_private.runtime_reserve('latex.improve', 'sujet-e', 2000);
  perform test.result('budget global mensuel dépassé', j ->> 'code' = 'AI_BUDGET_EXCEEDED' and j ->> 'scope' = 'global_month');
  perform test.result('budget négatif refusé', test.admin_do($q$select public.ai_admin_save_budget(-1, 10, 8)$q$) like '%ai_invalid_budget%');
  perform test.admin_do($q$select public.ai_admin_save_budget(5000000, 30000000, 8)$q$);

  -- ── Registre du code ──
  perform ai_private.runtime_sync_features('[{"id":"cv.translate","section":"CV Generator","requiredCapabilities":["text","json"],"output":"json","authLevel":"public","personalData":true,"promptVersion":"cv.v1","maxOutputTokens":1000,"timeoutMs":30000,"rateLimitPerMinute":6,"quotas":{"perSubjectPerDay":3,"globalPerDay":50,"concurrency":2}}]');
  perform test.result('nouvelle fonctionnalité du code : désactivée, sans modèle',
    (select not enabled and model_id is null from public.ai_feature_assignments where feature_id = 'cv.translate'));
  perform test.result('et visible dans le dashboard', test.admin_do(c) is null);

  -- ── Audit ──
  perform test.result('toute écriture est auditée', (select count(*) > 25 from public.ai_config_audit));
  perform test.result('audit : modification impossible, même pour le propriétaire', test.try_as('postgres', null, 'update public.ai_config_audit set action = ''x''') like '%ai_audit_append_only%');
  perform test.result('audit : suppression impossible, même pour le propriétaire', test.try_as('postgres', null, 'delete from public.ai_config_audit') like '%ai_audit_append_only%');
  perform test.result('lecture de l’audit', test.admin_do('select public.ai_admin_audit(10, null)') is null);
  perform test.result('lecture des statistiques', test.admin_do('select public.ai_admin_usage(30)') is null);
  perform test.result('lecture du catalogue', test.admin_do($q$select public.ai_admin_models('openai')$q$) is null);
end $$;
