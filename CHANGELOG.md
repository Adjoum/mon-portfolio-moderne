# 📋 CHANGELOG — Adjoumani Portfolio v2.0

> Complément au README principal. Documente toutes les fonctionnalités ajoutées lors de la session de développement du **08 Mars 2026**.

---

## 🆕 Nouvelles fonctionnalités

### 🎨 InkSpace v3.0 — Tableau blanc interactif
**Route :** `/adjoumani-whiteboard`  
**Fichiers :** `src/pages/whiteboard.tsx`, `src/components/WhiteboardEmbed.tsx`, `public/inkspace/`

Tableau blanc premium intégré en iframe dans le portfolio.

**Capacités :**
- Outils de dessin : stylo, pinceau, marqueur, calligraphie, gomme
- Formes 2D/3D : rectangle, cercle, triangle, cube, prisme, cylindre
- Outil angle à main levée (détection automatique du sommet)
- Courbes de Bézier à main levée (fit mathématique automatique)
- Éditeur de graphes (nœuds + arêtes dirigées/non-dirigées, poids)
- Formules mathématiques : `\sum`, `\prod`, `\int`, `\frac`, `\sqrt`, `\lim` avec bornes
- Outil texte avec mise en forme (gras, italique, souligné, taille, police, couleur)
- Assistant IA (Groq API `llama-3.3-70b-versatile`)
- 4 thèmes, 5 types de grilles, minimap, mode présentation
- Export PNG/SVG, impression, sauvegarde automatique (localStorage)
- Responsive : toolbar horizontale sur mobile, pinch-to-zoom tactile

**Variables d'environnement requises :** aucune (clé Groq stockée en localStorage)

```
public/
  inkspace/
    index.html     ← application complète (fichier unique)
```

---

### 📊 Tracking des visiteurs
**Fichiers :** `src/hooks/useVisitTracker.ts`, `src/components/VisitorStats.tsx`

Système d'analytics maison sans service tiers payant.

**Données collectées par visite :**
| Champ | Source |
|---|---|
| `page` | `location.pathname` |
| `country` / `city` | API `ipwho.is` (production uniquement) |
| `user_agent` | `navigator.userAgent` |
| `language` | `navigator.language` |
| `screen` | `screen.width x screen.height` |
| `referrer` | `document.referrer` |
| `created_at` | Supabase (auto) |

**Activation :** le hook `useVisitTracker()` est appelé dans `AnimatedRoutes` — se déclenche automatiquement à chaque changement de page. Les pages `/admin` sont exclues du tracking.

**Table Supabase à créer :**
```sql
create table visits (
  id          bigserial primary key,
  page        text not null,
  referrer    text,
  user_agent  text,
  country     text,
  city        text,
  language    text,
  screen      text,
  created_at  timestamptz default now()
);

alter table visits enable row level security;

create policy "Anyone can insert visits"
  on visits for insert with check (true);

create policy "Public can read visits"
  on visits for select using (true);
```

---

### 🏠 Page d'accueil — Compteur de visiteurs animé
**Fichier :** `src/pages/HomePage.tsx`

Compteur animé (0 → total) dans la section CTA, avec halo pulsant.  
Se rafraîchit à chaque chargement de page depuis Supabase.

---

### 📈 Dashboard admin — Onglet Visiteurs
**Fichier :** `src/pages/AdminDashboard.tsx`, `src/components/VisitorStats.tsx`

Nouvel onglet **Visiteurs** dans le dashboard admin avec :
- KPIs : total visites, visites aujourd'hui, pages uniques, pays
- Graphique en barres par heure (24h)
- Top pages, top pays, top sources de trafic
- Liste des 20 dernières visites avec géolocalisation
- Refresh automatique toutes les 60 secondes
- Compteur animé en haut du dashboard (cliquable → onglet visiteurs)

---

### 📱 Responsive complet
**Fichier :** `src/pages/HomePage.tsx`, `src/index.css`

Breakpoints appliqués sur toute la HomePage :

| Breakpoint | Comportement |
|---|---|
| `xl` (>1280px) | Layout complet, textes grands |
| `lg` (>1024px) | Layout standard |
| `sm` (>640px) | Stats visibles, boutons en ligne |
| `xs` (<640px) | Boutons en colonne, stats masquées |

Animations Framer Motion optimisées avec `whileInView` + `viewport margin` pour tous les écrans.

---

## 🔧 Modifications techniques

### `src/App.tsx`
- `Footer` conditionnel : masqué sur `/adjoumani-whiteboard`
- `ScrollToTop` conditionnel : désactivé sur `/adjoumani-whiteboard`
- `useVisitTracker()` ajouté dans `AnimatedRoutes`
- Route `/adjoumani-whiteboard` ajoutée

### `src/components/Navigation.tsx`
- Onglet **InkSpace** ajouté (`PenLine` icon, badge `NEW`)
- Interface `NavItem` étendue avec `badge?: string`

### `src/index.css`
```css
/* Empêche le scroll sur la page whiteboard */
body:has(.whiteboard-page) {
  overflow: hidden;
}
```

---

## 🗄️ Base de données Supabase

### Nouvelle table
| Table | Description |
|---|---|
| `visits` | Historique de toutes les visites du site |

### Politiques RLS
| Table | Opération | Politique |
|---|---|---|
| `visits` | INSERT | Publique (tous les visiteurs) |
| `visits` | SELECT | Publique (lecture du compteur) |

---

## 📦 Dépendances

Aucune nouvelle dépendance npm ajoutée. Toutes les fonctionnalités utilisent :
- `@supabase/supabase-js` (déjà présent)
- `framer-motion` (déjà présent)
- `react-router-dom` (déjà présent)
- `lucide-react` (déjà présent)

---

## 🌍 Variables d'environnement Vercel

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> ⚠️ Ne jamais hardcoder ces valeurs dans le code source.  
> La clé Groq pour InkSpace est stockée uniquement en `localStorage` côté navigateur.

---

## 🚀 Déploiement

```bash
# GitLab (origin)
git push origin main

# GitHub (miroir)
git push github main
```

Le déploiement Vercel se déclenche automatiquement après chaque push sur `origin` (GitLab connecté à Vercel).

---

## ✅ Checklist post-déploiement

- [ ] Variables d'environnement définies sur Vercel
- [ ] Table `visits` créée dans Supabase
- [ ] Politiques RLS appliquées
- [ ] Clé Groq saisie dans le localStorage via le panneau IA d'InkSpace
- [ ] Naviguer sur quelques pages pour générer les premières visites
- [ ] Vérifier le compteur sur la page d'accueil

---

*Développé par Adjoumani Koffi — [adjoumani-koffi.com](https://adjoumani-koffi.com)*