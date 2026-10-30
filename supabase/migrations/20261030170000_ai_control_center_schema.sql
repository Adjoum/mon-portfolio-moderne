-- Centre d'administration multi-IA : schéma (doc 16 §5).
-- NON APPLIQUÉE EN PRODUCTION. Prérequis : migrations P0.A1 (is_portfolio_admin_mfa).
--
-- Deux chemins, aucune clé service_role :
--   écriture (admin)   : blog-api transmet le jeton de l'administrateur ; les fonctions
--                        ai_admin_* revérifient admin + MFA et auditent dans la même transaction
--   exécution (public) : blog-api se connecte avec le rôle restreint ai_backend, qui n'a
--                        accès à AUCUNE table : uniquement aux fonctions ai_private.runtime_*
--
-- Le rôle ai_backend est créé sans connexion : son mot de passe n'apparaît dans aucun
-- fichier. Il est défini à la main (voir docs/cv-generator-audit/17-*).

create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ai_backend') then
    create role ai_backend nologin noinherit;
  end if;
end $$;

-- Schéma non exposé par PostgREST
create schema if not exists ai_private;
revoke all on schema ai_private from public, anon, authenticated, service_role;
grant usage on schema ai_private to ai_backend;

-- ── Fournisseurs (six lignes fixes) ─────────────────────────
create table if not exists public.ai_providers (
  id                   text primary key check (id in ('openai','groq','xai','gemini','openrouter','anthropic')),
  display_name         text not null,
  enabled              boolean not null default false,
  key_status           text not null default 'not_configured' check (key_status in ('not_configured','valid','invalid')),
  key_fingerprint      text check (key_fingerprint is null or key_fingerprint ~ '^[0-9a-f]{16}$'),
  key_updated_at       timestamptz,
  last_check_at        timestamptz,
  last_check_ok        boolean,
  last_check_code      text,
  last_sync_at         timestamptz,   -- dernière synchronisation RÉUSSIE
  last_sync_attempt_at timestamptz,
  last_sync_ok         boolean,
  last_sync_code       text,
  last_sync_count      integer,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  constraint ai_providers_enabled_needs_key check (not enabled or key_status = 'valid')
);

-- Référence Vault : hors de toute table lue par le dashboard
create table if not exists ai_private.provider_secret_refs (
  provider_id text primary key references public.ai_providers(id) on delete cascade,
  secret_id   uuid not null
);

-- ── Fonctionnalités (définies dans le code, synchronisées au démarrage) ──
create table if not exists public.ai_features (
  id                    text primary key check (id ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  section               text not null,
  required_capabilities text[] not null default '{text}',
  output_format         text not null default 'text' check (output_format in ('text','json')),
  auth_level            text not null default 'public' check (auth_level in ('public','admin')),
  personal_data         boolean not null default false,
  prompt_version        text not null default '',
  default_max_output_tokens integer not null check (default_max_output_tokens between 1 and 200000),
  default_timeout_ms    integer not null check (default_timeout_ms between 1000 and 180000),
  synced_at             timestamptz not null default now()
);

-- ── Catalogue des modèles ───────────────────────────────────
create table if not exists public.ai_models (
  provider_id       text not null references public.ai_providers(id),
  model_id          text not null check (length(model_id) between 1 and 200),
  origin            text not null check (origin in ('official','manual','seed')),
  status            text not null default 'unverified'
                    check (status in ('available','unverified','incompatible','deprecated','disabled')),
  display_name      text,
  context_window    integer,
  max_output_tokens integer,
  vision            boolean,          -- null : le catalogue ne le dit pas
  shutdown_date     date,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz,      -- dernière présence dans le catalogue officiel
  last_verified_at  timestamptz,      -- dernière sonde réussie
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  primary key (provider_id, model_id)
);

-- Marqueur d'exclusion : un modèle supprimé n'existe plus dans ai_models, mais la
-- synchronisation sait qu'elle ne doit pas le réintroduire
create table if not exists public.ai_model_exclusions (
  provider_id text not null references public.ai_providers(id),
  model_id    text not null check (length(model_id) between 1 and 200),
  origin      text not null check (origin in ('official','manual','seed')),
  excluded_at timestamptz not null default now(),
  excluded_by uuid,
  primary key (provider_id, model_id)
);

-- Tarifs : estimation des coûts, jamais une facture
create table if not exists public.ai_model_pricing (
  provider_id text not null,
  model_id    text not null,
  input_per_mtok_micro_usd  bigint not null check (input_per_mtok_micro_usd >= 0),
  output_per_mtok_micro_usd bigint not null check (output_per_mtok_micro_usd >= 0),
  source      text not null check (source in ('seed','catalog','admin')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (provider_id, model_id),
  foreign key (provider_id, model_id) references public.ai_models(provider_id, model_id) on delete cascade
);

-- Compatibilité par fonctionnalité : preuve par sonde
create table if not exists public.ai_model_feature_compat (
  feature_id  text not null references public.ai_features(id) on delete cascade,
  provider_id text not null,
  model_id    text not null,
  status      text not null check (status in ('compatible','incompatible')),
  validated_capabilities text[] not null default '{}',
  tested_at   timestamptz not null default now(),
  tested_by   uuid,
  result_code text,
  latency_ms  integer,
  primary key (feature_id, provider_id, model_id),
  foreign key (provider_id, model_id) references public.ai_models(provider_id, model_id) on delete cascade
);

-- ── Affectations : une ligne par fonctionnalité, indépendantes ──
create table if not exists public.ai_feature_assignments (
  feature_id        text primary key references public.ai_features(id) on delete cascade,
  provider_id       text not null references public.ai_providers(id),
  model_id          text,
  enabled           boolean not null default false,
  params            jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  max_output_tokens integer not null check (max_output_tokens between 1 and 200000),
  timeout_ms        integer not null check (timeout_ms between 1000 and 180000),
  version           integer not null default 1,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  -- ON DELETE RESTRICT : un modèle affecté ne peut pas disparaître, même en concurrence
  constraint ai_assignments_model_fk foreign key (provider_id, model_id)
    references public.ai_models(provider_id, model_id) on delete restrict,
  constraint ai_assignments_enabled_needs_model check (not enabled or model_id is not null)
);

-- ── Quotas et sous-budgets par fonctionnalité ───────────────
create table if not exists public.ai_quota_rules (
  feature_id               text primary key references public.ai_features(id) on delete cascade,
  per_subject_per_day      integer not null check (per_subject_per_day between 0 and 1000000),
  global_per_day           integer not null check (global_per_day between 0 and 10000000),
  per_minute               integer not null check (per_minute between 1 and 10000),
  concurrency              integer not null check (concurrency between 1 and 100),
  daily_budget_micro_usd   bigint check (daily_budget_micro_usd is null or daily_budget_micro_usd >= 0),
  monthly_budget_micro_usd bigint check (monthly_budget_micro_usd is null or monthly_budget_micro_usd >= 0),
  version                  integer not null default 1,
  updated_at               timestamptz not null default now(),
  updated_by               uuid
);

-- Paramètres globaux : budget, concurrence
create table if not exists public.ai_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ── Compteurs atomiques (persistants : survivent aux redémarrages) ──
create table if not exists public.ai_usage_counters (
  scope          text not null,   -- 'global', 'feature:<id>' ou 'subject:<id>:<hmac>'
  period         text not null check (period in ('day','month')),
  period_start   date not null,
  requests       integer not null default 0,
  cost_micro_usd bigint not null default 0,
  primary key (scope, period, period_start)
);

-- Journal d'utilisation : AUCUN prompt, AUCUNE réponse, AUCUNE IP en clair
create table if not exists public.ai_usage_events (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  request_id   uuid not null,
  kind         text not null default 'run' check (kind in ('run','probe')),
  feature_id   text not null,
  provider_id  text,
  model_id     text,
  subject_hash text,
  outcome      text not null check (outcome in ('ok','error','blocked')),
  code         text,
  latency_ms   integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_micro_usd bigint
);
create index if not exists ai_usage_events_at_idx on public.ai_usage_events (at desc);
create index if not exists ai_usage_events_feature_idx on public.ai_usage_events (feature_id, at desc);

-- Journal d'audit : ajout seul
create table if not exists public.ai_config_audit (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid not null,
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  before      jsonb,
  after       jsonb       -- secrets EXCLUS : seule l'empreinte figure pour une clé
);
create index if not exists ai_config_audit_at_idx on public.ai_config_audit (id desc);

create or replace function ai_private.audit_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'ai_audit_append_only' using errcode = '42501';
end $$;

drop trigger if exists ai_config_audit_append_only on public.ai_config_audit;
create trigger ai_config_audit_append_only
  before update or delete or truncate on public.ai_config_audit
  for each statement execute function ai_private.audit_is_append_only();

-- ── RLS : tout est fermé. Aucune politique : seules les fonctions contrôlées y accèdent ──
do $$
declare t text;
begin
  foreach t in array array[
    'ai_providers','ai_features','ai_models','ai_model_exclusions','ai_model_pricing',
    'ai_model_feature_compat','ai_feature_assignments','ai_quota_rules','ai_settings',
    'ai_usage_counters','ai_usage_events','ai_config_audit'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

alter table ai_private.provider_secret_refs enable row level security;
revoke all on table ai_private.provider_secret_refs from public, anon, authenticated, service_role;
