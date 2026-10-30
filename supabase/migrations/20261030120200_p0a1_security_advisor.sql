-- ═══════════════════════════════════════════════════════════════════════════
-- P0.A1 — Alertes du Security Advisor de la production (relevé du 30/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. function_search_path_mutable : public.set_updatedat(), public.update_updatedat_column()
--    Fonctions de déclencheur « updatedat = now() ». search_path figé à '' : now() appartient
--    à pg_catalog, toujours résolu. Corps inchangé. Une fonction qui a déjà un search_path,
--    ou dont le corps lit ou écrit d'autres objets, n'est pas modifiée (avertissement).
--
-- 2. rls_policy_always_true : insertion publique dans visits et contacts
--    L'insertion reste ouverte à tous (suivi des visites, formulaire de contact), mais bornée :
--      * garde RESTRICTIVE p0a1_guard_insert : champs obligatoires et tailles maximales. Elle
--        s'applique en ET avec toute politique permissive, y compris les anciennes
--        « with check (true) » non versionnées, qui sont conservées ;
--      * p0a1_public_insert (créée par 20261030120000) : même contrôle au lieu de « true » ;
--      * droit d'insertion limité aux colonnes que le site envoie : identifiant et date
--        restent fixés par la base.
--    Limites larges, au-dessus de tout usage normal du site (formulaire sans limite côté client).
--
-- Volontairement non traité ici (docs/cv-generator-audit/19-PHASE-0-PREPARATION.md, §5) :
--   is_portfolio_admin() reste exécutable par anon et authenticated : les gardes P0.A1
--   l'évaluent pour chaque requête, y compris anonyme (banc RLS : retrait → refus).
--
-- Prérequis : 20261030120000. Idempotente. Ne modifie aucune donnée.
-- Retour arrière : supabase/rollback/20261030120200_p0a1_security_advisor.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. search_path des fonctions de déclencheur ────────────────────────────
do $$
declare
  f record;
begin
  for f in
    select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) as fn, p.prosrc, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updatedat', 'update_updatedat_column')
      and p.prorettype = 'trigger'::regtype
  loop
    if exists (select 1 from unnest(coalesce(f.proconfig, '{}')) s where s like 'search_path=%') then
      raise notice 'P0.A1 : % a déjà un search_path, inchangée', f.fn;
    elsif f.prosrc ~* '\m(select|insert|update|delete|from|into|perform|execute|call)\M' then
      raise warning 'P0.A1 : % lit ou écrit d''autres objets, search_path non modifié (examen manuel)', f.fn;
    else
      execute format('alter function %s set search_path = %L', f.fn, '');
    end if;
  end loop;
end $$;

-- ── 2. Insertion publique bornée : visits et contacts ──────────────────────
do $$
declare
  t      text;
  spec   record;
  checks text[];
  cols   text[];
  expr   text;
begin
  foreach t in array array['visits', 'contacts'] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'P0.A1 : table public.% absente, ignorée', t;
      continue;
    end if;

    checks := '{}';
    cols   := '{}';
    -- Colonnes envoyées par le site (useVisitTracker, formulaire de contact) : seules
    -- celles qui existent, de type texte, sont contrôlées et ouvertes à l'insertion
    for spec in
      select s.col, s.max_len, s.required
      from (values
        ('visits',   'page',       2048,  true),
        ('visits',   'referrer',   4096,  false),
        ('visits',   'user_agent', 2048,  false),
        ('visits',   'language',   64,    false),
        ('visits',   'screen',     32,    false),
        ('visits',   'country',    128,   false),
        ('visits',   'city',       128,   false),
        ('contacts', 'name',       200,   true),
        ('contacts', 'email',      320,   true),
        ('contacts', 'subject',    500,   false),
        ('contacts', 'message',    20000, true)
      ) as s(tbl, col, max_len, required)
      join information_schema.columns c
        on c.table_schema = 'public' and c.table_name = s.tbl and c.column_name = s.col
       and c.data_type in ('text', 'character varying', 'character')
      where s.tbl = t
    loop
      cols   := cols || quote_ident(spec.col);
      checks := checks || format('char_length(coalesce(%I, %L)) %s', spec.col, '',
                  case when spec.required then format('between 1 and %s', spec.max_len)
                       else format('<= %s', spec.max_len) end);
      if spec.col = 'email' then
        checks := checks || format('coalesce(%I, %L) ~ %L', spec.col, '', '^[^@[:space:]]+@[^@[:space:]]+$');
      end if;
    end loop;

    if cardinality(cols) = 0 then
      raise warning 'P0.A1 : public.% sans colonne attendue, insertion inchangée (examen manuel)', t;
      continue;
    end if;
    expr := array_to_string(checks, ' and ');

    execute format('drop policy if exists p0a1_guard_insert on public.%I', t);
    execute format('create policy p0a1_guard_insert on public.%I as restrictive for insert to anon, authenticated with check (%s)', t, expr);
    execute format('drop policy if exists p0a1_public_insert on public.%I', t);
    execute format('create policy p0a1_public_insert on public.%I for insert to anon, authenticated with check (%s)', t, expr);

    -- REVOKE sur la table retire aussi les droits par colonne : rejouable sans cumul
    execute format('revoke insert on table public.%I from anon, authenticated', t);
    execute format('grant insert (%s) on table public.%I to anon, authenticated', array_to_string(cols, ', '), t);
  end loop;
end $$;
