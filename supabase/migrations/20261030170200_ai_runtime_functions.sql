-- Centre d'administration multi-IA : fonctions d'exécution, réservées au rôle ai_backend.
-- NON APPLIQUÉE EN PRODUCTION.
--
-- ai_backend n'a aucun droit sur les tables : ces fonctions sont son seul accès. Elles sont
-- dans un schéma non exposé par PostgREST. Budget et quotas sont réservés de façon atomique
-- AVANT l'appel au fournisseur, puis ajustés au coût réel.

create or replace function ai_private.runtime_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings', jsonb_build_object(
      'dailyBudgetMicroUsd', (select (value #>> '{}')::bigint from public.ai_settings where key = 'daily_budget_micro_usd'),
      'monthlyBudgetMicroUsd', (select (value #>> '{}')::bigint from public.ai_settings where key = 'monthly_budget_micro_usd'),
      'globalConcurrency', (select (value #>> '{}')::int from public.ai_settings where key = 'global_concurrency')
    ),
    'features', coalesce((
      select jsonb_object_agg(a.feature_id, jsonb_build_object(
        'provider', a.provider_id, 'model', a.model_id, 'enabled', a.enabled, 'params', a.params,
        'maxOutputTokens', a.max_output_tokens, 'timeoutMs', a.timeout_ms,
        'blocker', ai_private.activation_blocker(a.feature_id, a.provider_id, a.model_id),
        'pricing', (
          select jsonb_build_object('inputPerMTok', r.input_per_mtok_micro_usd, 'outputPerMTok', r.output_per_mtok_micro_usd)
            from public.ai_model_pricing r where r.provider_id = a.provider_id and r.model_id = a.model_id
        ),
        'quotas', jsonb_build_object('perMinute', q.per_minute, 'concurrency', q.concurrency)
      ))
      from public.ai_feature_assignments a
      join public.ai_quota_rules q on q.feature_id = a.feature_id
    ), '{}'::jsonb)
  );
$$;

create or replace function ai_private.runtime_secret(p_provider text) returns text
language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret
    from ai_private.provider_secret_refs r
    join vault.decrypted_secrets d on d.id = r.secret_id
    join public.ai_providers p on p.id = r.provider_id
   where r.provider_id = p_provider and p.key_status = 'valid' and p.enabled;
$$;

-- Clé d'un fournisseur désactivé incluse : sert uniquement à vérifier ou synchroniser depuis l'API admin
create or replace function ai_private.runtime_admin_secret(p_provider text) returns text
language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret
    from ai_private.provider_secret_refs r
    join vault.decrypted_secrets d on d.id = r.secret_id
   where r.provider_id = p_provider;
$$;

create or replace function ai_private.counter_value(p_scope text, p_period text, p_start date, out requests integer, out cost bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.requests from public.ai_usage_counters c where c.scope = p_scope and c.period = p_period and c.period_start = p_start), 0),
         coalesce((select c.cost_micro_usd from public.ai_usage_counters c where c.scope = p_scope and c.period = p_period and c.period_start = p_start), 0::bigint);
$$;

create or replace function ai_private.counter_add(p_scope text, p_period text, p_start date, p_requests integer, p_cost bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.ai_usage_counters as c (scope, period, period_start, requests, cost_micro_usd)
  values (p_scope, p_period, p_start, greatest(p_requests, 0), greatest(p_cost, 0))
  on conflict (scope, period, period_start) do update
    set requests = c.requests + p_requests, cost_micro_usd = greatest(c.cost_micro_usd + p_cost, 0);
$$;

-- Tout ou rien : aucun compteur n'est modifié si une seule limite est atteinte.
-- Le verrou sérialise les réservations : deux visiteurs ne peuvent pas dépasser ensemble le budget.
create or replace function ai_private.runtime_reserve(p_feature text, p_subject text, p_cost bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now     timestamp := now() at time zone 'utc';
  v_day     date := v_now::date;
  v_month   date := date_trunc('month', v_now)::date;
  v_q       public.ai_quota_rules;
  v_feature text := 'feature:' || p_feature;
  v_subject text := 'subject:' || p_feature || ':' || p_subject;
  v_daily   bigint;
  v_monthly bigint;
  v_to_day  integer := extract(epoch from (v_day + 1)::timestamp - v_now)::integer + 1;
  v_to_month integer := extract(epoch from (v_month + interval '1 month') - v_now)::integer + 1;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage_counters'));

  select * into v_q from public.ai_quota_rules where feature_id = p_feature;
  if not found then return jsonb_build_object('ok', false, 'code', 'AI_FEATURE_UNAVAILABLE', 'scope', 'feature'); end if;

  if (ai_private.counter_value(v_subject, 'day', v_day)).requests >= v_q.per_subject_per_day then
    return jsonb_build_object('ok', false, 'code', 'AI_QUOTA_EXCEEDED', 'scope', 'subject', 'retryAfter', v_to_day);
  end if;
  if (ai_private.counter_value(v_feature, 'day', v_day)).requests >= v_q.global_per_day then
    return jsonb_build_object('ok', false, 'code', 'AI_QUOTA_EXCEEDED', 'scope', 'global', 'retryAfter', v_to_day);
  end if;

  select (value #>> '{}')::bigint into v_daily from public.ai_settings where key = 'daily_budget_micro_usd';
  select (value #>> '{}')::bigint into v_monthly from public.ai_settings where key = 'monthly_budget_micro_usd';

  if v_q.daily_budget_micro_usd is not null and (ai_private.counter_value(v_feature, 'day', v_day)).cost + p_cost > v_q.daily_budget_micro_usd then
    return jsonb_build_object('ok', false, 'code', 'AI_BUDGET_EXCEEDED', 'scope', 'feature_day', 'retryAfter', v_to_day);
  end if;
  if v_q.monthly_budget_micro_usd is not null and (ai_private.counter_value(v_feature, 'month', v_month)).cost + p_cost > v_q.monthly_budget_micro_usd then
    return jsonb_build_object('ok', false, 'code', 'AI_BUDGET_EXCEEDED', 'scope', 'feature_month', 'retryAfter', v_to_month);
  end if;
  -- Budget global absent : aucun appel (refus par défaut)
  if v_daily is null or (ai_private.counter_value('global', 'day', v_day)).cost + p_cost > v_daily then
    return jsonb_build_object('ok', false, 'code', 'AI_BUDGET_EXCEEDED', 'scope', 'global_day', 'retryAfter', v_to_day);
  end if;
  if v_monthly is null or (ai_private.counter_value('global', 'month', v_month)).cost + p_cost > v_monthly then
    return jsonb_build_object('ok', false, 'code', 'AI_BUDGET_EXCEEDED', 'scope', 'global_month', 'retryAfter', v_to_month);
  end if;

  perform ai_private.counter_add(v_subject, 'day', v_day, 1, 0);
  perform ai_private.counter_add(v_feature, 'day', v_day, 1, p_cost);
  perform ai_private.counter_add(v_feature, 'month', v_month, 1, p_cost);
  perform ai_private.counter_add('global', 'day', v_day, 1, p_cost);
  perform ai_private.counter_add('global', 'month', v_month, 1, p_cost);
  return jsonb_build_object('ok', true, 'day', v_day, 'month', v_month);
end $$;

create or replace function ai_private.insert_event(p_event jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.ai_usage_events
    (request_id, kind, feature_id, provider_id, model_id, subject_hash, outcome, code, latency_ms, input_tokens, output_tokens, estimated_cost_micro_usd)
  values (
    (p_event ->> 'requestId')::uuid, coalesce(p_event ->> 'kind', 'run'), p_event ->> 'feature', p_event ->> 'provider', p_event ->> 'model',
    p_event ->> 'subject', p_event ->> 'outcome', left(p_event ->> 'code', 60), (p_event ->> 'latencyMs')::integer,
    (p_event ->> 'inputTokens')::integer, (p_event ->> 'outputTokens')::integer, (p_event ->> 'costMicroUsd')::bigint
  );
$$;

-- Remplace le montant réservé par le coût estimé réel (0 si le fournisseur n'a rien facturé)
create or replace function ai_private.runtime_settle(
  p_feature text, p_day date, p_month date, p_reserved bigint, p_actual bigint, p_event jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_delta bigint := p_actual - p_reserved;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage_counters'));
  perform ai_private.counter_add('feature:' || p_feature, 'day', p_day, 0, v_delta);
  perform ai_private.counter_add('feature:' || p_feature, 'month', p_month, 0, v_delta);
  perform ai_private.counter_add('global', 'day', p_day, 0, v_delta);
  perform ai_private.counter_add('global', 'month', p_month, 0, v_delta);
  perform ai_private.insert_event(p_event);
end $$;

create or replace function ai_private.runtime_record_event(p_event jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform ai_private.insert_event(p_event);
end $$;

-- Sonde lancée par l'administrateur : son coût estimé compte dans le budget
create or replace function ai_private.runtime_record_probe(p_feature text, p_cost bigint, p_event jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_now   timestamp := now() at time zone 'utc';
  v_day   date := v_now::date;
  v_month date := date_trunc('month', v_now)::date;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage_counters'));
  perform ai_private.counter_add('feature:' || p_feature, 'day', v_day, 0, p_cost);
  perform ai_private.counter_add('feature:' || p_feature, 'month', v_month, 0, p_cost);
  perform ai_private.counter_add('global', 'day', v_day, 0, p_cost);
  perform ai_private.counter_add('global', 'month', v_month, 0, p_cost);
  perform ai_private.insert_event(p_event);
end $$;

-- Registre du code → base, au démarrage. Une nouvelle fonctionnalité apparaît désactivée,
-- sans modèle : elle ne peut rien exécuter tant que l'administrateur ne l'a pas configurée.
create or replace function ai_private.runtime_sync_features(p_features jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(p_features) loop
    insert into public.ai_features as f
      (id, section, required_capabilities, output_format, auth_level, personal_data, prompt_version,
       default_max_output_tokens, default_timeout_ms, synced_at)
    values (
      v_item ->> 'id', v_item ->> 'section',
      array(select jsonb_array_elements_text(v_item -> 'requiredCapabilities')),
      v_item ->> 'output', v_item ->> 'authLevel', (v_item ->> 'personalData')::boolean, v_item ->> 'promptVersion',
      (v_item ->> 'maxOutputTokens')::integer, (v_item ->> 'timeoutMs')::integer, now()
    )
    on conflict (id) do update set
      section = excluded.section, required_capabilities = excluded.required_capabilities,
      output_format = excluded.output_format, auth_level = excluded.auth_level, personal_data = excluded.personal_data,
      prompt_version = excluded.prompt_version, default_max_output_tokens = excluded.default_max_output_tokens,
      default_timeout_ms = excluded.default_timeout_ms, synced_at = now();

    insert into public.ai_feature_assignments (feature_id, provider_id, max_output_tokens, timeout_ms)
    values (v_item ->> 'id', 'openai', (v_item ->> 'maxOutputTokens')::integer, (v_item ->> 'timeoutMs')::integer)
    on conflict (feature_id) do nothing;

    insert into public.ai_quota_rules (feature_id, per_subject_per_day, global_per_day, per_minute, concurrency)
    values (
      v_item ->> 'id', (v_item #>> '{quotas,perSubjectPerDay}')::integer, (v_item #>> '{quotas,globalPerDay}')::integer,
      (v_item ->> 'rateLimitPerMinute')::integer, (v_item #>> '{quotas,concurrency}')::integer
    )
    on conflict (feature_id) do nothing;
  end loop;

  -- Rétention (D-IA-09) : 90 jours d'événements, 400 jours de compteurs
  delete from public.ai_usage_events where at < now() - interval '90 days';
  delete from public.ai_usage_counters where period_start < (now() - interval '400 days')::date;
end $$;

-- ── Droits ──────────────────────────────────────────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'ai_private'
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
    if f.proname like 'runtime\_%' then
      execute format('grant execute on function %s to ai_backend', f.sig);
    end if;
  end loop;
end $$;
