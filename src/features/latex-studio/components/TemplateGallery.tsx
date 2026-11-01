// Bibliothèque de modèles : miniatures, réglages (couleur, police, taille, marges, espacement, photo,
// colonnes, langue des titres). Choisir un modèle ou un réglage régénère aussitôt le code à partir
// des données du CV, puis le PDF (P2) ; « Modèle précédent » revient à l'étape d'avant.
import { TEMPLATE_LIBRARY, templateById } from '../templates/library'
import { choiceForTemplate, type TemplateChoice } from '../lib/templateSwitch'
import { btn, btnPrimary } from './ui'

export type { TemplateChoice }

export function TemplateGallery({ choice, onChange, onApply, usesSample, codeSource, compiling, previous, onPrevious, onDesign }: {
  choice: TemplateChoice
  /** Nouveau modèle ou nouveaux réglages : le studio régénère le code (avec confirmation si besoin) */
  onChange: (c: TemplateChoice, kind: 'template' | 'options') => void
  onApply: () => void
  /** Aucune donnée saisie : le modèle sera rempli avec l'exemple */
  usesSample: boolean
  /** Origine du code affiché : généré par le studio, modifié à la main, ou autre (IA, import) */
  codeSource: 'template' | 'manual' | 'foreign'
  compiling: boolean
  /** Libellé du retour à l'étape précédente (modèle ou réglage), s'il y en a une */
  previous: string | null
  onPrevious: () => void
  /** Ouvre le panneau « Design » (typographie, mise en page, couleurs) */
  onDesign: () => void
}) {
  const template = templateById(choice.id) ?? TEMPLATE_LIBRARY[0]
  const o = choice.options
  const select = (next: string) => {
    const c = choiceForTemplate(next, o)
    if (c && next !== choice.id) onChange(c, 'template')
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
      <p className="text-[11px] leading-snug" role="status" aria-live="polite" data-testid="template-status">
        {compiling
          ? <span className="text-amber-300">⏳ Compilation du PDF…</span>
          : codeSource === 'template'
            ? <span className="text-emerald-300">✓ Code et aperçu à jour avec ce modèle</span>
            : <span className="text-sky-300">✎ Code {codeSource === 'manual' ? 'modifié à la main' : 'd’une autre origine (IA, import, restauration)'} : changer de modèle demandera confirmation</span>}
      </p>
      {previous && (
        <button type="button" className={`${btn} w-full`} onClick={onPrevious}>↶ {previous}</button>
      )}

      <button type="button" className={`${btn} w-full`} onClick={onDesign}>🖌 Personnaliser le design (polices, couleurs, mise en page)</button>

      <button type="button" className={`${btnPrimary} w-full`} onClick={onApply}>Générer le CV avec ce modèle</button>
      <p className="text-[11px] leading-snug text-gray-500">
        {usesSample
          ? 'Aucune donnée saisie : le modèle est rempli avec un exemple à remplacer (onglet « Données » ou « Importer »).'
          : 'Le code est généré à partir de l’onglet « Données » ; la version actuelle reste restaurable.'}
      </p>
    </div>
  )
}
