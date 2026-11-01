# ── cv-extractor/Dockerfile ──────────────────────────────────
# Extraction du texte des CV importés (PDF, DOCX, TXT, RTF), hors de blog-api qui détient les secrets.
# Aucun secret ici ni à l'exécution. Isolement complété par docker-compose.yml : réseau interne sans
# sortie, racine en lecture seule, aucune capacité, no-new-privileges, ressources bornées.
# Même image de base que l'API et latex-runner (multi-architecture), épinglée par empreinte.

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

LABEL maintainer="Adjoumani Koffi Wilfried <contact@adjoumani-koffi.com>"
LABEL description="cv-extractor — extraction de texte isolée, sans secret ni réseau"

ENV NODE_ENV=production

WORKDIR /app
COPY package.json package-lock.json ./
# Versions figées par le fichier de verrouillage ; aucun script d'installation, aucun module natif
# optionnel (rendu graphique inutile pour extraire du texte)
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force \
 && find / -xdev -perm /6000 -type f -exec chmod a-s {} + \
 && groupadd -g 10002 extract \
 && useradd -u 10002 -g extract -M -d /nonexistent -s /usr/sbin/nologin extract

COPY src/ ./src/

USER 10002:10002

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.mjs"]
