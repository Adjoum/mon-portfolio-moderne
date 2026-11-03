# deploy/oracle

Outils pour la VM Oracle Ubuntu (ARM64) qui héberge l'API du portfolio. Cette VM héberge aussi
d'autres projets : toute intervention se limite aux conteneurs du portfolio.

| Fichier | Rôle |
|---|---|
| `discover.sh` | inventaire général de la VM, en **lecture seule** |
| `discover-canary-test.sh` | preuve que `discover.sh` n'affiche aucun secret (VM simulée, jamais sur une vraie machine) |
| `next.sh` | nouvelle API **en parallèle** de l'actuelle : inventaire, sauvegarde MongoDB, préparation, lancement, contrôle, retour arrière |
| `compose.next.yml` | les trois conteneurs de la nouvelle API, et rien d'autre |
| `nginx-api-locations.conf.example` | blocs `location` à fusionner plus tard dans le `server` de `api.adjoumani-koffi.com` |

Tests : `tests/infra/oracle-next.test.ts` (`npm test`, sans Docker) et
`tests/oracle/sauvegarde-mongo.bench.sh` (exécution réelle, Docker Desktop).

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
| Code | dépôt de l'ancien déploiement | copie séparée du commit validé |

### Étapes (chacune après accord)

```bash
# Poste : archive du commit validé, avec son identifiant et son empreinte ; aucun push.
# core.autocrlf=false : sous Windows, l'archive aurait sinon des fins de ligne CRLF (Dockerfile compris),
# que « next.sh verifier » refuse.
# Chemin de sortie absolu : avec git -C, un chemin relatif serait résolu depuis le dépôt.
cd /d/portfolio-sauvegardes
git -C /d/adjoumani-portfolio -c core.autocrlf=false archive --format=tar.gz --prefix="portfolio-next-$c/" \
  --add-virtual-file="portfolio-next-$c/.next-commit:$c" -o "$PWD/portfolio-next-$c.tar.gz" "$c" \
  blog-api latex-runner cv-extractor deploy/oracle
sha256sum "portfolio-next-$c.tar.gz" > "portfolio-next-$c.tar.gz.sha256"
scp "portfolio-next-$c.tar.gz" "portfolio-next-$c.tar.gz.sha256" "$V":

# VM : empreinte vérifiée, copie séparée, jamais dans le dépôt de l'ancien déploiement
sha256sum -c ~/portfolio-next-<c>.tar.gz.sha256
mkdir -p ~/portfolio-next && tar -xzf ~/portfolio-next-<c>.tar.gz -C ~/portfolio-next
cd ~/portfolio-next/portfolio-next-<c>
sudo sh deploy/oracle/next.sh env          # /etc/portfolio-next/api.env, root 600, depuis le conteneur blog-api
sudo sh deploy/oracle/next.sh verifier     # lecture seule ; code 1 si un point bloque
sudo sh deploy/oracle/next.sh construire   # images portfolio-next/*:<commit>
sudo sh deploy/oracle/next.sh demarrer     # démarrage, attente de santé, puis contrôle complet
sudo sh deploy/oracle/next.sh controler    # à relancer à volonté, lecture seule
```

- `env` reprend du conteneur `blog-api` les seules variables lues par la nouvelle API, sans jamais
  afficher une valeur, et force `ADMIN_BOOTSTRAP_ENABLED`, `KNOWLEDGE_WRITE_ENABLED` et `AI_ENABLED` à
  `false`. Les anciennes clés IA ne sont pas reprises. Une valeur contenant une apostrophe est signalée
  et doit être saisie à la main.
- Sans `SUPABASE_*` ni `AI_DATABASE_URL`, l'administration répond 503 et l'IA est indisponible :
  aucune migration n'est nécessaire, rien n'est écrit dans Supabase ni dans Pinecone.
- `verifier` bloque si un nom, un réseau ou le port est pris par un autre projet, si le fichier
  d'environnement n'est pas `root 600`, s'il manque une variable, si la copie contient des fins de
  ligne CRLF, ou s'il reste moins de 6 Gio de disque ou 3 Gio de mémoire disponibles.
- `controler` vérifie la santé des trois conteneurs, l'absence de port publié et d'accès Internet
  pour `latex-runner` et `cv-extractor`, MongoDB, un vrai PDF compilé, un import de CV, l'ancienne
  API sur le port 5000, et compare l'état de **tous les autres conteneurs** à celui relevé juste
  avant le démarrage (identifiant, image, heure de démarrage, redémarrages).
- Essai depuis le poste : `ssh -L 5001:127.0.0.1:5001 "$V"`, puis `http://localhost:5001/api/health`.

### Retour arrière

```bash
sudo sh deploy/oracle/next.sh arreter
```

Retire les trois conteneurs et les trois réseaux du projet `portfolio-next`, et eux seuls ; vérifie
que l'ancienne API répond toujours. Les images restent pour un nouvel essai ; la commande qui les
retire, sans viser aucune autre image, est affichée. Le fichier `/etc/portfolio-next/api.env` se
supprime à la main.

## 4. Règles sur une VM partagée

À ne jamais lancer sur la VM :
- `docker compose down`, `restart` ou `up` hors `next.sh` ;
- `docker system prune`, `docker volume prune`, `docker image prune`, `docker rm -f $(docker ps -aq)` ;
- le `Makefile` : prévu pour le poste local, il s'arrête de lui-même s'il trouve un conteneur
  `blog-api` créé hors de son projet ;
- `systemctl restart nginx`, `systemctl restart docker`, ou toute modification d'un autre `server` nginx.

La bascule de nginx vers la nouvelle API (port 5001) est une étape distincte : elle suppose les
migrations Supabase de la phase 3 (la nouvelle API exige la migration de session pour
l'administration) et un accord séparé. nginx se recharge (`sudo nginx -t` puis
`sudo systemctl reload nginx`), il ne se redémarre pas.
