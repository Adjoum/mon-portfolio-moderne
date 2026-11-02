-- Retour arrière de 20261102100100_cv_documents_quota_privileges.sql : droits d'avant (privilèges par
-- défaut de Supabase pour anon et authenticated). Aucune donnée concernée.
do $$
begin
  if to_regprocedure('public.cv_documents_quota()') is not null then
    grant execute on function public.cv_documents_quota() to anon, authenticated;
  end if;
end $$;
