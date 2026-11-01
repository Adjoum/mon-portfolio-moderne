-- Retour arrière de 20261101100000_cv_private_history.sql (historique privé des CV du studio).
-- Supprime les documents enregistrés (table cv_documents) : sauvegarder avant si besoin.
-- Le bucket cv-private n'est PAS supprimé ici : Supabase interdit la suppression directe des
-- tables de Storage (fichiers orphelins). Sans politique, il reste privé et inaccessible ;
-- le vider puis le supprimer par l'API Storage ou le dashboard (Storage → cv-private).

drop policy if exists p4cv_private_owner_delete on storage.objects;
drop policy if exists p4cv_private_owner_insert on storage.objects;
drop policy if exists p4cv_private_owner_select on storage.objects;
drop policy if exists p4cv_private_guard_delete on storage.objects;
drop policy if exists p4cv_private_guard_update on storage.objects;
drop policy if exists p4cv_private_guard_insert on storage.objects;
drop policy if exists p4cv_private_guard_select on storage.objects;

drop trigger if exists cv_documents_quota on public.cv_documents;
drop function if exists public.cv_documents_quota();
drop table if exists public.cv_documents;
drop function if exists public.cv_history_allowed();

do $$
begin
  raise notice 'Bucket cv-private conservé, privé et sans politique : à vider puis supprimer par l''API Storage';
end $$;
