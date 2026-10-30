#!/usr/bin/env bash
# Banc SQL du centre d'administration multi-IA — base Supabase locale, jetable, SANS RÉSEAU.
# Aucune donnée ni clé réelle ; ne contacte jamais le projet de production.
#
#   bash supabase/tests/ai/run.sh
#
# Étapes : prérequis P0.A1 → migrations (×2, idempotence) → assertions par identité
# → retour arrière → réapplication.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash (Windows) : ne pas réécrire les chemins

IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.167}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
RB="$ROOT/supabase/rollback"
C="ai-sql-test-$$"
AI_MIGRATIONS="20261030170000_ai_control_center_schema 20261030170100_ai_admin_functions 20261030170200_ai_runtime_functions 20261030170300_ai_initial_catalog"

cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql_as() { docker exec -i "$C" psql -X -q -U "$1" -d postgres -v ON_ERROR_STOP=1 "${@:2}"; }
apply_as_postgres() {
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$C" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < "$1"
}

echo "▶ Démarrage de $IMAGE (réseau désactivé)"
docker run -d --rm --name "$C" --network none -e POSTGRES_PASSWORD=local-test-only "$IMAGE" >/dev/null
until docker logs "$C" 2>&1 | grep -q 'PostgreSQL init process complete'; do :; done
until docker exec "$C" pg_isready -U postgres -h localhost >/dev/null 2>&1; do :; done
until docker exec "$C" psql -X -U supabase_admin -d postgres -Atc "select 1 from pg_roles where rolname = 'authenticated'" 2>/dev/null | grep -q 1; do :; done

echo "▶ Prérequis : état « production » puis migrations P0.A1"
psql_as supabase_admin < "$DIR/../rls/00_supabase_shim.sql"
psql_as postgres       < "$DIR/../rls/10_production_like_state.sql"
apply_as_postgres "$MIG/20261030120000_p0a1_admin_access_control.sql"

echo "▶ Migrations du centre IA, deux fois (idempotence)"
for pass in 1 2; do
  for m in $AI_MIGRATIONS; do apply_as_postgres "$MIG/$m.sql"; done
done

echo "▶ Assertions"
OUT="$(docker exec -i -e PGOPTIONS="-c client_min_messages=notice" "$C" psql -X -q -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < "$DIR/assertions.sql" 2>&1 || true)"
echo "$OUT" | sed -n 's/^.*NOTICE:  //p' | grep -E '^(OK|KO) ' || true
echo "$OUT" | grep -E 'ERROR|CONTEXT' | head -20 || true
OK=$(echo "$OUT" | grep -c 'NOTICE:  OK ' || true)
KO=$(echo "$OUT" | grep -c 'NOTICE:  KO ' || true)

echo "▶ Retour arrière puis réapplication"
apply_as_postgres "$RB/20261030170000_ai_control_center.down.sql"
LEFT=$(psql_as supabase_admin -At -c "select count(*) from information_schema.tables where table_name like 'ai\_%' and table_schema in ('public','ai_private')")
SECRETS=$(psql_as supabase_admin -At -c "select count(*) from vault.secrets where name like 'ai_provider_%'")
ROLE=$(psql_as supabase_admin -At -c "select count(*) from pg_roles where rolname = 'ai_backend'")
[ "$LEFT" = "0" ] && echo "OK retour arrière : aucune table restante" && OK=$((OK+1)) || { echo "KO tables restantes : $LEFT"; KO=$((KO+1)); }
[ "$SECRETS" = "0" ] && echo "OK retour arrière : aucune clé restante dans Vault" && OK=$((OK+1)) || { echo "KO clés restantes : $SECRETS"; KO=$((KO+1)); }
[ "$ROLE" = "0" ] && echo "OK retour arrière : rôle ai_backend retiré" && OK=$((OK+1)) || { echo "KO rôle restant"; KO=$((KO+1)); }
for m in $AI_MIGRATIONS; do apply_as_postgres "$MIG/$m.sql"; done
echo "OK réapplication après retour arrière"; OK=$((OK+1))

echo
echo "BILAN : $OK réussies, $KO échouées"
[ "$KO" = "0" ] && [ "$OK" -gt 100 ]
