// Zone d'administration, chargée seulement après reconnaissance du segment (src/lib/adminRoute.ts).
//   /<segment>            dashboard (Supabase Auth + TOTP + session de 10 min)
//   /<segment>/knowledge  base de connaissances du Clone IA
//   /<segment>/blog       connexion à l'éditeur du blog
// Les anciennes adresses (/admin, /admin/knowledge, /blog-admin) affichent la page 404.
import { lazy } from 'react'
import { useLocation } from 'react-router-dom'
import { AdminBaseContext } from './adminBase'
import { useNoIndex } from '../../hooks/useNoIndex'

const AdminDashboard = lazy(() => import('../../hooks/AdminDashboard'))
const KnowledgeAdmin = lazy(() => import('../../pages/KnowledgeAdmin'))
const AdminLoginPage = lazy(() => import('../../pages/AdminLoginPage'))
const NotFoundPage   = lazy(() => import('../../pages/NotFoundPage'))

export default function AdminArea({ base }: { base: string }) {
  const { pathname } = useLocation()
  useNoIndex({ noReferrer: true })

  const rest = pathname.slice(base.length).replace(/\/+$/, '')
  const page =
    rest === ''           ? <AdminDashboard /> :
    rest === '/knowledge' ? <KnowledgeAdmin /> :
    rest === '/blog'      ? <AdminLoginPage /> :
    <NotFoundPage />

  return <AdminBaseContext.Provider value={base}>{page}</AdminBaseContext.Provider>
}
