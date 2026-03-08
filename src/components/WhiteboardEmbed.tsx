import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Maximize2, Minimize2, ExternalLink } from 'lucide-react'

export default function WhiteboardEmbed() {
  const iframeRef   = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded]       = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Plein écran natif
  const toggleFullscreen = () => {
    const el = iframeRef.current
    if(!el) return
    if(!document.fullscreenElement) {
      el.requestFullscreen().catch(console.error)
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  return (
    <div className="relative w-full h-full flex flex-col">

      {/* Barre de contrôle */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark/80 backdrop-blur border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Pastilles style macOS */}
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-3 text-sm text-gray-400 font-mono">
            Adjoumani — Premium Whiteboard
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Ouvrir dans un nouvel onglet */}
          <motion.a
            href="/inkspace/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Ouvrir en pleine page"
          >
            <ExternalLink size={16} />
          </motion.a>

          {/* Plein écran */}
          <motion.button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </motion.button>
        </div>
      </div>

      {/* Loader pendant le chargement */}
      <AnimatePresence>
        {!loaded && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 top-10 z-10 flex flex-col items-center justify-center bg-dark"
          >
            <motion.div
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center mb-4"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <span className="text-white font-bold text-2xl">✦</span>
            </motion.div>
            <p className="text-gray-400 font-mono text-sm">Chargement d'InkSpace...</p>
            <div className="w-40 h-1 bg-white/10 rounded-full mt-4 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* L'iframe InkSpace */}
      <iframe
        ref={iframeRef}
        src="/inkspace/index.html"
        className="flex-1 w-full border-none"
        onLoad={() => setLoaded(true)}
        title="InkSpace Whiteboard"
        allow="fullscreen"
        style={{ minHeight: 0 }}  // important pour le flex
      />
    </div>
  )
}
