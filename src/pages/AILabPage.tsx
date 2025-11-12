import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Sparkles, Zap, Code, Database, MessageSquare, Image as ImageIcon, FileText, TrendingUp } from 'lucide-react'

const AILabPage: React.FC = () => {
  const [activeDemo, setActiveDemo] = useState<string | null>(null)

  const aiProjects = [
    {
      id: 'chatbot',
      icon: MessageSquare,
      title: 'Chatbot IA Multilingue',
      description: 'Assistant conversationnel intelligent supportant plusieurs langues africaines',
      technologies: ['GPT-4', 'Python', 'FastAPI', 'TensorFlow'],
      color: 'from-blue-500 to-cyan-500',
      demoAvailable: true
    },
    {
      id: 'image-recognition',
      icon: ImageIcon,
      title: 'Reconnaissance d\'Images',
      description: 'Système de classification et détection d\'objets en temps réel',
      technologies: ['PyTorch', 'YOLO', 'OpenCV', 'React'],
      color: 'from-purple-500 to-pink-500',
      demoAvailable: true
    },
    {
      id: 'text-analysis',
      icon: FileText,
      title: 'Analyse de Sentiments',
      description: 'Analyse automatique des sentiments dans les textes et avis clients',
      technologies: ['BERT', 'Transformers', 'scikit-learn', 'Flask'],
      color: 'from-green-500 to-emerald-500',
      demoAvailable: true
    },
    {
      id: 'data-prediction',
      icon: TrendingUp,
      title: 'Prédiction de Données',
      description: 'Modèles de machine learning pour la prédiction et l\'optimisation',
      technologies: ['XGBoost', 'LightGBM', 'Pandas', 'Plotly'],
      color: 'from-orange-500 to-red-500',
      demoAvailable: true
    }
  ]

  const capabilities = [
    {
      icon: Brain,
      title: 'Deep Learning',
      description: 'Réseaux de neurones profonds pour des tâches complexes'
    },
    {
      icon: Code,
      title: 'NLP Avancé',
      description: 'Traitement du langage naturel et compréhension contextuelle'
    },
    {
      icon: Database,
      title: 'Big Data',
      description: 'Traitement et analyse de grandes quantités de données'
    },
    {
      icon: Zap,
      title: 'Real-time AI',
      description: 'Inférence en temps réel pour applications critiques'
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-32 pb-20"
    >
      {/* Hero Section */}
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
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
            >
              <Brain size={40} className="text-white" />
            </motion.div>
            <h1 className="text-5xl lg:text-7xl font-bold mb-6">
              <span className="gradient-text">IA Laboratory</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Explorez mes projets d'intelligence artificielle et de machine learning. 
              Des solutions innovantes utilisant les dernières avancées en IA.
            </p>
            <div className="flex gap-4 justify-center">
              <Sparkles className="text-primary animate-pulse" size={24} />
              <Sparkles className="text-secondary animate-pulse" size={24} style={{ animationDelay: '0.5s' }} />
              <Sparkles className="text-accent animate-pulse" size={24} style={{ animationDelay: '1s' }} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Capabilities Grid */}
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
              Technologies et domaines d'expertise en intelligence artificielle
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map((capability, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="glass-effect p-6 rounded-2xl text-center hover-lift"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <capability.icon className="text-white" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{capability.title}</h3>
                <p className="text-gray-400">{capability.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Projects Gallery */}
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
              Découvrez mes projets d'intelligence artificielle avec démos interactives
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {aiProjects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="glass-effect-dark rounded-2xl overflow-hidden hover-lift"
              >
                <div className={`h-2 bg-gradient-to-r ${project.color}`} />
                <div className="p-8">
                  <div className={`w-16 h-16 mb-6 rounded-xl bg-gradient-to-br ${project.color} flex items-center justify-center`}>
                    <project.icon className="text-white" size={32} />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-3">{project.title}</h3>
                  <p className="text-gray-400 mb-6">{project.description}</p>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {project.technologies.map((tech, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 glass-effect text-xs font-medium rounded-full text-gray-300"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>

                  {project.demoAvailable && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActiveDemo(activeDemo === project.id ? null : project.id)}
                      className={`w-full py-3 rounded-xl font-semibold transition-all ${
                        activeDemo === project.id
                          ? 'bg-white/10 text-white'
                          : `bg-gradient-to-r ${project.color} text-white`
                      }`}
                    >
                      {activeDemo === project.id ? 'Fermer la démo' : 'Voir la démo'}
                    </motion.button>
                  )}

                  {/* Demo Area */}
                  {activeDemo === project.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 p-6 glass-effect rounded-xl"
                    >
                      <p className="text-gray-300 text-center">
                        <Sparkles className="inline mr-2" size={20} />
                        Démo interactive à venir...
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
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
                <span className="gradient-text">Intégrez l'IA dans vos projets</span>
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                Besoin d'une solution d'intelligence artificielle personnalisée ? 
                Discutons de votre projet et créons ensemble quelque chose d'innovant.
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