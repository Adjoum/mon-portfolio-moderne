-- ═══════════════════════════════════════════════════════════════════════════
-- P0.A1 — Bucket « project-images » : écritures réservées à l'administrateur + MFA
-- ═══════════════════════════════════════════════════════════════════════════
-- Fichier séparé de 20261030120000 : selon les droits du rôle utilisé, la création
-- de politiques sur storage.objects peut être refusée (« must be owner »). La
-- migration principale reste alors applicable ; ces politiques se créent aussi
-- depuis Dashboard → Storage → Policies avec les mêmes expressions.
--
-- Prérequis : 20261030120000_p0a1_admin_access_control.sql (is_portfolio_admin_mfa).
-- Les autres buckets ne sont pas concernés (les gardes ne visent que project-images).
-- Retour arrière : supabase/rollback/20261030120100_p0a1_storage_access_control.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Gardes restrictives : s'ajoutent à toute politique existante sur storage.objects
drop policy if exists p0a1_project_images_guard_insert on storage.objects;
create policy p0a1_project_images_guard_insert
  on storage.objects
  as restrictive
  for insert
  to anon, authenticated
  with check (bucket_id <> 'project-images' or (select public.is_portfolio_admin_mfa()));

drop policy if exists p0a1_project_images_guard_update on storage.objects;
create policy p0a1_project_images_guard_update
  on storage.objects
  as restrictive
  for update
  to anon, authenticated
  using      (bucket_id <> 'project-images' or (select public.is_portfolio_admin_mfa()))
  with check (bucket_id <> 'project-images' or (select public.is_portfolio_admin_mfa()));

drop policy if exists p0a1_project_images_guard_delete on storage.objects;
create policy p0a1_project_images_guard_delete
  on storage.objects
  as restrictive
  for delete
  to anon, authenticated
  using (bucket_id <> 'project-images' or (select public.is_portfolio_admin_mfa()));

-- Anciennes politiques d'écriture admin (sans MFA) remplacées
drop policy if exists "Admins upload project images" on storage.objects;
drop policy if exists "Admins update project images" on storage.objects;
drop policy if exists "Admins delete project images" on storage.objects;

drop policy if exists p0a1_project_images_admin_insert on storage.objects;
create policy p0a1_project_images_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'project-images' and (select public.is_portfolio_admin_mfa()));

drop policy if exists p0a1_project_images_admin_update on storage.objects;
create policy p0a1_project_images_admin_update
  on storage.objects
  for update
  to authenticated
  using      (bucket_id = 'project-images' and (select public.is_portfolio_admin_mfa()))
  with check (bucket_id = 'project-images' and (select public.is_portfolio_admin_mfa()));

drop policy if exists p0a1_project_images_admin_delete on storage.objects;
create policy p0a1_project_images_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'project-images' and (select public.is_portfolio_admin_mfa()));

-- Limites côté serveur, alignées sur le dashboard (JPEG/PNG/WebP, 3 Mo).
-- Non bloquant : si le rôle courant ne peut pas modifier storage.buckets,
-- un avertissement s'affiche (réglage possible dans Dashboard → Storage → Bucket settings).
do $$
begin
  update storage.buckets
     set file_size_limit    = 3 * 1024 * 1024,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   where id = 'project-images';
  if not found then
    raise notice 'P0.A1 : bucket project-images absent, limites non appliquées';
  end if;
exception when insufficient_privilege then
  raise warning 'P0.A1 : limites du bucket project-images non appliquées (droits insuffisants) — à régler dans le dashboard';
end $$;
