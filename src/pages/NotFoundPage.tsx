import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft, Search, Zap } from 'lucide-react'

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate()
  const [glitchText, setGlitchText] = useState('404')
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const glitchChars = ['4', '0', '4', '?', '#', '@', '4', '0', '4']
    let currentIndex = 0

    const interval = setInterval(() => {
      const randomText = Array(3)
        .fill(0)
        .map(() => glitchChars[Math.floor(Math.random() * glitchChars.length)])
        .join('')
      setGlitchText(randomText)

      currentIndex++
      if (currentIndex > 20) {
        setGlitchText('404')
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const floatingShapes = Array(15).fill(0)

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(0, 240, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 240, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }} />
      </div>

      {floatingShapes.map((_, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 300 + 50,
            height: Math.random() * 300 + 50,
            background: `radial-gradient(circle, ${
              ['rgba(0, 240, 255, 0.1)', 'rgba(255, 0, 110, 0.1)', 'rgba(131, 56, 236, 0.1)'][
                Math.floor(Math.random() * 3)
              ]
            }, transparent)`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            filter: 'blur(60px)',
          }}
          animate={{
            x: [0, Math.random() * 100 - 50],
            y: [0, Math.random() * 100 - 50],
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: Math.random() * 10 + 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      <div className="relative z-10 text-center px-6">
        <motion.div
          className="relative mb-8"
          style={{
            x: mousePosition.x,
            y: mousePosition.y,
          }}
          transition={{ type: 'spring', stiffness: 50, damping: 20 }}
        >
          <motion.h1
            className="text-[10rem] md:text-[15rem] font-black leading-none"
            style={{
              background: 'linear-gradient(135deg, #00f0ff, #ff006e, #8338ec)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 80px rgba(0, 240, 255, 0.5))',
            }}
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            {glitchText}
          </motion.h1>

          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-transparent via-white to-transparent opacity-20"
            style={{ height: '2px' }}
            animate={{
              y: ['-100%', '1000%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
            Page Introuvable
          </h2>
          <p className="text-lg md:text-xl text-gray-400 mb-2">
            Cette page s'est perdue dans la matrice digitale
          </p>
          <motion.p
            className="text-primary font-mono text-sm"
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
            }}
          >
            ERROR_CODE: PAGE_NOT_FOUND_IN_QUANTUM_REALM
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-effect-dark p-6 rounded-2xl max-w-md mx-auto mb-8"
        >
          <p className="text-gray-300 mb-4">
            <Search className="inline mr-2" size={20} />
            Vous cherchiez peut-être :
          </p>
          <div className="space-y-2">
            <motion.button
              onClick={() => navigate('/')}
              className="w-full text-left px-4 py-2 rounded-lg glass-effect hover:border-primary border border-transparent transition-all"
              whileHover={{ x: 10 }}
            >
              🏠 Page d'accueil
            </motion.button>
            <motion.button
              onClick={() => navigate('/projects')}
              className="w-full text-left px-4 py-2 rounded-lg glass-effect hover:border-primary border border-transparent transition-all"
              whileHover={{ x: 10 }}
            >
              💼 Mes projets
            </motion.button>
            <motion.button
              onClick={() => navigate('/contact')}
              className="w-full text-left px-4 py-2 rounded-lg glass-effect hover:border-primary border border-transparent transition-all"
              whileHover={{ x: 10 }}
            >
              📧 Me contacter
            </motion.button>
          </div>
        </motion.div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <motion.button
            onClick={() => navigate(-1)}
            className="px-8 py-4 glass-effect rounded-full font-semibold text-white flex items-center gap-2 hover:scale-105 transition-transform"
            whileHover={{ boxShadow: '0 0 30px rgba(0, 240, 255, 0.5)' }}
          >
            <ArrowLeft size={20} />
            Retour
          </motion.button>

          <motion.button
            onClick={() => navigate('/')}
            className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white flex items-center gap-2 hover:scale-105 transition-transform"
            whileHover={{ boxShadow: '0 0 30px rgba(255, 0, 110, 0.5)' }}
          >
            <Home size={20} />
            Accueil
          </motion.button>
        </div>

        <motion.div
          className="mt-12 text-xs text-gray-600 font-mono"
          animate={{
            opacity: [0, 0.3, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
          }}
        >
          <Zap className="inline mr-1" size={12} />
          Erreur quantique détectée dans le continuum espace-temps
        </motion.div>
      </div>

      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.8) 100%)',
      }} />
    </div>
  )
}

export default NotFoundPage