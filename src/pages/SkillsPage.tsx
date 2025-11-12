import React from 'react'
import { motion } from 'framer-motion'
import Skills from '../components/Skills'

const SkillsPage: React.FC = () => {
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
              <span className="gradient-text">Compétences Techniques</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Un ensemble diversifié de compétences acquises à travers l'apprentissage 
              continu et la réalisation de projets réels
            </p>
          </motion.div>
        </div>
      </section>

      {/* Skills Component */}
      <Skills />
    </motion.div>
  )
}

export default SkillsPage