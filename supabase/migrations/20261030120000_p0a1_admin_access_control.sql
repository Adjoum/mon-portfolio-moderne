-- ═══════════════════════════════════════════════════════════════════════════
-- P0.A1 — Contrôle d'accès administrateur du portfolio (dashboard /admin)
-- ═══════════════════════════════════════════════════════════════════════════
-- Contexte : le dashboard écrit directement dans Supabase avec la clé publique
-- « anon ». La seule protection réelle est donc la RLS. Une simple session
-- (auth.role() = 'authenticated') ne doit donner AUCUN droit : n'importe qui peut
-- créer un compte si les inscriptions sont ouvertes.
--
-- Principe :
--   * administrateur = ligne dans public.admin_users (jamais modifiable par un client)
--   * toute écriture et toute lecture de données privées exigent
--     administrateur + session MFA (aal2) : public.is_portfolio_admin_mfa()
--   * les gardes sont des politiques RESTRICTIVES : elles s'appliquent en ET logique
--     avec toutes les politiques permissives existantes (non versionnées, inconnues),
--     sans avoir besoin de les supprimer
--
-- Idempotente (rejouable). Ne modifie aucune donnée. Tables absentes ignorées.
-- Exécution atomique : SQL Editor (un seul lot) ou psql --single-transaction.
-- Retour arrière : supabase/rollback/20261030120000_p0a1_admin_access_control.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Administrateurs ─────────────────────────────────────────────────────
create table if not exists public.admin_users (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  createdat timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

-- Aucun accès client, même si une ancienne politique permissive existe
-- (sinon un utilisateur ordinaire pourrait s'ajouter lui-même comme admin)
drop policy if exists p0a1_admin_users_no_client_access on public.admin_users;
create policy p0a1_admin_users_no_client_access
  on public.admin_users
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ── 2. Fonctions de contrôle ───────────────────────────────────────────────
-- security definer : lit admin_users sans que le client y ait accès
create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

-- Administrateur ET session validée par un second facteur (TOTP → aal2).
-- La valeur aal provient du JWT signé par Supabase Auth : non falsifiable par le client.
create or replace function public.is_portfolio_admin_mfa()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and public.is_portfolio_admin();
$$;

revoke all on function public.is_portfolio_admin()     from public;
revoke all on function public.is_portfolio_admin_mfa() from public;
-- anon en a besoin pour l'évaluation des politiques (renvoie toujours false pour lui)
grant execute on function public.is_portfolio_admin()     to anon, authenticated;
grant execute on function public.is_portfolio_admin_mfa() to anon, authenticated;

-- ── 3. Contenu public (projets, compétences, AI Lab) ───────────────────────
-- Lecture : inchangée (publique). Écriture : administrateur + MFA uniquement.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'skills',
    'ailab_projects', 'ailab_capabilities', 'ailab_project_capabilities'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'P0.A1 : table public.% absente, ignorée', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Gardes restrictives (ET logique avec toute politique existante)
    execute format('drop policy if exists p0a1_guard_insert on public.%I', t);
    execute format($p$create policy p0a1_guard_insert on public.%I as restrictive
                      for insert to anon, authenticated
                      with check ((select public.is_portfolio_admin_mfa()))$p$, t);
    execute format('drop policy if exists p0a1_guard_update on public.%I', t);
    execute format($p$create policy p0a1_guard_update on public.%I as restrictive
                      for update to anon, authenticated
                      using ((select public.is_portfolio_admin_mfa()))
                      with check ((select public.is_portfolio_admin_mfa()))$p$, t);
    execute format('drop policy if exists p0a1_guard_delete on public.%I', t);
    execute format($p$create policy p0a1_guard_delete on public.%I as restrictive
                      for delete to anon, authenticated
                      using ((select public.is_portfolio_admin_mfa()))$p$, t);

    -- Droits d'écriture de l'administrateur
    execute format('drop policy if exists p0a1_admin_insert on public.%I', t);
    execute format($p$create policy p0a1_admin_insert on public.%I
                      for insert to authenticated
                      with check ((select public.is_portfolio_admin_mfa()))$p$, t);
    execute format('drop policy if exists p0a1_admin_update on public.%I', t);
    execute format($p$create policy p0a1_admin_update on public.%I
                      for update to authenticated
                      using ((select public.is_portfolio_admin_mfa()))
                      with check ((select public.is_portfolio_admin_mfa()))$p$, t);
    execute format('drop policy if exists p0a1_admin_delete on public.%I', t);
    execute format($p$create policy p0a1_admin_delete on public.%I
                      for delete to authenticated
                      using ((select public.is_portfolio_admin_mfa()))$p$, t);
  end loop;

  -- Projets et compétences sont affichés à tous les visiteurs.
  -- (AI Lab : les politiques de lecture « active = true » existantes sont conservées.)
  foreach t in array array['projects', 'skills'] loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    execute format('drop policy if exists p0a1_public_read on public.%I', t);
    execute format($p$create policy p0a1_public_read on public.%I
                      for select to anon, authenticated using (true)$p$, t);
  end loop;
end $$;

-- ── 4. Données privées (visites, messages de contact) ──────────────────────
-- Insertion : publique (suivi des visites, formulaire de contact).
-- Lecture, modification, suppression : administrateur + MFA uniquement.
do $$
declare
  t text;
begin
  foreach t in array array['visits', 'contacts'] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'P0.A1 : table public.% absente, ignorée', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists p0a1_guard_select on public.%I', t);
    execute format($p$create policy p0a1_guard_select on public.%I as restrictive
                      for select to anon, authenticated
                      using ((select public.is_portfolio_admin_mfa()))$p$, t);
    execute format('drop policy if exists p0a1_guard_update on public.%I', t);
    execute format($p$create policy p0a1_guard_update on public.%I as restrictive
                      for update to anon, authenticated
                      using ((select public.is_portfolio_admin_mfa()))
                      with check ((select public.is_portfolio_admin_mfa()))$p$, t);
    execute format('drop policy if exists p0a1_guard_delete on public.%I', t);
    execute format($p$create policy p0a1_guard_delete on public.%I as restrictive
                      for delete to anon, authenticated
                      using ((select public.is_portfolio_admin_mfa()))$p$, t);

    execute format('drop policy if exists p0a1_admin_read on public.%I', t);
    execute format($p$create policy p0a1_admin_read on public.%I
                      for select to authenticated
                      using ((select public.is_portfolio_admin_mfa()))$p$, t);
    execute format('drop policy if exists p0a1_public_insert on public.%I', t);
    execute format($p$create policy p0a1_public_insert on public.%I
                      for insert to anon, authenticated with check (true)$p$, t);
  end loop;

  -- Compteur public de la page d'accueil : le nombre de visites, sans aucune ligne
  if to_regclass('public.visits') is not null then
    execute $f$
      create or replace function public.visit_count()
      returns bigint
      language sql
      stable
      security definer
      set search_path = ''
      as $body$ select count(*) from public.visits $body$
    $f$;
    revoke all on function public.visit_count() from public;
    grant execute on function public.visit_count() to anon, authenticated;
  end if;
end $$;
