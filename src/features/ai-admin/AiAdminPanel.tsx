// src/features/ai-admin/AiAdminPanel.tsx
// Rubrique « Intelligence artificielle » du dashboard (chargée à la demande, sous AdminGate).
// La vue est toujours relue depuis le serveur : aucune configuration n'est conservée localement.

import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Boxes, Gauge, History, KeyRound, LayoutDashboard, Workflow } from 'lucide-react'
import { aiAdmin, AiAdminError, type Overview, type ProviderId } from './api'
import OverviewSection from './sections/OverviewSection'
import ProvidersSection from './sections/ProvidersSection'
import CatalogSection from './sections/CatalogSection'
import AssignmentsSection from './sections/AssignmentsSection'
import BudgetsSection from './sections/BudgetsSection'
import UsageSection from './sections/UsageSection'
import AuditSection from './sections/AuditSection'
import { Button } from './ui'

const TABS = [
  { id: 'overview',    label: 'Vue d’ensemble',             icon: LayoutDashboard },
  { id: 'providers',   label: 'Fournisseurs et clés',        icon: KeyRound },
  { id: 'catalog',     label: 'Catalogue des modèles',       icon: Boxes },
  { id: 'assignments', label: 'Assistants et affectations',  icon: Workflow },
  { id: 'budgets',     label: 'Quotas et budgets',           icon: Gauge },
  { id: 'usage',       label: 'Statistiques',                icon: BarChart3 },
  { id: 'audit',       label: 'Historique',                  icon: History },
] as const
type Tab = (typeof TABS)[number]['id']

export default function AiAdminPanel() {
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<AiAdminError | null>(null)
  const [catalogProvider, setCatalogProvider] = useState<ProviderId>('openai')
  const [openFeature, setOpenFeature] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setOverview(await aiAdmin.overview())
      setError(null)
    } catch (err) {
      setError(err as AiAdminError)
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const openCatalog = (id: ProviderId) => { setCatalogProvider(id); setTab('catalog') }
  const configure = (id: string) => { setOpenFeature(id); setTab('assignments') }

  return (
    <div className="glass-effect-dark p-4 sm:p-8 rounded-2xl space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-white">Intelligence artificielle</h3>
        <p className="text-gray-400 text-sm">Fournisseurs, modèles, assistants, quotas et budgets : chaque modification est enregistrée dans Supabase et s’applique dès la requête suivante.</p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Rubriques du centre IA">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
            className={`px-3 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-all ${tab === id ? 'bg-gradient-to-r from-primary to-secondary text-white' : 'glass-effect text-gray-300 hover:text-white'}`}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-500/10 text-red-300 space-y-2">
          <p>{error.code === 'AI_NOT_MIGRATED' ? 'Les migrations du centre IA ne sont pas encore appliquées sur Supabase.' : error.message}</p>
          <Button onClick={() => void reload()}>Réessayer</Button>
        </div>
      )}
      {!overview && !error && <p className="text-gray-400">Chargement…</p>}

      {overview && tab === 'overview' && <OverviewSection overview={overview} onConfigure={configure} />}
      {overview && tab === 'providers' && <ProvidersSection overview={overview} reload={reload} onOpenCatalog={openCatalog} />}
      {overview && tab === 'catalog' && <CatalogSection overview={overview} reload={reload} provider={catalogProvider} onProvider={setCatalogProvider} />}
      {overview && tab === 'assignments' && <AssignmentsSection overview={overview} reload={reload} openFeature={openFeature} onOpenFeature={setOpenFeature} />}
      {overview && tab === 'budgets' && <BudgetsSection overview={overview} reload={reload} />}
      {tab === 'usage' && <UsageSection />}
      {tab === 'audit' && <AuditSection />}
    </div>
  )
}
