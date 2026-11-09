// Zone d'administration, chargée seulement après reconnaissance du segment (src/lib/adminRoute.ts).
//   /<segment>            dashboard (Supabase Auth + TOTP + session de 10 min)
//   /<segment>/knowledge  base de connaissances du Clone IA
//   /<segment>/blog       même garde que le dashboard, puis l'éditeur du blog (/blog/new)
// Les anciennes adresses (/admin, /admin/knowledge, /blog-admin) affichent la page 404.
// Le blog n'a plus de connexion propre (compte MongoDB, mot de passe seul) : ses écritures
// exigent l'administrateur Supabase avec MFA, côté serveur comme ici.
import { lazy } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AdminBaseContext } from './adminBase'
import { useNoIndex } from '../../hooks/useNoIndex'

const AdminDashboard = lazy(() => import('../../hooks/AdminDashboard'))
const KnowledgeAdmin = lazy(() => import('../../pages/KnowledgeAdmin'))
const AdminGate      = lazy(() => import('./AdminGate'))
const NotFoundPage   = lazy(() => import('../../pages/NotFoundPage'))

export default function AdminArea({ base }: { base: string }) {
  const { pathname } = useLocation()
  useNoIndex({ noReferrer: true })

  const rest = pathname.slice(base.length).replace(/\/+$/, '')
  const page =
    rest === ''           ? <AdminDashboard /> :
    rest === '/knowledge' ? <KnowledgeAdmin /> :
    rest === '/blog'      ? <AdminGate><Navigate to="/blog/new" replace /></AdminGate> :
    <NotFoundPage />

  return <AdminBaseContext.Provider value={base}>{page}</AdminBaseContext.Provider>
}
