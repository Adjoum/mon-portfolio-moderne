// Bibliothèque de modèles : miniatures, réglages (couleur, police, taille, marges, espacement, photo,
// colonnes, langue des titres), puis génération du code à partir des données du CV.
import { useId } from 'react'
import { TEMPLATE_LIBRARY, templateById } from '../templates/library'
import { ACCENTS, FONTS, type TemplateOptions } from '../templates/types'
import { btnPrimary, field, label } from './ui'

export interface TemplateChoice { id: string; options: TemplateOptions }

export function TemplateGallery({ choice, onChange, onApply, usesSample }: {
  choice: TemplateChoice
  onChange: (c: TemplateChoice) => void
  onApply: () => void
  /** Aucune donnée saisie : le modèle sera rempli avec l'exemple */
  usesSample: boolean
}) {
  const id = useId()
  const template = templateById(choice.id) ?? TEMPLATE_LIBRARY[0]
  const o = choice.options
  const set = (patch: Partial<TemplateOptions>) => onChange({ ...choice, options: { ...o, ...patch } })
  const select = (next: string) => {
    const t = templateById(next)
    if (t) onChange({ id: t.id, options: { ...t.defaults, lang: o.lang, photo: t.supports.photo && (o.photo || t.defaults.photo) } })
  }

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-2" aria-label="Modèles de CV">
        {TEMPLATE_LIBRARY.map(t => {
          const active = t.id === template.id
          const thumb = `/latex-templates/${t.id}${t.supports.photo && active && o.photo ? '-photo' : ''}.png`
          return (
            <li key={t.id}>
              <button type="button" onClick={() => select(t.id)} aria-pressed={active}
                className={`group flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 ${active ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-[#2a313c] hover:border-gray-500'}`}>
                <img src={thumb} alt="" loading="lazy" className="aspect-[210/297] w-full bg-white object-cover object-top" />
                <span className="block p-1.5">
                  <span className="block truncate text-[11px] font-bold text-gray-100">{t.name}</span>
                  <span className="block truncate text-[10px] text-gray-500">{t.category}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="text-xs leading-relaxed text-gray-400"><strong className="text-gray-200">{template.name}</strong> — {template.description}</p>

      <fieldset className="space-y-3 rounded-lg border border-[#2a313c] p-3">
        <legend className="px-1 text-xs font-bold text-gray-200">Réglages</legend>
        <div>
          <span className={label} id={`${id}-accent`}>Couleur</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${id}-accent`}>
            {ACCENTS.map(a => (
              <button key={a.id} type="button" role="radio" aria-checked={o.accent === a.id} aria-label={a.label} title={a.label}
                onClick={() => set({ accent: a.id })}
                className={`h-8 w-8 rounded-full border-2 ${o.accent === a.id ? 'border-white' : 'border-transparent'}`} style={{ background: `#${a.id}` }} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor={`${id}-font`}>Police</label>
            <select id={`${id}-font`} className={`${field} [color-scheme:dark]`} value={o.font} onChange={e => set({ font: e.target.value as TemplateOptions['font'] })}>
              {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-size`}>Taille du texte</label>
            <select id={`${id}-size`} className={`${field} [color-scheme:dark]`} value={o.size} onChange={e => set({ size: Number(e.target.value) as TemplateOptions['size'] })}>
              <option value={10}>10 pt</option><option value={11}>11 pt</option><option value={12}>12 pt</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-margins`}>Marges</label>
            <select id={`${id}-margins`} className={`${field} [color-scheme:dark]`} value={o.margins} onChange={e => set({ margins: e.target.value as TemplateOptions['margins'] })}>
              <option value="compact">Étroites</option><option value="normal">Normales</option><option value="large">Larges</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`${id}-lang`}>Titres des sections</label>
            <select id={`${id}-lang`} className={`${field} [color-scheme:dark]`} value={o.lang} onChange={e => set({ lang: e.target.value as 'fr' | 'en' })}>
              <option value="fr">Français</option><option value="en">English</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5 text-xs text-gray-300">
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={o.compact} onChange={e => set({ compact: e.target.checked })} /> Espacement resserré (tenir sur une page)</label>
          {template.supports.photo
            ? <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={o.photo} onChange={e => set({ photo: e.target.checked })} /> Emplacement pour la photo</label>
            : <p className="text-gray-500">Ce modèle n’a pas de photo (lecture fiable par les logiciels de recrutement).</p>}
          {template.supports.twoColumns && <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={o.twoColumns} onChange={e => set({ twoColumns: e.target.checked })} /> Deux colonnes</label>}
        </div>
      </fieldset>

      <button type="button" className={`${btnPrimary} w-full`} onClick={onApply}>Générer le CV avec ce modèle</button>
      <p className="text-[11px] leading-snug text-gray-500">
        {usesSample
          ? 'Aucune donnée saisie : le modèle est rempli avec un exemple à remplacer (onglet « Données » ou « Importer »).'
          : 'Le code est généré à partir de l’onglet « Données » ; la version actuelle reste restaurable.'}
      </p>
    </div>
  )
}
