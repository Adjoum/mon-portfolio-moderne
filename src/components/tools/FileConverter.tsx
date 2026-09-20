/**
 * FileConverter.tsx
 * --------------------------------------------------------------------------
 * UI du convertisseur de fichiers du portfolio.
 *   - Glisser-déposer (ou clic) multi-fichiers
 *   - Détection automatique des formats de sortie disponibles
 *   - Cas spéciaux : plusieurs images -> 1 PDF, plusieurs PDF -> fusion
 *   - Conversion 100% navigateur (rien n'est envoyé à un serveur)
 *
 * Dépend de ./fileConverters.ts (placez les deux fichiers ensemble, ou
 * ajustez le chemin d'import).
 * --------------------------------------------------------------------------
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileText, FileType2, FileImage, FileSpreadsheet,
  File as FileIcon, X, Loader2, CheckCircle2, Download, Sparkles, Layers,
} from 'lucide-react';
import * as conv from '../../types/fileConverters';

/* -------------------------------------------------------------------------- */
/*  Matrice des conversions disponibles selon l'extension                     */
/* -------------------------------------------------------------------------- */

type TargetKey = 'pdf' | 'html' | 'txt' | 'docx' | 'images' | 'csv' | 'xlsx';

interface Target {
  key: TargetKey;
  label: string;
  /** Convertisseur 1 fichier -> 1 résultat. */
  run: (file: File, onProgress?: (a: number, b: number) => void) => Promise<conv.ConversionResult>;
}

const PDF_TO_DOCX_NOTE = 'Texte uniquement — la mise en page n’est pas conservée';

const CONVERSIONS: Record<string, Target[]> = {
  md: [
    { key: 'pdf', label: 'PDF', run: conv.markdownToPdf },
    { key: 'html', label: 'HTML', run: conv.markdownToHtml },
  ],
  markdown: [
    { key: 'pdf', label: 'PDF', run: conv.markdownToPdf },
    { key: 'html', label: 'HTML', run: conv.markdownToHtml },
  ],
  docx: [
    { key: 'pdf', label: 'PDF', run: conv.docxToPdf },
    { key: 'html', label: 'HTML', run: conv.docxToHtml },
    { key: 'txt', label: 'Texte', run: conv.docxToTxt },
  ],
  pdf: [
    { key: 'txt', label: 'Texte', run: conv.pdfToText },
    { key: 'images', label: 'Images (ZIP)', run: conv.pdfToImagesZip },
    { key: 'docx', label: 'Word', run: conv.pdfToDocx },
  ],
  png: [{ key: 'pdf', label: 'PDF', run: (f) => conv.imagesToPdf([f]) }],
  jpg: [{ key: 'pdf', label: 'PDF', run: (f) => conv.imagesToPdf([f]) }],
  jpeg: [{ key: 'pdf', label: 'PDF', run: (f) => conv.imagesToPdf([f]) }],
  webp: [{ key: 'pdf', label: 'PDF', run: (f) => conv.imagesToPdf([f]) }],
  gif: [{ key: 'pdf', label: 'PDF', run: (f) => conv.imagesToPdf([f]) }],
  bmp: [{ key: 'pdf', label: 'PDF', run: (f) => conv.imagesToPdf([f]) }],
  xlsx: [{ key: 'csv', label: 'CSV', run: conv.xlsxToCsv }],
  xls: [{ key: 'csv', label: 'CSV', run: conv.xlsxToCsv }],
  csv: [{ key: 'xlsx', label: 'Excel', run: conv.csvToXlsx }],
};

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
const ACCEPT = '.md,.markdown,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xlsx,.xls,.csv';

const extOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';

const iconFor = (name: string) => {
  const e = extOf(name);
  if (IMAGE_EXT.includes(e)) return FileImage;
  if (['xlsx', 'xls', 'csv'].includes(e)) return FileSpreadsheet;
  if (['docx', 'md', 'markdown', 'txt'].includes(e)) return FileText;
  if (e === 'pdf') return FileType2;
  return FileIcon;
};

const prettySize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
};

type Status = 'idle' | 'converting' | 'done' | 'error';

/* -------------------------------------------------------------------------- */
/*  Composant                                                                 */
/* -------------------------------------------------------------------------- */

export default function FileConverter() {
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState<TargetKey | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* --- Détermine les cibles disponibles pour le lot de fichiers --- */
  const { targets, mode } = useMemo(() => {
    if (files.length === 0) return { targets: [] as Target[], mode: 'none' as const };

    const exts = files.map((f) => extOf(f.name));
    const allImages = exts.every((e) => IMAGE_EXT.includes(e));
    const allPdf = exts.every((e) => e === 'pdf');

    // Plusieurs images -> un seul PDF combiné
    if (files.length > 1 && allImages) {
      return {
        mode: 'combine-images' as const,
        targets: [{ key: 'pdf' as TargetKey, label: 'PDF combiné', run: () => conv.imagesToPdf(files) }],
      };
    }
    // Plusieurs PDF -> fusion
    if (files.length > 1 && allPdf) {
      return {
        mode: 'merge-pdf' as const,
        targets: [{ key: 'pdf' as TargetKey, label: 'PDF fusionné', run: () => conv.mergePdfs(files) }],
      };
    }
    // Sinon : intersection des cibles communes à tous les fichiers
    const sets = files.map((f) => CONVERSIONS[extOf(f.name)] ?? []);
    const common = sets[0].filter((t) => sets.every((s) => s.some((x) => x.key === t.key)));
    return { mode: 'individual' as const, targets: common };
  }, [files]);

  /* --- Ajout / retrait de fichiers --- */
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter((f) => CONVERSIONS[extOf(f.name)]);
    if (valid.length === 0) {
      setError('Format non pris en charge. Formats acceptés : MD, DOCX, PDF, images, XLSX, CSV.');
      return;
    }
    setError('');
    setStatus('idle');
    setTarget(null);
    setFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setTarget(null);
    setStatus('idle');
  };

  const reset = () => {
    setFiles([]);
    setTarget(null);
    setStatus('idle');
    setError('');
    setProgress('');
  };

  /* --- Drag & drop --- */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  /* --- Lancer la conversion --- */
  const handleConvert = async () => {
    if (!target) return;
    const chosen = targets.find((t) => t.key === target);
    if (!chosen) return;

    setStatus('converting');
    setError('');
    setProgress('');

    try {
      if (mode === 'combine-images' || mode === 'merge-pdf') {
        const res = await chosen.run(files[0]); // run() ignore l'argument ici
        conv.downloadBlob(res.blob, res.filename);
      } else {
        // Conversion individuelle : chaque fichier est converti puis téléchargé
        for (let i = 0; i < files.length; i++) {
          if (files.length > 1) setProgress(`Fichier ${i + 1}/${files.length} — ${files[i].name}`);
          const res = await chosen.run(files[i], (p, total) =>
            setProgress(`Page ${p}/${total}`),
          );
          conv.downloadBlob(res.blob, res.filename);
        }
      }
      setStatus('done');
      setProgress('');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setError(
        err instanceof Error
          ? `Échec de la conversion : ${err.message}`
          : 'Une erreur est survenue pendant la conversion.',
      );
    }
  };

  const showDocxWarning = target === 'docx' && mode === 'individual';

  /* ------------------------------------------------------------------------ */
  /*  Rendu                                                                   */
  /* ------------------------------------------------------------------------ */
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* En-tête */}
      <div className="mb-6 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-indigo-300 backdrop-blur-md">
          <Sparkles className="h-4 w-4" />
          Convertisseur de fichiers
        </div>
        <h2 className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-3xl font-bold text-transparent">
          Convertissez vos fichiers
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          PDF, Word, Markdown, images, Excel — tout se passe dans votre navigateur, aucun envoi serveur.
        </p>
      </div>

      {/* Zone de dépôt */}
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        animate={{
          borderColor: dragging ? 'rgba(129,140,248,0.8)' : 'rgba(255,255,255,0.12)',
          backgroundColor: dragging ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.03)',
        }}
        whileHover={{ scale: 1.005 }}
        className="group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center backdrop-blur-xl transition-shadow hover:shadow-[0_8px_40px_-12px_rgba(99,102,241,0.5)]"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <motion.div
          animate={{ y: dragging ? -4 : 0 }}
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20"
        >
          <UploadCloud className="h-8 w-8 text-indigo-300" />
        </motion.div>
        <p className="font-medium text-slate-200">
          Glissez vos fichiers ici, ou <span className="text-indigo-400">parcourez</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          MD · DOCX · PDF · PNG/JPG/WEBP · XLSX · CSV
        </p>
      </motion.div>

      {/* Erreur */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Liste des fichiers */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-5 space-y-2"
          >
            {files.map((file, i) => {
              const Icon = iconFor(file.name);
              return (
                <motion.div
                  key={`${file.name}-${i}`}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
                    <Icon className="h-5 w-5 text-indigo-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{file.name}</p>
                    <p className="text-xs text-slate-500">{prettySize(file.size)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
                    aria-label="Retirer le fichier"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              );
            })}

            {(mode === 'combine-images' || mode === 'merge-pdf') && (
              <div className="flex items-center gap-2 px-1 pt-1 text-xs text-indigo-300">
                <Layers className="h-3.5 w-3.5" />
                {mode === 'combine-images'
                  ? `${files.length} images seront combinées en un seul PDF`
                  : `${files.length} PDF seront fusionnés en un seul document`}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Choix du format de sortie */}
      <AnimatePresence>
        {targets.length > 0 && status !== 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6"
          >
            <p className="mb-3 text-sm font-medium text-slate-300">Convertir vers :</p>
            <div className="flex flex-wrap gap-2">
              {targets.map((t) => {
                const active = target === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTarget(t.key)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all
                      ${active
                        ? 'border-indigo-400 bg-indigo-500/20 text-white shadow-[0_0_20px_-4px_rgba(99,102,241,0.6)]'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10'}`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {showDocxWarning && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 text-xs text-amber-300/80"
                >
                  ⚠️ {PDF_TO_DOCX_NOTE}.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <AnimatePresence mode="wait">
        {targets.length > 0 && status !== 'done' && (
          <motion.button
            key="convert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileHover={{ scale: target && status !== 'converting' ? 1.02 : 1 }}
            whileTap={{ scale: 0.98 }}
            disabled={!target || status === 'converting'}
            onClick={handleConvert}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === 'converting' ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {progress || 'Conversion en cours…'}
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Convertir et télécharger
              </>
            )}
          </motion.button>
        )}

        {status === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-5"
          >
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-300">Téléchargement lancé</p>
            <button
              onClick={reset}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
            >
              Convertir d'autres fichiers
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}