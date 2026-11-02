import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Cpu, Sparkles, LogOut, ShieldCheck, Clock3, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit, Trash2, Save, X, Upload, FileText, Briefcase, Award, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Project, Skill } from '../lib/supabase'
import AdminGate from '../components/admin/AdminGate';
import CvManager from '../components/admin/CvManager';
import VisitorStats from '../components/VisitorStats'
import AILabManager from '../components/AILabManager'
import { formatRemaining, useAdminSession } from '../components/admin/adminSessionContext'
import { BEFORE_LOCK_EVENT, DRAFT_PREFIX } from '../lib/adminSession'
import { useAdminPath } from '../components/admin/adminBase'

// Centre IA chargé à la demande : il n'alourdit pas le reste du dashboard
const AiAdminPanel = lazy(() => import('../features/ai-admin/AiAdminPanel'))




type TabType = 'projects' | 'skills' | 'cv' | 'visitors' | 'ailab' | 'ai'

const TABS: { id: TabType; label: string; icon: LucideIcon }[] = [
  { id: 'projects', label: 'Projets',                  icon: Briefcase },
  { id: 'skills',   label: 'Compétences',              icon: Award },
  { id: 'cv',       label: 'CV PDF',                   icon: FileText },
  { id: 'visitors', label: 'Visiteurs',                icon: Users },
  { id: 'ailab',    label: 'AI Lab',                   icon: Cpu },
  { id: 'ai',       label: 'Intelligence artificielle', icon: Sparkles },
]

// Brouillons conservés au verrouillage de la session (sessionStorage de cet onglet uniquement).
// Contenu : champs du formulaire (texte, URL publiques) ; jamais de fichier, de jeton ni de clé.
const PROJECT_DRAFT = `${DRAFT_PREFIX}project`
const SKILL_DRAFT   = `${DRAFT_PREFIX}skill`
interface Draft<F, E> { form: F; editing: E | null; at: number }

function readDraft<F, E>(key: string): Draft<F, E> | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Draft<F, E>) : null
  } catch {
    return null
  }
}

/** Indicateur discret : session MFA, contrôle serveur, compte à rebours en fin de délai */
function SessionIndicator() {
  const session = useAdminSession()
  const warning = session.status === 'warning'
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${warning ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}
      title="La session se verrouille après 10 minutes sans clic, saisie, défilement ou touche clavier. Le serveur refuse toute action au-delà."
    >
      {warning ? <Clock3 size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
      <span className="whitespace-nowrap">Session MFA</span>
      <span className="text-white/40" aria-hidden="true">·</span>
      {warning
        ? <span className="whitespace-nowrap tabular-nums">verrouillage dans {formatRemaining(session.remainingMs)}</span>
        : (
          <span className="whitespace-nowrap">
            verrouillage 10 min
            {session.serverEnforced && <span className="hidden sm:inline"> · contrôlé par le serveur</span>}
          </span>
        )}
    </p>
  )
}

interface ProjectForm {
  title: string
  description: string
  technologies: string[]
  imageurl: string
  githuburl: string
  liveurl: string
  category: 'web' | 'mobile' | 'ai' | 'data'
  featured: boolean
}

interface SkillForm {
  name: string
  category: 'frontend' | 'backend' | 'mobile' | 'ai' | 'data' | 'tools'
  level: number
}

// Contenu rendu uniquement après AdminGate (session admin + MFA).
// Les écritures restent protégées côté serveur par la RLS (is_portfolio_admin_mfa).
const AdminDashboardContent: React.FC = () => {

  const [activeTab, setActiveTab] = useState<TabType>('projects')
  const [projects, setProjects] = useState<Project[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [_isLoading, setIsLoading] = useState(false)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showSkillForm, setShowSkillForm] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)

  // États des formulaires
  const [projectForm, setProjectForm] = useState<ProjectForm>({
    title: '',
    description: '',
    technologies: [],
    imageurl: '',
    githuburl: '',
    liveurl: '',
    category: 'web',
    featured: false
  })

  const [skillForm, setSkillForm] = useState<SkillForm>({
    name: '',
    category: 'frontend',
    level: 50
  })

  const [techInput, setTechInput] = useState('')
  const [projectImageFile, setProjectImageFile] = useState<File | null>(null);
  const [projectImagePreview, setProjectImagePreview] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const navigate = useNavigate()
  const knowledgePath = useAdminPath('knowledge')
  const session = useAdminSession()
  const tabRefs = useRef<Partial<Record<TabType, HTMLButtonElement | null>>>({})
  const [drafts, setDrafts] = useState(() => ({
    project: readDraft<ProjectForm, Project>(PROJECT_DRAFT),
    skill:   readDraft<SkillForm, Skill>(SKILL_DRAFT),
  }))




  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setIsLoading(true)
    try {
      if (activeTab === 'projects') {
        const { data } = await supabase.from('projects').select('*').order('createdat', { ascending: false })
        if (data) setProjects(data as Project[])
      } else if (activeTab === 'skills') {
        const { data } = await supabase.from('skills').select('*').order('level', { ascending: false })
        if (data) setSkills(data as Skill[])
      }
    } catch (error) {
      console.error('Erreur de chargement:', error)
    } finally {
      setIsLoading(false)
    }
  }
  const isValidImageUrl = (value: string) => {
  if (!value.trim()) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return value.startsWith("/");
  }
};

const handleProjectImageFileChange = (
  e: React.ChangeEvent<HTMLInputElement>
) => {
  const file = e.target.files?.[0];

  if (!file) return;

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

  if (!allowedTypes.includes(file.type)) {
    alert("Format non accepté. Utilise JPG, PNG ou WEBP.");
    return;
  }

  const maxSize = 3 * 1024 * 1024; // 3 Mo

  if (file.size > maxSize) {
    alert("Image trop lourde. Taille maximale : 3 Mo.");
    return;
  }

  setProjectImageFile(file);
  setProjectImagePreview(URL.createObjectURL(file));

  // On vide l'URL saisie pour éviter l'ambiguïté.
  setProjectForm((prev) => ({
    ...prev,
    imageurl: "",
  }));
};

const clearProjectImageFile = () => {
  if (projectImagePreview) {
    URL.revokeObjectURL(projectImagePreview);
  }

  setProjectImageFile(null);
  setProjectImagePreview("");
};

const uploadProjectImage = async (file: File) => {
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeName = projectForm.title
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const fileName = `${safeName || "project"}-${Date.now()}.${fileExt}`;
    const filePath = `projects/${fileName}`;

    const { error } = await supabase.storage
      .from("project-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from("project-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  };
  
  const handleSaveProject = async () => {
    try {
      if (!projectForm.title.trim()) {
        alert("Le titre est obligatoire");
        return;
      }

      setIsUploadingImage(true);

      let finalImageUrl = projectForm.imageurl.trim();

      if (projectImageFile) {
        finalImageUrl = await uploadProjectImage(projectImageFile);
      }

      if (!finalImageUrl) {
        finalImageUrl = "/api/placeholder/800/600";
      }

      if (
        finalImageUrl !== "/api/placeholder/800/600" &&
        !isValidImageUrl(finalImageUrl)
      ) {
        alert("URL image invalide. Utilise une URL complète ou charge une image.");
        return;
      }

      const cleanData = {
        title: projectForm.title.trim(),
        description: projectForm.description.trim(),
        technologies: projectForm.technologies.filter((t) => t.trim()),
        imageurl: finalImageUrl,
        githuburl: projectForm.githuburl.trim() || null,
        liveurl: projectForm.liveurl.trim() || null,
        category: projectForm.category,
        featured: projectForm.featured,
      };

      console.log("Données à envoyer:", cleanData);

      if (editingProject) {
        const { error } = await supabase
          .from("projects")
          .update(cleanData)
          .eq("id", editingProject.id);

        if (error) {
          console.error("Erreur Supabase:", error);
          throw error;
        }
      } else {
        const { error } = await supabase.from("projects").insert([cleanData]);

        if (error) {
          console.error("Erreur Supabase:", error);
          throw error;
        }
      }

      setShowProjectForm(false);
      setEditingProject(null);
      resetProjectForm();
      clearProjectImageFile();
      loadData();

      alert("Projet enregistré avec succès !");
    } catch (error: any) {
      console.error("Erreur complète:", error);
      const errorMessage = error?.message || "Erreur inconnue";
      alert(`Erreur lors de l'enregistrement: ${errorMessage}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce projet ?')) return
    
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
      loadData()
      alert('Projet supprimé avec succès !')
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la suppression')
    }
  }

  const handleEditProject = (project: Project) => {
    clearProjectImageFile();

    setEditingProject(project);
    setProjectForm({
      title: project.title || "",
      description: project.description || "",
      technologies: project.technologies || [],
      imageurl: project.imageurl || "",
      githuburl: project.githuburl || "",
      liveurl: project.liveurl || "",
      category: project.category,
      featured: project.featured || false,
    });
    setShowProjectForm(true);
  };

  const resetProjectForm = () => {
    clearProjectImageFile();

    setProjectForm({
      title: "",
      description: "",
      technologies: [],
      imageurl: "",
      githuburl: "",
      liveurl: "",
      category: "web",
      featured: false,
    });
  };

  const addTechnology = () => {
    if (techInput.trim() && !projectForm.technologies.includes(techInput.trim())) {
      setProjectForm({
        ...projectForm,
        technologies: [...projectForm.technologies, techInput.trim()]
      })
      setTechInput('')
    }
  }

  const removeTechnology = (tech: string) => {
    setProjectForm({
      ...projectForm,
      technologies: projectForm.technologies.filter(t => t !== tech)
    })
  }

  // GESTION DES COMPÉTENCES
  const handleSaveSkill = async () => {
    try {
      if (editingSkill) {
        const { error } = await supabase
          .from('skills')
          .update(skillForm)
          .eq('id', editingSkill.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('skills')
          .insert([skillForm])
        
        if (error) throw error
      }
      
      setShowSkillForm(false)
      setEditingSkill(null)
      resetSkillForm()
      loadData()
      alert('Compétence enregistrée avec succès !')
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de l\'enregistrement')
    }
  }

  const handleDeleteSkill = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette compétence ?')) return
    
    try {
      const { error } = await supabase.from('skills').delete().eq('id', id)
      if (error) throw error
      loadData()
      alert('Compétence supprimée avec succès !')
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la suppression')
    }
  }

  const handleEditSkill = (skill: Skill) => {
    setEditingSkill(skill)
    setSkillForm({
      name: skill.name,
      category: skill.category,
      level: skill.level
    })
    setShowSkillForm(true)
  }

  const resetSkillForm = () => {
    setSkillForm({
      name: '',
      category: 'frontend',
      level: 50
    })
  }

  // Déconnexion volontaire : session close côté serveur, puis toutes les sessions du compte
  const handleLogout = async () => {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      await session.logout() // AdminGate réaffiche la connexion
    }
  }

  // Verrouillage pour inactivité (AdminSessionProvider) : brouillon des formulaires ouverts
  useEffect(() => {
    const save = () => {
      try {
        if (showProjectForm) sessionStorage.setItem(PROJECT_DRAFT, JSON.stringify({ form: projectForm, editing: editingProject, at: Date.now() }))
        if (showSkillForm) sessionStorage.setItem(SKILL_DRAFT, JSON.stringify({ form: skillForm, editing: editingSkill, at: Date.now() }))
      } catch {
        // stockage indisponible : l'avertissement à 9 minutes a prévenu l'administrateur
      }
    }
    window.addEventListener(BEFORE_LOCK_EVENT, save)
    return () => window.removeEventListener(BEFORE_LOCK_EVENT, save)
  }, [showProjectForm, showSkillForm, projectForm, skillForm, editingProject, editingSkill])

  const discardDrafts = () => {
    sessionStorage.removeItem(PROJECT_DRAFT)
    sessionStorage.removeItem(SKILL_DRAFT)
    setDrafts({ project: null, skill: null })
  }

  const restoreDrafts = () => {
    if (drafts.skill) {
      setActiveTab('skills')
      setSkillForm(drafts.skill.form)
      setEditingSkill(drafts.skill.editing)
      setShowSkillForm(true)
    }
    if (drafts.project) {
      setActiveTab('projects')
      setProjectForm(drafts.project.form)
      setEditingProject(drafts.project.editing)
      setShowProjectForm(true)
    }
    discardDrafts()
  }

  // Onglets : flèches gauche/droite, Début, Fin (motif ARIA « tabs »)
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const index = TABS.findIndex(t => t.id === activeTab)
    const next = e.key === 'ArrowRight' ? (index + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setActiveTab(TABS[next].id)
    tabRefs.current[TABS[next].id]?.focus()
  }

  const tabCount = (id: TabType) => id === 'projects' ? projects.length : id === 'skills' ? skills.length : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen px-4 pb-20 pt-28 sm:px-6 sm:pt-32"
    >
      <div className="container mx-auto max-w-7xl">

        {/* En-tête */}
        <header className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/80 via-slate-900/80 to-violet-950/70 p-5 shadow-2xl shadow-indigo-950/40 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="mb-2 text-3xl font-bold sm:text-4xl lg:text-5xl">
                <span className="gradient-text">Dashboard Admin</span>
              </h1>
              <p className="mb-4 text-base text-slate-300 sm:text-lg">
                Projets, compétences, CV, statistiques et intelligence artificielle
              </p>
              <SessionIndicator />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate(knowledgePath)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              >
                <Brain size={18} aria-hidden="true" />
                Knowledge Base
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              >
                <LogOut size={18} aria-hidden="true" />
                Déconnexion
              </button>
            </div>
          </div>
        </header>

        {/* Brouillons conservés lors d'un verrouillage */}
        {(drafts.project || drafts.skill) && (
          <div role="status" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Un formulaire non enregistré a été conservé lors du verrouillage de la session
              {drafts.project ? ` (projet « ${drafts.project.form.title || 'sans titre'} »)` : ''}
              {drafts.skill ? ` (compétence « ${drafts.skill.form.name || 'sans nom'} »)` : ''}.
              {drafts.project ? ' Une image chargée depuis l’ordinateur devra être rechargée.' : ''}
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={restoreDrafts} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-amber-300/20 px-3 py-2 font-semibold text-white hover:bg-amber-300/30">
                <RotateCcw size={16} aria-hidden="true" /> Restaurer
              </button>
              <button type="button" onClick={discardDrafts} className="min-h-[40px] rounded-lg px-3 py-2 text-amber-100/80 hover:text-white">Ignorer</button>
            </div>
          </div>
        )}

        {/* Onglets : une ligne défilable sur mobile, jamais de débordement */}
        <div
          role="tablist"
          aria-label="Rubriques d’administration"
          onKeyDown={onTabKeyDown}
          className="scrollbar-hide -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = activeTab === id
            const count = tabCount(id)
            return (
              <button
                key={id}
                ref={el => { tabRefs.current[id] = el }}
                id={`admin-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="admin-tabpanel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(id)}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 sm:text-base ${
                  selected
                    ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-indigo-500/25'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
                {count !== null && <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? 'bg-white/20' : 'bg-white/10'}`}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Contenu de l'onglet actif */}
        <div role="tabpanel" id="admin-tabpanel" aria-labelledby={`admin-tab-${activeTab}`} className="min-w-0">
        <AnimatePresence mode="wait">
          {/* TAB PROJETS */}
          {activeTab === 'projects' && (
            <motion.div
              key="projects"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="mb-6">
                <button
                  onClick={() => {
                    resetProjectForm()
                    setEditingProject(null)
                    setShowProjectForm(true)
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 transition-transform"
                >
                  <Plus size={20} />
                  Nouveau Projet
                </button>
              </div>

              {showProjectForm && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-effect-dark p-8 rounded-2xl mb-8"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white">
                      {editingProject ? 'Modifier le Projet' : 'Nouveau Projet'}
                    </h3>
                    <button
                      onClick={() => {
                        setShowProjectForm(false)
                        setEditingProject(null)
                      }}
                      className="text-gray-400 hover:text-white"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Titre</label>
                      <input
                        type="text"
                        value={projectForm.title}
                        onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                        placeholder="Nom du projet"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Catégorie</label>
                      <select
                        value={projectForm.category}
                        onChange={(e) => setProjectForm({ ...projectForm, category: e.target.value as any })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-black bg-white"
                      >
                        <option value="web">Web</option>
                        <option value="mobile">Mobile</option>
                        <option value="ai">IA</option>
                        <option value="data">Data</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                      <textarea
                        value={projectForm.description}
                        onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                        rows={3}
                        placeholder="Description du projet"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Image du projet
                      </label>

                      <div className="space-y-3">
                        <input
                          type="text"
                          value={projectForm.imageurl}
                          onChange={(e) => {
                            clearProjectImageFile();
                            setProjectForm({
                              ...projectForm,
                              imageurl: e.target.value,
                            });
                          }}
                          className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                          placeholder="https://site.com/image.jpg ou /images/projet.jpg"
                        />

                        <div className="flex items-center gap-3">
                          <label className="px-4 py-3 glass-effect rounded-lg text-gray-200 hover:text-white cursor-pointer flex items-center gap-2 border border-white/10 hover:border-primary/50 transition-colors">
                            <Upload size={18} className="text-primary" />
                            Charger une image locale

                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/webp"
                              onChange={handleProjectImageFileChange}
                              className="hidden"
                            />
                          </label>

                          {projectImageFile && (
                            <button
                              type="button"
                              onClick={clearProjectImageFile}
                              className="px-4 py-3 bg-red-500/20 text-red-400 rounded-lg flex items-center gap-2"
                            >
                              <X size={16} />
                              Retirer
                            </button>
                          )}
                        </div>

                        {(projectImagePreview || projectForm.imageurl) && (
                          <div className="mt-3">
                            <p className="text-sm text-gray-400 mb-2">Aperçu</p>

                            <img
                              src={projectImagePreview || projectForm.imageurl}
                              alt="Aperçu du projet"
                              className="w-full h-48 object-cover rounded-xl border border-white/10"
                              onError={(e) => {
                                e.currentTarget.src = "/api/placeholder/800/600";
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">GitHub URL</label>
                      <input
                        type="text"
                        value={projectForm.githuburl}
                        onChange={(e) => setProjectForm({ ...projectForm, githuburl: e.target.value })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                        placeholder="https://github.com/..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Live URL</label>
                      <input
                        type="text"
                        value={projectForm.liveurl}
                        onChange={(e) => setProjectForm({ ...projectForm, liveurl: e.target.value })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                        placeholder="https://projet.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Technologies</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={techInput}
                          onChange={(e) => setTechInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addTechnology()}
                          className="flex-1 px-4 py-3 glass-effect rounded-lg text-white"
                          placeholder="React, Node.js..."
                        />
                        <button
                          onClick={addTechnology}
                          className="px-4 py-3 bg-primary rounded-lg text-white"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {projectForm.technologies.map((tech) => (
                          <span
                            key={tech}
                            className="px-3 py-1 glass-effect rounded-full text-sm flex items-center gap-2"
                          >
                            {tech}
                            <button onClick={() => removeTechnology(tech)} className="text-red-400">
                              <X size={14} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="featured"
                        checked={projectForm.featured}
                        onChange={(e) => setProjectForm({ ...projectForm, featured: e.target.checked })}
                        className="w-5 h-5"
                      />
                      <label htmlFor="featured" className="text-gray-300">
                        Projet en vedette
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-4 mt-6">
                    
                    <button
                      onClick={handleSaveProject}
                      disabled={isUploadingImage}
                      className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isUploadingImage ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                          Upload...
                        </>
                      ) : (
                        <>
                          <Save size={20} />
                          Enregistrer
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowProjectForm(false)
                        setEditingProject(null)
                      }}
                      className="px-6 py-3 glass-effect rounded-lg font-semibold text-gray-300"
                    >
                      Annuler
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Liste des projets */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                  <motion.div
                    key={project.id}
                    layout
                    className="glass-effect rounded-xl overflow-hidden hover-lift"
                  >
                    <img
                      src={project.imageurl}
                      alt={project.title}
                      className="w-full h-48 object-cover"
                    />
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="text-lg font-bold text-white">{project.title}</h4>
                        {project.featured && (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-500 text-xs rounded-full">
                            Featured
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm mb-4 line-clamp-2">{project.description}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditProject(project)}
                          className="flex-1 px-4 py-2 bg-primary/20 text-primary rounded-lg flex items-center justify-center gap-2"
                        >
                          <Edit size={16} />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDeleteProject(project.id)}
                          className="flex-1 px-4 py-2 bg-red-500/20 text-red-500 rounded-lg flex items-center justify-center gap-2"
                        >
                          <Trash2 size={16} />
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* TAB COMPÉTENCES */}
          {activeTab === 'skills' && (
            <motion.div
              key="skills"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="mb-6">
                <button
                  onClick={() => {
                    resetSkillForm()
                    setEditingSkill(null)
                    setShowSkillForm(true)
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 transition-transform"
                >
                  <Plus size={20} />
                  Nouvelle Compétence
                </button>
              </div>

              {showSkillForm && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-effect-dark p-8 rounded-2xl mb-8 max-w-2xl"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white">
                      {editingSkill ? 'Modifier la Compétence' : 'Nouvelle Compétence'}
                    </h3>
                    <button
                      onClick={() => {
                        setShowSkillForm(false)
                        setEditingSkill(null)
                      }}
                      className="text-gray-400 hover:text-white"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Nom de la compétence</label>
                      <input
                        type="text"
                        value={skillForm.name}
                        onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                        placeholder="React, Python, etc."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Catégorie</label>
                      <select
                        value={skillForm.category}
                        onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value as any })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      >
                        <option value="frontend">Frontend</option>
                        <option value="backend">Backend</option>
                        <option value="mobile">Mobile</option>
                        <option value="ai">IA</option>
                        <option value="data">Data</option>
                        <option value="tools">Tools</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Niveau: {skillForm.level}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={skillForm.level}
                        onChange={(e) => setSkillForm({ ...skillForm, level: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 mt-6">
                    <button
                      onClick={handleSaveSkill}
                      className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2"
                    >
                      <Save size={20} />
                      Enregistrer
                    </button>
                    <button
                      onClick={() => {
                        setShowSkillForm(false)
                        setEditingSkill(null)
                      }}
                      className="px-6 py-3 glass-effect rounded-lg font-semibold text-gray-300"
                    >
                      Annuler
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Liste des compétences */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {skills.map((skill) => (
                  <motion.div
                    key={skill.id}
                    layout
                    className="glass-effect p-6 rounded-xl"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1">{skill.name}</h4>
                        <span className="text-sm text-gray-400">{skill.category}</span>
                      </div>
                      <span className="text-2xl font-bold gradient-text">{skill.level}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-4">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-secondary"
                        style={{ width: `${skill.level}%` }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditSkill(skill)}
                        className="flex-1 px-4 py-2 bg-primary/20 text-primary rounded-lg flex items-center justify-center gap-2 text-sm"
                      >
                        <Edit size={16} />
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteSkill(skill.id)}
                        className="flex-1 px-4 py-2 bg-red-500/20 text-red-500 rounded-lg flex items-center justify-center gap-2 text-sm"
                      >
                        <Trash2 size={16} />
                        Supprimer
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* TAB CV */}
          {activeTab === 'cv' && (
            <motion.div
              key="cv"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <CvManager />
            </motion.div>
          )}

          {/* TAB VISITEURS */}
          {activeTab === 'visitors' && (
            <motion.div
              key="visitors"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <VisitorStats />
            </motion.div>
          )}

          {activeTab === 'ailab' && (
            <AILabManager />
          )}

          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Suspense fallback={<p className="text-gray-400">Chargement du centre IA…</p>}>
                <AiAdminPanel />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </motion.div>
    
  )
}

const AdminDashboard: React.FC = () => (
  <AdminGate>
    <AdminDashboardContent />
  </AdminGate>
)

export default AdminDashboard