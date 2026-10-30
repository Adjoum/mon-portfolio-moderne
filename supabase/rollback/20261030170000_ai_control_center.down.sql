-- Retour arrière du centre d'administration multi-IA (quatre migrations 20261030170*).
-- ⚠️ Supprime la configuration, les statistiques et les clés stockées dans Vault.

do $$
declare
  f record;
  r record;
begin
  -- Clés fournisseurs : retirées de Vault avant la disparition de leurs références
  if to_regclass('ai_private.provider_secret_refs') is not null then
    for r in execute 'select secret_id from ai_private.provider_secret_refs' loop
      delete from vault.secrets where id = r.secret_id;
    end loop;
  end if;

  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'ai\_admin\_%'
  loop
    execute format('drop function %s', f.sig);
  end loop;
end $$;

drop table if exists public.ai_config_audit;
drop table if exists public.ai_usage_events;
drop table if exists public.ai_usage_counters;
drop table if exists public.ai_settings;
drop table if exists public.ai_quota_rules;
drop table if exists public.ai_feature_assignments;
drop table if exists public.ai_model_feature_compat;
drop table if exists public.ai_model_pricing;
drop table if exists public.ai_model_exclusions;
drop table if exists public.ai_models;
drop table if exists public.ai_features;
drop table if exists ai_private.provider_secret_refs;
drop table if exists public.ai_providers;

drop schema if exists ai_private cascade;

-- Le schéma ai_private portait tous ses droits : plus rien ne le retient
drop role if exists ai_backend;
