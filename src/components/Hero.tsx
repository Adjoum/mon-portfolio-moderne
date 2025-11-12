import React, { useRef, useEffect, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sphere, MeshDistortMaterial } from '@react-three/drei'
import { ReactTyped } from "react-typed";
import { ChevronDown, Github, Linkedin, Facebook, Mail, Code, Database, Brain, Smartphone } from 'lucide-react'
//import { href } from 'react-router-dom';

const AnimatedSphere = () => {
  return (
    <Sphere args={[1, 100, 200]} scale={2}>
      <MeshDistortMaterial
        color="#6366F1"
        attach="material"
        distort={0.5}
        speed={2}
        roughness={0}
      />
    </Sphere>
  )
}

const Hero: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"])
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0])

  // Fonction pour obtenir le salut selon l'heure
  const getGreeting = () => {
    const hour = new Date().getHours()
    
    if (hour >= 5 && hour < 12) {
      return "Bonjour"
    } else if (hour >= 12 && hour < 18) {
      return "Bon après-midi"
    } else if (hour >= 18 && hour < 22) {
      return "Bonsoir"
    } else {
      return "Bonne nuit"
    }
  }

  // État pour le salut dynamique
  const [greeting, setGreeting] = useState(getGreeting())

  // Mettre à jour le salut toutes les minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreeting())
    }, 60000) // Mise à jour chaque minute

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Particles animation
    const createParticle = () => {
      const particle = document.createElement('div')
      particle.className = 'particle'
      particle.style.width = Math.random() * 10 + 'px'
      particle.style.height = particle.style.width
      particle.style.left = Math.random() * window.innerWidth + 'px'
      particle.style.top = Math.random() * window.innerHeight + 'px'
      particle.style.animationDuration = Math.random() * 20 + 10 + 's'
      particle.style.animationDelay = Math.random() * 5 + 's'
      document.getElementById('particles-container')?.appendChild(particle)
      
      setTimeout(() => particle.remove(), 30000)
    }

    const interval = setInterval(createParticle, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ opacity }}
    >
      {/* Background avec effet gradient animé */}
      <div className="absolute inset-0 animated-bg" />
      
      {/* Particules container */}
      <div id="particles-container" className="absolute inset-0 pointer-events-none" />

      {/* 3D Background Shape */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 5] }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <AnimatedSphere />
          <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
        </Canvas>
      </div>

      {/* Contenu principal */}
      <motion.div 
        className="relative z-10 container mx-auto px-6 flex flex-col lg:flex-row items-center justify-between gap-12"
        style={{ y }}
      >
        {/* Texte et présentation */}
        <motion.div
          className="flex-1 text-center lg:text-left"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <motion.div
            className="inline-block mb-4"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <span className="px-4 py-2 glass-effect text-sm font-medium rounded-full gradient-text">
              Disponible pour des projets innovants
            </span>
          </motion.div>

          <motion.h1
            className="text-5xl lg:text-7xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <span className="block text-white mb-2">{greeting}, je suis</span>
            <span className="gradient-text glitch" data-text="Adjoumani">Adjoumani</span>
          </motion.h1>

          <motion.div
            className="text-xl lg:text-2xl mb-8 text-gray-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <ReactTyped
              strings={[
                "Développeur Full Stack",
                "Expert en Intelligence Artificielle",
                "Spécialiste Mobile Flutter & React Native",
                "Data Analyst & Engineer",
                "Créateur de Solutions Digitales"
              ]}
              typeSpeed={50}
              backSpeed={30}
              loop
              className="font-semibold"
            />
          </motion.div>

          <motion.p
            className="text-lg text-gray-400 mb-8 max-w-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            Étudiant en 3ème année d'analyse de données industrielles à l'INP-HB, 
            je transforme des idées complexes en solutions digitales élégantes et performantes.
          </motion.p>

          {/* Boutons d'action */}
          <motion.div
            className="flex flex-wrap gap-4 justify-center lg:justify-start mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white shadow-lg neon-glow hover-lift"
            >
              Voir mes projets
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 glass-effect rounded-full font-semibold text-white border border-white/20 hover:bg-white/10 transition-all"
            >
              Télécharger CV
            </motion.button>
          </motion.div>

          {/* Liens sociaux */}
          <motion.div
            className="flex gap-4 justify-center lg:justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            {[
              { icon: Github, href: "https://github.com/Adjoum" },
              { icon: Linkedin, href: "https://www.linkedin.com/in/koffi-wilfried-adjoumani/" },
              {icon: Facebook, href: "https://web.facebook.com/profile.php?id=100084939496635"},
              { icon: Mail, href: "mailto:adjoumanideveloppeurwebmob@gmail.com" }
            ].map((social, index) => (
              <motion.a
                key={index}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.2, rotate: 360 }}
                whileTap={{ scale: 0.9 }}
                className="w-12 h-12 glass-effect rounded-full flex items-center justify-center text-white hover:text-primary transition-colors"
              >
                <social.icon size={20} />
              </motion.a>
            ))}
          </motion.div>
        </motion.div>

        {/* Photo avec effets */}
        <motion.div
          className="flex-1 relative"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
        >
          <div className="relative w-80 h-80 lg:w-96 lg:h-96 mx-auto">
            {/* Cercles décoratifs animés */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary/30"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-4 rounded-full border-2 border-secondary/30"
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-8 rounded-full border-2 border-accent/30"
              animate={{ rotate: 360 }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            />
            
            {/* Photo principale avec effet morph */}
            <motion.div
              className="relative w-full h-full rounded-full overflow-hidden morph-shape p-1"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.3 }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-primary via-secondary to-accent p-1">
                <img
                  src="/api/placeholder/400/400"
                  alt="Adjoumani"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
            </motion.div>

            {/* Badges de compétences flottants */}
            <motion.div
              className="absolute -top-4 -right-4 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Code size={20} className="text-primary" />
              <span className="text-sm font-semibold">Full Stack</span>
            </motion.div>
            
            <motion.div
              className="absolute -bottom-4 -right-8 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 3.5, repeat: Infinity }}
            >
              <Brain size={20} className="text-secondary" />
              <span className="text-sm font-semibold">AI Expert</span>
            </motion.div>
            
            <motion.div
              className="absolute top-1/2 -left-8 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
              animate={{ x: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <Smartphone size={20} className="text-accent" />
              <span className="text-sm font-semibold">Mobile</span>
            </motion.div>
            
            <motion.div
              className="absolute -top-8 left-1/4 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
              animate={{ y: [0, -10, 0], x: [0, 10, 0] }}
              transition={{ duration: 3.8, repeat: Infinity }}
            >
              <Database size={20} className="text-green-500" />
              <span className="text-sm font-semibold">Data</span>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* Indicateur de scroll */}
      <motion.div
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <ChevronDown size={30} className="text-white/50" />
      </motion.div>
    </motion.section>
  )
}

export default Hero



/*import React, { useRef, useEffect } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sphere, MeshDistortMaterial } from '@react-three/drei'
import { ReactTyped } from "react-typed";
import { ChevronDown, Github, Linkedin, Mail, Code, Database, Brain, Smartphone } from 'lucide-react'

const AnimatedSphere = () => {
  return (
    <Sphere args={[1, 100, 200]} scale={2}>
      <MeshDistortMaterial
        color="#6366F1"
        attach="material"
        distort={0.5}
        speed={2}
        roughness={0}
      />
    </Sphere>
  )
}

const Hero: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"])
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0])

  useEffect(() => {
    // Particles animation
    const createParticle = () => {
      const particle = document.createElement('div')
      particle.className = 'particle'
      particle.style.width = Math.random() * 10 + 'px'
      particle.style.height = particle.style.width
      particle.style.left = Math.random() * window.innerWidth + 'px'
      particle.style.top = Math.random() * window.innerHeight + 'px'
      particle.style.animationDuration = Math.random() * 20 + 10 + 's'
      particle.style.animationDelay = Math.random() * 5 + 's'
      document.getElementById('particles-container')?.appendChild(particle)
      
      setTimeout(() => particle.remove(), 30000)
    }

    const interval = setInterval(createParticle, 500)
    return () => clearInterval(interval)
  }, [])    */

//   return (
//     <motion.section
//       ref={containerRef}
//       className="relative min-h-screen flex items-center justify-center overflow-hidden"
//       style={{ opacity }}
//     >
//       {/* Background avec effet gradient animé */}
//       <div className="absolute inset-0 animated-bg" />
      
//       {/* Particules container */}
//       <div id="particles-container" className="absolute inset-0 pointer-events-none" />

//       {/* 3D Background Shape */}
//       <div className="absolute inset-0 z-0">
//         <Canvas camera={{ position: [0, 0, 5] }}>
//           <ambientLight intensity={0.5} />
//           <directionalLight position={[10, 10, 5]} intensity={1} />
//           <AnimatedSphere />
//           <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
//         </Canvas>
//       </div>

//       {/* Contenu principal */}
//       <motion.div 
//         className="relative z-10 container mx-auto px-6 flex flex-col lg:flex-row items-center justify-between gap-12"
//         style={{ y }}
//       >
//         {/* Texte et présentation */}
//         <motion.div
//           className="flex-1 text-center lg:text-left"
//           initial={{ opacity: 0, x: -50 }}
//           animate={{ opacity: 1, x: 0 }}
//           transition={{ duration: 0.8, delay: 0.2 }}
//         >
//           <motion.div
//             className="inline-block mb-4"
//             initial={{ opacity: 0, scale: 0 }}
//             animate={{ opacity: 1, scale: 1 }}
//             transition={{ duration: 0.5 }}
//           >
//             <span className="px-4 py-2 glass-effect text-sm font-medium rounded-full gradient-text">
//               Disponible pour des projets innovants
//             </span>
//           </motion.div>

//           <motion.h1
//             className="text-5xl lg:text-7xl font-bold mb-6"
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.8, delay: 0.4 }}
//           >
//             <span className="block text-white mb-2">Bonjour, je suis</span>
//             <span className="gradient-text glitch" data-text="Adjoumani">Adjoumani</span>
//           </motion.h1>

//           <motion.div
//             className="text-xl lg:text-2xl mb-8 text-gray-300"
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             transition={{ duration: 0.8, delay: 0.6 }}
//           >
//             <ReactTyped
//               strings={[
//                 "Développeur Full Stack",
//                 "Expert en Intelligence Artificielle",
//                 "Spécialiste Mobile Flutter & React Native",
//                 "Data Analyst & Engineer",
//                 "Créateur de Solutions Digitales"
//               ]}
//               typeSpeed={50}
//               backSpeed={30}
//               loop
//               className="font-semibold"
//             />
//           </motion.div>

//           <motion.p
//             className="text-lg text-gray-400 mb-8 max-w-xl"
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             transition={{ duration: 0.8, delay: 0.8 }}
//           >
//             Étudiant en 3ème année d'analyse de données industrielles à l'INP-HB, 
//             je transforme des idées complexes en solutions digitales élégantes et performantes.
//           </motion.p>

//           {/* Boutons d'action */}
//           <motion.div
//             className="flex flex-wrap gap-4 justify-center lg:justify-start mb-8"
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.8, delay: 1 }}
//           >
//             <motion.button
//               whileHover={{ scale: 1.05 }}
//               whileTap={{ scale: 0.95 }}
//               className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white shadow-lg neon-glow hover-lift"
//             >
//               Voir mes projets
//             </motion.button>
//             <motion.button
//               whileHover={{ scale: 1.05 }}
//               whileTap={{ scale: 0.95 }}
//               className="px-8 py-4 glass-effect rounded-full font-semibold text-white border border-white/20 hover:bg-white/10 transition-all"
//             >
//               Télécharger CV
//             </motion.button>
//           </motion.div>

//           {/* Liens sociaux */}
//           <motion.div
//             className="flex gap-4 justify-center lg:justify-start"
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             transition={{ duration: 0.8, delay: 1.2 }}
//           >
//             {[
//               { icon: Github, href: "https://github.com" },
//               { icon: Linkedin, href: "https://linkedin.com" },
//               { icon: Mail, href: "mailto:contact@adjoumani.com" }
//             ].map((social, index) => (
//               <motion.a
//                 key={index}
//                 href={social.href}
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 whileHover={{ scale: 1.2, rotate: 360 }}
//                 whileTap={{ scale: 0.9 }}
//                 className="w-12 h-12 glass-effect rounded-full flex items-center justify-center text-white hover:text-primary transition-colors"
//               >
//                 <social.icon size={20} />
//               </motion.a>
//             ))}
//           </motion.div>
//         </motion.div>

//         {/* Photo avec effets */}
//         <motion.div
//           className="flex-1 relative"
//           initial={{ opacity: 0, scale: 0.8 }}
//           animate={{ opacity: 1, scale: 1 }}
//           transition={{ duration: 1, delay: 0.4 }}
//         >
//           <div className="relative w-80 h-80 lg:w-96 lg:h-96 mx-auto">
//             {/* Cercles décoratifs animés */}
//             <motion.div
//               className="absolute inset-0 rounded-full border-2 border-primary/30"
//               animate={{ rotate: 360 }}
//               transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
//             />
//             <motion.div
//               className="absolute inset-4 rounded-full border-2 border-secondary/30"
//               animate={{ rotate: -360 }}
//               transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
//             />
//             <motion.div
//               className="absolute inset-8 rounded-full border-2 border-accent/30"
//               animate={{ rotate: 360 }}
//               transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
//             />
            
//             {/* Photo principale avec effet morph */}
//             <motion.div
//               className="relative w-full h-full rounded-full overflow-hidden morph-shape p-1"
//               whileHover={{ scale: 1.05 }}
//               transition={{ duration: 0.3 }}
//             >
//               <div className="w-full h-full rounded-full bg-gradient-to-br from-primary via-secondary to-accent p-1">
//                 <img
//                   src="/api/placeholder/400/400"
//                   alt="Adjoumani"
//                   className="w-full h-full object-cover rounded-full"
//                 />
//               </div>
//             </motion.div>

//             {/* Badges de compétences flottants */}
//             <motion.div
//               className="absolute -top-4 -right-4 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
//               animate={{ y: [0, -10, 0] }}
//               transition={{ duration: 3, repeat: Infinity }}
//             >
//               <Code size={20} className="text-primary" />
//               <span className="text-sm font-semibold">Full Stack</span>
//             </motion.div>
            
//             <motion.div
//               className="absolute -bottom-4 -right-8 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
//               animate={{ y: [0, 10, 0] }}
//               transition={{ duration: 3.5, repeat: Infinity }}
//             >
//               <Brain size={20} className="text-secondary" />
//               <span className="text-sm font-semibold">AI Expert</span>
//             </motion.div>
            
//             <motion.div
//               className="absolute top-1/2 -left-8 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
//               animate={{ x: [0, -10, 0] }}
//               transition={{ duration: 4, repeat: Infinity }}
//             >
//               <Smartphone size={20} className="text-accent" />
//               <span className="text-sm font-semibold">Mobile</span>
//             </motion.div>
            
//             <motion.div
//               className="absolute -top-8 left-1/4 px-4 py-2 glass-effect rounded-full flex items-center gap-2"
//               animate={{ y: [0, -10, 0], x: [0, 10, 0] }}
//               transition={{ duration: 3.8, repeat: Infinity }}
//             >
//               <Database size={20} className="text-green-500" />
//               <span className="text-sm font-semibold">Data</span>
//             </motion.div>
//           </div>
//         </motion.div>
//       </motion.div>

//       {/* Indicateur de scroll */}
//       <motion.div
//         className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
//         animate={{ y: [0, 10, 0] }}
//         transition={{ duration: 2, repeat: Infinity }}
//       >
//         <ChevronDown size={30} className="text-white/50" />
//       </motion.div>
//     </motion.section>
//   )
// }

// export default Hero