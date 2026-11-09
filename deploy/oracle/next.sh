#!/bin/sh
# deploy/oracle/next.sh — nouvelle API du portfolio EN PARALLÈLE de l'actuelle, sur la VM Oracle.
#
#   sh deploy/oracle/next.sh recuperer <commit>   SANS sudo : copie du commit, publié sur la branche de release (GitHub)
#   sudo sh deploy/oracle/next.sh inventaire   LECTURE SEULE : état de la VM à transmettre avant le GO
#   sudo sh deploy/oracle/next.sh env          crée le fichier d'environnement depuis le conteneur blog-api
#   sudo sh deploy/oracle/next.sh env-definir <NOM>   ajoute ou remplace une variable, saisie sans écho, relue par Compose
#   sudo sh deploy/oracle/next.sh sauvegarder-mongo   mongodump (lecture seule) puis restauration d'essai isolée
#   sh deploy/oracle/next.sh verifier-archive <archive>   restauration d'essai d'une archive copiée (NEXT_BACKUP_DIR)
#   sudo sh deploy/oracle/next.sh verifier     LECTURE SEULE : prérequis du lancement (code 1 si bloquant)
#   sudo sh deploy/oracle/next.sh verifier-tls [hôte]   LECTURE SEULE : TLS du pooler Supabase vérifié avec le certificat
#   sudo sh deploy/oracle/next.sh construire   construit portfolio-next/{blog-api,latex-runner,cv-extractor}:<commit>
#   sudo sh deploy/oracle/next.sh demarrer     démarre les trois conteneurs, blog-api-next sur 127.0.0.1:5001
#   sudo sh deploy/oracle/next.sh controler    LECTURE SEULE : santé, isolement, blog-api et autres conteneurs intacts
#   sudo sh deploy/oracle/next.sh arreter      retour arrière : retire les trois conteneurs et leurs réseaux
#   sudo sh deploy/oracle/next.sh historique   LECTURE SEULE : version en service, journal, copies et images disponibles
#
# À lancer depuis une copie du commit validé (deploy/oracle/README.md), jamais depuis le dépôt de
# l'ancien déploiement. Commit : variable NEXT_TAG ou fichier .next-commit à la racine de la copie.
# Les copies viennent du dépôt de livraison par « recuperer » (dépôt nu en lecture seule, jamais de git pull).
# Ne touche jamais : le conteneur blog-api ni son image, le port 5000, nginx, les autres projets,
# aucun volume. Aucune commande Docker globale. Aucune valeur secrète affichée ni passée en argument.
set -u

PROJECT=portfolio-next
LEGACY=${NEXT_LEGACY:-blog-api}
LEGACY_DIR=${LEGACY_DIR:-/home/ubuntu/adjoumani-portfolio}
CONTAINERS="blog-api-next portfolio-latex-runner portfolio-cv-extractor"
NETWORKS="portfolio-next_egress portfolio-next_latex portfolio-next_extract"
IMAGES="blog-api latex-runner cv-extractor"
PORT=${NEXT_PORT:-5001}
ENV_FILE=${NEXT_ENV_FILE:-/etc/portfolio-next/api.env}
# Certificat racine public de Supabase (Database > SSL), monté en lecture seule dans blog-api-next
CA_FILE=${NEXT_SUPABASE_CA:-/etc/portfolio-next/supabase-ca.crt}
STATE_DIR=${NEXT_STATE_DIR:-/var/lib/portfolio-next}
BACKUP_DIR=${NEXT_BACKUP_DIR:-/var/backups/portfolio-next}
# Épinglée par empreinte (index multi-architecture) : aucune étiquette mongo:* n'est créée ni
# déplacée sur la VM, qu'un autre projet l'utilise ou non
MONGO_IMAGE=mongo@sha256:94aea1479556ad4e5aba7a31a6d53eb7b0ae76741950da45a13d5df5cddf1b3b
# Variables reprises du conteneur blog-api ; les autres (anciennes clés IA, etc.) ne le sont pas
COPY="FRONTEND_URL MONGODB_URI JWT_SECRET JWT_EXPIRES_IN ADMIN_SECRET SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_JWT_SECRET PINECONE_API_KEY PINECONE_INDEX CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET"
REQUIRED="MONGODB_URI JWT_SECRET FRONTEND_URL"
# Lancement isolé : aucun compte créé, aucune écriture dans la base de connaissances, aucune IA
FORCED="ADMIN_BOOTSTRAP_ENABLED KNOWLEDGE_WRITE_ENABLED AI_ENABLED"
MIN_DISK_GIB=6
MIN_MEM_GIB=3
# Livraison : dépôt nu qui ne fait que lire la branche de release, copies à côté de lui
NEXT_HOME=${NEXT_HOME:-$HOME/portfolio-next}
DEPOT="$NEXT_HOME/depot.git"
BRANCH=${NEXT_BRANCHE:-release/portfolio-next}

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$HERE/../.." && pwd -P)
COMPOSE_FILE="$HERE/compose.next.yml"
TAG=${NEXT_TAG:-$(cat "$ROOT/.next-commit" 2>/dev/null || true)}
BLOCKERS=0

section() { printf '\n=== %s ===\n' "$1"; }
ok()      { printf '  ok        %s\n' "$*"; }
warn()    { printf '  ATTENTION %s\n' "$*"; }
block()   { printf '  BLOQUANT  %s\n' "$*"; BLOCKERS=$((BLOCKERS + 1)); }
die()     { printf 'ARRÊT : %s\n' "$*" >&2; exit 1; }
verdict() {
  if [ "$BLOCKERS" -eq 0 ]; then printf '\nVERDICT : aucun point bloquant\n'; return 0; fi
  printf '\nVERDICT : %s point(s) bloquant(s)\n' "$BLOCKERS"; return 1
}

need_root() { [ "$(id -u)" = 0 ] || die "lancer avec sudo"; }
need_tag()  { printf '%s' "$TAG" | grep -Eq '^[0-9a-f]{7,40}$' || die "commit inconnu : NEXT_TAG=<commit> ou fichier .next-commit"; }
not_legacy_dir() {
  legacy=$(cd "$LEGACY_DIR" 2>/dev/null && pwd -P || true)
  [ "$ROOT" != "$legacy" ] || die "copie de l'ancien déploiement ($LEGACY_DIR) : utiliser une copie séparée du commit validé"
}

dc()       { NEXT_TAG="$TAG" NEXT_ENV_FILE="$ENV_FILE" NEXT_PORT="$PORT" NEXT_SUPABASE_CA="$CA_FILE" docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
http()     { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" || true; }
label_of() { docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$1" 2>/dev/null; }
# État de santé, vide si le conteneur n'a pas de contrôle de santé
health()   { docker inspect --format '{{with index .State "Health"}}{{.Status}}{{end}}' "$1" 2>/dev/null; }
# Racine Docker, ou / si elle n'est pas visible d'ici
docker_root() {
  d=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)
  if [ -n "$d" ] && [ -d "$d" ]; then echo "$d"; else echo /; fi
}
port_busy(){ ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }
env_of()   { docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1"; }
# NOM=valeur → NOM, sans jamais afficher la valeur ; doublons signalés
names() {
  sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*/\2/p' | sort | uniq -c |
    awk '{ printf "%s%s ", $2, ($1 > 1 ? "(×" $1 ")" : "") } END { print "" }'
}
# Masque les affectations, les identifiants dans les URL, le mot de passe de docker login et les
# longues chaînes sans séparateur (jetons, clés). Les noms d'options (--name=…) restent lisibles.
mask() {
  sed -E \
    -e 's#(://)[^/@[:space:]]+@#\1<masqué>@#g' \
    -e 's/(^|[^-A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)=[^[:space:]]+/\1\2=<masqué>/g' \
    -e 's/(login[^|;&]*[[:space:]]-p)[[:space:]]+[^[:space:]]+/\1 <masqué>/g' \
    -e 's/(--password|--token|--secret)([[:space:]]+|=)[^[:space:]]+/\1\2<masqué>/g' \
    -e 's/[A-Za-z0-9_+=]{32,}/<masqué>/g'
}
# État de chaque conteneur hors projet : identifiant, image, démarrage, redémarrages, état
states() {
  docker ps -a --format '{{.Names}}' | grep -vxE 'blog-api-next|portfolio-latex-runner|portfolio-cv-extractor' |
    while read -r n; do
      docker inspect --format '{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Status}}' "$n" 2>/dev/null
    done | sort
}
# Nombre de fichiers en CRLF : une archive créée sous Windows sans « git -c core.autocrlf=false
# archive » en contient, et les Dockerfile écriraient alors des \r dans la configuration de TeX
crlf_files() {
  find "$@" -type f -not -path '*/node_modules/*' \
    \( -name Dockerfile -o -name '*.sh' -o -name '*.yml' -o -name '*.mjs' -o -name '*.ts' -o -name '*.json' \) \
    -exec grep -l "$(printf '\r')" {} + 2>/dev/null | wc -l
}
# Journal des démarrages et arrêts (date, action, commit, résultat, copie) : sert au retour arrière
journal() {
  mkdir -p "$STATE_DIR" && chmod 700 "$STATE_DIR" || return 0
  if [ "$2" -eq 0 ]; then r=ok; else r=bloquant; fi
  printf '%s %s %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$TAG" "$r" "$ROOT" >> "$STATE_DIR/deploiements.log"
}

# ── inventaire : lecture seule ───────────────────────────────────────────────
cmd_inventaire() {
  need_root
  section "Machine et Docker"
  echo "architecture : $(uname -m) ; processeurs : $(nproc) ; charge : $(cut -d' ' -f1-3 /proc/loadavg)"
  awk '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/ { printf "%s %d Mio\n", $1, $2 / 1024 }' /proc/meminfo
  docker version --format 'docker : client {{.Client.Version}}, serveur {{.Server.Version}}' 2>&1 | head -1
  docker compose version 2>&1 | head -1
  echo "racine Docker : $(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"
  # Jamais « docker system df » : il parcourt tous les volumes, ceux des autres applications compris
  df -h "$(docker_root)" | tail -1

  section "Copie du commit à déployer"
  echo "dossier : $ROOT ; commit : ${TAG:-inconnu}"

  section "Dépôt de l'ancien déploiement ($LEGACY_DIR)"
  if [ -d "$LEGACY_DIR/.git" ]; then
    # --no-optional-locks : sans lui, « git status » réécrit .git/index, qui deviendrait la
    # propriété de root et ferait échouer le prochain git pull de l'ancien déploiement
    g() { git --no-optional-locks -c safe.directory="$LEGACY_DIR" -C "$LEGACY_DIR" "$@"; }
    echo "branche : $(g rev-parse --abbrev-ref HEAD 2>&1)"
    echo "commit : $(g log -1 --format='%H %ci %s' 2>&1)"
    echo "dernier fetch : $(stat -c %y "$LEGACY_DIR/.git/FETCH_HEAD" 2>/dev/null || echo jamais)"
    g remote -v 2>&1 | mask
    echo "fichiers modifiés ou non suivis (noms seulement) :"
    g status --porcelain 2>&1 | head -40
  else
    echo "pas de dépôt Git"
  fi
  f="$LEGACY_DIR/blog-api/Dockerfile"
  if [ -f "$f" ]; then
    echo "blog-api/Dockerfile : sha256 $(sha256sum "$f" | cut -c1-16) ; $(grep -E '^FROM' "$f" | tr '\n' ' ')"
    echo "paquets TeX installés dans l'image : $(grep -oE 'texlive-[a-z-]+|latexmk' "$f" | sort -u | tr '\n' ' ')"
  fi

  section "Ancien script de déploiement (/home/ubuntu/deploy.sh), MASQUÉ"
  f=/home/ubuntu/deploy.sh
  if [ -f "$f" ]; then
    echo "taille $(wc -c < "$f") octets ; modifié le $(stat -c %y "$f" | cut -c1-16) ; sha256 $(sha256sum "$f" | cut -c1-16)"
    echo "variables affectées (noms) : $(names < "$f")"
    echo "--- contenu, valeurs masquées (relire avant de transmettre) ---"
    mask < "$f"
    echo "--- fin ---"
  else
    echo "absent"
  fi

  section "Conteneur $LEGACY (lecture seule)"
  if docker inspect "$LEGACY" >/dev/null 2>&1; then
    # Un modèle par ligne : un champ absent n'efface pas le reste du relevé
    for t in 'image : {{.Config.Image}} ({{.Image}})' \
             'créé : {{.Created}} ; démarré : {{.State.StartedAt}} ; redémarrages : {{.RestartCount}} ; état : {{.State.Status}}' \
             'politique : {{.HostConfig.RestartPolicy.Name}} ; mode réseau : {{.HostConfig.NetworkMode}} ; utilisateur : « {{.Config.User}} »' \
             'ports : {{range $p, $b := .HostConfig.PortBindings}}{{$p}} → {{range $b}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' \
             'réseaux : {{range $n, $v := .NetworkSettings.Networks}}{{$n}} {{end}}' \
             'limites : mémoire {{.HostConfig.Memory}} ; CPU (nano) {{.HostConfig.NanoCpus}}' \
             'projet compose : « {{index .Config.Labels "com.docker.compose.project"}} »' \
             'montages : {{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} ({{if .RW}}rw{{else}}ro{{end}}) {{end}}'; do
      docker inspect --format "$t" "$LEGACY" 2>&1 | head -1
    done
    echo "santé : $(health "$LEGACY")"
    echo "variables (noms) : $(env_of "$LEGACY" | names)"
    env_of "$LEGACY" | sed -n 's/^NODE_VERSION=\([0-9.]*\)$/version Node : \1/p'
    # MongoDB : catégorie d'hôte et nom de base seulement, jamais l'adresse complète ni les identifiants
    env_of "$LEGACY" | sed -n 's/^MONGODB_URI=//p' | head -1 | awk '
      { uri = $0; scheme = (uri ~ /^mongodb\+srv:/) ? "mongodb+srv" : "mongodb"
        sub(/^[a-z+]+:\/\//, "", uri); sub(/^[^@\/]*@/, "", uri)
        slash = index(uri, "/"); hosts = slash ? substr(uri, 1, slash - 1) : uri
        db = slash ? substr(uri, slash + 1) : ""; sub(/\?.*/, "", db)
        n = split(hosts, h, ","); kind = "autre hôte"
        for (i = 1; i <= n; i++) { host = h[i]; sub(/:.*/, "", host)
          if (host ~ /\.mongodb\.net$/) kind = "MongoDB Atlas (*.mongodb.net)"
          else if (host ~ /^(localhost|127\.0\.0\.1)$/) kind = "boucle locale du conteneur"
          else if (host ~ /^172\.1[7-9]\.|^host\.docker\.internal$/) kind = "hôte Docker (passerelle)"
          else if (host !~ /\./) kind = "nom court : " host }
        printf "MongoDB : %s ; schéma %s ; %d hôte(s) ; base « %s »\n", kind, scheme, n, db }'
    echo "fichiers sous public/uploads dans la couche du conteneur : $(docker diff "$LEGACY" 2>/dev/null | grep -c 'public/uploads/' || true)"
    echo "/api/health sur 127.0.0.1:5000 : HTTP $(http http://127.0.0.1:5000/api/health)"
  else
    echo "conteneur $LEGACY introuvable"
  fi

  section "Noms, port et réseaux prévus pour $PROJECT"
  for c in $CONTAINERS; do
    if docker inspect "$c" >/dev/null 2>&1; then echo "conteneur $c : PRIS (projet « $(label_of "$c") »)"; else echo "conteneur $c : libre"; fi
  done
  for n in $NETWORKS; do
    if docker network inspect "$n" >/dev/null 2>&1; then echo "réseau $n : PRIS"; else echo "réseau $n : libre"; fi
  done
  if port_busy "$PORT"; then echo "port $PORT : OCCUPÉ"; ss -ltnpH "sport = :$PORT"; else echo "port $PORT : libre"; fi
  docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep '^portfolio-next/' || echo "aucune image portfolio-next"

  section "Tous les conteneurs, réseaux et volumes (noms seulement)"
  docker ps -a --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}} | projet « {{.Label "com.docker.compose.project"}} »'
  echo "--- réseaux"
  docker network ls --format '{{.Name}} | {{.Driver}}'
  echo "--- volumes"
  docker volume ls --format '{{.Name}} | {{.Driver}}'
  echo "--- ports TCP en écoute"
  ss -ltnH | awk '{ print $4 }' | sort -u | tr '\n' ' '; echo

  section "nginx : bloc server de api.adjoumani-koffi.com (fichiers lus ; nginx n'est pas appelé)"
  echo "sites activés : $(ls -l /etc/nginx/sites-enabled 2>/dev/null | awk 'NR > 1 { printf "%s%s ", $9, ($11 ? "→" $11 : "") }')"
  files=$(grep -rlsE 'server_name[^;]*api\.adjoumani-koffi\.com' /etc/nginx 2>/dev/null)
  [ -n "$files" ] || echo "aucun fichier de /etc/nginx ne déclare api.adjoumani-koffi.com"
  for f in $files; do echo "--- $f"; awk '
    { line = $0; sub(/#.*/, "", line) }
    !inblock && line ~ /(^|[[:space:]])server[[:space:]]*\{/ { inblock = 1; start = depth; buf = ""; hit = 0 }
    { depth += gsub(/\{/, "{", line) - gsub(/\}/, "}", line) }
    inblock {
      if ($0 ~ /server_name|listen|proxy_pass|location|client_max_body_size|proxy_read_timeout/) buf = buf $0 "\n"
      if ($0 ~ /server_name[^;]*api\.adjoumani-koffi\.com/) hit = 1
    }
    inblock && depth == start { if (hit) printf "%s", buf; inblock = 0 }' "$f"; done

  section "Sauvegardes visibles depuis la VM"
  for u in root ubuntu; do
    out=$(crontab -l -u "$u" 2>/dev/null | grep -vE '^[[:space:]]*(#|$)' | mask)
    if [ -n "$out" ]; then echo "crontab $u :"; printf '%s\n' "$out"; else echo "crontab $u : vide"; fi
  done
  echo "/etc/cron.d : $(ls /etc/cron.d 2>/dev/null | tr '\n' ' ')"
  systemctl list-timers --all --no-pager 2>/dev/null | grep -iE 'backup|dump|mongo|restic|borg|rclone|snapshot' || echo "aucun minuteur systemd de sauvegarde"
  for b in mongodump pg_dump restic borg rclone; do
    if command -v "$b" >/dev/null 2>&1; then echo "$b : installé"; fi
  done
  for d in /backup /backups /var/backups /home/ubuntu/backups /srv/backups; do
    if [ -d "$d" ]; then
      # Pas de du : il parcourrait toute l'arborescence
      last=$(ls -t "$d" 2>/dev/null | head -1)
      echo "$d : $(ls -1 "$d" 2>/dev/null | wc -l) entrée(s) ; plus récente : ${last:-aucune} $( [ -n "$last" ] && stat -c '%y, %s octets' "$d/$last" | cut -c1-16,36-)"
    fi
  done
  printf '\nRelisez ce rapport avant de le transmettre : aucune valeur ne devrait y figurer.\n'
}

# ── env : fichier d'environnement de la nouvelle API ─────────────────────────
cmd_env() {
  need_root
  [ ! -e "$ENV_FILE" ] || die "$ENV_FILE existe déjà : le relire ou le supprimer à la main avant de le recréer"
  docker inspect "$LEGACY" >/dev/null 2>&1 || die "conteneur $LEGACY introuvable"
  umask 077
  dir=$(dirname "$ENV_FILE")
  mkdir -p "$dir" && chmod 700 "$dir" || die "création de $dir impossible"
  tmp="$ENV_FILE.tmp.$$"
  # Valeurs entre apostrophes : Compose les lit telles quelles (ni guillemets ni $ interprétés)
  env_of "$LEGACY" | awk -v keep="$COPY" -v forced="$FORCED" -v q="'" '
    BEGIN { n = split(keep, k, " "); for (i = 1; i <= n; i++) want[k[i]] = 1 }
    { eq = index($0, "="); if (!eq) next
      name = substr($0, 1, eq - 1); if (!(name in want)) next
      value = substr($0, eq + 1)
      if (index(value, q)) { bad = bad " " name; next }
      val[name] = value }
    END {
      print "# Généré par deploy/oracle/next.sh env depuis le conteneur blog-api. Jamais dans Git."
      for (i = 1; i <= n; i++) if (k[i] in val) printf "%s=%s%s%s\n", k[i], q, val[k[i]], q
      m = split(forced, f, " "); for (i = 1; i <= m; i++) printf "%s=%sfalse%s\n", f[i], q, q
      if (bad != "") printf "apostrophe dans la valeur, à saisir à la main :%s\n", bad > "/dev/stderr"
    }' > "$tmp" || { rm -f "$tmp"; die "lecture du conteneur impossible"; }
  chown root:root "$tmp" && chmod 600 "$tmp" && mv "$tmp" "$ENV_FILE" || { rm -f "$tmp"; die "écriture de $ENV_FILE impossible"; }
  echo "créé : $ENV_FILE (root, 600) ; aucune valeur affichée"
  echo "variables : $(names < "$ENV_FILE")"
  for v in $REQUIRED; do grep -q "^$v=" "$ENV_FILE" || warn "$v absente : à ajouter à la main"; done
  for v in SUPABASE_URL SUPABASE_ANON_KEY; do
    grep -q "^$v=" "$ENV_FILE" || echo "  $v absente : administration indisponible (503), voulu à ce stade"
  done
}

# ── sauvegarder-mongo : lecture seule sur la base, puis restauration d'essai isolée ──
# Garanties :
#   - secrets : l'adresse MongoDB (identifiants compris) arrive par l'entrée standard du conteneur
#     de sauvegarde, jamais en argument ni en variable (invisible pour ps et docker inspect) ; elle
#     ne passe que par un fichier en mémoire (tmpfs, 600) supprimé aussitôt ; aucun journal Docker ;
#   - la restauration ne reçoit aucune adresse, vise 127.0.0.1 explicitement, tourne sans réseau et
#     s'arrête si une autre interface que la boucle locale existe : Atlas est injoignable ;
#   - Docker : un réseau et deux conteneurs temporaires, nommés et étiquetés, retirés même après une
#     interruption ; aucun volume (ceux que déclare l'image MongoDB sont remplacés par des tmpfs) ;
#     l'image MongoDB est retirée à la fin si elle a été téléchargée pour l'occasion ;
#   - intégrité : empreintes SHA-256 de l'archive et des comptes, CRC de chaque collection, restauration complète avec
#     contrôle des objets, puis comparaison collection par collection du nombre de documents.
SAVE_NETWORK=portfolio-sauvegarde-net
SAVE_CONTAINER=portfolio-sauvegarde-mongo
CHECK_CONTAINER=portfolio-verif-sauvegarde
SAVE_LABEL_KEY=adjoumani.portfolio
SAVE_LABEL_VALUE=sauvegarde-mongo
NO_VOLUMES="--tmpfs /data/db:rw,size=1m --tmpfs /data/configdb:rw,size=1m"
HARDEN="--cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --log-driver none --label $SAVE_LABEL_KEY=$SAVE_LABEL_VALUE"
PULLED_IMAGE=0

DUMP_SCRIPT='set -eu
u=$(sed -n "s/^MONGODB_URI='"'"'\(.*\)'"'"'\$/\1/p" | head -1)
[ -n "$u" ] || { echo "MONGODB_URI introuvable" >&2; exit 1; }
umask 077
printf "uri: '"'"'%s'"'"'\n" "$u" > /tmp/dump.yaml
u=
if ! mongodump --config=/tmp/dump.yaml --gzip --archive="/backup/$1" > /tmp/dump.log 2>&1; then
  rm -f /tmp/dump.yaml "/backup/$1"; tail -5 /tmp/dump.log | sed "s#://[^@ ]*@#://<masqué>@#g" >&2; exit 1
fi
rm -f /tmp/dump.yaml
sed -n "s/.*done dumping \([^ ]*\) (\([0-9]*\) documents*).*/\1 \2/p" /tmp/dump.log | tr -d "\`" | sort > "/backup/$1.comptes"
[ -s "/backup/$1.comptes" ] || { rm -f "/backup/$1" "/backup/$1.comptes"; echo "aucune collection sauvegardée" >&2; exit 1; }
cd /backup && sha256sum "$1" "$1.comptes" > "$1.sha256"
echo "archive $(stat -c %s "$1")"
sed "s/^/collection /" "$1.comptes"'

# Restauration d'essai. $1 : archive ; $2 : exiger-comptes (sauvegarde neuve) ou auto ; $3 : totaux
# attendus « collections documents », facultatifs. Deux formats :
#   complet   : <archive>, <archive>.comptes, <archive>.sha256 couvrant les deux (depuis 6c23d69) ;
#   antérieur : <archive>, <archive>.sha256 de l'archive seule (sauvegardes faites avant 6c23d69).
# Dans les deux cas : empreinte, gzip, CRC de chaque collection (vérifié par mongorestore), objets
# BSON, échecs nuls, et chaque collection lue dans l'archive présente avec tous ses documents.
RESTORE_SCRIPT='set -eu
for i in /sys/class/net/*; do
  [ "${i##*/}" = lo ] || { echo "interface réseau ${i##*/} présente : restauration refusée" >&2; exit 1; }
done
echo "réseau : boucle locale seulement (Atlas injoignable)"
cd /backup
[ -s "$1" ] || { echo "archive absente ou vide : $1" >&2; exit 1; }
[ -s "$1.sha256" ] || { echo "fichier d’empreintes absent ou vide : $1.sha256" >&2; exit 1; }
grep -q " $1\$" "$1.sha256" || { echo "l’empreinte de l’archive manque dans $1.sha256" >&2; exit 1; }
if grep -q " $1.comptes\$" "$1.sha256"; then
  mode=complet
  [ -s "$1.comptes" ] || { echo "sauvegarde incomplète : $1.comptes annoncé par les empreintes mais absent ou vide" >&2; exit 1; }
else
  mode=anterieur
  [ "$2" != exiger-comptes ] || { echo "sauvegarde incomplète : comptes par collection absents des empreintes" >&2; exit 1; }
fi
sha256sum -c "$1.sha256" >/dev/null 2>&1 || { echo "empreintes SHA-256 NON conformes" >&2; exit 1; }
if [ "$mode" = complet ]; then
  echo "empreintes SHA-256 conformes : archive et comptes"
else
  echo "empreinte SHA-256 conforme : archive (format antérieur, sans comptes)"
  [ ! -e "$1.comptes" ] || echo "fichier $1.comptes présent mais non couvert par les empreintes : ignoré"
fi
gzip -t "$1" 2>/dev/null || { echo "compression gzip corrompue" >&2; exit 1; }
echo "compression gzip intègre"
L=mongodb://127.0.0.1:27017
mkdir /tmp/db
mongod --dbpath /tmp/db --bind_ip 127.0.0.1 --port 27017 --wiredTigerCacheSizeGB 0.25 --fork --logpath /tmp/mongod.log >/dev/null
cat > /tmp/comptes.js <<FIN
db.adminCommand({listDatabases: 1}).databases.forEach(function (d) {
  if (["admin", "local", "config"].indexOf(d.name) >= 0) return;
  var s = db.getSiblingDB(d.name);
  s.getCollectionInfos({type: "collection"}).forEach(function (c) {
    if (c.name.indexOf("system.") !== 0) print(d.name + "." + c.name + " " + s.getCollection(c.name).countDocuments({}));
  });
});
FIN
[ -z "$(mongosh --quiet --norc "$L" /tmp/comptes.js)" ] || { echo "MongoDB jetable non vide" >&2; exit 1; }
if ! mongorestore --uri="$L" --gzip --archive="/backup/$1" --objcheck --stopOnError > /tmp/restore.log 2>&1; then
  grep -iE "failed|error|crc" /tmp/restore.log | tail -3 | sed "s/^[^\t]*\t//" >&2
  echo "restauration interrompue : archive corrompue ou incomplète" >&2; exit 1
fi
echo "contrôles internes de l’archive conformes : CRC de chaque collection, objets BSON"
sed -n "s/.*finished restoring \([^ ]*\) (\([0-9]*\) documents*, \([0-9]*\) failures*).*/\1 \2 \3/p" /tmp/restore.log | tr -d "\`" | sort > /tmp/rapport
[ -s /tmp/rapport ] || { echo "aucune collection restaurée" >&2; exit 1; }
awk "\$3 != 0 { bad = 1 } END { exit bad }" /tmp/rapport || { echo "échecs d’insertion signalés par mongorestore" >&2; exit 1; }
awk "{ print \$1, \$2 }" /tmp/rapport > /tmp/lu
total=$(awk "{ s += \$2 } END { print s + 0 }" /tmp/lu)
[ "$total" -gt 0 ] || { echo "sauvegarde vide" >&2; exit 1; }
restored=$(sed -n "s/.*[^0-9]\([0-9][0-9]*\) document(s) restored successfully\. \([0-9][0-9]*\) document(s) failed.*/\1 \2/p" /tmp/restore.log)
[ "$restored" = "$total 0" ] || { echo "bilan de restauration incohérent : « $restored » pour $total documents lus" >&2; exit 1; }
mongosh --quiet --norc "$L" /tmp/comptes.js | sort > /tmp/obtenu
if ! cmp -s /tmp/lu /tmp/obtenu; then
  echo "écart entre documents lus dans l’archive (<) et présents après restauration (>) :" >&2
  diff /tmp/lu /tmp/obtenu | sed "s/^/  /" >&2; exit 1
fi
if [ "$mode" = complet ]; then
  sort "$1.comptes" > /tmp/attendu
  if ! cmp -s /tmp/attendu /tmp/obtenu; then
    echo "écart entre comptes de la sauvegarde (<) et restaurés (>) :" >&2; diff /tmp/attendu /tmp/obtenu | sed "s/^/  /" >&2; exit 1
  fi
fi
n=$(grep -c . /tmp/obtenu)
if [ -n "${3:-}" ]; then
  [ "$3" = "$n $total" ] || { echo "totaux attendus « $3 » (collections documents), obtenus « $n $total »" >&2; exit 1; }
  echo "totaux attendus confirmés : $n collections, $total documents"
fi
echo "documents restaurés : $total, aucun échec ; collections : $n, chacune complète"
sed "s/^/  /" /tmp/obtenu
for f in "$1" "$1.comptes" "$1.sha256"; do
  if [ -e "$f" ]; then echo "fichier $f : $(stat -c %s "$f") octets"; fi
done
echo "FORMAT $mode"'

# Adresse MongoDB au format du fichier d'environnement : celui de la nouvelle API s'il existe,
# sinon lue dans le conteneur blog-api (aucun fichier à créer pour sauvegarder)
mongo_uri() {
  if [ -f "$ENV_FILE" ]; then grep '^MONGODB_URI=' "$ENV_FILE"; return; fi
  env_of "$LEGACY" | awk -v q="'" 'index($0, "MONGODB_URI=") == 1 {
    v = substr($0, 13); if (index(v, q)) exit 3; printf "MONGODB_URI=%s%s%s\n", q, v, q; exit }'
}

ours()   { [ "$(docker inspect --format "{{index .Config.Labels \"$SAVE_LABEL_KEY\"}}" "$1" 2>/dev/null)" = "$SAVE_LABEL_VALUE" ]; }
# Retire les seules ressources temporaires de la sauvegarde, reconnues par leur nom ET leur étiquette
backup_cleanup() {
  for c in "$SAVE_CONTAINER" "$CHECK_CONTAINER"; do
    if ours "$c"; then docker rm -f -v "$c" >/dev/null 2>&1; fi
  done
  if [ "$(docker network inspect --format "{{index .Labels \"$SAVE_LABEL_KEY\"}}" "$SAVE_NETWORK" 2>/dev/null)" = "$SAVE_LABEL_VALUE" ]; then
    docker network rm "$SAVE_NETWORK" >/dev/null 2>&1
  fi
  if [ "$PULLED_IMAGE" = 1 ] && docker image rm "$MONGO_IMAGE" >/dev/null 2>&1; then
    echo "image MongoDB téléchargée pour l’occasion retirée"
  fi
}

# Restauration d'essai de l'archive $1 du dossier $2 (chemin vu par Docker) ;
# $3 : exiger-comptes ou auto ; $4 : totaux attendus « collections documents » (facultatif)
restore_check() {
  if out=$(docker run --rm --name "$CHECK_CONTAINER" --network none --memory 1g --cpus 1 $NO_VOLUMES $HARDEN \
      -v "$2:/backup:ro" "$MONGO_IMAGE" sh -c "$RESTORE_SCRIPT" sh "$1" "$3" "${4:-}" 2>&1); then
    printf '%s\n' "$out" | grep -v '^FORMAT ' | sed 's/^/  /'
    if printf '%s\n' "$out" | grep -qx 'FORMAT anterieur'; then
      warn "format antérieur, sans comptes : intégrité prouvée par l’empreinte, gzip, le CRC de chaque collection et la restauration complète"
      [ -n "${4:-}" ] || warn "totaux non confrontés : NEXT_ATTENDU='<collections> <documents>' les compare à ceux annoncés lors de la sauvegarde"
    fi
    ok "restauration d’essai complète et conforme"
  else
    printf '%s\n' "$out" | sed 's/^/  /'
    block "restauration d’essai NON conforme : cette archive n’est pas une sauvegarde fiable"
  fi
}

cmd_sauvegarder_mongo() {
  need_root
  [ -f "$ENV_FILE" ] || docker inspect "$LEGACY" >/dev/null 2>&1 || die "ni $ENV_FILE ni conteneur $LEGACY : adresse MongoDB introuvable"
  for c in "$SAVE_CONTAINER" "$CHECK_CONTAINER"; do
    ! docker inspect "$c" >/dev/null 2>&1 || die "conteneur $c déjà présent (exécution interrompue ?) : le vérifier, puis sudo docker rm -f -v $c"
  done
  ! docker network inspect "$SAVE_NETWORK" >/dev/null 2>&1 || die "réseau $SAVE_NETWORK déjà présent : le vérifier, puis sudo docker network rm $SAVE_NETWORK"
  free_kib=$(df -Pk "$(docker_root)" | awk 'NR == 2 { print $4 }')
  [ "${free_kib:-0}" -ge $((3 * 1024 * 1024)) ] || die "moins de 3 Gio libres pour Docker"
  if ! docker image inspect "$MONGO_IMAGE" >/dev/null 2>&1 && [ "${NEXT_KEEP_MONGO_IMAGE:-0}" != 1 ]; then PULLED_IMAGE=1; fi
  umask 077
  mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR" || die "création de $BACKUP_DIR impossible"
  name="mongo-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
  BLOCKERS=0
  trap backup_cleanup EXIT
  trap 'exit 130' INT TERM HUP
  section "Sauvegarde MongoDB (mongodump, lecture seule) → $BACKUP_DIR/$name"
  echo "adresse lue dans : $( [ -f "$ENV_FILE" ] && echo "$ENV_FILE" || echo "le conteneur $LEGACY") (jamais affichée)"
  docker network create --driver bridge --label "$SAVE_LABEL_KEY=$SAVE_LABEL_VALUE" "$SAVE_NETWORK" >/dev/null \
    || die "création du réseau temporaire $SAVE_NETWORK impossible"
  dump=$(mongo_uri | docker run -i --rm --name "$SAVE_CONTAINER" --network "$SAVE_NETWORK" --memory 512m --cpus 1 \
    --read-only --tmpfs /tmp:rw,size=8m,mode=1777 $NO_VOLUMES $HARDEN -v "$BACKUP_DIR:/backup" \
    "$MONGO_IMAGE" sh -c "$DUMP_SCRIPT" sh "$name") || die "échec de mongodump"
  # La restauration n'a besoin d'aucun réseau : le réseau temporaire est retiré dès maintenant
  docker network rm "$SAVE_NETWORK" >/dev/null 2>&1 || true
  expected=$(printf '%s\n' "$dump" | awk '$1 == "collection" { s += $3 } END { print s + 0 }')
  collections=$(printf '%s\n' "$dump" | grep -c '^collection ')
  echo "archive : $(printf '%s\n' "$dump" | awk '$1 == "archive" { print $2 }') octets ; collections : $collections ; documents : $expected"
  printf '%s\n' "$dump" | awk '$1 == "collection" { printf "  %s : %s\n", $2, $3 }'
  section "Restauration d’essai dans un MongoDB jetable, sans réseau"
  # Sauvegarde neuve : les trois fichiers sont exigés et les totaux de mongodump doivent se retrouver
  restore_check "$name" "$BACKUP_DIR" exiger-comptes "$collections $expected"
  if [ "$BLOCKERS" -eq 0 ]; then
    echo "SAUVEGARDE $name : 3 fichiers (archive, .comptes, .sha256), root 600, dans $BACKUP_DIR"
    echo "Copie et vérification sur le poste : deploy/oracle/README.md, « Rapatriement »"
  fi
  verdict
}

# ── verifier-archive : restauration d'essai d'une archive copiée (VM ou poste) ──
#   NEXT_BACKUP_DIR=<dossier> [NEXT_ATTENDU='<collections> <documents>'] [NEXT_EXIGER_COMPTES=1] \
#     sh deploy/oracle/next.sh verifier-archive <archive>
# Sous Git Bash : MSYS_NO_PATHCONV=1 et un chemin Windows (D:/portfolio-sauvegardes).
cmd_verifier_archive() {
  [ -n "${1:-}" ] || die "usage : NEXT_BACKUP_DIR=<dossier> [NEXT_ATTENDU='<collections> <documents>'] sh deploy/oracle/next.sh verifier-archive <archive>"
  attendu=${NEXT_ATTENDU:-}
  [ -z "$attendu" ] || printf '%s' "$attendu" | grep -Eqx '[0-9]+ [0-9]+' || die "NEXT_ATTENDU doit valoir « <collections> <documents> », par exemple '5 16'"
  exigence=auto
  [ "${NEXT_EXIGER_COMPTES:-0}" != 1 ] || exigence=exiger-comptes
  ! docker inspect "$CHECK_CONTAINER" >/dev/null 2>&1 || die "conteneur $CHECK_CONTAINER déjà présent : le vérifier, puis docker rm -f -v $CHECK_CONTAINER"
  BLOCKERS=0
  trap backup_cleanup EXIT
  trap 'exit 130' INT TERM HUP
  section "Vérification de $1 ($BACKUP_DIR) : MongoDB jetable, sans réseau"
  restore_check "$1" "$BACKUP_DIR" "$exigence" "$attendu"
  verdict
}

# ── recuperer : copie d'un commit publié sur le dépôt de livraison, sans sudo ──
# Le dépôt nu $DEPOT (créé une fois, deploy/oracle/README.md §4) ne fait que lire la branche de
# release : ni copie de travail, ni push, ni git pull. Le dépôt de l'ancien déploiement n'est pas lu.
# Une copie existante n'est jamais remplacée : elle est comparée au commit, fichier par fichier.
cmd_recuperer() {
  [ "$(id -u)" != 0 ] || die "sans sudo : le dépôt et les copies appartiennent à l'utilisateur, pas à root"
  want=${1:-}
  printf '%s' "$want" | grep -Eq '^[0-9a-f]{12,40}$' || die "commit attendu : 12 à 40 caractères hexadécimaux"
  [ -d "$DEPOT" ] || die "$DEPOT absent : le créer une fois (deploy/oracle/README.md §4)"
  depot() { git -C "$DEPOT" -c core.autocrlf=false "$@"; }
  ref="refs/remotes/origin/$BRANCH"
  depot fetch --quiet --no-tags origin "+refs/heads/$BRANCH:$ref" </dev/null || die "lecture de $BRANCH impossible (adresse du dépôt, réseau ?)"
  full=$(depot rev-parse --verify --quiet "$want^{commit}") || die "commit $want introuvable"
  depot merge-base --is-ancestor "$full" "$ref" || die "commit $full absent de la branche $BRANCH publiée"
  short=$(printf '%s' "$full" | cut -c1-12)
  dest="$NEXT_HOME/$PROJECT-$short"
  tmp=$(mktemp -d "$NEXT_HOME/.recuperation-XXXXXX") || die "dossier temporaire impossible dans $NEXT_HOME"
  # Commit entier, comme l'archive transférée le 05/11 : la copie d'un même commit est identique
  if ! depot archive --format=tar -o "$tmp.tar" "$full" ||
     ! tar -xf "$tmp.tar" -C "$tmp"; then
    rm -rf "$tmp" "$tmp.tar"; die "extraction du commit $full impossible"
  fi
  rm -f "$tmp.tar"
  printf '%s\n' "$short" > "$tmp/.next-commit"
  BLOCKERS=0
  section "Commit $full ($BRANCH)"
  echo "  $(depot log -1 --format='%ci  %s' "$full")"
  echo "  $(find "$tmp" -type f | wc -l) fichiers"
  crlf=$(crlf_files "$tmp/blog-api" "$tmp/latex-runner" "$tmp/cv-extractor" "$tmp/deploy/oracle")
  if [ "$crlf" -eq 0 ]; then ok "fins de ligne LF"; else block "$crlf fichier(s) en CRLF dans le commit"; fi
  if [ -e "$dest" ]; then
    if diff -rq -x .next-commit "$tmp" "$dest" >/dev/null 2>&1; then
      ok "copie existante $dest identique au commit (rien n'est remplacé)"
      if [ "$(cat "$dest/.next-commit" 2>/dev/null)" = "$short" ]; then ok ".next-commit : $short"
      else block "$dest/.next-commit absent ou différent : printf '%s\\n' $short > $dest/.next-commit"; fi
    else
      block "copie existante $dest différente du commit (rien n'est remplacé) :"
      diff -rq -x .next-commit "$tmp" "$dest" 2>&1 | head -20 | sed "s#$tmp#<commit>#g; s/^/    /"
    fi
    rm -rf "$tmp"
  elif [ "$BLOCKERS" -eq 0 ]; then
    chmod 755 "$tmp" && mv "$tmp" "$dest" || { rm -rf "$tmp"; die "écriture de $dest impossible"; }
    ok "copie créée : $dest"
  else
    rm -rf "$tmp"
  fi
  verdict || return 1
  echo "Suite, depuis la copie : cd $dest && sudo sh deploy/oracle/next.sh verifier"
}

# ── env-definir : une variable du fichier d'environnement, jamais affichée ──
# Valeur saisie sans écho (terminal) ou lue sur l'entrée standard (une ligne), jamais en argument.
# Écrite entre guillemets doubles (\ " $ échappés : apostrophes, dollars et antislashs gardés tels
# quels) ; fichier remplacé d'un coup après relecture par Compose : même valeur, autres variables
# inchangées (env_definir.py). Les conteneurs en marche ne la voient qu'au prochain demarrer.
cmd_env_definir() {
  need_root
  name=${1:-}
  printf '%s' "$name" | grep -Eq '^[A-Z][A-Z0-9_]*$' || die "nom attendu en majuscules : env-definir NOM"
  [ -f "$ENV_FILE" ] || die "$ENV_FILE absent : sudo sh deploy/oracle/next.sh env"
  [ -f "$HERE/env_definir.py" ] || die "lancer depuis la copie du commit : sudo sh deploy/oracle/next.sh env-definir $name"
  command -v python3 >/dev/null 2>&1 || die "python3 absent"
  if [ -t 0 ]; then
    printf 'Valeur de %s (rien ne s'\''affiche) : ' "$name" >&2
    trap 'stty echo 2>/dev/null' EXIT INT TERM
    stty -echo
    IFS= read -r value; status=$?
    stty echo; trap - EXIT INT TERM
    printf '\n' >&2
  else
    IFS= read -r value; status=$?
  fi
  [ "$status" -eq 0 ] || [ -n "$value" ] || die "aucune valeur lue"
  printf '%s' "$value" | NEXT_ENV_FILE="$ENV_FILE" NEXT_COMPOSE_FILE="$COMPOSE_FILE" NEXT_SUPABASE_CA="$CA_FILE" \
    python3 "$HERE/env_definir.py" "$name"
}

# ── verifier-tls : lecture seule ─────────────────────────────────────────────
# Poignée de main TLS avec le pooler Supabase (STARTTLS PostgreSQL), sans aucun identifiant : le
# certificat présenté doit être signé par CA_FILE et porter le nom de l'hôte. L'hôte (« Session
# pooler » du tableau de bord Supabase) est donné en argument : l'URL secrète n'est jamais lue.
cmd_verifier_tls() {
  need_root
  BLOCKERS=0
  target=${1:-}
  [ -n "$target" ] || die "hôte du pooler attendu : sudo sh deploy/oracle/next.sh verifier-tls <hôte>[:port]"
  host=${target%:*}; port=${target##*:}
  [ "$port" != "$target" ] || port=5432
  printf '%s' "$host" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*$' || die "hôte invalide"
  printf '%s' "$port" | grep -Eq '^[0-9]{1,5}$' || die "port invalide"
  [ -f "$CA_FILE" ] || die "$CA_FILE absent (deploy/oracle/README.md §6)"
  section "TLS de $host:$port avec $CA_FILE (aucun identifiant envoyé)"
  tls() { timeout 20 openssl s_client -starttls postgres -connect "$host:$port" -servername "$host" \
            -verify_hostname "$host" -verify_return_error -brief "$@" </dev/null 2>&1; }
  r=$(tls -CAfile "$CA_FILE")
  if printf '%s\n' "$r" | grep -q '^Verification: OK'; then ok "certificat du pooler signé par le certificat du projet, nom $host vérifié"
  else block "vérification refusée : $(printf '%s\n' "$r" | grep -iE 'verif|error|refused|timeout' | head -2 | tr '\n' ' ')"; fi
  # Pour information : le certificat épinglé reste nécessaire si les autorités du système refusent
  if tls -CApath /etc/ssl/certs | grep -q '^Verification: OK'; then echo "  info      autorités du système : acceptées aussi"
  else echo "  info      autorités du système : refusées (le certificat du projet est nécessaire)"; fi
  verdict
}

# ── verifier : lecture seule ─────────────────────────────────────────────────
cmd_verifier() {
  need_root; need_tag; not_legacy_dir
  BLOCKERS=0
  section "Prérequis du lancement de $PROJECT ($TAG)"
  if [ "$(uname -m)" = aarch64 ]; then ok "architecture ARM64"; else warn "architecture $(uname -m)"; fi
  if docker compose version >/dev/null 2>&1; then ok "$(docker compose version | head -1)"; else block "docker compose absent (paquet docker-compose-plugin)"; fi
  if [ -f "$COMPOSE_FILE" ]; then ok "$COMPOSE_FILE"; else block "fichier compose absent"; fi
  crlf=$(crlf_files "$ROOT/blog-api" "$ROOT/latex-runner" "$ROOT/cv-extractor" "$HERE")
  if [ "$crlf" -eq 0 ]; then ok "fins de ligne LF dans la copie"; else block "$crlf fichier(s) en CRLF : refaire l'archive avec git -c core.autocrlf=false archive"; fi
  for c in $CONTAINERS; do
    if ! docker inspect "$c" >/dev/null 2>&1; then ok "nom de conteneur $c libre"
    elif [ "$(label_of "$c")" = "$PROJECT" ]; then ok "conteneur $c déjà au projet $PROJECT"
    else block "nom de conteneur $c pris par un autre projet"; fi
  done
  for n in $NETWORKS; do
    if ! docker network inspect "$n" >/dev/null 2>&1; then ok "réseau $n libre"
    elif [ "$(docker network inspect --format '{{index .Labels "com.docker.compose.project"}}' "$n")" = "$PROJECT" ]; then ok "réseau $n déjà au projet"
    else block "réseau $n pris par un autre projet"; fi
  done
  if ! port_busy "$PORT"; then ok "port $PORT libre"
  elif docker port blog-api-next 2>/dev/null | grep -q "127.0.0.1:$PORT"; then ok "port $PORT déjà tenu par blog-api-next"
  else block "port $PORT occupé par un autre service"; fi
  if [ "$(docker inspect --format '{{.State.Running}}' "$LEGACY" 2>/dev/null)" = true ]; then ok "ancien conteneur $LEGACY en marche (il ne sera pas touché)"
  else warn "ancien conteneur $LEGACY absent ou arrêté"; fi
  if [ -f "$ENV_FILE" ]; then
    if [ "$(stat -c '%U %a' "$ENV_FILE")" = "root 600" ]; then ok "$ENV_FILE : root, 600"; else block "$ENV_FILE : $(stat -c '%U %a' "$ENV_FILE") (attendu : root 600)"; fi
    for v in $REQUIRED; do if grep -q "^$v=" "$ENV_FILE"; then ok "$v présente"; else block "$v absente de $ENV_FILE"; fi; done
    # Valeurs entre apostrophes (env) ou guillemets doubles (env-definir)
    has()   { grep -q "^$1=" "$ENV_FILE"; }
    value() { grep -Eq "^$1=[\"']?$2[\"']?\$" "$ENV_FILE"; }
    # Amorçage d'un compte : toujours fermé. Administration, base de connaissances, IA : activées
    # l'une après l'autre (deploy/oracle/README.md §6), chacune avec ses variables
    if value ADMIN_BOOTSTRAP_ENABLED false; then ok "ADMIN_BOOTSTRAP_ENABLED=false"; else block "ADMIN_BOOTSTRAP_ENABLED doit valoir false"; fi
    if has SUPABASE_URL && has SUPABASE_ANON_KEY; then ok "administration : Supabase configuré (migration 12 exigée en production)"
    elif has SUPABASE_URL || has SUPABASE_ANON_KEY; then block "SUPABASE_URL et SUPABASE_ANON_KEY vont ensemble"
    else echo "  info      administration désactivée (503) : SUPABASE_URL et SUPABASE_ANON_KEY absentes"; fi
    if value KNOWLEDGE_WRITE_ENABLED true; then echo "  info      écritures de la base de connaissances : activées"
    else echo "  info      écritures de la base de connaissances : désactivées"; fi
    # L'IA n'est coupée que par AI_ENABLED=false (blog-api/src/ai/services/gateway.ts)
    if value AI_ENABLED false; then echo "  info      IA désactivée (AI_ENABLED=false)"
    else
      for v in AI_DATABASE_URL AI_LOG_HMAC_SECRET; do if has "$v"; then ok "IA : $v présente"; else block "IA active sans $v"; fi; done
    fi
    if grep -Eq '^(OPENAI|GROQ|ANTHROPIC|GEMINI|XAI|OPENROUTER)_API_KEY=' "$ENV_FILE"; then warn "ancienne clé IA présente : inutile (clés dans Vault), à retirer"; fi
  else
    block "$ENV_FILE absent : sudo sh deploy/oracle/next.sh env"
  fi
  # Certificat public, monté en lecture seule : sans lui, le conteneur ne démarre pas
  if [ ! -f "$CA_FILE" ]; then
    block "$CA_FILE absent : certificat Supabase à déposer (deploy/oracle/README.md §6)"
  elif ! subject=$(openssl x509 -in "$CA_FILE" -noout -subject 2>/dev/null); then
    block "$CA_FILE n'est pas un certificat PEM"
  elif ! openssl x509 -in "$CA_FILE" -noout -checkend 2592000 >/dev/null 2>&1; then
    block "$CA_FILE expire dans moins de 30 jours ($(openssl x509 -in "$CA_FILE" -noout -enddate))"
  elif [ "$(stat -c '%a' "$CA_FILE")" != 644 ]; then
    block "$CA_FILE : droits $(stat -c '%a' "$CA_FILE") (attendu : 644, lu par l'utilisateur du conteneur)"
  else
    ok "certificat Supabase : $subject"
  fi
  root_dir=$(docker_root)
  free_kib=$(df -Pk "$root_dir" | awk 'NR == 2 { print $4 }')
  if [ "${free_kib:-0}" -ge $((MIN_DISK_GIB * 1024 * 1024)) ]; then ok "disque libre sous $root_dir : $((free_kib / 1024 / 1024)) Gio"
  else block "disque libre sous $root_dir : $((${free_kib:-0} / 1024 / 1024)) Gio (minimum $MIN_DISK_GIB)"; fi
  avail_kib=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
  if [ "$avail_kib" -ge $((MIN_MEM_GIB * 1024 * 1024)) ]; then ok "mémoire disponible : $((avail_kib / 1024 / 1024)) Gio"
  else block "mémoire disponible : $((avail_kib / 1024 / 1024)) Gio (minimum $MIN_MEM_GIB)"; fi
  built=0
  for i in $IMAGES; do if docker image inspect "portfolio-next/$i:$TAG" >/dev/null 2>&1; then built=$((built + 1)); fi; done
  echo "  info      images portfolio-next:$TAG construites : $built / 3"
  verdict
}

# ── construire ───────────────────────────────────────────────────────────────
cmd_construire() {
  cmd_verifier || die "points bloquants : rien n'a été construit"
  section "Construction des images portfolio-next/*:$TAG (l'image de l'API actuelle n'est pas touchée)"
  dc build || die "échec de la construction"
  docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep "^portfolio-next/.*:$TAG "
}

# ── demarrer ─────────────────────────────────────────────────────────────────
cmd_demarrer() {
  cmd_verifier || die "points bloquants : rien n'a été démarré"
  for i in $IMAGES; do
    docker image inspect "portfolio-next/$i:$TAG" >/dev/null 2>&1 || die "image portfolio-next/$i:$TAG absente : construire d'abord"
  done
  mkdir -p "$STATE_DIR" && chmod 700 "$STATE_DIR" || die "création de $STATE_DIR impossible"
  states > "$STATE_DIR/avant.txt"
  echo "état de $(wc -l < "$STATE_DIR/avant.txt") autres conteneurs enregistré dans $STATE_DIR/avant.txt"
  section "Démarrage de $PROJECT"
  dc up -d --no-build || die "échec du démarrage ; retour arrière : sudo sh deploy/oracle/next.sh arreter"
  waited=0
  while [ "$waited" -lt 180 ]; do
    healthy=0
    for c in $CONTAINERS; do
      if [ "$(health "$c")" = healthy ]; then healthy=$((healthy + 1)); fi
    done
    [ "$healthy" -eq 3 ] && break
    sleep 5; waited=$((waited + 5))
  done
  cmd_controler; rc=$?
  journal demarrer "$rc"
  return "$rc"
}

# ── controler : lecture seule ────────────────────────────────────────────────
cmd_controler() {
  need_root
  BLOCKERS=0
  section "Conteneurs du projet $PROJECT"
  present=0
  for c in $CONTAINERS; do
    s=$(docker inspect --format '{{.State.Status}}' "$c" 2>/dev/null) || s=absent
    [ "$s" = absent ] || present=$((present + 1))
    s="$s $(health "$c")"
    if [ "$s" = "running healthy" ]; then ok "$c : $s"; else block "$c : $s"; fi
  done
  if [ "$present" -lt 3 ]; then verdict; return 1; fi
  p=$(docker port blog-api-next 2>/dev/null | tr '\n' ' ')
  if [ "$p" = "5000/tcp -> 127.0.0.1:$PORT " ]; then ok "blog-api-next publié sur 127.0.0.1:$PORT uniquement"; else block "ports de blog-api-next : « $p »"; fi
  for c in portfolio-latex-runner portfolio-cv-extractor; do
    if [ -z "$(docker port "$c" 2>/dev/null)" ]; then ok "$c : aucun port publié"; else block "$c publie un port"; fi
    if docker exec "$c" node -e "fetch('https://registry.npmjs.org',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1),()=>process.exit(0))" 2>/dev/null
    then ok "$c : aucun accès à Internet"; else block "$c : accès à Internet possible"; fi
  done
  for n in portfolio-next_latex portfolio-next_extract; do
    if [ "$(docker network inspect --format '{{.Internal}}' "$n" 2>/dev/null)" = true ]; then ok "réseau $n interne"; else block "réseau $n non interne"; fi
  done

  section "Nouvelle API (127.0.0.1:$PORT)"
  base="http://127.0.0.1:$PORT/api"
  if [ "$(http "$base/health")" = 200 ]; then ok "/api/health : 200"; else block "/api/health ne répond pas"; fi
  r=$(http "$base/health/ready")
  if [ "$r" = 200 ]; then ok "/api/health/ready : 200 (MongoDB joint)"; else block "/api/health/ready : HTTP $r (MongoDB injoignable ?)"; fi
  n=$(curl -s --max-time 10 "$base/ai/features" | grep -o '"id"' | wc -l)
  if [ "$n" -gt 0 ]; then ok "/api/ai/features : $n fonctionnalités listées (indisponibles sans AI_DATABASE_URL, voulu)"; else warn "/api/ai/features : liste vide ou illisible"; fi
  t=$(mktemp)
  # Aperçu LaTeX réel et import d'un texte : routes publiques, quota par adresse IP, aucune écriture en base
  h=$(curl -s --max-time 60 -o "$t" -w '%{http_code}' -H 'Content-Type: application/json' \
    -d '{"code":"\\documentclass{article}\\begin{document}Recette portfolio-next\\end{document}"}' "$base/cv/compile" || true)
  if [ "$h" = 200 ] && head -c 4 "$t" | grep -q '%PDF'; then ok "compilation LaTeX par latex-runner : PDF de $(wc -c < "$t") octets"
  else block "compilation LaTeX : HTTP $h $(sed -n 's/.*"code":"\([A-Z_]*\)".*/\1/p' "$t" | head -1)"; fi
  h=$(printf 'Prénom Nom\nDéveloppeur\n' | curl -s --max-time 30 -o "$t" -w '%{http_code}' \
    -H 'Content-Type: application/octet-stream' -H 'X-File-Type: text/plain' --data-binary @- "$base/cv/import" || true)
  if [ "$h" = 200 ] && grep -q 'Développeur' "$t"; then ok "import de CV par cv-extractor : texte extrait"; else block "import de CV : HTTP $h"; fi
  rm -f "$t"
  # Écritures du blog : refusées avant tout accès à la base sans administrateur Supabase + MFA
  for route in articles tags upload; do
    h=$(http -X POST -H 'Content-Type: application/json' -d '{}' "$base/$route")
    if [ "$h" = 401 ]; then ok "POST /api/$route sans jeton : 401"; else block "POST /api/$route sans jeton : HTTP $h"; fi
  done
  h=$(http -X POST -H 'Authorization: Bearer forge.jeton.test' -H 'Content-Type: application/json' -d '{}' "$base/articles")
  case "$h" in
    401|503) ok "POST /api/articles avec un jeton forgé : $h (refusé)" ;;
    *)       block "POST /api/articles avec un jeton forgé : HTTP $h" ;;
  esac

  section "Ancienne API et autres conteneurs"
  if docker inspect "$LEGACY" >/dev/null 2>&1; then
    if [ "$(http http://127.0.0.1:5000/api/health)" = 200 ]; then ok "ancienne API : /api/health 200 sur le port 5000"; else block "ancienne API : plus de réponse sur le port 5000"; fi
  fi
  if [ -f "$STATE_DIR/avant.txt" ]; then
    # Un conteneur qui redémarrait déjà en boucle avant le lancement change d'état de lui-même :
    # il est signalé à part, sans fausser la comparaison des autres
    unstable=$(awk '$NF == "restarting" { sub(/^\//, "", $1); printf "%s ", $1 }' "$STATE_DIR/avant.txt")
    [ -z "$unstable" ] || warn "déjà instables avant le démarrage (redémarrages en boucle), non comparés : $unstable"
    before=$(mktemp); now=$(mktemp)
    awk '$NF != "restarting"' "$STATE_DIR/avant.txt" > "$before"
    while read -r name _; do
      docker inspect --format '{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Status}}' "${name#/}" 2>/dev/null || echo "$name DISPARU"
    done < "$before" | sort > "$now"
    if cmp -s "$before" "$now"; then ok "$(wc -l < "$now") autres conteneurs inchangés depuis le démarrage (identifiant, image, démarrage, redémarrages, état)"
    else block "conteneurs modifiés depuis le démarrage :"; diff "$before" "$now" | sed 's/^/    /'; fi
    rm -f "$before" "$now"
  fi

  section "Ressources"
  docker stats --no-stream --format '{{.Name}} : mémoire {{.MemUsage}} ; CPU {{.CPUPerc}}' $CONTAINERS 2>/dev/null
  docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep '^portfolio-next/'
  verdict
}

# ── arreter : retour arrière ─────────────────────────────────────────────────
cmd_arreter() {
  need_root; need_tag
  [ -f "$ENV_FILE" ] || ENV_FILE=/dev/null
  BLOCKERS=0
  section "Retour arrière : conteneurs et réseaux du projet $PROJECT uniquement"
  dc down || die "échec de l'arrêt : voir docker compose -p $PROJECT ps"
  for c in $CONTAINERS; do if docker inspect "$c" >/dev/null 2>&1; then block "$c existe encore"; else ok "$c retiré"; fi; done
  for n in $NETWORKS; do if docker network inspect "$n" >/dev/null 2>&1; then block "réseau $n existe encore"; else ok "réseau $n retiré"; fi; done
  if docker inspect "$LEGACY" >/dev/null 2>&1; then
    if [ "$(http http://127.0.0.1:5000/api/health)" = 200 ]; then ok "ancienne API toujours en service sur le port 5000"; else block "ancienne API : pas de réponse sur le port 5000"; fi
  fi
  echo "Images conservées pour un nouvel essai. Pour les retirer, sans viser aucune autre image :"
  echo "  sudo docker image rm portfolio-next/blog-api:$TAG portfolio-next/latex-runner:$TAG portfolio-next/cv-extractor:$TAG"
  verdict; rc=$?
  journal arreter "$rc"
  return "$rc"
}

# ── historique : lecture seule, pour choisir le commit d'un retour arrière ──
cmd_historique() {
  need_root
  section "Version en service"
  docker inspect --format '{{.Config.Image}} ; {{.State.Status}} {{with index .State "Health"}}{{.Status}}{{end}} ; démarré {{.State.StartedAt}}' blog-api-next 2>/dev/null ||
    echo "blog-api-next absent"
  section "Journal ($STATE_DIR/deploiements.log : date, action, commit, résultat, copie)"
  tail -n 20 "$STATE_DIR/deploiements.log" 2>/dev/null || echo "vide"
  section "Copies présentes à côté de celle-ci ($(dirname "$ROOT"))"
  for d in "$(dirname "$ROOT")/$PROJECT"-*; do
    [ -d "$d" ] && echo "$(basename "$d") : commit $(cat "$d/.next-commit" 2>/dev/null || echo inconnu)"
  done
  section "Images construites (un retour arrière vers ces commits ne reconstruit rien)"
  docker image ls --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}} {{.Size}}' | grep '^portfolio-next/' || echo "aucune"
}

case "${1:-}" in
  recuperer)  shift; cmd_recuperer "$@" ;;
  inventaire) cmd_inventaire ;;
  env)        cmd_env ;;
  env-definir) shift; cmd_env_definir "$@" ;;
  verifier-tls) shift; cmd_verifier_tls "$@" ;;
  sauvegarder-mongo) cmd_sauvegarder_mongo ;;
  verifier-archive) shift; cmd_verifier_archive "$@" ;;
  verifier)   cmd_verifier ;;
  construire) cmd_construire ;;
  demarrer)   cmd_demarrer ;;
  controler)  cmd_controler ;;
  arreter)    cmd_arreter ;;
  historique) cmd_historique ;;
  *)          sed -n '3,16p' "$0"; exit 2 ;;
esac
