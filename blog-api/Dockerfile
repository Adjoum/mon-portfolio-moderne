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
    perl \
    ghostscript \
    make \
    latexmk \
    texlive-full \
    poppler-utils \
 && rm -rf /var/lib/apt/lists/*

RUN which pdflatex && which latexmk && which xelatex && which lualatex

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
  CMD wget -qO- https://api.adjoumani-koffi.com/api/health || exit 1  
# http://localhost:5000/api/health
CMD ["node", "dist/index.js"]