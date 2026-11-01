import React, { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

// ✅ Components chargés immédiatement (critiques)
import Navigation from './components/Navigation'
import { useVisitTracker } from './hooks/useVisitTracker'
import Footer from './components/Footer'

// ✅ Pages existantes — lazy loading
// Accueil inclus dans le bundle principal : un aller-retour réseau de moins avant le premier affichage de /
import HomePage from './pages/HomePage'
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
const LaTeXCVEditor = lazy(() => import('./pages/CVBuilder/LaTeXEditor'))
const CVGenerator = lazy(() => import('./pages/CVBuilder/CVGenerator'))
const SitePlanPage = lazy(() => import('./pages/SitePlanPage'))
const FileConverter = lazy(() => import('./components/tools/FileConverter'));













// Dans tes routes (protéger par auth admin)









// ── Routes "plein écran" sans nav ni footer ───────────────────
const FULLSCREEN_ROUTES = [
  '/adjoumani-whiteboard',
  '/playground',
  '/tools/novamind',   // NovaMind occupe tout l'écran (canvas infini)
  '/cv-builder',       // CV Builder a sa propre nav interne
  '/cv-generator',     // CV Generator a sa propre nav interne
  '/latex-cv-editor',   // LaTeX CV Editor a sa propre nav interne
]

// ── Custom cursor ─────────────────────────────────────────────
const CustomCursor: React.FC = () => {
  const [position, setPosition]       = useState({ x: -100, y: -100 }) // hors écran jusqu’au premier mouvement
  const [dotPosition, setDotPosition] = useState({ x: -100, y: -100 })
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

// ── Chargement d'une page ─────────────────────────────────────
// Hauteur d'un écran : le pied de page reste hors de la vue pendant le chargement de la page,
// il ne « saute » donc pas à son arrivée (décalage de mise en page évité).
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[100svh]" role="status" aria-label="Chargement de la page">
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
  const navigate = useNavigate();

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
            <Route path="/sitemap"                element={<SitePlanPage />} />

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
            <Route path="/latex-cv-editor"             element={<LaTeXCVEditor />} />
            
            <Route path="/cv-generator"           element={<CVGenerator onGoHome={() => navigate('/')} />} />
            <Route path="/file-converter"         element={<FileConverter />} />

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
// Pas d'écran d'attente artificiel : la première page s'affiche dès que son code est prêt.
function App() {
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