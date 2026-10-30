# Security Advisor de Supabase : alertes traitées et alertes résiduelles acceptées

**Relevé de production du 30/10/2026** (projet `portfolio-perso`) : 0 erreur, 8 avertissements, 1 suggestion.

**Prévisions** : elles proviennent des règles mêmes du Security Advisor, le projet `splinter` de Supabase (commit `fccca4b`, empreinte vérifiée). `supabase/tests/rehearsal/run.mjs` les exécute avant et après les migrations, sur l'état simulé ou sur une copie de la sauvegarde (`--from-backup`). Ce script échoue si une alerte nouvelle sort de la liste acceptée ci-dessous.

Décisions du propriétaire du 30/10/2026 : correctifs intégrés à la phase 3, suppression des anciennes insertions « toujours vraies », droits de `is_portfolio_admin()` conservés.

## Alertes traitées par les migrations

| Alerte | Correction | Vérification |
|---|---|---|
| `function_search_path_mutable` : `set_updatedat`, `update_updatedat_column` | `20261030120200` : `search_path` vide, corps inchangé. Rien n'est modifié si le corps lit d'autres objets ou si un `search_path` est déjà posé | répétition : déclencheurs réellement exécutés ; comparaison : corps affiché depuis l'inventaire |
| `rls_policy_always_true` : insertion dans `contacts` et `visits` | `20261030120200`, dans l'ordre :<br>1. garde restrictive (champs obligatoires, tailles maximales) ;<br>2. politique `p0a1_public_insert` bornée ;<br>3. `INSERT` limité aux colonnes que le site envoie ;<br>4. **ensuite**, retrait des anciennes politiques `with check (true)`, recréées par `restauration.sql` au retour arrière | banc RLS : rôles `anon` et `authenticated`, insertions acceptées et refusées, droits par table et par colonne, aucune politique « vraie » restante |
| `public_bucket_allows_listing` : `project-images` | `20261030150100` : retrait de toute politique `SELECT` dont la seule condition est `bucket_id = 'project-images'`, quel que soit son nom | répétition : alerte levée, y compris pour une politique au nom inconnu |

**Défauts trouvés dans nos propres migrations, corrigés avant toute application** :
- `cv_object_is_referenced(text)` est déplacée dans le schéma non exposé `portfolio_private` ;
- `ai_private.audit_is_append_only()` a désormais un `search_path` figé ;
- les tables du centre IA reçoivent un refus explicite `p1ai_no_client_access` ;
- les séquences `ai_usage_events_id_seq` et `ai_config_audit_id_seq` sont fermées aux clients (droits par défaut de Supabase).

## Alertes résiduelles acceptées

### 1. `anon_security_definer_function_executable` et `authenticated_…` : `public.is_portfolio_admin()`

**Définition après P0.A1** (contrôlée par le banc RLS et la répétition) :
- `SECURITY DEFINER`, `STABLE`, langage SQL ;
- `search_path = ''` ;
- aucun argument, renvoie un booléen ;
- propriétaire `postgres` ;
- droit `PUBLIC` retiré, `EXECUTE` accordé à `anon` et `authenticated`.

```sql
select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
```

- **Aucune fuite.** Elle renvoie seulement si l'appelant lui-même est administrateur. Sans argument, elle ne permet pas d'interroger un autre compte. Elle ne lit que `admin_users`, dont aucune colonne n'est renvoyée.
- **Aucune élévation de privilège.** Elle n'écrit rien et n'exécute aucun SQL dynamique. Avec un `search_path` vide et des noms qualifiés, aucun objet ne peut être substitué. `auth.uid()` provient du jeton signé par Supabase Auth et vérifié par PostgREST.
- **Droits nécessaires.**
  - `anon` : les gardes P0.A1 l'évaluent pour chaque visiteur. Sans ce droit, la lecture de `visits` par un visiteur échoue au lieu de renvoyer 0 ligne (démontré par le banc RLS).
  - `authenticated` : le dashboard l'appelle (`rpc('is_portfolio_admin')`, `src/lib/adminAuth.ts`), comme toutes les politiques administrateur.
- **Alternative écartée.** Une enveloppe `SECURITY INVOKER` et un schéma privé effaceraient l'alerte sans rien changer à ce que l'API renvoie : correction cosmétique.

### 2. `anon_…` et `authenticated_security_definer_function_executable` : fonctions publiques voulues

| Fonction | Rôles | Ce qu'elle renvoie ou fait | Contrôle |
|---|---|---|---|
| `visit_count()` | `anon`, `authenticated` | le nombre de visites, sans aucune ligne | lecture seule, `search_path` vide |
| `cv_active()` | `anon`, `authenticated` | les métadonnées du CV public actif (chemin, taille, empreinte, date) | lecture seule, statut `active` uniquement |

### 3. `authenticated_security_definer_function_executable` : fonctions d'administration

| Fonctions | Contrôle interne, en première instruction |
|---|---|
| `cv_publish_version`, `cv_restore_version` | `is_portfolio_admin_mfa()`, sinon erreur `42501` |
| les 19 fonctions `ai_admin_*` | `ai_private.require_admin()` (administrateur avec MFA), sinon erreur `42501` ; refus vérifiés par les 126 tests de `supabase/tests/ai/run.sh` |

Un compte ordinaire peut les appeler, mais elles refusent tout ce qui ne vient pas de l'administrateur avec MFA.

### 4. `auth_leaked_password_protection`

Fonction réservée aux offres Pro et au-delà ; le projet est sur l'offre Free. Compensations :
- mot de passe administrateur long et unique ;
- second facteur TOTP exigé pour toute écriture après P0.A1 ;
- un seul compte existe, et les inscriptions peuvent être fermées sans effet sur le site (décision distincte).

## Performance Advisor (information)

Prévision sur l'état simulé, après les phases 3 et 4 :
- **9 avertissements `multiple_permissive_policies` de plus.** Les politiques P0.A1 s'ajoutent aux politiques permissives existantes, sans les supprimer. L'effet est négligeable à l'échelle du portfolio. Ces avertissements seront à revoir lors d'un nettoyage des anciennes politiques ; cette décision est distincte.
- **Des suggestions sur les nouvelles tables du centre IA** : `unindexed_foreign_keys` et `unused_index` (index pas encore utilisés).
