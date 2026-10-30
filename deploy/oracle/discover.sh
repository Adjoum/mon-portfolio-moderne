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
# NOM=valeur → NOM ; toute autre ligne est ignorée
names() { sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*/\2/p' | sort -u | tr '\n' ' '; echo; }
# Masque toute affectation NOM=valeur dans une ligne de commande
mask() { sed -E 's/([A-Za-z_][A-Za-z0-9_]*)=[^[:space:]]+/\1=<masqué>/g'; }

section "Système"
uname -srm
[ -r /etc/os-release ] && (. /etc/os-release && echo "${PRETTY_NAME:-}")
echo "processeurs : $(nproc 2>/dev/null)"
has free && free -m | sed -n '1,3p'
df -h / | tail -1

section "Docker"
if has docker; then
  docker version --format 'client {{.Client.Version}}, serveur {{.Server.Version}} ({{.Server.Os}}/{{.Server.Arch}})' 2>&1 | head -2
  docker compose version 2>&1 | head -1
  docker ps -a --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}'
  for c in $(docker ps -q); do
    echo "--- $(docker inspect --format '{{.Name}}' "$c")"
    docker inspect --format 'compose : {{index .Config.Labels "com.docker.compose.project.working_dir"}} {{index .Config.Labels "com.docker.compose.project.config_files"}} ; redémarrage : {{.HostConfig.RestartPolicy.Name}}' "$c"
    printf 'variables (noms) : '; docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$c" | names
    docker inspect --format 'montages : {{range .Mounts}}{{.Source}} -> {{.Destination}} ({{if .RW}}rw{{else}}ro{{end}})  {{end}}' "$c"
  done
  docker images --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.CreatedSince}}' | head -15
else
  echo "docker absent"
fi

section "Processus Node, pm2, systemd"
ps -eo user=,pid=,etime=,args= | grep -E '[n]ode|[P]M2|[p]m2' | cut -c1-200 | mask
for pid in $(pgrep node 2>/dev/null); do
  cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null) || continue
  echo "--- pid $pid : dossier $cwd"
  if git -c safe.directory='*' -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -c safe.directory='*' -C "$cwd" log -1 --format='    commit %h (%cd) %s' --date=short
    echo "    branche : $(git -c safe.directory='*' -C "$cwd" rev-parse --abbrev-ref HEAD)"
    git -c safe.directory='*' -C "$cwd" status --short | head -10 | sed 's/^/    /'
  fi
done
for u in $(ps -eo user=,args= | grep '[P]M2' | awk '{print $1}' | sort -u); do
  echo "--- pm2 de $u"
  su - "$u" -c 'pm2 ls --no-color' 2>&1 | head -20
done
if has systemctl; then
  systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | grep -i -E 'node|api|blog|pm2|docker|nginx|mongo'
  for unit in $(systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null | awk '{print $1}' | grep -i -E 'blog|api|portfolio|pm2'); do
    echo "--- $unit"
    systemctl cat "$unit" 2>/dev/null | grep -v '^#' | sed -E 's/^(Environment=)("?[A-Za-z_][A-Za-z0-9_]*)=.*/\1\2=<masqué>/'
  done
fi

section "Fichiers d'environnement (noms des variables uniquement)"
for f in $( { echo /etc/blog-api/api.env
  find / -xdev \( -path /proc -o -path /sys -o -path /var/lib/docker -o -path /snap -o -name node_modules \) -prune -o \
    -type f \( -name '.env' -o -name '.env.*' -o -name 'api.env' -o -name 'ecosystem.config.*' \) -print 2>/dev/null; } | sort -u | head -40); do
  [ -f "$f" ] || continue
  echo "--- $f ($(stat -c '%U:%G %a' "$f"))"
  case "$f" in
    *.js|*.cjs|*.json) echo "    (configuration pm2 : contenu non affiché)" ;;
    *) printf '    '; names < "$f" ;;
  esac
done

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
