import React, { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

// ✅ Components chargés immédiatement (critiques)
import Navigation from './components/Navigation'
import { useVisitTracker } from './hooks/useVisitTracker'
import Footer from './components/Footer'

// ✅ Pages existantes — lazy loading
const HomePage        = lazy(() => import('./pages/HomePage'))
const AboutPage       = lazy(() => import('./pages/AboutPage'))
const ProjectsPage    = lazy(() => import('./pages/ProjectsPage'))
const SkillsPage      = lazy(() => import('./pages/SkillsPage'))
const CVPage          = lazy(() => import('./pages/CVPage'))
const AILabPage       = lazy(() => import('./pages/AILabPage'))
const ContactPage     = lazy(() => import('./pages/ContactPage'))
const AdminDashboard  = lazy(() => import('./hooks/AdminDashboard'))
const NotFoundPage    = lazy(() => import('./pages/NotFoundPage'))
const TermsPage       = lazy(() => import('./pages/TermsPage'))
const PrivacyPage     = lazy(() => import('./pages/PrivacyPage'))
const WhiteboardPage  = lazy(() => import('./pages/whiteboard'))
const PlaygroundPage  = lazy(() => import('./pages/playground'))

// ✅ Nouvelles pages Outils — lazy loading
const ToolsHubPage    = lazy(() => import('./pages/ToolsHubPage'))
const WorkspacePage   = lazy(() => import('./pages/WorkspacePage'))
const PomodoroPage    = lazy(() => import('./pages/PomodoroPage'))
const CodeVaultPage   = lazy(() => import('./pages/CodeVaultPage'))
const NovaMindPage = lazy(() => import('./pages/NovaMindPage'))

const BlogPage = lazy(() => import('./pages/BlogPage'))
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'))
const AdminBlogPage = lazy(() => import('./pages/AdminBlogPage'))
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'))
const KnowledgeAdmin = lazy(() => import('./pages/KnowledgeAdmin'))





// Dans tes routes (protéger par auth admin)









// ── Routes "plein écran" sans nav ni footer ───────────────────
const FULLSCREEN_ROUTES = [
  '/adjoumani-whiteboard',
  '/playground',
  '/tools/novamind',   // NovaMind occupe tout l'écran (canvas infini)
]

// ── Custom cursor ─────────────────────────────────────────────
const CustomCursor: React.FC = () => {
  const [position, setPosition]       = useState({ x: 0, y: 0 })
  const [dotPosition, setDotPosition] = useState({ x: 0, y: 0 })
  const [isPointer, setIsPointer]     = useState(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY })
      setTimeout(() => setDotPosition({ x: e.clientX, y: e.clientY }), 100)

      const target = e.target as HTMLElement
      setIsPointer(
        window.getComputedStyle(target).cursor === 'pointer' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'A'
      )
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <>
      <div
        className="custom-cursor"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: isPointer ? 'translate(-50%, -50%) scale(1.5)' : 'translate(-50%, -50%)',
        }}
      />
      <div
        className="custom-cursor-dot"
        style={{
          left: `${dotPosition.x}px`,
          top: `${dotPosition.y}px`,
        }}
      />
    </>
  )
}

// ── Loading screens ───────────────────────────────────────────
const LoadingScreen: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-primary mx-auto mb-4" />
      <p className="text-xl text-gray-400 animate-pulse">Chargement...</p>
    </div>
  </div>
)

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto" />
  </div>
)

// ── Scroll to top ─────────────────────────────────────────────
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pathname])
  return null
}

// ── Animated routes ───────────────────────────────────────────
const AnimatedRoutes: React.FC = () => {
  const location   = useLocation()
  const isFullscreen = FULLSCREEN_ROUTES.includes(location.pathname)

  useVisitTracker()

  return (
    <>
      {!isFullscreen && <ScrollToTop />}
      {!isFullscreen && <Navigation />}

      <AnimatePresence mode="wait">
        <Suspense fallback={<PageLoader />}>
          <Routes location={location} key={location.pathname}>

            {/* ── Pages existantes ── */}
            <Route path="/"                       element={<HomePage />} />
            <Route path="/about"                  element={<AboutPage />} />
            <Route path="/projects"               element={<ProjectsPage />} />
            <Route path="/skills"                 element={<SkillsPage />} />
            <Route path="/cv"                     element={<CVPage />} />
            <Route path="/ai-lab"                 element={<AILabPage />} />
            <Route path="/adjoumani-whiteboard"   element={<WhiteboardPage />} />
            <Route path="/playground"             element={<PlaygroundPage />} />
            <Route path="/contact"                element={<ContactPage />} />
            <Route path="/admin"                  element={<AdminDashboard />} />
            <Route path="/admin/knowledge"        element={<KnowledgeAdmin />} />
            <Route path="/terms"                  element={<TermsPage />} />
            <Route path="/privacy"                element={<PrivacyPage />} />

            {/* ── Nouvelles pages Outils ── */}
            <Route path="/tools"                  element={<ToolsHubPage />} />
            <Route path="/workspace"              element={<WorkspacePage />} />
            <Route path="/tools/pomodoro"         element={<PomodoroPage />} />
            <Route path="/tools/snippets"         element={<CodeVaultPage />} />
            <Route path="/tools/novamind"         element={<NovaMindPage />} />

            {/*Bog*/}
            <Route path="/blog-admin"                  element={<AdminLoginPage />} />
            <Route path="/blog/new"               element={<AdminBlogPage />} />
            <Route path="/blog/edit/:id"          element={<AdminBlogPage />} />
            <Route path="/blog/:slug"             element={<BlogPostPage />} />
            <Route path="/blog"                   element={<BlogPage />} />

            {/* ── 404 ── */}
            <Route path="*"                       element={<NotFoundPage />} />

          </Routes>
        </Suspense>
      </AnimatePresence>

      {!isFullscreen && <Footer />}
    </>
  )
}

// ── App root ──────────────────────────────────────────────────
function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => setLoading(false), 2000)
  }, [])

  if (loading) return <LoadingScreen />

  return (
    <Router>
      <div className="app-container">
        <CustomCursor />
        <AnimatedRoutes />
      </div>
    </Router>
  )
}

export default App