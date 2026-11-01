// src/features/latex-studio/templates/escape.ts
// Toute valeur saisie ou importée devient du TEXTE LaTeX : caractères spéciaux échappés, caractères
// que pdflatex ne sait pas composer retirés. Une donnée ne peut donc jamais devenir une commande
// (\input, \write…) ni casser la compilation.

/** Caractères composables par pdflatex (T1, inputenc utf8) : latin étendu, ponctuation typographique */
const UNSUPPORTED = new RegExp('[^\\n\\t\\x20-\\x7E\\xA0-\\u017F\\u0218-\\u021B\\u2013\\u2014\\u2018\\u2019\\u201A\\u201C\\u201D\\u201E\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]', 'g')

const SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '$': '\\$',
  '&': '\\&',
  '#': '\\#',
  '_': '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
}

/** Texte → LaTeX (sur une seule ligne : les retours deviennent des espaces) */
export function tex(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(UNSUPPORTED, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\{}$&#_%~^<>|]/g, c => SPECIAL[c])
    // Guillemets et tirets droits : rendu typographique, sans ligature parasite
    .replace(/--/g, '-{}-')
}

/** Adresse pour \href : web ou courriel uniquement ; caractères spéciaux d'hyperref protégés */
export function texUrl(value: string): string | null {
  let url = String(value ?? '').trim()
  if (!url) return null
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url)) url = `https://${url}`
  if (!/^(https?:\/\/|mailto:)[^\s"<>`{}|\\^]+$/i.test(url)) return null
  return url.replace(/%/g, '\\%').replace(/#/g, '\\#')
}

/** Lien cliquable dont le texte est échappé */
export function link(label: string, url: string): string {
  const target = texUrl(url)
  return target ? `\\href{${target}}{${tex(label)}}` : tex(label)
}

/** Courriel cliquable */
export function email(address: string): string {
  return /^[^\s@{}\\]+@[^\s@{}\\]+\.[a-z]{2,}$/i.test(address) ? `\\href{mailto:${address.replace(/%/g, '\\%')}}{${tex(address)}}` : tex(address)
}

/** « 2021 – 2023 », « depuis 2023 », « 2022 » */
export function period(start: string, end: string, lang: 'fr' | 'en' = 'fr'): string {
  const s = tex(start)
  const e = tex(end)
  if (s && e) return `${s}~--~${e}`
  if (s) return lang === 'en' ? `Since ${s}` : `Depuis ${s}`
  return e
}
