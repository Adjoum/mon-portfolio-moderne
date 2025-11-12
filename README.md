# React + TypeScript + Vite :  🚀 Portfolio Moderne & Innovant



<div align="center">

![Portfolio Banner](https://img.shields.io/badge/Portfolio-Moderne-00f0ff?style=for-the-badge&logo=react&logoColor=white)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

**Un portfolio ultra-moderne avec animations de dernière génération et gestion dynamique de contenu**

[🌐 Démo Live](#) • [📖 Documentation](#documentation) • [🚀 Installation](#installation) • [💡 Fonctionnalités](#fonctionnalités)

</div>

---

## ✨ Fonctionnalités Principales

### 🎨 Design & UX
- ✅ **Interface ultra-moderne** avec thème sombre et accents néon (cyan, rose, violet)
- ✅ **Animations fluides** avec Framer Motion (scroll, hover, transitions)
- ✅ **Particules interactives** en arrière-plan avec Canvas API
- ✅ **Navigation smooth** entre sections avec scroll automatique
- ✅ **100% Responsive** - Mobile, tablette et desktop
- ✅ **Effets de glassmorphism** et dégradés dynamiques

### 💼 Gestion de Contenu
- ✅ **Dashboard Admin** sécurisé avec authentification Supabase
- ✅ **CRUD complet** pour projets et compétences
- ✅ **Upload de CV** en PDF avec prévisualisation
- ✅ **Filtrage dynamique** des projets par catégorie
- ✅ **Système de projets "Featured"**
- ✅ **Gestion des technologies** par projet

### 🔐 Sécurité
- ✅ **Authentification** avec Supabase Auth
- ✅ **Row Level Security (RLS)** sur la base de données
- ✅ **Protection des routes** admin
- ✅ **Variables d'environnement** pour les clés sensibles

### ⚡ Performance
- ✅ **Build optimisé** avec Vite
- ✅ **Lazy loading** des composants
- ✅ **Code splitting** automatique
- ✅ **Images optimisées**

---

## 🛠️ Technologies Utilisées

### Frontend
- **React 18.3** - Bibliothèque UI
- **TypeScript 5.5** - Typage statique
- **Vite 6.0** - Build tool ultra-rapide
- **Framer Motion 11.15** - Animations fluides
- **Lucide React** - Icônes modernes

### Backend & Base de données
- **Supabase** - Backend as a Service
  - PostgreSQL Database
  - Authentication
  - Row Level Security
  - Real-time subscriptions

### Styling
- **CSS3** avec variables CSS
- **Glassmorphism effects**
- **Gradients dynamiques**
- **Responsive design**

---

## 📦 Installation

### Prérequis
- Node.js 18+ 
- npm ou yarn
- Compte Supabase (gratuit)

### 1. Cloner le projet

```bash
git clone https://github.com/votre-username/portfolio-moderne.git
cd portfolio-moderne
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configuration Supabase

#### a. Créer un projet Supabase
1. Allez sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Notez votre URL et votre clé anon

#### b. Créer les tables

Exécutez ce SQL dans l'éditeur SQL de Supabase :

```sql
-- Table Projects
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  technologies TEXT[] NOT NULL DEFAULT '{}',
  imageurl TEXT,
  githuburl TEXT,
  liveurl TEXT,
  category TEXT NOT NULL CHECK (category IN ('web', 'mobile', 'ai', 'data')),
  featured BOOLEAN DEFAULT FALSE,
  createdat TIMESTAMPTZ DEFAULT NOW(),
  updatedat TIMESTAMPTZ DEFAULT NOW()
);

-- Table Skills
CREATE TABLE skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('frontend', 'backend', 'mobile', 'ai', 'data', 'tools')),
  level INTEGER NOT NULL CHECK (level >= 0 AND level <= 100),
  createdat TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

-- Politiques : Lecture publique
CREATE POLICY "Allow public read" ON projects FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON skills FOR SELECT USING (true);

-- Politiques : Écriture authentifiée
CREATE POLICY "Allow authenticated insert" ON projects 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON projects 
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON projects 
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON skills 
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON skills 
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON skills 
  FOR DELETE USING (auth.role() = 'authenticated');

-- Fonction de mise à jour auto
CREATE OR REPLACE FUNCTION update_updatedat_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedat = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger
CREATE TRIGGER update_projects_updatedat 
  BEFORE UPDATE ON projects
  FOR EACH ROW 
  EXECUTE FUNCTION update_updatedat_column();
```

#### c. Créer un utilisateur admin

1. Dans Supabase : **Authentication** > **Users**
2. Cliquez sur **Add user** > **Create new user**
3. Entrez email et mot de passe

### 4. Variables d'environnement

Créez un fichier `.env` à la racine :

```env
VITE_SUPABASE_URL=votre_url_supabase
VITE_SUPABASE_ANON_KEY=votre_cle_anon_supabase
```

Trouvez ces valeurs dans : **Settings** > **API**

### 5. Lancer le projet

```bash
npm run dev
```

Votre portfolio sera accessible sur `http://localhost:5173` 🎉

---

## 📁 Structure du Projet

```
portfolio-moderne/
├── src/
│   ├── components/
│   │   ├── Navbar.tsx              # Barre de navigation
│   │   ├── ParticlesBackground.tsx # Particules animées
│   │   └── AdminLogin.tsx          # Formulaire de connexion admin
│   ├── sections/
│   │   ├── Hero.tsx                # Section d'accueil
│   │   ├── Skills.tsx              # Section compétences
│   │   ├── Projects.tsx            # Section projets
│   │   ├── Contact.tsx             # Section contact
│   │   └── AdminDashboard.tsx      # Dashboard admin
│   ├── lib/
│   │   └── supabase.ts             # Configuration Supabase
│   ├── types/
│   │   └── index.ts                # Types TypeScript
│   ├── App.tsx                     # Composant principal
│   ├── main.tsx                    # Point d'entrée
│   └── index.css                   # Styles globaux
├── public/                         # Assets statiques
├── .env.example                    # Template variables d'environnement
├── .gitignore                      # Fichiers ignorés par Git
├── package.json                    # Dépendances du projet
├── tsconfig.json                   # Configuration TypeScript
├── vite.config.ts                  # Configuration Vite
└── README.md                       # Documentation
```

---

## 🎯 Utilisation

### Ajouter un projet

#### Via le Dashboard Admin

1. Accédez à `/admin`
2. Connectez-vous avec vos identifiants
3. Cliquez sur **Nouveau Projet**
4. Remplissez le formulaire :
   - Titre du projet
   - Description
   - Catégorie (Web, Mobile, IA, Data)
   - Technologies utilisées
   - URLs (image, GitHub, live demo)
   - Featured (oui/non)
5. Cliquez sur **Enregistrer**

#### Via Supabase (alternative)

```sql
INSERT INTO projects (title, description, category, technologies, imageurl, githuburl, liveurl, featured)
VALUES (
  'Mon Super Projet',
  'Description détaillée du projet',
  'web',
  ARRAY['React', 'TypeScript', 'Node.js'],
  'https://example.com/image.jpg',
  'https://github.com/username/project',
  'https://demo.example.com',
  true
);
```

### Ajouter une compétence

1. Dans le dashboard, cliquez sur **Compétences**
2. Cliquez sur **Nouvelle Compétence**
3. Entrez :
   - Nom de la compétence
   - Catégorie
   - Niveau (0-100%)
4. Enregistrez

### Uploader un CV

1. Dans le dashboard, cliquez sur **CV PDF**
2. Glissez-déposez ou sélectionnez votre CV
3. Prévisualisez et téléchargez

---

## 🎨 Personnalisation

### Modifier les couleurs

Dans `src/index.css`, changez les variables CSS :

```css
:root {
  --primary: #00f0ff;      /* Cyan */
  --secondary: #ff006e;    /* Rose */
  --accent: #8338ec;       /* Violet */
  --bg-dark: #0a0a0a;      /* Fond sombre */
  --bg-card: #1a1a2e;      /* Fond des cartes */
}
```

### Modifier vos informations

Dans `src/sections/Contact.tsx`, ligne 32-62 :

```typescript
const contactInfo = [
  {
    icon: Mail,
    label: 'Email',
    value: 'votre@email.com',
    link: 'mailto:votre@email.com',
  },
  // ... autres infos
];
```

### Modifier les compétences fixes

Dans `src/sections/Skills.tsx`, ligne 10-60 :

```typescript
const skillsData = [
  {
    category: 'Frontend Development',
    skills: [
      { name: 'React / Next.js', level: 95, color: '#00f0ff' },
      // ... vos compétences
    ],
  },
];
```

---

## 🚀 Déploiement

### Vercel (Recommandé)

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel

# Ajouter les variables d'environnement dans le dashboard Vercel
```

### Netlify

```bash
# Build le projet
npm run build

# Glissez-déposez le dossier dist sur app.netlify.com/drop
```

### Variables d'environnement en production

N'oubliez pas d'ajouter vos variables dans le dashboard :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 📊 Scripts Disponibles

```bash
npm run dev          # Lancer le serveur de développement
npm run build        # Build pour production
npm run preview      # Prévisualiser le build
npm run lint         # Linter le code
```

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créez votre branche (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add: Amazing feature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

---

## 📝 Roadmap

- [ ] Mode clair/sombre
- [ ] Internationalisation (FR/EN)
- [ ] Blog avec articles
- [ ] Système de commentaires
- [ ] Analytics intégré
- [ ] PWA (Progressive Web App)
- [ ] Mode offline

---

## 📄 Licence

Ce projet est sous licence MIT - voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 👤 Auteur

**Adjoumani**
- Portfolio: [votreportfolio.com](#)
- GitHub: [@votre-username](https://github.com/votre-username)
- LinkedIn: [Votre Profil](https://linkedin.com/in/votre-profil)
- Email: votre@email.com

---

## 🙏 Remerciements

- [React](https://reactjs.org/) - Framework UI
- [Supabase](https://supabase.com/) - Backend as a Service
- [Framer Motion](https://www.framer.com/motion/) - Animations
- [Lucide](https://lucide.dev/) - Icônes
- [Vite](https://vitejs.dev/) - Build tool

---

<div align="center">

**⭐ Si ce projet vous a aidé, n'hésitez pas à lui donner une étoile !**

Made with ❤️ by Adjoumani

</div>
