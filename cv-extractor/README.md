# cv-extractor

Extraction du texte des CV importés (PDF, DOCX, TXT, RTF), hors de `blog-api` qui détient les
secrets. Seule l'API le joint, sur le réseau Docker interne `extract-net` (aucune sortie vers
Internet, ni vers l'hôte, ni vers `latex-runner`, aucun port publié). Aucun secret, aucun fichier
écrit, aucun contenu journalisé.

## Interface

| Requête | Réponse |
|---|---|
| `GET /healthz` | `{ "status": "ok" }` |
| `POST /extract` : octets du fichier, en-tête `X-File-Kind: pdf \| docx \| txt \| rtf` | `{ text, truncated, pages, needsOcr }` |

L'API y accède par `CV_EXTRACTOR_URL=http://cv-extractor:3100` (route `/api/cv/import`). Un PDF
scanné renvoie `needsOcr` : le studio LaTeX passe alors par la fonctionnalité IA `latex.import.ocr`
de l'API, jamais par ce service.

## Limites

| Réglage | Valeur par défaut |
|---|---|
| Taille du fichier | 10 Mo |
| Extractions simultanées (`EXTRACT_MAX_CONCURRENCY`) | 2 |
| Durée (`EXTRACT_TIMEOUT_MS`) | 20 s, dans un thread de travail borné |
| Conteneur (`docker-compose.yml`) | 512 Mo de mémoire sans swap, 1 CPU, 64 processus |

## Isolement

- Utilisateur `10002` sans shell, racine en lecture seule, aucune capacité Linux,
  `no-new-privileges`, aucun binaire setuid.
- Dépendances figées par `package-lock.json`, installées sans scripts ni modules natifs facultatifs.
- Image `node:24-bookworm-slim` épinglée par empreinte, la même que l'API et `latex-runner`.

## Tests

`npm test` à la racine : `tests/extract/extractor.test.ts`, sur les fichiers de `tests/extract/fixtures/`
(encodages, documents corrompus volontairement), régénérables par `tests/extract/make-fixtures.mjs`.
