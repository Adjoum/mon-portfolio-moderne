# latex-runner

Compilation pdflatex isolée pour l'aperçu PDF du studio CV LaTeX. Seule `blog-api` le joint, sur
le réseau Docker interne `latex-net` (aucune sortie vers Internet ni vers l'hôte, aucun port publié).
Aucune dépendance npm, aucun secret, aucun contenu de document journalisé.

## Interface

| Requête | Réponse |
|---|---|
| `GET /healthz` | `{ "status": "ok" }` |
| `GET /policy` | classes, paquets et commandes interdites (lu par les assistants IA du studio) |
| `POST /compile` `{ tex, photo? }` | `application/pdf`, ou `{ code, … }` en JSON : `LATEX_COMPILE_ERROR`, `LATEX_TIMEOUT`, `LATEX_RESOURCE_LIMIT`, `LATEX_INTERNAL`, ou refus de la politique |

`photo` est un JPEG en base64. L'API y accède par `LATEX_RUNNER_URL=http://latex-runner:3000`.

## Limites

| Réglage | Valeur par défaut |
|---|---|
| Corps de requête / photo / PDF produit | 3 Mo / 2 Mo / 10 Mo |
| Compilations simultanées (`LATEX_MAX_CONCURRENCY`) | 2 |
| Durée (`LATEX_TIMEOUT_MS`) / temps CPU (`LATEX_CPU_SECONDS`) | 20 s / 15 s, deux passes au plus |
| Fichiers écrits (`LATEX_MAX_FILE_BYTES`) / mémoire de TeX (`LATEX_MAX_MEMORY_BYTES`) | 32 Mo / 1 Go |
| Conteneur (`docker-compose.yml`) | 512 Mo de mémoire sans swap, 1 CPU, 64 processus |

## Isolement

- Politique lexicale avant compilation (`src/policy.mjs`), puis TeX lui-même verrouillé :
  `shell_escape = f`, `openin_any = p`, `openout_any = p` dans `texmf.cnf`.
- Utilisateur `10001` sans shell, racine en lecture seule, dossier de travail en tmpfs `noexec`
  supprimé après chaque compilation, aucune capacité Linux, `no-new-privileges`, aucun binaire setuid.
- Image `node:24-bookworm-slim` épinglée par empreinte (x86_64 et ARM64), TeX Live de Debian réduit
  aux collections utiles aux modèles.

## Tests

- `npm test` à la racine : politique et commande TeX (`tests/latex/runner-policy.test.ts`).
- `npm run recette:latex` (recette locale démarrée) : vrais PDF et documents malveillants
  (lecture de `/etc/passwd`, `\write18`, contournements, boucle infinie, pages sans fin) ;
  résultats dans `secrets/recette/latex/`.
- `npm run recette:modeles` : les modèles du studio et leurs variantes, contrôle qualité des PDF.
- `tests/latex/sandbox-probe.mjs` : sonde exécutée dans le conteneur, sans la politique lexicale,
  pour vérifier que TeX et le conteneur résistent seuls.
