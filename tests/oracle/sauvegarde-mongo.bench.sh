#!/bin/sh
# Banc Docker de deploy/oracle/next.sh : sauvegarder-mongo et verifier-archive.
#
#   sh tests/oracle/sauvegarde-mongo.bench.sh
#
# Docker Desktop (Windows ou macOS) : le conteneur de sauvegarde joint le faux Atlas par
# host.docker.internal. Aucune donnée réelle : un MongoDB jetable protégé par un mot de passe marqué
# « CANARY » joue Atlas (5 collections, 16 documents) ; un faux ancien conteneur porte son adresse.
# next.sh tourne comme sur la VM : Ubuntu 24.04, dash, root, Docker par le socket.
# Ressources du banc nommées portfolio-banc-*, sans volume, retirées à la fin ; l'état Docker
# (conteneurs, réseaux, volumes) est comparé avant et après chaque exécution de next.sh.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DROOT=$(cd "$ROOT" && { pwd -W 2>/dev/null || pwd; })
export MSYS_NO_PATHCONV=1
MONGO=mongo@sha256:94aea1479556ad4e5aba7a31a6d53eb7b0ae76741950da45a13d5df5cddf1b3b
P=portfolio-banc
IMG=$P-ubuntu:24.04
DIR=/tmp/$P-sauvegardes
COPY_DIR=/tmp/$P-copie
PORT=27019
URI="mongodb://admin:CANARYmotdepasse@host.docker.internal:$PORT/adjoumani-blog?authSource=admin"
PASS=0
FAIL=0

ok()     { PASS=$((PASS + 1)); printf '  ✔ %s\n' "$*"; }
ko()     { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$*"; }
expect() { if [ "$1" = "$2" ]; then ok "$3"; else ko "$3 (obtenu : $1, attendu : $2)"; fi }
has()    { if printf '%s\n' "$1" | grep -q -- "$2"; then ok "$3"; else ko "$3 (absent : $2)"; fi }
section() { printf '\n▶ %s\n' "$1"; }
# MongoDB jetable, sans réseau ni volume, pour manipuler les fichiers de l'hôte Docker
tool()  { docker run --rm --log-driver none --network none --tmpfs /data/db --tmpfs /data/configdb -v /tmp:/h "$MONGO" sh -c "$1"; }
# next.sh comme sur la VM
next()  {
  docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock -v "$DROOT:/srv/release:ro" \
    -e NEXT_LEGACY=$P-blog-api -e NEXT_BACKUP_DIR="${BACKUP:-$DIR}" -e NEXT_ATTENDU="${ATTENDU:-}" \
    -e NEXT_EXIGER_COMPTES="${EXIGER:-0}" "$IMG" sh /srv/release/deploy/oracle/next.sh "$@" 2>&1
}
state() { { docker ps -aq --no-trunc; docker network ls -q --no-trunc; docker volume ls -q; } | sort; }
legacy() {
  docker rm -f -v $P-blog-api >/dev/null 2>&1
  docker run -d --name $P-blog-api --log-driver none --tmpfs /data/db --tmpfs /data/configdb \
    -e "MONGODB_URI=$1" --entrypoint sleep "$MONGO" 3600 >/dev/null
}
cleanup() {
  docker rm -f -v $P-atlas $P-blog-api >/dev/null 2>&1
  tool "rm -rf /h/$P-sauvegardes /h/$P-copie" >/dev/null 2>&1
}
trap cleanup EXIT
trap 'exit 130' INT TERM

for n in $P-atlas $P-blog-api portfolio-sauvegarde-mongo portfolio-verif-sauvegarde; do
  if docker inspect "$n" >/dev/null 2>&1; then echo "ARRÊT : le conteneur $n existe déjà"; exit 1; fi
done

section "Préparation (image Ubuntu 24.04, faux Atlas, faux ancien conteneur)"
docker build -q -t "$IMG" - >/dev/null <<'EOF' || { echo "ARRÊT : construction de l'image du banc"; exit 1; }
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      docker.io docker-compose-v2 coreutils ca-certificates && rm -rf /var/lib/apt/lists/*
EOF
docker run -d --name $P-atlas --log-driver none -p 127.0.0.1:$PORT:27017 --tmpfs /data/db --tmpfs /data/configdb \
  -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=CANARYmotdepasse "$MONGO" >/dev/null
for i in $(seq 1 30); do
  docker exec $P-atlas mongosh --quiet -u admin -p CANARYmotdepasse --eval 'db.runCommand({ping: 1}).ok' 2>/dev/null | grep -qx 1 && break
  sleep 1
done
docker exec $P-atlas mongosh --quiet -u admin -p CANARYmotdepasse --authenticationDatabase admin adjoumani-blog --eval '
  db.articles.insertMany([1, 2, 3, 4, 5, 6, 7].map(i => ({ slug: "a" + i, title: i === 1 ? "é \"guillemets\" $x" : "t" + i })));
  db.comments.insertMany([1, 2, 3, 4, 5].map(i => ({ body: "c" + i })));
  db.users.insertMany([{ email: "u1@t", password: "$2b$10$faux" }, { email: "u2@t", password: "$2b$10$faux" }]);
  db.tags.insertMany([{ name: "x", slug: "x" }, { name: "y", slug: "y" }]);
  db.createCollection("admin_audit_logs");
  db.articles.createIndex({ slug: 1 }, { unique: true })' >/dev/null
legacy "$URI"
echo "  faux Atlas : 5 collections, 16 documents"

section "1. Sauvegarde neuve : succès annoncé ⇒ trois fichiers, aucun secret, aucune ressource laissée"
before=$(state)
out=$(next sauvegarder-mongo); code=$?
expect "$code" 0 "code de sortie 0"
has "$out" "VERDICT : aucun point bloquant" "verdict sans point bloquant"
has "$out" "totaux attendus confirmés : 5 collections, 16 documents" "totaux de mongodump retrouvés à la restauration"
A=$(printf '%s\n' "$out" | sed -n 's/^SAUVEGARDE \([^ ]*\) .*/\1/p')
[ -n "$A" ] && ok "archive annoncée : $A" || ko "aucune ligne SAUVEGARDE"
expect "$(tool "cd /h/$P-sauvegardes && for f in $A $A.comptes $A.sha256; do [ -s \$f ] && echo \$f; done | wc -l")" 3 \
  "les trois fichiers annoncés existent et ne sont pas vides"
expect "$(tool "cd /h/$P-sauvegardes && wc -l < $A.sha256")" 2 "empreintes de l'archive et des comptes"
expect "$(printf '%s\n' "$out" | grep -c CANARY)" 0 "aucun secret dans la sortie"
expect "$(state)" "$before" "état Docker identique avant et après"

section "2. Vérification de l'archive neuve (verifier-archive)"
out=$(ATTENDU='5 16' next verifier-archive "$A"); expect "$?" 0 "format complet, totaux 5 16 : accepté"
out=$(ATTENDU='5 15' next verifier-archive "$A"); expect "$?" 1 "totaux erronés 5 15 : refusé"
has "$out" "totaux attendus « 5 15 »" "écart de totaux expliqué"

section "3. Format antérieur (archive et empreinte seules, comme la sauvegarde du 03/11 12:04)"
tool "rm -rf /h/$P-copie && mkdir /h/$P-copie && cp /h/$P-sauvegardes/$A /h/$P-copie/ && cd /h/$P-copie && sha256sum $A > $A.sha256 && : > $A.comptes"
out=$(BACKUP=$COPY_DIR ATTENDU='5 16' next verifier-archive "$A"); expect "$?" 0 "format antérieur avec totaux : accepté"
has "$out" "format antérieur" "format antérieur signalé"
has "$out" "non couvert par les empreintes : ignoré" ".comptes vide non couvert par l'empreinte : ignoré"
out=$(BACKUP=$COPY_DIR EXIGER=1 next verifier-archive "$A"); expect "$?" 1 "format antérieur refusé quand les comptes sont exigés (cas d'une sauvegarde neuve)"

section "4. Sauvegarde annoncée complète mais incomplète"
tool "rm -rf /h/$P-copie && cp -r /h/$P-sauvegardes /h/$P-copie && rm /h/$P-copie/$A.comptes"
out=$(BACKUP=$COPY_DIR next verifier-archive "$A"); expect "$?" 1 "comptes annoncés par l'empreinte mais absents : refusé"
has "$out" "sauvegarde incomplète" "message « sauvegarde incomplète »"
tool "rm -rf /h/$P-copie && cp -r /h/$P-sauvegardes /h/$P-copie && rm /h/$P-copie/$A.sha256"
out=$(BACKUP=$COPY_DIR next verifier-archive "$A"); expect "$?" 1 "fichier d'empreintes absent : refusé"

section "5. Archives altérées"
tool "rm -rf /h/$P-copie && cp -r /h/$P-sauvegardes /h/$P-copie && cd /h/$P-copie && printf X | dd of=$A bs=1 seek=300 conv=notrunc 2>/dev/null"
out=$(BACKUP=$COPY_DIR next verifier-archive "$A"); expect "$?" 1 "un octet modifié : refusé (empreinte)"
tool "rm -rf /h/$P-copie && mkdir /h/$P-copie && cd /h/$P-copie && gunzip -c /h/$P-sauvegardes/$A > raw && sed -i 's/guillemets/GUILLEMETS/' raw && gzip -c raw > $A && rm raw && sha256sum $A > $A.sha256"
out=$(BACKUP=$COPY_DIR next verifier-archive "$A"); expect "$?" 1 "contenu modifié, recompressé, empreinte recalculée : refusé (CRC de la collection)"
has "$out" "CRC mismatch" "CRC de la collection en cause"
tool "rm -rf /h/$P-copie && cp -r /h/$P-sauvegardes /h/$P-copie && cd /h/$P-copie && sed -i -e 's/articles 7/articles 6/' -e 's/comments 5/comments 6/' $A.comptes && sha256sum $A $A.comptes > $A.sha256"
out=$(BACKUP=$COPY_DIR next verifier-archive "$A"); expect "$?" 1 "total juste, répartition fausse entre collections : refusé"

section "6. Restauration forcée avec un réseau : refusée"
script=$(sed -n "/^RESTORE_SCRIPT='/,/^echo \"FORMAT \$mode\"'\$/p" "$ROOT/deploy/oracle/next.sh" | sed -e "1s/^RESTORE_SCRIPT='//" -e "\$s/'\$//")
out=$(docker run --rm --log-driver none --network bridge --tmpfs /data/db --tmpfs /data/configdb -v "$DIR:/backup:ro" "$MONGO" \
  sh -c "$script" sh "$A" auto "" 2>&1); expect "$?" 1 "conteneur avec interface réseau : refus avant toute restauration"
has "$out" "restauration refusée" "message de refus"

section "7. Mauvais mot de passe : arrêt, secret masqué, rien de laissé"
legacy "$(printf '%s' "$URI" | sed 's/CANARYmotdepasse/CANARYfaux/')"
n0=$(tool "ls /h/$P-sauvegardes | wc -l"); before=$(state)
out=$(next sauvegarder-mongo); expect "$?" 1 "code de sortie 1"
has "$out" "<masqué>" "identifiants masqués dans l'erreur"
expect "$(printf '%s\n' "$out" | grep -c CANARY)" 0 "aucun secret dans la sortie"
expect "$(tool "ls /h/$P-sauvegardes | wc -l")" "$n0" "aucun fichier partiel"
expect "$(state)" "$before" "état Docker identique avant et après"
legacy "$URI"

section "8. Interruption pendant la sauvegarde"
before=$(state)
docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock -v "$DROOT:/srv/release:ro" \
  -e NEXT_LEGACY=$P-blog-api -e NEXT_BACKUP_DIR=$DIR "$IMG" \
  sh -c 'timeout -s TERM 3 sh /srv/release/deploy/oracle/next.sh sauvegarder-mongo >/dev/null 2>&1; sleep 4'
expect "$(state)" "$before" "ressources temporaires retirées après interruption"

printf '\nBILAN : %s réussies, %s en échec\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
