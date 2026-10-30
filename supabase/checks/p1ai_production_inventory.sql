-- Inventaire Supabase AVANT les migrations P0.A1, P0.CV et centre IA : LECTURE SEULE.
--
-- À exécuter dans le SQL Editor (rôle postgres). Une seule requête SELECT : aucune écriture,
-- aucun verrou durable. Le résultat est UN document JSON à copier dans un fichier local
-- (supabase/checks/results/, ignoré par Git).
--
-- Il ne contient AUCUNE donnée personnelle ni secret : pas d'e-mail, pas d'identifiant
-- d'utilisateur, pas de contenu de ligne, pas de valeur Vault. Uniquement la structure
-- (tables, colonnes, politiques, fonctions, droits) et des nombres de lignes.
-- Les définitions complètes ne sont lues que pour les fonctions que les migrations remplacent.

with
tables as (
  select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
         -- Politiques et RLS exigent d'agir en propriétaire (rôle courant ou l'un de ses rôles)
         pg_get_userbyid(c.relowner) as owner, pg_has_role(current_user, c.relowner, 'USAGE') as owner_ok
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in ('public', 'storage', 'ai_private')
),
counted as (
  select schema, name, rls, force_rls, owner, owner_ok,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schema, name), false, true, '')))[1]::text::bigint as rows
  from tables
),
auth_counts as (
  select t.name,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from auth.%I', t.name), false, true, '')))[1]::text::bigint as rows
  from (values ('users'), ('identities'), ('mfa_factors'), ('sessions'), ('refresh_tokens')) t(name)
  where to_regclass(format('auth.%I', t.name)) is not null
),
watched_functions as (
  select unnest(array['is_portfolio_admin', 'is_portfolio_admin_mfa', 'visit_count',
                      'cv_active', 'cv_publish_version', 'cv_restore_version', 'cv_object_is_referenced']) as name
),
-- Fonctions de déclencheur dont 20261030120200 fige le search_path : corps relevé pour examen
-- (champ « source », hors restauration : leur retour arrière ne fait que retirer le réglage)
trigger_functions as (
  select unnest(array['set_updatedat', 'update_updatedat_column']) as name
)
select jsonb_pretty(jsonb_build_object(
  'inventory_version', 'p1ai.1',
  'generated_at', now(),
  'server', jsonb_build_object(
    'version', current_setting('server_version'),
    'version_num', current_setting('server_version_num')::int,
    'current_user', current_user,
    'can_create_roles', (select rolcreaterole or rolsuper from pg_roles where rolname = current_user),
    'database_size_mb', round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1),
    'log_parameter_max_length_on_error', current_setting('log_parameter_max_length_on_error', true),
    'log_min_error_statement', current_setting('log_min_error_statement', true),
    -- Journalisation des requêtes : une clé API passée en paramètre ne doit jamais y figurer
    'log_statement', current_setting('log_statement', true),
    'log_min_duration_statement', current_setting('log_min_duration_statement', true),
    'log_parameter_max_length', current_setting('log_parameter_max_length', true),
    'pgaudit_log', current_setting('pgaudit.log', true),
    'pgaudit_log_parameter', current_setting('pgaudit.log_parameter', true),
    -- Réglages propres à un rôle (alter role … set), qui priment sur ceux du serveur
    'role_settings', (select coalesce(jsonb_agg(jsonb_build_object('role', r.rolname, 'settings', s.setconfig) order by r.rolname), '[]')
                      from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
                      where r.rolname in ('postgres', 'authenticator', 'authenticated', 'anon', 'service_role', 'ai_backend'))
  ),
  'extensions', (select coalesce(jsonb_agg(jsonb_build_object('name', e.extname, 'version', e.extversion, 'schema', n.nspname) order by e.extname), '[]')
                 from pg_extension e join pg_namespace n on n.oid = e.extnamespace),
  'schemas', (select coalesce(jsonb_agg(nspname order by nspname), '[]') from pg_namespace
              where nspname not like 'pg\_%' and nspname <> 'information_schema'),
  'roles', (select coalesce(jsonb_agg(jsonb_build_object('name', rolname, 'login', rolcanlogin, 'createrole', rolcreaterole) order by rolname), '[]')
            from pg_roles where rolname in ('postgres', 'ai_backend', 'anon', 'authenticated', 'service_role', 'authenticator', 'supabase_admin')),
  'tables', (select coalesce(jsonb_agg(jsonb_build_object('schema', schema, 'name', name, 'rls', rls, 'force_rls', force_rls, 'rows', rows, 'owner', owner, 'owner_ok', owner_ok) order by schema, name), '[]')
             from counted),
  'columns', (select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type,
                                                            'nullable', is_nullable = 'YES', 'default', column_default) order by table_name, ordinal_position), '[]')
              from information_schema.columns where table_schema = 'public'),
  'constraints', (select coalesce(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'type', contype,
                                                                'definition', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname), '[]')
                  from pg_constraint where connamespace = 'public'::regnamespace),
  'policies', (select coalesce(jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'name', policyname, 'permissive', permissive,
                                                             'roles', roles, 'cmd', cmd, 'using', qual, 'with_check', with_check) order by schemaname, tablename, policyname), '[]')
               from pg_policies where schemaname in ('public', 'storage')),
  'functions', (select coalesce(jsonb_agg(jsonb_build_object(
                  'schema', n.nspname, 'name', p.proname, 'arguments', pg_get_function_identity_arguments(p.oid),
                  'returns', pg_get_function_result(p.oid), 'security_definer', p.prosecdef, 'owner', pg_get_userbyid(p.proowner),
                  'owner_ok', pg_has_role(current_user, p.proowner, 'USAGE'),
                  'settings', p.proconfig, 'acl', p.proacl::text,
                  'definition', case when p.proname in (select name from watched_functions) then pg_get_functiondef(p.oid) end,
                  'source', case when p.proname in (select name from trigger_functions) then p.prosrc end
                ) order by n.nspname, p.proname), '[]')
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname in ('public', 'ai_private', 'portfolio_private') and p.prokind = 'f'),
  'triggers', (select coalesce(jsonb_agg(jsonb_build_object('table', tgrelid::regclass::text, 'name', tgname, 'definition', pg_get_triggerdef(oid)) order by tgrelid::regclass::text, tgname), '[]')
               from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'pg\_%'
                 and (select relnamespace from pg_class where oid = tgrelid) in ('public'::regnamespace, 'storage'::regnamespace)),
  'grants', (select coalesce(jsonb_agg(jsonb_build_object('schema', table_schema, 'table', table_name, 'grantee', grantee, 'privileges', privileges) order by table_schema, table_name, grantee), '[]')
             from (select table_schema, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
                   from information_schema.role_table_grants
                   where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated', 'service_role')
                   group by 1, 2, 3) g),
  'buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public, 'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types,
                                                            'objects', (select count(*) from storage.objects o where o.bucket_id = b.id),
                                                            'bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = b.id),
                                                            -- Fichiers existants (nombres seulement, aucun nom) : types et tailles,
                                                            -- à comparer aux limites prévues avant de les appliquer
                                                            'types', (select coalesce(jsonb_object_agg(t.mime, t.n), '{}') from (
                                                                        select coalesce(o.metadata ->> 'mimetype', 'inconnu') as mime, count(*) as n
                                                                        from storage.objects o
                                                                        where o.bucket_id = b.id and o.name not like '%.emptyFolderPlaceholder'
                                                                        group by 1) t),
                                                            'largest_bytes', (select coalesce(max((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = b.id),
                                                            'over_3mb', (select count(*) from storage.objects o where o.bucket_id = b.id and (o.metadata ->> 'size')::bigint > 3145728))
                                         order by b.id), '[]')
              from storage.buckets b),
  'auth', jsonb_build_object(
    'tables', (select coalesce(jsonb_object_agg(name, rows), '{}') from auth_counts),
    'verified_totp_factors', case when to_regclass('auth.mfa_factors') is null then null else
      (xpath('/row/c/text()', query_to_xml($q$select count(*) as c from auth.mfa_factors where status = 'verified' and factor_type = 'totp'$q$, false, true, '')))[1]::text::bigint end,
    'admins', case when to_regclass('public.admin_users') is null then null else
      (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.admin_users', false, true, '')))[1]::text::bigint end,
    'admins_with_verified_totp', case when to_regclass('public.admin_users') is null or to_regclass('auth.mfa_factors') is null then null else
      (xpath('/row/c/text()', query_to_xml($q$select count(distinct a.user_id) as c from public.admin_users a join auth.mfa_factors f on f.user_id = a.user_id
                                              where f.status = 'verified' and f.factor_type = 'totp'$q$, false, true, '')))[1]::text::bigint end
  ),
  'vault', jsonb_build_object(
    'schema_present', to_regnamespace('vault') is not null,
    'secrets', case when to_regclass('vault.secrets') is null then null
                    when has_table_privilege('vault.secrets', 'select') then
                      (xpath('/row/c/text()', query_to_xml('select count(*) as c from vault.secrets', false, true, '')))[1]::text::bigint end,
    'create_secret_executable', case when to_regprocedure('vault.create_secret(text,text,text,uuid)') is null then null
                                     else has_function_privilege('vault.create_secret(text,text,text,uuid)', 'execute') end
  ),
  'migration_history', case when to_regclass('supabase_migrations.schema_migrations') is null then null else
    (xpath('/row/v/text()', query_to_xml($q$select string_agg(version, ',' order by version) as v from supabase_migrations.schema_migrations$q$, false, true, '')))[1]::text end
)) as inventory;
