-- Banc de test : sessions administrateur, verrouillage après 10 minutes d'inactivité (côté serveur).
-- Exécuté en supabase_admin après les migrations P0.A1 et 20261102100000_admin_session_idle.
-- Horloge simulée : le passage du temps est reproduit en reculant last_activity_at (supabase_admin).
-- Chaque cas s'exécute avec le rôle et les claims JWT qu'utiliserait PostgREST.

\set ON_ERROR_STOP 1

create temp table results (id serial, label text, expected text, actual text);
grant all on results to anon, authenticated;
grant all on sequence results_id_seq to anon, authenticated;

-- Identités : session_id est un claim signé par Supabase Auth dans les vrais jetons
create function pg_temp.claims(who text) returns jsonb language sql immutable as $$
  select case who
    when 'anon'      then '{"role":"anon"}'::jsonb
    when 'user2'     then '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-0000-4000-8000-000000000002"}'::jsonb
    when 'admin1'    then '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}'::jsonb
    when 'admin2'    then '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}'::jsonb
    when 'admin2b'   then '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"aaaaaaaa-0000-4000-8000-00000000000b"}'::jsonb
    when 'admin2nos' then '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}'::jsonb
    -- Jeton d'un autre utilisateur portant le session_id de l'admin : ne doit jamais en profiter
    when 'thief'     then '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2","session_id":"aaaaaaaa-0000-4000-8000-000000000001"}'::jsonb
  end
$$;

create function pg_temp.run_as(p_who text, p_sql text) returns text language plpgsql as $$
declare
  v text;
  n bigint;
begin
  begin
    perform set_config('request.jwt.claims', pg_temp.claims(p_who)::text, true);
    perform set_config('role', case when p_who = 'anon' then 'anon' else 'authenticated' end, true);
    if p_sql ~* '^\s*(select|with)\s' then
      execute p_sql into v;
      v := coalesce(v, 'null');
    else
      execute p_sql;
      get diagnostics n = row_count;
      v := 'rows:' || n;
    end if;
    execute 'reset role';
    return v;
  exception when insufficient_privilege then
    execute 'reset role';
    return 'denied';
  end;
end $$;

create function pg_temp.check(p_label text, p_who text, p_sql text, p_expected text) returns void language plpgsql as $$
begin
  insert into results (label, expected, actual) values (p_label || ' [' || p_who || ']', p_expected, pg_temp.run_as(p_who, p_sql));
end $$;

-- Horloge simulée : la dernière interaction a eu lieu il y a p_ago
create function pg_temp.idle(p_sid text, p_ago interval) returns void language sql as $$
  update public.admin_session_activity set last_activity_at = now() - p_ago where session_id = p_sid::uuid;
$$;

\set S1 '''aaaaaaaa-0000-4000-8000-000000000001'''

-- ── Avant toute ouverture de session ───────────────────────────
select pg_temp.check('admin MFA sans session ouverte : is_portfolio_admin_mfa', 'admin2', 'select public.is_portfolio_admin_mfa()::text', 'false');
select pg_temp.check('admin MFA sans session ouverte : écriture refusée', 'admin2', $$insert into public.projects (title) values ('x')$$, 'denied');
select pg_temp.check('état : pas encore ouverte', 'admin2', 'select reason from public.admin_session_status()', 'not_started');

-- ── Ouverture : réservée à l'administrateur avec MFA et session identifiable ──
select pg_temp.check('anonyme : ouverture impossible', 'anon', 'select active::text from public.admin_session_begin()', 'denied');
select pg_temp.check('anonyme : lecture d’état impossible', 'anon', 'select active::text from public.admin_session_status()', 'denied');
select pg_temp.check('anonyme : prolongation impossible', 'anon', 'select active::text from public.admin_session_touch()', 'denied');
select pg_temp.check('utilisateur MFA non admin : ouverture refusée', 'user2', 'select active::text from public.admin_session_begin()', 'denied');
select pg_temp.check('admin sans MFA (aal1) : ouverture refusée', 'admin1', 'select active::text from public.admin_session_begin()', 'denied');
select pg_temp.check('admin MFA sans claim session_id : ouverture refusée', 'admin2nos', 'select active::text from public.admin_session_begin()', 'denied');
select pg_temp.check('admin MFA : ouverture', 'admin2', 'select active::text || '':'' || remaining_seconds || '':'' || idle_limit_seconds from public.admin_session_begin()', 'true:600:600');
select pg_temp.check('table inaccessible directement (même admin)', 'admin2', 'select count(*)::text from public.admin_session_activity', 'denied');

-- ── Session active : droits d'administration ───────────────────
select pg_temp.check('session active : is_portfolio_admin_mfa', 'admin2', 'select public.is_portfolio_admin_mfa()::text', 'true');
select pg_temp.check('session active : écriture autorisée', 'admin2', $$insert into public.projects (title) values ('Créé en session active')$$, 'rows:1');
select pg_temp.check('session active : lecture des visites', 'admin2', 'select (count(*) > 0)::text from public.visits', 'true');
select pg_temp.check('un autre utilisateur portant le même session_id n’en profite pas', 'thief', 'select public.admin_session_active()::text', 'false');
select pg_temp.check('autre session du même admin : non ouverte', 'admin2b', 'select public.is_portfolio_admin_mfa()::text', 'false');
select pg_temp.check('admin aal1 sur la même session : pas de droits MFA', 'admin1', 'select public.is_portfolio_admin_mfa()::text', 'false');

-- ── Horloge simulée : 9 min 59 s sans interaction → encore active ─────
select pg_temp.idle(:S1, interval '9 minutes 59 seconds');
select pg_temp.check('9 min 59 s : encore active', 'admin2', 'select active::text || '':'' || remaining_seconds from public.admin_session_status()', 'true:1');
select pg_temp.check('9 min 59 s : écriture autorisée', 'admin2', $$update public.projects set title = title where title = 'Créé en session active'$$, 'rows:1');
-- Une lecture d'état (requêtes automatiques, blog-api) ne prolonge pas la session
select pg_temp.check('l’état lu ne prolonge pas la session', 'admin2', 'select remaining_seconds::text from public.admin_session_status()', '1');
-- Une nouvelle ouverture (rechargement de page) ne prolonge pas non plus
select pg_temp.check('admin_session_begin ne prolonge pas une session existante', 'admin2', 'select remaining_seconds::text from public.admin_session_begin()', '1');

-- Interaction réelle : prolongée à 10 minutes pleines
select pg_temp.check('interaction réelle à 9 min 59 s : prolongée', 'admin2', 'select active::text || '':'' || remaining_seconds from public.admin_session_touch()', 'true:600');

-- ── 10 minutes exactement sans interaction → verrouillée ───────
select pg_temp.idle(:S1, interval '10 minutes');
select pg_temp.check('10 min : inactive', 'admin2', 'select active::text || '':'' || reason from public.admin_session_status()', 'false:idle_timeout');
select pg_temp.check('10 min : is_portfolio_admin_mfa', 'admin2', 'select public.is_portfolio_admin_mfa()::text', 'false');
select pg_temp.check('10 min : écriture refusée (RLS)', 'admin2', $$insert into public.projects (title) values ('trop tard')$$, 'denied');
select pg_temp.check('10 min : mise à jour sans effet (RLS)', 'admin2', $$update public.projects set title = 'piraté'$$, 'rows:0');
select pg_temp.check('10 min : lecture admin des visites refusée', 'admin2', 'select count(*)::text from public.visits', '0');

-- Aucune résurrection : ni par interaction, ni par réouverture
select pg_temp.check('interaction après expiration : session close', 'admin2', 'select active::text || '':'' || reason from public.admin_session_touch()', 'false:idle_timeout');
select pg_temp.check('réouverture après expiration : toujours close', 'admin2', 'select active::text from public.admin_session_begin()', 'false');
do $$
declare r record;
begin
  select ended_at, end_reason, last_activity_at into r from public.admin_session_activity where session_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into results (label, expected, actual) values ('clôture horodatée à l’instant réel d’expiration (dernière interaction + 10 min)',
    'idle_timeout:true', r.end_reason || ':' || (r.ended_at = r.last_activity_at + interval '10 minutes')::text);
end $$;
-- Même avec une activité forcée en base, une session close reste close
select pg_temp.idle(:S1, interval '0 seconds');
select pg_temp.check('session close + activité récente forcée : toujours refusée', 'admin2', 'select public.is_portfolio_admin_mfa()::text', 'false');

-- ── Nouvelle connexion = nouvelle session, déconnexion explicite ──
select pg_temp.check('nouvelle session : ouverture', 'admin2b', 'select active::text from public.admin_session_begin()', 'true');
select pg_temp.check('nouvelle session : écriture autorisée', 'admin2b', $$insert into public.projects (title) values ('nouvelle session')$$, 'rows:1');
select pg_temp.check('déconnexion explicite', 'admin2b', 'select public.admin_session_end(''logout'')::text', '');
select pg_temp.check('après déconnexion : refusée', 'admin2b', 'select active::text || '':'' || reason from public.admin_session_status()', 'false:logout');
select pg_temp.check('après déconnexion : écriture refusée', 'admin2b', $$insert into public.projects (title) values ('après logout')$$, 'denied');
select pg_temp.check('fin de session : sans effet pour un anonyme', 'anon', 'select public.admin_session_end(''logout'')::text', 'denied');

-- ── Résultat ────────────────────────────────────────────────
\echo
\echo '=== Résultats : sessions administrateur ==='
select case when expected is not distinct from actual then 'PASS' else 'FAIL' end as statut, label, expected, actual
from results order by id;

do $$
declare total int; failed int;
begin
  select count(*), count(*) filter (where expected is distinct from actual) into total, failed from results;
  raise notice 'Sessions admin : % assertions, % échec(s)', total, failed;
  if failed > 0 then
    raise exception 'Échec des tests de session (% échec(s))', failed;
  end if;
end $$;
