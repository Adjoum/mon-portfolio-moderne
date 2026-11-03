# Portfolio d'Adjoumani Koffi Wilfried

Portfolio personnel, blog et outils assistés par IA : [www.adjoumani-koffi.com](https://www.adjoumani-koffi.com).

Le dépôt réunit le site React (déployé sur Vercel), l'API `blog-api` et deux services isolés
(`latex-runner`, `cv-extractor`) hébergés sur une VM Oracle avec Docker, ainsi que les migrations
Supabase, les outils de recette et les procédures de mise en production.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture](#architecture)
3. [Pile technique](#pile-technique)
4. [Structure du dépôt](#structure-du-dépôt)
5. [Démarrage local](#démarrage-local)
6. [Variables d'environnement](#variables-denvironnement)
7. [Administration](#administration)
8. [Tests et recettes](#tests-et-recettes)
9. [Règles de sécurité](#règles-de-sécurité)
10. [Branches et mise en production](#branches-et-mise-en-production)
11. [Licence et auteur](#licence-et-auteur)

---

## Fonctionnalités

**Site public**
- Accueil : portrait derrière une bulle élastique en WebGL natif, salutation selon l'heure locale,
  cylindre 3D des accès directs (carrousel sur mobile), globe 3D juste avant le pied de page.
  Les scènes 3D sont chargées à la demande et remplacées par des replis statiques sur les appareils
  trop lents ou avec `prefers-reduced-motion`.
- À propos, projets, compétences, contact, CV en ligne (`/cv`), plan du site, mentions légales.
- Blog : articles, commentaires et réactions (MongoDB, via `blog-api`).
- Outils : espace de travail, Pomodoro, Code Vault, convertisseur de fichiers, AI Lab, playground.

**Fonctionnalités IA** (toujours via `blog-api`, jamais d'appel direct du navigateur à un fournisseur)
- Assistant Clone : widget de discussion, réponses appuyées sur une base de connaissances (Pinecone).
- NovaMind : génération de diagrammes.
- InkSpace : tableau blanc (application statique `public/inkspace`) avec génération assistée.
- Générateur de CV (`/cv-generator`) : génération, relecture, import d'un CV existant (PDF, DOCX,
  TXT, RTF, image par OCR), modèles et réglages de design.
- Studio CV LaTeX (`/latex-cv-editor`) : génération, correction, réécriture, aperçu PDF compilé par
  `latex-runner`, historique privé « Mes CV ».

**Administration** (chemin non publié, mot de passe et TOTP obligatoires)
- Projets, compétences, CV PDF public, base de connaissances de l'assistant.
- Centre d'administration IA : six fournisseurs (OpenAI, Anthropic, Google Gemini, Groq, xAI,
  OpenRouter), catalogue de modèles, affectation par fonctionnalité, quotas, budgets, coupe-circuits,
  statistiques d'usage et de coût. Les clés sont saisies dans le dashboard et stockées dans Supabase Vault.
- Verrouillage après 10 minutes d'inactivité, appliqué aussi côté serveur.

---

## Architecture

```
Navigateur
  │
  ├─► www.adjoumani-koffi.com ── Vercel : build statique React/Vite
  │
  ├─► Supabase (projet portfolio-perso)
  │      Auth (mot de passe + TOTP), Postgres avec RLS, Storage (images, CV)
  │
  └─► api.adjoumani-koffi.com ── nginx (VM Oracle) ──► blog-api (127.0.0.1:5000)
                                                          ├─► latex-runner  réseau interne latex-net, sans sortie
                                                          ├─► cv-extractor  réseau interne extract-net, sans sortie
                                                          ├─► MongoDB       articles, commentaires, comptes du blog
                                                          ├─► Supabase      rôle restreint ai_backend : centre IA, Vault
                                                          └─► Pinecone, Cloudinary, fournisseurs IA
```

- Le frontend ne contient que des variables publiques ; tout secret reste côté API ou dans Supabase Vault.
- `latex-runner` et `cv-extractor` n'ont ni secret, ni port publié, ni accès Internet : seule l'API
  les joint, chacun sur son propre réseau Docker interne.
- Sur la VM, les ports Docker sont liés à `127.0.0.1` ; nginx est le seul frontal exposé.

---

## Pile technique

| Partie | Technologies |
|---|---|
| Frontend | React 19, TypeScript 5.9, Vite 7 (React Compiler), Tailwind CSS 3.4, Framer Motion 12, React Router 7, three 0.187 et @react-three/fiber 9.8 (chunk à la demande), supabase-js 2 |
| API `blog-api` | Node.js 24, Express 5, Mongoose 9, pg 8, Multer, express-rate-limit |
| `latex-runner` | Node.js 24 sans dépendance npm, TeX Live de Debian, pdflatex sans shell-escape |
| `cv-extractor` | Node.js 24, pdfjs-dist, mammoth, jszip |
| Données | Supabase (Postgres, Auth, Storage, Vault), MongoDB, Pinecone, Cloudinary |
| Tests | Vitest, Supertest, bancs SQL sur Supabase local jetable, Playwright (Chromium et WebKit) |
| Hébergement | Vercel (frontend), VM Oracle Ubuntu avec Docker et nginx (API et services) |

---

## Structure du dépôt

```
.
├── src/                      application React (pages, composants, features/ai-admin, features/latex-studio)
├── public/                   fichiers statiques, InkSpace, miniatures des modèles LaTeX
├── vite-plugins/             variables publiques, confidentialité des pages d'admin, configuration d'InkSpace
├── blog-api/                 API Express (voir blog-api/README.md)
├── latex-runner/             compilation LaTeX isolée (voir latex-runner/README.md)
├── cv-extractor/             extraction isolée du texte des CV (voir cv-extractor/README.md)
├── supabase/                 migrations, retours arrière, sauvegarde, contrôles, bancs (voir supabase/README.md)
├── deploy/oracle/            inventaire de la VM et fragment nginx (voir deploy/oracle/README.md)
├── env/recette/              configuration de la recette locale isolée
├── scripts/                  recettes, chemin d'administration, contrôle du bundle, données du globe
├── tests/                    sécurité, infrastructure, extraction, LaTeX, e2e navigateur, performance
├── docker-compose.yml        API, latex-runner, cv-extractor, frontend nginx ; MongoDB en profil dev
├── Dockerfile.frontend       image nginx du frontend (hors Vercel)
├── vercel.json               réécritures SPA et en-têtes de sécurité
└── .env.example              modèle des variables publiques du frontend
```

Les rapports internes d'audit et de mise en production (`docs/cv-generator-audit/`) restent en
local : ils décrivent l'état de la production et ne sont pas versionnés.

---

## Démarrage local

### Prérequis

- Node.js 24 (la version des images Docker) et npm.
- Docker Desktop pour l'API en conteneur, la recette locale et les bancs Supabase.

### Frontend

```bash
npm ci
cp .env.example .env.local     # compléter : voir « Variables d'environnement »
npm run dev                    # http://localhost:5173
```

En mode `development` et `production`, Vite lit `.env` et `.env.local` à la racine. Si ces fichiers
pointent vers la production, le site local agit sur la production (visites, comptes, contenus).
Pour travailler sans risque, utiliser la recette locale ci-dessous.

### Recette locale isolée (recommandée)

Supabase local jetable, API dans Docker et Vite en mode `recette`. Aucune valeur de production
n'est lue : Vite refuse de démarrer si l'URL Supabase de production apparaît dans `env/recette/`.

```bash
npm run recette:up       # prépare et démarre tout (réexécutable, données conservées)
npm run recette:verify   # contrôle l'environnement, sans aucun appel à un fournisseur IA
npm run recette:down     # arrête tout, données conservées
node scripts/recette.mjs reset   # arrête tout et efface la base de recette
```

Les secrets jetables de la recette (compte administrateur, clés de test, chemin d'administration de
recette) sont générés dans `secrets/recette/`, ignoré par Git. Le compte est créé sans TOTP : on
l'enrôle dans le dashboard.

### API seule

```bash
cd blog-api
npm ci
cp .env.example .env    # compléter : voir blog-api/README.md
npm run dev             # http://localhost:5000/api/health
```

### Pile Docker complète

```bash
cp .env.docker.example .env.docker                  # compléter
docker compose --env-file .env.docker up -d --build # API, latex-runner, cv-extractor, frontend (http://localhost:8080)
docker compose --env-file .env.docker --profile dev up -d   # ajoute MongoDB local et Mongo Express (http://localhost:8081)
```

---

## Variables d'environnement

Noms uniquement : les valeurs ne vont jamais dans Git. Les fichiers `*.example` servent de modèles.

| Fichier | Rôle | Variables |
|---|---|---|
| `.env.example` → `.env.local` | Frontend, intégrées au bundle donc **publiques** | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_ROUTE_HASH` |
| `blog-api/.env.example` → `blog-api/.env` | API lancée hors Docker | voir [blog-api/README.md](blog-api/README.md) |
| `.env.docker.example` → `.env.docker` | `docker compose` : API, build du frontend, MongoDB du profil dev | mêmes noms que l'API, plus `VITE_*`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_UI_USER`, `MONGO_UI_PASSWORD` |
| `env/recette/.env.recette.example` | Recette locale (`.env.recette.local` généré par `recette:up`) | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

- Seules ces quatre variables `VITE_*` atteignent le navigateur (`vite-plugins/publicEnv.ts`) :
  une clé privée nommée `VITE_…` dans un `.env` n'est jamais intégrée au bundle.
- `VITE_SUPABASE_ANON_KEY` est la clé publique « anon », protégée par la RLS ; jamais la clé `service_role`.
- Les clés des fournisseurs IA ne figurent dans aucun fichier : elles sont saisies dans le dashboard
  et stockées dans Supabase Vault.
- Sur Vercel, définir les variables `VITE_*` dans Production et Preview, et aucune autre.

---

## Administration

Le dashboard n'a pas d'adresse fixe : `/admin` affiche la page 404. Le bundle ne contient que
l'empreinte SHA-256 du chemin (`VITE_ADMIN_ROUTE_HASH`), jamais le chemin lui-même.

```bash
node scripts/admin-route.mjs generate --name production   # crée secrets/admin-route/production.txt, affiche l'empreinte
node scripts/admin-route.mjs hash --name production       # réaffiche l'empreinte pour VITE_ADMIN_ROUTE_HASH
node scripts/admin-route.mjs check --env <fichier> --name production
```

- Le chemin se range dans un gestionnaire de mots de passe. Il ne s'écrit nulle part ailleurs :
  ni dans un rapport, ni dans un journal, ni dans un test, ni dans un ticket.
- Sans `VITE_ADMIN_ROUTE_HASH`, le site fonctionne mais le dashboard est inaccessible ; une valeur
  qui n'est pas une empreinte (le chemin collé par erreur) fait échouer le build.
- Le chemin n'est qu'une protection d'appoint : l'accès repose sur le mot de passe, le TOTP (aal2),
  la liste `admin_users` en base et la session serveur verrouillée après 10 minutes d'inactivité.
- Chemin compromis : en générer un autre (`generate --force`), mettre à jour la variable, redéployer.

---

## Tests et recettes

| Commande | Contenu | Besoin |
|---|---|---|
| `npm test` | Vitest racine : sécurité (bundle, XSS des modèles, absence d'appel IA direct, chemin d'admin), infrastructure, extraction, LaTeX | — |
| `npm run build && npm run check:bundle` | build de production puis recherche de secrets, d'hôtes de fournisseurs IA et du chemin d'administration dans `dist/` | — |
| `cd blog-api && npm test && npm run typecheck` | routes, droits, IA simulée, limites de débit ; aucun appel réseau sortant | — |
| `bash supabase/tests/rls/run.sh` | RLS P0.A1 : preuve de la faille, migrations (×2), assertions, retour arrière | Docker |
| `bash supabase/tests/ai/run.sh` | centre IA en SQL | Docker |
| `bash supabase/tests/session/run.sh` | sessions administrateur et verrouillage d'inactivité | Docker |
| `node supabase/tests/rehearsal/run.mjs` | répétition complète de la mise en production, dans l'ordre réel des migrations, retour arrière compris | Docker |
| `sh tests/oracle/sauvegarde-mongo.bench.sh` | sauvegarde MongoDB de `deploy/oracle/next.sh` : trois fichiers garantis, format antérieur, archives altérées, restauration sans réseau, secrets, nettoyage | Docker Desktop |
| `npm run test:stack` | pile Supabase locale réelle, TOTP réel, blog-api démarrée | Docker, `PLAYWRIGHT_CORE_DIR` pour le parcours navigateur |
| `npm run recette:latex`, `recette:modeles`, `recette:mes-cv`, `recette:studio` | aperçu PDF, modèles LaTeX, droits de « Mes CV », parcours du studio | recette démarrée |
| `node tests/e2e/premium.e2e.mjs [scénario…]` | `accueil`, `session`, `clone`, `cvgen`, `cvbaseline`, `cvpublic`, `regression`, `curseur`, `p8` ; Chromium et WebKit, IA simulée | recette démarrée, `PLAYWRIGHT_CORE_DIR` |
| `node tests/perf/accueil-ab-mobile.mjs <réf> <courant>` | premier affichage mesuré en A/B alterné (390 px, CPU ×4 ; `PROFILE=desktop`) | `PLAYWRIGHT_CORE_DIR` |

Captures et rapports des recettes : `secrets/recette/` (ignoré par Git). Aucun test ne fait d'appel
IA facturé ; les réponses des fournisseurs sont simulées.

---

## Règles de sécurité

- Aucun secret dans Git : `.env*` (hors modèles), `secrets/`, sauvegardes, inventaires et `*.dump`
  sont ignorés. Indexer fichier par fichier et relire `git status` avant chaque commit.
- `.vercelignore` exclut les mêmes fichiers d'un déploiement par le CLI Vercel, qui ne lit pas `.gitignore`.
- Aucune clé privée dans une variable `VITE_*`, et `npm run check:bundle` avant chaque déploiement.
- Le navigateur n'appelle que `blog-api` et Supabase : un test échoue si un hôte de fournisseur IA
  apparaît dans le code client.
- Réponses du Clone IA rendues sans HTML brut, sous liste blanche (rehype-sanitize) ; aucune valeur
  d'un CV ne peut sortir de son contexte HTML dans les modèles (test dédié). Le rendu Markdown des
  articles du blog n'est pas encore assaini.
- En-têtes de sécurité dans `vercel.json` ; la CSP est encore en *Report-Only*.
- Services isolés : utilisateur non root, racine en lecture seule, aucune capacité Linux,
  `no-new-privileges`, mémoire, CPU et processus bornés, réseau interne sans sortie.
- Images Docker épinglées par empreinte.

---

## Branches et mise en production

| Branche | Rôle |
|---|---|
| `main` (GitLab `origin`) | **production** : Vercel déploie chaque push |
| `feature/*`, `security/*` | développement |
| `backup/*` | points de retour locaux |

Le dépôt GitHub (remote `github`) est public : les rapports internes n'y sont jamais poussés.

La mise en production se fait par phases, chacune après un feu vert explicite, et s'arrête au
premier contrôle en échec.

1. **Préparation, en lecture seule** : inventaire Supabase, sauvegarde vérifiée par restauration
   isolée, répétition des migrations sur une copie, inventaire de la VM (`deploy/oracle/discover.sh`).
   Rapport unique : `node supabase/checks/go-no-go.mjs`.
2. **Frontend sur Vercel, déploiement *Staged*** : désactiver *Auto-assign Custom Production Domains*
   (Settings → Environments → Production), définir les variables `VITE_*` dont `VITE_ADMIN_ROUTE_HASH`,
   pousser sur `main`, contrôler le déploiement sur son adresse `*.vercel.app`, puis *Promote*, sans
   reconstruction. Le nouveau frontend précède les migrations : il tolère l'ancienne base.
3. **Migrations Supabase**, dans l'ordre et avec leur retour arrière : [supabase/README.md](supabase/README.md).
4. **API et services sur Oracle**, sans toucher aux autres projets de la VM : la nouvelle API démarre
   d'abord en parallèle de l'actuelle (`blog-api-next` sur `127.0.0.1:5001`, hors nginx), puis nginx
   bascule après accord : [deploy/oracle/README.md](deploy/oracle/README.md).
5. **Configuration IA dans le dashboard** : clés, catalogue, affectations. Chaque série de tests
   facturés est annoncée avec son coût estimé et attend un accord.
6. **Suivi** : nouvel inventaire, journaux pendant 48 h, rapports CSP avant de l'imposer.

### Retour arrière

| Partie | Procédure |
|---|---|
| Frontend | Vercel *Instant Rollback* vers le déploiement précédent (offre Hobby : le précédent uniquement). Après les migrations, l'ancien frontend n'est plus compatible : il ne revient qu'avec le retour arrière de la base. |
| Base | scripts `supabase/rollback/*.down.sql` en ordre inverse, puis `restauration.sql` généré depuis l'inventaire pris avant les migrations ; sauvegarde complète en dernier recours |
| API et services | selon le mode d'exécution relevé par `discover.sh` : image précédente réétiquetée (Docker) ou commit précédent reconstruit (pm2, systemd) ; seuls les processus du portfolio sont relancés |
| Code | `git revert` des commits concernés, ou retour à une branche `backup/*` |

---

## Licence et auteur

Code sous licence MIT : voir [LICENSE](LICENSE).

**Adjoumani Koffi Wilfried**
- Site : [www.adjoumani-koffi.com](https://www.adjoumani-koffi.com)
- GitHub : [@Adjoum](https://github.com/Adjoum)
- LinkedIn : [koffi-wilfried-adjoumani](https://www.linkedin.com/in/koffi-wilfried-adjoumani/)
