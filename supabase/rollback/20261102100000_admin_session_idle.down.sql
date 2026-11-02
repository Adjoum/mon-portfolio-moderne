-- Retour arrière de 20261102100000_admin_session_idle.sql (verrouillage d'inactivité côté serveur).
-- Rétablit is_portfolio_admin_mfa() dans sa définition P0.A1 (admin + aal2, sans condition de session)
-- AVANT de retirer les fonctions de session : aucune politique RLS ne référence jamais une fonction absente.
-- La table admin_session_activity est supprimée : elle ne contient que des horodatages de sessions
-- d'administration (aucune donnée métier, aucun compte), sans objet une fois la fonction retirée.
-- La base retrouve ainsi exactement son état d'avant la migration (vérifié par la répétition générale).
-- À appliquer seulement APRÈS avoir redéployé un blog-api qui n'appelle plus admin_session_status
-- (sinon les routes d'administration répondent 503, refus par défaut).

create or replace function public.is_portfolio_admin_mfa()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and public.is_portfolio_admin();
$$;

drop function if exists public.admin_session_end(text);
drop function if exists public.admin_session_touch();
drop function if exists public.admin_session_begin();
drop function if exists public.admin_session_status();
drop function if exists public.admin_session_guard();
drop function if exists public.admin_session_state(uuid);
drop function if exists public.admin_session_active();
drop function if exists public.admin_current_session_id();
drop table if exists public.admin_session_activity;
drop function if exists public.admin_idle_timeout();
