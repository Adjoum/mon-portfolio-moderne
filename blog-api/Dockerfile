# ── blog-api/Dockerfile ──────────────────────────────────────
# Image épinglée par empreinte (multi-architecture : x86_64 et ARM64 Oracle).
# Aucun secret ici : les variables arrivent à l'exécution (env_file).
# La compilation LaTeX reste hors de ce conteneur : aucune chaîne TeX dans l'image.

# Build stage
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src/ ./src/

RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS production

WORKDIR /app

LABEL maintainer="Adjoumani Koffi Wilfried <contact@adjoumani-koffi.com>"
LABEL description="Blog API — Node.js backend"

ENV NODE_ENV=production

# Utilisateur non-root
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m -s /usr/sbin/nologin nodeuser

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p public/uploads && \
    chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 5000

# Contrôle local du conteneur (Node intégré : ni curl ni wget dans l'image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
