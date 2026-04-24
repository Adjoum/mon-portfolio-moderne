import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, X, Home, User, Briefcase, Code, Mail,
  Download, Brain, PenLine, Terminal,
  Wrench, ChevronDown, LayoutDashboard, Timer,
  BookMarked, Network, FolderKanban, FileText,
  UserRoundPen,
  ScrollText
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
interface NavItem {
  name: string
  href: string
  icon: LucideIcon
}

interface ToolItem {
  name: string
  href: string
  icon: LucideIcon
  description: string
  badge?: string
  color: string
}

// ── Data ──────────────────────────────────────────────────────
const mainNavItems: NavItem[] = [
  { name: 'Accueil',     href: '/',        icon: Home },
  { name: 'À propos',    href: '/about',   icon: User },
  { name: 'Projets',     href: '/projects',icon: Briefcase },
  { name: 'Compétences', href: '/skills',  icon: Code },
  { name: 'CV',          href: '/cv',      icon: Download },
  { name: 'IA Lab',      href: '/ai-lab',  icon: Brain },
  { name: 'Contact',     href: '/contact', icon: Mail },
]

const toolItems: ToolItem[] = [
  {
    name: 'Hub Outils',
    href: '/tools',
    icon: LayoutDashboard,
    description: 'Tous mes outils en un coup d\'œil',
    color: '#63b3ed',
  },
  {
    name: 'Workspace',
    href: '/workspace',
    icon: FolderKanban,
    description: 'Organiser mes projets & dossiers',
    color: '#9f7aea',
  },
  {
    name: 'NovaMind',
    href: '/tools/novamind',
    icon: Network,
    description: 'Cartes mentales & diagrammes infinis',
    badge: 'Nouveau',
    color: '#63b3ed',
  },
  {
    name: 'InkSpace',
    href: '/adjoumani-whiteboard',
    icon: PenLine,
    description: 'Tableau blanc collaboratif',
    color: '#ed64a6',
  },
  {
    name: 'Pomodoro',
    href: '/tools/pomodoro',
    icon: Timer,
    description: 'Focus & productivité',
    color: '#fc8181',
  },
  {
    name: 'Code Vault',
    href: '/tools/snippets',
    icon: BookMarked,
    description: 'Bibliothèque de snippets',
    color: '#48bb78',
  },
  {
    name: 'Playground',
    href: '/playground',
    icon: Terminal,
    description: 'Bac à sable de code',
    color: '#ecc94b',
  },

  {
    name: 'CV Generator',
    href: '/cv-generator',
    icon: UserRoundPen,
    description: 'Générateur de CV LaTeX professionnel',
    badge: 'Nouveau',
    color: '#f6ad55',
  },

  {
    name: 'Blog',
    href: '/blog',
    icon: ScrollText,
    description: 'Articles & actualités',
    color: '#8b5cf6',
  },
]

// ── Tools Dropdown ────────────────────────────────────────────
const ToolsDropdown: React.FC<{ isAnyToolActive: boolean }> = ({ isAnyToolActive }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on route change
  useEffect(() => { setOpen(false) }, [location.pathname])

  const isToolActive = (href: string) => location.pathname === href

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <motion.button
        onClick={() => setOpen(p => !p)}
        className={`px-4 py-2.5 rounded-full flex items-center gap-2 font-medium transition-all ${
          isAnyToolActive
            ? 'bg-gradient-to-r from-primary to-secondary text-white'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Wrench size={17} />
        <span>Outils</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={15} />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 300,
              background: 'rgba(8, 8, 20, 0.97)',
              border: '1px solid rgba(99,179,237,0.15)',
              borderRadius: 18,
              padding: 8,
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)',
              zIndex: 9999,
            }}
          >
            {/* Header */}
            <div style={{
              padding: '8px 12px 10px',
              marginBottom: 4,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#63b3ed', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                🛠️ Outils & Créations
              </div>
            </div>

            {/* Items */}
            {toolItems.map((tool, i) => {
              const active = isToolActive(tool.href)
              const Icon = tool.icon
              return (
                <Link key={tool.href} to={tool.href} style={{ textDecoration: 'none' }}>
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)', x: 3 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 12px', borderRadius: 11,
                      background: active ? `rgba(${hexToRgb(tool.color)}, 0.12)` : 'transparent',
                      border: active ? `1px solid rgba(${hexToRgb(tool.color)}, 0.25)` : '1px solid transparent',
                      cursor: 'pointer', transition: 'background .15s',
                    }}
                  >
                    {/* Icon box */}
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: `rgba(${hexToRgb(tool.color)}, 0.12)`,
                      border: `1px solid rgba(${hexToRgb(tool.color)}, 0.22)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={16} color={tool.color} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontWeight: 600, fontSize: 13.5,
                        color: active ? tool.color : '#e2e8f0',
                      }}>
                        {tool.name}
                        {tool.badge && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px',
                            borderRadius: 10,
                            background: 'rgba(99,179,237,0.14)',
                            color: '#63b3ed',
                            border: '1px solid rgba(99,179,237,0.25)',
                            letterSpacing: .3,
                          }}>{tool.badge}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#718096', marginTop: 1 }}>
                        {tool.description}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div style={{
                      color: active ? tool.color : '#4a5568',
                      fontSize: 14, flexShrink: 0,
                      transition: 'color .15s',
                    }}>→</div>
                  </motion.div>
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Navigation ───────────────────────────────────────────
const Navigation: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const location = useLocation()

  const toolPaths = toolItems.map(t => t.href)
  const isAnyToolActive = toolPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'))

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false)
    setMobileToolsOpen(false)
  }, [location.pathname])

  const isActive = (href: string) => location.pathname === href

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          isScrolled ? 'glass-effect-dark backdrop-blur-xl' : ''
        }`}
      >
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-20">

            {/* ── Logo ── */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link to="/" className="flex items-center space-x-3">
                <motion.div
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                >
                  <span className="text-white font-bold text-xl">A</span>
                </motion.div>
                <span className="text-xl font-bold gradient-text">Adjoumani</span>
              </Link>
            </motion.div>

            {/* ── Desktop Menu ── */}
            <div className="hidden lg:flex items-center space-x-1">
              {mainNavItems.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.07 }}
                >
                  <Link to={item.href}>
                    <motion.button
                      className={`px-4 py-2.5 rounded-full flex items-center gap-2 font-medium transition-all text-sm ${
                        isActive(item.href)
                          ? 'bg-gradient-to-r from-primary to-secondary text-white'
                          : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <item.icon size={16} />
                      <span>{item.name}</span>
                    </motion.button>
                  </Link>
                </motion.div>
              ))}

              {/* Tools dropdown — always last */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: mainNavItems.length * 0.07 }}
              >
                <ToolsDropdown isAnyToolActive={isAnyToolActive} />
              </motion.div>
            </div>

            {/* ── Mobile Menu Button ── */}
            <motion.button
              className="lg:hidden p-2 rounded-lg glass-effect"
              onClick={() => setIsMobileMenuOpen(p => !p)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </motion.button>
          </div>
        </div>
      </motion.nav>

      {/* ── Mobile Menu ── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-dark/95 backdrop-blur-xl" />

            <div className="relative h-full flex flex-col pt-24 px-6 overflow-y-auto">

              {/* ── Main links ── */}
              {mainNavItems.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.07 }}
                >
                  <Link to={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                    <motion.button
                      className={`w-full px-6 py-4 mb-2 rounded-2xl flex items-center gap-4 font-medium transition-all ${
                        isActive(item.href)
                          ? 'bg-gradient-to-r from-primary to-secondary text-white'
                          : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                      whileHover={{ scale: 1.02, x: 8 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <item.icon size={22} />
                      <span className="text-base">{item.name}</span>
                    </motion.button>
                  </Link>
                </motion.div>
              ))}

              {/* ── Tools accordion ── */}
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: mainNavItems.length * 0.07 }}
                style={{ marginBottom: 8 }}
              >
                {/* Accordion toggle */}
                <button
                  onClick={() => setMobileToolsOpen(p => !p)}
                  style={{
                    width: '100%', padding: '14px 24px',
                    borderRadius: 16, border: 'none', cursor: 'pointer',
                    background: isAnyToolActive
                      ? 'linear-gradient(135deg, var(--color-primary, #667eea), var(--color-secondary, #764ba2))'
                      : 'rgba(255,255,255,0.06)',
                    color: isAnyToolActive ? 'white' : '#d1d5db',
                    display: 'flex', alignItems: 'center', gap: 16,
                    fontFamily: 'inherit', fontWeight: 500, fontSize: 16,
                  }}
                >
                  <Wrench size={22} />
                  <span style={{ flex: 1, textAlign: 'left' }}>Outils</span>
                  <span style={{
                    background: 'rgba(99,179,237,0.2)', color: '#63b3ed',
                    borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                  }}>{toolItems.length}</span>
                  <motion.div animate={{ rotate: mobileToolsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={18} />
                  </motion.div>
                </button>

                {/* Accordion content */}
                <AnimatePresence>
                  {mobileToolsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ overflow: 'hidden', paddingLeft: 12 }}
                    >
                      <div style={{
                        marginTop: 6,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(99,179,237,0.1)',
                        borderRadius: 14, padding: 8,
                      }}>
                        {toolItems.map((tool, i) => {
                          const active = isActive(tool.href)
                          const Icon = tool.icon
                          return (
                            <Link
                              key={tool.href}
                              to={tool.href}
                              style={{ textDecoration: 'none' }}
                              onClick={() => setIsMobileMenuOpen(false)}
                            >
                              <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)', x: 4 }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '11px 14px', borderRadius: 11, marginBottom: 4,
                                  background: active ? `rgba(${hexToRgb(tool.color)}, 0.12)` : 'transparent',
                                  border: active ? `1px solid rgba(${hexToRgb(tool.color)}, 0.25)` : '1px solid transparent',
                                  transition: 'background .15s',
                                }}
                              >
                                <div style={{
                                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                                  background: `rgba(${hexToRgb(tool.color)}, 0.12)`,
                                  border: `1px solid rgba(${hexToRgb(tool.color)}, 0.2)`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <Icon size={17} color={tool.color} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{
                                    fontWeight: 600, fontSize: 14,
                                    color: active ? tool.color : '#e2e8f0',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                  }}>
                                    {tool.name}
                                    {tool.badge && (
                                      <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                                        background: 'rgba(99,179,237,0.14)', color: '#63b3ed',
                                        border: '1px solid rgba(99,179,237,0.25)',
                                      }}>{tool.badge}</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: '#718096', marginTop: 1 }}>
                                    {tool.description}
                                  </div>
                                </div>
                              </motion.div>
                            </Link>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* ── Social links ── */}
              <motion.div
                className="mt-auto mb-8 flex justify-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <motion.a
                  href="https://github.com"
                  className="w-12 h-12 glass-effect rounded-full flex items-center justify-center"
                  whileHover={{ scale: 1.2, rotate: 360 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </motion.a>
                <motion.a
                  href="https://linkedin.com"
                  className="w-12 h-12 glass-effect rounded-full flex items-center justify-center"
                  whileHover={{ scale: 1.2, rotate: 360 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                </motion.a>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Helper ────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r
    ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}`
    : '99,179,237'
}

export default Navigation  //    


























// import React, { useState, useEffect } from 'react'
// import { motion, AnimatePresence } from 'framer-motion'
// import { Menu, X, Home, User, Briefcase, Code, Mail, Download, Brain, PenLine, Terminal } from 'lucide-react'
// import { Link, useLocation } from 'react-router-dom'
// import type { LucideIcon } from "lucide-react"

// interface NavItem {
//   name: string
//   href: string
//   icon: LucideIcon
// }

// const Navigation: React.FC = () => {
//   const [isScrolled, setIsScrolled] = useState(false)
//   const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
//   const location = useLocation()

//   const navItems: NavItem[] = [
//     { name: 'Accueil', href: '/', icon: Home },
//     { name: 'À propos', href: '/about', icon: User },
//     { name: 'Projets', href: '/projects', icon: Briefcase },
//     { name: 'Compétences', href: '/skills', icon: Code },
//     { name: 'CV', href: '/cv', icon: Download },
//     { name: 'IA Lab', href: '/ai-lab', icon: Brain },
//     { name: 'InkSpace',     href: '/adjoumani-whiteboard',  icon: PenLine },
//     { name: 'Coder', href: '/playground',            icon: Terminal },
//     { name: 'Contact', href: '/contact', icon: Mail },
//   ]

//   useEffect(() => {
//     const handleScroll = () => {
//       setIsScrolled(window.scrollY > 20)
//     }
//     window.addEventListener('scroll', handleScroll)
//     return () => window.removeEventListener('scroll', handleScroll)
//   }, [])

//   const isActive = (href: string) => location.pathname === href

//   return (
//     <>
//       <motion.nav
//         initial={{ y: -100 }}
//         animate={{ y: 0 }}
//         className={`fixed top-0 w-full z-50 transition-all duration-300 ${
//           isScrolled ? 'glass-effect-dark backdrop-blur-xl' : ''
//         }`}
//       >
//         <div className="container mx-auto px-6">
//           <div className="flex items-center justify-between h-20">
//             {/* Logo */}
//             <motion.div
//               whileHover={{ scale: 1.05 }}
//               whileTap={{ scale: 0.95 }}
//             >
//               <Link to="/" className="flex items-center space-x-3">
//                 <motion.div
//                   className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
//                   animate={{ rotate: 360 }}
//                   transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
//                 >
//                   <span className="text-white font-bold text-xl">A</span>
//                 </motion.div>
//                 <span className="text-xl font-bold gradient-text">Adjoumani</span>
//               </Link>
//             </motion.div>

//             {/* Desktop Menu */}
//             <div className="hidden lg:flex items-center space-x-1">
//               {navItems.map((item, index) => (
//                 <motion.div
//                   key={item.name}
//                   initial={{ opacity: 0, y: -20 }}
//                   animate={{ opacity: 1, y: 0 }}
//                   transition={{ delay: index * 0.1 }}
//                 >
//                   <Link to={item.href}>
//                     <motion.button
//                       className={`px-5 py-2.5 rounded-full flex items-center gap-2 font-medium transition-all ${
//                         isActive(item.href)
//                           ? 'bg-gradient-to-r from-primary to-secondary text-white'
//                           : 'text-gray-300 hover:text-white hover:bg-white/10'
//                       }`}
//                       whileHover={{ scale: 1.05 }}
//                       whileTap={{ scale: 0.95 }}
//                     >
//                       <item.icon size={18} />
//                       <span>{item.name}</span>
//                     </motion.button>
//                   </Link>
//                 </motion.div>
//               ))}
//             </div>

//             {/* Mobile Menu Button */}
//             <motion.button
//               className="lg:hidden p-2 rounded-lg glass-effect"
//               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
//               whileHover={{ scale: 1.1 }}
//               whileTap={{ scale: 0.9 }}
//             >
//               {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
//             </motion.button>
//           </div>
//         </div>
//       </motion.nav>

//       {/* Mobile Menu */}
//       <AnimatePresence>
//         {isMobileMenuOpen && (
//           <motion.div
//             initial={{ opacity: 0, x: '100%' }}
//             animate={{ opacity: 1, x: 0 }}
//             exit={{ opacity: 0, x: '100%' }}
//             transition={{ type: 'spring', damping: 25, stiffness: 200 }}
//             className="fixed inset-0 z-40 lg:hidden"
//           >
//             <div className="absolute inset-0 bg-dark/95 backdrop-blur-xl" />
//             <div className="relative h-full flex flex-col pt-24 px-6">
//               {navItems.map((item, index) => (
//                 <motion.div
//                   key={item.name}
//                   initial={{ opacity: 0, x: 50 }}
//                   animate={{ opacity: 1, x: 0 }}
//                   transition={{ delay: index * 0.1 }}
//                 >
//                   <Link
//                     to={item.href}
//                     onClick={() => setIsMobileMenuOpen(false)}
//                   >
//                     <motion.button
//                       className={`w-full px-6 py-4 mb-2 rounded-2xl flex items-center gap-4 font-medium transition-all ${
//                         isActive(item.href)
//                           ? 'bg-gradient-to-r from-primary to-secondary text-white'
//                           : 'text-gray-300 hover:text-white hover:bg-white/10'
//                       }`}
//                       whileHover={{ scale: 1.02, x: 10 }}
//                       whileTap={{ scale: 0.98 }}
//                     >
//                       <item.icon size={24} />
//                       <span className="text-lg">{item.name}</span>
//                     </motion.button>
//                   </Link>
//                 </motion.div>
//               ))}

//               {/* Social Links in Mobile */}
//               <motion.div
//                 className="mt-auto mb-8 flex justify-center gap-4"
//                 initial={{ opacity: 0, y: 20 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 transition={{ delay: 0.5 }}
//               >
//                 <motion.a
//                   href="https://github.com"
//                   className="w-12 h-12 glass-effect rounded-full flex items-center justify-center"
//                   whileHover={{ scale: 1.2, rotate: 360 }}
//                   whileTap={{ scale: 0.9 }}
//                 >
//                   <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
//                     <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
//                   </svg>
//                 </motion.a>
//                 <motion.a
//                   href="https://linkedin.com"
//                   className="w-12 h-12 glass-effect rounded-full flex items-center justify-center"
//                   whileHover={{ scale: 1.2, rotate: 360 }}
//                   whileTap={{ scale: 0.9 }}
//                 >
//                   <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
//                     <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
//                   </svg>
//                 </motion.a>
//               </motion.div>
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </>
//   )
// }

// export default Navigation