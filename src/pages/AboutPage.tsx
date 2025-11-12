import React from 'react'
import { motion } from 'framer-motion'
import { Award, Briefcase, Code, GraduationCap, Heart, Lightbulb, Rocket, Users } from 'lucide-react'
import adjoumaniPhoto from "../assets/adjoumani.jpg"

const AboutPage: React.FC = () => {
  const achievements = [
    { icon: Award, value: '20+', label: 'Projets Réalisés' },
    { icon: Users, value: '15+', label: 'Clients Satisfaits' },
    { icon: Code, value: '50K+', label: 'Lignes de Code' },
    { icon: Rocket, value: '3', label: 'Ans d\'Expérience' },
  ]

  const values = [
    {
      icon: Lightbulb,
      title: 'Innovation',
      description: 'Toujours à la recherche de nouvelles technologies et approches pour créer des solutions uniques.',
      color: 'from-yellow-500 to-orange-500'
    },
    {
      icon: Heart,
      title: 'Passion',
      description: 'Animé par une passion profonde pour le développement et la résolution de problèmes complexes.',
      color: 'from-red-500 to-pink-500'
    },
    {
      icon: Users,
      title: 'Collaboration',
      description: 'Travail d\'équipe efficace et communication claire pour des résultats exceptionnels.',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      icon: Rocket,
      title: 'Excellence',
      description: 'Engagement envers la qualité et l\'amélioration continue dans chaque projet.',
      color: 'from-purple-500 to-indigo-500'
    },
  ]

  const timeline = [
    {
      year: '2024',
      title: 'Développeur Full Stack Freelance',
      company: 'Les Experts en Solutions Digitales (LESD)',
      description: 'Création de solutions web et mobile innovantes pour divers clients en Côte d\'Ivoire.',
      achievements: [
        'Développement d\'ImmoCI - plateforme immobilière',
        'Création d\'INP-HB Stories - réseau alumni',
        'Implémentation de solutions IA personnalisées'
      ]
    },
    {
      year: '2023',
      title: 'Projets Académiques & Personnels',
      company: 'INP-HB',
      description: 'Développement de projets innovants combinant IA, data analytics et applications web/mobile.',
      achievements: [
        'AfriConnect - Réseau social africain',
        'Extension Chrome de traduction vidéo',
        'Applications de télémédecine'
      ]
    },
    {
      year: '2022',
      title: 'Début du Parcours',
      company: 'INP-HB - Yamoussoukro',
      description: 'Intégration à l\'Institut National Polytechnique Houphouët-Boigny en analyse de données industrielles.',
      achievements: [
        'Apprentissage des fondamentaux',
        'Premiers projets de développement',
        'Certifications en IA et développement'
      ]
    },
  ]

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
        <div className="container mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="text-5xl lg:text-7xl font-bold mb-6">
                <span className="gradient-text">À propos de moi</span>
              </h1>
              <p className="text-xl text-gray-300 mb-6 leading-relaxed">
                Je suis <strong className="text-white">Koffi Wilfried ADJOUMANI</strong>, étudiant en 3ème année d'analyse 
                de données industrielles à l'<strong className="text-white">INP-HB</strong> de Yamoussoukro. 
                Passionné par la technologie et l'innovation, je me spécialise dans le développement de 
                solutions digitales complètes.
              </p>
              <p className="text-lg text-gray-400 mb-8 leading-relaxed">
                Mon expertise couvre le <strong className="text-white">développement web</strong> avec React 
                et Node.js, le <strong className="text-white">développement mobile</strong> avec Flutter, 
                l'<strong className="text-white">intelligence artificielle</strong>, et l'
                <strong className="text-white">analyse de données</strong>. Je travaille souvent en collaboration 
                avec mon frère au sein de notre entreprise de solutions digitales.
              </p>
              <div className="flex gap-4">
                <motion.a
                  href="/contact"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white"
                >
                  Me contacter
                </motion.a>
                <motion.a
                  href="/cv"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 glass-effect rounded-full font-semibold text-white border border-white/20"
                >
                  Voir mon CV
                </motion.a>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative w-full h-[600px] rounded-3xl overflow-hidden">
                <img
                  src={adjoumaniPhoto}  //"/api/placeholder/600/800"
                  alt="Adjoumani"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-dark via-transparent to-transparent" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Achievements Stats */}
      <section className="py-20 px-6">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {achievements.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="glass-effect p-8 rounded-2xl text-center hover-lift"
              >
                <item.icon className="w-12 h-12 mx-auto mb-4 text-primary" />
                <h3 className="text-4xl font-bold gradient-text mb-2">{item.value}</h3>
                <p className="text-gray-400">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-transparent" />
        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              <span className="gradient-text">Mes Valeurs</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Les principes qui guident mon travail et mes projets
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="glass-effect p-6 rounded-2xl hover-lift"
              >
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${value.color} flex items-center justify-center mb-4`}>
                  <value.icon className="text-white" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{value.title}</h3>
                <p className="text-gray-400">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              <span className="gradient-text">Mon Parcours</span>
            </h2>
            <p className="text-xl text-gray-400">
              Une chronologie de mes expériences et réalisations
            </p>
          </motion.div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-secondary to-accent" />

            {timeline.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="relative pl-20 pb-12"
              >
                {/* Timeline dot */}
                <div className="absolute left-5 top-0 w-6 h-6 rounded-full bg-gradient-to-r from-primary to-secondary border-4 border-dark" />

                <div className="glass-effect p-6 rounded-2xl hover-lift">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-4 py-1 bg-gradient-to-r from-primary to-secondary text-white text-sm font-bold rounded-full">
                      {item.year}
                    </span>
                    <Briefcase size={20} className="text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-primary font-semibold mb-3">{item.company}</p>
                  <p className="text-gray-400 mb-4">{item.description}</p>
                  <ul className="space-y-2">
                    {item.achievements.map((achievement, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-300">
                        <span className="text-primary mt-1">•</span>
                        {achievement}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Education Section */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />
        <div className="container mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">
              <span className="gradient-text">Formation</span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto glass-effect p-8 rounded-2xl"
          >
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                <GraduationCap className="text-white" size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Analyse de Données Industrielles
                </h3>
                <p className="text-primary font-semibold mb-3">
                  Institut National Polytechnique Houphouët-Boigny (INP-HB)
                </p>
                <p className="text-gray-400 mb-4">
                  2022 - Présent • San-Pedro, Côte d'Ivoire
                </p>
                <p className="text-gray-300">
                  Formation approfondie en analyse de données, statistiques, machine learning, 
                  et systèmes industriels. Développement de compétences en programmation, 
                  bases de données, et visualisation de données.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </motion.div>
  )
}

export default AboutPage