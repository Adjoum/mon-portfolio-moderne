// Panneau « Design » (P5) : typographie, mise en page et couleurs. Chaque réglage modifie la
// configuration structurée du document (options du modèle et variables de thème) ; le studio
// régénère le code, puis le PDF après une courte temporisation. Aucun texte LaTeX n'est retouché.
import { useId, useState, type ReactNode } from 'react'
import { TEMPLATE_LIBRARY, templateById } from '../templates/library'
import { ACCENTS, FONTS, type TemplateOptions } from '../templates/types'
import { BOUNDS, DEFAULT_DESIGN, DETAIL_STEPS, PALETTES, SIZE_STEPS, sanitizeTheme, type Density, type Separator, type ThemeOverrides } from '../templates/theme'
import type { TemplateChoice } from '../lib/templateSwitch'
import { btn, field, label } from './ui'

const MARGIN_CM = { compact: 1.4, normal: 1.9, large: 2.4 } as const
const select = `${field} [color-scheme:dark]`

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-[#2a313c]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-bold text-gray-200 sm:min-h-9">
        {title}<span aria-hidden="true" className="text-gray-500 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 border-t border-[#2a313c] p-3">{children}</div>
    </details>
  )
}

function Range({ id, text, value, min, max, step, unit, onChange }: {
  id: string; text: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <label className={`${label} flex justify-between`} htmlFor={id}><span>{text}</span><output htmlFor={id} className="font-normal text-gray-400">{value.toLocaleString('fr-FR')} {unit}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-indigo-400" />
    </div>
  )
}

/** Couleur : nuancier natif et saisie hexadécimale validée ; « Auto » revient à la couleur du modèle */
function ColorField({ id, text, value, fallback, onChange }: {
  id: string; text: string; value: string | undefined; fallback: string; onChange: (hex: string | undefined) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = value ?? fallback
  const commit = (raw: string) => {
    const hex = raw.replace(/^#/, '').trim()
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) onChange(hex.toUpperCase())
    setDraft(null)
  }
  return (
    <div>
      <span className={label} id={`${id}-label`}>{text}</span>
      <div className="flex items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
        <input type="color" aria-label={`${text} (nuancier)`} value={`#${shown}`} onChange={e => onChange(e.target.value.slice(1).toUpperCase())}
          className="h-9 w-11 shrink-0 cursor-pointer rounded border border-[#30363d] bg-transparent" />
        <input aria-label={`${text} (hexadécimal)`} value={draft ?? `#${shown}`} maxLength={7} spellCheck={false}
          onChange={e => setDraft(e.target.value)} onBlur={e => commit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value) }}
          className={`${field} font-mono uppercase`} />
        {value !== undefined && <button type="button" className={btn} onClick={() => onChange(undefined)} title="Couleur du modèle">Auto</button>}
      </div>
    </div>
  )
}

export function DesignPanel({ choice, onChange, previous, onPrevious }: {
  choice: TemplateChoice
  onChange: (c: TemplateChoice, kind: 'options') => void
  previous: string | null
  onPrevious: () => void
}) {
  const id = useId()
  const template = templateById(choice.id) ?? TEMPLATE_LIBRARY[0]
  const o = choice.options
  const t = sanitizeTheme(o.theme)
  /** Style d'origine du modèle : valeurs affichées tant que l'utilisateur ne les change pas */
  const base = { ...DEFAULT_DESIGN, ...template.design }
  const setOptions = (patch: Partial<TemplateOptions>) => onChange({ ...choice, options: { ...o, ...patch } }, 'options')
  const setTheme = (patch: Partial<ThemeOverrides>) => {
    const next = { ...t, ...patch }
    for (const key of Object.keys(patch) as (keyof ThemeOverrides)[]) if (patch[key] === undefined) delete next[key]
    setOptions({ theme: sanitizeTheme(next) })
  }
  const density: Density = t.density ?? (o.compact ? 'compact' : 'standard')
  const reset = () => onChange({ ...choice, options: { ...template.defaults, lang: o.lang, photo: template.supports.photo && o.photo, theme: {} } }, 'options')
  const customized = Object.keys(t).length > 0 || (['accent', 'font', 'size', 'margins', 'compact'] as const).some(k => o[k] !== template.defaults[k])

  return (
    <div className="space-y-3 text-xs text-gray-300">
      <p className="leading-relaxed text-gray-400">
        Style de <strong className="text-gray-200">{template.name}</strong>. Chaque réglage met à jour le code puis le PDF ; les données du CV ne changent pas.
      </p>
      <div className="flex flex-wrap gap-2">
        {previous && <button type="button" className={btn} onClick={onPrevious}>↶ {previous}</button>}
        <button type="button" className={btn} onClick={reset} disabled={!customized}>Réinitialiser au style du modèle</button>
      </div>

      <Section title="Couleurs" open>
        <div>
          <span className={label} id={`${id}-palettes`}>Palettes</span>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby={`${id}-palettes`}>
            {PALETTES.map(p => (
              <button key={p.id} type="button" className={`${btn} justify-start`} aria-label={`Palette ${p.label}`}
                onClick={() => onChange({ ...choice, options: { ...o, accent: p.accent, theme: sanitizeTheme({ ...t, secondary: p.secondary, heading: p.heading, text: p.text, rule: p.rule }) } }, 'options')}>
                <span className="flex" aria-hidden="true">{[p.accent, p.secondary, p.rule].map(c => <span key={c} className="-mr-1 h-4 w-4 rounded-full border border-black/30" style={{ background: `#${c}` }} />)}</span>
                <span className="ml-1">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label} id={`${id}-accent`}>Couleur principale</span>
          <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${id}-accent`}>
            {ACCENTS.map(a => (
              <button key={a.id} type="button" role="radio" aria-checked={o.accent === a.id} aria-label={a.label} title={a.label}
                onClick={() => setOptions({ accent: a.id })}
                className={`h-8 w-8 rounded-full border-2 ${o.accent === a.id ? 'border-white' : 'border-transparent'}`} style={{ background: `#${a.id}` }} />
            ))}
          </div>
          <ColorField id={`${id}-accent-hex`} text="Principale (hexadécimal)" value={o.accent} fallback={o.accent} onChange={hex => hex && setOptions({ accent: hex })} />
        </div>
        <ColorField id={`${id}-secondary`} text="Couleur secondaire (titre professionnel)" value={t.secondary} fallback={o.accent} onChange={secondary => setTheme({ secondary })} />
        <ColorField id={`${id}-heading`} text="Couleur des titres" value={t.heading} fallback={o.accent} onChange={heading => setTheme({ heading })} />
        <ColorField id={`${id}-text`} text="Couleur du texte" value={t.text} fallback="000000" onChange={text => setTheme({ text })} />
        <ColorField id={`${id}-rule`} text="Couleur des lignes et bordures" value={t.rule} fallback="C9CFD8" onChange={rule => setTheme({ rule })} />
        {template.id === 'minimal-ats' && <p className="text-gray-500">Modèle ATS : couleur principale graphite imposée pour une lecture fiable ; titres, texte et filets restent réglables.</p>}
      </Section>

      <Section title="Typographie" open>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={label} htmlFor={`${id}-font`}>Police</label>
            <select id={`${id}-font`} className={select} value={o.font} onChange={e => setOptions({ font: e.target.value as TemplateOptions['font'] })}>
              {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-size`}>Texte principal</label>
            <select id={`${id}-size`} className={select} value={o.size} onChange={e => setOptions({ size: Number(e.target.value) as TemplateOptions['size'] })}>
              <option value={10}>10 pt</option><option value={11}>11 pt</option><option value={12}>12 pt</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-detail`}>Descriptions et coordonnées</label>
            <select id={`${id}-detail`} className={select} value={t.detailSize ?? 'small'} onChange={e => setTheme({ detailSize: e.target.value as ThemeOverrides['detailSize'] })}>
              {DETAIL_STEPS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <Range id={`${id}-name`} text="Taille du nom" value={t.nameSize ?? base.nameSize} min={BOUNDS.nameSize[0]} max={BOUNDS.nameSize[1]} step={1} unit="pt" onChange={nameSize => setTheme({ nameSize })} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor={`${id}-headline`}>Titre professionnel</label>
            <select id={`${id}-headline`} className={select} value={t.headlineSize ?? ''} onChange={e => setTheme({ headlineSize: (e.target.value || undefined) as ThemeOverrides['headlineSize'] })}>
              <option value="">Du modèle</option>
              {SIZE_STEPS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-section`}>Titres de section</label>
            <select id={`${id}-section`} className={select} value={t.sectionSize ?? ''} onChange={e => setTheme({ sectionSize: (e.target.value || undefined) as ThemeOverrides['sectionSize'] })}>
              <option value="">Du modèle</option>
              {SIZE_STEPS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <fieldset className="space-y-1">
          <legend className={label}>Style des titres</legend>
          {([['headlineItalic', 'Titre professionnel en italique'], ['sectionBold', 'Titres de section en gras'], ['sectionUpper', 'Titres de section en majuscules']] as const).map(([key, text]) => (
            <label key={key} className="flex min-h-9 items-center gap-2">
              <input type="checkbox" checked={t[key] ?? base[key]} onChange={e => setTheme({ [key]: e.target.checked })} /> {text}
            </label>
          ))}
        </fieldset>
        <Range id={`${id}-tracking`} text="Espacement des lettres des titres" value={t.tracking ?? base.tracking} min={BOUNDS.tracking[0]} max={BOUNDS.tracking[1]} step={5} unit="‰" onChange={tracking => setTheme({ tracking })} />
        <Range id={`${id}-spread`} text="Interligne" value={t.lineSpread ?? 1} min={BOUNDS.lineSpread[0]} max={BOUNDS.lineSpread[1]} step={0.05} unit="×" onChange={lineSpread => setTheme({ lineSpread })} />
        <Range id={`${id}-parskip`} text="Espacement entre paragraphes" value={t.paragraphSkip ?? (density === 'compact' ? 2 : density === 'airy' ? 6 : 4)} min={BOUNDS.paragraphSkip[0]} max={BOUNDS.paragraphSkip[1]} step={0.5} unit="pt" onChange={paragraphSkip => setTheme({ paragraphSkip })} />
      </Section>

      <Section title="Mise en page" open>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor={`${id}-paper`}>Format</label>
            <select id={`${id}-paper`} className={select} value={t.paper ?? 'a4'} onChange={e => setTheme({ paper: e.target.value as 'a4' | 'letter' })}>
              <option value="a4">A4</option><option value="letter">Letter (US)</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-density`}>Densité</label>
            <select id={`${id}-density`} className={select} value={density}
              onChange={e => { const d = e.target.value as Density; onChange({ ...choice, options: { ...o, compact: d === 'compact', theme: sanitizeTheme({ ...t, density: d }) } }, 'options') }}>
              <option value="compact">Compacte</option><option value="standard">Standard</option><option value="airy">Aérée</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-align`}>Alignement des titres</label>
            <select id={`${id}-align`} className={select} value={t.sectionAlign ?? 'left'} onChange={e => setTheme({ sectionAlign: e.target.value as 'left' | 'center' })}>
              <option value="left">À gauche</option><option value="center">Centrés</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-separator`}>Séparateurs</label>
            <select id={`${id}-separator`} className={select} value={t.separator ?? 'template'} onChange={e => setTheme({ separator: e.target.value as Separator })}>
              <option value="template">Du modèle</option><option value="none">Aucun</option><option value="thin">Fin</option><option value="medium">Moyen</option><option value="thick">Épais</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={label} htmlFor={`${id}-lang`}>Langue des titres de section</label>
            <select id={`${id}-lang`} className={select} value={o.lang} onChange={e => setOptions({ lang: e.target.value as 'fr' | 'en' })}>
              <option value="fr">Français</option><option value="en">English</option>
            </select>
          </div>
        </div>
        <Range id={`${id}-mx`} text="Marges gauche et droite" value={t.marginX ?? MARGIN_CM[o.margins]} min={BOUNDS.marginX[0]} max={BOUNDS.marginX[1]} step={0.1} unit="cm" onChange={marginX => setTheme({ marginX })} />
        <Range id={`${id}-my`} text="Marges haut et bas" value={t.marginY ?? MARGIN_CM[o.margins]} min={BOUNDS.marginY[0]} max={BOUNDS.marginY[1]} step={0.1} unit="cm" onChange={marginY => setTheme({ marginY })} />
        <Range id={`${id}-before`} text="Espace avant les sections" value={t.sectionBefore ?? (density === 'compact' ? 5 : density === 'airy' ? 12 : 8)} min={BOUNDS.sectionBefore[0]} max={BOUNDS.sectionBefore[1]} step={0.5} unit="pt" onChange={sectionBefore => setTheme({ sectionBefore })} />
        <Range id={`${id}-after`} text="Espace sous les titres" value={t.sectionAfter ?? (density === 'compact' ? 3 : density === 'airy' ? 7 : 5)} min={BOUNDS.sectionAfter[0]} max={BOUNDS.sectionAfter[1]} step={0.5} unit="pt" onChange={sectionAfter => setTheme({ sectionAfter })} />
        <Range id={`${id}-gap`} text="Espace entre expériences" value={t.entryGap ?? (density === 'compact' ? 4 : density === 'airy' ? 11 : 7)} min={BOUNDS.entryGap[0]} max={BOUNDS.entryGap[1]} step={0.5} unit="pt" onChange={entryGap => setTheme({ entryGap })} />
        {template.supports.twoColumns && <>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={o.twoColumns} onChange={e => setOptions({ twoColumns: e.target.checked })} /> Deux colonnes</label>
          {o.twoColumns && (
            <Range id={`${id}-ratio`} text="Largeur de la colonne latérale" value={Math.round((t.columnRatio ?? base.columnRatio ?? 0.3) * 100)} min={BOUNDS.columnRatio[0] * 100} max={BOUNDS.columnRatio[1] * 100} step={1} unit="%"
              onChange={v => setTheme({ columnRatio: v / 100 })} />
          )}
        </>}
        {template.supports.photo
          ? <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={o.photo} onChange={e => setOptions({ photo: e.target.checked })} /> Emplacement pour la photo</label>
          : <p className="text-gray-500">Ce modèle n’a pas de photo (lecture fiable par les logiciels de recrutement).</p>}
        <fieldset className="space-y-1">
          <legend className={label}>Sauts de page</legend>
          <label className="flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={t.keepEntries ?? true} onChange={e => setTheme({ keepEntries: e.target.checked })} /> Ne pas couper une expérience ou une formation entre deux pages
          </label>
          <p className="text-gray-500">Un titre de section n’est jamais laissé seul en bas de page.</p>
        </fieldset>
      </Section>
    </div>
  )
}
