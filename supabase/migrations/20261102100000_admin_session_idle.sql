-- ═══════════════════════════════════════════════════════════════════════════
-- P2 — Sessions administrateur : verrouillage après 10 minutes d'inactivité, côté serveur
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : 20261030120000_p0a1_admin_access_control.sql (is_portfolio_admin, is_portfolio_admin_mfa).
--
-- Pourquoi : un minuteur dans le navigateur n'est pas une protection. Un jeton d'accès Supabase reste
-- techniquement valide jusqu'à son expiration (1 h) même après une déconnexion locale. Le délai
-- d'inactivité natif de Supabase Auth est réservé aux offres payantes ; il est donc appliqué ici.
--
-- Principe :
--   * une ligne par session Supabase Auth (claim signé « session_id » du JWT), créée après la MFA ;
--   * seules les interactions réelles de l'administrateur la prolongent (admin_session_touch),
--     jamais les requêtes automatiques (les API ne font que lire l'état) ;
--   * au-delà de 10 minutes sans interaction, la session est définitivement close : elle ne peut
--     pas être ressuscitée, il faut se reconnecter (nouvelle session, nouvelle ligne) ;
--   * is_portfolio_admin_mfa() exige désormais une session active : toutes les politiques RLS et
--     fonctions d'administration existantes en héritent sans être modifiées.
--
-- Ordre de déploiement : nouveau frontend (qui ouvre et prolonge la session) AVANT cette migration,
-- puis blog-api. Sinon l'ancien dashboard serait refusé dès l'application.
-- Idempotente. Ne modifie aucune donnée existante.
-- Retour arrière : supabase/rollback/20261102100000_admin_session_idle.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Délai d'inactivité : une seule source de vérité ─────────────────────
create or replace function public.admin_idle_timeout()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '10 minutes' $$;

-- ── 2. Activité des sessions administrateur ────────────────────────────────
create table if not exists public.admin_session_activity (
  session_id        uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  started_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  ended_at          timestamptz,
  end_reason        text check (end_reason in ('idle_timeout', 'logout', 'admin_revoked'))
);
create index if not exists admin_session_activity_user on public.admin_session_activity (user_id, last_activity_at desc);

-- Aucun accès direct : uniquement par les fonctions ci-dessous (même garde que admin_users)
alter table public.admin_session_activity enable row level security;
revoke all on table public.admin_session_activity from public, anon, authenticated;
drop policy if exists p2_admin_session_no_client_access on public.admin_session_activity;
create policy p2_admin_session_no_client_access
  on public.admin_session_activity
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ── 3. Session courante (claims signés du JWT, jamais une valeur envoyée par le client) ──
create or replace function public.admin_current_session_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := (select auth.jwt()) ->> 'session_id';
begin
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

-- Vrai si la session courante est une session administrateur ouverte et active.
-- Utilisée par les politiques RLS (via is_portfolio_admin_mfa) : lecture seule, aucun effet.
create or replace function public.admin_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_session_activity a
    where a.session_id = public.admin_current_session_id()
      and a.user_id    = (select auth.uid())
      and a.ended_at is null
      and a.last_activity_at > now() - public.admin_idle_timeout()
  );
$$;

-- ── 4. Administrateur + MFA + session active ───────────────────────────────
-- Même définition qu'en P0.A1, complétée par la condition de session : toutes les politiques
-- « (select public.is_portfolio_admin_mfa()) » refusent une session inactive.
create or replace function public.is_portfolio_admin_mfa()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and public.is_portfolio_admin()
     and public.admin_session_active();
$$;

-- ── 5. État renvoyé au navigateur et à blog-api ────────────────────────────
-- active            : la session peut agir
-- remaining_seconds : secondes avant verrouillage sans nouvelle interaction (horloge du serveur)
-- reason            : motif si inactive (not_started, idle_timeout, logout, admin_revoked, not_admin, mfa_required)
create or replace function public.admin_session_state(p_sid uuid)
returns table (active boolean, remaining_seconds integer, idle_limit_seconds integer, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.admin_session_activity;
  limit_s constant integer := extract(epoch from public.admin_idle_timeout())::integer;
begin
  select * into r from public.admin_session_activity a where a.session_id = p_sid and a.user_id = (select auth.uid());
  if not found then
    return query select false, 0, limit_s, 'not_started'::text;
  elsif r.ended_at is not null then
    return query select false, 0, limit_s, coalesce(r.end_reason, 'logout');
  elsif r.last_activity_at <= now() - public.admin_idle_timeout() then
    return query select false, 0, limit_s, 'idle_timeout'::text;
  else
    return query select true,
      greatest(0, ceil(extract(epoch from (r.last_activity_at + public.admin_idle_timeout() - now())))::integer),
      limit_s, null::text;
  end if;
end;
$$;
revoke all on function public.admin_session_state(uuid) from public, anon, authenticated;

-- Contrôle commun : administrateur avec MFA, session identifiable
create or replace function public.admin_session_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sid uuid := public.admin_current_session_id();
begin
  if not public.is_portfolio_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if sid is null then
    raise exception 'session_id_missing' using errcode = '42501';
  end if;
  return sid;
end;
$$;
revoke all on function public.admin_session_guard() from public, anon, authenticated;

-- Lecture seule de l'état (aucune prolongation) : blog-api et rechargement de page
create or replace function public.admin_session_status()
returns table (active boolean, remaining_seconds integer, idle_limit_seconds integer, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_portfolio_admin() then
    return query select false, 0, extract(epoch from public.admin_idle_timeout())::integer, 'not_admin'::text;
    return;
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    return query select false, 0, extract(epoch from public.admin_idle_timeout())::integer, 'mfa_required'::text;
    return;
  end if;
  return query select * from public.admin_session_state(public.admin_current_session_id());
end;
$$;

-- Ouverture après la MFA. N'existe qu'une fois par session : ne prolonge ni ne rouvre jamais
-- une session existante (close ou expirée).
create or replace function public.admin_session_begin()
returns table (active boolean, remaining_seconds integer, idle_limit_seconds integer, reason text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sid uuid := public.admin_session_guard();
begin
  insert into public.admin_session_activity (session_id, user_id)
  values (sid, (select auth.uid()))
  on conflict (session_id) do nothing;

  -- Entretien : l'historique au-delà de 30 jours n'est plus utile
  delete from public.admin_session_activity
  where last_activity_at < now() - interval '30 days';

  return query select * from public.admin_session_state(sid);
end;
$$;

-- Interaction réelle de l'administrateur : prolonge une session encore active, sinon la clôt.
create or replace function public.admin_session_touch()
returns table (active boolean, remaining_seconds integer, idle_limit_seconds integer, reason text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sid uuid := public.admin_session_guard();
begin
  -- Verrou de ligne : un « touch » concurrent ne peut pas ressusciter une session qui vient d'expirer
  perform 1 from public.admin_session_activity a where a.session_id = sid for update;

  update public.admin_session_activity a
     set last_activity_at = now()
   where a.session_id = sid
     and a.user_id = (select auth.uid())
     and a.ended_at is null
     and a.last_activity_at > now() - public.admin_idle_timeout();

  if not found then
    -- Expirée : clôture définitive, horodatée à l'instant réel d'expiration
    update public.admin_session_activity a
       set ended_at   = a.last_activity_at + public.admin_idle_timeout(),
           end_reason = 'idle_timeout'
     where a.session_id = sid
       and a.ended_at is null
       and a.last_activity_at <= now() - public.admin_idle_timeout();
  end if;

  return query select * from public.admin_session_state(sid);
end;
$$;

-- Fin explicite (déconnexion, verrouillage du navigateur). Toujours sans effet sur une autre session.
create or replace function public.admin_session_end(p_reason text default 'logout')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sid uuid := public.admin_current_session_id();
begin
  if sid is null then
    return;
  end if;
  update public.admin_session_activity a
     set ended_at   = least(now(), a.last_activity_at + public.admin_idle_timeout()),
         end_reason = case when p_reason in ('idle_timeout', 'logout') then p_reason else 'logout' end
   where a.session_id = sid
     and a.user_id = (select auth.uid())
     and a.ended_at is null;
end;
$$;

-- ── 6. Droits ──────────────────────────────────────────────────────────────
revoke all on function public.admin_idle_timeout()        from public;
revoke all on function public.admin_current_session_id()  from public;
revoke all on function public.admin_session_active()      from public;
-- Supabase accorde EXECUTE à anon par privilège par défaut : retrait explicite
revoke all on function public.admin_session_status()      from public, anon;
revoke all on function public.admin_session_begin()       from public, anon;
revoke all on function public.admin_session_touch()       from public, anon;
revoke all on function public.admin_session_end(text)     from public, anon;

-- anon et authenticated évaluent les politiques RLS (is_portfolio_admin_mfa) : renvoie false pour eux
grant execute on function public.admin_idle_timeout()       to anon, authenticated;
grant execute on function public.admin_current_session_id() to anon, authenticated;
grant execute on function public.admin_session_active()     to anon, authenticated;
-- Ouverture, prolongation, état, fin : uniquement un utilisateur connecté (contrôles internes)
grant execute on function public.admin_session_status()     to authenticated;
grant execute on function public.admin_session_begin()      to authenticated;
grant execute on function public.admin_session_touch()      to authenticated;
grant execute on function public.admin_session_end(text)    to authenticated;
