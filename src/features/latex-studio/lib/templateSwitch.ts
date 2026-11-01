// src/features/latex-studio/lib/templateSwitch.ts
// Changement de modèle (P2) : le code est régénéré localement à partir des données du CV et du
// modèle choisi (rendu déterministe, aucune IA). Le code courant n'est remplacé sans question
// que s'il est exactement celui que le studio a lui-même généré ; sinon l'utilisateur confirme.

import { renderCv, templateById } from '../templates/library'
import { sampleCv } from '../templates/sample'
import { isEmptyCv, type CvData } from './cvData'
import type { TemplateOptions } from '../templates/types'

export interface TemplateChoice { id: string; options: TemplateOptions }

/** Étape du parcours des modèles, pour « revenir au modèle précédent » */
export interface TemplateStep {
  choice: TemplateChoice
  code: string
  /** Code généré par le studio au moment de l'étape (null : code d'une autre origine) */
  generated: string | null
}

export type SwitchPlan =
  | { kind: 'apply'; code: string }
  /** manual : code généré puis modifié à la main ; foreign : code d'une autre origine (IA, import, restauration) */
  | { kind: 'confirm'; code: string; reason: 'manual' | 'foreign' }

export const MAX_TEMPLATE_STEPS = 10

/** Code produit par un choix de modèle, à partir des données (ou de l'exemple si rien n'est saisi) */
export function renderChoice(choice: TemplateChoice, cv: CvData): string {
  return renderCv(choice.id, isEmptyCv(cv) ? sampleCv() : cv, choice.options)
}

export function planSwitch(current: string, generated: string | null, next: string): SwitchPlan {
  if (current === next || (generated !== null && current === generated)) return { kind: 'apply', code: next }
  return { kind: 'confirm', code: next, reason: generated === null ? 'foreign' : 'manual' }
}

/** Choix demandé dans la galerie : réglages par défaut du modèle, langue et photo conservées si possible */
export function choiceForTemplate(templateId: string, previous: TemplateOptions): TemplateChoice | null {
  const t = templateById(templateId)
  if (!t) return null
  // L'organisation des sections appartient au CV : elle suit d'un modèle à l'autre (P6).
  // Les cadres photo sont gardés par modèle : chacun retrouve le sien au retour (P3).
  return { id: t.id, options: {
    ...t.defaults, lang: previous.lang, photo: t.supports.photo && (previous.photo || t.defaults.photo),
    ...(previous.layout ? { layout: previous.layout } : {}),
    ...(previous.photoFrames ? { photoFrames: previous.photoFrames } : {}),
  } }
}

/** Code d'une session antérieure : reconnu comme généré s'il correspond exactement au rendu du choix enregistré */
export function initialGenerated(stored: string | null, code: string, choice: TemplateChoice, cv: CvData): string | null {
  if (stored !== null) return stored
  try {
    const rendered = renderChoice(choice, cv)
    return rendered === code ? rendered : null
  } catch {
    return null
  }
}

export const pushStep = (steps: TemplateStep[], step: TemplateStep) => [...steps, step].slice(-MAX_TEMPLATE_STEPS)
