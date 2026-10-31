// latex-runner/src/log.mjs
// Erreurs de compilation lisibles, extraites du journal TeX (audit S10 : jamais le journal brut).
// Sortent uniquement : numéro de ligne, message TeX nettoyé, court extrait de la ligne du document.
// Chemins du système, version de TeX Live et noms du dossier de travail sont retirés.

const MAX_ERRORS = 5;
const MAX_MESSAGE = 240;
const MAX_CONTEXT = 120;

/** Nettoie un fragment de journal : chemins absolus → nom de fichier, caractères de contrôle retirés */
export function sanitize(text, max = MAX_MESSAGE) {
  return String(text)
    // Dossier de travail et chemins de la distribution : seul le nom du fichier reste
    // (chemins absolus ou relatifs « ./ » seulement : une URL du document reste intacte)
    .replace(/(^|[\s(`'"<=])\.{0,2}\/(?:[\w.@+-]+\/)*([\w.@+-]+)/g, '$1$2')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Erreurs du journal pdflatex lancé avec -file-line-error.
 * @param {string} log
 * @returns {{ line?: number, message: string, context?: string }[]}
 */
export function parseLog(log) {
  const lines = String(log).split(/\r?\n/);
  const errors = [];

  for (let i = 0; i < lines.length && errors.length < MAX_ERRORS; i++) {
    const raw = lines[i];
    // « ./main.tex:12: Undefined control sequence. » ou « /usr/…/xcolor.sty:300: Package xcolor Error: … »
    const located = /^(.*?\.(?:tex|sty|cls|def|cfg|fd|ldf)):(\d+): (.*)$/.exec(raw);
    const bang = /^!\s?(.+)$/.exec(raw);    // « ! … » (TeX) ou « !pdfTeX error: … »
    if (!located && !bang) continue;

    let message = (located ? located[3] : bang[1]).trim();
    if (/^(Emergency stop|==> Fatal error occurred)/.test(message)) continue;
    // Message sur plusieurs lignes : on complète jusqu'à la ligne vide ou au contexte « l.N »
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      if (!lines[j].trim() || /^l\.\d+ /.test(lines[j]) || /^(Type |See the |\s*==> Fatal)/.test(lines[j])) break;
      message += ` ${lines[j]}`;
    }

    const inDocument = located ? /(^|\/)main\.tex$/.test(located[1]) : true;
    const error = { message: sanitize(message) };
    if (located && inDocument) error.line = Number(located[2]);
    if (located && !inDocument) error.message = sanitize(`${message} (dans ${located[1]})`);

    // Extrait du document : « l.12 \foo » (texte saisi par l'utilisateur)
    for (let j = i + 1; j < Math.min(lines.length, i + 30); j++) {
      const context = /^l\.(\d+) (.*)$/.exec(lines[j]);
      if (context) {
        if (error.line === undefined && inDocument) error.line = Number(context[1]);
        const rest = lines[j + 1]?.trim() ? ` ${lines[j + 1].trim()}` : '';
        error.context = sanitize(`${context[2]}${rest}`, MAX_CONTEXT);
        break;
      }
      if (/^(.*?\.(?:tex|sty|cls)):(\d+): /.test(lines[j]) || /^! /.test(lines[j])) break;
    }

    if (!errors.some(e => e.message === error.message && e.line === error.line)) errors.push(error);
  }
  return errors;
}

/** Le journal demande une passe supplémentaire (références, table des matières, signets) */
export function needsRerun(log) {
  return /Rerun to get|Label\(s\) may have changed|There were undefined references|Please rerun LaTeX/i.test(String(log));
}
