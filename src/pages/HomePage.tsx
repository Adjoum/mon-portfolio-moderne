import React from 'react'
import { useEffect, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Variants } from 'framer-motion'
import Hero from '../components/Hero'
import ProjectsGallery from '../components/ProjectsGallery'
import Skills from '../components/Skills'

import { supabase } from '../lib/supabase'


/* ─────────────────────────────────────────
   Variants réutilisables
───────────────────────────────────────── */
const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 40 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay: i * 0.12,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    }
  }),
}

const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
}

/* ─────────────────────────────────────────
   Décoration de fond animée (particules)
───────────────────────────────────────── */
const FloatingOrb: React.FC<{
  size: number; x: string; y: string;
  color: string; delay?: number; duration?: number
}> = ({ size, x, y, color, delay = 0, duration = 8 }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      width: size, height: size,
      left: x, top: y,
      background: color,
      filter: 'blur(60px)',
      opacity: 0.18,
    }}
    animate={{ y: [0, -30, 0], scale: [1, 1.1, 1] }}
    transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
  />
)

/* ─────────────────────────────────────────
   HomePage
───────────────────────────────────────── */
const HomePage: React.FC = () => {
  const { scrollY } = useScroll()
  // Parallax subtil sur le CTA
  const ctaBgY = useTransform(scrollY, [0, 800], [0, -60])

  
const [displayCount, setDisplayCount] = useState(0)
const [totalVisits, setTotalVisits] = useState(0)

useEffect(() => {
  supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .then(({ count }) => setTotalVisits(count || 0))
}, [])

// Animation compteur
useEffect(() => {
  if(totalVisits === 0) return
  let start = 0
  const duration = 2500
  const step = totalVisits / (duration / 16)
  const timer = setInterval(() => {
    start += step
    if(start >= totalVisits) {
      setDisplayCount(totalVisits)
      clearInterval(timer)
    } else {
      setDisplayCount(Math.floor(start))
    }
  }, 16)
  return () => clearInterval(timer)
}, [totalVisits])

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      variants={fadeIn}
      className="relative overflow-x-hidden"
    >
      {/* ── Hero ── */}
      <Hero />

      {/* ════════════════════════════════════════
          SECTION — PROJETS EN VEDETTE
      ════════════════════════════════════════ */}
      <section className="relative py-16 sm:py-20 lg:py-28 px-4 sm:px-6">

        {/* Orbs de fond */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <FloatingOrb size={400} x="70%"  y="0%"   color="radial-gradient(circle, #6c63ff, transparent)" delay={0}   duration={9} />
          <FloatingOrb size={300} x="-5%"  y="40%"  color="radial-gradient(circle, #ff6b9d, transparent)" delay={2}   duration={11} />
          <FloatingOrb size={250} x="50%"  y="60%"  color="radial-gradient(circle, #06d6a0, transparent)" delay={4}   duration={7} />
        </div>

        <div className="container mx-auto relative z-10">

          {/* En-tête section */}
          <motion.div
            variants={fadeUp}
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="text-center mb-10 sm:mb-14 lg:mb-16 px-2"
          >
            {/* Pill badge */}
            <motion.span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold mb-5
                         bg-white/5 border border-white/10 text-gray-300 backdrop-blur-sm"
              whileHover={{ scale: 1.05 }}
            >
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Disponible pour des projets
            </motion.span>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold mb-4 leading-tight">
              <span className="gradient-text">Projets en vedette</span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-xl mx-auto leading-relaxed">
              Une sélection de mes réalisations récentes en web, mobile et IA
            </p>
          </motion.div>

          {/* Galerie */}
          <motion.div
            variants={fadeUp}
            custom={1}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
          >
            <ProjectsGallery limit={3} showFilters={false} showHeader={false} />
          </motion.div>

          {/* CTA voir tous */}
          <motion.div
            variants={fadeUp}
            custom={2}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mt-10 sm:mt-14"
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-3.5 sm:py-4
                           glass-effect rounded-full font-semibold text-sm sm:text-base text-white
                           hover:bg-white/10 transition-colors group border border-white/10"
              >
                Voir tous mes projets
                <motion.span
                  className="flex items-center"
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SECTION — COMPÉTENCES
      ════════════════════════════════════════ */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        variants={fadeIn}
        viewport={{ once: true, margin: '-100px' }}
      >
        <Skills />
      </motion.div>

      {/* ════════════════════════════════════════
          SECTION — CALL TO ACTION
      ════════════════════════════════════════ */}
      <section className="relative py-24 sm:py-32 lg:py-40 px-4 sm:px-6 overflow-hidden">

        {/* Fond avec parallax */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ y: ctaBgY }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-secondary/20 to-accent/20" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_0%,rgba(10,10,20,0.85)_100%)]" />
          {/* Grille décorative */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(#fff 1px, transparent 1px),
                                linear-gradient(90deg, #fff 1px, transparent 1px)`,
              backgroundSize: '48px 48px',
            }}
          />
        </motion.div>

        {/* Orbs CTA */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <FloatingOrb size={500} x="10%"  y="20%"  color="radial-gradient(circle, #6c63ff, transparent)" delay={0} duration={10} />
          <FloatingOrb size={400} x="60%"  y="30%"  color="radial-gradient(circle, #ff6b9d, transparent)" delay={3} duration={12} />
        </div>

        <div className="container mx-auto relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="text-center max-w-3xl mx-auto"
          >
            {/* Titre animé lettre par lettre sur desktop, simple sur mobile */}
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold mb-5 sm:mb-8 leading-tight"
            >
              <span className="gradient-text">Prêt à collaborer ?</span>
            </motion.h2>

            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-base sm:text-lg lg:text-xl text-gray-300 mb-10 sm:mb-14 leading-relaxed px-2"
            >
              Transformons ensemble vos idées en solutions digitales innovantes.<br className="hidden sm:block" />
              Basé en Côte d'Ivoire, disponible partout dans le monde.
            </motion.p>

            {/* Boutons — stack sur mobile, row sur sm+ */}
            <motion.div
              variants={fadeUp}
              custom={2}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              <motion.div
                whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(108,99,255,0.4)' }}
                whileTap={{ scale: 0.97 }}
                className="w-full sm:w-auto"
              >
                <Link
                  to="/contact"
                  className="flex items-center justify-center gap-2 w-full sm:w-auto
                             px-8 sm:px-10 py-4 sm:py-5
                             bg-gradient-to-r from-primary to-secondary
                             rounded-full font-bold text-white text-base sm:text-lg
                             shadow-2xl neon-glow transition-all"
                >
                  Démarrer un projet
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                className="w-full sm:w-auto"
              >
                <Link
                  to="/cv"
                  className="flex items-center justify-center gap-2 w-full sm:w-auto
                             px-8 sm:px-10 py-4 sm:py-5
                             glass-effect rounded-full font-bold text-white
                             text-base sm:text-lg border border-white/20
                             hover:bg-white/10 transition-all"
                >
                  Télécharger mon CV
                </Link>
              </motion.div>
            </motion.div>

            {/* Stats rapides — masquées sur xs */}
            {/*<motion.div
              variants={fadeUp}
              custom={3}
              className="hidden sm:grid grid-cols-3 gap-6 mt-16 max-w-lg mx-auto"
            >
              {[
                { value: '10+', label: 'Projets livrés' },
                { value: '3+', label: 'Ans d\'expérience' },
                { value: '100%', label: 'Satisfaction client' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl lg:text-3xl font-bold gradient-text">{stat.value}</div>
                  <div className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>  */}
            {/* Stats rapides + compteur visiteurs */}
            <motion.div
              variants={fadeUp}
              custom={3}
              className="hidden sm:grid grid-cols-4 gap-6 mt-16 max-w-2xl mx-auto"
            >
              {[
                { value: '10+',  label: 'Projets livrés' },
                { value: '3+',   label: "Ans d'expérience" },
                { value: '100%', label: 'Satisfaction client' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl lg:text-3xl font-bold gradient-text">{stat.value}</div>
                  <div className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</div>
                </div>
              ))}

              {/* Compteur visiteurs live */}
              <div className="text-center">
                <div className="relative inline-block">
                  {/* Halo animé */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/20 blur-lg"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                  <div className="relative text-2xl lg:text-3xl font-bold gradient-text tabular-nums">
                    {displayCount.toLocaleString('fr-FR')}
                  </div>
                </div>
                <div className="text-xs sm:text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                  Visiteurs
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </motion.div>
  )
}

export default HomePage



















// import React from 'react'
// import { motion } from 'framer-motion'
// import { ArrowRight } from 'lucide-react'
// import Hero from '../components/Hero'
// import ProjectsGallery from '../components/ProjectsGallery'
// import Skills from '../components/Skills'

// const HomePage: React.FC = () => {
//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       exit={{ opacity: 0 }}
//       transition={{ duration: 0.5 }}
//     >
//       <Hero />
      
//       {/* Section featured projects */}
//       <section className="py-20 px-6 relative">
//         <div className="container mx-auto">
//           <motion.div
//             initial={{ opacity: 0, y: 20 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.6 }}
//             viewport={{ once: true }}
//             className="text-center mb-16"
//           >
//             <h2 className="text-4xl lg:text-5xl font-bold mb-4">
//               <span className="gradient-text">Projets en vedette</span>
//             </h2>
//             <p className="text-xl text-gray-400 max-w-2xl mx-auto">
//               Découvrez une sélection de mes meilleurs projets récents
//             </p>
//           </motion.div>
//         </div>
        
//         {/* Afficher seulement les 3 derniers projets sans filtres ni header */}
//         <ProjectsGallery 
//           limit={3} 
//           showFilters={false} 
//           showHeader={false} 
//         />

//         {/* Bouton voir tous les projets */}
//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           whileInView={{ opacity: 1, y: 0 }}
//           transition={{ duration: 0.6, delay: 0.3 }}
//           viewport={{ once: true }}
//           className="text-center mt-12"
//         >
//           <motion.a
//             href="/projects"
//             whileHover={{ scale: 1.05 }}
//             whileTap={{ scale: 0.95 }}
//             className="inline-flex items-center gap-2 px-8 py-4 glass-effect rounded-full font-semibold text-white hover:bg-white/10 transition-colors group"
//           >
//             Voir tous mes projets
//             <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
//           </motion.a>
//         </motion.div>
//       </section>

//       {/* Section skills preview */}
//       <Skills />

//       {/* Call to action section */}
//       <section className="py-32 px-6 relative overflow-hidden">
//         <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20" />
//         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(15,23,42,0.8)_100%)]" />
        
//         <div className="container mx-auto relative z-10">
//           <motion.div
//             initial={{ opacity: 0, scale: 0.9 }}
//             whileInView={{ opacity: 1, scale: 1 }}
//             transition={{ duration: 0.8 }}
//             viewport={{ once: true }}
//             className="text-center"
//           >
//             <h2 className="text-4xl lg:text-6xl font-bold mb-8">
//               <span className="gradient-text">Prêt à collaborer ?</span>
//             </h2>
//             <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
//               Transformons ensemble vos idées en solutions digitales innovantes
//             </p>
//             <div className="flex flex-wrap gap-6 justify-center">
//               <motion.a
//                 href="/contact"
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 className="px-10 py-5 bg-gradient-to-r from-primary to-secondary rounded-full font-bold text-white text-lg shadow-2xl neon-glow"
//               >
//                 Démarrer un projet
//               </motion.a>
//               <motion.a
//                 href="/cv"
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 className="px-10 py-5 glass-effect rounded-full font-bold text-white text-lg border border-white/20"
//               >
//                 Télécharger mon CV
//               </motion.a>
//             </div>
//           </motion.div>
//         </div>
//       </section>
//     </motion.div>
//   )
// }

// export default HomePage












// import React from 'react'
// import { motion } from 'framer-motion'
// import Hero from '../components/Hero'
// import ProjectsGallery from '../components/ProjectsGallery'
// import Skills from '../components/Skills'

// const HomePage: React.FC = () => {
//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       exit={{ opacity: 0 }}
//       transition={{ duration: 0.5 }}
//     >
//       <Hero />
      
//       {/* Section featured projects */}
//       <section className="py-20 px-6 relative">
//         <div className="container mx-auto">
//           <motion.div
//             initial={{ opacity: 0, y: 20 }}
//             whileInView={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.6 }}
//             viewport={{ once: true }}
//             className="text-center mb-16"
//           >
//             <h2 className="text-4xl lg:text-5xl font-bold mb-4">
//               <span className="gradient-text">Projets en vedette</span>
//             </h2>
//             <p className="text-xl text-gray-400 max-w-2xl mx-auto">
//               Découvrez une sélection de mes meilleurs projets
//             </p>
//           </motion.div>
//         </div>
//         <ProjectsGallery />
//       </section>

//       {/* Section skills preview */}
//       <Skills />

//       {/* Call to action section */}
//       <section className="py-32 px-6 relative overflow-hidden">
//         <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20" />
//         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(15,23,42,0.8)_100%)]" />
        
//         <div className="container mx-auto relative z-10">
//           <motion.div
//             initial={{ opacity: 0, scale: 0.9 }}
//             whileInView={{ opacity: 1, scale: 1 }}
//             transition={{ duration: 0.8 }}
//             viewport={{ once: true }}
//             className="text-center"
//           >
//             <h2 className="text-4xl lg:text-6xl font-bold mb-8">
//               <span className="gradient-text">Prêt à collaborer ?</span>
//             </h2>
//             <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
//               Transformons ensemble vos idées en solutions digitales innovantes
//             </p>
//             <div className="flex flex-wrap gap-6 justify-center">
//               <motion.a
//                 href="/contact"
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 className="px-10 py-5 bg-gradient-to-r from-primary to-secondary rounded-full font-bold text-white text-lg shadow-2xl neon-glow"
//               >
//                 Démarrer un projet
//               </motion.a>
//               <motion.a
//                 href="/cv"
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 className="px-10 py-5 glass-effect rounded-full font-bold text-white text-lg border border-white/20"
//               >
//                 Télécharger mon CV
//               </motion.a>
//             </div>
//           </motion.div>
//         </div>
//       </section>
//     </motion.div>
//   )
// }

// export default HomePage