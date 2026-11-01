// Organisation des sections (P6) : glisser-déposer sur ordinateur, boutons « Monter » et « Descendre »
// au clavier et sur mobile, masquer, renommer, ajouter, supprimer (avec confirmation), saut de page.
// Chaque changement passe par le document : code régénéré, PDF recompilé, annulable.
import { useId, useState, type DragEvent } from 'react'
import { LABELS } from '../templates/common'
import {
  MAX_CUSTOM_ITEMS, MAX_CUSTOM_SECTIONS, SECTION_NAMES, move, nextCustomId, orderedSections, sanitizeLayout,
  type SectionLayout, type StandardSection,
} from '../lib/layout'
import type { CvData } from '../lib/cvData'
import { btn, btnDanger, btnGhost, field, label } from './ui'

const LABEL_KEY: Record<StandardSection, keyof typeof LABELS.fr> = {
  summary: 'summary', experience: 'experience', education: 'education', skills: 'skills', projects: 'projects',
  publications: 'publications', certifications: 'certifications', languages: 'languages', interests: 'interests',
}

/** Nombre d'éléments renseignés : une section vide n'apparaît pas dans le PDF */
function filled(cv: CvData, id: StandardSection): number {
  switch (id) {
    case 'summary': return cv.summary.trim() ? 1 : 0
    case 'experience': return cv.experiences.length
    case 'education': return cv.education.length
    case 'skills': return cv.skills.length
    case 'projects': return cv.projects.length
    case 'publications': return cv.publications.length
    case 'certifications': return cv.certifications.length
    case 'languages': return cv.languages.length
    case 'interests': return cv.interests.length
  }
}

export function SectionOrganizer({ layout: raw, templateSections, lang, cv, usesSample, twoColumns, onChange, previous, onPrevious }: {
  layout: SectionLayout | undefined
  /** Ordre du modèle choisi */
  templateSections: readonly string[]
  lang: 'fr' | 'en'
  cv: CvData
  /** Aucune donnée : le PDF montre l'exemple */
  usesSample: boolean
  twoColumns: boolean
  onChange: (layout: SectionLayout) => void
  /** Retour à l'étape précédente (réglage ou modèle) */
  previous: string | null
  onPrevious: () => void
}) {
  const id = useId()
  const layout = sanitizeLayout(raw)
  const order = orderedSections(layout, templateSections)
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')

  const nameOf = (section: string) => {
    const custom = layout.custom.find(c => c.id === section)
    if (custom) return custom.title
    return layout.titles[section] || LABELS[lang][LABEL_KEY[section as StandardSection]]
  }
  const commit = (patch: Partial<SectionLayout>) => onChange(sanitizeLayout({ ...layout, ...patch }))
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    commit({ order: move(order, from, to) })
    setAnnounce(`${nameOf(order[from])} : position ${to + 1} sur ${order.length}.`)
  }
  const toggle = (list: 'hidden' | 'breakBefore', section: string) =>
    commit({ [list]: layout[list].includes(section) ? layout[list].filter(x => x !== section) : [...layout[list], section] })

  const addSection = () => {
    const title = newTitle.trim()
    const nextId = nextCustomId(layout)
    if (!title || !nextId || layout.custom.length >= MAX_CUSTOM_SECTIONS) return
    commit({ custom: [...layout.custom, { id: nextId, title, items: [''] }], order: [...order, nextId] })
    setNewTitle('')
    setAnnounce(`Section « ${title} » ajoutée en fin de CV.`)
  }
  const removeSection = (section: string) => {
    commit({ custom: layout.custom.filter(c => c.id !== section), order: order.filter(x => x !== section) })
    setConfirmDelete(null)
    setAnnounce('Section supprimée. « Annuler le dernier réglage » la rétablit.')
  }
  const setCustom = (section: string, patch: { title?: string; items?: string[] }) =>
    commit({ custom: layout.custom.map(c => (c.id === section ? { ...c, ...patch } : c)) })

  const dnd = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { setDragging(index); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)) },
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(index) },
    onDragLeave: () => setOver(o => (o === index ? null : o)),
    onDrop: (e: DragEvent) => { e.preventDefault(); const from = dragging ?? Number(e.dataTransfer.getData('text/plain')); reorder(from, index); setDragging(null); setOver(null) },
    onDragEnd: () => { setDragging(null); setOver(null) },
  })

  return (
    <div className="space-y-2 text-xs text-gray-300">
      <p className="text-gray-400">Glissez une section, ou utilisez ↑ et ↓. Le code et le PDF suivent aussitôt ; « Annuler le dernier réglage » revient en arrière.</p>
      {previous && <button type="button" className={`${btn} w-full`} onClick={onPrevious}>↶ {previous}</button>}
      {usesSample && <p className="text-amber-300">Aucune donnée saisie : l’aperçu montre l’exemple, dans l’ordre choisi.</p>}
      <ol className="space-y-1.5" aria-label="Ordre des sections du CV">
        {order.map((section, i) => {
          const custom = layout.custom.find(c => c.id === section)
          const hidden = layout.hidden.includes(section)
          const count = custom ? custom.items.filter(Boolean).length : filled(cv, section as StandardSection)
          const name = nameOf(section)
          return (
            <li key={section} data-section={section} {...dnd(i)}
              className={`rounded-lg border p-2 ${over === i && dragging !== i ? 'border-indigo-400 bg-indigo-500/10' : 'border-[#2a313c]'} ${dragging === i ? 'opacity-50' : ''} ${hidden ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="cursor-grab select-none px-1 text-gray-500" title="Glisser pour déplacer">⠿</span>
                <span className="w-5 shrink-0 text-right text-gray-500">{i + 1}.</span>
                <input aria-label={`Titre de la section ${custom ? custom.title : SECTION_NAMES[section as StandardSection]}`} className={`${field} min-w-0 py-1`} maxLength={60}
                  value={custom ? custom.title : layout.titles[section] ?? ''} placeholder={name}
                  onChange={e => custom ? setCustom(section, { title: e.target.value }) : commit({ titles: { ...layout.titles, [section]: e.target.value } })} />
                <button type="button" className={`${btnGhost} px-2`} onClick={() => reorder(i, i - 1)} disabled={i === 0} aria-label={`Monter ${name}`} title="Monter">↑</button>
                <button type="button" className={`${btnGhost} px-2`} onClick={() => reorder(i, i + 1)} disabled={i === order.length - 1} aria-label={`Descendre ${name}`} title="Descendre">↓</button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
                <label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={!hidden} onChange={() => toggle('hidden', section)} aria-label={`Afficher ${name}`} /> Afficher</label>
                {!twoColumns && <label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={layout.breakBefore.includes(section)} onChange={() => toggle('breakBefore', section)} aria-label={`Nouvelle page avant ${name}`} /> Nouvelle page avant</label>}
                <span className="text-gray-500">{count ? `${count} élément${count > 1 ? 's' : ''}` : 'vide : non affichée'}</span>
                {custom && (confirmDelete === section
                  ? <span className="flex items-center gap-1" role="group" aria-label={`Confirmer la suppression de ${name}`}>
                      <button type="button" className={btnDanger} onClick={() => removeSection(section)}>Supprimer définitivement</button>
                      <button type="button" className={btn} onClick={() => setConfirmDelete(null)} autoFocus>Annuler</button>
                    </span>
                  : <button type="button" className={btnGhost} onClick={() => setConfirmDelete(section)}>Supprimer…</button>)}
              </div>
              {custom && (
                <div className="mt-1 pl-8">
                  <label className={label} htmlFor={`${id}-${section}`}>Contenu de « {custom.title} » (une ligne par élément)</label>
                  <textarea id={`${id}-${section}`} className={`${field} resize-y`} rows={3} value={custom.items.join('\n')}
                    onChange={e => setCustom(section, { items: e.target.value.split('\n').slice(0, MAX_CUSTOM_ITEMS) })} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`${id}-new`}>Titre de la nouvelle section</label>
        <input id={`${id}-new`} className={field} value={newTitle} maxLength={60} placeholder="Nouvelle section (ex. Bénévolat)"
          onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSection() }} />
        <button type="button" className={btn} onClick={addSection} disabled={!newTitle.trim() || layout.custom.length >= MAX_CUSTOM_SECTIONS}>+ Ajouter</button>
      </div>
      {twoColumns && <p className="text-gray-500">Deux colonnes : coordonnées, compétences, langues, certifications et centres d’intérêt restent dans la colonne latérale, dans l’ordre choisi.</p>}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  )
}
