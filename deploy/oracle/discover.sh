#!/bin/sh
# Inventaire de la VM Oracle qui héberge blog-api, en LECTURE SEULE.
# Rien n'est installé, modifié ni redémarré. Aucune VALEUR de variable n'est affichée :
# seulement les noms (secrets compris), chemins, versions, ports et directives nginx utiles.
#
#   sudo SUPABASE_REF=<ref> POOLER_HOST=<hôte du pooler> sh discover.sh > vm-inventaire.txt 2>&1
#
# Relisez vm-inventaire.txt avant de le transmettre.
set -u
REF="${SUPABASE_REF:-}"
POOLER="${POOLER_HOST:-}"

section() { printf '\n=== %s ===\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1; }
# NOM=valeur → NOM ; toute autre ligne est ignorée. Une variable définie plusieurs fois est
# signalée (NOM(×2)) : selon l'outil, c'est la première ou la dernière valeur qui s'applique.
names() {
  sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*/\2/p' | sort | uniq -c |
    awk '{ printf "%s%s ", $2, ($1 > 1 ? "(×" $1 ")" : "") } END { print "" }'
}
# Masque toute affectation NOM=valeur dans une ligne de commande
mask() { sed -E 's/([A-Za-z_][A-Za-z0-9_]*)=[^[:space:]]+/\1=<masqué>/g'; }
# Structure d'un fichier compose : clés, images, construction, ports ; aucune valeur d'environnement
outline() {
  sed -nE '/^[[:space:]]*#/d
    /^[[:space:]]*[A-Za-z0-9_.-]+:[[:space:]]*$/p
    /^[[:space:]]*(image|build|context|dockerfile|env_file|restart|container_name|network_mode|profiles):[[:space:]]*[^[:space:]]/p
    /^[[:space:]]*-[[:space:]]*"?[0-9.]*:?(\$\{[A-Za-z_]+:-[0-9]+\}|[0-9]+):[0-9]+(\/(tcp|udp))?"?[[:space:]]*$/p' | sed 's/^/    /'
}
# Dépôt Git d'un dossier : commit, branche, hôte distant (identifiants masqués)
gitinfo() {
  git -c safe.directory='*' -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  git -c safe.directory='*' -C "$1" log -1 --format='    commit %h (%cd) %s' --date=short
  echo "    branche : $(git -c safe.directory='*' -C "$1" rev-parse --abbrev-ref HEAD)"
  git -c safe.directory='*' -C "$1" remote -v 2>/dev/null | awk '$3 == "(fetch)" {print "    distant : " $1 " " $2}' | sed -E 's#://[^@/]*@#://<masqué>@#'
  # --no-optional-locks : git status ne réécrit pas l'index
  git --no-optional-locks -c safe.directory='*' -C "$1" status --short | head -10 | sed 's/^/    /'
}

section "Système"
uname -srm
echo "architecture : $(uname -m)"
[ -r /etc/os-release ] && (. /etc/os-release && echo "${PRETTY_NAME:-}")
echo "processeurs : $(nproc 2>/dev/null)"
has free && free -m | sed -n '1,3p'
df -h / | tail -1
echo "démarré depuis : $(uptime -p 2>/dev/null || uptime)"
if has node; then echo "node (hôte) : $(node --version)"; else echo "node (hôte) : absent"; fi
ls -d /home/*/.nvm/versions/node/* /root/.nvm/versions/node/* 2>/dev/null | sed 's/^/nvm : /'

section "Docker"
if has docker; then
  docker version --format 'client {{.Client.Version}}, serveur {{.Server.Version}} ({{.Server.Os}}/{{.Server.Arch}})' 2>&1 | head -2
  docker compose version 2>&1 | head -1
  docker ps -a --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}'
  for c in $(docker ps -q); do
    echo "--- $(docker inspect --format '{{.Name}}' "$c")"
    docker inspect --format 'compose : {{index .Config.Labels "com.docker.compose.project.working_dir"}} {{index .Config.Labels "com.docker.compose.project.config_files"}} ; redémarrage : {{.HostConfig.RestartPolicy.Name}}' "$c"
    printf 'variables (noms) : '; docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$c" | names
    # Seule valeur affichée : la version de Node fournie par l'image officielle (pas un secret)
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$c" | sed -n 's/^NODE_VERSION=\([0-9.]*\)$/version Node : \1/p'
    docker inspect --format 'montages : {{range .Mounts}}{{.Source}} -> {{.Destination}} ({{if .RW}}rw{{else}}ro{{end}})  {{end}}' "$c"
  done
  docker images --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.CreatedSince}}' | head -15
else
  echo "docker absent"
fi

section "Processus Node, pm2, systemd"
# Programme et premier argument seulement : un secret passé en argument ne s'affiche pas
# (Node 24 nomme son processus « MainThread » : recherche sur la ligne de commande, pas sur le nom)
ps -eo user=,pid=,etime=,args= | grep -E '[n]ode|[P]M2|[p]m2' | awk '{ printf "%s %s %s %s %s", $1, $2, $3, $4, $5; if (NF > 5) printf " (+%d argument(s) non affiché(s))", NF - 5; print "" }' | mask
for pid in $(pgrep -f "^(/[^ ]*/)?node( |$)" 2>/dev/null); do
  cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null) || continue
  exe=$(readlink "/proc/$pid/exe" 2>/dev/null)
  echo "--- pid $pid : dossier $cwd ; exécutable $exe $("$exe" --version 2>/dev/null | head -1)"
  gitinfo "$cwd"
done
for u in $(ps -eo user=,args= | grep '[P]M2' | awk '{print $1}' | sort -u); do
  echo "--- pm2 de $u"
  su - "$u" -c 'pm2 ls --no-color' 2>&1 | head -20
done
if has systemctl; then
  systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | grep -i -E 'node|api|blog|pm2|docker|nginx|mongo'
  for unit in $(systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null | awk '{print $1}' | grep -i -E 'blog|api|portfolio|pm2'); do
    echo "--- $unit"
    systemctl cat "$unit" 2>/dev/null | grep -v '^#' | sed -E -e 's/^(Environment=)("?[A-Za-z_][A-Za-z0-9_]*)=.*/\1\2=<masqué>/' -e 's/^(Exec[A-Za-z]*=[^[:space:]]+([[:space:]]+[^[:space:]]+)?)[[:space:]].*/\1 <arguments suivants non affichés>/'
  done
fi

section "Fichiers d'environnement (noms des variables uniquement) et fichiers compose (structure)"
for f in $( { echo /etc/blog-api/api.env
  find / -xdev \( -path /proc -o -path /sys -o -path /var/lib/docker -o -path /snap -o -name node_modules \) -prune -o \
    -type f \( -name '.env' -o -name '.env.*' -o -name 'api.env' -o -name 'ecosystem.config.*' \
    -o -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' -o -name 'compose.yml' -o -name 'compose.yaml' \) -print 2>/dev/null; } | sort -u | head -60); do
  [ -f "$f" ] || continue
  echo "--- $f ($(stat -c '%U:%G %a' "$f"), modifié le $(date -r "$f" +%F 2>/dev/null))"
  case "$f" in
    *.yml|*.yaml) outline < "$f" ;;
    *.js|*.cjs|*.json) echo "    (configuration pm2 : contenu non affiché)" ;;
    *) printf '    '; names < "$f" ;;
  esac
done

section "Méthode de déploiement"
# Dossiers des fichiers compose et des processus Node : dépôt Git ? scripts présents ?
for d in $( { find / -xdev \( -path /proc -o -path /sys -o -path /var/lib/docker -o -path /snap -o -name node_modules \) -prune -o \
    -type f \( -name 'docker-compose*.yml' -o -name 'compose.yml' -o -name 'Dockerfile' \) -print 2>/dev/null | xargs -r -n1 dirname
  for pid in $(pgrep -f "^(/[^ ]*/)?node( |$)" 2>/dev/null); do readlink "/proc/$pid/cwd" 2>/dev/null; done; } | sort -u | head -15); do
  echo "--- $d"
  echo "    fichiers : $(ls -1A "$d" 2>/dev/null | grep -v -E '^\.env' | head -40 | tr '\n' ' ')"
  gitinfo "$d"
done
has gitlab-runner && echo "gitlab-runner : $(gitlab-runner --version 2>/dev/null | head -1) ; service $(systemctl is-active gitlab-runner 2>/dev/null)"
ls -d /home/*/actions-runner /opt/actions-runner 2>/dev/null | sed 's/^/runner GitHub Actions : /'
# Tâches planifiées : horaire et programme lancé, jamais les arguments
for u in $(cut -d: -f1 /etc/passwd); do
  crontab -l -u "$u" 2>/dev/null | grep -v -E '^[[:space:]]*(#|$|[A-Za-z_]+=)' | awk -v u="$u" '{
    kw = ""; n = split("docker git pm2 deploy npm node certbot backup", k, " ")
    for (i = 1; i <= n; i++) if (index($0, k[i])) kw = kw " " k[i]
    if ($1 ~ /^@/) when = $1; else when = $1 " " $2 " " $3 " " $4 " " $5
    prog = ($1 ~ /^@/) ? $2 : $6
    print "cron " u " : " when " → " prog " (mots-clés :" kw ")"
  }'
done
ls /etc/cron.d 2>/dev/null | sed 's/^/cron.d : /'

section "État des services"
if has systemctl; then
  for s in docker containerd nginx $(systemctl list-unit-files --no-legend 'pm2-*.service' 2>/dev/null | awk '{print $1}'); do
    systemctl list-unit-files --no-legend "${s%.service}.service" 2>/dev/null | grep -q . || continue
    echo "${s%.service} : $(systemctl is-active "$s" 2>/dev/null) ($(systemctl is-enabled "$s" 2>/dev/null))"
  done
  echo "unités en échec : $(systemctl --failed --no-legend --no-pager 2>/dev/null | awk '{print $1}' | tr '\n' ' ')"
fi
has docker && docker ps -a --format '{{.Names}} : {{.Status}}' | sed 's/^/conteneur /'

section "nginx"
if has nginx; then
  nginx -v 2>&1
  nginx -T 2>/dev/null | grep -E '^# configuration file|^[[:space:]]*(server_name|listen|location|proxy_pass|proxy_read_timeout|proxy_send_timeout|proxy_connect_timeout|proxy_buffering|proxy_http_version|client_max_body_size|keepalive_timeout|limit_req|ssl_certificate|add_header Strict)' | sed -E 's/[[:space:]]+/ /g'
else
  echo "nginx absent"
fi
has certbot && certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry'

section "Réseau"
has ss && ss -ltnp 2>/dev/null | sed -E 's/users:\(\("([^"]+)".*/\1/'
echo "route IPv6 par défaut : $(ip -6 route show default 2>/dev/null | head -1)"
has ufw && ufw status 2>/dev/null | head -15
has iptables && iptables -S INPUT 2>/dev/null | head -25
[ -n "$REF" ] && echo "db.$REF.supabase.co : $(getent ahosts "db.$REF.supabase.co" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
if [ -n "$POOLER" ]; then
  echo "$POOLER : $(getent ahostsv4 "$POOLER" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if has nc; then nc -z -w 5 "$POOLER" 5432 && echo "port 5432 joignable" || echo "port 5432 NON joignable"; fi
fi

section "Accès sortant HTTPS (sans clé, aucun appel facturé)"
if has curl; then
  for h in api.openai.com api.groq.com api.x.ai generativelanguage.googleapis.com openrouter.ai api.anthropic.com; do
    echo "$h : HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://$h/" 2>/dev/null)"
  done
  section "API locale"
  curl -s --max-time 5 http://127.0.0.1:5000/api/health; echo
fi
