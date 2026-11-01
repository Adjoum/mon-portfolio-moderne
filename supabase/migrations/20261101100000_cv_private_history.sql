-- ═══════════════════════════════════════════════════════════════════════════
-- P4 — Historique privé des CV finaux du studio LaTeX (« Mes CV »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : 20261030120000_p0a1_admin_access_control.sql (is_portfolio_admin_mfa).
--
-- Bucket PRIVÉ cv-private, distinct de project-images (images publiques du portfolio) et de
-- portfolio-public-documents (CV public administré dans /admin, jamais mélangé avec ceux-ci).
-- Une ligne de public.cv_documents par CV enregistré ; ses deux fichiers (PDF et .tex) vivent
-- sous <propriétaire>/<document>.pdf|.tex et ne sont jamais modifiés (versions immuables).
--
-- Qui peut tenir un historique : public.cv_history_allowed(), point unique de décision.
-- Pour l'instant : administrateurs avec MFA seulement. Les visiteurs du site n'ont pas de
-- compte, et les inscriptions ouvertes de l'API Auth de production permettraient sinon à
-- n'importe qui de remplir le stockage. Élargir cette fonction exige une décision préalable
-- (inscriptions, CAPTCHA, vérification de l'e-mail, quotas, conservation, consentement).
--
-- Quotas : 30 CV par propriétaire (déclencheur), PDF ≤ 5 Mo et .tex ≤ 200 Ko (bucket et
-- contraintes), un fichier n'est accepté que si sa ligne existe déjà (quota respecté).
-- Conservation : 365 jours (expires_at) ; purge à l'ouverture de « Mes CV ».
-- Idempotente. Jamais appliquée en production sans autorisation explicite.
-- Retour arrière : supabase/rollback/20261101100000_cv_private_history.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Bucket privé ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-private', 'cv-private', false, 5 * 1024 * 1024, array['application/pdf', 'application/x-tex'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Qui peut tenir un historique ────────────────────────────────────────
create or replace function public.cv_history_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and public.is_portfolio_admin_mfa();
$$;

revoke all on function public.cv_history_allowed() from public;
grant execute on function public.cv_history_allowed() to authenticated;

-- ── 3. Documents ───────────────────────────────────────────────────────────
create table if not exists public.cv_documents (
  id                  uuid primary key,
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 120),
  template_id         text check (template_id is null or template_id ~ '^[a-z0-9-]{1,40}$'),
  target_organization text not null default '' check (char_length(target_organization) <= 200),
  target_role         text not null default '' check (char_length(target_role) <= 200),
  pdf_path            text not null,
  tex_path            text not null,
  pdf_bytes           integer not null check (pdf_bytes between 1 and 5242880),
  tex_bytes           integer not null check (tex_bytes between 1 and 204800),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default now() + interval '365 days',
  constraint cv_documents_paths check (
    pdf_path = owner_id::text || '/' || id::text || '.pdf'
    and tex_path = owner_id::text || '/' || id::text || '.tex'
  ),
  constraint cv_documents_expiry check (expires_at <= created_at + interval '366 days')
);

create index if not exists cv_documents_owner_created on public.cv_documents (owner_id, created_at desc);

alter table public.cv_documents enable row level security;
revoke all on table public.cv_documents from anon, authenticated;
-- Lecture, ajout et suppression ; aucune modification (versions immuables)
grant select, insert, delete on table public.cv_documents to authenticated;

drop policy if exists p4cv_documents_select on public.cv_documents;
create policy p4cv_documents_select on public.cv_documents for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.cv_history_allowed()));

drop policy if exists p4cv_documents_insert on public.cv_documents;
create policy p4cv_documents_insert on public.cv_documents for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.cv_history_allowed()) and created_at >= now() - interval '1 minute');

drop policy if exists p4cv_documents_delete on public.cv_documents;
create policy p4cv_documents_delete on public.cv_documents for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.cv_history_allowed()));

-- Quota : 30 CV par propriétaire (vérifié par la base, quel que soit le client)
create or replace function public.cv_documents_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('cv_documents:' || new.owner_id::text, 0));
  if (select count(*) from public.cv_documents where owner_id = new.owner_id) >= 30 then
    raise exception 'cv_history_quota' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.cv_documents_quota() from public;

drop trigger if exists cv_documents_quota on public.cv_documents;
create trigger cv_documents_quota before insert on public.cv_documents
  for each row execute function public.cv_documents_quota();

-- ── 4. Fichiers (storage.objects, bucket cv-private) ───────────────────────
-- Gardes RESTRICTIVES : s'ajoutent (ET logique) à toute politique existante, connue ou non.
drop policy if exists p4cv_private_guard_select on storage.objects;
create policy p4cv_private_guard_select on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'cv-private' or ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.cv_history_allowed())));

drop policy if exists p4cv_private_guard_insert on storage.objects;
create policy p4cv_private_guard_insert on storage.objects as restrictive for insert to anon, authenticated
  with check (
    bucket_id <> 'cv-private'
    or (
      name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|tex)$'
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select public.cv_history_allowed())
      -- Un fichier n'est accepté que pour un document déjà enregistré (quota respecté)
      and exists (select 1 from public.cv_documents d where d.owner_id = (select auth.uid()) and (d.pdf_path = name or d.tex_path = name))
    )
  );

-- Aucun remplacement : un CV enregistré n'est jamais modifié
drop policy if exists p4cv_private_guard_update on storage.objects;
create policy p4cv_private_guard_update on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'cv-private')
  with check (bucket_id <> 'cv-private');

drop policy if exists p4cv_private_guard_delete on storage.objects;
create policy p4cv_private_guard_delete on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'cv-private' or ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.cv_history_allowed())));

-- Droits du propriétaire (permissifs), dans son seul dossier
drop policy if exists p4cv_private_owner_select on storage.objects;
create policy p4cv_private_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'cv-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cv_history_allowed()));

drop policy if exists p4cv_private_owner_insert on storage.objects;
create policy p4cv_private_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cv-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cv_history_allowed()));

drop policy if exists p4cv_private_owner_delete on storage.objects;
create policy p4cv_private_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cv-private' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cv_history_allowed()));
