import React from 'react'
import { motion } from 'framer-motion'
import ProjectsGallery from '../components/ProjectsGallery'

const ProjectsPage: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-32"
    >
      {/* Hero Section */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />
        <div className="container mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl lg:text-7xl font-bold mb-6">
              <span className="gradient-text">Mes Projets</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Découvrez mon portfolio de projets innovants couvrant le développement web, 
              mobile, l'intelligence artificielle et l'analyse de données
            </p>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-block px-6 py-3 glass-effect rounded-full"
            >
              <p className="text-gray-400">
                <span className="font-bold gradient-text text-2xl">20+</span> projets réalisés
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Projects Gallery */}
      <ProjectsGallery />

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="glass-effect p-12 rounded-3xl text-center"
          >
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">
              <span className="gradient-text">Vous avez un projet en tête ?</span>
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Parlons de votre idée et créons ensemble quelque chose d'exceptionnel
            </p>
            <motion.a
              href="/contact"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-block px-10 py-5 bg-gradient-to-r from-primary to-secondary rounded-full font-bold text-white text-lg shadow-2xl neon-glow"
            >
              Démarrer une collaboration
            </motion.a>
          </motion.div>
        </div>
      </section>
    </motion.div>
  )
}

export default ProjectsPage