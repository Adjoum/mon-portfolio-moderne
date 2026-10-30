#!/bin/sh
# Sauvegarde vérifiable d'un projet Supabase, en LECTURE SEULE (pg_dump).
# Exécutée dans un conteneur postgres:17-alpine ; le mot de passe est demandé sans écho
# s'il n'est pas fourni, et n'apparaît ni dans l'historique ni dans les fichiers.
#
#   PGHOST, PGPORT, PGUSER, PGDATABASE, PGSSLMODE : connexion (voir docs/.../18-*.md)
#   /backup : dossier de sortie monté depuis l'hôte
#
# Produit, dans /backup/<horodatage>/ :
#   public.dump            schéma et données de public (format custom, restauration sélective)
#   schema.sql             schéma de public et storage, lisible (politiques comprises)
#   auth-storage-data.sql  comptes, identités, facteurs MFA, buckets et métadonnées des fichiers
#   SHA256SUMS             empreintes, contrôlées par verify-backup.mjs
set -eu
: "${PGHOST:?PGHOST requis}" "${PGUSER:?PGUSER requis}"
export PGPORT="${PGPORT:-5432}" PGDATABASE="${PGDATABASE:-postgres}" PGSSLMODE="${PGSSLMODE:-require}"

if [ -z "${PGPASSWORD:-}" ]; then
  printf 'Mot de passe de la base (non affiché) : '
  stty -echo; read -r PGPASSWORD; stty echo; printf '\n'
  export PGPASSWORD
fi

OUT="/backup/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
echo "▶ Connexion : $(psql -XAtc 'select version()' | cut -c1-60)"

pg_dump --schema=public --format=custom --file="$OUT/public.dump"
pg_dump --schema-only --schema=public --schema=storage --file="$OUT/schema.sql"
pg_dump --data-only \
  --table=auth.users --table=auth.identities --table=auth.mfa_factors \
  --table=storage.buckets --table=storage.objects \
  --file="$OUT/auth-storage-data.sql"

cd "$OUT"
sha256sum public.dump schema.sql auth-storage-data.sql > SHA256SUMS
echo "▶ Sauvegarde terminée : $(basename "$OUT")"
ls -l
