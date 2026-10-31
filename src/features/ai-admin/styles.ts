// src/features/ai-admin/styles.ts
const fieldClass = 'w-full px-3 py-2 rounded-lg border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-primary disabled:opacity-60'

export const inputClass = `${fieldClass} bg-white/5`

// Listes déroulantes : fond opaque et color-scheme sombre. Avec le fond translucide des champs,
// Chrome et Edge (Windows) ouvrent la liste sur fond blanc système en gardant le texte blanc :
// fournisseurs et modèles deviennent invisibles. Options et groupes reçoivent leurs propres couleurs.
export const selectClass = `${fieldClass} bg-slate-900 [color-scheme:dark] [&_option]:bg-slate-900 [&_option]:text-gray-100 [&_optgroup]:bg-slate-950 [&_optgroup]:text-gray-400`
