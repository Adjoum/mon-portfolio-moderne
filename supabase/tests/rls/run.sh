#!/usr/bin/env bash
# Banc de test RLS P0.A1 — base Supabase locale, jetable, SANS RÉSEAU (--network none).
# N'utilise aucune donnée ni clé réelle ; ne contacte jamais le projet de production.
#
#   bash supabase/tests/rls/run.sh
#
# Étapes : état « production » vulnérable → preuve de vulnérabilité → migrations (×2,
# idempotence) → données inchangées → assertions par identité → retour arrière → réapplication.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash (Windows) : ne pas réécrire les chemins

IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.167}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
RB="$ROOT/supabase/rollback"
C="p0a1-rls-test-$$"

cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql_as() { docker exec -i "$C" psql -X -q -U "$1" -d postgres -v ON_ERROR_STOP=1 "${@:2}"; }
apply_as_postgres() { # fichier SQL exécuté en postgres, en une transaction (comme le SQL Editor)
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$C"     psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < "$1"
}
count_policies() { psql_as supabase_admin -At -c "select count(*) from pg_policies where policyname like 'p0a1\_%'"; }
data_fingerprint() {
  psql_as supabase_admin -At -c "select string_agg(t || '=' || n, ' ' order by t) from (
    select 'projects' t, count(*) n from public.projects union all select 'skills', count(*) from public.skills
    union all select 'visits', count(*) from public.visits union all select 'contacts', count(*) from public.contacts
    union all select 'admin_users', count(*) from public.admin_users union all select 'ailab_projects', count(*) from public.ailab_projects
    union all select 'objects', count(*) from storage.objects) s"
}

echo "▶ Démarrage de $IMAGE (réseau désactivé)"
docker run -d --rm --name "$C" --network none -e POSTGRES_PASSWORD=local-test-only "$IMAGE" >/dev/null
for _ in $(seq 1 90); do
  if docker exec "$C" psql -X -U supabase_admin -d postgres -Atc "select 1 from pg_roles where rolname = 'authenticated'" 2>/dev/null | grep -q 1; then break; fi
  sleep 2
done
sleep 3   # l'image redémarre Postgres après ses scripts d'initialisation
for _ in $(seq 1 30); do docker exec "$C" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 1; done

echo "▶ Shim Supabase (auth.jwt, storage) + état « production » + données factices"
psql_as supabase_admin < "$DIR/00_supabase_shim.sql"
psql_as postgres       < "$DIR/10_production_like_state.sql"
psql_as supabase_admin < "$DIR/15_seed.sql"

echo "▶ Preuve que l'état simulé est vulnérable avant migration"
cat "$DIR/05_helpers.sql" "$DIR/12_pre_migration_vulnerable.sql" | psql_as supabase_admin

BEFORE="$(data_fingerprint)"
echo "▶ Application des migrations (en postgres, transaction unique), deux fois"
for pass in 1 2; do
  apply_as_postgres "$MIG/20261030120000_p0a1_admin_access_control.sql"
  apply_as_postgres "$MIG/20261030120100_p0a1_storage_access_control.sql"
  apply_as_postgres "$MIG/20261030120200_p0a1_security_advisor.sql"
  echo "  passage $pass : $(count_policies) politiques p0a1_*"
done
AFTER="$(data_fingerprint)"
if [ "$BEFORE" != "$AFTER" ]; then echo "✗ Les migrations ont modifié des données : $BEFORE → $AFTER"; exit 1; fi
echo "  données inchangées : $AFTER"
POLICIES="$(count_policies)"

echo "▶ Assertions par identité (anonyme, utilisateur, utilisateur MFA, admin, admin MFA)"
cat "$DIR/05_helpers.sql" "$DIR/20_assertions.sql" | psql_as supabase_admin

echo "▶ Retour arrière puis réapplication"
apply_as_postgres "$RB/20261030120200_p0a1_security_advisor.down.sql"
apply_as_postgres "$RB/20261030120100_p0a1_storage_access_control.down.sql"
apply_as_postgres "$RB/20261030120000_p0a1_admin_access_control.down.sql"
LEFT="$(count_policies)"
HAS_FN="$(psql_as supabase_admin -At -c "select count(*) from pg_proc where proname = 'is_portfolio_admin_mfa'")"
if [ "$LEFT" != "0" ] || [ "$HAS_FN" != "0" ]; then echo "✗ Retour arrière incomplet ($LEFT politiques, $HAS_FN fonction)"; exit 1; fi
echo "  après retour arrière : 0 politique p0a1_*, fonction MFA supprimée"
apply_as_postgres "$MIG/20261030120000_p0a1_admin_access_control.sql"
apply_as_postgres "$MIG/20261030120100_p0a1_storage_access_control.sql"
apply_as_postgres "$MIG/20261030120200_p0a1_security_advisor.sql"
if [ "$(count_policies)" != "$POLICIES" ]; then echo "✗ Réapplication : nombre de politiques différent"; exit 1; fi
echo "  réapplication : $POLICIES politiques p0a1_*"

echo "✔ Banc de test RLS P0.A1 : succès"
