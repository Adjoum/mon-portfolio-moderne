-- Retour arrière de 20261030150000_cv_public_document.sql
-- ⚠️ Conserve volontairement la table cv_versions et les fichiers du bucket : l'historique
-- des CV n'est pas supprimé. Après ce script, le site retombe sur /cv.pdf (fonction absente).

drop policy if exists p0cv_documents_guard_select on storage.objects;
drop policy if exists p0cv_documents_guard_insert on storage.objects;
drop policy if exists p0cv_documents_guard_update on storage.objects;
drop policy if exists p0cv_documents_guard_delete on storage.objects;
drop policy if exists p0cv_documents_admin_select on storage.objects;
drop policy if exists p0cv_documents_admin_insert on storage.objects;
drop policy if exists p0cv_documents_admin_delete on storage.objects;

drop function if exists public.cv_object_is_referenced(text);
drop function if exists public.cv_restore_version(uuid, uuid);
drop function if exists public.cv_publish_version(uuid, text, bigint, text, text, uuid);
drop function if exists public.cv_active();
