import React, { useState, useEffect } from 'react'
import type { LucideIcon } from "lucide-react"
import { motion, useInView } from 'framer-motion'
import { Database, Brain, Smartphone, Globe, Server, Terminal } from 'lucide-react'
import { fetchSkills } from '../lib/supabase'
import type { Skill } from '../lib/supabase'



interface SkillCategory {
  name: string
  icon: LucideIcon
  color: string
  skills: SkillItem[]
}

interface SkillItem {
  name: string
  level: number
  icon?: string
}

const Skills: React.FC = () => {
  const [_skills, setSkills] = useState<Skill[]>([])
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null)
  const ref = React.useRef(null)
  const isInView = useInView(ref, { once: true })

  // Compétences statiques organisées par catégorie
  const skillCategories: SkillCategory[] = [
    {
      name: 'Frontend',
      icon: Globe,
      color: 'from-blue-500 to-cyan-500',
      skills: [
        { name: 'React', level: 95 },
        { name: 'TypeScript', level: 90 },
        { name: 'Vue.js', level: 85 },
        { name: 'Next.js', level: 88 },
        { name: 'Tailwind CSS', level: 92 },
        { name: 'Framer Motion', level: 87 },
      ]
    },
    {
      name: 'Backend',
      icon: Server,
      color: 'from-green-500 to-emerald-500',
      skills: [
        { name: 'Node.js', level: 93 },
        { name: 'Express', level: 90 },
        { name: 'Python', level: 88 },
        { name: 'FastAPI', level: 85 },
        { name: 'Django', level: 82 },
        { name: 'GraphQL', level: 80 },
      ]
    },
    {
      name: 'Mobile',
      icon: Smartphone,
      color: 'from-purple-500 to-pink-500',
      skills: [
        { name: 'Flutter', level: 91 },
        { name: 'React Native', level: 88 },
        { name: 'Dart', level: 90 },
        { name: 'iOS/Swift', level: 75 },
        { name: 'Android/Kotlin', level: 78 },
      ]
    },
    {
      name: 'IA & Data',
      icon: Brain,
      color: 'from-orange-500 to-red-500',
      skills: [
        { name: 'TensorFlow', level: 85 },
        { name: 'PyTorch', level: 82 },
        { name: 'Pandas', level: 90 },
        { name: 'NumPy', level: 88 },
        { name: 'Scikit-learn', level: 87 },
        { name: 'OpenAI APIs', level: 92 },
      ]
    },
    {
      name: 'Database',
      icon: Database,
      color: 'from-indigo-500 to-purple-500',
      skills: [
        { name: 'PostgreSQL', level: 89 },
        { name: 'MongoDB', level: 91 },
        { name: 'Redis', level: 84 },
        { name: 'Supabase', level: 93 },
        { name: 'Firebase', level: 90 },
        { name: 'Prisma', level: 86 },
      ]
    },
    {
      name: 'DevOps & Tools',
      icon: Terminal,
      color: 'from-gray-600 to-gray-800',
      skills: [
        { name: 'Docker', level: 86 },
        { name: 'Git', level: 94 },
        { name: 'CI/CD', level: 83 },
        { name: 'AWS', level: 80 },
        { name: 'Vercel', level: 92 },
        { name: 'Linux', level: 88 },
      ]
    }
  ]

  useEffect(() => {
    loadSkills()
  }, [])

  const loadSkills = async () => {
    try {
      const data = await fetchSkills()
      if (data && data.length > 0) {
        setSkills(data)
      }
    } catch (error) {
      console.error('Error loading skills:', error)
    }
  }

  return (
    <section ref={ref} className="py-20 px-6 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-dark via-slate-900 to-dark opacity-50" />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      <div className="container mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-5xl lg:text-6xl font-bold mb-4">
            <span className="gradient-text">Mes Compétences</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Un ensemble diversifié de compétences techniques acquises à travers des projets réels et une formation continue
          </p>
        </motion.div>

        {/* Skills Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {skillCategories.map((category, categoryIndex) => {
            const Icon = category.icon
            return (
              <motion.div
                key={category.name}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: categoryIndex * 0.1 }}
                className="glass-effect rounded-2xl p-6 hover-lift"
              >
                {/* Category Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center`}>
                    <Icon size={24} className="text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{category.name}</h3>
                </div>

                {/* Skills List */}
                <div className="space-y-4">
                  {category.skills.map((skill, skillIndex) => (
                    <motion.div
                      key={skill.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ duration: 0.5, delay: categoryIndex * 0.1 + skillIndex * 0.05 }}
                      onMouseEnter={() => setHoveredSkill(`${category.name}-${skill.name}`)}
                      onMouseLeave={() => setHoveredSkill(null)}
                    >
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium text-gray-300">{skill.name}</span>
                        <motion.span
                          className="text-sm font-bold gradient-text"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: categoryIndex * 0.1 + skillIndex * 0.05 + 0.3 }}
                        >
                          {skill.level}%
                        </motion.span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className={`absolute top-0 left-0 h-full bg-gradient-to-r ${category.color} rounded-full`}
                          initial={{ width: 0 }}
                          animate={isInView ? { width: `${skill.level}%` } : {}}
                          transition={{
                            duration: 1,
                            delay: categoryIndex * 0.1 + skillIndex * 0.05,
                            ease: "easeOut"
                          }}
                        >
                          {/* Glow effect on hover */}
                          {hoveredSkill === `${category.name}-${skill.name}` && (
                            <motion.div
                              className="absolute inset-0 bg-white/30"
                              initial={{ x: '-100%' }}
                              animate={{ x: '100%' }}
                              transition={{ duration: 0.5 }}
                            />
                          )}
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Additional Skills Cloud */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16"
        >
          <h3 className="text-2xl font-bold text-center mb-8 text-white">
            Autres Compétences & Outils
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              'Figma', 'Adobe XD', 'Postman', 'Jest', 'Cypress', 'Webpack', 
              'Vite', 'ESLint', 'Prettier', 'Jira', 'Notion', 'Slack',
              'Three.js', 'GSAP', 'Socket.IO', 'WebRTC', 'PWA', 'SEO'
            ].map((tool, index) => (
              <motion.span
                key={tool}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.3, delay: 0.8 + index * 0.02 }}
                whileHover={{ scale: 1.1 }}
                className="px-4 py-2 glass-effect rounded-full text-sm font-medium text-gray-300 hover:text-white hover:border-primary/50 transition-all cursor-pointer"
              >
                {tool}
              </motion.span>
            ))}
          </div>
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 1 }}
          className="text-center mt-16"
        >
          <p className="text-lg text-gray-400 mb-6">
            Toujours en apprentissage et à la recherche de nouveaux défis techniques
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white shadow-lg neon-glow"
          >
            Discutons de votre projet
          </motion.button>
        </motion.div>
      </div>
    </section>
  )
}

export default Skills