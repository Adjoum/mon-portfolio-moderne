// Galerie des 8 modèles : miniatures fidèles (le CV de l'utilisateur rendu dans chaque modèle, avec
// son design), filtre par style, prévisualisation rapide, modèle actuel identifié. Les données du
// candidat ne changent jamais en changeant de modèle.
import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Dialog } from '../../features/latex-studio/components/Dialog'
import type { DesignConfig, GeneratedCV, TemplateId } from './CVGeneratorPro_part1'
import { renderTemplate, TEMPLATE_META } from './CVGeneratorPro_part2'
import { STYLE_TAGS, TEMPLATE_CAPS, type StyleTag } from './cvDesign'
import { A4_HEIGHT, A4_WIDTH } from './CvPreview'

function Thumb({ html, scale, title }: { html: string; scale: number; title: string }) {
  return (
    <div className="overflow-hidden rounded-md bg-white" style={{ width: A4_WIDTH * scale, height: A4_HEIGHT * scale }} aria-hidden="true">
      <iframe
        title={title}
        srcDoc={html}
        sandbox="allow-same-origin"
        tabIndex={-1}
        loading="lazy"
        className="pointer-events-none origin-top-left border-0"
        style={{ width: A4_WIDTH, height: A4_HEIGHT, transform: `scale(${scale})` }}
      />
    </div>
  )
}

export default function CvTemplateGallery({ cv, design, lang, current, onChoose, onClose }: {
  cv: GeneratedCV; design: DesignConfig; lang: 'fr' | 'en'; current: TemplateId
  onChoose: (id: TemplateId) => void; onClose: () => void
}) {
  const [filter, setFilter] = useState<StyleTag | 'all'>('all')
  const [focused, setFocused] = useState<TemplateId>(current)
  const htmls = useMemo(() => Object.fromEntries(TEMPLATE_META.map(t => [t.id, renderTemplate(cv, t.id, design, lang)])) as Record<TemplateId, string>, [cv, design, lang])
  const shown = TEMPLATE_META.filter(t => filter === 'all' || TEMPLATE_CAPS[t.id].styles.includes(filter))
  const meta = TEMPLATE_META.find(t => t.id === focused)!

  return (
    <Dialog
      wide
      title="Choisir un modèle"
      onClose={onClose}
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-gray-400">Vos informations et vos réglages de design sont conservés.</span>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm text-gray-300 hover:text-white">Annuler</button>
          <button type="button" onClick={() => onChoose(focused)} className="min-h-11 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white">
            {focused === current ? 'Garder ce modèle' : `Utiliser « ${meta.name} »`}
          </button>
        </div>
      )}
    >
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer les modèles par style">
        {([{ id: 'all', label: 'Tous' }, ...STYLE_TAGS] as { id: StyleTag | 'all'; label: string }[]).map(s => (
          <button key={s.id} type="button" aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}
            className={`min-h-[38px] rounded-full border px-3 text-xs font-semibold ${filter === s.id ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-[#30363d] text-gray-300 hover:text-white'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Modèles">
          {shown.map(t => {
            const isFocused = focused === t.id
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={isFocused}
                  aria-label={`${t.name}${t.id === current ? ', modèle actuel' : ''} — ${t.desc}`}
                  onClick={() => setFocused(t.id)}
                  onDoubleClick={() => onChoose(t.id)}
                  className={`relative flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 text-left transition-colors ${isFocused ? 'border-indigo-400 bg-indigo-500/10' : 'border-[#30363d] hover:border-indigo-400/50'}`}
                >
                  <Thumb html={htmls[t.id]} scale={0.18} title={`Miniature ${t.name}`} />
                  <span className="flex w-full items-center justify-between gap-1 text-[12px] font-semibold text-white">
                    {t.emoji} {t.name}
                    {t.id === current && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-300"><Check size={11} aria-hidden="true" />Actuel</span>}
                  </span>
                  <span className="w-full text-[10.5px] text-gray-400">{TEMPLATE_CAPS[t.id].styles.map(s => STYLE_TAGS.find(x => x.id === s)!.label).join(' · ')}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <aside className="hidden lg:block" aria-label="Prévisualisation rapide">
          <p className="mb-1 text-sm font-semibold text-white">{meta.emoji} {meta.name}</p>
          <p className="mb-2 text-xs text-gray-400">{meta.desc}</p>
          <Thumb html={htmls[focused]} scale={0.32} title={`Prévisualisation ${meta.name}`} />
        </aside>
      </div>
    </Dialog>
  )
}
