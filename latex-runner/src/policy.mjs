// latex-runner/src/policy.mjs
// Politique de compilation des documents non fiables, appliquée AVANT TeX.
//
// Défense en profondeur : la protection principale reste la configuration de TeX
// (shell_escape=f, openin_any=p, openout_any=p) et le conteneur (aucun secret, aucun réseau,
// lecture seule, ressources bornées). Ce contrôle refuse en plus, avec un message clair :
//   - les primitives de fichiers, de commandes et de réécriture du lexique (\write, \input, \catcode…) ;
//   - toute classe ou tout paquet hors de la liste installée et relue ;
//   - la notation ^^ qui permet de fabriquer une barre oblique inverse et de contourner ce contrôle.
// Le source est analysé en entier, commentaires compris : un commentaire n'en est plus un dès que
// \verb ou un changement de catégorie entre en jeu, et un refus inutile vaut mieux qu'un contournement.

export const MAX_SOURCE_BYTES = 200 * 1024;

/** Classes autorisées (TeX Live de base) */
export const ALLOWED_CLASSES = new Set(['article', 'report', 'minimal']);

/**
 * Paquets autorisés : ceux des trois templates et du prompt latex.generate, plus des paquets
 * de mise en page courants dans un CV. Tous installés dans l'image et chargés ensemble par
 * tests/latex (aucun ne lit de fichier arbitraire ni n'exécute de commande).
 */
export const ALLOWED_PACKAGES = new Set([
  // Prompt latex.generate / latex.improve et templates
  'geometry', 'hyperref', 'array', 'xcolor', 'titlesec', 'enumitem', 'lmodern', 'babel',
  'inputenc', 'fontenc', 'parskip', 'graphicx', 'tabularx', 'multicol',
  // Mise en page et typographie courantes
  'amsmath', 'amssymb', 'amsfonts', 'textcomp', 'microtype', 'ragged2e', 'setspace', 'fancyhdr',
  'url', 'booktabs', 'longtable', 'multirow', 'colortbl', 'calc', 'ifthen', 'etoolbox',
  'graphics', 'color', 'xspace', 'marvosym', 'pifont', 'helvet', 'mathptmx', 'charter',
  'sectsty', 'titling', 'paracol', 'changepage', 'needspace', 'wrapfig',
  'float', 'caption', 'bookmark', 'hyphenat', 'csquotes',
]);

/**
 * Séquences de contrôle interdites (nom exact) :
 * fichiers, commandes externes, réécriture du lexique, moteurs Lua, primitives pdfTeX de lecture.
 */
export const FORBIDDEN_COMMANDS = [
  // Écriture et lecture de fichiers, flux, commandes externes
  'write', 'openout', 'closeout', 'openin', 'closein', 'read', 'readline', 'newwrite', 'newread',
  'input', 'include', 'includeonly', 'InputIfFileExists', 'IfFileExists', 'listfiles',
  'verbatiminput', 'VerbatimInput', 'lstinputlisting', 'inputminted', 'ShellEscape',
  // Réécriture du lexique : fabriquer une commande interdite sans l'écrire
  'catcode', 'csname', 'scantokens', 'makeatletter', 'ExplSyntaxOn', 'endlinechar', 'uccode', 'lccode',
  // Moteurs et primitives pdfTeX donnant accès aux fichiers
  'directlua', 'latelua', 'luaexec', 'luadirect', 'pdffiledump', 'pdfmdfivesum', 'pdffilesize',
  'pdffilemoddate', 'filedump', 'mdfivesum', 'filesize', 'filemoddate', 'pdfobj', 'pdfximage',
  'pdfrefximage', 'pdfxform', 'pdfinclusionerrorlevel', 'font', 'special',
  // Classe ou paquet chargés autrement que par \documentclass / \usepackage contrôlés
  'LoadClass', 'LoadClassWithOptions', 'RequirePackageWithOptions', 'usetikzlibrary',
];

/** Environnements qui écrivent des fichiers (un .sty écrit dans le dossier remplacerait un paquet relu) */
export const FORBIDDEN_ENVIRONMENTS = ['filecontents', 'filecontents*'];

const LOAD = /\\(documentclass|usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)*\{([^}]*)\}/g;

/**
 * Séquences de contrôle du source, lues comme TeX les lit avec les catégories par défaut :
 * « \ » suivi de lettres forme un nom (« \inputencoding » n'est pas « \input ») ;
 * « \ » suivi d'un autre caractère est un symbole (« \\write » est « \\ » puis le texte « write »).
 */
function* controlSequences(source) {
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '\\') continue;
    let end = i + 1;
    while (end < source.length && /[A-Za-z]/.test(source[end])) end++;
    if (end > i + 1) {
      yield { name: source.slice(i + 1, end), index: i };
      i = end - 1;
    } else {
      i++;  // symbole de contrôle : le caractère suivant en fait partie
    }
  }
}

/** Politique publiable : transmise par blog-api aux assistants IA (latex.fix), jamais modifiable par eux */
export function describePolicy() {
  return {
    classes: [...ALLOWED_CLASSES],
    packages: [...ALLOWED_PACKAGES].sort(),
    forbiddenCommands: FORBIDDEN_COMMANDS.map(c => `\\${c}`),
    forbiddenEnvironments: [...FORBIDDEN_ENVIRONMENTS],
    maxSourceBytes: MAX_SOURCE_BYTES,
  };
}

export class PolicyError extends Error {
  /**
   * @param {'LATEX_FORBIDDEN_COMMAND'|'LATEX_PACKAGE_NOT_ALLOWED'|'LATEX_CLASS_NOT_ALLOWED'|'LATEX_INVALID_SOURCE'|'LATEX_TOO_LARGE'} code
   * @param {string} [subject] commande, paquet ou classe en cause (jamais un extrait du document)
   */
  constructor(code, subject) {
    super(code);
    this.code = code;
    this.subject = subject;
  }
}

/** Ligne (1-based) d'une position du source, pour guider l'utilisateur */
function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Vérifie un source LaTeX. Lève PolicyError au premier écart.
 * @param {string} source
 * @returns {{ classes: string[], packages: string[] }}
 */
export function checkSource(source) {
  if (typeof source !== 'string' || !source.trim()) throw new PolicyError('LATEX_INVALID_SOURCE');
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) throw new PolicyError('LATEX_TOO_LARGE');
  // Caractères de contrôle (hors tabulation et fins de ligne) : aucun usage légitime dans un .tex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(source)) throw new PolicyError('LATEX_INVALID_SOURCE');

  const hat = source.indexOf('^^');
  if (hat !== -1) {
    const error = new PolicyError('LATEX_FORBIDDEN_COMMAND', '^^');
    error.line = lineOf(source, hat);
    throw error;
  }

  const forbidden = new Set(FORBIDDEN_COMMANDS);
  for (const { name, index } of controlSequences(source)) {
    if (forbidden.has(name)) {
      const error = new PolicyError('LATEX_FORBIDDEN_COMMAND', `\\${name}`);
      error.line = lineOf(source, index);
      throw error;
    }
  }

  for (const match of source.matchAll(/\\(?:begin|end)\s*\{\s*([^}\s]+)\s*\}/g)) {
    if (FORBIDDEN_ENVIRONMENTS.includes(match[1])) {
      const error = new PolicyError('LATEX_FORBIDDEN_COMMAND', match[1]);
      error.line = lineOf(source, match.index);
      throw error;
    }
  }

  const classes = [];
  const packages = [];
  for (const match of source.matchAll(LOAD)) {
    const names = match[2].split(',').map(n => n.trim()).filter(Boolean);
    const isClass = match[1] === 'documentclass';
    for (const name of names) {
      if (isClass ? !ALLOWED_CLASSES.has(name) : !ALLOWED_PACKAGES.has(name)) {
        const error = new PolicyError(isClass ? 'LATEX_CLASS_NOT_ALLOWED' : 'LATEX_PACKAGE_NOT_ALLOWED', name.slice(0, 60));
        error.line = lineOf(source, match.index);
        throw error;
      }
      (isClass ? classes : packages).push(name);
    }
  }
  // Un chargement que l'expression ci-dessus ne reconnaît pas (argument entre accolades imbriquées,
  // macro…) n'a pas été contrôlé : il est refusé plutôt qu'ignoré.
  const loads = [...source.matchAll(/\\(documentclass|usepackage|RequirePackage)(?![A-Za-z])/g)].length;
  const checked = [...source.matchAll(LOAD)].length;
  if (loads !== checked) throw new PolicyError('LATEX_INVALID_SOURCE', 'usepackage');
  if (classes.length !== 1) throw new PolicyError('LATEX_CLASS_NOT_ALLOWED', classes.length ? 'plusieurs classes' : 'aucune classe');

  return { classes, packages };
}
