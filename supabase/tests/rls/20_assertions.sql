-- Banc de test RLS — assertions après application des migrations P0.A1
-- (fonctions d'aide : 05_helpers.sql)
-- Exécuté en supabase_admin. Échec du script si une seule assertion échoue.

\set ON_ERROR_STOP 1

-- ── Fonctions de contrôle ───────────────────────────────────
select pg_temp.check('is_portfolio_admin()',     'user',   'select public.is_portfolio_admin()::text',     'false');
select pg_temp.check('is_portfolio_admin()',     'admin',  'select public.is_portfolio_admin()::text',     'true');
select pg_temp.check('is_portfolio_admin_mfa()', 'anon',   'select public.is_portfolio_admin_mfa()::text', 'false');
select pg_temp.check('is_portfolio_admin_mfa()', 'user2',  'select public.is_portfolio_admin_mfa()::text', 'false');
select pg_temp.check('is_portfolio_admin_mfa()', 'admin',  'select public.is_portfolio_admin_mfa()::text', 'false');
select pg_temp.check('is_portfolio_admin_mfa()', 'admin2', 'select public.is_portfolio_admin_mfa()::text', 'true');

-- ── admin_users : aucun accès client, pas d'élévation de privilèges ──
select pg_temp.check('admin_users lecture',          'anon',   'select count(*)::text from public.admin_users', 'denied');
select pg_temp.check('admin_users lecture',          'user',   'select count(*)::text from public.admin_users', 'denied');
select pg_temp.check('admin_users auto-promotion',   'user',   $q$insert into public.admin_users (user_id) values ('22222222-2222-4222-8222-222222222222')$q$, 'denied');
select pg_temp.check('admin_users auto-promotion',   'user2',  $q$insert into public.admin_users (user_id) values ('22222222-2222-4222-8222-222222222222')$q$, 'denied');
select pg_temp.check('admin_users suppression',      'user',   'delete from public.admin_users', 'denied');

-- ── projects : lecture publique, écriture admin + MFA ───────
select pg_temp.check('projects lecture',     'anon',   'select count(*)::text from public.projects', '2');
select pg_temp.check('projects insertion',   'anon',   $q$insert into public.projects (title) values ('pirate')$q$, 'denied');
select pg_temp.check('projects insertion',   'user',   $q$insert into public.projects (title) values ('pirate')$q$, 'denied');
select pg_temp.check('projects insertion',   'user2',  $q$insert into public.projects (title) values ('pirate')$q$, 'denied');
select pg_temp.check('projects insertion',   'admin',  $q$insert into public.projects (title) values ('sans MFA')$q$, 'denied');
select pg_temp.check('projects modification','user',   $q$update public.projects set title = 'défacé'$q$, 'rows:0');
select pg_temp.check('projects modification','admin',  $q$update public.projects set title = 'défacé'$q$, 'rows:0');
select pg_temp.check('projects suppression', 'user',   'delete from public.projects', 'rows:0');
select pg_temp.check('projects suppression', 'admin',  'delete from public.projects', 'rows:0');
select pg_temp.check('projects intacts',     'anon',   $q$select count(*)::text from public.projects where title like 'Projet %'$q$, '2');
select pg_temp.check('projects insertion',   'admin2', $q$insert into public.projects (title) values ('Projet C')$q$, 'rows:1');
select pg_temp.check('projects modification','admin2', $q$update public.projects set featured = true where title = 'Projet C'$q$, 'rows:1');
select pg_temp.check('projects suppression', 'admin2', $q$delete from public.projects where title = 'Projet C'$q$, 'rows:1');

-- ── skills (RLS absente avant migration) ────────────────────
select pg_temp.check('skills lecture',       'anon',   'select count(*)::text from public.skills', '2');
select pg_temp.check('skills insertion',     'anon',   $q$insert into public.skills (name) values ('x')$q$, 'denied');
select pg_temp.check('skills insertion',     'user',   $q$insert into public.skills (name) values ('x')$q$, 'denied');
select pg_temp.check('skills suppression',   'user',   'delete from public.skills', 'rows:0');
select pg_temp.check('skills insertion',     'admin2', $q$insert into public.skills (name, level) values ('Go', 50)$q$, 'rows:1');

-- ── visits : insertion publique, lecture admin + MFA ────────
select pg_temp.check('visits insertion',     'anon',   $q$insert into public.visits (page) values ('/projects')$q$, 'rows:1');
select pg_temp.check('visits lecture',       'anon',   'select count(*)::text from public.visits', '0');
select pg_temp.check('visits lecture',       'user',   'select count(*)::text from public.visits', '0');
select pg_temp.check('visits lecture',       'admin',  'select count(*)::text from public.visits', '0');
select pg_temp.check('visits lecture',       'admin2', 'select count(*)::text from public.visits', '4');
select pg_temp.check('visits compteur public','anon',  'select public.visit_count()::text', '4');
select pg_temp.check('visits suppression',   'user',   'delete from public.visits', 'rows:0');
select pg_temp.check('visits modification',  'admin2', $q$update public.visits set city = 'x'$q$, 'rows:0');

-- ── contacts : envoi public, lecture admin + MFA ────────────
select pg_temp.check('contacts envoi',       'anon',   $q$insert into public.contacts (name, email, message) values ('A', 'a@x.test', 'Bonjour')$q$, 'rows:1');
select pg_temp.check('contacts lecture',     'anon',   'select count(*)::text from public.contacts', '0');
select pg_temp.check('contacts lecture',     'user',   'select count(*)::text from public.contacts', '0');
select pg_temp.check('contacts lecture',     'admin',  'select count(*)::text from public.contacts', '0');
select pg_temp.check('contacts lecture',     'admin2', 'select count(*)::text from public.contacts', '2');

-- ── AI Lab ──────────────────────────────────────────────────
select pg_temp.check('ailab lecture publique (actifs)', 'anon',  'select count(*)::text from public.ailab_projects', '1');
select pg_temp.check('ailab lecture admin (tous)',      'admin', 'select count(*)::text from public.ailab_projects', '2');
select pg_temp.check('ailab insertion',      'user',   $q$insert into public.ailab_projects (slug, title) values ('p', 'pirate')$q$, 'denied');
select pg_temp.check('ailab insertion',      'admin',  $q$insert into public.ailab_projects (slug, title) values ('p', 'sans MFA')$q$, 'denied');
select pg_temp.check('ailab modification',   'admin',  $q$update public.ailab_projects set title = 'x'$q$, 'rows:0');
select pg_temp.check('ailab insertion',      'admin2', $q$insert into public.ailab_projects (slug, title) values ('nouveau', 'Nouveau')$q$, 'rows:1');

-- ── Storage : bucket project-images ─────────────────────────
select pg_temp.check('project-images lecture publique', 'anon',  $q$select count(*)::text from storage.objects where bucket_id = 'project-images'$q$, '1');
select pg_temp.check('project-images téléversement', 'anon',   $q$insert into storage.objects (bucket_id, name) values ('project-images', 'x.jpg')$q$, 'denied');
select pg_temp.check('project-images téléversement', 'user',   $q$insert into storage.objects (bucket_id, name) values ('project-images', 'x.jpg')$q$, 'denied');
select pg_temp.check('project-images téléversement', 'admin',  $q$insert into storage.objects (bucket_id, name) values ('project-images', 'x.jpg')$q$, 'denied');
select pg_temp.check('project-images suppression',   'user',   $q$delete from storage.objects where bucket_id = 'project-images'$q$, 'rows:0');
select pg_temp.check('project-images suppression',   'admin',  $q$delete from storage.objects where bucket_id = 'project-images'$q$, 'rows:0');
select pg_temp.check('project-images téléversement', 'admin2', $q$insert into storage.objects (bucket_id, name) values ('project-images', 'projects/new.jpg')$q$, 'rows:1');
select pg_temp.check('project-images suppression',   'admin2', $q$delete from storage.objects where name = 'projects/new.jpg'$q$, 'rows:1');
select pg_temp.check('autre bucket non affecté',     'user',   $q$insert into storage.objects (bucket_id, name) values ('avatars', 'moi.jpg')$q$, 'rows:1');

-- ── Insertion publique bornée (20261030120200, alerte rls_policy_always_true) ──
-- Placées après les comptages ci-dessus, qu'elles ne faussent donc pas
select pg_temp.check('visits insertion complète (site)', 'anon', $q$insert into public.visits (page, referrer, user_agent, language, screen, country, city) values ('/cv', 'https://www.google.com/', 'Mozilla/5.0 (X11; Linux x86_64)', 'fr-FR', '1920x1080', 'France', 'Paris')$q$, 'rows:1');
select pg_temp.check('visits page vide',            'anon', $q$insert into public.visits (page) values ('')$q$, 'denied');
select pg_temp.check('visits user_agent démesuré',  'anon', $q$insert into public.visits (page, user_agent) values ('/', repeat('x', 3000))$q$, 'denied');
select pg_temp.check('visits date imposée',         'anon', $q$insert into public.visits (page, created_at) values ('/', '2000-01-01')$q$, 'denied');
select pg_temp.check('contacts envoi complet (formulaire)', 'anon', $q$insert into public.contacts (name, email, subject, message) values ('B', 'b@x.test', 'Sujet', repeat('m', 5000))$q$, 'rows:1');
select pg_temp.check('contacts e-mail invalide',    'anon', $q$insert into public.contacts (name, email, message) values ('C', 'pas-un-email', 'Bonjour')$q$, 'denied');
select pg_temp.check('contacts message démesuré',   'anon', $q$insert into public.contacts (name, email, message) values ('C', 'c@x.test', repeat('m', 20001))$q$, 'denied');
select pg_temp.check('contacts nom vide',           'anon', $q$insert into public.contacts (name, email, message) values ('', 'c@x.test', 'Bonjour')$q$, 'denied');
select pg_temp.check('contacts identifiant imposé', 'anon', $q$insert into public.contacts (id, name, email, message) values (gen_random_uuid(), 'C', 'c@x.test', 'Bonjour')$q$, 'denied');
select pg_temp.check('contacts date imposée',       'anon', $q$insert into public.contacts (name, email, message, createdat) values ('C', 'c@x.test', 'Bonjour', '2000-01-01')$q$, 'denied');
select pg_temp.check('contacts envoi',              'user', $q$insert into public.contacts (name, email, message) values ('D', 'd@x.test', 'Connecté')$q$, 'rows:1');
select pg_temp.check('contacts message démesuré',   'user', $q$insert into public.contacts (name, email, message) values ('D', 'd@x.test', repeat('m', 20001))$q$, 'denied');
select pg_temp.check('visits date imposée',         'user', $q$insert into public.visits (page, created_at) values ('/', '2000-01-01')$q$, 'denied');
select pg_temp.check('visits insertion',            'user', $q$insert into public.visits (page) values ('/blog')$q$, 'rows:1');
-- Droits : plus d'INSERT sur toute la table, seulement sur les colonnes envoyées par le site
select pg_temp.check('droit INSERT sur toute la table contacts', 'anon', $q$select has_table_privilege('public.contacts', 'INSERT')::text$q$, 'false');
select pg_temp.check('droit INSERT sur toute la table visits',   'user', $q$select has_table_privilege('public.visits', 'INSERT')::text$q$, 'false');
select pg_temp.check('droit INSERT contacts.message',            'anon', $q$select has_column_privilege('public.contacts', 'message', 'INSERT')::text$q$, 'true');
select pg_temp.check('droit INSERT contacts.id',                 'anon', $q$select has_column_privilege('public.contacts', 'id', 'INSERT')::text$q$, 'false');
select pg_temp.check('droit INSERT visits.created_at',           'user', $q$select has_column_privilege('public.visits', 'created_at', 'INSERT')::text$q$, 'false');
-- Les anciennes politiques « with check (true) » ont été retirées ; restent les politiques bornées
select pg_temp.check('politiques d''insertion « toujours vraies » restantes', 'anon',
  $q$select count(*)::text from pg_policies where schemaname = 'public' and tablename in ('visits', 'contacts') and cmd = 'INSERT'
       and regexp_replace(lower(coalesce(with_check, '')), '\s|\(|\)', '', 'g') = 'true'$q$, '0');
select pg_temp.check('politiques d''insertion bornées', 'anon',
  $q$select string_agg(tablename || ':' || policyname, ',' order by tablename, policyname) from pg_policies
     where schemaname = 'public' and tablename in ('visits', 'contacts') and cmd = 'INSERT'$q$,
  'contacts:p0a1_guard_insert,contacts:p0a1_public_insert,visits:p0a1_guard_insert,visits:p0a1_public_insert');

-- ── is_portfolio_admin() : corps, search_path, propriétaire, droits, réponses ──
select pg_temp.check('is_portfolio_admin : SECURITY DEFINER, search_path vide, propriétaire postgres, sans argument', 'anon',
  $q$select (p.prosecdef and p.proconfig = array['search_path=""'] and pg_get_userbyid(p.proowner) = 'postgres'
             and p.pronargs = 0 and p.prorettype = 'boolean'::regtype and p.provolatile = 's')::text
     from pg_proc p where p.oid = 'public.is_portfolio_admin()'::regprocedure$q$, 'true');
select pg_temp.check('is_portfolio_admin : ne lit que admin_users, pour l''appelant', 'anon',
  $q$select (regexp_replace(prosrc, '\s+', ' ', 'g') = ' select exists ( select 1 from public.admin_users where user_id = (select auth.uid()) ); ')::text
     from pg_proc where oid = 'public.is_portfolio_admin()'::regprocedure$q$, 'true');
select pg_temp.check('is_portfolio_admin : droit d''exécution (PUBLIC retiré)', 'anon',
  $q$select (not has_function_privilege('public', 'public.is_portfolio_admin()', 'EXECUTE')
             and has_function_privilege('anon', 'public.is_portfolio_admin()', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.is_portfolio_admin()', 'EXECUTE'))::text$q$, 'true');
select pg_temp.check('is_portfolio_admin', 'anon',   'select public.is_portfolio_admin()::text', 'false');
select pg_temp.check('is_portfolio_admin', 'user',   'select public.is_portfolio_admin()::text', 'false');
select pg_temp.check('is_portfolio_admin', 'admin',  'select public.is_portfolio_admin()::text', 'true');

-- ── is_portfolio_admin() : pourquoi anon garde EXECUTE (alerte du Security Advisor acceptée) ──
-- Les gardes P0.A1 l'évaluent pour chaque visiteur : sans ce droit, elles échouent au lieu
-- de filtrer. Droit retiré puis rétabli dans la même transaction.
do $$
begin
  revoke execute on function public.is_portfolio_admin() from anon;
  insert into results (label, expected, actual) values ('sans EXECUTE pour anon : lecture de visits [anon]', 'denied',
    pg_temp.run_as('anon', 'select count(*)::text from public.visits'));
  grant execute on function public.is_portfolio_admin() to anon;
end $$;
select pg_temp.check('avec EXECUTE (état prévu) : lecture de visits', 'anon', 'select count(*)::text from public.visits', '0');

-- ── Résultat ────────────────────────────────────────────────
\echo
\echo '=== Résultats des assertions RLS ==='
select case when expected = actual then 'PASS' else 'FAIL' end as statut, label, expected, actual
from results order by id;

do $$
declare
  total int; failed int; bucket record;
begin
  select count(*), count(*) filter (where expected is distinct from actual) into total, failed from results;
  select file_size_limit, allowed_mime_types into bucket from storage.buckets where id = 'project-images';
  if bucket.file_size_limit is distinct from 3145728 then
    failed := failed + 1;
    raise warning 'FAIL limites du bucket project-images : %', bucket;
  end if;
  raise notice 'RLS : % assertions, % échec(s)', total + 1, failed;
  if failed > 0 then
    raise exception 'Échec des tests RLS (% échec(s))', failed;
  end if;
end $$;
