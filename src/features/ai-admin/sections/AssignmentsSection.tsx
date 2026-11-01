// Assistants et fonctionnalités : une affectation indépendante par fonctionnalité
// (fournisseur, modèle, paramètres, activation), testée avant toute activation.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlaskConical, Plus, Save, SearchCheck, Settings2 } from 'lucide-react'
import { aiAdmin, PROVIDER_IDS, type Catalog, type FeatureState, type ModelProfile, type Overview, type ProbeResult, type ProviderId, type TestEstimate } from '../api'
import {
  BLOCKERS, CAPABILITIES, CAPABILITY_STATES, KEY_STATUS, MODEL_STATUS, PARAM_LABELS, REASONING_LEVELS,
  compatState, featureLabel, formatDate, formatUsd, probeCode,
} from '../format'
import { probeNotice } from '../probeNotice'
import type { Notice } from '../useServerAction'
import { Badge, Button, Card, Field, NoticeBanner } from '../ui'
import { inputClass, selectClass } from '../styles'
import { useServerAction } from '../useServerAction'

const NEW_MODEL = '__nouveau__'

type Params = Record<string, number | string>

/** Indices de la matrice (documentation officielle) : jamais présentés comme une validation */
function ProfileHints({ profile }: { profile: ModelProfile | undefined }) {
  if (!profile) return null
  const hints = [
    profile.reasoning === true && 'modèle à raisonnement (la limite de sortie couvre la réflexion)',
    profile.reasoning === false && 'modèle sans raisonnement',
    profile.visionDocumented === true && 'image annoncée par la documentation officielle — à confirmer par le test',
    profile.visionDocumented === false && 'documenté sans entrée image',
    profile.endpoint === 'responses' && 'servi par l’API Responses',
    profile.rejectedParams.length > 0 && `refuse : ${profile.rejectedParams.map(p => PARAM_LABELS[p] ?? p).join(', ')}`,
    profile.samplingOnlyWithoutReasoning && 'température et top p seulement avec l’effort « none »',
    profile.reasoningEfforts && `efforts acceptés : ${profile.reasoningEfforts.join(', ')}`,
  ].filter(Boolean)
  return (
    <p className="text-xs text-gray-400" data-profile={profile.rule ?? 'défaut'}>
      Matrice {profile.matrixVersion} : {hints.length ? hints.join(' · ') : 'identifiant inconnu de la matrice, aucune capacité supposée'}
      {profile.source && <> · <a href={profile.source} target="_blank" rel="noreferrer noopener" className="underline">documentation</a></>}
    </p>
  )
}

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
                <select id={id} value={value} onChange={e => set(name, e.target.value)} className={selectClass}>
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
  const [estimate, setEstimate] = useState<TestEstimate | null>(null)
  const [lastProbe, setLastProbe] = useState<ProbeResult | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const loadCatalog = useCallback(async () => { setCatalog(await aiAdmin.models(providerId).catch(() => ({ models: [], excluded: [] }))) }, [providerId])
  useEffect(() => { void loadCatalog() }, [loadCatalog])
  const { busy, notice, setNotice, run } = useServerAction(useCallback(() => Promise.all([reload(), loadCatalog()]), [reload, loadCatalog]))
  useEffect(() => { if (notice) resultRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) }, [notice])

  const provider = overview.providers.find(p => p.id === providerId)!
  const supported = overview.paramsByProvider[providerId] ?? []
  const selectable = useMemo(() => (catalog?.models ?? []).filter(m => (m.status !== 'disabled' && m.status !== 'incompatible') || m.modelId === feature.modelId), [catalog, feature.modelId])
  const selected = catalog?.models.find(m => m.modelId === modelId)
  const compat = selected?.compat.find(c => c.featureId === feature.id)
  const id = `assign-${feature.id.replace(/\W/g, '-')}`
  const testable = !!modelId && modelId !== NEW_MODEL

  // Estimation gratuite du coût maximal, recalculée à chaque changement de modèle : l'autorisation porte sur ce montant
  useEffect(() => {
    setBillingOk(false)
    setEstimate(null)
    setLastProbe(null)
    if (!testable) return
    let live = true
    aiAdmin.testEstimate(feature.id, providerId, modelId).then(e => { if (live) setEstimate(e) }).catch(() => {})
    return () => { live = false }
  }, [feature.id, providerId, modelId, testable])

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

  const test = (allowUnlisted = false) => run('test', () => aiAdmin.testFeature(feature.id, providerId, modelId, params, allowUnlisted), r => {
    setLastProbe(r)
    // Une nouvelle autorisation est demandée avant chaque test facturé
    if (r.recorded) setBillingOk(false)
    return probeNotice(r)
  })

  const check = () => run('check', () => aiAdmin.checkModel(providerId, modelId), r => ({
    type: r.status === 'available' ? 'success' : r.status === 'unknown' ? 'warning' : 'error',
    text: `${r.status === 'available' ? CAPABILITY_STATES.available.label : r.status === 'not_listed' ? 'Absent du catalogue' : r.status === 'key_rejected' ? 'Clé refusée' : 'Non vérifié'} — ${r.message} Vérification gratuite, aucune génération.`,
  }) as Notice)

  /** Retire de l'affectation les paramètres que le test a montrés refusés */
  const dropRejected = () => {
    if (!lastProbe?.rejectedParams.length) return
    setParams(Object.fromEntries(Object.entries(params).filter(([k]) => !lastProbe.rejectedParams.includes(k))))
    setNotice({ type: 'warning', text: `Retiré de la configuration : ${lastProbe.rejectedParams.map(p => PARAM_LABELS[p] ?? p).join(', ')}. Enregistrez puis relancez le test.` })
    setLastProbe(null)
  }

  return (
    <div className="space-y-4 border-t border-white/10 pt-4" id={`${id}-editor`}>
      <p className="text-sm text-gray-400">
        Capacités requises : {feature.requiredCapabilities.map(c => CAPABILITIES[c] ?? c).join(', ')}
        {feature.personalData && ' · envoie des données personnelles au fournisseur choisi'}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Fournisseur"
          htmlFor={`${id}-provider`}
          hint={provider.keyStatus === 'valid' ? undefined : 'Aucune clé valide pour ce fournisseur : ajoutez-la dans la rubrique « Fournisseurs » avant de tester ou d’activer.'}
        >
          <select id={`${id}-provider`} value={providerId} onChange={e => changeProvider(e.target.value as ProviderId)} className={selectClass}>
            {/* Les six fournisseurs restent proposés ; ceux sans clé valide sont regroupés à part */}
            {([['Configurés', true], ['Sans clé valide (à configurer dans « Fournisseurs »)', false]] as const).map(([label, configured]) => {
              const states = PROVIDER_IDS.map(p => overview.providers.find(x => x.id === p)!).filter(state => (state.keyStatus === 'valid') === configured)
              return states.length > 0 && (
                <optgroup key={label} label={label}>
                  {states.map(state => (
                    <option key={state.id} value={state.id}>
                      {state.displayName} — {state.keyStatus === 'valid' && !state.enabled ? 'désactivé' : KEY_STATUS[state.keyStatus].toLowerCase()}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </Field>
        <Field label="Modèle" htmlFor={`${id}-model`}>
          <select id={`${id}-model`} value={modelId} onChange={e => setModelId(e.target.value === NEW_MODEL ? NEW_MODEL : e.target.value)} className={selectClass}>
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
        <div className="space-y-1">
          <p className="text-sm flex flex-wrap gap-1.5 items-center">
            {(() => {
              const state = compatState(compat ? { status: compat.status, capabilities: compat.capabilities ?? [], failedCapability: compat.failedCapability ?? null } : null)
              const info = CAPABILITY_STATES[state]
              return (
                <Badge tone={info.tone} title={info.hint}>
                  {info.label}{compat ? ` (test du ${formatDate(compat.testedAt)}${compat.code ? ` : ${probeCode(compat.code)}` : ''})` : ' pour cette fonctionnalité'}
                </Badge>
              )
            })()}
            {selected.pricing ? <Badge>Tarif saisi</Badge> : <Badge tone="amber">Tarif à saisir dans le catalogue</Badge>}
          </p>
          <ProfileHints profile={selected.profile} />
        </div>
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
        {testable && (
          <p className="text-sm text-gray-300" data-testid="probe-estimate">
            {!estimate ? 'Estimation du coût…' : <>
              Test : {estimate.steps.map(c => CAPABILITIES[c] ?? c).join(', ')} — {estimate.requests} requête(s), {estimate.maxRequests} au plus avec relances,
              {' '}{estimate.outputTokens.toLocaleString('fr-FR')} tokens de sortie au plus.{' '}
              {estimate.maxCostMicroUsd !== null
                ? <>Coût maximal estimé : <strong>{formatUsd(estimate.maxCostMicroUsd)}</strong>.</>
                : <span className="text-amber-300">Tarif inconnu : coût non estimable (le test reste possible).</span>}
              {estimate.budgetOk === false && <span className="text-red-300"> Budget du centre IA insuffisant : le test sera refusé.</span>}
            </>}
          </p>
        )}
        <label className="flex items-start gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={billingOk} onChange={e => setBillingOk(e.target.checked)} className="mt-1" />
          {estimate?.maxCostMicroUsd !== null && estimate?.maxCostMicroUsd !== undefined
            ? `J’autorise ce test réel, facturé par le fournisseur, pour un coût maximal estimé de ${formatUsd(estimate.maxCostMicroUsd)}.`
            : 'Je comprends que le test envoie de petites requêtes réelles au fournisseur, potentiellement facturées.'}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Fonctionnalité active
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button busy={busy === 'check'} disabled={!!busy || !testable} onClick={check} title="Gratuit : aucune génération">
          <SearchCheck size={16} /> Vérifier la disponibilité
        </Button>
        <Button busy={busy === 'test'} disabled={!!busy || !testable || !billingOk} onClick={() => test()}>
          <FlaskConical size={16} /> Tester la configuration
        </Button>
        <Button variant="primary" busy={busy === 'save'} disabled={!!busy || modelId === NEW_MODEL} onClick={save}>
          <Save size={16} /> Enregistrer
        </Button>
        <Button onClick={onClose}>Fermer</Button>
      </div>

      {/* Résultat juste sous les boutons qui l'ont produit, amené à l'écran */}
      <div ref={resultRef} className="space-y-2 scroll-mb-24">
        <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
        {lastProbe?.rejectedParams.length ? (
          <Button onClick={dropRejected}>Retirer les paramètres refusés ({lastProbe.rejectedParams.map(p => PARAM_LABELS[p] ?? p).join(', ')})</Button>
        ) : null}
        {lastProbe?.code === 'model_not_listed' && (
          <Button disabled={!!busy || !billingOk} busy={busy === 'test'} onClick={() => test(true)} title={billingOk ? undefined : 'Cochez d’abord l’autorisation de coût'}>
            <FlaskConical size={16} /> Tester quand même ce modèle absent du catalogue
          </Button>
        )}
      </div>
    </div>
  )
}

type RunState = 'active' | 'blocked' | 'inactive'
const runState = (f: FeatureState): RunState => (!f.enabled ? 'inactive' : f.blocker ? 'blocked' : 'active')
const RUN_STATE: Record<RunState, { label: string; border: string; dot: string; card: string }> = {
  active:   { label: 'Actives',   border: 'border-l-emerald-400', dot: 'bg-emerald-400', card: '' },
  blocked:  { label: 'Bloquées',  border: 'border-l-amber-400',   dot: 'bg-amber-400',   card: '' },
  inactive: { label: 'Inactives', border: 'border-l-slate-500',   dot: 'bg-slate-500',   card: 'opacity-80' },
}

export default function AssignmentsSection({ overview, reload, openFeature, onOpenFeature }: {
  overview: Overview; reload: () => Promise<unknown>; openFeature: string | null; onOpenFeature: (id: string | null) => void
}) {
  const [filter, setFilter] = useState<RunState | 'all'>('all')
  const counts = useMemo(() => {
    const c: Record<RunState, number> = { active: 0, blocked: 0, inactive: 0 }
    for (const f of overview.features) c[runState(f)]++
    return c
  }, [overview.features])
  const shown = overview.features.filter(f => filter === 'all' || runState(f) === filter || f.id === openFeature)

  return (
    <div className="space-y-4">
      {/* Résumé et filtre : l'état de chaque configuration se lit d'un coup d'œil */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer les fonctionnalités par état">
        {(['all', 'active', 'blocked', 'inactive'] as const).map(id => {
          const selected = filter === id
          const n = id === 'all' ? overview.features.length : counts[id]
          return (
            <button key={id} type="button" aria-pressed={selected} onClick={() => setFilter(id)}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${selected ? 'border-indigo-400/60 bg-indigo-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:text-white'}`}>
              {id !== 'all' && <span className={`h-2 w-2 rounded-full ${RUN_STATE[id].dot}`} aria-hidden="true" />}
              {id === 'all' ? 'Toutes' : RUN_STATE[id].label} <span className="tabular-nums text-slate-400">{n}</span>
            </button>
          )
        })}
      </div>
      {!shown.length && <p className="text-sm text-slate-400">Aucune fonctionnalité dans cet état.</p>}
      {shown.map(f => {
        const provider = overview.providers.find(p => p.id === f.providerId)
        const open = openFeature === f.id
        const state = RUN_STATE[runState(f)]
        return (
          <Card key={f.id} className={`border-l-4 ${state.border} ${state.card} ${open ? 'ring-1 ring-primary/50' : ''}`}>
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
                  {(() => {
                    const info = CAPABILITY_STATES[compatState(f.compat)]
                    return (
                      <Badge tone={info.tone} title={info.hint}>
                        {info.label}{f.compat ? ` · test du ${formatDate(f.compat.testedAt)}${f.compat.code ? ` (${probeCode(f.compat.code)})` : ''}` : ''}
                      </Badge>
                    )
                  })()}
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
