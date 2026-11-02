// Adresse de base de l'administration (« /<segment> »), connue seulement une fois le segment
// reconnu (src/lib/adminRoute.ts) : les liens internes du dashboard en dérivent, jamais d'une
// constante du bundle.
import { createContext, useContext } from 'react'

export const AdminBaseContext = createContext<string | null>(null)

/** Chemin d'une page d'administration (« knowledge » → « /<segment>/knowledge ») */
export function useAdminPath(sub = ''): string {
  const base = useContext(AdminBaseContext)
  // Hors de la zone d'administration : accueil, jamais une adresse devinable
  if (!base) return '/'
  return sub ? `${base}/${sub}` : base
}
