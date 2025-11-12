import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from "lucide-react"

import { ExternalLink, Github, Filter, Globe, Smartphone, Brain, Database, Code, Star, Calendar } from 'lucide-react'
import type {  Project } from '../lib/supabase'
import  { fetchProjects } from '../lib/supabase'

const ProjectsGallery: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  const categories = [
    { id: 'all', name: 'Tous', icon: Filter, color: 'from-gray-600 to-gray-700' },
    { id: 'web', name: 'Web', icon: Globe, color: 'from-blue-500 to-blue-600' },
    { id: 'mobile', name: 'Mobile', icon: Smartphone, color: 'from-green-500 to-green-600' },
    { id: 'ai', name: 'IA', icon: Brain, color: 'from-purple-500 to-purple-600' },
    { id: 'data', name: 'Data', icon: Database, color: 'from-orange-500 to-orange-600' },
  ]

  // Projets statiques pour démonstration
  const staticProjects: Project[] = [
    {
      id: '1',
      title: 'INP-HB Stories',
      description: 'Plateforme de témoignages pour les alumni de l\'INP-HB avec interactions en temps réel via Socket.IO',
      technologies: ['React', 'TypeScript', 'Node.js', 'MongoDB', 'Socket.IO', 'Framer Motion'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      liveurl: 'https://inphb-stories.vercel.app',
      category: 'web',
      featured: true,
      createdat: '2024-11-01',
      updatedat: '2024-11-01'
    },
    {
      id: '2',
      title: 'ImmoCI',
      description: 'Plateforme immobilière pour la Côte d\'Ivoire connectant propriétaires et locataires sans frais d\'agence',
      technologies: ['React', 'TypeScript', 'Supabase', 'Tailwind CSS', 'Mapbox'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      liveurl: 'https://immoci.com',
      category: 'web',
      featured: true,
      createdat: '2024-10-15',
      updatedat: '2024-10-15'
    },
    {
      id: '3',
      title: 'Video Translator Extension',
      description: 'Extension Chrome pour la traduction en temps réel de vidéos avec Google Cloud APIs',
      technologies: ['JavaScript', 'Chrome APIs', 'Google Cloud', 'Web Audio API'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      category: 'web',
      featured: false,
      createdat: '2024-09-20',
      updatedat: '2024-09-20'
    },
    {
      id: '4',
      title: 'AfriConnect',
      description: 'Réseau social conçu pour les communautés africaines avec messagerie temps réel',
      technologies: ['Flutter', 'Firebase', 'Socket.IO', 'Node.js'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      category: 'mobile',
      featured: true,
      createdat: '2024-08-10',
      updatedat: '2024-08-10'
    },
    {
      id: '5',
      title: 'AI Certification Assistant',
      description: 'Agent IA pour aider les étudiants à obtenir des certifications avec un taux de réussite optimisé',
      technologies: ['Python', 'TensorFlow', 'FastAPI', 'React'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      liveurl: 'https://ai-cert.com',
      category: 'ai',
      featured: true,
      createdat: '2024-07-05',
      updatedat: '2024-07-05'
    },
    {
      id: '6',
      title: 'Telemedicine Chat',
      description: 'Application de télémédecine avec chat sécurisé pour consultations médicales',
      technologies: ['Flutter', 'WebRTC', 'Node.js', 'MongoDB'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      category: 'mobile',
      featured: false,
      createdat: '2024-06-15',
      updatedat: '2024-06-15'
    },
    {
      id: '7',
      title: 'Industrial Data Dashboard',
      description: 'Tableau de bord d\'analyse de données industrielles avec visualisations en temps réel',
      technologies: ['Python', 'Pandas', 'Plotly', 'Dash', 'PostgreSQL'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      category: 'data',
      featured: true,
      createdat: '2024-05-20',
      updatedat: '2024-05-20'
    },
    {
      id: '8',
      title: 'Smart Server Solution',
      description: 'Solution serveur local pour PME avec sauvegardes automatiques et détection de vol',
      technologies: ['Node.js', 'Express', 'React', 'Docker', 'Redis'],
      imageurl: '/api/placeholder/800/600',
      githuburl: 'https://github.com',
      category: 'web',
      featured: false,
      createdat: '2024-04-10',
      updatedat: '2024-04-10'
    }
  ]

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    filterProjects()
  }, [selectedCategory, projects])

  const loadProjects = async () => {
    try {
      // Essayer de charger depuis Supabase
      const data = await fetchProjects()
      if (data && data.length > 0) {
        setProjects(data)
      } else {
        // Utiliser les projets statiques si pas de données
        setProjects(staticProjects)
      }
    } catch (error) {
      console.error('Error loading projects:', error)
      // Utiliser les projets statiques en cas d'erreur
      setProjects(staticProjects)
    } finally {
      setIsLoading(false)
    }
  }

  const filterProjects = () => {
    if (selectedCategory === 'all') {
      setFilteredProjects(projects)
    } else {
      setFilteredProjects(projects.filter(p => p.category === selectedCategory))
    }
  }

  return (
    <section className="py-20 px-6 relative overflow-hidden">
      {/* Background animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark via-slate-900 to-dark opacity-50" />
      
      <div className="container mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-5xl lg:text-6xl font-bold mb-4">
            <span className="gradient-text">Mes Projets</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Une collection de mes réalisations en développement web, mobile, IA et analyse de données
          </p>
        </motion.div>

        {/* Filtres de catégories */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-4 mb-12"
        >
          {categories.map((category) => {
            const Icon = category.icon
            return (
              <motion.button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 ${
                  selectedCategory === category.id
                    ? `bg-gradient-to-r ${category.color} text-white shadow-lg scale-105`
                    : 'glass-effect text-gray-300 hover:text-white hover:scale-105'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Icon size={20} />
                <span>{category.name}</span>
              </motion.button>
            )
          })}
        </motion.div>

        {/* Grille de projets */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="loader" />
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project, index) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="group relative"
                  onClick={() => setSelectedProject(project)}
                >
                  <div className="glass-effect rounded-2xl overflow-hidden hover-lift cursor-pointer">
                    {/* Image du projet */}
                    <div className="relative h-64 overflow-hidden">
                      <img
                        src={project.imageurl}
                        alt={project.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-dark via-transparent to-transparent opacity-60" />
                      
                      {/* Badge Featured */}
                      {project.featured && (
                        <motion.div
                          initial={{ x: -100 }}
                          animate={{ x: 0 }}
                          className="absolute top-4 left-4"
                        >
                          <span className="px-3 py-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                            <Star size={14} />
                            Featured
                          </span>
                        </motion.div>
                      )}

                      {/* Actions rapides */}
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {project.githuburl && (
                          <motion.a
                            href={project.githuburl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 glass-effect rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                            whileHover={{ rotate: 360 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Github size={18} />
                          </motion.a>
                        )}
                        {project.liveurl && (
                          <motion.a
                            href={project.liveurl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 glass-effect rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                            whileHover={{ rotate: 360 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={18} />
                          </motion.a>
                        )}
                      </div>
                    </div>

                    {/* Contenu */}
                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-2 gradient-text">
                        {project.title}
                      </h3>
                      <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                        {project.description}
                      </p>

                      {/* Technologies */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {project.technologies.slice(0, 4).map((tech) => (
                          <span
                            key={tech}
                            className="px-3 py-1 glass-effect text-xs font-medium rounded-full"
                          >
                            {tech}
                          </span>
                        ))}
                        {project.technologies.length > 4 && (
                          <span className="px-3 py-1 text-xs text-gray-500">
                            +{project.technologies.length - 4}
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(project.createdat).toLocaleDateString('fr-FR', { 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Code size={14} />
                          {project.category}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Message si aucun projet */}
        {!isLoading && filteredProjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <p className="text-xl text-gray-400">
              Aucun projet trouvé dans cette catégorie.
            </p>
          </motion.div>
        )}
      </div>

      {/* Modal détail projet */}
      <AnimatePresence>
        {selectedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            onClick={() => setSelectedProject(null)}
          >
            <div className="absolute inset-0 bg-dark/90 backdrop-blur-xl" />
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative max-w-4xl w-full glass-effect-dark rounded-3xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header avec image */}
              <div className="relative h-80">
                <img
                  src={selectedProject.imageurl}
                  alt={selectedProject.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/50 to-transparent" />
                <button
                  onClick={() => setSelectedProject(null)}
                  className="absolute top-4 right-4 w-10 h-10 glass-effect rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Contenu */}
              <div className="p-8">
                <h3 className="text-3xl font-bold mb-4 gradient-text">
                  {selectedProject.title}
                </h3>
                <p className="text-gray-300 mb-6 text-lg">
                  {selectedProject.description}
                </p>

                {/* Technologies détaillées */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold mb-3 text-white">Technologies utilisées</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedProject.technologies.map((tech) => (
                      <span
                        key={tech}
                        className="px-4 py-2 glass-effect rounded-full font-medium"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                  {selectedProject.githuburl && (
                    <motion.a
                      href={selectedProject.githuburl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 glass-effect rounded-full font-medium flex items-center gap-2 hover:bg-white/10 transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Github size={20} />
                      Code Source
                    </motion.a>
                  )}
                  {selectedProject.liveurl && (
                    <motion.a
                      href={selectedProject.liveurl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-full font-medium flex items-center gap-2"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ExternalLink size={20} />
                      Voir le projet
                    </motion.a>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export default ProjectsGallery