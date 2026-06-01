import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Brain,
  Sparkles,
  Zap,
  Code,
  Code2,
  Database,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  TrendingUp,
  ExternalLink,
  Eye,
} from 'lucide-react'
import {
  fetchAILabCapabilities,
  fetchAILabProjects,
  type AILabCapability,
  type AILabProject,
} from '../lib/supabase'

const iconMap = {
  Brain,
  Zap,
  Code,
  Database,
  MessageSquare,
  ImageIcon,
  FileText,
  TrendingUp,
  Sparkles,
}

type IconName = keyof typeof iconMap

const getIcon = (icon?: string) => {
  return iconMap[icon as IconName] ?? Brain
}

const DESCRIPTION_LIMIT = 150

const AILabPage: React.FC = () => {
  const [selectedCapability, setSelectedCapability] = useState('all')
  const [capabilities, setCapabilities] = useState<AILabCapability[]>([])
  const [aiProjects, setAiProjects] = useState<AILabProject[]>([])
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const loadCapabilities = async () => {
      try {
        const data = await fetchAILabCapabilities()
        if (mounted) setCapabilities(data)
      } catch (err) {
        console.error(err)
        if (mounted) setError('Impossible de charger les capacités IA.')
      }
    }

    loadCapabilities()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const loadProjects = async () => {
      try {
        setLoading(true)
        setError(null)

        const data = await fetchAILabProjects(selectedCapability)

        if (mounted) {
          setAiProjects(data)
        }
      } catch (err) {
        console.error(err)
        if (mounted) {
          setError('Impossible de charger les projets IA.')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadProjects()

    return () => {
      mounted = false
    }
  }, [selectedCapability])

  const toggleDescription = (projectId: string) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-32 pb-20"
    >
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(15,23,42,0.8)_100%)]" />
        </div>

        <div className="container mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
            >
              <Brain size={40} className="text-white" />
            </motion.div>

            <h1 className="text-5xl lg:text-7xl font-bold mb-6">
              <span className="gradient-text">IA Laboratory</span>
            </h1>

            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Explorez mes projets d&apos;intelligence artificielle et de machine learning.
              Des solutions innovantes utilisant les dernières avancées en IA.
            </p>

            <div className="flex gap-4 justify-center">
              <Sparkles className="text-primary animate-pulse" size={24} />
              <Sparkles
                className="text-secondary animate-pulse"
                size={24}
                style={{ animationDelay: '0.5s' }}
              />
              <Sparkles
                className="text-accent animate-pulse"
                size={24}
                style={{ animationDelay: '1s' }}
              />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              <span className="gradient-text">Capacités IA</span>
            </h2>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Technologies et domaines d&apos;expertise en intelligence artificielle.
              Cliquez sur une capacité pour filtrer les projets.
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-3 mb-10">
            <button
              onClick={() => setSelectedCapability('all')}
              className={`px-5 py-2 rounded-full font-semibold transition-all ${
                selectedCapability === 'all'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white'
                  : 'glass-effect text-gray-300 border border-white/10'
              }`}
            >
              Tous
            </button>

            {capabilities.map((capability) => (
              <button
                key={capability.id}
                onClick={() => setSelectedCapability(capability.slug)}
                className={`px-5 py-2 rounded-full font-semibold transition-all ${
                  selectedCapability === capability.slug
                    ? 'bg-gradient-to-r from-primary to-secondary text-white'
                    : 'glass-effect text-gray-300 border border-white/10'
                }`}
              >
                {capability.title}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map((capability, index) => {
              const CapabilityIcon = getIcon(capability.icon)

              return (
                <motion.button
                  key={capability.id}
                  type="button"
                  onClick={() => setSelectedCapability(capability.slug)}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className={`glass-effect p-6 rounded-2xl text-center hover-lift cursor-pointer ${
                    selectedCapability === capability.slug ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <CapabilityIcon className="text-white" size={32} />
                  </div>

                  <h3 className="text-xl font-bold text-white mb-3">
                    {capability.title}
                  </h3>

                  <p className="text-gray-400">
                    {capability.description}
                  </p>
                </motion.button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              <span className="gradient-text">Projets IA</span>
            </h2>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Découvrez mes projets d&apos;intelligence artificielle et de machine learning.
            </p>
          </motion.div>

          {loading && (
            <div className="text-center text-gray-300 glass-effect rounded-2xl p-8 max-w-xl mx-auto">
              Chargement des projets IA...
            </div>
          )}

          {!loading && error && (
            <div className="text-center text-red-300 glass-effect rounded-2xl p-8 max-w-xl mx-auto">
              {error}
            </div>
          )}

          {!loading && !error && aiProjects.length === 0 && (
            <div className="text-center text-gray-300 glass-effect rounded-2xl p-8 max-w-xl mx-auto">
              Aucun projet IA trouvé pour ce filtre.
            </div>
          )}

          {!loading && !error && aiProjects.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              {aiProjects.map((project, index) => {
                const ProjectIcon = getIcon(project.icon)
                const isExpanded = expandedDescriptions[project.id] ?? false
                const description = project.description || ''
                const isLongDescription = description.length > DESCRIPTION_LIMIT

                const visibleDescription =
                  isLongDescription && !isExpanded
                    ? `${description.slice(0, DESCRIPTION_LIMIT)}...`
                    : description

                return (
                  <motion.article
                    key={project.id}
                    initial={{ opacity: 0, scale: 0.94 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: index * 0.08 }}
                    viewport={{ once: true }}
                    className="glass-effect-dark rounded-2xl overflow-hidden hover-lift flex flex-col"
                  >
                    <div className={`h-2 bg-gradient-to-r ${project.color}`} />

                    <div className="relative h-52 bg-slate-900 overflow-hidden">
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
                          <ProjectIcon className="text-white" size={56} />
                        </div>
                      )}

                      {project.featured && (
                        <span className="absolute top-4 right-4 px-3 py-1 rounded-full bg-yellow-500/90 text-slate-950 text-xs font-bold">
                          Featured
                        </span>
                      )}
                    </div>

                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br ${project.color} flex items-center justify-center`}>
                          <ProjectIcon className="text-white" size={24} />
                        </div>

                        <div>
                          <h3 className="text-2xl font-bold text-white mb-1">
                            {project.title}
                          </h3>

                          <div className="flex flex-wrap gap-2">
                            {(project.capabilities ?? []).map((capability) => (
                              <span
                                key={capability.id}
                                className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full border border-primary/20"
                              >
                                {capability.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <p className="text-gray-400 mb-3 leading-relaxed">
                        {visibleDescription}
                      </p>

                      {isLongDescription && (
                        <button
                          type="button"
                          onClick={() => toggleDescription(project.id)}
                          className="text-primary text-sm font-semibold text-left mb-5 hover:underline"
                        >
                          {isExpanded ? 'Voir moins' : 'Voir la description complète'}
                        </button>
                      )}

                      <div className="flex flex-wrap gap-2 mb-6">
                        {project.technologies.map((tech) => (
                          <span
                            key={tech}
                            className="px-3 py-1 glass-effect text-xs font-medium rounded-full text-gray-300"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>

                      <div className="mt-auto grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {project.githuburl && (
                          <a
                            href={project.githuburl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-3 bg-white/10 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-white/15 transition-colors"
                          >
                            <Code2 size={17} />
                            Code
                          </a>
                        )}

                        {project.liveurl && (
                          <a
                            href={project.liveurl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-3 bg-primary/20 text-primary rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-primary/30 transition-colors"
                          >
                            <ExternalLink size={17} />
                            Live
                          </a>
                        )}

                        {project.demourl && (
                          <a
                            href={project.demourl}
                            target="_blank"
                            rel="noreferrer"
                            className={`px-4 py-3 bg-gradient-to-r ${project.color} text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity`}
                          >
                            <Eye size={17} />
                            Démo
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="glass-effect-dark p-12 rounded-3xl text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />

            <div className="relative z-10">
              <Brain className="w-16 h-16 mx-auto mb-6 text-primary" />

              <h2 className="text-3xl lg:text-4xl font-bold mb-6">
                <span className="gradient-text">Intégrez l&apos;IA dans vos projets</span>
              </h2>

              <p className="text-xl text-gray-300 mb-8">
                Besoin d&apos;une solution d&apos;intelligence artificielle personnalisée ?
                Discutons de votre projet et créons ensemble quelque chose d&apos;innovant.
              </p>

              <div className="flex flex-wrap gap-4 justify-center">
                <motion.a
                  href="/contact"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white shadow-lg neon-glow"
                >
                  Commencer un projet IA
                </motion.a>

                <motion.a
                  href="/projects"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 glass-effect rounded-full font-semibold text-white border border-white/20"
                >
                  Voir tous les projets
                </motion.a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </motion.div>
  )
}

export default AILabPage