// src/pages/NovaMindPage.tsx
// ─────────────────────────────────────────────────────────────
//  Wrapper TypeScript — NovaMind Cosmos Edition
//  Import CSS + lazy load du moteur JSX
// ─────────────────────────────────────────────────────────────
import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
//import '../styles/novamind.css'

// @ts-expect-error — MindMapPage.jsx sans déclarations TypeScript
import MindMapInner from './MindMapPage'

// ── Loader cosmos ──────────────────────────────────────────────
const NovaMindLoader: React.FC = () => (
  <div style={{
    width: '100%', height: '100vh',
    background: 'radial-gradient(ellipse at 40% 40%, #0e0e2a 0%, #04040e 100%)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 20,
  }}>
    {/* Rotating gradient ring */}
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
      style={{
        width: 56, height: 56, borderRadius: '50%',
        border: '3px solid transparent',
        borderTopColor: '#6EE7F7',
        borderRightColor: '#A78BFA',
        borderBottomColor: '#F472B6',
        filter: 'drop-shadow(0 0 8px rgba(110,231,247,0.5))',
      }}
    />
    <div>
      <div style={{
        fontSize: 13, color: '#334155',
        fontFamily: "'Space Mono', monospace",
        letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center',
      }}>
        Nova<span style={{ color: '#A78BFA' }}>Mind</span> · Chargement
      </div>
      <div style={{
        fontSize: 10, color: '#1e293b',
        fontFamily: "'Space Mono', monospace",
        letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', marginTop: 4,
      }}>
        Cosmos Edition
      </div>
    </div>
  </div>
)

// ── Page ───────────────────────────────────────────────────────
const NovaMindPage: React.FC = () => {
  useEffect(() => {
    const prev = document.title
    document.title = 'NovaMind — Infinite Mind Mapping | Adjoumani'
    return () => { document.title = prev }
  }, [])

  return (
    <React.Suspense fallback={<NovaMindLoader />}>
      <MindMapInner />
    </React.Suspense>
  )
}

export default NovaMindPage
