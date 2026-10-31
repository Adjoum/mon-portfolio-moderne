-- Banc de test RLS — état « production » supposé, volontairement VULNÉRABLE
-- Reprend les tables utilisées par le frontend et le SQL commenté de src/lib/supabase.ts,
-- plus des politiques permissives héritées plausibles (non versionnées) :
--   * projects : « authenticated » a tous les droits
--   * skills   : RLS désactivée
--   * visits   : lisible par toute session (auth.role() = 'authenticated')
--   * contacts : lisible par toute session
--   * admin_users : un utilisateur ordinaire peut s'y ajouter (élévation de privilèges)
--   * storage  : toute session peut téléverser dans project-images
-- Exécuté en postgres (comme le SQL Editor), sauf l'amorçage des données.

-- ── Tables publiques ───────────────────────────────────────
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  technologies text[] default '{}',
  imageurl     text,
  githuburl    text,
  liveurl      text,
  category     text,
  featured     boolean default false,
  createdat    timestamptz default now(),
  updatedat    timestamptz default now()
);
alter table public.projects enable row level security;
create policy "Public read projects" on public.projects for select using (true);
create policy "Authenticated full access" on public.projects for all to authenticated using (true) with check (true);

create table public.skills (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  category text,
  level    int,
  icon     text
);
-- RLS volontairement désactivée

create table public.visits (
  id         bigserial primary key,
  page       text not null,
  referrer   text,
  user_agent text,
  country    text,
  city       text,
  language   text,
  screen     text,
  created_at timestamptz default now()
);
alter table public.visits enable row level security;
create policy "Anyone can insert visits" on public.visits for insert with check (true);
create policy "Only authenticated can read visits" on public.visits for select using (auth.role() = 'authenticated');

create table public.contacts (
  id        uuid primary key default gen_random_uuid(),
  name      text,
  email     text,
  subject   text,
  message   text,
  createdat timestamptz default now()
);
alter table public.contacts enable row level security;
create policy "Anyone can send a message" on public.contacts for insert with check (true);
create policy "Authenticated read messages" on public.contacts for select to authenticated using (true);

-- ── AI Lab (SQL commenté de src/lib/supabase.ts) ───────────
-- Toutes les colonnes du schéma réel : le dashboard trie par createdat (tests/infra/recette-schema.test.ts).
-- Seules différences : valeurs par défaut de icon et description, pour des jeux d'essai concis.
-- Les déclencheurs set_updatedat de la production sont ajoutés par 18_production_traits.sql.
create table public.ailab_capabilities (
  id uuid primary key default gen_random_uuid(), slug text unique not null, icon text not null default 'Brain',
  title text not null, description text not null default '', sortorder int not null default 0, active boolean not null default true,
  createdat timestamptz not null default now(), updatedat timestamptz not null default now()
);
create table public.ailab_projects (
  id uuid primary key default gen_random_uuid(), slug text unique not null, icon text not null default 'Brain',
  title text not null, description text not null default '', technologies text[] not null default '{}',
  color text not null default 'from-blue-500 to-cyan-500', imageurl text, githuburl text, liveurl text, demourl text,
  demoavailable boolean not null default false, featured boolean not null default false,
  active boolean not null default true, sortorder int not null default 0,
  createdat timestamptz not null default now(), updatedat timestamptz not null default now()
);
create table public.ailab_project_capabilities (
  project_id uuid references public.ailab_projects(id) on delete cascade,
  capability_id uuid references public.ailab_capabilities(id) on delete cascade,
  primary key (project_id, capability_id)
);
alter table public.ailab_capabilities enable row level security;
alter table public.ailab_projects enable row level security;
alter table public.ailab_project_capabilities enable row level security;
create policy "Public read active AI projects" on public.ailab_projects for select to anon, authenticated using (active = true);
create policy "Public read active AI capabilities" on public.ailab_capabilities for select to anon, authenticated using (active = true);
create policy "Public read AI project capability links" on public.ailab_project_capabilities for select to anon, authenticated using (true);

-- ── admin_users + is_portfolio_admin (version d'origine) ───
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  createdat timestamptz not null default now()
);
alter table public.admin_users enable row level security;
create policy "legacy manage admin_users" on public.admin_users for all to authenticated using (true) with check (true);

create or replace function public.is_portfolio_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;
grant execute on function public.is_portfolio_admin() to authenticated;

create policy "Admins read all AI projects" on public.ailab_projects for select to authenticated using (public.is_portfolio_admin());
create policy "Admins insert AI projects" on public.ailab_projects for insert to authenticated with check (public.is_portfolio_admin());
create policy "Admins update AI projects" on public.ailab_projects for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy "Admins delete AI projects" on public.ailab_projects for delete to authenticated using (public.is_portfolio_admin());

-- ── Storage ────────────────────────────────────────────────
create policy "Public read project images" on storage.objects for select to anon, authenticated using (bucket_id = 'project-images');
create policy "Authenticated can upload" on storage.objects for insert to authenticated with check (bucket_id in ('project-images', 'avatars'));
create policy "Admins upload project images" on storage.objects for insert to authenticated with check (bucket_id = 'project-images' and public.is_portfolio_admin());
create policy "Admins delete project images" on storage.objects for delete to authenticated using (bucket_id = 'project-images' and public.is_portfolio_admin());
