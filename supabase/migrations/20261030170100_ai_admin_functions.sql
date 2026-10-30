-- Centre d'administration multi-IA : fonctions d'administration.
-- NON APPLIQUÉE EN PRODUCTION.
--
-- Appelées par blog-api avec le jeton de l'administrateur (jamais service_role). Chacune
-- revérifie admin + MFA en base, puis écrit et audite dans la même transaction : en cas
-- d'échec, la configuration précédente reste en place.
-- Une clé API n'entre ici qu'en paramètre lié : jamais en littéral SQL (doc 16 §5.3).

-- ── Contrôles communs ───────────────────────────────────────
create or replace function ai_private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_portfolio_admin_mfa() then
    raise exception 'ai_forbidden' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function ai_private.audit(
  p_actor uuid, p_action text, p_type text, p_id text, p_before jsonb, p_after jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.ai_config_audit (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor, p_action, p_type, p_id, p_before, p_after);
$$;

create or replace function ai_private.valid_model_id(p_id text) returns boolean
language sql immutable set search_path = '' as $$
  select p_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
     and p_id !~ '//'
     and p_id !~ '/$'
     and not ('..' = any (string_to_array(p_id, '/')));
$$;

-- Première raison empêchant une fonctionnalité de s'exécuter (null : prête).
-- Partagée par l'enregistrement et par l'exécution : une seule définition de « prête ».
create or replace function ai_private.activation_blocker(p_feature text, p_provider text, p_model text)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_key_status text;
  v_enabled    boolean;
  v_status     text;
  v_required   text[];
  v_compat     text;
  v_validated  text[];
begin
  if p_model is null then return 'no_model'; end if;

  select key_status, enabled into v_key_status, v_enabled from public.ai_providers where id = p_provider;
  if v_key_status is distinct from 'valid' then return 'key_missing'; end if;
  if not v_enabled then return 'provider_disabled'; end if;

  select status into v_status from public.ai_models where provider_id = p_provider and model_id = p_model;
  if v_status is null or v_status in ('disabled', 'incompatible') then return 'model_unavailable'; end if;

  select required_capabilities into v_required from public.ai_features where id = p_feature;
  select status, validated_capabilities into v_compat, v_validated
    from public.ai_model_feature_compat
   where feature_id = p_feature and provider_id = p_provider and model_id = p_model;
  if v_compat is distinct from 'compatible' or not (v_required <@ v_validated) then return 'not_validated'; end if;

  if not exists (select 1 from public.ai_model_pricing where provider_id = p_provider and model_id = p_model) then
    return 'unpriced';
  end if;
  return null;
end $$;

-- ── Lectures du dashboard ───────────────────────────────────
create or replace function public.ai_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_day   date := (now() at time zone 'utc')::date;
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
begin
  perform ai_private.require_admin();
  return jsonb_build_object(
    'providers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'displayName', p.display_name, 'enabled', p.enabled, 'keyStatus', p.key_status,
        'keyFingerprint', p.key_fingerprint, 'keyUpdatedAt', p.key_updated_at,
        'lastCheckAt', p.last_check_at, 'lastCheckOk', p.last_check_ok, 'lastCheckCode', p.last_check_code,
        'lastSyncAt', p.last_sync_at, 'lastSyncAttemptAt', p.last_sync_attempt_at, 'lastSyncOk', p.last_sync_ok,
        'lastSyncCode', p.last_sync_code, 'lastSyncCount', p.last_sync_count,
        'modelCount', (select count(*) from public.ai_models m where m.provider_id = p.id),
        'assignedCount', (select count(*) from public.ai_feature_assignments a where a.provider_id = p.id and a.enabled)
      ) order by p.display_name), '[]'::jsonb)
      from public.ai_providers p
    ),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'section', f.section, 'requiredCapabilities', to_jsonb(f.required_capabilities),
        'output', f.output_format, 'personalData', f.personal_data,
        'providerId', a.provider_id, 'modelId', a.model_id, 'enabled', a.enabled, 'params', a.params,
        'maxOutputTokens', a.max_output_tokens, 'timeoutMs', a.timeout_ms, 'version', a.version, 'updatedAt', a.updated_at,
        'blocker', ai_private.activation_blocker(f.id, a.provider_id, a.model_id),
        'compat', (
          select jsonb_build_object('status', c.status, 'capabilities', to_jsonb(c.validated_capabilities),
                                    'testedAt', c.tested_at, 'code', c.result_code, 'latencyMs', c.latency_ms)
            from public.ai_model_feature_compat c
           where c.feature_id = f.id and c.provider_id = a.provider_id and c.model_id = a.model_id
        ),
        'quotas', jsonb_build_object(
          'perSubjectPerDay', q.per_subject_per_day, 'globalPerDay', q.global_per_day, 'perMinute', q.per_minute,
          'concurrency', q.concurrency, 'dailyBudgetMicroUsd', q.daily_budget_micro_usd,
          'monthlyBudgetMicroUsd', q.monthly_budget_micro_usd, 'version', q.version
        ),
        'usage', jsonb_build_object(
          'dayRequests', coalesce((select requests from public.ai_usage_counters u where u.scope = 'feature:' || f.id and u.period = 'day' and u.period_start = v_day), 0),
          'dayCostMicroUsd', coalesce((select cost_micro_usd from public.ai_usage_counters u where u.scope = 'feature:' || f.id and u.period = 'day' and u.period_start = v_day), 0),
          'monthCostMicroUsd', coalesce((select cost_micro_usd from public.ai_usage_counters u where u.scope = 'feature:' || f.id and u.period = 'month' and u.period_start = v_month), 0)
        )
      ) order by f.section, f.id), '[]'::jsonb)
      from public.ai_features f
      join public.ai_feature_assignments a on a.feature_id = f.id
      join public.ai_quota_rules q on q.feature_id = f.id
    ),
    'budget', jsonb_build_object(
      'dailyLimitMicroUsd', (select (value #>> '{}')::bigint from public.ai_settings where key = 'daily_budget_micro_usd'),
      'monthlyLimitMicroUsd', (select (value #>> '{}')::bigint from public.ai_settings where key = 'monthly_budget_micro_usd'),
      'globalConcurrency', (select (value #>> '{}')::int from public.ai_settings where key = 'global_concurrency'),
      'dayCostMicroUsd', coalesce((select cost_micro_usd from public.ai_usage_counters where scope = 'global' and period = 'day' and period_start = v_day), 0),
      'monthCostMicroUsd', coalesce((select cost_micro_usd from public.ai_usage_counters where scope = 'global' and period = 'month' and period_start = v_month), 0),
      'dayRequests', coalesce((select requests from public.ai_usage_counters where scope = 'global' and period = 'day' and period_start = v_day), 0)
    )
  );
end $$;

create or replace function public.ai_admin_models(p_provider text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform ai_private.require_admin();
  return jsonb_build_object(
    'models', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'modelId', m.model_id, 'origin', m.origin, 'status', m.status, 'displayName', m.display_name,
        'contextWindow', m.context_window, 'maxOutputTokens', m.max_output_tokens, 'vision', m.vision,
        'shutdownDate', m.shutdown_date, 'firstSeenAt', m.first_seen_at, 'lastSeenAt', m.last_seen_at,
        'lastVerifiedAt', m.last_verified_at,
        'pricing', (
          select jsonb_build_object('inputPerMTok', r.input_per_mtok_micro_usd, 'outputPerMTok', r.output_per_mtok_micro_usd, 'source', r.source)
            from public.ai_model_pricing r where r.provider_id = m.provider_id and r.model_id = m.model_id
        ),
        'usedBy', (
          select coalesce(jsonb_agg(jsonb_build_object('featureId', a.feature_id, 'enabled', a.enabled) order by a.feature_id), '[]'::jsonb)
            from public.ai_feature_assignments a where a.provider_id = m.provider_id and a.model_id = m.model_id
        ),
        'compat', (
          select coalesce(jsonb_agg(jsonb_build_object('featureId', c.feature_id, 'status', c.status, 'testedAt', c.tested_at) order by c.feature_id), '[]'::jsonb)
            from public.ai_model_feature_compat c where c.provider_id = m.provider_id and c.model_id = m.model_id
        )
      ) order by m.model_id), '[]'::jsonb)
      from public.ai_models m where m.provider_id = p_provider
    ),
    'excluded', (
      select coalesce(jsonb_agg(jsonb_build_object('modelId', e.model_id, 'origin', e.origin, 'excludedAt', e.excluded_at) order by e.model_id), '[]'::jsonb)
      from public.ai_model_exclusions e where e.provider_id = p_provider
    )
  );
end $$;

create or replace function public.ai_admin_usage(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90));
begin
  perform ai_private.require_admin();
  return jsonb_build_object(
    'byDay', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'requests', d.requests, 'errors', d.errors, 'costMicroUsd', d.cost) order by d.day), '[]'::jsonb)
      from (
        select (at at time zone 'utc')::date as day, count(*) as requests,
               count(*) filter (where outcome <> 'ok') as errors, coalesce(sum(estimated_cost_micro_usd), 0) as cost
          from public.ai_usage_events where at >= v_since group by 1
      ) d
    ),
    'byFeature', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'featureId', g.feature_id, 'providerId', g.provider_id, 'modelId', g.model_id, 'requests', g.requests, 'errors', g.errors,
        'blocked', g.blocked, 'inputTokens', g.input_tokens, 'outputTokens', g.output_tokens, 'costMicroUsd', g.cost, 'avgLatencyMs', g.latency
      ) order by g.cost desc, g.requests desc), '[]'::jsonb)
      from (
        select feature_id, provider_id, model_id, count(*) as requests,
               count(*) filter (where outcome = 'error') as errors, count(*) filter (where outcome = 'blocked') as blocked,
               coalesce(sum(input_tokens), 0) as input_tokens, coalesce(sum(output_tokens), 0) as output_tokens,
               coalesce(sum(estimated_cost_micro_usd), 0) as cost, round(avg(latency_ms)) as latency
          from public.ai_usage_events where at >= v_since group by 1, 2, 3
      ) g
    ),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', e.at, 'kind', e.kind, 'featureId', e.feature_id, 'providerId', e.provider_id, 'modelId', e.model_id,
        'outcome', e.outcome, 'code', e.code, 'latencyMs', e.latency_ms, 'costMicroUsd', e.estimated_cost_micro_usd
      ) order by e.id desc), '[]'::jsonb)
      from (select * from public.ai_usage_events where at >= v_since order by id desc limit 50) e
    )
  );
end $$;

create or replace function public.ai_admin_audit(p_limit integer, p_before_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform ai_private.require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'at', a.at, 'actorId', a.actor_id, 'action', a.action, 'entityType', a.entity_type,
      'entityId', a.entity_id, 'before', a.before, 'after', a.after
    ) order by a.id desc), '[]'::jsonb)
    from (
      select * from public.ai_config_audit
       where p_before_id is null or id < p_before_id
       order by id desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) a
  );
end $$;

-- ── Clés : Vault uniquement, jamais relisibles par le dashboard ──
create or replace function public.ai_admin_set_provider_key(p_provider text, p_key text, p_fingerprint text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
  v_ref   uuid;
  v_old   text;
  v_first boolean;
begin
  if p_key is null or length(p_key) not between 8 and 2048 then raise exception 'ai_invalid_key'; end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{16}$' then raise exception 'ai_invalid_key'; end if;

  select key_fingerprint, key_status = 'not_configured' into v_old, v_first from public.ai_providers where id = p_provider for update;
  if not found then raise exception 'ai_unknown_provider'; end if;

  select secret_id into v_ref from ai_private.provider_secret_refs where provider_id = p_provider;
  if v_ref is null then
    v_ref := vault.create_secret(p_key, 'ai_provider_' || p_provider, 'Clé API du fournisseur ' || p_provider);
    insert into ai_private.provider_secret_refs (provider_id, secret_id) values (p_provider, v_ref);
  else
    perform vault.update_secret(v_ref, p_key);
  end if;

  update public.ai_providers
     set key_status = 'valid', key_fingerprint = p_fingerprint, key_updated_at = now(),
         enabled = case when v_first then true else enabled end,
         last_check_at = now(), last_check_ok = true, last_check_code = null,
         updated_at = now(), updated_by = v_actor
   where id = p_provider;

  perform ai_private.audit(v_actor, 'provider.key.set', 'provider', p_provider,
    jsonb_build_object('fingerprint', v_old), jsonb_build_object('fingerprint', p_fingerprint));
  return jsonb_build_object('fingerprint', p_fingerprint);
end $$;

create or replace function public.ai_admin_delete_provider_key(p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
  v_ref   uuid;
  v_old   text;
begin
  select key_fingerprint into v_old from public.ai_providers where id = p_provider for update;
  if not found then raise exception 'ai_unknown_provider'; end if;

  delete from ai_private.provider_secret_refs where provider_id = p_provider returning secret_id into v_ref;
  if v_ref is not null then delete from vault.secrets where id = v_ref; end if;

  update public.ai_providers
     set key_status = 'not_configured', key_fingerprint = null, key_updated_at = now(), enabled = false,
         updated_at = now(), updated_by = v_actor
   where id = p_provider;

  perform ai_private.audit(v_actor, 'provider.key.delete', 'provider', p_provider,
    jsonb_build_object('fingerprint', v_old), null);
end $$;

create or replace function public.ai_admin_set_provider_enabled(p_provider text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor  uuid := ai_private.require_admin();
  v_status text;
  v_old    boolean;
begin
  select key_status, enabled into v_status, v_old from public.ai_providers where id = p_provider for update;
  if not found then raise exception 'ai_unknown_provider'; end if;
  if p_enabled and v_status <> 'valid' then raise exception 'ai_provider_without_key'; end if;

  update public.ai_providers set enabled = p_enabled, updated_at = now(), updated_by = v_actor where id = p_provider;
  perform ai_private.audit(v_actor, 'provider.enabled', 'provider', p_provider,
    jsonb_build_object('enabled', v_old), jsonb_build_object('enabled', p_enabled));
end $$;

create or replace function public.ai_admin_record_provider_check(p_provider text, p_ok boolean, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
begin
  update public.ai_providers
     set last_check_at = now(), last_check_ok = p_ok, last_check_code = left(p_code, 60),
         -- Une clé refusée par le fournisseur n'est plus valide ; une panne réseau ne dit rien d'elle
         key_status = case when p_code = 'auth' and key_status = 'valid' then 'invalid'
                           when p_ok and key_status = 'invalid' then 'valid' else key_status end,
         enabled    = case when p_code = 'auth' then false else enabled end
   where id = p_provider;
  if not found then raise exception 'ai_unknown_provider'; end if;
  perform ai_private.audit(v_actor, 'provider.check', 'provider', p_provider, null,
    jsonb_build_object('ok', p_ok, 'code', left(p_code, 60)));
end $$;

-- ── Catalogue ───────────────────────────────────────────────
create or replace function public.ai_admin_sync_models(p_provider text, p_models jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor   uuid := ai_private.require_admin();
  v_item    jsonb;
  v_id      text;
  v_ids     text[] := '{}';
  v_status  text;
  v_shut    date;
  v_active  boolean;
  v_added   integer := 0;
  v_skipped integer := 0;
  v_stale   integer := 0;
  v_exists  boolean;
begin
  if jsonb_typeof(p_models) is distinct from 'array' or jsonb_array_length(p_models) > 5000 then
    raise exception 'ai_invalid_catalog';
  end if;
  perform 1 from public.ai_providers where id = p_provider for update;
  if not found then raise exception 'ai_unknown_provider'; end if;

  for v_item in select * from jsonb_array_elements(p_models) loop
    v_id := v_item ->> 'id';
    if v_id is null or not ai_private.valid_model_id(v_id) then continue; end if;
    v_ids := v_ids || v_id;

    -- Exclusion administrative : un modèle supprimé ne revient pas
    if exists (select 1 from public.ai_model_exclusions where provider_id = p_provider and model_id = v_id) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_shut   := nullif(v_item ->> 'shutdownDate', '')::date;
    v_active := coalesce((v_item ->> 'active')::boolean, true);
    v_status := case when not v_active or v_shut <= (now() at time zone 'utc')::date then 'deprecated' else 'available' end;
    v_exists := exists (select 1 from public.ai_models where provider_id = p_provider and model_id = v_id);

    insert into public.ai_models as m
      (provider_id, model_id, origin, status, display_name, context_window, max_output_tokens, vision, shutdown_date, last_seen_at)
    values (
      p_provider, v_id, 'official', v_status, left(v_item ->> 'displayName', 200),
      (v_item ->> 'contextWindow')::integer, (v_item ->> 'maxCompletionTokens')::integer,
      (v_item ->> 'vision')::boolean, v_shut, now()
    )
    on conflict (provider_id, model_id) do update set
      origin            = case when m.origin = 'manual' then 'manual' else 'official' end,
      -- Une décision de l'administrateur prévaut sur le catalogue
      status            = case when m.status in ('disabled', 'incompatible') then m.status else excluded.status end,
      display_name      = coalesce(excluded.display_name, m.display_name),
      context_window    = coalesce(excluded.context_window, m.context_window),
      max_output_tokens = coalesce(excluded.max_output_tokens, m.max_output_tokens),
      vision            = coalesce(excluded.vision, m.vision),
      shutdown_date     = excluded.shutdown_date,
      last_seen_at      = now(),
      updated_at        = now();

    if not v_exists then v_added := v_added + 1; end if;

    -- Tarif publié par le catalogue, sauf si l'administrateur en a saisi un
    if v_item ? 'pricing' and jsonb_typeof(v_item -> 'pricing') = 'object' then
      insert into public.ai_model_pricing as r (provider_id, model_id, input_per_mtok_micro_usd, output_per_mtok_micro_usd, source)
      values (p_provider, v_id, (v_item #>> '{pricing,inputPerMTok}')::bigint, (v_item #>> '{pricing,outputPerMTok}')::bigint, 'catalog')
      on conflict (provider_id, model_id) do update
        set input_per_mtok_micro_usd = excluded.input_per_mtok_micro_usd,
            output_per_mtok_micro_usd = excluded.output_per_mtok_micro_usd,
            source = 'catalog', updated_at = now()
        where r.source <> 'admin';
    end if;
  end loop;

  -- Disparu du catalogue officiel : signalé, jamais supprimé. Modèles manuels et initiaux intacts.
  update public.ai_models
     set status = 'deprecated', updated_at = now()
   where provider_id = p_provider and origin = 'official' and status = 'available' and not (model_id = any (v_ids));
  get diagnostics v_stale = row_count;

  update public.ai_providers
     set last_sync_at = now(), last_sync_attempt_at = now(), last_sync_ok = true, last_sync_code = null,
         last_sync_count = cardinality(v_ids)
   where id = p_provider;

  perform ai_private.audit(v_actor, 'models.sync', 'provider', p_provider, null,
    jsonb_build_object('received', cardinality(v_ids), 'added', v_added, 'excludedSkipped', v_skipped, 'deprecated', v_stale));
  return jsonb_build_object('received', cardinality(v_ids), 'added', v_added, 'excludedSkipped', v_skipped, 'deprecated', v_stale);
end $$;

-- Échec : la liste existante reste, avec sa vraie date ; seul l'état de la tentative change
create or replace function public.ai_admin_record_sync_failure(p_provider text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
begin
  update public.ai_providers
     set last_sync_attempt_at = now(), last_sync_ok = false, last_sync_code = left(p_code, 60)
   where id = p_provider;
  if not found then raise exception 'ai_unknown_provider'; end if;
  perform ai_private.audit(v_actor, 'models.sync.failed', 'provider', p_provider, null, jsonb_build_object('code', left(p_code, 60)));
end $$;

create or replace function public.ai_admin_add_model(p_provider text, p_model text, p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
begin
  if not ai_private.valid_model_id(p_model) then raise exception 'ai_invalid_model_id'; end if;
  perform 1 from public.ai_providers where id = p_provider;
  if not found then raise exception 'ai_unknown_provider'; end if;
  if exists (select 1 from public.ai_model_exclusions where provider_id = p_provider and model_id = p_model) then
    raise exception 'ai_model_excluded';
  end if;

  insert into public.ai_models (provider_id, model_id, origin, status, display_name, created_by)
  values (p_provider, p_model, 'manual', 'unverified', nullif(left(p_display_name, 200), ''), v_actor)
  on conflict (provider_id, model_id) do nothing;
  if not found then raise exception 'ai_model_exists'; end if;

  perform ai_private.audit(v_actor, 'model.add', 'model', p_provider || ':' || p_model, null, jsonb_build_object('origin', 'manual'));
end $$;

create or replace function public.ai_admin_set_model_disabled(p_provider text, p_model text, p_disabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor  uuid := ai_private.require_admin();
  v_status text;
  v_seen   timestamptz;
  v_active text[];
begin
  select status, last_seen_at into v_status, v_seen from public.ai_models
   where provider_id = p_provider and model_id = p_model for update;
  if not found then raise exception 'ai_model_not_found'; end if;

  if p_disabled then
    select array_agg(feature_id order by feature_id) into v_active from public.ai_feature_assignments
     where provider_id = p_provider and model_id = p_model and enabled;
    if v_active is not null then raise exception 'ai_model_in_use' using detail = array_to_string(v_active, ','); end if;
  end if;

  update public.ai_models
     set status = case when p_disabled then 'disabled' when v_seen is not null then 'available' else 'unverified' end,
         updated_at = now()
   where provider_id = p_provider and model_id = p_model;
  perform ai_private.audit(v_actor, 'model.status', 'model', p_provider || ':' || p_model,
    jsonb_build_object('status', v_status), jsonb_build_object('disabled', p_disabled));
end $$;

-- Suppression réelle de la ligne + marqueur d'exclusion, dans la même transaction
create or replace function public.ai_admin_delete_model(p_provider text, p_model text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor  uuid := ai_private.require_admin();
  v_origin text;
  v_active text[];
begin
  select origin into v_origin from public.ai_models where provider_id = p_provider and model_id = p_model for update;
  if not found then raise exception 'ai_model_not_found'; end if;

  select array_agg(feature_id order by feature_id) into v_active from public.ai_feature_assignments
   where provider_id = p_provider and model_id = p_model and enabled;
  if v_active is not null then raise exception 'ai_model_in_use' using detail = array_to_string(v_active, ','); end if;

  update public.ai_feature_assignments
     set model_id = null, version = version + 1, updated_at = now(), updated_by = v_actor
   where provider_id = p_provider and model_id = p_model;

  delete from public.ai_models where provider_id = p_provider and model_id = p_model;
  insert into public.ai_model_exclusions (provider_id, model_id, origin, excluded_by)
  values (p_provider, p_model, v_origin, v_actor)
  on conflict (provider_id, model_id) do nothing;

  perform ai_private.audit(v_actor, 'model.delete', 'model', p_provider || ':' || p_model,
    jsonb_build_object('origin', v_origin), null);
end $$;

create or replace function public.ai_admin_restore_model(p_provider text, p_model text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor  uuid := ai_private.require_admin();
  v_origin text;
begin
  delete from public.ai_model_exclusions where provider_id = p_provider and model_id = p_model returning origin into v_origin;
  if v_origin is null then raise exception 'ai_model_not_found'; end if;

  -- Revient non vérifié : ses tests de compatibilité ont disparu avec lui
  insert into public.ai_models (provider_id, model_id, origin, status, created_by)
  values (p_provider, p_model, v_origin, 'unverified', v_actor)
  on conflict (provider_id, model_id) do nothing;

  perform ai_private.audit(v_actor, 'model.restore', 'model', p_provider || ':' || p_model, null, jsonb_build_object('origin', v_origin));
end $$;

create or replace function public.ai_admin_set_pricing(p_provider text, p_model text, p_input bigint, p_output bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
begin
  if p_input is null or p_output is null or p_input < 0 or p_output < 0 then raise exception 'ai_invalid_pricing'; end if;
  perform 1 from public.ai_models where provider_id = p_provider and model_id = p_model;
  if not found then raise exception 'ai_model_not_found'; end if;

  insert into public.ai_model_pricing (provider_id, model_id, input_per_mtok_micro_usd, output_per_mtok_micro_usd, source, updated_by)
  values (p_provider, p_model, p_input, p_output, 'admin', v_actor)
  on conflict (provider_id, model_id) do update
    set input_per_mtok_micro_usd = excluded.input_per_mtok_micro_usd,
        output_per_mtok_micro_usd = excluded.output_per_mtok_micro_usd,
        source = 'admin', updated_at = now(), updated_by = v_actor;

  perform ai_private.audit(v_actor, 'model.pricing', 'model', p_provider || ':' || p_model, null,
    jsonb_build_object('inputPerMTok', p_input, 'outputPerMTok', p_output));
end $$;

create or replace function public.ai_admin_record_compat(
  p_feature text, p_provider text, p_model text, p_status text, p_capabilities text[], p_code text, p_latency integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
begin
  if p_status not in ('compatible', 'incompatible') then raise exception 'ai_invalid_status'; end if;
  perform 1 from public.ai_models where provider_id = p_provider and model_id = p_model for update;
  if not found then raise exception 'ai_model_not_found'; end if;

  insert into public.ai_model_feature_compat as c
    (feature_id, provider_id, model_id, status, validated_capabilities, tested_by, result_code, latency_ms)
  values (p_feature, p_provider, p_model, p_status, coalesce(p_capabilities, '{}'), v_actor, left(p_code, 60), p_latency)
  on conflict (feature_id, provider_id, model_id) do update
    set status = excluded.status, validated_capabilities = excluded.validated_capabilities,
        tested_at = now(), tested_by = v_actor, result_code = excluded.result_code, latency_ms = excluded.latency_ms;

  if p_status = 'compatible' then
    update public.ai_models
       set last_verified_at = now(),
           status = case when status = 'unverified' then 'available' else status end,
           updated_at = now()
     where provider_id = p_provider and model_id = p_model;
  end if;

  perform ai_private.audit(v_actor, 'model.test', 'feature', p_feature, null, jsonb_build_object(
    'provider', p_provider, 'model', p_model, 'status', p_status, 'capabilities', to_jsonb(coalesce(p_capabilities, '{}')), 'code', left(p_code, 60)));
end $$;

-- ── Affectations ────────────────────────────────────────────
create or replace function public.ai_admin_save_assignment(
  p_feature text, p_provider text, p_model text, p_params jsonb,
  p_max_output_tokens integer, p_timeout_ms integer, p_enabled boolean, p_expected_version integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor   uuid := ai_private.require_admin();
  v_row     public.ai_feature_assignments;
  v_before  jsonb;
  v_status  text;
  v_blocker text;
begin
  select * into v_row from public.ai_feature_assignments where feature_id = p_feature for update;
  if not found then raise exception 'ai_unknown_feature'; end if;
  if v_row.version <> p_expected_version then raise exception 'ai_conflict'; end if;
  v_before := to_jsonb(v_row) - 'updated_by' - 'updated_at';

  perform 1 from public.ai_providers where id = p_provider;
  if not found then raise exception 'ai_unknown_provider'; end if;

  if p_model is not null then
    select status into v_status from public.ai_models where provider_id = p_provider and model_id = p_model for share;
    if v_status is null or v_status in ('disabled', 'incompatible') then raise exception 'ai_model_unavailable'; end if;
  end if;

  if p_enabled then
    v_blocker := ai_private.activation_blocker(p_feature, p_provider, p_model);
    if v_blocker is not null then raise exception 'ai_activation_blocked' using detail = v_blocker; end if;
  end if;

  update public.ai_feature_assignments
     set provider_id = p_provider, model_id = p_model, params = p_params, max_output_tokens = p_max_output_tokens,
         timeout_ms = p_timeout_ms, enabled = p_enabled, version = version + 1, updated_at = now(), updated_by = v_actor
   where feature_id = p_feature
  returning * into v_row;

  perform ai_private.audit(v_actor, 'assignment.update', 'feature', p_feature, v_before,
    jsonb_build_object('provider', p_provider, 'model', p_model, 'enabled', p_enabled, 'params', p_params,
                       'maxOutputTokens', p_max_output_tokens, 'timeoutMs', p_timeout_ms));
  return jsonb_build_object('version', v_row.version);
end $$;

create or replace function public.ai_admin_save_quotas(
  p_feature text, p_per_subject integer, p_global integer, p_per_minute integer, p_concurrency integer,
  p_daily_budget bigint, p_monthly_budget bigint, p_expected_version integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := ai_private.require_admin();
  v_row   public.ai_quota_rules;
begin
  select * into v_row from public.ai_quota_rules where feature_id = p_feature for update;
  if not found then raise exception 'ai_unknown_feature'; end if;
  if v_row.version <> p_expected_version then raise exception 'ai_conflict'; end if;

  update public.ai_quota_rules
     set per_subject_per_day = p_per_subject, global_per_day = p_global, per_minute = p_per_minute, concurrency = p_concurrency,
         daily_budget_micro_usd = p_daily_budget, monthly_budget_micro_usd = p_monthly_budget,
         version = version + 1, updated_at = now(), updated_by = v_actor
   where feature_id = p_feature;

  perform ai_private.audit(v_actor, 'quota.update', 'feature', p_feature, to_jsonb(v_row) - 'updated_by' - 'updated_at',
    jsonb_build_object('perSubjectPerDay', p_per_subject, 'globalPerDay', p_global, 'perMinute', p_per_minute,
                       'concurrency', p_concurrency, 'dailyBudgetMicroUsd', p_daily_budget, 'monthlyBudgetMicroUsd', p_monthly_budget));
  return jsonb_build_object('version', v_row.version + 1);
end $$;

create or replace function public.ai_admin_save_budget(p_daily bigint, p_monthly bigint, p_concurrency integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor  uuid := ai_private.require_admin();
  v_before jsonb;
begin
  if p_daily is null or p_monthly is null or p_daily < 0 or p_monthly < 0 or p_concurrency not between 1 and 100 then
    raise exception 'ai_invalid_budget';
  end if;
  select jsonb_object_agg(key, value) into v_before from public.ai_settings;

  insert into public.ai_settings (key, value, updated_by) values
    ('daily_budget_micro_usd', to_jsonb(p_daily), v_actor),
    ('monthly_budget_micro_usd', to_jsonb(p_monthly), v_actor),
    ('global_concurrency', to_jsonb(p_concurrency), v_actor)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = v_actor;

  perform ai_private.audit(v_actor, 'budget.update', 'settings', 'budget', v_before,
    jsonb_build_object('daily_budget_micro_usd', p_daily, 'monthly_budget_micro_usd', p_monthly, 'global_concurrency', p_concurrency));
end $$;

-- ── Droits : tout est retiré, puis accordé fonction par fonction ──
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'ai_private') or (n.nspname = 'public' and p.proname like 'ai\_admin\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
