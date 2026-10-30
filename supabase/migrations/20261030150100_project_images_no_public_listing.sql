-- ═══════════════════════════════════════════════════════════════════════════
-- P0.CV — project-images : fin du listage public du bucket
-- ═══════════════════════════════════════════════════════════════════════════
-- Le bucket est public : ses images se lisent par URL sans aucune politique SELECT.
-- La politique « Public read project images » ne sert donc qu'à autoriser le listage
-- de tous les fichiers par n'importe quel visiteur (avertissement du dashboard Supabase).
-- Après cette migration : URL publiques inchangées, listage réservé à l'administrateur.
--
-- Prérequis : 20261030120100_p0a1_storage_access_control.sql.
-- Retour arrière : supabase/rollback/20261030150100_project_images_no_public_listing.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "Public read project images" on storage.objects;

-- Même traitement pour toute autre politique SELECT permissive dont la seule condition est
-- « bucket_id = 'project-images' » : elle ne sert qu'au listage, quel que soit son nom
-- (le Security Advisor de la production en signale deux). Liste exacte dans l'inventaire ;
-- recréées à l'identique par restauration.sql en cas de retour arrière complet.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles && array['public', 'anon', 'authenticated']::name[]
      and policyname not like 'p0cv\_%' and policyname not like 'p0a1\_%'
      and regexp_replace(lower(coalesce(qual, '')), '\s|\(|\)|::text', '', 'g') = 'bucket_id=''project-images'''
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'P0.CV : politique de listage « % » retirée (project-images)', r.policyname;
  end loop;
end $$;

-- Garde restrictive : neutralise toute autre politique SELECT large non versionnée
drop policy if exists p0cv_project_images_guard_select on storage.objects;
create policy p0cv_project_images_guard_select
  on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'project-images' or (select public.is_portfolio_admin_mfa()));

-- SELECT administrateur : requis par Storage pour supprimer ou remplacer un fichier
drop policy if exists p0cv_project_images_admin_select on storage.objects;
create policy p0cv_project_images_admin_select
  on storage.objects for select to authenticated
  using (bucket_id = 'project-images' and (select public.is_portfolio_admin_mfa()));
