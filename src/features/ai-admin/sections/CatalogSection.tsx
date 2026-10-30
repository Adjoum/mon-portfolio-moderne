// Catalogue des modèles par fournisseur : actualisation depuis l'API officielle, ajout manuel,
// suppression définitive (exclusion persistante), restauration, désactivation, tarifs.
import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, RotateCcw, X } from 'lucide-react'
import { aiAdmin, PROVIDER_IDS, type Catalog, type CatalogModel, type Overview, type ProviderId } from '../api'
import { MODEL_ORIGIN, MODEL_STATUS, featureLabel, formatDate, formatTokens, perMTok } from '../format'
import { Badge, Button, Card, Field, NoticeBanner } from '../ui'
import { inputClass } from '../styles'
import { useServerAction } from '../useServerAction'

const STATUS_TONE = { available: 'green', unverified: 'amber', incompatible: 'red', deprecated: 'gray', disabled: 'gray' } as const

function PricingForm({ model, onSave, busy }: { model: CatalogModel; onSave: (input: number, output: number) => void; busy: boolean }) {
  const [input, setInput] = useState(model.pricing ? String(model.pricing.inputPerMTok / 1e6) : '')
  const [output, setOutput] = useState(model.pricing ? String(model.pricing.outputPerMTok / 1e6) : '')
  const id = `price-${model.modelId.replace(/[^A-Za-z0-9]/g, '-')}`
  return (
    <form className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end" onSubmit={e => { e.preventDefault(); onSave(Number(input), Number(output)) }}>
      <Field label="Entrée ($ / M tokens)" htmlFor={`${id}-in`}>
        <input id={`${id}-in`} type="number" min="0" step="any" required value={input} onChange={e => setInput(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Sortie ($ / M tokens)" htmlFor={`${id}-out`}>
        <input id={`${id}-out`} type="number" min="0" step="any" required value={output} onChange={e => setOutput(e.target.value)} className={inputClass} />
      </Field>
      <Button type="submit" variant="primary" busy={busy}>Enregistrer le tarif</Button>
    </form>
  )
}

function ModelRow({ provider, model, busy, run }: {
  provider: ProviderId; model: CatalogModel; busy: string | null
  run: ReturnType<typeof useServerAction>['run']
}) {
  const [editPrice, setEditPrice] = useState(false)
  const active = model.usedBy.filter(u => u.enabled)
  const key = model.modelId

  const remove = () => {
    if (active.length) {
      alert(`Ce modèle est utilisé par : ${active.map(u => featureLabel(u.featureId)).join(', ')}.\nRéaffectez ou désactivez ces fonctionnalités avant de le supprimer.`)
      return
    }
    if (!confirm(`Supprimer « ${key} » du catalogue local ?\nIl ne sera plus réintroduit par les actualisations, sauf restauration. Le catalogue du fournisseur n’est pas modifié.`)) return
    void run(`delete:${key}`, () => aiAdmin.deleteModel(provider, key), `« ${key} » supprimé et exclu des prochaines actualisations.`)
  }

  return (
    <li className="py-3 space-y-2" data-model={key}>
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-white font-mono text-sm break-all">{key}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={STATUS_TONE[model.status]}>{MODEL_STATUS[model.status]}</Badge>
            <Badge tone={model.origin === 'manual' ? 'sky' : 'gray'}>{MODEL_ORIGIN[model.origin]}</Badge>
            {model.vision === true && <Badge tone="indigo">Image</Badge>}
            {model.vision === false && <Badge>Sans image</Badge>}
            {model.shutdownDate && <Badge tone="amber">Retrait {model.shutdownDate}</Badge>}
          </div>
          <p className="text-xs text-gray-400">
            Contexte {formatTokens(model.contextWindow)} · sortie max {formatTokens(model.maxOutputTokens)} ·{' '}
            {model.pricing ? `${perMTok(model.pricing.inputPerMTok)} $ / ${perMTok(model.pricing.outputPerMTok)} $ par M tokens` : <span className="text-amber-300">tarif inconnu</span>}
            {model.lastVerifiedAt && ` · testé le ${formatDate(model.lastVerifiedAt)}`}
          </p>
          {model.usedBy.length > 0 && (
            <p className="text-xs text-gray-400">Affecté à : {model.usedBy.map(u => `${featureLabel(u.featureId)}${u.enabled ? '' : ' (inactive)'}`).join(', ')}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setEditPrice(v => !v)} aria-expanded={editPrice}>Tarif</Button>
          <Button busy={busy === `toggle:${key}`} disabled={!!busy}
            onClick={() => run(`toggle:${key}`, () => aiAdmin.setModelDisabled(provider, key, model.status !== 'disabled'),
              model.status === 'disabled' ? `« ${key} » réactivé.` : `« ${key} » désactivé : il n’est plus sélectionnable.`)}>
            {model.status === 'disabled' ? 'Réactiver' : 'Désactiver'}
          </Button>
          <button
            type="button"
            onClick={remove}
            disabled={!!busy}
            title={`Supprimer ${key}`}
            aria-label={`Supprimer ${key}`}
            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-gray-400 hover:text-red-300 hover:bg-red-500/15 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {editPrice && (
        <PricingForm model={model} busy={busy === `price:${key}`}
          onSave={(input, output) => run(`price:${key}`, () => aiAdmin.setPricing(provider, key, input, output), `Tarif de « ${key} » enregistré.`)} />
      )}
    </li>
  )
}

export default function CatalogSection({ overview, reload, provider, onProvider }: {
  overview: Overview; reload: () => Promise<unknown>; provider: ProviderId; onProvider: (id: ProviderId) => void
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState('')
  const [manual, setManual] = useState('')

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await aiAdmin.models(provider))
      setLoadError('')
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [provider])

  const reloadAll = useCallback(() => Promise.all([reload(), loadCatalog()]), [reload, loadCatalog])
  const { busy, notice, setNotice, run } = useServerAction(reloadAll)

  useEffect(() => { setCatalog(null); setNotice(null); void loadCatalog() }, [loadCatalog, setNotice])

  const state = overview.providers.find(p => p.id === provider)!
  const freshness = !state.lastSyncAt
    ? { tone: 'amber' as const, text: 'Jamais actualisé : liste initiale non vérifiée auprès du fournisseur' }
    : state.lastSyncOk === false
      ? { tone: 'red' as const, text: `Dernière actualisation en échec (${formatDate(state.lastSyncAttemptAt)}) : liste vérifiée le ${formatDate(state.lastSyncAt)}` }
      : { tone: 'green' as const, text: `Actualisé le ${formatDate(state.lastSyncAt)} · ${state.lastSyncCount ?? 0} modèle(s) reçus` }

  const addManual = async () => {
    const id = manual.trim()
    if (!id) return
    const done = await run('add', () => aiAdmin.addModel(provider, id), `« ${id} » ajouté manuellement. Testez-le avant de l’activer.`)
    if (done !== undefined) setManual('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Fournisseur">
        {PROVIDER_IDS.map(id => (
          <button key={id} type="button" role="tab" aria-selected={id === provider} onClick={() => onProvider(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${id === provider ? 'bg-gradient-to-r from-primary to-secondary text-white' : 'glass-effect text-gray-300 hover:text-white'}`}>
            {overview.providers.find(p => p.id === id)?.displayName ?? id}
          </button>
        ))}
      </div>

      <Card
        title={`Modèles ${state.displayName}`}
        actions={
          <Button variant="primary" busy={busy === 'sync'} disabled={!!busy || state.keyStatus !== 'valid'}
            title={state.keyStatus !== 'valid' ? 'Enregistrez d’abord une clé valide' : undefined}
            onClick={() => run('sync', () => aiAdmin.syncModels(provider),
              r => `Catalogue actualisé : ${r.received} modèle(s) reçus, ${r.added} nouveau(x), ${r.deprecated} déprécié(s), ${r.excludedSkipped} exclu(s) ignoré(s).`)}>
            <RefreshCw size={16} /> Actualiser les modèles
          </Button>
        }
      >
        <p><Badge tone={freshness.tone}>{freshness.text}</Badge></p>
        <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
        {loadError && <p role="alert" className="text-red-300">{loadError}</p>}

        <form className="flex flex-col sm:flex-row gap-2" onSubmit={e => { e.preventDefault(); void addManual() }}>
          <label htmlFor="ai-manual-model" className="sr-only">Identifiant du modèle à ajouter</label>
          <input id="ai-manual-model" value={manual} onChange={e => setManual(e.target.value)} maxLength={200}
            placeholder="Identifiant exact du modèle (saisie libre)" className={`${inputClass} font-mono`} spellCheck={false} />
          <Button type="submit" busy={busy === 'add'} disabled={!manual.trim() || !!busy}><Plus size={16} /> Ajouter</Button>
        </form>

        {!catalog && !loadError && <p className="text-gray-400">Chargement…</p>}
        {catalog && catalog.models.length === 0 && <p className="text-gray-400">Aucun modèle pour ce fournisseur.</p>}
        {catalog && (
          <ul className="divide-y divide-white/5">
            {catalog.models.map(m => <ModelRow key={m.modelId} provider={provider} model={m} busy={busy} run={run} />)}
          </ul>
        )}
      </Card>

      {catalog && catalog.excluded.length > 0 && (
        <Card title="Exclus par l’administrateur">
          <p className="text-sm text-gray-400">Supprimés du catalogue local : les actualisations ne les réintroduisent pas.</p>
          <ul className="divide-y divide-white/5">
            {catalog.excluded.map(e => (
              <li key={e.modelId} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm text-gray-200 break-all">{e.modelId} <span className="text-xs text-gray-500">· exclu le {formatDate(e.excludedAt)}</span></span>
                <Button busy={busy === `restore:${e.modelId}`} disabled={!!busy}
                  onClick={() => run(`restore:${e.modelId}`, () => aiAdmin.restoreModel(provider, e.modelId), `« ${e.modelId} » restauré (non vérifié).`)}>
                  <RotateCcw size={16} /> Restaurer
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
