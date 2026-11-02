-- ═══════════════════════════════════════════════════════════════════════════
-- Fonction de déclencheur cv_documents_quota : aucun droit EXECUTE pour les clients
-- ═══════════════════════════════════════════════════════════════════════════
-- 20261101100000 retire EXECUTE à PUBLIC, mais Supabase l'accorde aussi directement à anon et
-- authenticated (privilèges par défaut) : le Security Advisor signale alors une fonction
-- SECURITY DEFINER exécutable par les clients. Un déclencheur ne vérifie pas ce droit lorsqu'il se
-- déclenche : le retirer ne change rien au quota, qui reste appliqué à chaque insertion.
-- Idempotente ; sans effet si la migration 20261101100000 n'est pas appliquée.
-- Retour arrière : supabase/rollback/20261102100100_cv_documents_quota_privileges.down.sql
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.cv_documents_quota()') is null then
    raise notice 'cv_documents_quota absente (20261101100000 non appliquée) : rien à faire';
    return;
  end if;
  revoke all on function public.cv_documents_quota() from public, anon, authenticated;
end $$;
