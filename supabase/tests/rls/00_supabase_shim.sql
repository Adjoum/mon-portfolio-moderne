-- Banc de test RLS (local, jetable) — compléments de l'image supabase/postgres
-- L'image de base ne contient que le schéma auth initial : les services GoTrue et
-- Storage ajoutent normalement auth.jwt(), la version actuelle de auth.uid() et le
-- schéma storage. On les reproduit ici à l'identique de leurs migrations publiques.
-- Exécuté en supabase_admin.

-- auth.uid() / auth.role() / auth.jwt() : lecture de request.jwt.claims (PostgREST ≥ 10)
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role, postgres;

-- Schéma storage minimal (tables appartenant à supabase_storage_admin, comme en production)
create schema if not exists storage authorization supabase_storage_admin;
grant usage on schema storage to postgres, anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz default now()
);

alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to postgres, anon, authenticated, service_role;
