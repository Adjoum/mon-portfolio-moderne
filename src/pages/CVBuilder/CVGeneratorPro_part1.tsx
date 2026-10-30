// ═══════════════════════════════════════════════════════════════
//  CVGenerator Pro
//  Features:
//    ① Import ancien CV (PDF/image) + mise à jour sections par IA
//    ② 8 templates premium (Google, OpenAI, Amazon, MIT, Stanford…)
//    ③ Liens projets cliquables dans le CV
//    ④ Panel design (couleur, police, espacement)
//    ⑤ Vérification IA avant export (score + popup centré)
//    ⑥ Système de popups responsives centrées
// ═══════════════════════════════════════════════════════════════
import { useState, useRef } from 'react';
import { runAiFeature, AiFeatureError } from '../../lib/aiClient';

// ── Types core ─────────────────────────────────────────────────
interface Project {
  name: string; desc: string; impact: string;
  techs: string[]; link?: string; github?: string;
}
interface CVEntry {
  role: string; company: string; location: string;
  start: string; end: string; current: boolean;
  bullets: string[]; techs: string[];
}
interface EduEntry {
  degree: string; field: string; school: string;
  city: string; year: string; mention?: string; thesis?: string;
}
interface SkillGroup { cat: string; items: string[] }
interface Language   { lang: string; level: string }
interface Publication { title: string; venue: string; year: string; doi?: string }

interface GeneratedCV {
  personal: {
    name: string; title: string; email: string; phone: string;
    city: string; linkedin: string; github: string; website: string; 
    summary: string; photo?: string;
  };
  experience:      CVEntry[];
  education:       EduEntry[];
  skills:          SkillGroup[];
  languages:       Language[];
  projects?:       Project[];
  publications?:   Publication[];
  interests?:      string[];
  targetRole?: string;
  certifications?: { name: string; issuer: string; year: string; url?: string }[];
  awards?:         { name: string; org: string; year: string }[];
}

export type TemplateId =
  'cascade' | 'moderne' | 'classique' |
  'stanford' | 'openai-dark' | 'amazon-bold' |
  'google-chip' | 'faang-minimal';

export interface DesignConfig {
  primaryColor:  string;
  accentColor:   string;
  fontFamily:    string;
  spacing:       'compact' | 'normal' | 'spacious';
  headerStyle:   'solid' | 'gradient' | 'minimal';
  showPhoto:     boolean;
  showBars:      boolean;
  photoShape:    'circle' | 'square' | 'rectangle';
  photoX:        number; // 0-100, object-position x%
  photoY:        number; // 0-100, object-position y%
}

export interface IntakeData {
  name: string; title: string; email: string; phone: string;
  city: string; linkedin: string; github: string;
  targetRole: string; yearsExp: string; sector: string;
  style: 'french' | 'american'; lang: 'fr' | 'en';
  rawExps: string; rawEdu: string; rawSkills: string;
  keyAchievement: string; rawProjects: string;
  photo?: string;
  importedContent?: string;
  updateInstructions?: string;
}

// ── AI helpers ─────────────────────────────────────────────────
// Toutes les fonctions IA passent par blog-api (src/lib/aiClient.ts) : prompts,
// modèle, limites et quotas sont définis côté serveur. Aucune clé dans le navigateur.

/** Limites appliquées par le serveur (blog-api/src/ai/features/registry.ts) */
const MAX_IMPORTED_CHARS = 12_000;
const MAX_STRUCTURE_CHARS = 8000;

const truncate = (text: string, max: number) =>
  text.length > max ? text.slice(0, max) + '\n[tronqué]' : text;

const cleanJSON = (raw: string) =>
  raw.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim();

// ══════════════════════════════════════════════════════════════
//  ① POPUP SYSTEM — centré, responsive, animé
// ══════════════════════════════════════════════════════════════
type PopupType = 'info' | 'success' | 'error' | 'warning' | 'ai' | 'loading' | 'verify';

interface PopupState {
  open:      boolean;
  type:      PopupType;
  title:     string;
  message?:  string;
  score?:    number;
  details?:  AIVerifyResult;
  onConfirm?: () => void;
  onCancel?:  () => void;
  confirmLabel?: string;
  cancelLabel?:  string;
  loading?:  boolean;
}

interface AIVerifyResult {
  score:       number;
  grade:       string;
  approved:    boolean;
  categories:  { name: string; score: number; comment: string; icon: string }[];
  globalTip:   string;
  suggestions: string[];
}

const POPUP_ICONS: Record<PopupType, string> = {
  info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️',
  ai: '🤖', loading: '⏳', verify: '🔍',
};

const POPUP_COLORS: Record<PopupType, { border: string; bg: string; title: string }> = {
  info:    { border: '#6366f1', bg: 'rgba(99,102,241,.08)',    title: '#a5b4fc' },
  success: { border: '#22c55e', bg: 'rgba(34,197,94,.08)',     title: '#4ade80' },
  error:   { border: '#ef4444', bg: 'rgba(239,68,68,.08)',     title: '#f87171' },
  warning: { border: '#f59e0b', bg: 'rgba(245,158,11,.08)',    title: '#fbbf24' },
  ai:      { border: '#a855f7', bg: 'rgba(168,85,247,.08)',    title: '#c084fc' },
  loading: { border: '#6366f1', bg: 'rgba(99,102,241,.06)',    title: '#a5b4fc' },
  verify:  { border: '#0ea5e9', bg: 'rgba(14,165,233,.08)',    title: '#38bdf8' },
};

function Popup({
  state, onClose,
}: { state: PopupState; onClose: () => void }) {
  if (!state.open) return null;
  const col = POPUP_COLORS[state.type];
  const score = state.score ?? state.details?.score;
  const scoreColor = score
    ? score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
    : undefined;

  return (
    <div className="popup-overlay" onClick={e => { if (e.target === e.currentTarget && !state.loading) onClose(); }}>
      <div className="popup-box" style={{ borderColor: col.border, background: `#161b22` }}>
        {/* Header */}
        <div className="popup-header" style={{ borderBottomColor: col.border + '40', background: col.bg }}>
          <span className="popup-icon">{POPUP_ICONS[state.type]}</span>
          <span className="popup-title" style={{ color: col.title }}>{state.title}</span>
          {!state.loading && (
            <button className="popup-close" onClick={onClose}>✕</button>
          )}
        </div>

        {/* Body */}
        <div className="popup-body">
          {state.loading && (
            <div className="popup-loading-wrap">
              <div className="popup-spinner" />
              <div className="popup-loading-text">{state.message}</div>
            </div>
          )}

          {!state.loading && state.message && !state.details && (
            <p className="popup-message">{state.message}</p>
          )}

          {/* AI Verify result */}
          {state.details && (
            <div className="popup-verify">
              {/* Score circle */}
              <div className="popup-score-row">
                <div className="popup-score-circle" style={{ borderColor: scoreColor, color: scoreColor }}>
                  <span className="popup-score-num">{state.details.score}</span>
                  <span className="popup-score-max">/100</span>
                </div>
                <div className="popup-score-info">
                  <div className="popup-grade" style={{ color: scoreColor }}>{state.details.grade}</div>
                  <div className="popup-approved" style={{ color: state.details.approved ? '#22c55e' : '#ef4444' }}>
                    {state.details.approved ? '✅ CV validé — Prêt à l\'envoi' : '⚠️ Améliorations recommandées'}
                  </div>
                </div>
              </div>

              {/* Categories */}
              <div className="popup-cats">
                {state.details.categories.map((cat, i) => {
                  const c = cat.score >= 80 ? '#22c55e' : cat.score >= 60 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={i} className="popup-cat">
                      <div className="popup-cat-header">
                        <span>{cat.icon} {cat.name}</span>
                        <span style={{ color: c, fontWeight: 700 }}>{cat.score}/100</span>
                      </div>
                      <div className="popup-cat-bar">
                        <div style={{ width: `${cat.score}%`, background: c }} />
                      </div>
                      <div className="popup-cat-comment">{cat.comment}</div>
                    </div>
                  );
                })}
              </div>

              {/* Global tip */}
              <div className="popup-global-tip">💡 {state.details.globalTip}</div>

              {/* Suggestions */}
              {state.details.suggestions.length > 0 && (
                <div className="popup-suggestions">
                  {state.details.suggestions.map((s, i) => (
                    <div key={i} className="popup-suggestion">▸ {s}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(state.onConfirm || state.onCancel) && !state.loading && (
          <div className="popup-footer" style={{ borderTopColor: col.border + '40' }}>
            {state.onCancel && (
              <button className="popup-btn popup-btn-ghost" onClick={() => { state.onCancel?.(); onClose(); }}>
                {state.cancelLabel ?? 'Annuler'}
              </button>
            )}
            {state.onConfirm && (
              <button className="popup-btn popup-btn-primary"
                style={{ background: col.border }}
                onClick={() => { state.onConfirm?.(); onClose(); }}>
                {state.confirmLabel ?? 'Confirmer'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ② IMPORT CV — extraction IA depuis PDF/image
// ══════════════════════════════════════════════════════════════
//  FILE EXTRACTION — PDF · DOCX · Image
//  PDF  → pdfjs-dist  (npm install pdfjs-dist)
//  DOCX → mammoth     (npm install mammoth)
//  Image→ GPT-4o Vision (fallback pour CV scannés)
// ══════════════════════════════════════════════════════════════

// ── PDF → texte natif (pdfjs-dist) ───────────────────────────
// Worker strategy (par ordre de priorité) :
//   1. Vite résout new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)
//      → worker local depuis node_modules, aucune dépendance réseau
//   2. Si pdfjs-dist < 4 : chemin .js au lieu de .mjs
//   3. Fallback : fake worker (main thread, légèrement plus lent, aucun CDN requis)
async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Ne redéfinir le worker que si pas déjà configuré
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // Vite reconnaît ce pattern et bundle le worker en local
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href;
  }

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page   = await pdf.getPage(i);
    const tc     = await page.getTextContent();
    let lastY    = -Infinity;
    let line     = '';
    const lines: string[] = [];

    for (const item of tc.items as any[]) {
      const y = Math.round(item.transform[5]);
      if (Math.abs(y - lastY) > 3 && lastY !== -Infinity) {
        if (line.trim()) lines.push(line.trim());
        line = '';
      }
      line  += (item.str ?? '') + (item.hasEOL ? '\n' : ' ');
      lastY  = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join('\n'));
  }
  return pages.join('\n\n');
}

/** Fichier importé : analysé dans le navigateur, taille bornée pour éviter de le bloquer */
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

// ── DOCX → texte natif (mammoth) ─────────────────────────────
async function extractTextFromDOCX(file: File): Promise<string> {
  const mammoth   = await import('mammoth');
  const buf       = await file.arrayBuffer();
  const result    = await (mammoth as any).extractRawText({ arrayBuffer: buf });
  return (result as any).value as string;
}

// ── Image : réduite côté navigateur avant envoi ───────────────
// Cible < 900 Ko (passe même avec la limite par défaut de 1 Mo de nginx) ;
// plafond serveur : 4 Mo. Paliers de réduction successifs.
const OCR_TARGET_CHARS = 900_000;
const OCR_STEPS = [{ side: 2000, quality: 0.85 }, { side: 1600, quality: 0.8 }, { side: 1280, quality: 0.75 }];

async function fitImageForOcr(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload  = () => resolve();
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = dataUrl;
  });
  if (dataUrl.length <= OCR_TARGET_CHARS && Math.max(img.width, img.height) <= OCR_STEPS[0].side) return dataUrl;

  let resized = dataUrl;
  for (const { side, quality } of OCR_STEPS) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    resized = canvas.toDataURL('image/jpeg', quality);
    if (resized.length <= OCR_TARGET_CHARS) return resized;
  }
  return resized; // au-delà de la cible : le serveur décidera (4 Mo maximum)
}

// ── Image → texte via l'IA vision (CV scannés uniquement) ──
async function extractCVFromImage(base64: string, mimeType: string): Promise<string> {
  const VISION = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
  if (!VISION.some(m => mimeType.startsWith(m))) {
    throw new Error('Type image non supporté: ' + mimeType);
  }
  return runAiFeature('cv.import.ocr', { image: await fitImageForOcr(base64) });
}

// ── Structuration du texte brut par l'IA ───────────────────────
// Si la fonction IA est indisponible, le texte brut est conservé (l'import reste possible)
async function structureCVTextWithFallback(rawText: string): Promise<{ text: string; structured: boolean }> {
  if (!rawText.trim()) throw new Error('Aucun texte extrait — document peut-être protégé ou scanné.');
  try {
    return { text: await runAiFeature('cv.import.structure', { text: rawText }), structured: true };
  } catch (e) {
    if (e instanceof AiFeatureError && e.unavailable) {
      return { text: truncate(rawText.trim(), MAX_STRUCTURE_CHARS), structured: false };
    }
    throw e;
  }
}

async function structureCVText(rawText: string): Promise<string> {
  return (await structureCVTextWithFallback(rawText)).text;
}

// Alias de compatibilité
const extractCVFromPDFText = structureCVText;

// ══════════════════════════════════════════════════════════════
//  IMPORT CV PANEL
// ══════════════════════════════════════════════════════════════
function ImportCVPanel({
  onExtracted,
}: { onExtracted: (content: string, photo?: string) => void }) {
  const [dragging,   setDragging]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [loadMsg,    setLoadMsg]    = useState('');
  const [extracted,  setExtracted]  = useState('');
  const [updates,    setUpdates]    = useState('');
  const [error,      setError]      = useState('');
  const [notice,     setNotice]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setError('');
    setNotice('');
    if (file.size > MAX_IMPORT_BYTES) {
      setError('Fichier trop volumineux (10 Mo maximum).');
      return;
    }
    setLoading(true);

    const name = file.name.toLowerCase();
    const mime = file.type;

    try {
      let rawText = '';

      // ── PDF ────────────────────────────────────────────────
      if (mime === 'application/pdf' || name.endsWith('.pdf')) {
        setLoadMsg('📄 Lecture du PDF en cours…');
        rawText = await extractTextFromPDF(file);

        // Fallback: si PDF scanné (peu de texte), proposer image
        if (rawText.trim().length < 100) {
          setError(
            'Ce PDF semble être un scan sans texte sélectionnable. ' +
            'Faites une capture d\u2019écran et importez l\u2019image.'
          );
          setLoading(false);
          return;
        }
      }
      // ── DOCX ───────────────────────────────────────────────
      else if (
        name.endsWith('.docx') ||
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        setLoadMsg('📝 Lecture du document Word en cours…');
        rawText = await extractTextFromDOCX(file);
      }
      // ── DOC (ancien format) ────────────────────────────────
      else if (name.endsWith('.doc')) {
        setError(
          'Le format .doc (ancien Word) n\u2019est pas supporté directement. ' +
          'Sauvegardez en .docx (Fichier → Enregistrer sous → .docx) ou exportez en PDF.'
        );
        setLoading(false);
        return;
      }
      // ── Image (CV scanné / photo) ──────────────────────────
      else if (mime.startsWith('image/')) {
        setLoadMsg('🔍 Analyse visuelle du CV par l’IA…');
        const reader = new FileReader();
        const base64 = await new Promise<string>((res, rej) => {
          reader.onload  = ev => res(ev.target?.result as string);
          reader.onerror = () => rej(new Error('Erreur lecture image'));
          reader.readAsDataURL(file);
        });
        const result = await extractCVFromImage(base64, mime);
        setExtracted(result);
        setLoading(false);
        return;
      }
      // ── Autre ──────────────────────────────────────────────
      else {
        setError(
          'Format non supporté: ' + (mime || name) +
          '. Utilisez PDF, DOCX ou une image (JPG/PNG).'
        );
        setLoading(false);
        return;
      }

      // ── Structuration du texte par l'IA (repli : texte brut) ─
      setLoadMsg('🤖 Structuration par l\u2019IA…');
      const { text, structured } = await structureCVTextWithFallback(rawText);
      setExtracted(text);
      if (!structured) {
        setNotice('Structuration par l’IA momentanément indisponible : le texte brut a été importé. Relisez-le avant de générer.');
      }

    } catch (e: any) {
      const msg = (e as Error).message ?? 'Erreur inconnue';
      if (msg.includes('pdfjs') || msg.includes('pdf')) {
        setError('Erreur PDF: ' + msg + ' — Essayez d\u2019importer une image du CV.');
      } else if (msg.includes('mammoth') || msg.includes('docx')) {
        setError('Erreur Word: ' + msg + ' — Sauvegardez en PDF et réessayez.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  };

  return (
    <div className="import-panel">
      <div className="import-title">📂 Importer un CV existant</div>
      <div className="import-hint">
        Glissez votre CV — <strong>PDF, DOCX ou image</strong> — et l&apos;IA extrait
        tout le contenu automatiquement, sans conversion.
      </div>

      {/* Error */}
      {error && (
        <div className="import-error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="import-error-close">✕</button>
        </div>
      )}

      {/* Fonction IA indisponible : repli explicite */}
      {notice && (
        <div className="import-error" role="status" style={{ borderColor: 'rgba(245,158,11,.5)', color: '#fbbf24' }}>
          <span>ℹ️ {notice}</span>
          <button onClick={() => setNotice('')} className="import-error-close">✕</button>
        </div>
      )}

      {/* Drop zone */}
      {!extracted && (
        <div
          className={`import-dropzone${dragging ? ' import-drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) processFile(f);
          }}
          onClick={() => !loading && fileRef.current?.click()}
        >
          {loading ? (
            <div className="import-loading">
              <div className="import-spinner" />
              <div>
                <div className="import-loading-main">{loadMsg || 'Traitement en cours…'}</div>
                <div className="import-loading-sub">Extraction native — aucune conversion image</div>
              </div>
            </div>
          ) : (
            <>
              <div className="import-dz-icon">📂</div>
              <div className="import-dz-text">Glissez votre CV ici ou cliquez</div>
              <div className="import-dz-formats">
                <span className="import-fmt">📄 PDF</span>
                <span className="import-fmt">📝 DOCX</span>
                <span className="import-fmt">🖼 JPG/PNG</span>
              </div>
              <div className="import-dz-hint">Extraction directe — rapide et précise</div>
            </>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,image/jpeg,image/jpg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
      />

      {/* Extracted content */}
      {extracted && (
        <>
          <div className="import-extracted">
            <div className="import-extracted-title">
              ✅ Contenu extrait ({extracted.split('\n').filter(Boolean).length} lignes)
            </div>
            <textarea
              className="import-extracted-ta"
              value={extracted}
              rows={8}
              onChange={e => setExtracted(e.target.value)}
            />
          </div>

          <div className="import-updates">
            <div className="import-updates-title">✏️ Mises à jour à apporter (optionnel)</div>
            <div className="import-updates-hint">
              Décrivez ce que vous voulez ajouter, modifier ou améliorer.
            </div>
            <textarea
              className="import-extracted-ta"
              value={updates}
              rows={4}
              onChange={e => setUpdates(e.target.value)}
              placeholder={[
                'Ajouter mon nouveau poste chez Google depuis jan 2024.',
                'Mettre à jour les compétences: Rust, Go, Kubernetes.',
                'Améliorer les bullets avec plus de métriques chiffrées.',
              ].join('\n')}
            />
          </div>

          <div className="import-actions">
            <button
              className="import-btn-ghost"
              onClick={() => { setExtracted(''); setUpdates(''); setError(''); }}
            >
              ↩ Recommencer
            </button>
            <button
              className="import-btn-primary"
              onClick={() => onExtracted(
                updates.trim() ? `${extracted}\n\nMISES À JOUR DEMANDÉES:\n${updates}` : extracted,
                undefined
              )}
            >
              ✅ Générer le CV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ④ DESIGN PANEL
// ══════════════════════════════════════════════════════════════
const DEFAULT_DESIGN: DesignConfig = {
  primaryColor: '#1e3a5f', accentColor: '#6fa3d0',
  fontFamily: 'Calibri', spacing: 'normal',
  headerStyle: 'solid', showPhoto: true, showBars: true,
  photoShape: 'circle',
  photoX: 50, photoY: 25,
};

const FONT_OPTIONS = [
  { value: 'Calibri,Segoe UI,Arial,sans-serif',        label: 'Calibri (moderne)' },
  { value: "'Georgia','Times New Roman',serif",          label: 'Georgia (élégant)' },
  { value: "'Inter','Helvetica',sans-serif",             label: 'Inter (tech)' },
  { value: "'Garamond','EB Garamond',serif",             label: 'Garamond (académique)' },
  { value: "'Palatino Linotype','Palatino',serif",       label: 'Palatino (classique)' },
  { value: "'Courier New',Courier,monospace",            label: 'Courier (code/tech)' },
];

const COLOR_PRESETS = [
  { name: 'Navy',    primary: '#1e3a5f', accent: '#6fa3d0' },
  { name: 'Teal',    primary: '#0d4a52', accent: '#3a8fa0' },
  { name: 'Indigo',  primary: '#312e81', accent: '#818cf8' },
  { name: 'Noir',    primary: '#111827', accent: '#6b7280' },
  { name: 'Forest',  primary: '#14532d', accent: '#4ade80' },
  { name: 'Bordeaux',primary: '#7f1d1d', accent: '#f87171' },
  { name: 'Or',      primary: '#78350f', accent: '#f59e0b' },
  { name: 'Violet',  primary: '#4c1d95', accent: '#c084fc' },
];

function DesignPanel({ design, onChange }: { design: DesignConfig; onChange: (d: DesignConfig) => void }) {
  return (
    <div className="dp-root">
      <div className="dp-title">🎨 Design du CV</div>

      {/* Color presets */}
      <div className="dp-section">
        <div className="dp-label">Palette de couleurs</div>
        <div className="dp-color-presets">
          {COLOR_PRESETS.map(c => (
            <button key={c.name}
              className={`dp-preset${design.primaryColor === c.primary ? ' dp-preset-active' : ''}`}
              onClick={() => onChange({ ...design, primaryColor: c.primary, accentColor: c.accent })}
              title={c.name}>
              <div className="dp-preset-swatch" style={{ background: c.primary }} />
              <div className="dp-preset-swatch" style={{ background: c.accent }} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
        <div className="dp-custom-row">
          <label className="dp-label">Couleur principale</label>
          <input type="color" value={design.primaryColor}
            onChange={e => onChange({ ...design, primaryColor: e.target.value })} className="dp-color-input" />
          <label className="dp-label">Accent</label>
          <input type="color" value={design.accentColor}
            onChange={e => onChange({ ...design, accentColor: e.target.value })} className="dp-color-input" />
        </div>
      </div>

      {/* Font */}
      <div className="dp-section">
        <div className="dp-label">Police de caractères</div>
        <select className="dp-select" value={design.fontFamily}
          onChange={e => onChange({ ...design, fontFamily: e.target.value })}>
          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {/* Spacing */}
      <div className="dp-section">
        <div className="dp-label">Espacement</div>
        <div className="dp-btn-group">
          {(['compact', 'normal', 'spacious'] as const).map(s => (
            <button key={s} className={`dp-spacing-btn${design.spacing === s ? ' dp-active' : ''}`}
              onClick={() => onChange({ ...design, spacing: s })}>
              {s === 'compact' ? '⬛ Compact' : s === 'normal' ? '⬜ Normal' : '⬜⬜ Aéré'}
            </button>
          ))}
        </div>
      </div>

      {/* Header style */}
      <div className="dp-section">
        <div className="dp-label">Style d'en-tête</div>
        <div className="dp-btn-group">
          {[
            { v: 'solid', l: '█ Plein' },
            { v: 'gradient', l: '▒ Dégradé' },
            { v: 'minimal', l: '▔ Minimal' },
          ].map(h => (
            <button key={h.v} className={`dp-spacing-btn${design.headerStyle === h.v ? ' dp-active' : ''}`}
              onClick={() => onChange({ ...design, headerStyle: h.v as any })}>
              {h.l}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="dp-section">
        <label className="dp-toggle">
          <input type="checkbox" checked={design.showPhoto}
            onChange={e => onChange({ ...design, showPhoto: e.target.checked })} />
          Afficher la photo
        </label>
        <label className="dp-toggle">
          <input type="checkbox" checked={design.showBars}
            onChange={e => onChange({ ...design, showBars: e.target.checked })} />
          Barres de compétences
        </label>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ⑤ AI VERIFICATION
// ══════════════════════════════════════════════════════════════
async function verifyCV(cv: GeneratedCV, lang: 'fr' | 'en'): Promise<AIVerifyResult> {
  // La photo n'est jamais envoyée à l'IA (le serveur la retire aussi)
  const { photo: _photo, ...personal } = cv.personal as GeneratedCV['personal'] & { photo?: string };
  void _photo;
  const raw = await runAiFeature('cv.review', { cv: { ...cv, personal }, lang });
  return JSON.parse(cleanJSON(raw)) as AIVerifyResult;
}

// ══════════════════════════════════════════════════════════════
//  GENERATE CV — IA génère tout (prompt défini côté serveur : cv.generate)
// ══════════════════════════════════════════════════════════════
async function generateCV(intake: IntakeData): Promise<GeneratedCV> {
  const raw = await runAiFeature('cv.generate', {
    name: intake.name, title: intake.title, email: intake.email, phone: intake.phone,
    city: intake.city, linkedin: intake.linkedin, github: intake.github,
    targetRole: intake.targetRole, yearsExp: intake.yearsExp, sector: intake.sector,
    style: intake.style, lang: intake.lang,
    rawExps: intake.rawExps, rawEdu: intake.rawEdu, rawSkills: intake.rawSkills,
    keyAchievement: intake.keyAchievement, rawProjects: intake.rawProjects,
    importedContent: intake.importedContent ? truncate(intake.importedContent, MAX_IMPORTED_CHARS) : '',
    updateInstructions: intake.updateInstructions ?? '',
    // la photo reste dans le navigateur : elle est ajoutée au CV après génération
  });
  const parsed = JSON.parse(cleanJSON(raw)) as GeneratedCV;
  if (intake.photo) parsed.personal.photo = intake.photo;
  return parsed;
}

export { generateCV, verifyCV, extractCVFromImage, extractCVFromPDFText };
export type { GeneratedCV, AIVerifyResult };
export { Popup, ImportCVPanel, DesignPanel, DEFAULT_DESIGN };
export type { PopupState };