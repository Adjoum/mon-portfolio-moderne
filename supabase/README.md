# supabase

Migrations du projet Supabase de production, leurs retours arrière, la sauvegarde vérifiable, les
contrôles avant mise en production et les bancs de test locaux. Aucun outil de ce dossier ne modifie
la production : les migrations s'appliquent à la main, phase par phase, après accord explicite.

| Dossier | Contenu |
|---|---|
| `migrations/` | 13 migrations, appliquées une par une, chacune dans sa transaction |
| `rollback/` | un script `.down.sql` par migration (un seul pour les quatre du centre IA) |
| `backup/` | `backup.sh` (pg_dump en lecture seule), `verify-backup.mjs` (restauration isolée) |
| `checks/` | inventaires SQL, sonde publique, comparaison, phase 0, rapport GO / NO-GO |
| `tests/` | bancs RLS, centre IA, sessions, Security Advisor, répétition générale, pile complète |
| `SECURITY-ADVISOR.md` | alertes du Security Advisor acceptées, avec leur justification |

## Ordre d'application en production

Ordre des noms à l'intérieur de chaque phase ; la 12 est avancée en phase 3. La répétition
générale (`node supabase/tests/rehearsal/run.mjs`) applique et retire les migrations exactement dans
cet ordre ; `--ordre-noms` rejoue l'ordre alphabétique de la recette locale.

| # | Migration | Phase | Condition |
|---|---|---|---|
| 1 | `20261030120000_p0a1_admin_access_control` | 3 | nouveau frontend déjà en ligne (l'ancien lit `visits` en anonyme et n'a pas de TOTP) |
| 2 | `20261030120100_p0a1_storage_access_control` | 3 | |
| 3 | `20261030120200_p0a1_security_advisor` | 3 | |
| 4 | `20261030150000_cv_public_document` | 3 | |
| 5 | `20261030150100_project_images_no_public_listing` | 3 | |
| 12 | `20261102100000_admin_session_idle` | 3 | après 1 à 5 ; l'ancien dashboard n'ouvre pas de session et serait refusé |
| 6 | `20261030170000_ai_control_center_schema` | 4 | |
| 7 | `20261030170100_ai_admin_functions` | 4 | |
| 8 | `20261030170200_ai_runtime_functions` | 4 | |
| 9 | `20261030170300_ai_initial_catalog` | 4 | puis mot de passe et `login` du rôle `ai_backend` |
| 10 | `20261101100000_cv_private_history` | 4 | |
| 11 | `20261101120000_ai_probe_details` | 4 | |
| 13 | `20261102100100_cv_documents_quota_privileges` | 4 | après la 10 |

La nouvelle `blog-api` (phase 5) exige la migration 12 : sans elle, ses routes d'administration
répondent 503.

## Règles d'application

1. **Sauvegarde d'abord**, vérifiée par restauration isolée : sans elle, aucune migration.
2. Client `postgres:17-alpine` (psql et pg_restore 17, quelle que soit la version du serveur),
   rôle `postgres` par le pooler en mode session, TLS `verify-full` avec le certificat du projet.
3. Un fichier = une transaction : `psql -X -v ON_ERROR_STOP=1 --single-transaction -f <migration>`,
   arrêt à la première erreur.
4. Après chaque phase : sonde anonyme et nouvel inventaire, comparés à l'état attendu.

## Retour arrière

1. API : version précédente **avant** le script de la migration 12.
2. Scripts `rollback/*.down.sql` du plus récent au plus ancien, chacun dans sa transaction.
3. `restauration.sql`, généré depuis l'inventaire pris avant les migrations
   (`checks/restore-from-inventory.mjs`), rétablit la configuration d'accès d'origine.
4. Bucket `cv-private` : le vider puis le supprimer par l'API Storage (la suppression SQL est interdite).
5. Frontend : *Instant Rollback* Vercel seulement une fois la base revenue à l'état de l'ancien frontend.

Les migrations ne modifient aucune donnée applicative. Une restauration de données depuis
`public.dump` (`pg_restore --data-only --table=…`) n'intervient que si des données étaient abîmées.

## Sauvegarde et contrôles

```powershell
# Sauvegarde en lecture seule ; mot de passe demandé sans écho ; sortie hors du dépôt
docker run --rm -it `
  -v D:\portfolio-sauvegardes:/backup `
  -v D:\adjoumani-portfolio\supabase\backup:/scripts:ro `
  -v D:\adjoumani-portfolio\secrets\supabase-ca.crt:/run/ca.crt:ro `
  -e PGHOST=<hôte-du-pooler> -e PGPORT=5432 -e PGUSER=postgres.<ref-projet> `
  -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/run/ca.crt `
  postgres:17-alpine sh /scripts/backup.sh
```

```bash
node supabase/backup/verify-backup.mjs <dossier-de-sauvegarde> <inventaire.json>
node supabase/checks/compare-inventory.mjs supabase/checks/results/production-inventory.json
node supabase/checks/phase0.mjs <inventaire.json> <dossier-de-sauvegarde>
node supabase/checks/go-no-go.mjs     # rapport unique : supabase/checks/results/RAPPORT-GO-NO-GO.md
```

- Inventaire : `checks/p1ai_production_inventory.sql` dans le SQL Editor (lecture seule) ;
  `checks/p1ai_public_probe.mjs` relève ce qu'un visiteur anonyme peut lire.
- Les relevés des dashboards se saisissent dans `checks/releves.json`, sur le modèle `releves.example.json`.
- Inventaires, relevés, rapports et sauvegardes contiennent des données de production : ils restent
  dans `checks/results/` ou hors du dépôt, tous ignorés par Git. La sauvegarde contient les comptes,
  les empreintes de mots de passe et les secrets TOTP : la garder chiffrée, puis la supprimer.

## Bancs locaux

Tous sur une base Supabase locale jetable, sans donnée ni clé réelle ; Docker requis.

```bash
bash supabase/tests/rls/run.sh          # P0.A1 : faille prouvée, migrations ×2, assertions, retour arrière
bash supabase/tests/ai/run.sh           # centre IA
bash supabase/tests/session/run.sh      # sessions administrateur, horloge simulée
node supabase/tests/rehearsal/run.mjs   # répétition dans l'ordre de production ; --from-backup <dossier> sur une copie réelle
npm run test:stack                      # pile complète : Auth, PostgREST, Storage, TOTP réel, blog-api
```
