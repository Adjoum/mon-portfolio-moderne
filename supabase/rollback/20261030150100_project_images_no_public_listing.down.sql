-- Retour arrière de 20261030150100_project_images_no_public_listing.sql
-- ⚠️ Rétablit le listage public du bucket project-images.

drop policy if exists p0cv_project_images_guard_select on storage.objects;
drop policy if exists p0cv_project_images_admin_select on storage.objects;

drop policy if exists "Public read project images" on storage.objects;
create policy "Public read project images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'project-images');
