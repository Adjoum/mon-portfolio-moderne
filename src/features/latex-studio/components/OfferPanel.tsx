// Onglet « Offre et ATS » (P8).
//   Lisibilité par les logiciels de recrutement : contrôles locaux, expliqués, sans note ni pourcentage.
//   Offre d'emploi : analyse locale et gratuite des termes (présents / absents du CV), puis, à la demande,
//   adaptation par l'IA qui ne fait que réordonner et reformuler ce qui existe (garanties du serveur).
import { useId, useMemo, useState } from 'react'
import type { AtsCheck, OfferTerm } from '../lib/ats'
import { offerTerms } from '../lib/ats'
import type { CvData } from '../lib/cvData'
import { isEmptyCv } from '../lib/cvData'
import { targetReady, type Target } from '../lib/target'
import { TargetFields } from './AiPanel'
import { btn, btnPrimary, field, label } from './ui'

export const MAX_OFFER_CHARS = 8000
const ICON: Record<AtsCheck['status'], string> = { ok: '✔', warn: '⚠', info: 'ℹ' }
const TONE: Record<AtsCheck['status'], string> = { ok: 'text-emerald-300', warn: 'text-amber-300', info: 'text-sky-300' }

export function OfferPanel({ checks, cv, target, setTarget, offer, setOffer, adapting, adaptAvailable, error, onAdapt, onEditData }: {
  /** null : PDF pas encore compilé ou pas à jour */
  checks: AtsCheck[] | null
  cv: CvData
  target: Target
  setTarget: (t: Target) => void
  offer: string
  setOffer: (v: string) => void
  adapting: boolean
  adaptAvailable: boolean
  error: string
  onAdapt: () => void
  onEditData: () => void
}) {
  const id = useId()
  const [analyzed, setAnalyzed] = useState('')
  const terms: OfferTerm[] = useMemo(() => (analyzed ? offerTerms(analyzed, cv) : []), [analyzed, cv])
  const present = terms.filter(t => t.present)
  const absent = terms.filter(t => !t.present)

  return (
    <div className="space-y-4 text-xs text-gray-300">
      <section aria-labelledby={`${id}-ats`} className="space-y-2">
        <h2 id={`${id}-ats`} className="text-sm font-bold text-gray-100">Lisibilité par les logiciels de recrutement</h2>
        <p className="text-[11px] leading-snug text-gray-500">Contrôles courants, expliqués un par un. Aucun logiciel ne publie ses règles : le studio ne donne ni note ni pourcentage.</p>
        {checks === null
          ? <p className="text-gray-500">Disponible dès que l’aperçu PDF est à jour.</p>
          : <ul className="space-y-1.5" aria-label="Contrôles de lisibilité">
              {checks.map(c => (
                <li key={c.id} className="flex gap-2 rounded-lg border border-[#2a313c] p-2" data-ats={c.id} data-status={c.status}>
                  <span aria-hidden="true" className={`${TONE[c.status]} font-bold`}>{ICON[c.status]}</span>
                  <span><strong className="text-gray-100">{c.title}</strong><span className="sr-only"> ({c.status === 'ok' ? 'conforme' : c.status === 'warn' ? 'à corriger' : 'information'})</span><br /><span className="text-gray-400">{c.detail}</span></span>
                </li>
              ))}
            </ul>}
      </section>

      <section aria-labelledby={`${id}-offer`} className="space-y-2">
        <h2 id={`${id}-offer`} className="text-sm font-bold text-gray-100">Adapter à une offre d’emploi</h2>
        <div>
          <label className={label} htmlFor={`${id}-text`}>Texte de l’offre</label>
          <textarea id={`${id}-text`} className={`${field} min-h-32 resize-y text-xs`} value={offer} maxLength={MAX_OFFER_CHARS}
            onChange={e => setOffer(e.target.value)} placeholder="Collez ici l’annonce (missions, compétences demandées…)" />
          <p className="mt-1 text-[11px] text-gray-500">{offer.length}/{MAX_OFFER_CHARS} caractères. L’analyse se fait dans votre navigateur ; rien n’est envoyé.</p>
        </div>
        <button type="button" className={`${btn} w-full`} onClick={() => setAnalyzed(offer)} disabled={!offer.trim()}>🔍 Analyser l’offre (gratuit)</button>
        {analyzed && (
          <div className="space-y-2" role="region" aria-label="Termes de l’offre">
            {!terms.length && <p className="text-gray-500">Aucun terme marquant trouvé.</p>}
            {present.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-emerald-300">Déjà dans votre CV ({present.length})</p>
                <ul className="flex flex-wrap gap-1" aria-label="Termes présents dans le CV">{present.map(t => <li key={t.term} className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-emerald-200">{t.term}</li>)}</ul>
              </div>
            )}
            {absent.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-amber-300">Absents de votre CV ({absent.length})</p>
                <ul className="flex flex-wrap gap-1" aria-label="Termes absents du CV">{absent.map(t => <li key={t.term} className="rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-200">{t.term}</li>)}</ul>
                <p className="mt-1 text-[11px] leading-snug text-gray-400">Ajoutez seulement ce que vous possédez réellement, dans l’onglet « Données ». L’IA ne les ajoutera jamais à votre place.</p>
                <button type="button" className={`${btn} mt-1 w-full`} onClick={onEditData}>🧾 Compléter mes données</button>
              </div>
            )}
          </div>
        )}
        <TargetFields target={target} onChange={setTarget} />
        <button type="button" className={`${btnPrimary} w-full`} onClick={onAdapt} aria-busy={adapting}
          disabled={adapting || !offer.trim() || isEmptyCv(cv) || !targetReady(target) || !adaptAvailable}>
          {adapting ? '⏳ Adaptation en cours…' : '✨ Adapter le CV à cette offre (IA)'}
        </button>
        <p className="text-[11px] leading-snug text-gray-500">
          L’offre n’est envoyée au fournisseur d’IA que si vous cliquez sur « Adapter ». L’IA réordonne et reformule ce qui existe ; tout chiffre, nom ou sigle absent de votre CV est écarté. Chaque modification vous est montrée avant d’être appliquée.
        </p>
        {!adaptAvailable && <p className="text-[11px] text-gray-500">Réécriture par l’IA momentanément indisponible.</p>}
        {error && <p role="alert" className="text-red-300">⚠️ {error}</p>}
      </section>
    </div>
  )
}
