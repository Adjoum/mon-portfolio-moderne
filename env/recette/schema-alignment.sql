-- Recette locale UNIQUEMENT (scripts/recette.mjs up, à chaque démarrage) — jamais en production.
--
-- La base de recette part de supabase/tests/rls/10_production_like_state.sql, dont la version
-- d'origine simplifiait les tables AI Lab : sans createdat, updatedat, technologies, color…
-- Le dashboard trie pourtant par createdat (AILabManager.tsx) : « column ailab_capabilities.createdat
-- does not exist ». Le schéma réel est celui de src/lib/supabase.ts, confirmé en production par les
-- déclencheurs set_updatedat que signale le Security Advisor (doc 19 §5).
--
-- Ce script aligne une base de recette déjà créée, sans rien effacer (comptes, TOTP et clés Vault
-- conservés). Idempotent : sans effet sur une base créée après la correction de l'état initial.

alter table public.ailab_capabilities
  add column if not exists createdat timestamptz not null default now(),
  add column if not exists updatedat timestamptz not null default now();

alter table public.ailab_projects
  add column if not exists technologies  text[]  not null default '{}',
  add column if not exists color         text    not null default 'from-blue-500 to-cyan-500',
  add column if not exists imageurl      text,
  add column if not exists githuburl     text,
  add column if not exists liveurl       text,
  add column if not exists demourl       text,
  add column if not exists demoavailable boolean not null default false,
  add column if not exists featured      boolean not null default false,
  add column if not exists createdat     timestamptz not null default now(),
  add column if not exists updatedat     timestamptz not null default now();

-- Déclencheurs de la production, dans leur état après la migration 20261030120200
-- (search_path vide : function_search_path_mutable traité)
create or replace function public.set_updatedat()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updatedat = now();
  return new;
end;
$$;

drop trigger if exists set_ailab_capabilities_updatedat on public.ailab_capabilities;
create trigger set_ailab_capabilities_updatedat before update on public.ailab_capabilities
  for each row execute function public.set_updatedat();

drop trigger if exists set_ailab_projects_updatedat on public.ailab_projects;
create trigger set_ailab_projects_updatedat before update on public.ailab_projects
  for each row execute function public.set_updatedat();

notify pgrst, 'reload schema';
