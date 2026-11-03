# deploy/oracle

Outils pour la VM Oracle Ubuntu (ARM64) qui héberge l'API du portfolio. Cette VM héberge aussi
d'autres projets : toute intervention se limite aux conteneurs du portfolio.

| Fichier | Rôle |
|---|---|
| `discover.sh` | inventaire général de la VM, en **lecture seule** |
| `discover-canary-test.sh` | preuve que `discover.sh` n'affiche aucun secret (VM simulée, jamais sur une vraie machine) |
| `next.sh` | nouvelle API **en parallèle** de l'actuelle : inventaire, préparation, lancement, contrôle, retour arrière |
| `compose.next.yml` | les trois conteneurs de la nouvelle API, et rien d'autre |
| `nginx-api-locations.conf.example` | blocs `location` à fusionner plus tard dans le `server` de `api.adjoumani-koffi.com` |

## 1. Inventaire, en lecture seule

```bash
sudo SUPABASE_REF=<ref> POOLER_HOST=<hôte du pooler> sh discover.sh > vm-inventaire.txt 2>&1
```

Depuis le poste (Git Bash), sans rien copier sur la VM :

```bash
mkdir -p /d/portfolio-sauvegardes
ssh <utilisateur>@<vm> 'sudo sh -s inventaire' < deploy/oracle/next.sh > /d/portfolio-sauvegardes/vm-next-inventaire.txt
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

## 2. Nouvelle API en parallèle : `blog-api-next`

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
# Poste : archive du commit validé, avec son identifiant ; aucun push.
# core.autocrlf=false : sous Windows, l'archive aurait sinon des fins de ligne CRLF (Dockerfile compris),
# que « next.sh verifier » refuse.
c=$(git rev-parse --short=12 HEAD)
git -c core.autocrlf=false archive --format=tar.gz --prefix="portfolio-next-$c/" --add-virtual-file="portfolio-next-$c/.next-commit:$c" \
  -o "portfolio-next-$c.tar.gz" "$c" blog-api latex-runner cv-extractor deploy/oracle
scp "portfolio-next-$c.tar.gz" <utilisateur>@<vm>:

# VM : copie séparée, jamais dans le dépôt de l'ancien déploiement
mkdir -p ~/portfolio-next && tar -xzf ~/portfolio-next-<c>.tar.gz -C ~/portfolio-next
cd ~/portfolio-next/portfolio-next-<c>
sudo sh deploy/oracle/next.sh sauvegarder-mongo   # mongodump puis restauration d'essai sans réseau
sudo sh deploy/oracle/next.sh env          # /etc/portfolio-next/api.env, root 600, depuis le conteneur blog-api
sudo sh deploy/oracle/next.sh verifier     # lecture seule ; code 1 si un point bloque
sudo sh deploy/oracle/next.sh construire   # images portfolio-next/*:<commit>
sudo sh deploy/oracle/next.sh demarrer     # démarrage, attente de santé, puis contrôle complet
sudo sh deploy/oracle/next.sh controler    # à relancer à volonté, lecture seule
```

- `sauvegarder-mongo` lit l'adresse MongoDB dans `/etc/portfolio-next/api.env` s'il existe, sinon
  dans le conteneur `blog-api` ; elle passe par l'entrée standard du conteneur de sauvegarde, jamais
  en argument ni en variable. Archive et empreinte dans `/var/backups/portfolio-next` (root 700), puis
  restauration complète dans un MongoDB jetable sans réseau (1 Gio, 1 CPU) et comparaison des nombres
  de documents. Image MongoDB épinglée par empreinte : aucune étiquette `mongo:*` créée ni déplacée.
  Rapatriement depuis **Git Bash** (la redirection de PowerShell 5.1 corrompt un fichier binaire) :
  `ssh <vm> 'sudo cat /var/backups/portfolio-next/<archive>' > <archive>`, de même pour `<archive>.sha256`,
  puis `sha256sum -c <archive>.sha256`.
- `env` reprend du conteneur `blog-api` les seules variables lues par la nouvelle API, sans jamais
  afficher une valeur, et force `ADMIN_BOOTSTRAP_ENABLED`, `KNOWLEDGE_WRITE_ENABLED` et `AI_ENABLED` à
  `false`. Les anciennes clés IA ne sont pas reprises. Une valeur contenant une apostrophe est signalée
  et doit être saisie à la main.
- Sans `SUPABASE_*` ni `AI_DATABASE_URL`, l'administration répond 503 et l'IA est indisponible :
  aucune migration n'est nécessaire, rien n'est écrit dans Supabase ni dans Pinecone.
- `verifier` bloque si un nom, un réseau ou le port est pris par un autre projet, si le fichier
  d'environnement n'est pas `root 600`, s'il manque une variable, ou s'il reste moins de 6 Gio de
  disque ou 3 Gio de mémoire disponibles.
- `controler` vérifie la santé des trois conteneurs, l'absence de port publié et d'accès Internet
  pour `latex-runner` et `cv-extractor`, MongoDB, un vrai PDF compilé, un import de CV, l'ancienne
  API sur le port 5000, et compare l'état de **tous les autres conteneurs** à celui relevé juste
  avant le démarrage (identifiant, image, heure de démarrage, redémarrages).
- Essai depuis le poste : `ssh -L 5001:127.0.0.1:5001 <utilisateur>@<vm>`, puis `http://localhost:5001/api/health`.

### Retour arrière

```bash
sudo sh deploy/oracle/next.sh arreter
```

Retire les trois conteneurs et les trois réseaux du projet `portfolio-next`, et eux seuls ; vérifie
que l'ancienne API répond toujours. Les images restent pour un nouvel essai ; la commande qui les
retire, sans viser aucune autre image, est affichée. Le fichier `/etc/portfolio-next/api.env` se
supprime à la main.

## 3. Règles sur une VM partagée

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
