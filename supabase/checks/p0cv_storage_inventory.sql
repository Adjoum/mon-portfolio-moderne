-- P0.CV — Audit Storage : LECTURE SEULE (aucune modification)
-- À exécuter dans le SQL Editor AVANT les migrations P0.CV, puis à me transmettre.
-- Ne renvoie ni fichier ni secret. Aucune requête n'a été lancée sur la production.

-- 1. Buckets et limites
select id, public, file_size_limit, allowed_mime_types, created_at
from storage.buckets
order by id;

-- 2. Politiques sur storage.objects : qui peut lister, écrire, remplacer, supprimer ?
--    À regarder : cmd = SELECT sur project-images (listage), roles = {public} ou {anon},
--    qual / with_check limités à bucket_id (toute session peut alors agir).
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;

-- 3. Politiques sur storage.buckets (la liste des buckets ne doit pas être modifiable)
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'buckets'
order by cmd, policyname;

-- 4. Volume par bucket (sans aucun nom de fichier)
select bucket_id, count(*) as objects,
       pg_size_pretty(sum(coalesce((metadata ->> 'size')::bigint, 0))) as total_size,
       count(*) filter (where name !~ '^(projects|ailab)/') as outside_expected_folders
from storage.objects
group by bucket_id
order by bucket_id;

-- 5. Après migration : état du CV (une ligne active au maximum)
-- select id, status, size_bytes, uploaded_at, activated_at from public.cv_versions order by uploaded_at desc;
