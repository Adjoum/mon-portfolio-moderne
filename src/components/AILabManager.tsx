import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Code,
  Database,
  Zap,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  TrendingUp,
  Sparkles,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Layers,
  Filter,
  Upload,
  ExternalLink,
  Github,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type AILabAdminTab = 'projects' | 'capabilities'

interface AILabCapability {
  id: string
  slug: string
  icon: string
  title: string
  description: string
  sortorder: number
  active: boolean
  createdat: string
  updatedat: string
}

interface AILabProject {
  id: string
  slug: string
  icon: string
  title: string
  description: string
  technologies: string[]
  color: string
  imageurl: string | null
  githuburl: string | null
  liveurl: string | null
  demourl: string | null
  demoavailable: boolean
  featured: boolean
  active: boolean
  sortorder: number
  createdat: string
  updatedat: string
  capabilities?: AILabCapability[]
}

interface AILabProjectRow extends Omit<AILabProject, 'capabilities'> {
  ailab_project_capabilities?: {
    capability_id: string
    ailab_capabilities: AILabCapability | null
  }[]
}

interface ProjectForm {
  slug: string
  icon: string
  title: string
  description: string
  technologies: string[]
  color: string
  imageurl: string
  githuburl: string
  liveurl: string
  demourl: string
  demoavailable: boolean
  featured: boolean
  active: boolean
  sortorder: number
  capabilityIds: string[]
}

interface CapabilityForm {
  slug: string
  icon: string
  title: string
  description: string
  sortorder: number
  active: boolean
}

const ICON_OPTIONS = [
  'Brain',
  'Code',
  'Database',
  'Zap',
  'MessageSquare',
  'ImageIcon',
  'FileText',
  'TrendingUp',
  'Sparkles',
]

const COLOR_OPTIONS = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-green-500 to-emerald-500',
  'from-orange-500 to-red-500',
  'from-indigo-500 to-violet-500',
  'from-rose-500 to-orange-500',
  'from-teal-500 to-lime-500',
]

const iconMap = {
  Brain,
  Code,
  Database,
  Zap,
  MessageSquare,
  ImageIcon,
  FileText,
  TrendingUp,
  Sparkles,
}

type IconName = keyof typeof iconMap

const getIcon = (name: string) => {
  return iconMap[name as IconName] ?? Brain
}

const slugify = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const emptyProjectForm: ProjectForm = {
  slug: '',
  icon: 'Brain',
  title: '',
  description: '',
  technologies: [],
  color: 'from-blue-500 to-cyan-500',
  imageurl: '',
  githuburl: '',
  liveurl: '',
  demourl: '',
  demoavailable: false,
  featured: false,
  active: true,
  sortorder: 0,
  capabilityIds: [],
}

const emptyCapabilityForm: CapabilityForm = {
  slug: '',
  icon: 'Brain',
  title: '',
  description: '',
  sortorder: 0,
  active: true,
}

const AILAB_PROJECT_SELECT = `
  id,
  slug,
  icon,
  title,
  description,
  technologies,
  color,
  imageurl,
  githuburl,
  liveurl,
  demourl,
  demoavailable,
  featured,
  active,
  sortorder,
  createdat,
  updatedat,
  ailab_project_capabilities (
    capability_id,
    ailab_capabilities (
      id,
      slug,
      icon,
      title,
      description,
      sortorder,
      active,
      createdat,
      updatedat
    )
  )
`

const normalizeProject = (row: AILabProjectRow): AILabProject => {
  const { ailab_project_capabilities, ...project } = row

  return {
    ...project,
    capabilities: (ailab_project_capabilities ?? [])
      .map((item) => item.ailab_capabilities)
      .filter((item): item is AILabCapability => Boolean(item)),
  }
}

const AILabManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AILabAdminTab>('projects')
  const [projects, setProjects] = useState<AILabProject[]>([])
  const [capabilities, setCapabilities] = useState<AILabCapability[]>([])
  const [loading, setLoading] = useState(false)

  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showCapabilityForm, setShowCapabilityForm] = useState(false)

  const [editingProject, setEditingProject] = useState<AILabProject | null>(null)
  const [editingCapability, setEditingCapability] = useState<AILabCapability | null>(null)

  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm)
  const [capabilityForm, setCapabilityForm] = useState<CapabilityForm>(emptyCapabilityForm)

  const [techInput, setTechInput] = useState('')
  const [search, setSearch] = useState('')

  const [projectImageFile, setProjectImageFile] = useState<File | null>(null)
  const [projectImagePreview, setProjectImagePreview] = useState('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const filteredProjects = useMemo(() => {
    const value = search.trim().toLowerCase()

    if (!value) return projects

    return projects.filter((project) => {
      return (
        project.title.toLowerCase().includes(value) ||
        project.slug.toLowerCase().includes(value) ||
        project.description.toLowerCase().includes(value) ||
        project.technologies.some((tech) => tech.toLowerCase().includes(value)) ||
        (project.capabilities ?? []).some((capability) =>
          capability.title.toLowerCase().includes(value)
        )
      )
    })
  }, [projects, search])

  const filteredCapabilities = useMemo(() => {
    const value = search.trim().toLowerCase()

    if (!value) return capabilities

    return capabilities.filter((capability) => {
      return (
        capability.title.toLowerCase().includes(value) ||
        capability.description.toLowerCase().includes(value) ||
        capability.slug.toLowerCase().includes(value)
      )
    })
  }, [capabilities, search])

  const loadData = async () => {
    setLoading(true)

    try {
      const [capabilitiesResponse, projectsResponse] = await Promise.all([
        supabase
          .from('ailab_capabilities')
          .select('*')
          .order('sortorder', { ascending: true })
          .order('createdat', { ascending: false }),

        supabase
          .from('ailab_projects')
          .select(AILAB_PROJECT_SELECT)
          .order('sortorder', { ascending: true })
          .order('createdat', { ascending: false }),
      ])

      if (capabilitiesResponse.error) throw capabilitiesResponse.error
      if (projectsResponse.error) throw projectsResponse.error

      setCapabilities((capabilitiesResponse.data ?? []) as AILabCapability[])
      setProjects(
        ((projectsResponse.data ?? []) as unknown as AILabProjectRow[]).map(
          normalizeProject
        )
      )
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Erreur lors du chargement des données AILab.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const isValidImageUrl = (value: string) => {
    if (!value.trim()) return false

    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return value.startsWith('/')
    }
  }

  const handleProjectImageFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]

    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']

    if (!allowedTypes.includes(file.type)) {
      alert('Format non accepté. Utilise JPG, PNG ou WEBP.')
      return
    }

    const maxSize = 3 * 1024 * 1024

    if (file.size > maxSize) {
      alert('Image trop lourde. Taille maximale : 3 Mo.')
      return
    }

    if (projectImagePreview) {
      URL.revokeObjectURL(projectImagePreview)
    }

    setProjectImageFile(file)
    setProjectImagePreview(URL.createObjectURL(file))

    setProjectForm((prev) => ({
      ...prev,
      imageurl: '',
    }))

    event.currentTarget.value = ''
  }

  const clearProjectImageFile = () => {
    if (projectImagePreview) {
      URL.revokeObjectURL(projectImagePreview)
    }

    setProjectImageFile(null)
    setProjectImagePreview('')
  }

  const uploadAILabProjectImage = async (file: File) => {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'

    const safeName = projectForm.title
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const fileName = `${safeName || 'ailab-project'}-${Date.now()}.${fileExt}`
    const filePath = `ailab/${fileName}`

    const { error } = await supabase.storage
      .from('project-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })

    if (error) throw error

    const { data } = supabase.storage
      .from('project-images')
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  const resetProjectForm = () => {
    clearProjectImageFile()
    setProjectForm(emptyProjectForm)
    setTechInput('')
  }

  const resetCapabilityForm = () => {
    setCapabilityForm(emptyCapabilityForm)
  }

  const openNewProjectForm = () => {
    setEditingProject(null)
    resetProjectForm()
    setShowProjectForm(true)
  }

  const openNewCapabilityForm = () => {
    setEditingCapability(null)
    resetCapabilityForm()
    setShowCapabilityForm(true)
  }

  const handleEditProject = (project: AILabProject) => {
    clearProjectImageFile()

    setEditingProject(project)

    setProjectForm({
      slug: project.slug || '',
      icon: project.icon || 'Brain',
      title: project.title || '',
      description: project.description || '',
      technologies: project.technologies || [],
      color: project.color || 'from-blue-500 to-cyan-500',
      imageurl: project.imageurl || '',
      githuburl: project.githuburl || '',
      liveurl: project.liveurl || '',
      demourl: project.demourl || '',
      demoavailable: project.demoavailable || false,
      featured: project.featured || false,
      active: project.active ?? true,
      sortorder: project.sortorder || 0,
      capabilityIds: (project.capabilities ?? []).map((capability) => capability.id),
    })

    setShowProjectForm(true)
  }

  const handleEditCapability = (capability: AILabCapability) => {
    setEditingCapability(capability)

    setCapabilityForm({
      slug: capability.slug || '',
      icon: capability.icon || 'Brain',
      title: capability.title || '',
      description: capability.description || '',
      sortorder: capability.sortorder || 0,
      active: capability.active ?? true,
    })

    setShowCapabilityForm(true)
  }

  const addTechnology = () => {
    const value = techInput.trim()

    if (!value) return

    if (projectForm.technologies.includes(value)) {
      setTechInput('')
      return
    }

    setProjectForm((prev) => ({
      ...prev,
      technologies: [...prev.technologies, value],
    }))

    setTechInput('')
  }

  const removeTechnology = (tech: string) => {
    setProjectForm((prev) => ({
      ...prev,
      technologies: prev.technologies.filter((item) => item !== tech),
    }))
  }

  const toggleCapabilityForProject = (capabilityId: string) => {
    setProjectForm((prev) => {
      const exists = prev.capabilityIds.includes(capabilityId)

      return {
        ...prev,
        capabilityIds: exists
          ? prev.capabilityIds.filter((id) => id !== capabilityId)
          : [...prev.capabilityIds, capabilityId],
      }
    })
  }

  const handleSaveCapability = async () => {
    try {
      if (!capabilityForm.title.trim()) {
        alert('Le titre de la capacité est obligatoire.')
        return
      }

      const payload = {
        slug: capabilityForm.slug.trim() || slugify(capabilityForm.title),
        icon: capabilityForm.icon,
        title: capabilityForm.title.trim(),
        description: capabilityForm.description.trim(),
        sortorder: Number(capabilityForm.sortorder) || 0,
        active: capabilityForm.active,
      }

      if (!payload.slug) {
        alert('Le slug est invalide.')
        return
      }

      if (editingCapability) {
        const { error } = await supabase
          .from('ailab_capabilities')
          .update(payload)
          .eq('id', editingCapability.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('ailab_capabilities')
          .insert([payload])

        if (error) throw error
      }

      setShowCapabilityForm(false)
      setEditingCapability(null)
      resetCapabilityForm()
      await loadData()

      alert('Capacité AILab enregistrée avec succès.')
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Erreur lors de l’enregistrement de la capacité.')
    }
  }

  const handleSaveProject = async () => {
    try {
      if (!projectForm.title.trim()) {
        alert('Le titre du projet est obligatoire.')
        return
      }

      setIsUploadingImage(true)

      let finalImageUrl = projectForm.imageurl.trim()

      if (projectImageFile) {
        finalImageUrl = await uploadAILabProjectImage(projectImageFile)
      }

      if (finalImageUrl && !isValidImageUrl(finalImageUrl)) {
        alert('URL image invalide. Utilise une URL complète ou charge une image.')
        return
      }

      const payload = {
        slug: projectForm.slug.trim() || slugify(projectForm.title),
        icon: projectForm.icon,
        title: projectForm.title.trim(),
        description: projectForm.description.trim(),
        technologies: projectForm.technologies.filter((tech) => tech.trim()),
        color: projectForm.color,
        imageurl: finalImageUrl || null,
        githuburl: projectForm.githuburl.trim() || null,
        liveurl: projectForm.liveurl.trim() || null,
        demourl: projectForm.demourl.trim() || null,
        demoavailable: projectForm.demoavailable,
        featured: projectForm.featured,
        active: projectForm.active,
        sortorder: Number(projectForm.sortorder) || 0,
      }

      if (!payload.slug) {
        alert('Le slug est invalide.')
        return
      }

      let projectId = editingProject?.id

      if (editingProject) {
        const { error } = await supabase
          .from('ailab_projects')
          .update(payload)
          .eq('id', editingProject.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('ailab_projects')
          .insert([payload])
          .select('id')
          .single()

        if (error) throw error

        projectId = data.id
      }

      if (!projectId) {
        throw new Error('Impossible de récupérer l’ID du projet.')
      }

      const { error: deleteLinksError } = await supabase
        .from('ailab_project_capabilities')
        .delete()
        .eq('project_id', projectId)

      if (deleteLinksError) throw deleteLinksError

      if (projectForm.capabilityIds.length > 0) {
        const links = projectForm.capabilityIds.map((capabilityId) => ({
          project_id: projectId,
          capability_id: capabilityId,
        }))

        const { error: insertLinksError } = await supabase
          .from('ailab_project_capabilities')
          .insert(links)

        if (insertLinksError) throw insertLinksError
      }

      setShowProjectForm(false)
      setEditingProject(null)
      resetProjectForm()
      await loadData()

      alert('Projet AILab enregistré avec succès.')
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Erreur lors de l’enregistrement du projet AILab.')
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce projet AILab ?')) return

    try {
      const { error } = await supabase
        .from('ailab_projects')
        .delete()
        .eq('id', projectId)

      if (error) throw error

      await loadData()
      alert('Projet AILab supprimé avec succès.')
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Erreur lors de la suppression du projet.')
    }
  }

  const handleDeleteCapability = async (capabilityId: string) => {
    if (!confirm('Voulez-vous vraiment supprimer cette capacité AILab ?')) return

    try {
      const { error } = await supabase
        .from('ailab_capabilities')
        .delete()
        .eq('id', capabilityId)

      if (error) throw error

      await loadData()
      alert('Capacité AILab supprimée avec succès.')
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Erreur lors de la suppression de la capacité.')
    }
  }

  return (
    <motion.div
      key="ailab-manager"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      className="space-y-8"
    >
      <div className="glass-effect-dark rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Brain className="text-white" size={26} />
            </div>

            <div>
              <h2 className="text-3xl font-bold text-white">Gestion AILab</h2>
              <p className="text-gray-400">
                CRUD complet pour les projets IA, les images, les liens et les filtres.
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="px-5 py-3 glass-effect rounded-xl text-gray-200 hover:text-white disabled:opacity-60"
          >
            {loading ? 'Chargement...' : 'Rafraîchir'}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 mt-8">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-5 py-3 rounded-xl font-semibold flex items-center gap-2 ${
                activeTab === 'projects'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white'
                  : 'glass-effect text-gray-300'
              }`}
            >
              <Layers size={18} />
              Projets IA ({projects.length})
            </button>

            <button
              onClick={() => setActiveTab('capabilities')}
              className={`px-5 py-3 rounded-xl font-semibold flex items-center gap-2 ${
                activeTab === 'capabilities'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white'
                  : 'glass-effect text-gray-300'
              }`}
            >
              <Filter size={18} />
              Capacités ({capabilities.length})
            </button>
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex-1 px-4 py-3 glass-effect rounded-xl text-white"
            placeholder="Rechercher dans AILab..."
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'projects' && (
          <motion.div
            key="ailab-projects"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <div className="mb-6 flex justify-between items-center">
              <button
                onClick={openNewProjectForm}
                className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 transition-transform"
              >
                <Plus size={20} />
                Nouveau projet IA
              </button>
            </div>

            {showProjectForm && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-effect-dark p-8 rounded-2xl mb-8"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold text-white">
                    {editingProject ? 'Modifier le projet IA' : 'Nouveau projet IA'}
                  </h3>

                  <button
                    onClick={() => {
                      setShowProjectForm(false)
                      setEditingProject(null)
                      resetProjectForm()
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Titre
                    </label>
                    <input
                      value={projectForm.title}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          title: event.target.value,
                          slug: prev.slug || slugify(event.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      placeholder="Chatbot IA Multilingue"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Slug
                    </label>
                    <input
                      value={projectForm.slug}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          slug: slugify(event.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      placeholder="chatbot-ia-multilingue"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Icône
                    </label>
                    <select
                      value={projectForm.icon}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          icon: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-lg bg-slate-900 text-white border border-white/10"
                    >
                      {ICON_OPTIONS.map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Couleur
                    </label>
                    <select
                      value={projectForm.color}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          color: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-lg bg-slate-900 text-white border border-white/10"
                    >
                      {COLOR_OPTIONS.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={projectForm.description}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      rows={4}
                      placeholder="Description complète du projet IA"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Image du projet IA
                    </label>

                    <div className="space-y-3">
                      <input
                        value={projectForm.imageurl}
                        onChange={(event) => {
                          clearProjectImageFile()

                          setProjectForm((prev) => ({
                            ...prev,
                            imageurl: event.target.value,
                          }))
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
                            alt="Aperçu du projet IA"
                            className="w-full h-56 object-cover rounded-xl border border-white/10"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none'
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      GitHub URL
                    </label>
                    <input
                      value={projectForm.githuburl}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          githuburl: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      placeholder="https://github.com/..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Live URL
                    </label>
                    <input
                      value={projectForm.liveurl}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          liveurl: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      placeholder="https://projet.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Démo URL
                    </label>
                    <input
                      value={projectForm.demourl}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          demourl: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      placeholder="https://demo.projet.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Ordre d’affichage
                    </label>
                    <input
                      type="number"
                      value={projectForm.sortorder}
                      onChange={(event) =>
                        setProjectForm((prev) => ({
                          ...prev,
                          sortorder: Number(event.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Technologies
                    </label>

                    <div className="flex gap-2">
                      <input
                        value={techInput}
                        onChange={(event) => setTechInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addTechnology()
                          }
                        }}
                        className="flex-1 px-4 py-3 glass-effect rounded-lg text-white"
                        placeholder="Python, TensorFlow, React..."
                      />

                      <button
                        type="button"
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
                          className="px-3 py-1 glass-effect rounded-full text-sm flex items-center gap-2 text-gray-200"
                        >
                          {tech}
                          <button
                            type="button"
                            onClick={() => removeTechnology(tech)}
                            className="text-red-400"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Capacités / filtres liés au projet
                    </label>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {capabilities.map((capability) => {
                        const checked = projectForm.capabilityIds.includes(
                          capability.id
                        )

                        return (
                          <button
                            key={capability.id}
                            type="button"
                            onClick={() => toggleCapabilityForProject(capability.id)}
                            className={`p-4 rounded-xl text-left border transition-all ${
                              checked
                                ? 'bg-primary/20 border-primary text-white'
                                : 'glass-effect border-white/10 text-gray-300'
                            }`}
                          >
                            <div className="font-semibold">{capability.title}</div>
                            <div className="text-xs text-gray-400">
                              {capability.slug}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="md:col-span-2 flex flex-wrap gap-6">
                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={projectForm.demoavailable}
                        onChange={(event) =>
                          setProjectForm((prev) => ({
                            ...prev,
                            demoavailable: event.target.checked,
                          }))
                        }
                        className="w-5 h-5"
                      />
                      Démo disponible
                    </label>

                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={projectForm.featured}
                        onChange={(event) =>
                          setProjectForm((prev) => ({
                            ...prev,
                            featured: event.target.checked,
                          }))
                        }
                        className="w-5 h-5"
                      />
                      Projet en vedette
                    </label>

                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={projectForm.active}
                        onChange={(event) =>
                          setProjectForm((prev) => ({
                            ...prev,
                            active: event.target.checked,
                          }))
                        }
                        className="w-5 h-5"
                      />
                      Actif sur la page publique
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
                      resetProjectForm()
                    }}
                    className="px-6 py-3 glass-effect rounded-lg font-semibold text-gray-300"
                  >
                    Annuler
                  </button>
                </div>
              </motion.div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => {
                const ProjectIcon = getIcon(project.icon)

                return (
                  <motion.div
                    key={project.id}
                    layout
                    className="glass-effect rounded-xl overflow-hidden hover-lift"
                  >
                    <div className={`h-2 bg-gradient-to-r ${project.color}`} />

                    <div className="h-48 bg-slate-900 overflow-hidden">
                      {project.imageurl ? (
                        <img
                          src={project.imageurl}
                          alt={project.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${project.color} flex items-center justify-center`}>
                          <ProjectIcon className="text-white" size={52} />
                        </div>
                      )}
                    </div>

                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${project.color} flex items-center justify-center`}>
                            <ProjectIcon className="text-white" size={24} />
                          </div>

                          <div>
                            <h4 className="text-lg font-bold text-white">
                              {project.title}
                            </h4>
                            <p className="text-xs text-gray-500">{project.slug}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 items-end">
                          {project.featured && (
                            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                              Featured
                            </span>
                          )}

                          {!project.active && (
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
                              Inactif
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                        {project.description}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {(project.capabilities ?? []).map((capability) => (
                          <span
                            key={capability.id}
                            className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                          >
                            {capability.title}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 mb-5">
                        {project.technologies.map((tech) => (
                          <span
                            key={tech}
                            className="px-2 py-1 glass-effect text-xs rounded-full text-gray-300"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {project.githuburl && (
                          <a
                            href={project.githuburl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 bg-white/10 text-white rounded-lg text-sm flex items-center gap-2"
                          >
                            <Github size={15} />
                            GitHub
                          </a>
                        )}

                        {project.liveurl && (
                          <a
                            href={project.liveurl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 bg-primary/20 text-primary rounded-lg text-sm flex items-center gap-2"
                          >
                            <ExternalLink size={15} />
                            Live
                          </a>
                        )}

                        {project.demourl && (
                          <a
                            href={project.demourl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 bg-secondary/20 text-secondary rounded-lg text-sm flex items-center gap-2"
                          >
                            <ExternalLink size={15} />
                            Démo
                          </a>
                        )}
                      </div>

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
                )
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'capabilities' && (
          <motion.div
            key="ailab-capabilities"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <div className="mb-6">
              <button
                onClick={openNewCapabilityForm}
                className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 transition-transform"
              >
                <Plus size={20} />
                Nouvelle capacité
              </button>
            </div>

            {showCapabilityForm && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-effect-dark p-8 rounded-2xl mb-8"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold text-white">
                    {editingCapability ? 'Modifier la capacité' : 'Nouvelle capacité'}
                  </h3>

                  <button
                    onClick={() => {
                      setShowCapabilityForm(false)
                      setEditingCapability(null)
                      resetCapabilityForm()
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Titre
                    </label>
                    <input
                      value={capabilityForm.title}
                      onChange={(event) =>
                        setCapabilityForm((prev) => ({
                          ...prev,
                          title: event.target.value,
                          slug: prev.slug || slugify(event.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      placeholder="Deep Learning"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Slug
                    </label>
                    <input
                      value={capabilityForm.slug}
                      onChange={(event) =>
                        setCapabilityForm((prev) => ({
                          ...prev,
                          slug: slugify(event.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      placeholder="deep-learning"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Icône
                    </label>
                    <select
                      value={capabilityForm.icon}
                      onChange={(event) =>
                        setCapabilityForm((prev) => ({
                          ...prev,
                          icon: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-lg bg-slate-900 text-white border border-white/10"
                    >
                      {ICON_OPTIONS.map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Ordre
                    </label>
                    <input
                      type="number"
                      value={capabilityForm.sortorder}
                      onChange={(event) =>
                        setCapabilityForm((prev) => ({
                          ...prev,
                          sortorder: Number(event.target.value),
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={capabilityForm.description}
                      onChange={(event) =>
                        setCapabilityForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      className="w-full px-4 py-3 glass-effect rounded-lg text-white"
                      rows={3}
                      placeholder="Description de la capacité"
                    />
                  </div>

                  <label className="flex items-center gap-3 text-gray-300">
                    <input
                      type="checkbox"
                      checked={capabilityForm.active}
                      onChange={(event) =>
                        setCapabilityForm((prev) => ({
                          ...prev,
                          active: event.target.checked,
                        }))
                      }
                      className="w-5 h-5"
                    />
                    Actif sur la page publique
                  </label>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    onClick={handleSaveCapability}
                    className="px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center gap-2"
                  >
                    <Save size={20} />
                    Enregistrer
                  </button>

                  <button
                    onClick={() => {
                      setShowCapabilityForm(false)
                      setEditingCapability(null)
                      resetCapabilityForm()
                    }}
                    className="px-6 py-3 glass-effect rounded-lg font-semibold text-gray-300"
                  >
                    Annuler
                  </button>
                </div>
              </motion.div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredCapabilities.map((capability) => {
                const CapabilityIcon = getIcon(capability.icon)

                return (
                  <motion.div
                    key={capability.id}
                    layout
                    className="glass-effect p-6 rounded-xl"
                  >
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4">
                      <CapabilityIcon className="text-white" size={28} />
                    </div>

                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h4 className="text-lg font-bold text-white">
                          {capability.title}
                        </h4>
                        <p className="text-xs text-gray-500">{capability.slug}</p>
                      </div>

                      {!capability.active && (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
                          Inactif
                        </span>
                      )}
                    </div>

                    <p className="text-gray-400 text-sm mb-5 line-clamp-3">
                      {capability.description}
                    </p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditCapability(capability)}
                        className="flex-1 px-4 py-2 bg-primary/20 text-primary rounded-lg flex items-center justify-center gap-2 text-sm"
                      >
                        <Edit size={16} />
                        Modifier
                      </button>

                      <button
                        onClick={() => handleDeleteCapability(capability.id)}
                        className="flex-1 px-4 py-2 bg-red-500/20 text-red-500 rounded-lg flex items-center justify-center gap-2 text-sm"
                      >
                        <Trash2 size={16} />
                        Supprimer
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default AILabManager