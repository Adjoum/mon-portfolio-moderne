-- Retour arrière de 20261030120200_p0a1_security_advisor.sql : rétablit l'état laissé par
-- 20261030120000 (P0.A1). Ne modifie aucune donnée. À exécuter AVANT les retours arrière de
-- 20261030120100 et 20261030120000. Retour arrière complet : restauration.sql ensuite
-- (droits d'origine exacts des tables, d'après l'inventaire).
do $$
declare
  t text;
  f record;
begin
  foreach t in array array['visits', 'contacts'] loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    execute format('drop policy if exists p0a1_guard_insert on public.%I', t);
    execute format('drop policy if exists p0a1_public_insert on public.%I', t);
    execute format($p$create policy p0a1_public_insert on public.%I
                      for insert to anon, authenticated with check (true)$p$, t);
    -- REVOKE sur la table retire aussi les droits par colonne
    execute format('revoke insert on table public.%I from anon, authenticated', t);
    execute format('grant insert on table public.%I to anon, authenticated', t);
  end loop;

  -- search_path retiré uniquement là où la migration l'a posé (valeur vide)
  for f in
    select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updatedat', 'update_updatedat_column')
      and p.prorettype = 'trigger'::regtype
      and 'search_path=""' = any(coalesce(p.proconfig, '{}'))
  loop
    execute format('alter function %s reset search_path', f.fn);
  end loop;
end $$;
