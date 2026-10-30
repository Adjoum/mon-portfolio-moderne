// Historique d'audit : qui, quoi, quand, avant et après (jamais de clé, seulement son empreinte)
import { useCallback, useEffect, useState } from 'react'
import { aiAdmin, type AuditEntry } from '../api'
import { formatDate } from '../format'
import { Badge, Button, Card } from '../ui'

const ACTIONS: Record<string, string> = {
  'provider.key.set':    'Clé enregistrée',
  'provider.key.delete': 'Clé supprimée',
  'provider.enabled':    'Fournisseur activé / désactivé',
  'provider.check':      'Test de connexion',
  'models.sync':         'Catalogue actualisé',
  'models.sync.failed':  'Actualisation en échec',
  'model.add':           'Modèle ajouté',
  'model.delete':        'Modèle supprimé',
  'model.restore':       'Modèle restauré',
  'model.status':        'Modèle activé / désactivé',
  'model.pricing':       'Tarif modifié',
  'model.test':          'Test de compatibilité',
  'assignment.update':   'Affectation modifiée',
  'quota.update':        'Quotas modifiés',
  'budget.update':       'Budget modifié',
}

const json = (value: unknown) => (value === null || value === undefined ? '—' : JSON.stringify(value, null, 1))

export default function AuditSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [more, setMore] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (beforeId?: number) => {
    setLoading(true)
    try {
      const page = await aiAdmin.audit(beforeId)
      setEntries(current => (beforeId ? [...current, ...page] : page))
      setMore(page.length === 50)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <Card title="Journal d’audit" actions={<Button busy={loading && !entries.length} onClick={() => void load()}>Actualiser</Button>}>
      <p className="text-sm text-gray-400">Chaque modification est enregistrée dans la même transaction que la modification elle-même, en ajout seul.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <ul className="divide-y divide-white/5">
        {entries.map(e => (
          <li key={e.id} className="py-3">
            <details>
              <summary className="cursor-pointer flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-400 w-32">{formatDate(e.at)}</span>
                <Badge tone="indigo">{ACTIONS[e.action] ?? e.action}</Badge>
                <span className="text-gray-200 font-mono text-xs break-all">{e.entityId}</span>
                <span className="text-gray-500 text-xs">par {e.actorId.slice(0, 8)}…</span>
              </summary>
              <div className="grid gap-2 md:grid-cols-2 mt-2">
                <pre className="text-xs bg-black/30 rounded-lg p-3 overflow-x-auto text-gray-300"><span className="text-gray-500">Avant</span>{'\n'}{json(e.before)}</pre>
                <pre className="text-xs bg-black/30 rounded-lg p-3 overflow-x-auto text-gray-300"><span className="text-gray-500">Après</span>{'\n'}{json(e.after)}</pre>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {more && entries.length > 0 && (
        <Button busy={loading} onClick={() => void load(entries.at(-1)?.id)}>Afficher les entrées précédentes</Button>
      )}
    </Card>
  )
}
