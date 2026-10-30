-- ═══════════════════════════════════════════════════════════════════════════
-- P0.CV — CV public persistant : bucket dédié, versions, une seule version active
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : 20261030120000_p0a1_admin_access_control.sql (is_portfolio_admin_mfa).
--
-- Source de vérité : public.cv_versions. Le fichier est stocké sous un chemin unique,
-- jamais écrasé (cv/versions/<uuid>.pdf). Aucune clé service_role : les fonctions
-- ci-dessous s'exécutent avec le jeton de l'administrateur, et vérifient admin + MFA.
--
-- Ce bucket est réservé aux documents publics du portfolio. Les CV privés des
-- utilisateurs du générateur iront dans un bucket privé distinct.
-- Idempotente. Retour arrière : supabase/rollback/20261030150000_cv_public_document.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Bucket public, limité aux PDF de 10 Mo ──────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-public-documents', 'portfolio-public-documents', true, 10 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Versions du CV ──────────────────────────────────────────────────────
create table if not exists public.cv_versions (
  id                uuid primary key,
  bucket            text not null,
  storage_path      text not null,
  original_filename text,
  size_bytes        bigint not null check (size_bytes > 0),
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status            text not null default 'archived' check (status in ('active', 'archived')),
  uploaded_by       uuid references auth.users(id) on delete set null,
  uploaded_at       timestamptz not null default now(),
  activated_by      uuid references auth.users(id) on delete set null,
  activated_at      timestamptz,
  unique (bucket, storage_path)
);

-- Garantie apportée par la base : au plus une ligne active, même en cas de concurrence
create unique index if not exists cv_versions_single_active
  on public.cv_versions ((1))
  where status = 'active';

create index if not exists cv_versions_uploaded_at on public.cv_versions (uploaded_at desc);

alter table public.cv_versions enable row level security;
revoke all on table public.cv_versions from anon, authenticated;

-- Historique lisible par l'administrateur uniquement ; aucune écriture directe :
-- tout passe par cv_publish_version et cv_restore_version
grant select on table public.cv_versions to authenticated;
drop policy if exists p0cv_versions_admin_read on public.cv_versions;
create policy p0cv_versions_admin_read
  on public.cv_versions
  for select
  to authenticated
  using ((select public.is_portfolio_admin_mfa()));

-- ── 3. Lecture publique : uniquement la version active, sans donnée d'administration ──
create or replace function public.cv_active()
returns table (
  id           uuid,
  bucket       text,
  storage_path text,
  sha256       text,
  size_bytes   bigint,
  activated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.bucket, v.storage_path, v.sha256, v.size_bytes, v.activated_at
  from public.cv_versions v
  where v.status = 'active';
$$;

revoke all on function public.cv_active() from public;
grant execute on function public.cv_active() to anon, authenticated;

-- ── 4. Publication atomique d'une nouvelle version ─────────────────────────
-- Tout ou rien : si une étape échoue, la version active précédente reste en place.
-- p_expected_active : version que l'administrateur avait sous les yeux. Si elle a changé
-- entre-temps (double remplacement), la publication est refusée (HTTP 409).
create or replace function public.cv_publish_version(
  p_id                uuid,
  p_storage_path      text,
  p_size_bytes        bigint,
  p_sha256            text,
  p_original_filename text,
  p_expected_active   uuid
)
returns table (id uuid, bucket text, storage_path text, sha256 text, size_bytes bigint, activated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket  constant text := 'portfolio-public-documents';
  v_current uuid;
begin
  if not public.is_portfolio_admin_mfa() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;
  if p_storage_path !~ '^cv/versions/[0-9a-f-]{36}\.pdf$' then
    raise exception 'cv_invalid_path' using errcode = '22023';
  end if;

  -- Sérialise les remplacements concurrents
  perform pg_advisory_xact_lock(hashtext('public.cv_versions'));

  select v.id into v_current from public.cv_versions v where v.status = 'active';
  if v_current is distinct from p_expected_active then
    raise sqlstate 'PT409' using message = 'cv_conflict';
  end if;

  -- L'objet doit réellement exister, avec la taille annoncée
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = v_bucket
      and o.name = p_storage_path
      and (o.metadata ->> 'size')::bigint = p_size_bytes
  ) then
    raise exception 'cv_object_missing' using errcode = 'P0002';
  end if;

  update public.cv_versions v set status = 'archived' where v.status = 'active';

  insert into public.cv_versions
    (id, bucket, storage_path, original_filename, size_bytes, sha256, status, uploaded_by, activated_by, activated_at)
  values
    (p_id, v_bucket, p_storage_path, left(p_original_filename, 200), p_size_bytes, p_sha256, 'active', auth.uid(), auth.uid(), now());

  return query
    select v.id, v.bucket, v.storage_path, v.sha256, v.size_bytes, v.activated_at
    from public.cv_versions v where v.id = p_id;
end;
$$;

-- ── 5. Restauration d'une version archivée ─────────────────────────────────
create or replace function public.cv_restore_version(p_id uuid, p_expected_active uuid)
returns table (id uuid, bucket text, storage_path text, sha256 text, size_bytes bigint, activated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
  v_target  public.cv_versions%rowtype;
begin
  if not public.is_portfolio_admin_mfa() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.cv_versions'));

  select v.id into v_current from public.cv_versions v where v.status = 'active';
  if v_current is distinct from p_expected_active then
    raise sqlstate 'PT409' using message = 'cv_conflict';
  end if;

  select * into v_target from public.cv_versions v where v.id = p_id;
  if not found then
    raise exception 'cv_version_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = v_target.bucket and o.name = v_target.storage_path) then
    raise exception 'cv_object_missing' using errcode = 'P0002';
  end if;

  update public.cv_versions v set status = 'archived' where v.status = 'active' and v.id <> p_id;
  update public.cv_versions v
     set status = 'active', activated_by = auth.uid(), activated_at = now()
   where v.id = p_id;

  return query
    select v.id, v.bucket, v.storage_path, v.sha256, v.size_bytes, v.activated_at
    from public.cv_versions v where v.id = p_id;
end;
$$;

revoke all on function public.cv_publish_version(uuid, text, bigint, text, text, uuid) from public, anon;
revoke all on function public.cv_restore_version(uuid, uuid) from public, anon;
grant execute on function public.cv_publish_version(uuid, text, bigint, text, text, uuid) to authenticated;
grant execute on function public.cv_restore_version(uuid, uuid) to authenticated;

-- ── 6. Objets : écriture admin + MFA, jamais d'écrasement ni de listage public ──
-- Lecture publique par URL : assurée par le statut public du bucket, sans politique SELECT
-- (une politique SELECT publique autoriserait le listage de tous les fichiers).

-- Un objet référencé par une version n'est jamais supprimé (historique, retour arrière)
create or replace function public.cv_object_is_referenced(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cv_versions v
    where v.bucket = 'portfolio-public-documents' and v.storage_path = p_name
  );
$$;

revoke all on function public.cv_object_is_referenced(text) from public;
grant execute on function public.cv_object_is_referenced(text) to anon, authenticated;

-- Gardes restrictives : s'ajoutent (ET logique) à toute politique existante
drop policy if exists p0cv_documents_guard_select on storage.objects;
create policy p0cv_documents_guard_select
  on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'portfolio-public-documents' or (select public.is_portfolio_admin_mfa()));

drop policy if exists p0cv_documents_guard_insert on storage.objects;
create policy p0cv_documents_guard_insert
  on storage.objects as restrictive for insert to anon, authenticated
  with check (
    bucket_id <> 'portfolio-public-documents'
    or ((select public.is_portfolio_admin_mfa()) and name ~ '^cv/versions/[0-9a-f-]{36}\.pdf$')
  );

-- Aucun écrasement : les versions sont immuables, y compris pour l'administrateur
drop policy if exists p0cv_documents_guard_update on storage.objects;
create policy p0cv_documents_guard_update
  on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'portfolio-public-documents')
  with check (bucket_id <> 'portfolio-public-documents');

drop policy if exists p0cv_documents_guard_delete on storage.objects;
create policy p0cv_documents_guard_delete
  on storage.objects as restrictive for delete to anon, authenticated
  using (
    bucket_id <> 'portfolio-public-documents'
    or ((select public.is_portfolio_admin_mfa()) and not public.cv_object_is_referenced(name))
  );

-- Droits de l'administrateur (permissifs) : SELECT requis par Storage pour supprimer
drop policy if exists p0cv_documents_admin_select on storage.objects;
create policy p0cv_documents_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'portfolio-public-documents' and (select public.is_portfolio_admin_mfa()));

drop policy if exists p0cv_documents_admin_insert on storage.objects;
create policy p0cv_documents_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio-public-documents' and (select public.is_portfolio_admin_mfa()));

drop policy if exists p0cv_documents_admin_delete on storage.objects;
create policy p0cv_documents_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-public-documents' and (select public.is_portfolio_admin_mfa()));
