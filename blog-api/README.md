# blog-api

API Express du portfolio : blog (MongoDB), passerelle IA multi-fournisseurs, base de connaissances
de l'Assistant Clone, CV public, aperçu LaTeX et import de CV. Servie derrière nginx sur
`api.adjoumani-koffi.com`, en local sur `http://localhost:5000`.

## Lancer

```bash
npm ci
cp .env.example .env      # compléter, chmod 600 sur un serveur
npm run dev               # nodemon + ts-node
npm run build && npm start   # build TypeScript dans dist/, puis node dist/index.js
```

En conteneur : `docker compose` à la racine du dépôt (service `api`, image `blog-api/Dockerfile`,
utilisateur non root, contrôle de santé sur `/api/health`).

## Routes

| Préfixe | Rôle | Accès |
|---|---|---|
| `/api/health`, `/api/health/ready` | santé (aucun état interne) ; `ready` attend MongoDB | public |
| `/api/articles`, `/api/tags`, `/api/comments`, `/api/upload`, `/api/auth` | blog | lecture publique ; articles écrits par l'administrateur du blog (JWT) ; commentaires et téléversements à débit limité |
| `/api/agent/chat` | Assistant Clone | public, débit limité |
| `/api/agent/knowledge` | base de connaissances (Pinecone) | administrateur Supabase avec TOTP |
| `/api/ai/features`, `/api/ai/run/:featureId` | passerelle IA : NovaMind, InkSpace, générateur de CV, studio LaTeX | selon la fonctionnalité |
| `/api/groq/*` | anciennes adresses d'InkSpace et NovaMind, redirigées vers la passerelle | public, débit limité |
| `/api/cv/compile`, `/api/cv/import` | aperçu PDF (`latex-runner`), extraction de texte (`cv-extractor`) | débit et quota par jour |
| `/api/admin/cv`, `/api/admin/ai` | CV public, centre d'administration IA | administrateur Supabase avec TOTP |

Les routes d'administration exigent un jeton Supabase `aal2`, un compte présent dans `admin_users`
et une session serveur active (`admin_session_status`, migration `20261102100000_admin_session_idle`).
Sans cette migration en base, elles répondent 503.

## Variables d'environnement

Modèle complet et commenté : [.env.example](.env.example). Noms seulement :

| Groupe | Variables |
|---|---|
| Serveur | `NODE_ENV`, `PORT`, `FRONTEND_URL` (origine CORS autorisée) |
| Blog | `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_BOOTSTRAP_ENABLED`, `ADMIN_SECRET` |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` (facultative) |
| Assistant | `PINECONE_API_KEY`, `PINECONE_INDEX`, `KNOWLEDGE_WRITE_ENABLED` |
| Centre IA | `AI_DATABASE_URL`, `AI_DATABASE_CA_FILE`, `AI_LOG_HMAC_SECRET`, `AI_ENABLED`, `AI_DISABLED_FEATURES` |
| Images | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Services isolés | `LATEX_RUNNER_URL`, `CV_EXTRACTOR_URL` (posées par `docker-compose.yml`) |
| Limites facultatives | `ADMIN_RATE_LIMIT_MAX`, `KNOWLEDGE_WRITE_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_PER_MINUTE`, `AI_ADMIN_WRITE_RATE_LIMIT_MAX`, `CV_WRITE_RATE_LIMIT_MAX`, `LATEX_COMPILE_PER_DAY`, `CV_IMPORT_PER_DAY` |

- Aucune clé de fournisseur IA ici : elles sont saisies dans le dashboard et lues dans Supabase
  Vault par le rôle restreint `ai_backend` (`AI_DATABASE_URL`, pooler en mode session, TLS vérifié).
  Sans `AI_DATABASE_URL`, toutes les fonctionnalités IA sont « momentanément indisponibles ».
- `AI_ENABLED` et `AI_DISABLED_FEATURES` sont des coupe-circuits prioritaires sur le dashboard.
- Sans `LATEX_RUNNER_URL`, `/api/cv/compile` répond 503 ; sans `CV_EXTRACTOR_URL`, `/api/cv/import` répond 503.
- `ADMIN_BOOTSTRAP_ENABLED` reste à `false` hors création du premier compte du blog.

## Tests

```bash
npm test          # Vitest + Supertest
npm run typecheck # sources et tests
```

Les tests n'ouvrent aucune connexion sortante (seule la boucle locale est autorisée), remplacent
Pinecone par un index en mémoire et les fournisseurs IA par des réponses simulées. Des valeurs
« canari » tiennent lieu de secrets : aucune réponse de l'API ne doit les contenir.
