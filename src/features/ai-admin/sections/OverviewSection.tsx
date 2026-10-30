// Vue d'ensemble : budget consommé, état des fournisseurs et des assistants, alertes
import { AlertTriangle } from 'lucide-react'
import type { Overview } from '../api'
import { BLOCKERS, KEY_STATUS, featureLabel, formatDate, formatUsd, ratio } from '../format'
import { Badge, Card, Meter } from '../ui'

export default function OverviewSection({ overview, onConfigure }: { overview: Overview; onConfigure: (featureId: string) => void }) {
  const { budget, providers, features, runtime } = overview
  const active = features.filter(f => f.enabled && !f.blocker)
  const blocked = features.filter(f => f.enabled && f.blocker)
  const syncFailures = providers.filter(p => p.lastSyncOk === false)
  const rejectedKeys = providers.filter(p => p.keyStatus === 'invalid')

  const alerts = [
    !runtime.databaseConfigured && 'Le serveur n’est pas relié à la base (AI_DATABASE_URL absente) : aucune fonctionnalité IA ne peut s’exécuter.',
    ...rejectedKeys.map(p => `${p.displayName} : la clé a été refusée par le fournisseur. Remplacez-la.`),
    ...syncFailures.map(p => `${p.displayName} : dernière actualisation du catalogue en échec (${formatDate(p.lastSyncAttemptAt)}).`),
    ...blocked.map(f => `${featureLabel(f.id)} est activée mais ne peut pas s’exécuter : ${BLOCKERS[f.blocker!].toLowerCase()}.`),
  ].filter((a): a is string => !!a)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Assistants actifs">
          <p className="text-4xl font-bold text-white">{active.length}<span className="text-lg text-gray-400"> / {features.length}</span></p>
          <p className="text-sm text-gray-400">{budget.dayRequests} requête(s) aujourd’hui</p>
        </Card>
        <Card title="Fournisseurs configurés">
          <p className="text-4xl font-bold text-white">{providers.filter(p => p.keyStatus === 'valid' && p.enabled).length}<span className="text-lg text-gray-400"> / {providers.length}</span></p>
          <p className="text-sm text-gray-400">clé valide et fournisseur actif</p>
        </Card>
        <Card title="Dépense estimée">
          <Meter label="Aujourd’hui" used={ratio(budget.dayCostMicroUsd, budget.dailyLimitMicroUsd)} limit={100}
            text={`${formatUsd(budget.dayCostMicroUsd)} / ${formatUsd(budget.dailyLimitMicroUsd)}`} />
          <Meter label="Ce mois-ci" used={ratio(budget.monthCostMicroUsd, budget.monthlyLimitMicroUsd)} limit={100}
            text={`${formatUsd(budget.monthCostMicroUsd)} / ${formatUsd(budget.monthlyLimitMicroUsd)}`} />
        </Card>
      </div>

      <p className="text-xs text-gray-500">
        Coûts estimés à partir des tarifs enregistrés : ces limites internes ne remplacent pas les plafonds de facturation
        à définir dans la console de chaque fournisseur.
      </p>

      {alerts.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-300" /> Points d’attention</span>}>
          <ul className="space-y-2 text-sm text-amber-100">
            {alerts.map(a => <li key={a}>• {a}</li>)}
          </ul>
        </Card>
      )}

      <Card title="Assistants et fonctionnalités">
        <ul className="divide-y divide-white/5">
          {features.map(f => (
            <li key={f.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-white font-medium">{featureLabel(f.id)}</p>
                <p className="text-xs text-gray-400 break-all">{f.section} · {overview.providers.find(p => p.id === f.providerId)?.displayName} · {f.modelId ?? 'aucun modèle'}</p>
              </div>
              <div className="flex items-center gap-2">
                {f.enabled && !f.blocker && <Badge tone="green">Actif</Badge>}
                {f.enabled && f.blocker && <Badge tone="amber">Bloqué</Badge>}
                {!f.enabled && <Badge>Inactif</Badge>}
                <button type="button" onClick={() => onConfigure(f.id)} className="text-sm text-indigo-300 hover:text-white underline-offset-2 hover:underline">
                  Configurer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Fournisseurs">
        <div className="flex flex-wrap gap-2">
          {providers.map(p => (
            <Badge key={p.id} tone={p.keyStatus === 'valid' && p.enabled ? 'green' : p.keyStatus === 'invalid' ? 'red' : 'gray'}>
              {p.displayName} · {p.keyStatus === 'valid' && !p.enabled ? 'Désactivé' : KEY_STATUS[p.keyStatus]}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  )
}
