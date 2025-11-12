import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit, Trash2, Save, X, Upload, Eye, Download, FileText, Briefcase, Award } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Project, Skill } from '../lib/supabase'
import AdminLogin from '../components/AdminLogin';

type TabType = 'projects' | 'skills' | 'cv'

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

const AdminDashboard: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('projects')
  const [projects, setProjects] = useState<Project[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [_isLoading, setIsLoading] = useState(false)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showSkillForm, setShowSkillForm] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvUrl, setCvUrl] = useState<string>('/cv.pdf')

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

  // ✅ AJOUTE CE useEffect POUR VÉRIFIER L'AUTHENTIFICATION
  useEffect(() => {
    const checkAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        setIsAuthenticated(!!session)
        setIsCheckingAuth(false)
    }

    checkAuth()

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setIsAuthenticated(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

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

  // GESTION DES PROJETS
  const handleSaveProject = async () => {
    try {
      // Validation basique
      if (!projectForm.title.trim()) {
        alert('Le titre est obligatoire')
        return
      }

      // Nettoyer les données avant envoi
      const cleanData = {
        title: projectForm.title.trim(),
        description: projectForm.description.trim(),
        technologies: projectForm.technologies.filter(t => t.trim()),
        imageurl: projectForm.imageurl.trim() || '/api/placeholder/800/600',
        githuburl: projectForm.githuburl.trim() || null,
        liveurl: projectForm.liveurl.trim() || null,
        category: projectForm.category,
        featured: projectForm.featured
      }

      console.log('Données à envoyer:', cleanData)
      
      if (editingProject) {
        // Mise à jour
        const { error } = await supabase
          .from('projects')
          .update(cleanData)
          .eq('id', editingProject.id)
        
        if (error) {
          console.error('Erreur Supabase:', error)
          throw error
        }
      } else {
        // Création
        const { error } = await supabase
          .from('projects')
          .insert([cleanData])
        
        if (error) {
          console.error('Erreur Supabase:', error)
          throw error
        }
      }
      
      setShowProjectForm(false)
      setEditingProject(null)
      resetProjectForm()
      loadData()
      alert('Projet enregistré avec succès !')
    } catch (error: any) {
      console.error('Erreur complète:', error)
      const errorMessage = error?.message || 'Erreur inconnue'
      alert(`Erreur lors de l'enregistrement: ${errorMessage}`)
    }
  }

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
    setEditingProject(project)
    setProjectForm({
      title: project.title || '',
      description: project.description || '',
      technologies: project.technologies || [],
      imageurl: project.imageurl || '',
      githuburl: project.githuburl || '',
      liveurl: project.liveurl || '',
      category: project.category,
      featured: project.featured || false
    })
    setShowProjectForm(true)
  }

  const resetProjectForm = () => {
    setProjectForm({
      title: '',
      description: '',
      technologies: [],
      imageurl: '',
      githuburl: '',
      liveurl: '',
      category: 'web',
      featured: false
    })
  }

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

  // GESTION DU CV
  const handleCvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setCvFile(file)
      const url = URL.createObjectURL(file)
      setCvUrl(url)
      
      // Sauvegarder dans le localStorage pour persistance
      const reader = new FileReader()
      reader.onload = (event) => {
        localStorage.setItem('cvFile', event.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      alert('Veuillez sélectionner un fichier PDF')
    }
  }

  useEffect(() => {
    // Charger le CV depuis localStorage au démarrage
    const savedCv = localStorage.getItem('cvFile')
    if (savedCv) {
      setCvUrl(savedCv)
    }
  }, [])

  // ✅ AJOUTE CETTE FONCTION DE DÉCONNEXION
  const handleLogout = async () => {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      await supabase.auth.signOut()
      setIsAuthenticated(false)
    }
  }


  // Afficher le loader pendant la vérification
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Vérification de l'authentification...</p>
        </div>
      </div>
    )
  }

  // Afficher le login si non authentifié
  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={() => setIsAuthenticated(true)} />
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen pt-32 pb-20 px-6"
    >
      <div className="container mx-auto max-w-7xl">

        {/* ✅ AJOUTE CE BOUTON DE DÉCONNEXION */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleLogout}
            className="px-4 py-2 glass-effect rounded-lg text-gray-300 hover:text-white transition-colors flex items-center gap-2"
          >
            <X size={18} />
            Déconnexion
          </button>
        </div>

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-bold mb-4">
            <span className="gradient-text">Dashboard Admin</span>
          </h1>
          <p className="text-xl text-gray-400">
            Gérez vos projets, compétences et CV
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'projects'
                ? 'bg-gradient-to-r from-primary to-secondary text-white'
                : 'glass-effect text-gray-300 hover:text-white'
            }`}
          >
            <Briefcase size={20} />
            Projets ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'skills'
                ? 'bg-gradient-to-r from-primary to-secondary text-white'
                : 'glass-effect text-gray-300 hover:text-white'
            }`}
          >
            <Award size={20} />
            Compétences ({skills.length})
          </button>
          <button
            onClick={() => setActiveTab('cv')}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'cv'
                ? 'bg-gradient-to-r from-primary to-secondary text-white'
                : 'glass-effect text-gray-300 hover:text-white'
            }`}
          >
            <FileText size={20} />
            CV PDF
          </button>
        </div>

        {/* Contenu des tabs */}
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
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
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
                      <label className="block text-sm font-medium text-gray-300 mb-2">URL Image</label>
                      <input
                        type="text"
                        value={projectForm.imageurl}
                        onChange={(e) => setProjectForm({ ...projectForm, imageurl: e.target.value })}
                        className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                        placeholder="/images/projet.jpg"
                      />
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
                      className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2"
                    >
                      <Save size={20} />
                      Enregistrer
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
              <div className="glass-effect-dark p-8 rounded-2xl">
                <h3 className="text-2xl font-bold text-white mb-6">Gérer votre CV PDF</h3>
                
                <div className="mb-8">
                  <label className="block text-sm font-medium text-gray-300 mb-4">
                    Charger un nouveau CV (PDF)
                  </label>
                  <div className="flex gap-4">
                    <label className="flex-1 px-6 py-4 glass-effect rounded-xl border-2 border-dashed border-gray-600 hover:border-primary transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleCvUpload}
                        className="hidden"
                      />
                      <div className="flex items-center justify-center gap-3">
                        <Upload size={24} className="text-primary" />
                        <span className="text-white font-semibold">
                          {cvFile ? cvFile.name : 'Choisir un fichier PDF'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {cvUrl && (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <a
                        href={cvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-primary/20 text-primary rounded-lg flex items-center gap-2 hover:bg-primary/30 transition-colors"
                      >
                        <Eye size={20} />
                        Prévisualiser
                      </a>
                      <a
                        href={cvUrl}
                        download="CV-Adjoumani.pdf"
                        className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg text-white flex items-center gap-2"
                      >
                        <Download size={20} />
                        Télécharger
                      </a>
                    </div>

                    <div className="glass-effect p-4 rounded-xl">
                      <iframe
                        src={cvUrl}
                        className="w-full h-[600px] rounded-lg"
                        title="Prévisualisation CV"
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export default AdminDashboard