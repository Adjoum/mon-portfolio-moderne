# ── blog-api/Dockerfile ──────────────────────────────────────
# Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Dépendances système utiles au build natif éventuel
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src/ ./src/

RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:20-bookworm-slim AS production

WORKDIR /app

LABEL maintainer="Adjoumani Koffi Wilfried <contact@adjoumani-koffi.com>"
LABEL description="Blog API — Node.js backend with LaTeX compilation"

# Installer LaTeX + latexmk
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    lmodern \
    latexmk \
 && rm -rf /var/lib/apt/lists/*

# Vérification optionnelle utile au debug
RUN which pdflatex && which latexmk

# Utilisateur non-root
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m -s /bin/bash nodeuser

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p public/uploads && \
    chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.js"]