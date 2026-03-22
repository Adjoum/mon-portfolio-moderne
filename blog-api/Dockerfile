# ── blog-api/Dockerfile ──────────────────────────────────────
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY tsconfig.json ./

# Installer toutes les dépendances (dev inclus pour compiler)
RUN npm ci

# Copier le source TypeScript
COPY src/ ./src/

# Compiler TypeScript → JavaScript
RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Métadonnées
LABEL maintainer="Adjoumani Koffi Wilfried <contact@adjoumani-koffi.com>"
LABEL description="Blog API — FastAPI/Node.js backend"

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001 -G nodejs

# Copier seulement les dépendances de production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copier le build compilé depuis le stage builder
COPY --from=builder /app/dist ./dist

# Créer le dossier uploads avec les bonnes permissions
RUN mkdir -p public/uploads && \
    chown -R nodeuser:nodejs /app

# Passer à l'utilisateur non-root
USER nodeuser

# Exposer le port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

# Démarrer l'application compilée
CMD ["node", "dist/index.js"]
