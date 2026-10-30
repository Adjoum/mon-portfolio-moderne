#!/bin/sh
# Test de non-fuite de discover.sh : une VM simulée, remplie de faux secrets « CANARY », dans
# un conteneur jetable. Aucun ne doit apparaître dans la sortie. Depuis la racine du dépôt :
#
#   docker run --rm -v "$PWD/deploy/oracle:/scripts:ro" node:24-bookworm-slim sh /scripts/discover-canary-test.sh
#
# (réseau nécessaire pour installer git et procps dans le conteneur)
set -e
# Garde-fou : ce test écrit dans /etc/blog-api et /srv/app. Jamais sur une vraie machine.
[ -f /.dockerenv ] || { echo "Refus : à lancer uniquement dans un conteneur Docker jetable"; exit 2; }
for d in /etc/blog-api /srv/app; do [ ! -e "$d" ] || { echo "Refus : $d existe déjà"; exit 2; }; done
apt-get update -qq >/dev/null && apt-get install -y -qq git procps >/dev/null 2>&1
mkdir -p /etc/blog-api /srv/app /usr/local/bin
printf 'OPENAI_API_KEY=sk-CANARY01aaaaaaaaaaaaaaaaaaaaa\nexport AI_DATABASE_URL="postgres://u:CANARY02@h/db"\n' > /etc/blog-api/api.env
printf 'JWT_SECRET=CANARY03\nMONGODB_URI=mongodb://a:CANARY04@m/db\n' > /srv/app/.env
cat > /srv/app/docker-compose.yml <<'Y'
services:
  api:
    image: blog-api:latest
    build:
      context: ./blog-api
    env_file: /etc/blog-api/api.env
    restart: unless-stopped
    environment:
      - MONGO_PASSWORD=CANARY05
      POSTGRES_PASSWORD: CANARY06
      SECRET_BLOCK: >
        CANARY07
    command: node server.js --token CANARY08
    ports:
      - "127.0.0.1:5000:5000"
      - "127.0.0.1:${FRONTEND_PORT:-8080}:80"
    labels:
      - "traefik.http.middlewares.auth.basicauth.users=admin:CANARY09"
Y
cd /srv/app && git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init && git remote add origin https://user:CANARY10@gitlab.com/x/y.git
# Faux crontab (commande absente de l'image)
cat > /usr/local/bin/crontab <<'C'
#!/bin/sh
[ "$3" = root ] || exit 1
printf 'SECRET=CANARY11\n# commentaire CANARY12\n*/5 * * * * /srv/app/deploy.sh --token CANARY13 && docker compose up -d\n@reboot /usr/bin/node /srv/app/x.js CANARY14\n'
C
chmod +x /usr/local/bin/crontab
cd /srv/app && API_KEY=CANARY15 node -e "setInterval(()=>{},1e6)" CANARY16 --password=CANARY17 &
sleep 1
out=$(SUPABASE_REF=exemple sh /scripts/discover.sh 2>&1)
leaks=$(printf '%s\n' "$out" | grep -c CANARY || true)
printf '%s\n' "$out" | grep -q 'pid .* dossier /srv/app' || { echo "ÉCHEC : processus Node non détecté"; exit 1; }
[ "$leaks" -eq 0 ] || { printf '%s\n' "$out" | grep CANARY; echo "ÉCHEC : $leaks fuite(s)"; exit 1; }
echo "OK : aucune fuite, processus Node détecté"
