// Assistants et fonctionnalités : une affectation indépendante par fonctionnalité
// (fournisseur, modèle, paramètres, activation), testée avant toute activation.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlaskConical, Plus, Save, Settings2 } from 'lucide-react'
import { aiAdmin, PROVIDER_IDS, type Catalog, type FeatureState, type Overview, type ProviderId } from '../api'
import { BLOCKERS, CAPABILITIES, KEY_STATUS, MODEL_STATUS, PARAM_LABELS, REASONING_LEVELS, featureLabel, formatDate, formatUsd } from '../format'
import { Badge, Button, Card, Field, NoticeBanner } from '../ui'
import { inputClass } from '../styles'
import { useServerAction } from '../useServerAction'

const NEW_MODEL = '__nouveau__'

type Params = Record<string, number | string>

function ParamsEditor({ supported, params, onChange, idPrefix }: { supported: string[]; params: Params; onChange: (p: Params) => void; idPrefix: string }) {
  const set = (name: string, raw: string) => {
    const next = { ...params }
    if (raw === '') delete next[name]
    else next[name] = name === 'stop' || name === 'reasoning_effort' ? raw : Number(raw)
    onChange(next)
  }
  if (!supported.length) return <p className="text-sm text-gray-400">Ce fournisseur ne propose aucun paramètre réglable.</p>
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {supported.map(name => {
        const id = `${idPrefix}-${name}`
        const value = params[name] === undefined ? '' : String(params[name])
        return (
          <Field key={name} label={PARAM_LABELS[name] ?? name} htmlFor={id} hint="Vide : valeur par défaut du fournisseur">
            {name === 'reasoning_effort'
              ? (
                <select id={id} value={value} onChange={e => set(name, e.target.value)} className={inputClass}>
                  <option value="">Par défaut</option>
                  {REASONING_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              )
              : (
                <input id={id} value={value} onChange={e => set(name, e.target.value)} className={inputClass}
                  type={name === 'stop' ? 'text' : 'number'} step={['top_k', 'seed'].includes(name) ? 1 : 0.05} />
              )}
          </Field>
        )
      })}
    </div>
  )
}

function AssignmentEditor({ feature, overview, reload, onClose }: { feature: FeatureState; overview: Overview; reload: () => Promise<unknown>; onClose: () => void }) {
  const [providerId, setProviderId] = useState<ProviderId>(feature.providerId)
  const [modelId, setModelId] = useState<string>(feature.modelId ?? '')
  const [params, setParams] = useState<Params>(feature.params)
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(feature.maxOutputTokens))
  const [timeoutSec, setTimeoutSec] = useState(String(Math.round(feature.timeoutMs / 1000)))
  const [enabled, setEnabled] = useState(feature.enabled)
  const [newModel, setNewModel] = useState('')
  const [billingOk, setBillingOk] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)

  const loadCatalog = useCallback(async () => { setCatalog(await aiAdmin.models(providerId).catch(() => ({ models: [], excluded: [] }))) }, [providerId])
  useEffect(() => { void loadCatalog() }, [loadCatalog])
  const { busy, notice, setNotice, run } = useServerAction(useCallback(() => Promise.all([reload(), loadCatalog()]), [reload, loadCatalog]))

  const provider = overview.providers.find(p => p.id === providerId)!
  const supported = overview.paramsByProvider[providerId] ?? []
  const selectable = useMemo(() => (catalog?.models ?? []).filter(m => (m.status !== 'disabled' && m.status !== 'incompatible') || m.modelId === feature.modelId), [catalog, feature.modelId])
  const selected = catalog?.models.find(m => m.modelId === modelId)
  const compat = selected?.compat.find(c => c.featureId === feature.id)
  const id = `assign-${feature.id.replace(/\W/g, '-')}`

  const changeProvider = (next: ProviderId) => {
    setProviderId(next)
    setModelId('')
    // Les paramètres non pris en charge par le nouveau fournisseur sont retirés
    const allowed = overview.paramsByProvider[next] ?? []
    setParams(Object.fromEntries(Object.entries(params).filter(([k]) => allowed.includes(k))))
  }

  const addModel = async () => {
    const value = newModel.trim()
    if (!value) return
    const done = await run('add', () => aiAdmin.addModel(providerId, value), `« ${value} » ajouté au catalogue ${provider.displayName}.`)
    if (done !== undefined) { setModelId(value); setNewModel('') }
  }

  const save = () => run('save', () => aiAdmin.saveAssignment(feature.id, {
    providerId, modelId: modelId || null, params,
    maxOutputTokens: Number(maxOutputTokens), timeoutMs: Number(timeoutSec) * 1000, enabled, version: feature.version,
  }), enabled ? `${featureLabel(feature.id)} : configuration enregistrée et active.` : `${featureLabel(feature.id)} : configuration enregistrée (fonctionnalité inactive).`)

  const test = () => run('test', () => aiAdmin.testFeature(feature.id, providerId, modelId, params), r => r.status === 'compatible'
    ? `Test réussi (${r.capabilities.map(c => CAPABILITIES[c] ?? c).join(', ')}) en ${r.latencyMs} ms · coût estimé ${formatUsd(r.estimatedCostMicroUsd)}.`
    : `Modèle incompatible avec cette fonctionnalité (${r.code ?? 'réponse inexploitable'}) : capacités validées ${r.capabilities.map(c => CAPABILITIES[c] ?? c).join(', ') || 'aucune'}.`)

  return (
    <div className="space-y-4 border-t border-white/10 pt-4" id={`${id}-editor`}>
      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <p className="text-sm text-gray-400">
        Capacités requises : {feature.requiredCapabilities.map(c => CAPABILITIES[c] ?? c).join(', ')}
        {feature.personalData && ' · envoie des données personnelles au fournisseur choisi'}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Fournisseur" htmlFor={`${id}-provider`}>
          <select id={`${id}-provider`} value={providerId} onChange={e => changeProvider(e.target.value as ProviderId)} className={inputClass}>
            {PROVIDER_IDS.map(p => {
              const state = overview.providers.find(x => x.id === p)!
              return <option key={p} value={p}>{state.displayName} — {state.keyStatus === 'valid' && !state.enabled ? 'désactivé' : KEY_STATUS[state.keyStatus].toLowerCase()}</option>
            })}
          </select>
        </Field>
        <Field label="Modèle" htmlFor={`${id}-model`}>
          <select id={`${id}-model`} value={modelId} onChange={e => setModelId(e.target.value === NEW_MODEL ? NEW_MODEL : e.target.value)} className={inputClass}>
            <option value="">— Choisir un modèle —</option>
            {selectable.map(m => <option key={m.modelId} value={m.modelId}>{m.modelId} ({MODEL_STATUS[m.status].toLowerCase()})</option>)}
            <option value={NEW_MODEL}>+ Saisir un nouvel identifiant…</option>
          </select>
        </Field>
      </div>

      {modelId === NEW_MODEL && (
        <div className="flex flex-col sm:flex-row gap-2">
          <label htmlFor={`${id}-new`} className="sr-only">Nouvel identifiant de modèle</label>
          <input id={`${id}-new`} value={newModel} onChange={e => setNewModel(e.target.value)} maxLength={200} spellCheck={false}
            placeholder={`Identifiant exact chez ${provider.displayName}`} className={`${inputClass} font-mono`} />
          <Button busy={busy === 'add'} disabled={!newModel.trim() || !!busy} onClick={addModel}><Plus size={16} /> Ajouter au catalogue</Button>
        </div>
      )}

      {selected && (
        <p className="text-sm">
          {compat?.status === 'compatible' && <Badge tone="green">Testé compatible le {formatDate(compat.testedAt)}</Badge>}
          {compat?.status === 'incompatible' && <Badge tone="red">Incompatible (test du {formatDate(compat.testedAt)})</Badge>}
          {!compat && <Badge tone="amber">Jamais testé pour cette fonctionnalité</Badge>}
          {!selected.pricing && <> <Badge tone="amber">Tarif à saisir dans le catalogue</Badge></>}
        </p>
      )}

      <ParamsEditor supported={supported} params={params} onChange={setParams} idPrefix={id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tokens de sortie maximum" htmlFor={`${id}-tokens`}>
          <input id={`${id}-tokens`} type="number" min={1} max={200000} value={maxOutputTokens} onChange={e => setMaxOutputTokens(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Délai maximal (secondes)" htmlFor={`${id}-timeout`} hint="Entre 1 et 120 s">
          <input id={`${id}-timeout`} type="number" min={1} max={120} value={timeoutSec} onChange={e => setTimeoutSec(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={billingOk} onChange={e => setBillingOk(e.target.checked)} className="mt-1" />
          Je comprends que le test envoie de petites requêtes réelles au fournisseur, potentiellement facturées.
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Fonctionnalité active
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button busy={busy === 'test'} disabled={!!busy || !modelId || modelId === NEW_MODEL || !billingOk} onClick={test}>
          <FlaskConical size={16} /> Tester la configuration
        </Button>
        <Button variant="primary" busy={busy === 'save'} disabled={!!busy || modelId === NEW_MODEL} onClick={save}>
          <Save size={16} /> Enregistrer
        </Button>
        <Button onClick={onClose}>Fermer</Button>
      </div>
    </div>
  )
}

export default function AssignmentsSection({ overview, reload, openFeature, onOpenFeature }: {
  overview: Overview; reload: () => Promise<unknown>; openFeature: string | null; onOpenFeature: (id: string | null) => void
}) {
  return (
    <div className="space-y-4">
      {overview.features.map(f => {
        const provider = overview.providers.find(p => p.id === f.providerId)
        const open = openFeature === f.id
        return (
          <Card key={f.id} className={open ? 'ring-1 ring-primary/50' : ''}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h4 className="text-lg font-semibold text-white">{featureLabel(f.id)}</h4>
                <p className="text-xs text-gray-500">{f.section} · {f.id}</p>
                <p className="text-sm text-gray-300 break-all">
                  {provider?.displayName} · <span className="font-mono">{f.modelId ?? 'aucun modèle'}</span>
                </p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {f.enabled && !f.blocker && <Badge tone="green">Actif</Badge>}
                  {f.enabled && f.blocker && <Badge tone="amber" title={BLOCKERS[f.blocker]}>Bloqué : {BLOCKERS[f.blocker].toLowerCase()}</Badge>}
                  {!f.enabled && <Badge>Inactif{f.blocker ? ` · ${BLOCKERS[f.blocker].toLowerCase()}` : ''}</Badge>}
                  <Badge tone={f.compat?.status === 'compatible' ? 'green' : f.compat ? 'red' : 'gray'}>
                    Dernier test : {f.compat ? `${f.compat.status === 'compatible' ? 'réussi' : 'incompatible'} le ${formatDate(f.compat.testedAt)}` : 'aucun'}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Quotas : {f.quotas.perSubjectPerDay} / visiteur / jour · {f.quotas.globalPerDay} / jour au total · {f.quotas.perMinute} / minute ·
                  aujourd’hui {f.usage.dayRequests} requête(s), {formatUsd(f.usage.dayCostMicroUsd)}
                </p>
              </div>
              <Button variant={open ? 'secondary' : 'primary'} onClick={() => onOpenFeature(open ? null : f.id)} aria-expanded={open}>
                <Settings2 size={16} /> Configurer
              </Button>
            </div>
            {open && <AssignmentEditor key={f.id} feature={f} overview={overview} reload={reload} onClose={() => onOpenFeature(null)} />}
          </Card>
        )
      })}
    </div>
  )
}
