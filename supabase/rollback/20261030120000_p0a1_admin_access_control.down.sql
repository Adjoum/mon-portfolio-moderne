-- Retour arrière de 20261030120000_p0a1_admin_access_control.sql
-- Supprime les politiques p0a1_* et les fonctions ajoutées.
-- Volontairement conservés (aucune perte de protection supplémentaire) :
--   * la RLS activée sur les tables
--   * la table admin_users et son contenu
--   * public.is_portfolio_admin() (utilisée par les politiques AI Lab existantes)
-- À appliquer APRÈS le retour arrière du stockage (20261030120100) s'il a été appliqué.

do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public' and policyname like 'p0a1\_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop function if exists public.visit_count();
drop function if exists public.is_portfolio_admin_mfa();

-- Droits d'origine de is_portfolio_admin (avant P0.A1 : authenticated uniquement)
revoke execute on function public.is_portfolio_admin() from anon;
grant execute on function public.is_portfolio_admin() to authenticated;
