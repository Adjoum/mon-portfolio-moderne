// Statistiques : requêtes, erreurs, refus, tokens et coût estimé (aucun contenu n'est conservé)
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { aiAdmin, type Usage } from '../api'
import { featureLabel, formatDate, formatTokens, formatUsd } from '../format'
import { Badge, Button, Card } from '../ui'

const PERIODS = [{ days: 1, label: '24 h' }, { days: 7, label: '7 jours' }, { days: 30, label: '30 jours' }, { days: 90, label: '90 jours' }]

export default function UsageSection() {
  const [days, setDays] = useState(7)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsage(await aiAdmin.usage(days))
      setError('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [days])
  useEffect(() => { void load() }, [load])

  const maxCost = Math.max(1, ...(usage?.byDay.map(d => d.costMicroUsd) ?? []))
  const total = usage?.byFeature.reduce((acc, r) => ({ requests: acc.requests + r.requests, cost: acc.cost + r.costMicroUsd }), { requests: 0, cost: 0 })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(p => (
          <button key={p.days} type="button" onClick={() => setDays(p.days)} aria-pressed={days === p.days}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${days === p.days ? 'bg-gradient-to-r from-primary to-secondary text-white' : 'glass-effect text-gray-300 hover:text-white'}`}>
            {p.label}
          </button>
        ))}
        <Button busy={loading} onClick={() => void load()}><RefreshCw size={16} /> Actualiser</Button>
      </div>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {usage && total && (
        <>
          <Card title={`Total : ${total.requests} requête(s) · ${formatUsd(total.cost)} estimés`}>
            {usage.byDay.length === 0 && <p className="text-gray-400">Aucune activité sur la période.</p>}
            <ul className="space-y-1">
              {usage.byDay.map(d => (
                <li key={d.day} className="grid grid-cols-[6rem_1fr_7rem] gap-2 items-center text-sm">
                  <span className="text-gray-400">{d.day}</span>
                  <span className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <span className="block h-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${Math.max(2, (d.costMicroUsd / maxCost) * 100)}%` }} />
                  </span>
                  <span className="text-gray-300 text-right">{d.requests} · {formatUsd(d.costMicroUsd)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Par fonctionnalité et modèle">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-400">
                  <tr><th className="py-2 pr-3">Fonctionnalité</th><th className="pr-3">Modèle</th><th className="pr-3">Requêtes</th><th className="pr-3">Erreurs</th><th className="pr-3">Refus</th><th className="pr-3">Tokens</th><th className="pr-3">Latence</th><th>Coût</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-gray-200">
                  {usage.byFeature.map(r => (
                    <tr key={`${r.featureId}-${r.providerId}-${r.modelId}`}>
                      <td className="py-2 pr-3">{featureLabel(r.featureId)}</td>
                      <td className="pr-3 font-mono text-xs break-all">{r.providerId ? `${r.providerId} · ${r.modelId}` : '—'}</td>
                      <td className="pr-3">{r.requests}</td>
                      <td className="pr-3">{r.errors}</td>
                      <td className="pr-3">{r.blocked}</td>
                      <td className="pr-3">{formatTokens(r.inputTokens + r.outputTokens)}</td>
                      <td className="pr-3">{r.avgLatencyMs ? `${r.avgLatencyMs} ms` : '—'}</td>
                      <td>{formatUsd(r.costMicroUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Derniers événements">
            <ul className="divide-y divide-white/5 text-sm">
              {usage.recent.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-2 flex flex-wrap items-center gap-2">
                  <span className="text-gray-400 w-32">{formatDate(e.at)}</span>
                  <Badge tone={e.outcome === 'ok' ? 'green' : e.outcome === 'blocked' ? 'amber' : 'red'}>{e.outcome === 'ok' ? 'Réussi' : e.outcome === 'blocked' ? 'Refusé' : 'Erreur'}</Badge>
                  {e.kind === 'probe' && <Badge tone="indigo">Test</Badge>}
                  <span className="text-gray-200">{featureLabel(e.featureId)}</span>
                  {e.code && <span className="text-xs text-gray-400 font-mono">{e.code}</span>}
                  <span className="ml-auto text-gray-400">{e.costMicroUsd ? formatUsd(e.costMicroUsd) : ''}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
