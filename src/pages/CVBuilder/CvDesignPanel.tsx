// Panneau Design du CV Generator : chaque réglage est réellement appliqué aux 8 modèles
// (cvDesign.ts), à l'aperçu comme à l'export. Valeur « Modèle » = style d'origine du modèle.
import { useId, useState, type ReactNode } from 'react'
import { Redo2, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react'
import type { DesignConfig, TemplateId } from './CVGeneratorPro_part1'
import {
  BOUNDS, DESIGN_DEFAULTS, DESIGN_PALETTES, FONT_CHOICES, HEADING_WEIGHTS, TEMPLATE_CAPS,
  contrastRatio, loadPresets, normalizeDesign, parseHex, roleBackground, savePresets, templateBackground, type DesignPreset,
} from './cvDesign'

type Patch = Partial<DesignConfig>
export interface DesignPanelProps {
  design: DesignConfig
  templateId: TemplateId
  templateName: string
  onChange: (patch: Patch, key: string) => void
  onReplace: (design: DesignConfig) => void
  onResetAll: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

const btn = 'inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-[#30363d] bg-[#21262d] px-2.5 text-xs font-semibold text-gray-200 transition-colors hover:border-indigo-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300'
const seg = (on: boolean) => `min-h-[34px] rounded-md border px-2 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${on ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-[#30363d] bg-[#21262d] text-gray-400 hover:text-white'}`
const pct = (v: number) => `${Math.round(v * 100)} %`

function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-[#21262d] py-1">
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between rounded-md px-1 text-[12.5px] font-bold text-gray-100 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-gray-500 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
      </summary>
      <div className="space-y-3 px-1 pb-3 pt-1">{children}</div>
    </details>
  )
}

/** Ligne de réglage : libellé, valeur, réinitialisation ; « sans effet » si le modèle ne s'y prête pas */
function Row({ label, value, changed, onReset, na, note, htmlFor, children }: {
  label: string; value?: string; changed: boolean; onReset: () => void; na?: string | false; note?: ReactNode; htmlFor?: string; children: ReactNode
}) {
  return (
    <div className={na ? 'opacity-55' : ''}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[11px] font-semibold text-gray-400">
          {label}{value && <span className="ml-1.5 font-normal tabular-nums text-gray-300">{value}</span>}
        </label>
        {changed && (
          <button type="button" onClick={onReset} className="rounded px-1.5 py-0.5 text-[10.5px] text-indigo-300 hover:bg-white/5 hover:text-white" aria-label={`Réinitialiser : ${label}`}>
            ↺ Modèle
          </button>
        )}
      </div>
      {children}
      {na && <p className="mt-1 text-[10.5px] text-amber-300/90">{na}</p>}
      {note}
    </div>
  )
}

function Slider({ id, value, bound, onChange, label, disabled }: { id: string; value: number; bound: { min: number; max: number; step: number }; onChange: (v: number) => void; label: string; disabled?: boolean }) {
  return (
    <input
      id={id}
      type="range"
      aria-label={label}
      min={bound.min}
      max={bound.max}
      step={bound.step}
      value={value}
      disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer accent-indigo-400 disabled:cursor-not-allowed"
    />
  )
}

/** Couleur : nuancier + saisie hexadécimale sécurisée (appliquée seulement si valide) */
function ColorField({ id, label, value, fallback, onChange }: { id: string; label: string; value: string | null; fallback: string; onChange: (v: string) => void }) {
  const shown = value ?? fallback
  const [text, setText] = useState(shown)
  const [lastShown, setLastShown] = useState(shown)
  if (lastShown !== shown) { setLastShown(shown); setText(shown) }
  const valid = parseHex(text) !== null
  return (
    <div className="flex items-center gap-2">
      <input type="color" aria-label={`${label} (nuancier)`} value={shown.length === 4 ? `#${shown[1]}${shown[1]}${shown[2]}${shown[2]}${shown[3]}${shown[3]}` : shown}
        onChange={e => onChange(e.target.value)} className="h-9 w-11 shrink-0 cursor-pointer rounded border border-[#30363d] bg-transparent p-0.5" />
      <input
        id={id}
        value={text}
        spellCheck={false}
        maxLength={7}
        aria-invalid={!valid}
        aria-describedby={valid ? undefined : `${id}-err`}
        onChange={e => {
          setText(e.target.value)
          const hex = parseHex(e.target.value)
          if (hex) onChange(hex)
        }}
        className={`min-h-[36px] w-full rounded-md border bg-[#0d1117] px-2 font-mono text-xs uppercase text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 ${valid ? 'border-[#30363d]' : 'border-red-500'}`}
      />
      {!valid && <span id={`${id}-err`} className="sr-only">Couleur invalide : format #RRGGBB attendu</span>}
    </div>
  )
}

export default function CvDesignPanel({ design: d, templateId, templateName, onChange, onReplace, onResetAll, canUndo, canRedo, onUndo, onRedo }: DesignPanelProps) {
  const uid = useId()
  const caps = TEMPLATE_CAPS[templateId]
  const bg = templateBackground(templateId)
  const D = DESIGN_DEFAULTS
  const [presets, setPresets] = useState<DesignPreset[]>(() => loadPresets())
  const [presetName, setPresetName] = useState('')
  const [presetMsg, setPresetMsg] = useState('')
  const set = (patch: Patch, key: string) => onChange(patch, key)
  const reset = (...keys: (keyof DesignConfig)[]) => onChange(Object.fromEntries(keys.map(k => [k, D[k as keyof typeof D]])) as Patch, `reset:${keys.join(',')}`)
  const changed = (...keys: (keyof DesignConfig)[]) => keys.some(k => JSON.stringify(d[k]) !== JSON.stringify(D[k as keyof typeof D]))
  const id = (s: string) => `${uid}-${s}`
  const contrastNote = (color: string | null, against = bg) => {
    if (!color) return null
    const ratio = contrastRatio(color, against)
    return ratio < 4.5
      ? <p className="mt-1 text-[10.5px] text-amber-300" role="status">Contraste insuffisant sur ce modèle ({ratio.toFixed(1)}:1, 4,5:1 recommandé)</p>
      : null
  }

  const persistPresets = (list: DesignPreset[], msg: string) => {
    try {
      savePresets(list)
      setPresets(list)
      setPresetMsg(msg)
    } catch {
      setPresetMsg('Enregistrement impossible : stockage du navigateur indisponible.')
    }
  }

  return (
    <div className="text-[12px] text-gray-200 [color-scheme:dark]" aria-label="Réglages du design">
      {/* Barre du panneau : annuler, rétablir, tout réinitialiser */}
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex flex-wrap items-center gap-1.5 border-b border-[#21262d] bg-[#161b22] px-3 py-2">
        <span className="mr-auto text-[13px] font-extrabold text-white">🎨 Design</span>
        <button type="button" className={btn} onClick={onUndo} disabled={!canUndo} aria-label="Annuler" title="Annuler (Ctrl+Z)"><Undo2 size={15} aria-hidden="true" /></button>
        <button type="button" className={btn} onClick={onRedo} disabled={!canRedo} aria-label="Rétablir" title="Rétablir (Ctrl+Maj+Z)"><Redo2 size={15} aria-hidden="true" /></button>
        <button type="button" className={btn} onClick={onResetAll}><RotateCcw size={14} aria-hidden="true" /> Tout réinitialiser</button>
      </div>
      <p className="mb-1 text-[11px] text-gray-500">Modèle : <span className="text-gray-300">{templateName}</span> · aperçu et export PDF identiques</p>

      <Section title="Couleurs et palettes" defaultOpen>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-gray-400">Palettes</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DESIGN_PALETTES.map(p => {
              const active = (Object.keys(p.colors) as (keyof DesignConfig)[]).every(k => d[k] === p.colors[k])
              const swatches = [p.colors.primaryColor, p.colors.accentColor, p.colors.textColor].filter(Boolean) as string[]
              return (
                <button key={p.id} type="button" aria-pressed={active} onClick={() => set(p.colors, `palette:${p.id}`)}
                  className={`flex min-h-[36px] items-center gap-2 rounded-lg border px-2 text-left text-[11px] font-semibold ${active ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-[#30363d] bg-[#21262d] text-gray-300 hover:text-white'}`}>
                  <span className="flex shrink-0 overflow-hidden rounded" aria-hidden="true">
                    {swatches.map(c => <span key={c} className="h-4 w-3" style={{ background: c }} />)}
                  </span>
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>
        <Row label="Couleur principale" changed={changed('primaryColor')} onReset={() => reset('primaryColor')} htmlFor={id('c1')}>
          <ColorField id={id('c1')} label="Couleur principale" value={d.primaryColor} fallback={D.primaryColor} onChange={v => set({ primaryColor: v }, 'primaryColor')} />
        </Row>
        <Row label="Couleur d’accent" changed={changed('accentColor')} onReset={() => reset('accentColor')} htmlFor={id('c2')}>
          <ColorField id={id('c2')} label="Couleur d’accent" value={d.accentColor} fallback={D.accentColor} onChange={v => set({ accentColor: v }, 'accentColor')} />
        </Row>
        <Row label="Couleur secondaire (intitulé du poste)" changed={changed('secondaryColor')} onReset={() => reset('secondaryColor')} htmlFor={id('c3')}
          note={contrastNote(d.secondaryColor, roleBackground(d, templateId))}>
          <ColorField id={id('c3')} label="Couleur secondaire" value={d.secondaryColor} fallback={d.accentColor} onChange={v => set({ secondaryColor: v }, 'secondaryColor')} />
        </Row>
        <Row label="Couleur des titres" changed={changed('titleColor')} onReset={() => reset('titleColor')} htmlFor={id('c4')} note={contrastNote(d.titleColor)}>
          <ColorField id={id('c4')} label="Couleur des titres" value={d.titleColor} fallback={d.primaryColor} onChange={v => set({ titleColor: v }, 'titleColor')} />
        </Row>
        <Row label="Couleur du texte" changed={changed('textColor')} onReset={() => reset('textColor')} htmlFor={id('c5')} note={contrastNote(d.textColor)}>
          <ColorField id={id('c5')} label="Couleur du texte" value={d.textColor} fallback={caps.dark ? '#c9d1d9' : '#333333'} onChange={v => set({ textColor: v }, 'textColor')} />
        </Row>
        <Row label="Couleur des séparateurs" changed={changed('separatorColor')} onReset={() => reset('separatorColor')} htmlFor={id('c6')}>
          <ColorField id={id('c6')} label="Couleur des séparateurs" value={d.separatorColor} fallback={d.primaryColor} onChange={v => set({ separatorColor: v }, 'separatorColor')} />
        </Row>
      </Section>

      <Section title="Typographie" defaultOpen>
        <Row label="Police" changed={changed('fontFamily')} onReset={() => reset('fontFamily')} htmlFor={id('font')}
          note={<p className="mt-1 text-[10.5px] text-gray-500">Polices présentes sur tous les systèmes : l’export PDF utilise la même.</p>}>
          <select id={id('font')} value={d.fontFamily} onChange={e => set({ fontFamily: e.target.value }, 'fontFamily')}
            className="min-h-[36px] w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 text-xs text-gray-100">
            {FONT_CHOICES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Row>
        {([
          ['nameScale', 'Taille du nom'], ['titleScale', 'Taille des titres de section'], ['textScale', 'Taille du texte'], ['lineHeight', 'Hauteur de ligne'],
        ] as const).map(([key, label]) => (
          <Row key={key} label={label} value={pct(d[key])} changed={changed(key)} onReset={() => reset(key)} htmlFor={id(key)}>
            <Slider id={id(key)} label={label} value={d[key]} bound={BOUNDS[key]} onChange={v => set({ [key]: v }, key)} />
          </Row>
        ))}
        <Row label="Épaisseur des titres" changed={changed('headingWeight')} onReset={() => reset('headingWeight')}>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Épaisseur des titres">
            <button type="button" className={seg(d.headingWeight === null)} aria-pressed={d.headingWeight === null} onClick={() => set({ headingWeight: null }, 'headingWeight')}>Modèle</button>
            {HEADING_WEIGHTS.map(w => (
              <button key={w} type="button" className={seg(d.headingWeight === w)} aria-pressed={d.headingWeight === w} style={{ fontWeight: w }} onClick={() => set({ headingWeight: w }, 'headingWeight')}>{w}</button>
            ))}
          </div>
        </Row>
        <Row label="Espacement des lettres (nom et titres)" value={d.letterSpacing === null ? 'Modèle' : `${d.letterSpacing.toFixed(2)} em`} changed={changed('letterSpacing')} onReset={() => reset('letterSpacing')} htmlFor={id('ls')}>
          <Slider id={id('ls')} label="Espacement des lettres" value={d.letterSpacing ?? 0} bound={BOUNDS.letterSpacing} onChange={v => set({ letterSpacing: v }, 'letterSpacing')} />
        </Row>
      </Section>

      <Section title="Mise en page">
        <Row label="Densité" changed={changed('spacing')} onReset={() => reset('spacing')}>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Densité">
            {([['compact', 'Compact'], ['normal', 'Normal'], ['spacious', 'Aéré']] as const).map(([v, l]) => (
              <button key={v} type="button" className={seg(d.spacing === v)} aria-pressed={d.spacing === v} onClick={() => set({ spacing: v }, 'spacing')}>{l}</button>
            ))}
          </div>
        </Row>
        <Row label="Marges du document" value={d.marginMm ? `${d.marginMm} mm` : 'Modèle'} changed={changed('marginMm')} onReset={() => reset('marginMm')} htmlFor={id('mm')}>
          <Slider id={id('mm')} label="Marges du document" value={d.marginMm} bound={BOUNDS.marginMm} onChange={v => set({ marginMm: v }, 'marginMm')} />
        </Row>
        <Row label="Espacement entre sections" value={pct(d.sectionGap)} changed={changed('sectionGap')} onReset={() => reset('sectionGap')} htmlFor={id('sg')}>
          <Slider id={id('sg')} label="Espacement entre sections" value={d.sectionGap} bound={BOUNDS.sectionGap} onChange={v => set({ sectionGap: v }, 'sectionGap')} />
        </Row>
        <Row label="Espacement entre expériences" value={pct(d.entryGap)} changed={changed('entryGap')} onReset={() => reset('entryGap')} htmlFor={id('eg')}>
          <Slider id={id('eg')} label="Espacement entre expériences" value={d.entryGap} bound={BOUNDS.entryGap} onChange={v => set({ entryGap: v }, 'entryGap')} />
        </Row>
        <Row label="Alignement des titres" changed={changed('titleAlign')} onReset={() => reset('titleAlign')}>
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="Alignement des titres">
            {([['template', 'Modèle'], ['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']] as const).map(([v, l]) => (
              <button key={v} type="button" className={seg(d.titleAlign === v)} aria-pressed={d.titleAlign === v} onClick={() => set({ titleAlign: v }, 'titleAlign')}>{l}</button>
            ))}
          </div>
        </Row>
        <Row label="Largeur de la colonne latérale" value={d.sidebarWidth ? `${d.sidebarWidth} px` : `Modèle${caps.sidebar ? ` (${caps.sidebar} px)` : ''}`}
          changed={changed('sidebarWidth')} onReset={() => reset('sidebarWidth')} htmlFor={id('sw')}
          na={!caps.sidebar && `Sans effet sur ${templateName} (une seule colonne).`}>
          <Slider id={id('sw')} label="Largeur de la colonne latérale" value={d.sidebarWidth ?? caps.sidebar ?? 220} bound={BOUNDS.sidebarWidth} disabled={!caps.sidebar} onChange={v => set({ sidebarWidth: v }, 'sidebarWidth')} />
        </Row>
        <Row label="Style de l’en-tête" changed={changed('headerStyle')} onReset={() => reset('headerStyle')} na={!caps.header && `Sans effet sur ${templateName} (pas de bandeau d’en-tête).`}>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Style de l’en-tête">
            {([['solid', 'Plein'], ['gradient', 'Dégradé'], ['minimal', 'Minimal']] as const).map(([v, l]) => (
              <button key={v} type="button" disabled={!caps.header} className={seg(d.headerStyle === v)} aria-pressed={d.headerStyle === v} onClick={() => set({ headerStyle: v }, 'headerStyle')}>{l}</button>
            ))}
          </div>
        </Row>
        <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12px] text-gray-300">
          <input type="checkbox" className="h-4 w-4 accent-indigo-400" checked={d.avoidBreaks} onChange={e => set({ avoidBreaks: e.target.checked }, 'avoidBreaks')} />
          Ne pas couper une expérience entre deux pages
        </label>
        <div className={caps.bars ? '' : 'opacity-55'}>
          <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12px] text-gray-300">
            <input type="checkbox" className="h-4 w-4 accent-indigo-400" disabled={!caps.bars} checked={d.showBars} onChange={e => set({ showBars: e.target.checked }, 'showBars')} />
            Barres de niveau des compétences
          </label>
          {!caps.bars && <p className="text-[10.5px] text-amber-300/90">Sans effet sur {templateName} (pas de barres de niveau).</p>}
        </div>
      </Section>

      <Section title="Séparateurs et sections">
        <Row label="Style des séparateurs" changed={changed('separatorStyle')} onReset={() => reset('separatorStyle')}>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Style des séparateurs">
            {([['template', 'Modèle'], ['none', 'Aucun'], ['solid', 'Plein'], ['dashed', 'Tirets'], ['dotted', 'Pointillés'], ['double', 'Double']] as const).map(([v, l]) => (
              <button key={v} type="button" className={seg(d.separatorStyle === v)} aria-pressed={d.separatorStyle === v} onClick={() => set({ separatorStyle: v }, 'separatorStyle')}>{l}</button>
            ))}
          </div>
        </Row>
        <Row label="Épaisseur des séparateurs" value={d.separatorWidth ? `${d.separatorWidth} px` : 'Modèle'} changed={changed('separatorWidth')} onReset={() => reset('separatorWidth')} htmlFor={id('spw')}
          na={d.separatorStyle === 'none' && 'Sans effet : séparateurs masqués.'}>
          <Slider id={id('spw')} label="Épaisseur des séparateurs" value={d.separatorWidth ?? 1.5} bound={BOUNDS.separatorWidth} disabled={d.separatorStyle === 'none'} onChange={v => set({ separatorWidth: v }, 'separatorWidth')} />
        </Row>
      </Section>

      <Section title="Photo">
        <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[12px] text-gray-300">
          <input type="checkbox" className="h-4 w-4 accent-indigo-400" checked={d.showPhoto} onChange={e => set({ showPhoto: e.target.checked }, 'showPhoto')} />
          Afficher la photo
        </label>
        <Row label="Forme" changed={changed('photoShape')} onReset={() => reset('photoShape')}>
          <div className="grid grid-cols-5 gap-1" role="group" aria-label="Forme de la photo">
            {([['template', 'Modèle'], ['circle', 'Cercle'], ['square', 'Carré'], ['portrait', 'Portrait'], ['rectangle', 'Rectangle']] as const).map(([v, l]) => (
              <button key={v} type="button" disabled={!d.showPhoto} className={seg(d.photoShape === v)} aria-pressed={d.photoShape === v} onClick={() => set({ photoShape: v }, 'photoShape')}>{l}</button>
            ))}
          </div>
        </Row>
        <Row label="Taille" value={d.photoSize ? `${d.photoSize} px` : 'Modèle'} changed={changed('photoSize')} onReset={() => reset('photoSize')} htmlFor={id('ps')}>
          <Slider id={id('ps')} label="Taille de la photo" value={d.photoSize ?? 100} bound={BOUNDS.photoSize} disabled={!d.showPhoto} onChange={v => set({ photoSize: v }, 'photoSize')} />
        </Row>
        <Row label="Bordure" value={d.photoBorder === null ? 'Modèle' : `${d.photoBorder} px`} changed={changed('photoBorder', 'photoBorderColor')} onReset={() => reset('photoBorder', 'photoBorderColor')} htmlFor={id('pb')}>
          <Slider id={id('pb')} label="Épaisseur de la bordure de la photo" value={d.photoBorder ?? 3} bound={BOUNDS.photoBorder} disabled={!d.showPhoto} onChange={v => set({ photoBorder: v }, 'photoBorder')} />
          <div className="mt-2"><ColorField id={id('pbc')} label="Couleur de la bordure" value={d.photoBorderColor} fallback={d.primaryColor} onChange={v => set({ photoBorderColor: v, photoBorder: d.photoBorder ?? 3 }, 'photoBorderColor')} /></div>
        </Row>
        <Row label="Arrondi des coins" value={d.photoRadius === null ? 'Modèle' : `${d.photoRadius} px`} changed={changed('photoRadius')} onReset={() => reset('photoRadius')} htmlFor={id('pr')}
          na={d.photoShape === 'circle' && 'Sans effet sur une photo ronde.'}>
          <Slider id={id('pr')} label="Arrondi des coins de la photo" value={d.photoRadius ?? 4} bound={BOUNDS.photoRadius} disabled={!d.showPhoto || d.photoShape === 'circle'} onChange={v => set({ photoRadius: v }, 'photoRadius')} />
        </Row>
        <Row label="Zoom (ratio conservé)" value={pct(d.photoZoom)} changed={changed('photoZoom')} onReset={() => reset('photoZoom')} htmlFor={id('pz')}>
          <Slider id={id('pz')} label="Zoom de la photo" value={d.photoZoom} bound={BOUNDS.photoZoom} disabled={!d.showPhoto} onChange={v => set({ photoZoom: v }, 'photoZoom')} />
        </Row>
        <Row label="Cadrage horizontal" value={`${d.photoX} %`} changed={changed('photoX', 'photoY')} onReset={() => reset('photoX', 'photoY')} htmlFor={id('px')}>
          <Slider id={id('px')} label="Cadrage horizontal de la photo" value={d.photoX} bound={BOUNDS.photoX} disabled={!d.showPhoto} onChange={v => set({ photoX: v }, 'photoX')} />
        </Row>
        <Row label="Cadrage vertical" value={`${d.photoY} %`} changed={false} onReset={() => {}} htmlFor={id('py')}>
          <Slider id={id('py')} label="Cadrage vertical de la photo" value={d.photoY} bound={BOUNDS.photoY} disabled={!d.showPhoto} onChange={v => set({ photoY: v }, 'photoY')} />
        </Row>
      </Section>

      <Section title="Mes presets de design">
        <form
          className="flex gap-1.5"
          onSubmit={e => {
            e.preventDefault()
            const name = presetName.trim().slice(0, 60)
            if (!name) return
            const others = presets.filter(p => p.name !== name)
            persistPresets([{ id: crypto.randomUUID(), name, design: normalizeDesign(d), savedAt: Date.now() }, ...others], `Preset « ${name} » enregistré dans ce navigateur.`)
            setPresetName('')
          }}
        >
          <label htmlFor={id('pn')} className="sr-only">Nom du preset</label>
          <input id={id('pn')} value={presetName} maxLength={60} onChange={e => setPresetName(e.target.value)} placeholder="Nom du preset"
            className="min-h-[36px] w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 text-xs text-gray-100" />
          <button type="submit" className={btn} disabled={!presetName.trim()}><Save size={14} aria-hidden="true" /> Enregistrer</button>
        </form>
        {presetMsg && <p role="status" className="text-[11px] text-emerald-300">{presetMsg}</p>}
        {presets.length === 0 && <p className="text-[11px] text-gray-500">Aucun preset enregistré.</p>}
        <ul className="space-y-1">
          {presets.map(p => (
            <li key={p.id} className="flex items-center gap-1.5 rounded-md border border-[#21262d] bg-[#0d1117] px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-[12px]" title={p.name}>{p.name}</span>
              <button type="button" className={btn} onClick={() => { onReplace(p.design); setPresetMsg(`Preset « ${p.name} » appliqué.`) }}>Appliquer</button>
              <button type="button" className={btn} aria-label={`Supprimer le preset ${p.name}`} onClick={() => persistPresets(presets.filter(x => x.id !== p.id), `Preset « ${p.name} » supprimé.`)}><Trash2 size={14} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
