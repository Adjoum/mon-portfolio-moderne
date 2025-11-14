import React, { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

// ✅ Components chargés immédiatement (critiques)
import Navigation from './components/Navigation'
import Footer from './components/Footer'

// ✅ Pages avec LAZY LOADING (chargées à la demande)
const HomePage = lazy(() => import('./pages/HomePage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const SkillsPage = lazy(() => import('./pages/SkillsPage'))
const CVPage = lazy(() => import('./pages/CVPage'))
const AILabPage = lazy(() => import('./pages/AILabPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))





// Custom cursor component
const CustomCursor: React.FC = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dotPosition, setDotPosition] = useState({ x: 0, y: 0 })
  const [isPointer, setIsPointer] = useState(false)

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

// ✅ Loading screen avec spinner élégant
const LoadingScreen: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-xl text-gray-400 animate-pulse">Chargement...</p>
      </div>
    </div>
  )
}

// ✅ Loader pour les pages lazy (plus léger)
const PageLoader: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
      </div>
    </div>
  )
}

// Scroll to top on route change
const ScrollToTop: React.FC = () => {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

  return null
}

// Animated Routes wrapper
const AnimatedRoutes: React.FC = () => {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<PageLoader />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/cv" element={<CVPage />} />
          <Route path="/ai-lab" element={<AILabPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  )
}

function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate initial loading
    setTimeout(() => setLoading(false), 2000)
  }, [])

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <Router>
      <div className="app-container">
        <CustomCursor />
        <Navigation />
        <ScrollToTop />
        <AnimatedRoutes />
        <Footer />
      </div>
    </Router>
  )
}

export default App
























// import React, { useEffect, useState } from 'react'
// import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
// import { AnimatePresence } from 'framer-motion'

// // Components
// import Navigation from './components/Navigation'
// import Footer from './components/Footer'

// // Pages
// import HomePage from './pages/HomePage'
// import AboutPage from './pages/AboutPage'
// import ProjectsPage from './pages/ProjectsPage'
// import SkillsPage from './pages/SkillsPage'
// import CVPage from './pages/CVPage'
// import AILabPage from './pages/AILabPage'
// import ContactPage from './pages/ContactPage'
// import AdminDashboard from './pages/AdminDashboard'

// // Custom cursor component
// const CustomCursor: React.FC = () => {
//   const [position, setPosition] = useState({ x: 0, y: 0 })
//   const [dotPosition, setDotPosition] = useState({ x: 0, y: 0 })
//   const [isPointer, setIsPointer] = useState(false)

//   useEffect(() => {
//     const handleMouseMove = (e: MouseEvent) => {
//       setPosition({ x: e.clientX, y: e.clientY })
//       setTimeout(() => setDotPosition({ x: e.clientX, y: e.clientY }), 100)

//       const target = e.target as HTMLElement
//       setIsPointer(
//         window.getComputedStyle(target).cursor === 'pointer' ||
//         target.tagName === 'BUTTON' ||
//         target.tagName === 'A'
//       )
//     }

//     window.addEventListener('mousemove', handleMouseMove)
//     return () => window.removeEventListener('mousemove', handleMouseMove)
//   }, [])

//   return (
//     <>
//       <div
//         className="custom-cursor hidden lg:block"
//         style={{
//           left: `${position.x}px`,
//           top: `${position.y}px`,
//           transform: `translate(-50%, -50%) scale(${isPointer ? 1.5 : 1})`,
//         }}
//       />
//       <div
//         className="custom-cursor-dot hidden lg:block"
//         style={{
//           left: `${dotPosition.x}px`,
//           top: `${dotPosition.y}px`,
//           transform: 'translate(-50%, -50%)',
//         }}
//       />
//     </>
//   )
// }

// // Loading screen component
// const LoadingScreen: React.FC = () => {
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark">
//       <div className="text-center">
//         <div className="loader mb-4" />
//         <p className="text-xl gradient-text font-semibold">Chargement...</p>
//       </div>
//     </div>
//   )
// }

// // Scroll to top on route change
// const ScrollToTop: React.FC = () => {
//   const location = useLocation()

//   useEffect(() => {
//     window.scrollTo({ top: 0, behavior: 'smooth' })
//   }, [location.pathname])

//   return null
// }

// // Animated Routes wrapper
// const AnimatedRoutes: React.FC = () => {
//   const location = useLocation()

//   return (
//     <AnimatePresence mode="wait">
//       <Routes location={location} key={location.pathname}>
//         <Route path="/" element={<HomePage />} />
//         <Route path="/about" element={<AboutPage />} />
//         <Route path="/projects" element={<ProjectsPage />} />
//         <Route path="/skills" element={<SkillsPage />} />
//         <Route path="/cv" element={<CVPage />} />
//         <Route path="/ai-lab" element={<AILabPage />} />
//         <Route path="/contact" element={<ContactPage />} />
//         <Route path="/admin" element={<AdminDashboard />} />
//       </Routes>
//     </AnimatePresence>
//   )
// }

// function App() {
//   const [loading, setLoading] = useState(true)

//   useEffect(() => {
//     // Simulate initial loading
//     setTimeout(() => setLoading(false), 2000)
//   }, [])

//   if (loading) {
//     return <LoadingScreen />
//   }

//   return (
//     <Router>
//       <div className="App relative">
//         <CustomCursor />
//         <ScrollToTop />
//         <Navigation />
//         <AnimatedRoutes />
//         <Footer />
//       </div>
//     </Router>
//   )
// }

// export default App