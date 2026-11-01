// Vérification d'un CV importé (P7) : les informations extraites sont montrées, avec les points à
// contrôler, AVANT de remplacer les données. Les données actuelles restent comparables et rétablissables.
import type { CvData } from '../lib/cvData'
import { isEmptyCv } from '../lib/cvData'
import { importWarnings } from '../lib/importCv'
import { Dialog } from './Dialog'
import { btn, btnPrimary } from './ui'

export function ImportReview({ cv, replacing, onApply, onClose }: {
  cv: CvData
  /** Des données sont déjà saisies : elles seront remplacées (et gardées pour comparaison) */
  replacing: boolean
  onApply: () => void
  onClose: () => void
}) {
  const warnings = importWarnings(cv)
  const counts = [
    ['Expériences', cv.experiences.length], ['Formations', cv.education.length], ['Groupes de compétences', cv.skills.length],
    ['Projets', cv.projects.length], ['Langues', cv.languages.length], ['Certifications', cv.certifications.length],
    ['Publications', cv.publications.length], ['Centres d’intérêt', cv.interests.length],
  ] as const
  return (
    <Dialog title="Vérifier les informations extraites" onClose={onClose} wide
      footer={<>
        <button type="button" className={btn} onClick={onClose}>Annuler</button>
        <button type="button" className={btnPrimary} onClick={onApply} disabled={isEmptyCv(cv)}>Utiliser ces données</button>
      </>}>
      <div className="space-y-3 text-xs text-gray-300">
        <p className="text-gray-400">L’IA a recopié le texte du fichier, sans le compléter. Vérifiez ces informations : vous pourrez les corriger ensuite dans l’onglet « Données ».</p>
        {replacing && <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 text-sky-100">Vos données actuelles seront remplacées. Elles restent disponibles dans « Comparer avec une version précédente » (onglet « Données »).</p>}
        {warnings.length > 0 && (
          <div role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
            <p className="font-bold">À vérifier</p>
            <ul className="list-disc pl-4">{warnings.map(w => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-[#2a313c] p-3" data-testid="import-identity">
          <dt className="text-gray-500">Nom</dt><dd className="font-bold text-gray-100">{cv.identity.fullName || '—'}</dd>
          <dt className="text-gray-500">Titre</dt><dd>{cv.identity.headline || '—'}</dd>
          <dt className="text-gray-500">E-mail</dt><dd>{cv.identity.email || '—'}</dd>
          <dt className="text-gray-500">Téléphone</dt><dd>{cv.identity.phone || '—'}</dd>
          <dt className="text-gray-500">Lieu</dt><dd>{cv.identity.location || '—'}</dd>
        </dl>
        <ul className="flex flex-wrap gap-1.5" aria-label="Sections trouvées">
          {counts.map(([name, n]) => <li key={name} className={`rounded-full border px-2 py-0.5 ${n ? 'border-emerald-500/40 text-emerald-200' : 'border-[#2a313c] text-gray-500'}`}>{name} : {n}</li>)}
        </ul>
        {cv.experiences.length > 0 && (
          <div>
            <p className="mb-1 font-bold text-gray-200">Expériences</p>
            <ol className="space-y-1">{cv.experiences.map(e => (
              <li key={e.id} className="rounded border border-[#21262d] p-2"><strong className="text-gray-100">{e.role || '(poste ?)'}</strong> — {e.organization || '(organisation ?)'} <span className="text-gray-500">{[e.start, e.end].filter(Boolean).join(' – ') || 'sans date'}</span>
                {e.bullets.filter(Boolean).length > 0 && <span className="block text-gray-500">{e.bullets.filter(Boolean).length} réalisation(s)</span>}</li>
            ))}</ol>
          </div>
        )}
        {cv.education.length > 0 && (
          <div>
            <p className="mb-1 font-bold text-gray-200">Formation</p>
            <ol className="space-y-1">{cv.education.map(d => <li key={d.id} className="rounded border border-[#21262d] p-2"><strong className="text-gray-100">{d.degree || '(diplôme ?)'}</strong> — {d.institution} <span className="text-gray-500">{[d.start, d.end].filter(Boolean).join(' – ')}</span></li>)}</ol>
          </div>
        )}
      </div>
    </Dialog>
  )
}
