# deploy/oracle

Outils pour la VM Oracle Ubuntu (ARM64) qui héberge l'API du portfolio. Cette VM héberge aussi
d'autres projets : toute intervention se limite aux conteneurs du portfolio.

| Fichier | Rôle |
|---|---|
| `discover.sh` | inventaire général de la VM, en **lecture seule** |
| `discover-canary-test.sh` | preuve que `discover.sh` n'affiche aucun secret (VM simulée, jamais sur une vraie machine) |
| `next.sh` | nouvelle API **en parallèle** de l'actuelle : copie depuis GitHub, inventaire, sauvegarde MongoDB, variables, TLS Supabase, lancement, contrôle, retour arrière |
| `env_definir.py` | appelé par `next.sh env-definir` : écriture d'une variable relue par Compose avant remplacement du fichier |
| `compose.next.yml` | les trois conteneurs de la nouvelle API, et rien d'autre |
| `nginx-api-locations.conf.example` | blocs `location` à fusionner plus tard dans le `server` de `api.adjoumani-koffi.com` |

Tests : `tests/infra/oracle-next.test.ts` (`npm test`, sans Docker), et exécution réelle sous Docker
Desktop : `tests/oracle/sauvegarde-mongo.bench.sh`, `tests/oracle/recuperer.bench.sh` ; avec le seul
binaire Compose : `python tests/oracle/env-definir.bench.py`.

**Toujours exécuter sur la VM la version d'un commit précis**, jamais la copie de travail : un
fichier en cours de modification serait envoyé tel quel. Toutes les commandes ci-dessous partent de
Git Bash, à la racine du dépôt, avec `c` = le commit validé :

```bash
c=<commit validé>          # par exemple : c=$(git rev-parse --short=12 HEAD), arbre propre
V=<utilisateur>@<vm>
```

## 1. Inventaire, en lecture seule

```bash
mkdir -p /d/portfolio-sauvegardes
git show "$c":deploy/oracle/next.sh | ssh "$V" 'sudo sh -s inventaire' > /d/portfolio-sauvegardes/vm-next-inventaire.txt
```

`next.sh inventaire` complète `discover.sh` : commit du dépôt de l'ancien déploiement, ancien script
de déploiement **masqué**, conteneur `blog-api` (image, ports, montages, noms de variables, catégorie
d'hôte MongoDB), noms, port et réseaux prévus, tous les conteneurs, réseaux et volumes, bloc nginx de
l'API, sauvegardes planifiées. Aucune valeur n'est affichée ; relire le fichier avant de le transmettre.

Garanties, vérifiées sous `strace` en mode fichier et lu sur l'entrée standard : aucun appel système
d'écriture, de création, de suppression ni de changement de droits ; état Docker identique avant et
après. Git est appelé avec `--no-optional-locks` (sinon `git status` lancé en root réécrit `.git/index`
du dépôt de l'ancien déploiement, qui devient la propriété de root). nginx n'est pas appelé : ses
fichiers sont lus. Ni `docker system df` ni `du`, qui parcourraient les volumes des autres applications.
Seules traces système : les journaux de connexion SSH et de `sudo`.

## 2. Sauvegarde MongoDB

```bash
mkdir -p /d/portfolio-sauvegardes
git show "$c":deploy/oracle/next.sh | ssh "$V" 'sudo sh -s sauvegarder-mongo' | tee /d/portfolio-sauvegardes/sauvegarde-mongo-journal.txt
```

`mongodump` en lecture seule, puis restauration d'essai complète. Rien n'est copié sur la VM hormis
la sauvegarde elle-même, dans `/var/backups/portfolio-next` (root 700, fichiers 600).

| Format | Fichiers | Produit par |
|---|---|---|
| complet | `<archive>`, `<archive>.comptes` (documents par collection selon `mongodump`), `<archive>.sha256` (empreintes des deux) | `sauvegarder-mongo` depuis `6c23d69` |
| format antérieur | `<archive>`, `<archive>.sha256` (empreinte de l'archive seule) | versions précédentes, dont la sauvegarde `mongo-20261103T120416Z` |

Une sauvegarde neuve n'est annoncée réussie (ligne `SAUVEGARDE <archive> : 3 fichiers…` et verdict
sans point bloquant) qu'après une restauration d'essai qui **exige** les trois fichiers et retrouve
les totaux annoncés par `mongodump`.

- **secrets** : adresse MongoDB lue dans `/etc/portfolio-next/api.env` s'il existe, sinon dans le
  conteneur `blog-api` ; transmise par l'entrée standard, jamais en argument ni en variable ; elle ne
  touche qu'un fichier en mémoire (tmpfs, 600) supprimé aussitôt ; aucun journal Docker
  (`--log-driver none`) ; erreurs masquées ;
- **Atlas jamais visé par la restauration** : conteneur sans réseau, qui ne reçoit aucune adresse,
  restaure vers `127.0.0.1` et refuse de continuer s'il voit une autre interface que la boucle locale ;
- **Docker** : réseau `portfolio-sauvegarde-net` et conteneurs `portfolio-sauvegarde-mongo`,
  `portfolio-verif-sauvegarde`, étiquetés, retirés à la fin même après une interruption ; aucun
  volume (ceux de l'image MongoDB remplacés par des tmpfs) ; image MongoDB épinglée par empreinte,
  retirée à la fin si elle a été téléchargée pour l'occasion ; aucune capacité, mémoire et CPU bornés ;
- **intégrité**, quel que soit le format : empreinte SHA-256, gzip, CRC de chaque collection et objets
  BSON (contrôlés par `mongorestore`, dont le code de sortie est vérifié), aucun échec d'insertion,
  chaque collection lue dans l'archive présente avec tous ses documents ; format complet : comptes de
  la sauvegarde retrouvés collection par collection.

### Rapatriement et vérification sur le poste

Depuis **Git Bash** (la redirection de PowerShell 5.1 corrompt un fichier binaire). Seuls les
fichiers listés par l'empreinte sont copiés, et un fichier n'est gardé que si sa copie a réussi :

```bash
R=/var/backups/portfolio-next
A=mongo-AAAAMMJJTHHMMSSZ.archive.gz        # nom annoncé par la sauvegarde
cd /d/portfolio-sauvegardes
ssh "$V" "sudo cat $R/$A.sha256" > "$A.sha256.part" && [ -s "$A.sha256.part" ] && mv "$A.sha256.part" "$A.sha256"
for f in $(awk '{ print $2 }' "$A.sha256"); do
  ssh "$V" "sudo cat $R/$f" > "$f.part" && [ -s "$f.part" ] && mv "$f.part" "$f" || { rm -f "$f.part"; echo "ÉCHEC : $f"; }
done
sha256sum -c "$A.sha256"

cd /d/adjoumani-portfolio
MSYS_NO_PATHCONV=1 NEXT_BACKUP_DIR='D:/portfolio-sauvegardes' NEXT_ATTENDU='<collections> <documents>' \
  sh deploy/oracle/next.sh verifier-archive "$A"
```

`verifier-archive` refait la restauration d'essai sur le poste (MongoDB jetable sans réseau) et
accepte les deux formats ; le format antérieur est signalé. `NEXT_ATTENDU` confronte le résultat aux
totaux annoncés lors de la sauvegarde ; `NEXT_EXIGER_COMPTES=1` refuse le format antérieur. L'archive
contient les comptes du blog et les commentaires : la garder chiffrée.

## 3. Nouvelle API en parallèle : `blog-api-next`

L'ancien conteneur `blog-api` (port 5000, servi par nginx) reste en place et n'est jamais touché.
La nouvelle API démarre à côté, injoignable depuis Internet :

| | Ancienne API | Nouvelle API |
|---|---|---|
| Conteneurs | `blog-api` | `blog-api-next`, `portfolio-latex-runner`, `portfolio-cv-extractor` |
| Port | 5000 (nginx) | `127.0.0.1:5001` seulement (`NEXT_PORT` pour un autre) |
| Images | celle de l'ancien déploiement | `portfolio-next/*:<commit>` |
| Réseaux | existants | `portfolio-next_egress` (sortie Internet, API seule), `_latex` et `_extract` (internes) |
| Volumes | existants | aucun |
| Code | dépôt de l'ancien déploiement | copie séparée du commit validé, tirée de GitLab (§4) |

### Étapes (chacune après accord)

```bash
# VM : copie du commit obtenue par « next.sh recuperer » (§4), jamais dans le dépôt de l'ancien déploiement
cd ~/portfolio-next/portfolio-next-<c>
sudo sh deploy/oracle/next.sh env          # une fois : /etc/portfolio-next/api.env, root 600, depuis le conteneur blog-api
sudo sh deploy/oracle/next.sh verifier     # lecture seule ; code 1 si un point bloque
sudo sh deploy/oracle/next.sh construire   # images portfolio-next/*:<commit>
sudo sh deploy/oracle/next.sh demarrer     # démarrage, attente de santé, puis contrôle complet
sudo sh deploy/oracle/next.sh controler    # à relancer à volonté, lecture seule
```

- `env` reprend du conteneur `blog-api` les seules variables lues par la nouvelle API, sans jamais
  afficher une valeur, et force `ADMIN_BOOTSTRAP_ENABLED`, `KNOWLEDGE_WRITE_ENABLED` et `AI_ENABLED` à
  `false`. Les anciennes clés IA ne sont pas reprises. Une valeur contenant une apostrophe est signalée
  et se dépose avec `env-definir` (§6).
- Sans `SUPABASE_*` ni `AI_DATABASE_URL`, l'administration répond 503 et l'IA est indisponible :
  aucune migration n'est nécessaire, rien n'est écrit dans Supabase ni dans Pinecone.
- `verifier` bloque si un nom, un réseau ou le port est pris par un autre projet, si le fichier
  d'environnement n'est pas `root 600`, s'il manque une variable, si la copie contient des fins de
  ligne CRLF, ou s'il reste moins de 6 Gio de disque ou 3 Gio de mémoire disponibles.
- `controler` vérifie la santé des trois conteneurs, l'absence de port publié et d'accès Internet
  pour `latex-runner` et `cv-extractor`, MongoDB, un vrai PDF compilé, un import de CV, 13 lectures
  de commentaires sans refus (compteur de lecture distinct, limite 300), un compteur par visiteur
  derrière le proxy local (deux adresses transmises → deux compteurs), l'ancienne
  API sur le port 5000, et compare l'état de **tous les autres conteneurs** à celui relevé juste
  avant le démarrage (identifiant, image, heure de démarrage, redémarrages).
- Essai depuis le poste : `ssh -L 5001:127.0.0.1:5001 "$V"`, puis `http://localhost:5001/api/health`.

### Retour arrière

Vers le commit précédent, sans rien reconstruire (ses images sont gardées) :

```bash
sudo sh deploy/oracle/next.sh historique   # version en service, journal, copies et images présentes
cd ~/portfolio-next/portfolio-next-<précédent>
sudo sh deploy/oracle/next.sh demarrer     # remplace les trois conteneurs par ceux de ce commit, puis contrôle
```

Même projet, mêmes noms, même port : `demarrer` depuis une autre copie remplace les trois conteneurs,
et eux seuls. Chaque `demarrer` et `arreter` s'inscrit dans `/var/lib/portfolio-next/deploiements.log`
(date, action, commit, résultat, copie). Garder les images du commit précédent tant que le suivant
n'est pas validé (environ 1,2 Go par commit). `/etc/portfolio-next/api.env` est commun aux copies.

Retrait complet :

```bash
sudo sh deploy/oracle/next.sh arreter
```

Retire les trois conteneurs et les trois réseaux du projet `portfolio-next`, et eux seuls ; vérifie
que l'ancienne API répond toujours. Les images restent pour un nouvel essai ; la commande qui les
retire, sans viser aucune autre image, est affichée. Le fichier `/etc/portfolio-next/api.env` se
supprime à la main.

## 4. Livraison depuis GitHub (méthode officielle)

Le dépôt public GitHub est la source des livraisons Oracle : le poste pousse la branche
`release/portfolio-next`, la VM en tire un commit précis, en HTTPS et sans clé. Ni archive ni `scp`.
La VM ne fait jamais `git pull` ni `git push`, et n'écrit rien dans le dépôt de l'ancien déploiement
(`/home/ubuntu/adjoumani-portfolio`). GitLab reste la source de Vercel (`main`).

| Où | Quoi |
|---|---|
| GitHub | branche `release/portfolio-next`, règle de protection : ni force push ni suppression ; aucun workflow ni déploiement branché |
| GitLab | `main` seulement, avancé par avance rapide au moment du frontend (Vercel) |
| Vercel | `vercel.json` : `git.deploymentEnabled` à `false` pour `release/*` ; `main` reste la seule branche déployée |
| VM | `~/portfolio-next/depot.git` : dépôt nu en lecture seule, origine GitHub en HTTPS |
| VM | `~/portfolio-next/portfolio-next-<12 premiers caractères>/` : contenu exact du commit, plus `.next-commit` |

### Une seule fois (VM, utilisateur `ubuntu`, sans sudo)

```bash
D=~/portfolio-next/depot.git
[ -d "$D" ] || git init --bare -q "$D"
git -C "$D" remote add origin https://github.com/Adjoum/mon-portfolio-moderne.git 2>/dev/null ||
  git -C "$D" remote set-url origin https://github.com/Adjoum/mon-portfolio-moderne.git
git -C "$D" config --unset core.sshCommand 2>/dev/null; git -C "$D" remote get-url origin
```

### À chaque livraison

Poste (Git Bash), arbre propre :

```bash
git switch release/portfolio-next
git status --short                          # doit être vide
c=$(git rev-parse HEAD); echo "$c"
git push github release/portfolio-next      # avance rapide seulement, jamais --force
```

VM (`ubuntu`), avec le commit complet affiché par le poste :

```bash
c=<commit complet>
cd ~/portfolio-next
git -C depot.git fetch --quiet --no-tags origin '+refs/heads/release/portfolio-next:refs/remotes/origin/release/portfolio-next'
git -C depot.git show "$c":deploy/oracle/next.sh | sh -s recuperer "$c"
cd "portfolio-next-$(printf %s "$c" | cut -c1-12)"
sudo sh deploy/oracle/next.sh verifier
sudo sh deploy/oracle/next.sh construire
sudo sh deploy/oracle/next.sh demarrer
```

Le script exécuté est celui du commit livré, lu dans le dépôt nu. `recuperer` refuse un commit absent
de la branche de release publiée et une copie existante qui diffère du commit (rien n'est remplacé) ;
une copie existante identique est seulement constatée. Le fichier d'environnement est commun aux
copies ; une variable s'y ajoute avec `env-definir` (§6).

### Secours sans accès à GitHub

```bash
# Poste. core.autocrlf=false : sous Windows, l'archive aurait sinon des fins de ligne CRLF, que
# « next.sh verifier » refuse. Chemin de sortie absolu : avec git -C, un chemin relatif serait
# résolu depuis le dépôt.
cd /d/portfolio-sauvegardes
git -C /d/adjoumani-portfolio -c core.autocrlf=false archive --format=tar.gz --prefix="portfolio-next-$c/" \
  --add-virtual-file="portfolio-next-$c/.next-commit:$c" -o "$PWD/portfolio-next-$c.tar.gz" "$c"
sha256sum "portfolio-next-$c.tar.gz" > "portfolio-next-$c.tar.gz.sha256"
scp "portfolio-next-$c.tar.gz" "portfolio-next-$c.tar.gz.sha256" "$V":
# VM
sha256sum -c ~/portfolio-next-<c>.tar.gz.sha256
mkdir -p ~/portfolio-next && tar -xzf ~/portfolio-next-<c>.tar.gz -C ~/portfolio-next
```

Ici `c` doit compter 12 caractères (`git rev-parse --short=12`), comme le nom des copies. Une copie
venue par archive se compare ensuite au dépôt de livraison avec `recuperer`, sans être remplacée.

## 5. Règles sur une VM partagée

À ne jamais lancer sur la VM :
- `docker compose down`, `restart` ou `up` hors `next.sh` ;
- `docker system prune`, `docker volume prune`, `docker image prune`, `docker rm -f $(docker ps -aq)` ;
- le `Makefile` : prévu pour le poste local, il s'arrête de lui-même s'il trouve un conteneur
  `blog-api` créé hors de son projet ;
- `systemctl restart nginx`, `systemctl restart docker`, ou toute modification d'un autre `server` nginx.

nginx se recharge (`sudo nginx -t` puis `sudo systemctl reload nginx`), il ne se redémarre pas.
Seul le fichier `/etc/nginx/sites-available/blog-api` est modifié, et seulement sa ligne `proxy_pass` (§7).

## 6. Certificat Supabase, variables et activation progressive

**Certificat** (public, non secret) : Supabase > Project Settings > Database > SSL Configuration >
*Download certificate*. Le même fichier sert à la sauvegarde sur le poste (`secrets/supabase-ca.crt`).

```bash
scp /d/adjoumani-portfolio/secrets/supabase-ca.crt "$V":supabase-ca.crt         # poste
sudo install -o root -g root -m 644 ~/supabase-ca.crt /etc/portfolio-next/supabase-ca.crt && rm ~/supabase-ca.crt   # VM
sudo sh deploy/oracle/next.sh verifier-tls <hôte-du-session-pooler>      # aucun identifiant envoyé
```

`verifier` bloque tant que le certificat manque (le conteneur ne démarrerait pas). `blog-api-next` le
lit en lecture seule (`AI_DATABASE_CA_FILE`) : la connexion du rôle `ai_backend` exige TLS vérifié,
certificat du projet épinglé et nom d'hôte contrôlé. `verifier-tls` le prouve avant toute activation.

**Variables** : `sudo sh deploy/oracle/next.sh env-definir NOM` ajoute ou remplace une variable. La
valeur est saisie sans écho, ou reçue par un tube (`openssl rand -hex 32 | sudo sh deploy/oracle/next.sh
env-definir NOM`) : jamais en argument ni dans l'historique. Apostrophes, `$`, guillemets et antislashs
sont gardés tels quels ; le fichier n'est remplacé qu'après relecture par Compose (valeur identique,
autres variables inchangées). Elle s'applique au `demarrer` suivant.

| Étape | Variables | Condition | Retour arrière |
|---|---|---|---|
| Administration (blog, CV, connaissances en lecture) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | migrations de la phase 3, dont la 12 | `historique`, copie précédente, ou variables retirées (503) |
| Écritures de la base de connaissances | `KNOWLEDGE_WRITE_ENABLED=true` | administration vérifiée | `false` |
| IA | `AI_DATABASE_URL`, `AI_LOG_HMAC_SECRET`, puis `AI_ENABLED=true` | phase 4, rôle `ai_backend`, `verifier-tls` vert | `AI_ENABLED=false` |

`ADMIN_BOOTSTRAP_ENABLED` reste `false` (`verifier` bloque sinon). Chaque fonctionnalité IA s'active
ensuite dans le dashboard, une par une.

## 7. Bascule nginx et retour immédiat sur l'ancienne API

Après accord, et seulement si `controler` est vert. L'ancien conteneur `blog-api` reste en marche sur
le port 5000 : le retour arrière est un simple rechargement de nginx.

```bash
S=/etc/nginx/sites-available/blog-api
sudo sed -n '/location \/ {/,/}/p' "$S"                   # lecture : proxy_pass et en-têtes transmis
sudo grep -c 'proxy_pass http://127.0.0.1:5000/;' "$S"    # attendu : 1
sudo cp -p "$S" /var/lib/portfolio-next/nginx-blog-api.avant-5001
sudo sed -i 's#proxy_pass http://127.0.0.1:5000/;#proxy_pass http://127.0.0.1:5001/;#' "$S"
sudo nginx -t && sudo systemctl reload nginx || sudo cp -p /var/lib/portfolio-next/nginx-blog-api.avant-5001 "$S"
curl -s -o /dev/null -w '%{http_code}\n' --resolve api.adjoumani-koffi.com:443:127.0.0.1 https://api.adjoumani-koffi.com/api/health/ready   # 200 : nouvelle API
```

Retour immédiat sur l'ancienne API :

```bash
sudo sed -i 's#proxy_pass http://127.0.0.1:5001/;#proxy_pass http://127.0.0.1:5000/;#' /etc/nginx/sites-available/blog-api &&
  sudo nginx -t && sudo systemctl reload nginx
```

**Adresse des visiteurs** (limites de débit, quotas IA, journal d'audit). L'API ne croit
`X-Forwarded-For` que de son pair direct, et seulement s'il est local (passerelle Docker) ; elle en
retient la dernière adresse, celle que nginx ajoute. Elle ne lit jamais `X-Real-IP`. Condition : nginx
fixe `X-Forwarded-For` dans chaque `location` qui transmet à l'API. Un seul `proxy_set_header` dans un
`location` annule tous ceux hérités du `server` : lire tout le fichier, pas une ligne. Relevé en
lecture seule, avant la bascule (VM) :

```bash
S=/etc/nginx/sites-available/blog-api
masque='s/^([0-9]+:[[:space:]]*proxy_set_header[[:space:]]+[^[:space:]]*([Aa]uth|[Cc]ookie|[Tt]oken|[Kk]ey|[Ss]ecret)[^[:space:]]*)[[:space:]].*/\1 [valeur masquée]/'
echo "== $S"
sudo grep -nE '^[[:space:]]*(server|listen|server_name|location|proxy_pass|proxy_set_header|proxy_pass_request_headers|include|real_ip_header|set_real_ip_from|real_ip_recursive)([[:space:]{;]|$)|^[[:space:]]*\}' "$S" | sed -E "$masque"
for f in $(sudo awk '$1 == "include" { sub(/;.*/, "", $2); print $2 }' "$S"); do
  case "$f" in /*) ;; *) f="/etc/nginx/$f" ;; esac
  echo "== include $f"; sudo grep -nE 'proxy_set_header|proxy_pass_request_headers|real_ip' $f 2>/dev/null | sed -E "$masque"
done
echo "== niveau http (commun à tous les sites)"
sudo grep -nE '^[[:space:]]*(real_ip_header|set_real_ip_from|real_ip_recursive|proxy_set_header)[[:space:]]' /etc/nginx/nginx.conf | sed -E "$masque"
sudo sh -c 'grep -nE "^[[:space:]]*(real_ip_header|set_real_ip_from)" /etc/nginx/conf.d/*.conf 2>/dev/null'
echo "== clients vus par nginx (2 000 dernières lignes du journal, comptes seulement)"
sudo tail -n 2000 /var/log/nginx/access.log | awk '{ print $1 }' | sort -u |
  awk '/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1$|f[cd])/ { p++ } END { print NR " adresses distinctes, dont " p+0 " locales ou privées" }'
```

Attendu : dans `location /`, `X-Forwarded-For $proxy_add_x_forwarded_for` (ou `$remote_addr`), écrit
dans le `location` lui-même, ou hérité du `server` ou d'un `include proxy_params` **si le `location` ne
contient aucun `proxy_set_header`** ; aucune directive `real_ip_*` ouverte à des adresses publiques ;
des adresses clientes nombreuses et presque toutes publiques (rien devant nginx). Sinon, corriger le
seul `location /` de ce fichier avant la bascule, avec la même procédure (copie, `nginx -t`,
rechargement) et un accord séparé. Aucune modification au niveau `http`, ni dans un autre `server`.

Après la bascule (poste) : un en-tête falsifié ne doit pas ouvrir un nouveau compteur.

```bash
u=https://api.adjoumani-koffi.com/api/comments/000000000000000000000000
for h in 'X-Forwarded-For: 203.0.113.9' 'X-Forwarded-For: 198.51.100.7' 'X-Real-IP: 203.0.113.10'; do
  curl -s -o /dev/null -D - -H "$h" "$u" | tr -d '\r' | grep -i '^ratelimit-remaining'
done
# attendu : trois valeurs qui décroissent d'un en un ; des valeurs identiques = adresse falsifiable
```
