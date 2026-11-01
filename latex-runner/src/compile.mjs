// latex-runner/src/compile.mjs
// Une compilation = un dossier jetable dans /work (tmpfs), supprimé dans tous les cas.
//
// pdflatex est lancé sans shell, avec un environnement minimal reconstruit (aucune variable du
// serveur n'est héritée), dans son propre groupe de processus, sous limites système (prlimit) :
// temps CPU, taille de fichier, mémoire virtuelle, descripteurs, aucun processus enfant.
// Au délai maximal, tout le groupe est tué (SIGKILL), pas seulement le premier processus.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { needsRerun, parseLog, parseWarnings } from './log.mjs';

export const WORK_ROOT = process.env.LATEX_WORK_DIR || '/work';
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PASSES = 2;

const int = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const LIMITS = {
  /** Durée totale d'une compilation, toutes passes comprises */
  timeoutMs: int('LATEX_TIMEOUT_MS', 20_000),
  /** Temps CPU par passe (secondes) */
  cpuSeconds: int('LATEX_CPU_SECONDS', 15),
  /** Taille maximale d'un fichier écrit par TeX (PDF, journal, .aux) */
  maxFileBytes: int('LATEX_MAX_FILE_BYTES', 32 * 1024 * 1024),
  /** Mémoire virtuelle d'une passe */
  maxMemoryBytes: int('LATEX_MAX_MEMORY_BYTES', 1024 * 1024 * 1024),
};

export class CompileError extends Error {
  /**
   * @param {'LATEX_COMPILE_ERROR'|'LATEX_TIMEOUT'|'LATEX_RESOURCE_LIMIT'|'LATEX_INTERNAL'} code
   * @param {{ line?: number, message: string, context?: string }[]} [errors]
   */
  constructor(code, errors = []) {
    super(code);
    this.code = code;
    this.errors = errors;
  }
}

/**
 * Environnement de TeX : construit de zéro. La politique de sécurité y est répétée (elle figure
 * aussi dans /etc/texmf/web2c/texmf.cnf) et aucune génération de police ou de format n'est permise.
 */
export function texEnvironment() {
  return {
    PATH: '/usr/bin:/bin',
    HOME: '/nonexistent',
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    // Valeurs de kpathsea : l'environnement l'emporte sur texmf.cnf
    shell_escape: 'f',
    openin_any: 'p',
    openout_any: 'p',
    parse_first_line: 'f',
    TEXMFHOME: '/nonexistent',
    TEXMFVAR: '/nonexistent',
    TEXMFCONFIG: '/nonexistent',
    // Aucun appel à mktextfm, mktexpk… (scripts shell)
    MKTEXTEX: '0', MKTEXTFM: '0', MKTEXPK: '0', MKTEXMF: '0', MKTEXFMT: '0',
    // Journal non coupé à 79 colonnes : erreurs lisibles sur une ligne
    max_print_line: '1000',
    error_line: '254',
    half_error_line: '238',
  };
}

/**
 * Lu par TeX avant le document, depuis la ligne de commande (main.tex reste intact et les numéros
 * de ligne des erreurs restent exacts) : le PDF ne contient ni la version de TeX Live, ni le nom du
 * fichier, ni la date ou l'identifiant liés au serveur.
 */
export const PDF_METADATA_GUARD = '\\pdfsuppressptexinfo=-1\\relax\\pdfinfoomitdate=1\\relax\\pdftrailerid{}\\relax';

/** Arguments de pdflatex, précédés des limites appliquées par prlimit (util-linux) */
export function texCommand(limits = LIMITS) {
  return {
    command: 'prlimit',
    args: [
      `--cpu=${limits.cpuSeconds}`,
      `--fsize=${limits.maxFileBytes}`,
      `--as=${limits.maxMemoryBytes}`,
      '--nofile=64',
      '--core=0',
      // Aucun processus enfant : TeX n'en a pas besoin quand shell_escape est coupé
      '--nproc=0',
      '--',
      'pdflatex',
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-file-line-error',
      '-no-shell-escape',
      '-no-parse-first-line',
      '-no-mktex=tfm',
      '-no-mktex=pk',
      '-no-mktex=tex',
      '-jobname=main',
      `${PDF_METADATA_GUARD}\\input{main.tex}`,
    ],
  };
}

/**
 * Lance une passe de pdflatex dans `dir`.
 * @returns {Promise<{ status: 'ok'|'error'|'timeout'|'killed', signal?: string }>}
 */
function runPass(dir, deadline, signal, limits) {
  return new Promise(resolve => {
    const { command, args } = texCommand(limits);
    const child = spawn(command, args, {
      cwd: dir,
      env: texEnvironment(),
      detached: true,            // nouveau groupe de processus : kill(-pid) atteint toute la descendance
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    let settled = false;
    const killGroup = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* déjà terminé */ }
    };
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      killGroup();               // aucun processus ne survit à sa passe
      resolve(result);
    };
    const onAbort = () => finish({ status: 'killed', signal: 'abort' });
    const timer = setTimeout(() => finish({ status: 'timeout' }), Math.max(0, deadline - Date.now()));
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', () => finish({ status: 'killed', signal: 'spawn' }));
    child.on('exit', (code, sig) => {
      if (sig) return finish({ status: 'killed', signal: sig });
      finish({ status: code === 0 ? 'ok' : 'error' });
    });
  });
}

async function readLog(dir) {
  try {
    const buf = await fs.readFile(path.join(dir, 'main.log'));
    return buf.subarray(0, 2 * 1024 * 1024).toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Compile un source déjà contrôlé par la politique.
 * @param {{ tex: string, photo?: Buffer, signal?: AbortSignal, limits?: typeof LIMITS }} job
 * @returns {Promise<{ pdf: Buffer, passes: number, warnings: { kind: string, line?: number, message: string }[], ms: number }>}
 */
export async function compile({ tex, photo, signal, limits = LIMITS }) {
  const started = Date.now();
  const deadline = started + limits.timeoutMs;
  const dir = await fs.mkdtemp(path.join(WORK_ROOT, 'job-'));
  try {
    await fs.writeFile(path.join(dir, 'main.tex'), tex, { encoding: 'utf8', mode: 0o600 });
    if (photo) await fs.writeFile(path.join(dir, 'photo.jpg'), photo, { mode: 0o600 });

    let passes = 0;
    let warnings = [];
    for (;;) {
      passes++;
      const result = await runPass(dir, deadline, signal, limits);
      if (result.status === 'timeout') throw new CompileError('LATEX_TIMEOUT');
      if (result.status === 'killed') {
        // SIGXCPU (temps CPU), SIGXFSZ (fichier trop gros), SIGKILL (mémoire du conteneur)
        if (result.signal === 'abort') throw new CompileError('LATEX_INTERNAL');
        if (result.signal === 'spawn') throw new CompileError('LATEX_INTERNAL');
        throw new CompileError('LATEX_RESOURCE_LIMIT');
      }
      const log = await readLog(dir);
      if (result.status === 'error') {
        const errors = parseLog(log);
        if (/TeX capacity exceeded/.test(log)) throw new CompileError('LATEX_RESOURCE_LIMIT', errors);
        throw new CompileError('LATEX_COMPILE_ERROR', errors.length ? errors : [{ message: 'La compilation a échoué sans message exploitable.' }]);
      }
      warnings = parseWarnings(log);
      if (passes >= MAX_PASSES || !needsRerun(log)) break;
    }

    const pdfPath = path.join(dir, 'main.pdf');
    const stat = await fs.stat(pdfPath).catch(() => null);
    if (!stat) throw new CompileError('LATEX_COMPILE_ERROR', [{ message: 'Aucune page produite : le document est vide.' }]);
    if (stat.size > MAX_PDF_BYTES) throw new CompileError('LATEX_RESOURCE_LIMIT');
    const pdf = await fs.readFile(pdfPath);
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new CompileError('LATEX_INTERNAL');
    return { pdf, passes, warnings, ms: Date.now() - started };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Au démarrage : vide les dossiers de travail laissés par un arrêt brutal */
export async function cleanWorkRoot() {
  const entries = await fs.readdir(WORK_ROOT).catch(() => []);
  await Promise.all(entries.filter(e => e.startsWith('job-')).map(e => fs.rm(path.join(WORK_ROOT, e), { recursive: true, force: true }).catch(() => {})));
}
