// Studio CV LaTeX : édition, compilation isolée (latex-runner), assistance IA, versions de session.
// Ordinateur : panneau d'outils | code | aperçu, redimensionnables.
// Tablette   : outils dans un tiroir, choix Code / Aperçu / Les deux.
// Smartphone : onglets Informations / Code / Aperçu ; les panneaux restent montés (rien n'est perdu).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { runAiFeature } from '../../lib/aiClient'
import { stripCodeFences, type LatexCompileDetail } from '../../lib/latexCompile'
import { useAiAvailability, useAiStatuses } from '../../hooks/useAiAvailability'
import { buildFinalLatex } from '../../pages/CVBuilder/latexTemplates'
import { renderCv, TEMPLATE_LIBRARY } from './templates/library'
import { sampleCv } from './templates/sample'
import { emptyCv, forServer, isEmptyCv, normalizeCv, type CvData } from './lib/cvData'
import { rewriteCv, type RewriteResult } from './lib/importCv'
import { targetReady } from './lib/target'
import { useQuality } from './useQuality'
import { QualityReport } from './components/QualityReport'
import { TemplateGallery } from './components/TemplateGallery'
import { DesignPanel } from './components/DesignPanel'
import { SectionOrganizer } from './components/SectionOrganizer'
import type { SectionLayout } from './lib/layout'
import { initialGenerated, planSwitch, pushStep, renderChoice, type TemplateChoice, type TemplateStep } from './lib/templateSwitch'
import { Dialog } from './components/Dialog'
import { CvDataEditor } from './components/CvDataEditor'
import { ImportPanel } from './components/ImportPanel'
import { RewriteDialog } from './components/RewriteDialog'
import { MyCvsDialog, SaveDialog } from './components/MyCvs'
import { detectMode, history, restorableCode, type HistoryMode } from './lib/history'
import { useCompile, downloadUrl } from './useCompile'
import { useVersions } from './useVersions'
import { useViewport, prefersPlainEditor } from './useViewport'
import { applyEdits, type FixProposal } from './lib/edits'
import { requestFix, isFixable, MAX_FIX_ATTEMPTS } from './lib/fix'
import { CodeEditor, type CodeEditorHandle, type Selection } from './components/CodeEditor'
import { PdfPreview } from './components/PdfPreview'
import { ErrorPanel } from './components/ErrorPanel'
import { FixDialog } from './components/FixDialog'
import { AiPanel, TargetFields } from './components/AiPanel'
import type { Target } from './lib/target'
import { PhotoPanel } from './components/PhotoPanel'
import { Splitter } from './components/Splitter'
import { btn, btnDanger, btnGhost, btnPrimary } from './components/ui'

type SideTab = 'import' | 'donnees' | 'modeles' | 'design' | 'ia' | 'photo' | 'versions'
type MobileTab = 'infos' | 'code' | 'apercu'

const DRAFT_KEY = 'latex-studio:draft'
const TARGET_KEY = 'latex-studio:target'
const CV_KEY = 'latex-studio:cv'
const TEMPLATE_KEY = 'latex-studio:template'
const GENERATED_KEY = 'latex-studio:generated'
const STEPS_KEY = 'latex-studio:template-steps'
const SESSION_KEYS = [DRAFT_KEY, TARGET_KEY, CV_KEY, TEMPLATE_KEY, GENERATED_KEY, STEPS_KEY, 'latex-studio:versions', 'latex-studio:side', 'latex-studio:ratio']
const DEFAULT_CHOICE: TemplateChoice = { id: TEMPLATE_LIBRARY[0].id, options: TEMPLATE_LIBRARY[0].defaults }
const NO_WARNINGS: never[] = []

/** Réglages modifiés entre deux choix (options du modèle et variables de thème) */
function changedSettings(a: TemplateChoice, b: TemplateChoice): string {
  const flat = (c: TemplateChoice) => ({
    ...c.options, theme: undefined, layout: undefined,
    ...Object.fromEntries(Object.entries(c.options.theme ?? {}).map(([k, v]) => [`theme.${k}`, v])),
    ...Object.fromEntries(Object.entries(c.options.layout ?? {}).map(([k, v]) => [`layout.${k}`, JSON.stringify(v)])),
  }) as Record<string, unknown>
  const x = flat(a)
  const y = flat(b)
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(k => x[k] !== y[k]).sort().join(',')
}

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export default function LatexStudio() {
  const viewport = useViewport()
  const plain = useMemo(prefersPlainEditor, [])
  const aiAvailable = useAiAvailability()

  // ── Document ──
  const [choice, setChoice] = useState<TemplateChoice>(() => readSession(TEMPLATE_KEY, DEFAULT_CHOICE))
  const [cv, setCv] = useState<CvData>(() => normalizeCv(readSession(CV_KEY, emptyCv())))
  // Sans brouillon : code du modèle choisi, rempli avec les données (ou l'exemple si rien n'est saisi)
  const [code, setCode] = useState<string>(() => readSession(DRAFT_KEY, '') || renderChoice(choice, cv))
  // Dernier code généré par le studio à partir des données (P2) : sert à détecter les modifications manuelles
  const [generated, setGenerated] = useState<string | null>(() => initialGenerated(readSession<string | null>(GENERATED_KEY, null), code, choice, cv))
  const [steps, setSteps] = useState<TemplateStep[]>(() => readSession(STEPS_KEY, []))
  const [pendingSwitch, setPendingSwitch] = useState<{ choice: TemplateChoice; code: string; reason: 'manual' | 'foreign' } | null>(null)
  const aiStatuses = useAiStatuses()
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoWidth, setPhotoWidth] = useState(3.2)
  const [target, setTarget] = useState<Target>(() => readSession(TARGET_KEY, { organization: '', role: '' }))
  const versions = useVersions(code, setCode)
  const compile = useCompile(code, photo, photoWidth)
  const editor = useRef<CodeEditorHandle>(null)

  useEffect(() => {
    const timer = setTimeout(() => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(code)) } catch { /* stockage indisponible */ } }, 500)
    return () => clearTimeout(timer)
  }, [code])
  useEffect(() => { try { sessionStorage.setItem(TARGET_KEY, JSON.stringify(target)) } catch { /* idem */ } }, [target])
  useEffect(() => { try { sessionStorage.setItem(CV_KEY, JSON.stringify(cv)); sessionStorage.setItem(TEMPLATE_KEY, JSON.stringify(choice)) } catch { /* idem */ } }, [cv, choice])
  useEffect(() => { try { sessionStorage.setItem(GENERATED_KEY, JSON.stringify(generated)); sessionStorage.setItem(STEPS_KEY, JSON.stringify(steps)) } catch { /* idem */ } }, [generated, steps])

  /** Remplacement du code par le studio : instantané, puis compilation immédiate */
  // Confirmation après chaque remplacement du code, avec retour arrière immédiat
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 8000)
    return () => clearTimeout(timer)
  }, [notice])
  const replaceCode = useCallback((next: string, label: string, done: string) => {
    compile.compileSoon()
    versions.replace(next, label)
    setNotice(done)
  }, [compile, versions])

  // ── Assistant IA ──
  const [aiMode, setAiMode] = useState<'generate' | 'improve'>('generate')
  const [aiInfo, setAiInfo] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)

  const generate = async () => {
    setAiLoading(true)
    setAiError('')
    try {
      const out = stripCodeFences(await runAiFeature('latex.generate', { info: aiInfo, template: renderCv(choice.id, sampleCv(), choice.options), existing: code, target }))
      if (out) replaceCode(out, 'Avant génération IA', 'CV généré par l’IA.')
      else setAiError('Aucun code retourné.')
    } catch (e) {
      setAiError((e as Error).message)
    } finally {
      setAiLoading(false)
    }
  }

  const improve = async () => {
    if (!selection) return
    const range = selection
    setAiLoading(true)
    setAiError('')
    try {
      const out = stripCodeFences(await runAiFeature('latex.improve', { selection: range.text, instruction: aiInstruction, context: code.slice(0, 3000), target }))
      if (!out) setAiError('Aucune amélioration retournée.')
      else if (code.slice(range.start, range.end) !== range.text) setAiError('Le code a changé pendant l’amélioration : sélectionnez à nouveau le passage.')
      else replaceCode(code.slice(0, range.start) + out + code.slice(range.end), 'Avant amélioration IA', 'Passage amélioré par l’IA.')
    } catch (e) {
      setAiError((e as Error).message)
    } finally {
      setAiLoading(false)
    }
  }

  // ── Correction IA des erreurs de compilation ──
  const [fixAttempts, setFixAttempts] = useState(0)
  const [fixBusy, setFixBusy] = useState(false)
  const [fixMessage, setFixMessage] = useState<string | null>(null)
  const [proposal, setProposal] = useState<FixProposal | null>(null)

  // Nouvelle série d'erreurs après une compilation réussie
  useEffect(() => {
    if (compile.result) {
      setFixAttempts(0)
      setFixMessage(null)
    }
  }, [compile.result])

  const errorDetails = (): LatexCompileDetail[] => {
    const err = compile.error
    if (!err) return []
    return err.details.length ? err.details : [{ line: err.line, message: err.message }]
  }

  const askFix = async () => {
    if (fixAttempts >= MAX_FIX_ATTEMPTS || !compile.error) return
    setFixBusy(true)
    setFixMessage(null)
    try {
      setProposal(await requestFix(code, errorDetails(), (fixAttempts + 1) as 1 | 2))
      setFixAttempts(n => n + 1)
    } catch (e) {
      setFixMessage((e as Error).message)
    } finally {
      setFixBusy(false)
    }
  }

  const acceptFix = () => {
    if (!proposal) return
    if (proposal.base !== code) {
      setFixMessage('Le code a été modifié depuis la demande : la proposition n’a pas été appliquée.')
    } else {
      try {
        replaceCode(applyEdits(proposal.base, proposal.edits), 'Avant correction IA', 'Correction appliquée, recompilation en cours.')
      } catch (e) {
        setFixMessage((e as Error).message)
      }
    }
    setProposal(null)
  }

  // ── Actions ──
  const goToLine = (line: number) => {
    if (viewport === 'mobile') setMobileTab('code')
    setTimeout(() => editor.current?.goToLine(line), 50)
  }
  const downloadTex = () => {
    const url = URL.createObjectURL(new Blob([buildFinalLatex(code, !!photo, photoWidth)], { type: 'text/plain;charset=utf-8' }))
    downloadUrl(url, 'cv.tex')
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  /** Code généré à partir des données (ou de l'exemple si rien n'est saisi) et du modèle choisi */
  const applyTemplate = (data = cv) => {
    const next = renderChoice(choice, data)
    replaceCode(next, 'Avant génération depuis le modèle', 'CV généré avec le modèle.')
    setGenerated(next)
    if (viewport === 'mobile') setMobileTab('apercu')
  }

  // ── Changement de modèle ou de réglages (P2) : rendu local et déterministe, aucune IA ──
  const templateName = (id: string) => TEMPLATE_LIBRARY.find(t => t.id === id)?.name ?? id
  // Rafale sur un même réglage (curseur, flèches du clavier) : une seule étape d'annulation
  const lastSetting = useRef({ at: 0, keys: '' })
  const commitChoice = (next: TemplateChoice, nextCode: string, kind: 'template' | 'options') => {
    const keys = kind === 'options' ? changedSettings(choice, next) : ''
    const burst = kind === 'options' && keys === lastSetting.current.keys && Date.now() - lastSetting.current.at < 1500
    lastSetting.current = { at: kind === 'options' ? Date.now() : 0, keys }
    if (!burst) setSteps(list => pushStep(list, { choice, code, generated }))
    setChoice(next)
    setGenerated(nextCode)
    if (kind === 'template') {
      replaceCode(nextCode, `Avant le modèle « ${templateName(next.id)} »`, `Modèle « ${templateName(next.id)} » appliqué : code et aperçu régénérés depuis vos données.`)
    } else if (nextCode !== code) {
      // Réglage : compilation après une courte temporisation (plusieurs réglages rapprochés = une compilation)
      compile.compileAfter(800)
      if (burst) setCode(nextCode)
      else versions.replace(nextCode, 'Avant changement de réglage')
    }
  }
  const requestChoice = (next: TemplateChoice, kind: 'template' | 'options') => {
    const plan = planSwitch(code, generated, renderChoice(next, cv))
    if (plan.kind === 'apply') commitChoice(next, plan.code, kind)
    else setPendingSwitch({ choice: next, code: plan.code, reason: plan.reason })
  }
  const previousStep = steps.at(-1) ?? null
  const backToPreviousTemplate = () => {
    if (!previousStep) return
    setSteps(list => list.slice(0, -1))
    setChoice(previousStep.choice)
    setGenerated(previousStep.generated)
    replaceCode(previousStep.code, 'Avant retour à l’étape précédente',
      previousStep.choice.id === choice.id ? 'Réglage précédent rétabli.' : `Retour au modèle « ${templateName(previousStep.choice.id)} ».`)
  }
  const previousLabel = !previousStep ? null : previousStep.choice.id === choice.id ? 'Annuler le dernier réglage' : `Revenir au modèle précédent (« ${templateName(previousStep.choice.id)} »)`
  /** Données modifiées : si le code vient du studio, il suit la saisie (une pause = une compilation) */
  const lastData = useRef(0)
  const updateCv = (next: CvData) => {
    setCv(next)
    if (generated === null || code !== generated) return
    const nextCode = renderChoice(choice, next)
    if (nextCode === code) return
    const burst = Date.now() - lastData.current < 2000
    lastData.current = Date.now()
    compile.compileAfter(1200)
    setGenerated(nextCode)
    if (burst) setCode(nextCode)
    else versions.replace(nextCode, 'Avant modification des données')
  }
  const setLayout = (layout: SectionLayout) => requestChoice({ ...choice, options: { ...choice.options, layout } }, 'options')
  const codeSource: 'template' | 'manual' | 'foreign' = generated !== null && code === generated ? 'template' : generated === null ? 'foreign' : 'manual'

  // ── Réécriture professionnelle (latex.rewrite) ──
  const [rewriting, setRewriting] = useState(false)
  const [rewriteError, setRewriteError] = useState('')
  const [rewrite, setRewrite] = useState<{ base: CvData; result: RewriteResult } | null>(null)
  const askRewrite = async () => {
    setRewriting(true)
    setRewriteError('')
    try {
      const base = forServer(cv)
      setRewrite({ base, result: await rewriteCv(base, target, choice.options.lang) })
    } catch (e) {
      setRewriteError((e as Error).message)
    } finally {
      setRewriting(false)
    }
  }

  const [confirmClear, setConfirmClear] = useState(false)
  const clearSession = () => {
    SESSION_KEYS.forEach(k => { try { sessionStorage.removeItem(k) } catch { /* idem */ } })
    window.location.reload()
  }

  // ── Mes CV (P4) ──
  const [historyMode, setHistoryMode] = useState<HistoryMode>('device')
  const [saving, setSaving] = useState(false)
  const [myCvs, setMyCvs] = useState(false)
  useEffect(() => { void detectMode().then(setHistoryMode) }, [])
  const canSave = !!compile.result && !compile.stale && !compile.error
  const saveTitle = ['CV', cv.identity.fullName, target.organization].map(v => v.trim()).filter(Boolean).join(' — ')
  const saveCv = async (title: string) => {
    if (!compile.result) return
    await history[historyMode].save({
      title, templateId: choice.id, target,
      pdf: compile.result.pdf, tex: buildFinalLatex(code, !!photo, photoWidth),
    })
  }

  const quality = useQuality(compile.result?.pdf ?? null, compile.result?.warnings ?? NO_WARNINGS, cv.identity.fullName)
  const changePhoto = (url: string | null) => {
    compile.compileSoon()
    setPhoto(url)
  }

  // ── Mise en page ──
  const [sideTab, setSideTab] = useState<SideTab>('modeles')
  const [mobileTab, setMobileTab] = useState<MobileTab>('code')
  const [tabletView, setTabletView] = useState<'code' | 'apercu' | 'both'>('both')
  const [drawer, setDrawer] = useState(false)
  const [sideOpen, setSideOpen] = useState(true)
  const [sideWidth, setSideWidth] = useState(() => readSession('latex-studio:side', 320))
  const [codeRatio, setCodeRatio] = useState(() => readSession('latex-studio:ratio', 0.5))
  const main = useRef<HTMLDivElement>(null)
  // Tiroir d'outils (tablette) : focus à l'ouverture, Échap pour fermer, focus rendu au bouton
  const drawerRef = useRef<HTMLDivElement>(null)
  const drawerButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!drawer) return
    drawerRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', onKey)
    const opener = drawerButton.current
    return () => { document.removeEventListener('keydown', onKey); opener?.focus() }
  }, [drawer])
  // Menu « ⋯ » : se referme après un choix, sur Échap ou en touchant ailleurs
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent) => { const m = menu.current; if (m?.open && !m.contains(e.target as Node)) m.open = false }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => { try { sessionStorage.setItem('latex-studio:side', JSON.stringify(sideWidth)); sessionStorage.setItem('latex-studio:ratio', JSON.stringify(codeRatio)) } catch { /* idem */ } }, [sideWidth, codeRatio])

  const status = compile.rendering ? { text: 'Compilation…', tone: 'bg-amber-400' }
    : compile.unavailable ? { text: 'Aperçu indisponible', tone: 'bg-gray-500' }
    : compile.error ? { text: compile.error.throttled ? 'Limite atteinte' : 'Erreur', tone: 'bg-red-500' }
    : compile.stale ? { text: 'Modifié', tone: 'bg-sky-400' }
    : compile.result ? { text: 'PDF prêt', tone: 'bg-emerald-400' }
    : { text: 'En attente', tone: 'bg-gray-500' }

  const sidePanel = (
    <SidePanel tab={sideTab} setTab={setSideTab}>
      {sideTab === 'ia' && (
        <AiPanel
          mode={aiMode} setMode={setAiMode} target={target} setTarget={setTarget}
          info={aiInfo} setInfo={setAiInfo} instruction={aiInstruction} setInstruction={setAiInstruction}
          selectionLines={selection ? selection.text.split('\n').length : 0}
          available={aiAvailable} loading={aiLoading} error={aiError} onGenerate={generate} onImprove={improve}
        />
      )}
      {sideTab === 'import' && (
        <ImportPanel
          ocrAvailable={aiStatuses?.['latex.import.ocr']?.available === true}
          structureAvailable={aiStatuses?.['latex.import.structure']?.available !== false}
          onImported={data => { updateCv(data); setSideTab('donnees') }}
        />
      )}
      {sideTab === 'donnees' && (
        <div className="space-y-3">
          <TargetFields target={target} onChange={setTarget} />
          <button type="button" className={`${btn} w-full`} onClick={askRewrite}
            disabled={rewriting || isEmptyCv(cv) || !targetReady(target) || !aiAvailable('latex.rewrite')} aria-busy={rewriting}>
            {rewriting ? '⏳ Réécriture en cours…' : '✨ Réécriture professionnelle (IA)'}
          </button>
          {!aiAvailable('latex.rewrite') && <p className="text-[11px] text-gray-500">Réécriture par l’IA momentanément indisponible.</p>}
          {rewriteError && <p role="alert" className="text-xs text-red-300">⚠️ {rewriteError}</p>}
          <details open className="group rounded-lg border border-[#21262d] bg-[#0f1318]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-bold text-gray-200 sm:min-h-9">
              Ordre et affichage des sections<span aria-hidden="true" className="text-gray-500 transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="border-t border-[#21262d] p-3">
              <SectionOrganizer layout={choice.options.layout} templateSections={TEMPLATE_LIBRARY.find(t => t.id === choice.id)?.sections ?? TEMPLATE_LIBRARY[0].sections}
                lang={choice.options.lang} cv={cv} usesSample={isEmptyCv(cv)} twoColumns={choice.options.twoColumns && !!TEMPLATE_LIBRARY.find(t => t.id === choice.id)?.supports.twoColumns}
                onChange={setLayout} previous={previousLabel} onPrevious={backToPreviousTemplate} />
            </div>
          </details>
          {codeSource !== 'template' && (
            <p className="rounded-lg border border-sky-900 bg-sky-500/10 p-2 text-[11px] text-sky-200">
              Le code a été modifié à la main ou vient d’une autre source : vos données ne le remplacent pas automatiquement. Utilisez « Générer le CV » ci-dessous (version actuelle restaurable).
            </p>
          )}
          <CvDataEditor cv={cv} onChange={updateCv} />
          <button type="button" className={`${btnPrimary} w-full`} onClick={() => applyTemplate()}>Générer le CV avec le modèle « {TEMPLATE_LIBRARY.find(t => t.id === choice.id)?.name} »</button>
          <p className="text-[11px] text-gray-500">Vos données restent dans cet onglet du navigateur ; elles ne sont pas enregistrées sur un serveur.</p>
        </div>
      )}
      {sideTab === 'modeles' && (
        <TemplateGallery choice={choice} onChange={requestChoice} onApply={() => applyTemplate()} usesSample={isEmptyCv(cv)}
          codeSource={codeSource} compiling={compile.rendering}
          previous={previousLabel} onPrevious={backToPreviousTemplate} onDesign={() => setSideTab('design')} />
      )}
      {sideTab === 'design' && <DesignPanel choice={choice} onChange={requestChoice} previous={previousLabel} onPrevious={backToPreviousTemplate} />}
      {sideTab === 'photo' && <PhotoPanel photo={photo} width={photoWidth} setWidth={setPhotoWidth} onPhoto={changePhoto} hasMarker={code.includes('%%PHOTO%%')} />}
      {sideTab === 'versions' && (
        <div className="space-y-2 text-xs">
          <p className="text-gray-400">Versions de cette session (conservées dans cet onglet uniquement).</p>
          {confirmClear ? (
            <div className="space-y-2 rounded-lg border border-red-900 bg-red-500/10 p-2" role="group" aria-label="Confirmer l’effacement">
              <p className="text-red-200">Le code, les données saisies, la photo et les versions de cette session seront effacés. Les CV enregistrés dans « Mes CV » sont conservés.</p>
              <div className="flex gap-2">
                <button type="button" className={btn} onClick={() => setConfirmClear(false)} autoFocus>Annuler</button>
                <button type="button" className={btnDanger} onClick={clearSession}>Confirmer l’effacement</button>
              </div>
            </div>
          ) : <button type="button" className={`${btn} w-full`} onClick={() => setConfirmClear(true)}>🧹 Effacer toutes les données de cette session</button>}
          {!versions.versions.length && <p className="text-gray-500">Aucune version précédente.</p>}
          <ol className="space-y-1.5">
            {[...versions.versions].reverse().map(v => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#21262d] p-2">
                <span><strong className="text-gray-200">{v.label}</strong><br /><span className="text-gray-500">{new Date(v.at).toLocaleTimeString('fr-FR')}</span></span>
                <button type="button" className={btn} onClick={() => { compile.compileSoon(); versions.restore(v.id) }} disabled={v.code === code}>Restaurer</button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </SidePanel>
  )

  const codePanel = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Code LaTeX">
      <div className="flex items-center justify-between border-b border-[#21262d] bg-[#13161d] px-3 py-1.5 text-[11px] text-gray-400">
        <span>📝 Code LaTeX</span>
        <span>{code.split('\n').length} lignes</span>
      </div>
      <CodeEditor ref={editor} value={code} onChange={setCode} onSelection={setSelection} onCompile={compile.compileNow} plain={plain || viewport === 'mobile'} />
    </section>
  )

  const fixState = {
    available: aiAvailable('latex.fix'),
    attempts: fixAttempts,
    max: MAX_FIX_ATTEMPTS,
    busy: fixBusy,
    message: fixMessage,
    onFix: askFix,
  }

  const previewPanel = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Aperçu PDF">
      <div className="flex items-center gap-2 border-b border-[#21262d] bg-[#13161d] px-3 py-1.5 text-[11px] text-gray-400">
        <span className="truncate">👁 Aperçu PDF</span>
        {compile.rendering && <span className="shrink-0 text-amber-300" aria-hidden="true">⏳</span>}
        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5" title="Compiler 3 s après la dernière modification">
          <input type="checkbox" checked={compile.autoCompile} onChange={e => compile.setAutoCompile(e.target.checked)} /> Auto
        </label>
        <button type="button" className={`${btn} shrink-0`} onClick={compile.compileNow} disabled={compile.rendering} title="Compiler maintenant (Ctrl+S)">▶ Compiler</button>
      </div>
      {compile.result && !compile.error && !compile.stale && <QualityReport issues={quality} onGoToLine={goToLine} />}
      {compile.error && !compile.unavailable && (
        <ErrorPanel
          error={compile.error}
          hasPdf={!!compile.result}
          onGoToLine={goToLine}
          fix={isFixable(compile.error) ? fixState : { ...fixState, available: false }}
          onUndo={() => { compile.compileSoon(); versions.undo() }}
          canUndo={versions.canUndo}
        />
      )}
      {compile.unavailable ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-400">
          <div className="text-3xl" aria-hidden="true">📄</div>
          <p>{compile.error?.message ?? 'L’aperçu PDF est momentanément indisponible.'}</p>
          <p>Le fichier <strong>.tex</strong> reste téléchargeable pour Overleaf ou votre distribution LaTeX.</p>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={downloadTex}>⬇ Télécharger .tex</button>
            <button type="button" className={btn} onClick={compile.compileNow}>↻ Réessayer</button>
          </div>
        </div>
      ) : compile.result ? (
        <PdfPreview pdf={compile.result.pdf} url={compile.result.url} dimmed={!!compile.error} />
      ) : !compile.error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-gray-500">
          <div className="text-3xl" aria-hidden="true">📄</div>
          {compile.rendering ? 'Compilation du PDF…' : 'Le PDF compilé apparaîtra ici'}
        </div>
      ) : null}
    </section>
  )

  const toolbar = (
    <header className="flex items-center gap-2 border-b border-[#21262d] bg-[#13161d] px-3 py-2">
      {viewport === 'tablet' && <button ref={drawerButton} type="button" className={btn} onClick={() => setDrawer(true)} aria-expanded={drawer}>☰ Outils</button>}
      {viewport === 'desktop' && <button type="button" className={btnGhost} onClick={() => setSideOpen(o => !o)} aria-expanded={sideOpen} aria-label={sideOpen ? 'Masquer le panneau d’outils' : 'Afficher le panneau d’outils'}>☰</button>}
      <div className="mr-auto min-w-0">
        <h1 className="truncate text-sm font-extrabold text-white">📘 Studio CV LaTeX</h1>
        <p className="flex min-w-0 items-center gap-1.5 text-[11px]">
          <span className="flex shrink-0 items-center gap-1.5 text-gray-300" role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${status.tone}`} aria-hidden="true" />{status.text}
          </span>
          <span className="hidden truncate text-gray-500 xl:inline">· PDF compilé en environnement isolé</span>
        </p>
      </div>
      <button type="button" className={btn} onClick={() => { compile.compileSoon(); versions.undo() }} disabled={!versions.canUndo} title="Revenir à la version précédente" aria-label="Revenir à la version précédente">↶<span className="hidden sm:inline"> Précédente</span></button>
      <button type="button" className={`${btn} hidden lg:inline-flex`} onClick={downloadTex}>⬇ .tex</button>
      <button type="button" className={`${btn} hidden lg:inline-flex`} onClick={() => setSaving(true)} disabled={!canSave} title={canSave ? 'Enregistrer ce CV dans Mes CV' : 'Compilez d’abord le CV (PDF à jour)'}>💾 Enregistrer</button>
      <button type="button" className={`${btn} hidden lg:inline-flex`} onClick={() => setMyCvs(true)}>🗂 Mes CV</button>
      <button type="button" className={btnPrimary} onClick={compile.downloadPdf} disabled={compile.rendering || (compile.unavailable && !compile.result)}>⬇ PDF</button>
      <details ref={menu} className="relative shrink-0 lg:hidden" onKeyDown={e => { if (e.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector('summary')?.focus() } }}>
        <summary className={`${btn} list-none`} aria-label="Plus d’actions">⋯</summary>
        <div className="absolute right-0 z-50 mt-1 flex w-56 max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-lg border border-[#21262d] bg-[#13161d] p-2 shadow-xl"
          onClick={e => { if ((e.target as HTMLElement).closest('button, a') && menu.current) menu.current.open = false }}>
          <button type="button" className={`${btn} justify-start`} onClick={downloadTex}>⬇ Télécharger .tex</button>
          <button type="button" className={`${btn} justify-start`} onClick={() => setSaving(true)} disabled={!canSave}>💾 Enregistrer</button>
          <button type="button" className={`${btn} justify-start`} onClick={() => setMyCvs(true)}>🗂 Mes CV</button>
          <button type="button" className={`${btn} justify-start`} onClick={() => void navigator.clipboard?.writeText(code)}>📋 Copier le code</button>
          <a className={`${btn} justify-start`} href="/cv-generator">← CV Generator</a>
        </div>
      </details>
      <a className={`${btnGhost} hidden lg:inline-flex`} href="/cv-generator">← CV Generator</a>
    </header>
  )

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0e1015] text-[13px] text-gray-300">
      {toolbar}

      {viewport === 'desktop' && (
        <div ref={main} className="flex min-h-0 flex-1">
          {sideOpen && <>
            <aside className="flex min-h-0 shrink-0 flex-col border-r border-[#21262d] bg-[#13161d]" style={{ width: sideWidth }} aria-label="Outils">{sidePanel}</aside>
            <Splitter label="Largeur du panneau d’outils" value={sideWidth} min={260} max={520} onChange={setSideWidth} toValue={x => x - (main.current?.getBoundingClientRect().left ?? 0)} />
          </>}
          <div className="flex min-w-0 flex-col" style={{ flexBasis: `calc((100% - ${(sideOpen ? sideWidth + 6 : 0) + 6}px) * ${codeRatio})`, flexGrow: 0, flexShrink: 1 }}>{codePanel}</div>
          <Splitter label="Partage entre code et aperçu" value={codeRatio * 100} min={25} max={75}
            onChange={v => setCodeRatio(v / 100)}
            toValue={x => {
              const r = main.current!.getBoundingClientRect()
              const left = r.left + (sideOpen ? sideWidth + 6 : 0)
              return ((x - left) / (r.right - left - 6)) * 100
            }} />
          <div className="flex min-w-0 flex-1 flex-col">{previewPanel}</div>
        </div>
      )}

      {viewport === 'tablet' && <>
        <div className="flex justify-center gap-1 border-b border-[#21262d] bg-[#13161d] p-1.5" role="radiogroup" aria-label="Affichage">
          {(['code', 'both', 'apercu'] as const).map(v => (
            <button key={v} type="button" role="radio" aria-checked={tabletView === v} onClick={() => setTabletView(v)}
              className={`${btn} ${tabletView === v ? 'border-indigo-500 text-indigo-200' : ''}`}>
              {v === 'code' ? 'Éditeur' : v === 'apercu' ? 'Aperçu' : 'Les deux'}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1">
          <div className={`min-w-0 flex-col ${tabletView === 'apercu' ? 'hidden' : 'flex'} flex-1 border-r border-[#21262d]`}>{codePanel}</div>
          <div className={`min-w-0 flex-col ${tabletView === 'code' ? 'hidden' : 'flex'} flex-1`}>{previewPanel}</div>
        </div>
        {drawer && (
          <div ref={drawerRef} className="fixed inset-0 z-[900] flex" role="dialog" aria-modal="true" aria-label="Outils">
            <aside className="flex w-[min(380px,85vw)] flex-col bg-[#13161d] shadow-2xl">
              <div className="flex justify-end border-b border-[#21262d] p-1"><button type="button" className={btnGhost} onClick={() => setDrawer(false)} aria-label="Fermer les outils">✕</button></div>
              {sidePanel}
            </aside>
            <button type="button" className="flex-1 bg-black/60" onClick={() => setDrawer(false)} aria-label="Fermer les outils" />
          </div>
        )}
      </>}

      {viewport === 'mobile' && <>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`min-h-0 flex-1 flex-col bg-[#13161d] ${mobileTab === 'infos' ? 'flex' : 'hidden'}`}>{sidePanel}</div>
          <div className={`min-h-0 flex-1 flex-col ${mobileTab === 'code' ? 'flex' : 'hidden'}`}>{codePanel}</div>
          <div className={`min-h-0 flex-1 flex-col ${mobileTab === 'apercu' ? 'flex' : 'hidden'}`}>{previewPanel}</div>
        </div>
        <nav className="grid grid-cols-3 border-t border-[#21262d] bg-[#13161d] pb-[env(safe-area-inset-bottom)]" aria-label="Sections du studio">
          {([['infos', 'ℹ️', 'Informations'], ['code', '📝', 'Code'], ['apercu', '👁', 'Aperçu']] as const).map(([id, icon, text]) => (
            <button key={id} type="button" onClick={() => setMobileTab(id)} aria-current={mobileTab === id ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${mobileTab === id ? 'text-indigo-300' : 'text-gray-400'}`}>
              <span aria-hidden="true" className="text-base">{icon}</span>{text}
              {id === 'apercu' && compile.error && <span className="sr-only"> (erreur de compilation)</span>}
            </button>
          ))}
        </nav>
      </>}

      {notice && (
        <div className={`fixed inset-x-3 z-[800] mx-auto flex max-w-md items-center gap-2 rounded-lg border border-[#2a313c] bg-[#1b2029] p-2 pl-3 text-xs text-gray-200 shadow-2xl ${viewport === 'mobile' ? 'bottom-20' : 'bottom-4'}`}
          role="status" aria-live="polite">
          <span className="flex-1">✓ {notice}</span>
          {versions.canUndo && <button type="button" className={btn} onClick={() => { compile.compileSoon(); versions.undo(); setNotice('') }}>↶ Annuler</button>}
          <button type="button" className={btnGhost} onClick={() => setNotice('')} aria-label="Fermer le message">✕</button>
        </div>
      )}
      {rewrite && (
        <RewriteDialog base={rewrite.base} result={rewrite.result} onClose={() => setRewrite(null)}
          onApply={data => { updateCv(data); setRewrite(null) }} />
      )}
      {saving && <SaveDialog mode={historyMode} defaultTitle={saveTitle} onSave={saveCv} onClose={() => setSaving(false)} />}
      {myCvs && (
        <MyCvsDialog mode={historyMode} onClose={() => setMyCvs(false)}
          onRestore={tex => replaceCode(restorableCode(tex), 'Avant restauration depuis Mes CV', 'CV restauré depuis Mes CV.')} />
      )}
      {proposal && <FixDialog proposal={proposal} attempt={fixAttempts} onAccept={acceptFix} onReject={() => setProposal(null)} />}
      {pendingSwitch && (
        <Dialog title="Remplacer le code actuel ?" onClose={() => setPendingSwitch(null)}
          footer={<>
            <button type="button" className={btn} onClick={() => setPendingSwitch(null)}>Garder mon code</button>
            <button type="button" className={btnPrimary} onClick={() => { commitChoice(pendingSwitch.choice, pendingSwitch.code, 'template'); setPendingSwitch(null) }}>
              Appliquer « {templateName(pendingSwitch.choice.id)} »
            </button>
          </>}>
          <p className="text-sm text-gray-300">
            {pendingSwitch.reason === 'manual'
              ? 'Le code a été modifié à la main depuis sa dernière génération.'
              : 'Le code actuel ne provient pas des données du CV (génération ou correction par l’IA, import, restauration).'}
            {' '}Le modèle « {templateName(pendingSwitch.choice.id)} » va régénérer le code à partir {isEmptyCv(cv) ? 'de l’exemple (aucune donnée saisie dans l’onglet « Données »)' : 'des données de l’onglet « Données »'} : ces modifications seront remplacées.
          </p>
          <p className="mt-2 text-xs text-gray-400">La version actuelle reste restaurable : « ↶ Annuler », « Modèle précédent » ou l’onglet « Versions ».</p>
        </Dialog>
      )}
    </div>
  )
}

const SIDE_TABS: { id: SideTab; label: string }[] = [
  { id: 'modeles', label: '🎨 Modèles' },
  { id: 'design', label: '🖌 Design' },
  { id: 'import', label: '📥 Importer' },
  { id: 'donnees', label: '🧾 Données' },
  { id: 'ia', label: '🤖 IA' },
  { id: 'photo', label: '📷 Photo' },
  { id: 'versions', label: '🕘 Versions' },
]

// Onglets au clavier (motif WAI-ARIA) : un seul arrêt de tabulation, flèches, Début et Fin
function SidePanel({ tab, setTab, children }: { tab: SideTab; setTab: (t: SideTab) => void; children: ReactNode }) {
  const id = useId()
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = SIDE_TABS.findIndex(t => t.id === tab)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % SIDE_TABS.length
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + SIDE_TABS.length) % SIDE_TABS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? SIDE_TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(SIDE_TABS[next].id)
    document.getElementById(`${id}-tab-${SIDE_TABS[next].id}`)?.focus()
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Outils du studio" className="grid grid-cols-3 gap-1 border-b border-[#21262d] p-1.5" onKeyDown={onKeyDown}>
        {SIDE_TABS.map(t => (
          <button key={t.id} id={`${id}-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`${id}-panel`}
            tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}
            className={`min-h-11 truncate rounded-lg px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 sm:min-h-9 ${tab === t.id ? 'bg-indigo-500/20 text-indigo-200' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-auto p-3 focus-visible:outline-none">{children}</div>
    </div>
  )
}
