-- Retour arrière de 20261101120000_ai_probe_details.sql.
-- Les résultats « config_error » ne sont pas des conclusions sur un modèle : ils sont retirés.
-- Les autres résultats de sonde sont conservés ; seuls leurs détails disparaissent.

delete from public.ai_model_feature_compat where status = 'config_error';
drop function if exists public.ai_admin_record_compat(text, text, text, text, text[], text, integer, text, jsonb);

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

alter table public.ai_model_feature_compat drop constraint if exists ai_model_feature_compat_details_check;
alter table public.ai_model_feature_compat drop constraint if exists ai_model_feature_compat_failed_capability_check;
alter table public.ai_model_feature_compat drop column if exists details;
alter table public.ai_model_feature_compat drop column if exists failed_capability;
alter table public.ai_model_feature_compat drop constraint if exists ai_model_feature_compat_status_check;
alter table public.ai_model_feature_compat
  add constraint ai_model_feature_compat_status_check check (status in ('compatible', 'incompatible'));

revoke all on function public.ai_admin_record_compat(text, text, text, text, text[], text, integer) from public, anon, authenticated, service_role;
grant execute on function public.ai_admin_record_compat(text, text, text, text, text[], text, integer) to authenticated;
revoke all on function public.ai_admin_overview() from public, anon, authenticated, service_role;
grant execute on function public.ai_admin_overview() to authenticated;
revoke all on function public.ai_admin_models(text) from public, anon, authenticated, service_role;
grant execute on function public.ai_admin_models(text) to authenticated;
