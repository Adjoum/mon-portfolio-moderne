// src/features/latex-studio/templates/types.ts
import type { CvData } from '../lib/cvData'
import { FONT_CHOICES, type FontId, type TemplateDesign, type ThemeOverrides } from './theme'
import type { SectionLayout, StandardSection } from '../lib/layout'

export type { FontId }
export type MarginId = 'compact' | 'normal' | 'large'

export interface TemplateOptions {
  /** Couleur d'accent, hexadécimal sans « # » */
  accent: string
  font: FontId
  size: 10 | 11 | 12
  margins: MarginId
  /** Interlignes et espacements resserrés, pour tenir sur une page */
  compact: boolean
  /** Emplacement %%PHOTO%% dans l'en-tête */
  photo: boolean
  /** Deux colonnes (modèles qui le proposent) */
  twoColumns: boolean
  lang: 'fr' | 'en'
  /** Réglages du panneau Design (P5) : valeurs absentes = style du modèle */
  theme?: ThemeOverrides
  /** Organisation des sections (P6) : ordre, masquage, titres, sections personnalisées */
  layout?: SectionLayout
}

export interface CvTemplate {
  id: string
  name: string
  category: string
  description: string
  /** Réglages d'origine du modèle */
  defaults: TemplateOptions
  supports: { photo: boolean; twoColumns: boolean }
  /** Ordre des sections propre au modèle (P6) : celui affiché tant que l'utilisateur ne le change pas */
  sections: readonly StandardSection[]
  /** Style d'origine (P5) : valeurs affichées et rétablies par « Réinitialiser » */
  design: Partial<TemplateDesign>
  render(cv: CvData, options: TemplateOptions): string
}

export const ACCENTS: { id: string; label: string }[] = [
  { id: '0B57D0', label: 'Bleu' },
  { id: '1F3A5F', label: 'Marine' },
  { id: '0F766E', label: 'Sarcelle' },
  { id: '0E7490', label: 'Cyan profond' },
  { id: '3730A3', label: 'Indigo' },
  { id: '7A1E2C', label: 'Bordeaux' },
  { id: 'B45309', label: 'Ambre' },
  { id: '7C3AED', label: 'Violet' },
  { id: 'BE123C', label: 'Framboise' },
  { id: '111827', label: 'Graphite' },
]

export const FONTS: { id: FontId; label: string }[] = FONT_CHOICES.map(({ id, label }) => ({ id, label }))
