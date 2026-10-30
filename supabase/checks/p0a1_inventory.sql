-- P0.A1 — Inventaire de sécurité Supabase : LECTURE SEULE (aucune modification)
-- À exécuter dans le SQL Editor AVANT et APRÈS l'application des migrations P0.A1.
-- Le résultat ne contient aucun secret ; il peut être partagé pour revue
-- (sauf la requête 7 qui liste des e-mails : à masquer avant partage).

-- 1. RLS par table
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname in ('public', 'storage')
order by 1, 2;

-- 2. Politiques existantes (permissive = PERMISSIVE ou RESTRICTIVE)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by 1, 2, 3;

-- 3. Privilèges des rôles clients sur les tables
select table_schema, table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated')
group by 1, 2, 3
order by 1, 2, 3;

-- 4. Fonctions du schéma public (security definer, propriétaire, search_path)
select p.proname, p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner,
       p.proconfig as settings, p.proacl as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1;

-- 5. Buckets
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by 1;

-- 6. Nombre d'administrateurs (doit être 1 si vous êtes seul)
select count(*) as admin_count from public.admin_users;

-- 7. Comptes Supabase existants (repérer d'éventuels comptes inconnus)
select id, email, created_at, last_sign_in_at,
       exists (select 1 from public.admin_users a where a.user_id = u.id) as is_admin,
       exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as has_mfa
from auth.users u
order by created_at;

-- 8. Après application : politiques P0.A1 attendues (≈ 50 lignes)
select schemaname, tablename, policyname, permissive, cmd
from pg_policies
where policyname like 'p0a1\_%'
order by 1, 2, 3;
