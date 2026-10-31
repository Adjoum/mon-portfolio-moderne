# ── latex-runner/Dockerfile ──────────────────────────────────
# Compilation LaTeX isolée de blog-api (audit S2, doc 10 §4).
# Aucun secret ici ni à l'exécution : le service ne reçoit que le source .tex et la photo.
# Isolement complété par docker-compose.yml : réseau interne sans sortie, racine en lecture seule,
# /work en tmpfs, aucune capacité, no-new-privileges, limites de mémoire, de CPU et de processus.
#
# Même image de base que l'API (multi-architecture : x86_64 et ARM64 Oracle), épinglée par empreinte.
# TeX Live de Debian, réduit aux collections utiles aux templates et au prompt latex.generate.

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

LABEL maintainer="Adjoumani Koffi Wilfried <contact@adjoumani-koffi.com>"
LABEL description="latex-runner — compilation pdflatex isolée, sans secret ni réseau"

ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-fonts-recommended \
      texlive-lang-french \
      lmodern \
      cm-super \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man /usr/share/info \
           /usr/share/texlive/texmf-dist/doc /usr/share/texmf/doc

# Politique TeX pour documents non fiables, appliquée par défaut à tout le système
# (le serveur la repasse aussi dans l'environnement de chaque compilation) :
#   shell_escape = f   aucune commande externe (\write18, \input|…)
#   openin_any   = p   lecture refusée hors du dossier de travail (chemins absolus, .., fichiers cachés)
#   openout_any  = p   écriture limitée au dossier de travail
# Debian lit /etc/texmf/web2c/texmf.cnf avant le texmf.cnf de la distribution : ces valeurs l'emportent.
RUN printf '%s\n' \
      '% latex-runner : documents non fiables' \
      'shell_escape = f' \
      'openin_any = p' \
      'openout_any = p' \
      'parse_first_line = f' \
      >> /etc/texmf/web2c/texmf.cnf \
 && test "$(kpsewhich -var-value=shell_escape)" = f \
 && test "$(kpsewhich -var-value=openin_any)" = p \
 && test "$(kpsewhich -var-value=openout_any)" = p \
 # Aucun binaire setuid ou setgid (no-new-privileges les neutralise déjà)
 && find / -xdev -perm /6000 -type f -exec chmod a-s {} + \
 # Utilisateur sans privilège, sans shell ni répertoire personnel
 && groupadd -g 10001 latex \
 && useradd -u 10001 -g latex -M -d /nonexistent -s /usr/sbin/nologin latex

WORKDIR /app
COPY package.json ./
COPY src/ ./src/

USER 10001:10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.mjs"]
