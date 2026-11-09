#!/bin/sh
# Banc Docker de deploy/oracle/next.sh recuperer : livraison depuis le dépôt Git (GitHub), par commit exact.
#
#   sh tests/oracle/recuperer.bench.sh
#   NEXT_ARCHIVE=/d/portfolio-sauvegardes/portfolio-next-d0fead7062a9.tar.gz sh tests/oracle/recuperer.bench.sh
#
# Comme sur la VM : Ubuntu 24.04, dash, utilisateur ubuntu, sudo réservé aux autres commandes.
# Le dépôt de livraison est joué par un dépôt nu local (branche release/portfolio-next = commit d0fead7062a9) ;
# le commit livré ajoute la version de travail de next.sh, du README et de vercel.json.
# NEXT_ARCHIVE : archive réellement transférée sur la VM, comparée au commit sans être remplacée.
# Aucun réseau, aucun volume, aucun accès à Docker depuis le conteneur ; dépôt monté en lecture seule.
set -u
BASE=d0fead7062a9ba8d2fbd63f71b263832f713c073

if [ "${1:-}" != --dedans ]; then
  ROOT=$(cd "$(dirname "$0")/../.." && pwd)
  DROOT=$(cd "$ROOT" && { pwd -W 2>/dev/null || pwd; })
  export MSYS_NO_PATHCONV=1
  IMG=portfolio-banc-git:24.04
  # NEXT_BANC_BASE : autre image Ubuntu 24.04 déjà présente (portfolio-banc-ubuntu:24.04), si Docker Hub ne répond pas
  docker build -q --build-arg BASE="${NEXT_BANC_BASE:-ubuntu:24.04}" -t "$IMG" - >/dev/null <<'EOF' || { echo "ARRÊT : construction de l'image du banc"; exit 1; }
ARG BASE
FROM $BASE
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*
EOF
  set -- -v "$DROOT:/srv/repo:ro"
  if [ -n "${NEXT_ARCHIVE:-}" ]; then
    [ -s "$NEXT_ARCHIVE" ] || { echo "ARRÊT : $NEXT_ARCHIVE introuvable"; exit 1; }
    A=$(cd "$(dirname "$NEXT_ARCHIVE")" && { pwd -W 2>/dev/null || pwd; })/$(basename "$NEXT_ARCHIVE")
    set -- "$@" -v "$A:/srv/archive.tar.gz:ro"
  fi
  docker run --rm --network none --log-driver none "$@" "$IMG" sh /srv/repo/tests/oracle/recuperer.bench.sh --dedans
  exit $?
fi

# ── Dans le conteneur (root) ─────────────────────────────────────────────────
PASS=0
FAIL=0
ok()      { PASS=$((PASS + 1)); printf '  ✔ %s\n' "$*"; }
ko()      { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$*"; }
section() { printf '\n▶ %s\n' "$1"; }
has()     { if printf '%s\n' "$1" | grep -q -- "$2"; then ok "$3"; else ko "$3 (absent : $2)"; printf '%s\n' "$1" | sed 's/^/      /'; fi; }
code()    { if [ "$1" = "$2" ]; then ok "$3"; else ko "$3 (code $1, attendu $2)"; fi; }
# Commandes de l'utilisateur ubuntu, comme sur la VM ; sortie dans $OUT, code dans $RC
U=/home/ubuntu
NH=$U/portfolio-next
as_ubuntu() { OUT=$(su -s /bin/sh ubuntu -c "cd $NH 2>/dev/null || cd; HOME=$U; export HOME; $1" 2>&1); RC=$?; }
# Empreinte d'une arborescence : chemins, droits et contenus
tree_sum() { (cd "$1" && find . -printf '%p %m\n' | sort && find . -type f -exec sha256sum {} + | sort) | sha256sum | cut -c1-16; }
leftovers() { find "$NH" -maxdepth 1 -name '.recuperation-*' | wc -l; }
G="git -c safe.directory=* -c user.name=banc -c user.email=banc@exemple.invalid"

section "Préparation : faux dépôt de livraison, ancien dépôt, dépôt nu de la VM (README §4)"
# Conteneur jetable : root manipule les dépôts d'ubuntu (upload-pack ignore safe.directory passé par -c)
git config --global safe.directory '*'
$G clone -q --bare --no-local --single-branch --branch release/portfolio-next /srv/repo /srv/gitlab.git 2>&1 | tail -2
$G -C /srv/gitlab.git update-ref refs/heads/release/portfolio-next "$BASE"
$G -C /srv/gitlab.git for-each-ref --format='%(refname)' | grep -v '^refs/heads/release/portfolio-next$' |
  while read -r r; do $G -C /srv/gitlab.git update-ref -d "$r"; done
chown -R ubuntu:ubuntu /srv/gitlab.git
# Ancien déploiement : un dépôt dont rien ne doit changer
mkdir -p "$U/adjoumani-portfolio" && $G -C "$U/adjoumani-portfolio" init -q && echo ancien > "$U/adjoumani-portfolio/f" &&
  $G -C "$U/adjoumani-portfolio" add f && $G -C "$U/adjoumani-portfolio" commit -qm ancien &&
  $G -C "$U/adjoumani-portfolio" remote add origin /srv/gitlab.git && chown -R ubuntu:ubuntu "$U/adjoumani-portfolio"
LEGACY_SUM=$(tree_sum "$U/adjoumani-portfolio")
as_ubuntu "mkdir -p $NH && git init --bare -q $NH/depot.git &&
  git -C $NH/depot.git remote add origin \"\$(git -C $U/adjoumani-portfolio remote get-url origin)\""
code "$RC" 0 "dépôt nu créé, origine lue dans l'ancien dépôt sans l'écrire"

# Commit livré : d0fead7 + version de travail de next.sh, du README et de vercel.json
W=/tmp/travail
$G clone -q /srv/gitlab.git "$W"
cp /srv/repo/deploy/oracle/next.sh /srv/repo/deploy/oracle/README.md "$W/deploy/oracle/"
cp /srv/repo/vercel.json "$W/vercel.json"
$G -C "$W" add -A && $G -C "$W" commit -qm "banc : next.sh recuperer"
$G -C "$W" push -q origin HEAD:release/portfolio-next
X=$($G -C "$W" rev-parse HEAD); XS=$(printf %s "$X" | cut -c1-12)
[ "$($G -C /srv/gitlab.git rev-parse release/portfolio-next 2>/dev/null)" = "$X" ] && [ "$X" != "$BASE" ] ||
  { echo "ARRÊT : préparation du faux dépôt de livraison"; exit 1; }
BS=$(printf %s "$BASE" | cut -c1-12)
echo "  commit livré : $XS ; candidat : $BS"

section "Refus"
OUT=$(cd /tmp && sh /srv/repo/deploy/oracle/next.sh recuperer "$BASE" 2>&1); RC=$?
code "$RC" 1 "lancé en root : refusé"; has "$OUT" "sans sudo" "message : sans sudo"
as_ubuntu "sh /srv/repo/deploy/oracle/next.sh recuperer d0fead7"
code "$RC" 1 "commit de moins de 12 caractères : refusé"
as_ubuntu "sh /srv/repo/deploy/oracle/next.sh recuperer 'd0fead7062a9;id'"
code "$RC" 1 "argument non hexadécimal : refusé"
as_ubuntu "NEXT_HOME=/tmp/vide sh /srv/repo/deploy/oracle/next.sh recuperer $BASE"
code "$RC" 1 "dépôt nu absent : refusé"; has "$OUT" "README.md §4" "renvoi vers la création du dépôt nu"
as_ubuntu "sh /srv/repo/deploy/oracle/next.sh recuperer 0123456789abcdef0123"
code "$RC" 1 "commit inconnu du dépôt de livraison : refusé"

section "Commande du README sur la VM : script lu dans le commit livré"
as_ubuntu "git -C depot.git fetch --quiet --no-tags origin '+refs/heads/release/portfolio-next:refs/remotes/origin/release/portfolio-next' &&
  git -C depot.git show \"$X\":deploy/oracle/next.sh | sh -s recuperer \"$X\""
code "$RC" 0 "recuperer $XS : verdict sans point bloquant"
has "$OUT" "copie créée : $NH/portfolio-next-$XS" "copie créée au nom attendu"
has "$OUT" "fins de ligne LF" "fins de ligne LF"
D="$NH/portfolio-next-$XS"
code "$(cat "$D/.next-commit")" "$XS" ".next-commit = $XS"
EXP=$($G -C /srv/gitlab.git ls-tree -r --name-only "$X" | wc -l)
code "$(find "$D" -type f ! -name .next-commit | wc -l)" "$EXP" "copie complète : $EXP fichiers du commit"
mkdir /tmp/ref && $G -C /srv/gitlab.git archive "$X" | tar -x -C /tmp/ref
if diff -rq -x .next-commit /tmp/ref "$D" >/dev/null; then ok "contenu identique au commit, octet pour octet"; else ko "contenu différent du commit"; fi
code "$(stat -c '%U' "$D")" ubuntu "copie à l'utilisateur ubuntu, pas à root"
code "$(leftovers)" 0 "aucun dossier temporaire laissé"

section "Copie existante, jamais remplacée"
SUM=$(tree_sum "$D")
as_ubuntu "sh $D/deploy/oracle/next.sh recuperer $X"
code "$RC" 0 "même commit relancé : constaté identique"
has "$OUT" "identique au commit (rien n'est remplacé)" "message : identique, rien n'est remplacé"
code "$(tree_sum "$D")" "$SUM" "copie inchangée"
echo modifié >> "$D/blog-api/package.json"
SUM=$(tree_sum "$D")
as_ubuntu "sh $D/deploy/oracle/next.sh recuperer $X"
code "$RC" 1 "copie modifiée : point bloquant"
has "$OUT" "blog-api/package.json" "fichier en écart nommé"
code "$(tree_sum "$D")" "$SUM" "copie modifiée laissée telle quelle"
code "$(leftovers)" 0 "aucun dossier temporaire laissé"

section "Candidat d0fead7062a9 déjà présent sur la VM"
C="$NH/portfolio-next-$BS"
if [ -s /srv/archive.tar.gz ]; then
  mkdir -p "$C" && tar -xzf /srv/archive.tar.gz -C "$C" && echo "  copie : archive transférée le 05/11"
else
  mkdir -p "$C" && $G -C /srv/gitlab.git archive "$BASE" | tar -x -C "$C" && echo "  copie : simulée (NEXT_ARCHIVE absent)"
fi
chown -R ubuntu:ubuntu "$C"
SUM=$(tree_sum "$C")
as_ubuntu "sh $D/deploy/oracle/next.sh recuperer $BASE"
code "$RC" 1 "sans .next-commit : point bloquant"
has "$OUT" "identique au commit" "contenu reconnu identique au commit livré"
has "$OUT" "$BS > $C/.next-commit" "commande de correction affichée"
code "$(tree_sum "$C")" "$SUM" "copie inchangée"
printf '%s\n' "$BS" > "$C/.next-commit" && chown ubuntu:ubuntu "$C/.next-commit"
as_ubuntu "sh $D/deploy/oracle/next.sh recuperer $BASE"
code "$RC" 0 "avec .next-commit : aucun point bloquant"

section "Commit retiré de la branche publiée (force push), puis commit en CRLF"
$G -C "$W" commit -q --allow-empty -m "banc : commit retiré"
$G -C "$W" push -q origin HEAD:release/portfolio-next
R=$($G -C "$W" rev-parse HEAD)
as_ubuntu "sh $D/deploy/oracle/next.sh recuperer $R"
code "$RC" 0 "commit publié : accepté"
$G -C "$W" push -q -f origin "$X:release/portfolio-next"
as_ubuntu "sh $D/deploy/oracle/next.sh recuperer $R"
code "$RC" 1 "même commit retiré de la branche : refusé"
has "$OUT" "absent de la branche release/portfolio-next publiée" "message : absent de la branche publiée"
$G -C "$W" reset -q --hard "$X"
printf 'FROM scratch\r\n' > "$W/blog-api/Dockerfile"
$G -C "$W" -c core.autocrlf=false add blog-api/Dockerfile && $G -C "$W" commit -qm "banc : CRLF"
$G -C "$W" push -q origin HEAD:release/portfolio-next
K=$($G -C "$W" rev-parse HEAD); KS=$(printf %s "$K" | cut -c1-12)
as_ubuntu "sh $D/deploy/oracle/next.sh recuperer $K"
code "$RC" 1 "commit en CRLF : point bloquant"
if [ -e "$NH/portfolio-next-$KS" ]; then ko "copie CRLF créée"; else ok "aucune copie créée"; fi
code "$(leftovers)" 0 "aucun dossier temporaire laissé"

section "Ancien déploiement"
code "$(tree_sum "$U/adjoumani-portfolio")" "$LEGACY_SUM" "dépôt de l'ancien déploiement inchangé"

printf '\nRÉSULTAT : %s réussis, %s échoués\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
