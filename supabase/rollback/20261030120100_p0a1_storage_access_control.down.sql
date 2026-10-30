-- Retour arrière de 20261030120100_p0a1_storage_access_control.sql
-- Restaure les politiques d'origine (admin sans MFA) du bucket project-images.

drop policy if exists p0a1_project_images_guard_insert on storage.objects;
drop policy if exists p0a1_project_images_guard_update on storage.objects;
drop policy if exists p0a1_project_images_guard_delete on storage.objects;
drop policy if exists p0a1_project_images_admin_insert on storage.objects;
drop policy if exists p0a1_project_images_admin_update on storage.objects;
drop policy if exists p0a1_project_images_admin_delete on storage.objects;

drop policy if exists "Admins upload project images" on storage.objects;
create policy "Admins upload project images"
on storage.objects for insert to authenticated
with check (bucket_id = 'project-images' and public.is_portfolio_admin());

drop policy if exists "Admins update project images" on storage.objects;
create policy "Admins update project images"
on storage.objects for update to authenticated
using (bucket_id = 'project-images' and public.is_portfolio_admin())
with check (bucket_id = 'project-images' and public.is_portfolio_admin());

drop policy if exists "Admins delete project images" on storage.objects;
create policy "Admins delete project images"
on storage.objects for delete to authenticated
using (bucket_id = 'project-images' and public.is_portfolio_admin());

-- Limites du bucket : non restaurées automatiquement (valeurs d'origine inconnues).
-- Pour les retirer : update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'project-images';
