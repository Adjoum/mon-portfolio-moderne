#!/usr/bin/env bash
# Banc de test — sessions administrateur et verrouillage d'inactivité (migration 20261102100000).
# Base Supabase locale, jetable, SANS RÉSEAU (--network none). Aucune donnée ni clé réelle.
#
#   bash supabase/tests/session/run.sh
#
# Étapes : état « production » → migrations P0.A1 → migration de session (×2, idempotence) →
# données inchangées → assertions par identité avec horloge simulée → retour arrière (définition P0.A1
# rétablie, droits MFA sans condition de session) → réapplication.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash (Windows) : ne pas réécrire les chemins

IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.167}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
RLS="$ROOT/supabase/tests/rls"
MIG="$ROOT/supabase/migrations"
RB="$ROOT/supabase/rollback"
C="admin-session-test-$$"
SESSION_MIG="20261102100000_admin_session_idle"

cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql_as() { docker exec -i "$C" psql -X -q -U "$1" -d postgres -v ON_ERROR_STOP=1 "${@:2}"; }
apply_as_postgres() {
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$C" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < "$1"
}
fingerprint() {
  psql_as supabase_admin -At -c "select string_agg(t || '=' || n, ' ' order by t) from (
    select 'projects' t, count(*) n from public.projects union all select 'skills', count(*) from public.skills
    union all select 'visits', count(*) from public.visits union all select 'admin_users', count(*) from public.admin_users) s"
}

echo "▶ Démarrage de $IMAGE (réseau désactivé)"
docker run -d --rm --name "$C" --network none -e POSTGRES_PASSWORD=local-test-only "$IMAGE" >/dev/null
for _ in $(seq 1 90); do
  if docker exec "$C" psql -X -U supabase_admin -d postgres -Atc "select 1 from pg_roles where rolname = 'authenticated'" 2>/dev/null | grep -q 1; then break; fi
  sleep 2
done
sleep 3
for _ in $(seq 1 30); do docker exec "$C" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 1; done

echo "▶ Shim Supabase + état « production » + données factices + migrations P0.A1"
psql_as supabase_admin < "$RLS/00_supabase_shim.sql"
psql_as postgres       < "$RLS/10_production_like_state.sql"
psql_as supabase_admin < "$RLS/15_seed.sql"
apply_as_postgres "$MIG/20261030120000_p0a1_admin_access_control.sql"
apply_as_postgres "$MIG/20261030120100_p0a1_storage_access_control.sql"
apply_as_postgres "$MIG/20261030120200_p0a1_security_advisor.sql"

BEFORE="$(fingerprint)"
echo "▶ Migration $SESSION_MIG, deux fois (idempotence)"
apply_as_postgres "$MIG/$SESSION_MIG.sql"
apply_as_postgres "$MIG/$SESSION_MIG.sql"
AFTER="$(fingerprint)"
if [ "$BEFORE" != "$AFTER" ]; then echo "✗ La migration a modifié des données : $BEFORE → $AFTER"; exit 1; fi
echo "  données inchangées : $AFTER"

echo "▶ Assertions par identité, horloge simulée"
psql_as supabase_admin < "$DIR/assertions.sql"

echo "▶ Retour arrière : définition P0.A1 rétablie"
apply_as_postgres "$RB/$SESSION_MIG.down.sql"
LEFT="$(psql_as supabase_admin -At -c "select count(*) from pg_proc where proname like 'admin\_session\_%' or proname in ('admin_idle_timeout', 'admin_current_session_id')")"
DEF="$(psql_as supabase_admin -At -c "select position('admin_session_active' in prosrc) from pg_proc where proname = 'is_portfolio_admin_mfa'")"
KEPT="$(psql_as supabase_admin -At -c "select count(*) from public.admin_session_activity")"
if [ "$LEFT" != "0" ] || [ "$DEF" != "0" ]; then echo "✗ Retour arrière incomplet ($LEFT fonction(s), condition de session présente : $DEF)"; exit 1; fi
# Après retour arrière : admin MFA retrouve ses droits sans condition de session (comportement P0.A1)
AFTER_RB="$(psql_as supabase_admin -At -c "
  select set_config('request.jwt.claims', '{\"sub\":\"11111111-1111-4111-8111-111111111111\",\"role\":\"authenticated\",\"aal\":\"aal2\"}', true);
  set local role authenticated;
  select public.is_portfolio_admin_mfa();" | tail -1)"
if [ "$AFTER_RB" != "t" ]; then echo "✗ Après retour arrière, is_portfolio_admin_mfa devrait être vrai pour un admin MFA ($AFTER_RB)"; exit 1; fi
echo "  fonctions retirées, is_portfolio_admin_mfa = admin + aal2, $KEPT ligne(s) d'activité conservée(s)"

echo "▶ Réapplication après retour arrière"
apply_as_postgres "$MIG/$SESSION_MIG.sql"
DEF2="$(psql_as supabase_admin -At -c "select position('admin_session_active' in prosrc) > 0 from pg_proc where proname = 'is_portfolio_admin_mfa'")"
if [ "$DEF2" != "t" ]; then echo "✗ Réapplication : condition de session absente"; exit 1; fi
echo "  condition de session rétablie"

echo "✔ Banc de test des sessions administrateur : succès"
