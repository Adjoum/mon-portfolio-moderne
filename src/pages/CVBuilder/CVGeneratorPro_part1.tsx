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
const OPENAI_KEY = () => ((import.meta as any).env?.VITE_OPENAI_API_KEY ?? '') as string;

async function callGPT(
  system: string, user: string, model = 'gpt-4o', max = 4000,
  images?: string[]
): Promise<string> {
  const key = OPENAI_KEY();
  if (!key) throw new Error('Clé VITE_OPENAI_API_KEY manquante dans .env');

  const content: any[] = [{ type: 'text', text: user }];
  images?.forEach(img => content.unshift({ type: 'image_url', image_url: { url: img, detail: 'high' } }));

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, max_tokens: max,
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
    }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message ?? `HTTP ${r.status}`); }
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? '';
}

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
    try {
      // Vite reconnaît ce pattern et bundle le worker en local
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).href;
    } catch {
      try {
        // pdfjs-dist v3/v4 — extension .js
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.js',
          import.meta.url
        ).href;
      } catch {
        // Fake worker — fonctionne en main thread, pas de CDN
        // Produit un warning console mais l'extraction reste 100% fonctionnelle
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      }
    }
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

// ── DOCX → texte natif (mammoth) ─────────────────────────────
async function extractTextFromDOCX(file: File): Promise<string> {
  const mammoth   = await import('mammoth');
  const buf       = await file.arrayBuffer();
  const result    = await (mammoth as any).extractRawText({ arrayBuffer: buf });
  return (result as any).value as string;
}

// ── Image → texte via GPT-4o Vision (CV scannés uniquement) ──
async function extractCVFromImage(base64: string, mimeType: string): Promise<string> {
  const VISION = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
  if (!VISION.some(m => mimeType.startsWith(m))) {
    throw new Error('Type image non supporté: ' + mimeType);
  }
  return callGPT(
    `Tu es expert en lecture de CV. Extrais TOUT le contenu de ce CV image.
Retourne le texte structuré: NOM, TITRE, CONTACT, RÉSUMÉ, EXPÉRIENCES (dates+entreprises), FORMATION, COMPÉTENCES.`,
    'Extrais intégralement le contenu de ce CV.',
    'gpt-4o', 2000, [base64]
  );
}

// ── Structuration du texte brut par GPT-4o-mini ───────────────
async function structureCVText(rawText: string): Promise<string> {
  if (!rawText.trim()) throw new Error('Aucun texte extrait — document peut-être protégé ou scanné.');
  const txt = rawText.length > 8000 ? rawText.slice(0, 8000) + '\n[tronqué]' : rawText;
  return callGPT(
    `Tu es expert CV. Ce texte a été extrait automatiquement d'un PDF ou Word.
Réorganise-le en sections claires: NOM · TITRE · CONTACT · RÉSUMÉ · EXPÉRIENCES (dates+entreprises) · FORMATION · COMPÉTENCES · LANGUES.
Corrige les artéfacts (espaces parasites, retours mal placés). Retourne le texte propre et structuré.`,
    `Texte extrait:\n${txt}`,
    'gpt-4o-mini', 2000
  );
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
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setError('');
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
        setLoadMsg('🔍 Analyse visuelle du CV (GPT-4o Vision)…');
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

      // ── Structuration du texte via GPT ─────────────────────
      setLoadMsg('🤖 Structuration par l\u2019IA…');
      const structured = await structureCVText(rawText);
      setExtracted(structured);

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
  const text = JSON.stringify(cv, null, 2);
  const raw = await callGPT(
    `Tu es un expert recruteur FAANG/académique et coach CV. Analyse ce CV et retourne UNIQUEMENT ce JSON:
{
  "score": <0-100>,
  "grade": "<Excellent|Très Bon|Bon|Passable|À retravailler>",
  "approved": <score >= 75>,
  "categories": [
    {"name":"Impact & Métriques","score":<0-100>,"comment":"<max 80 chars>","icon":"📊"},
    {"name":"Clarté & Lisibilité","score":<0-100>,"comment":"<max 80 chars>","icon":"✍️"},
    {"name":"ATS & Mots-clés","score":<0-100>,"comment":"<max 80 chars>","icon":"🤖"},
    {"name":"Expérience & Formation","score":<0-100>,"comment":"<max 80 chars>","icon":"🎓"},
    {"name":"Accroche & Positionnement","score":<0-100>,"comment":"<max 80 chars>","icon":"🎯"}
  ],
  "globalTip": "<conseil global max 150 chars>",
  "suggestions": ["<suggestion 1>","<suggestion 2>","<suggestion 3>"]
}`,
    `CV à analyser (langue: ${lang}):\n${text.slice(0, 3000)}`,
    'gpt-4o-mini', 800
  );
  return JSON.parse(cleanJSON(raw)) as AIVerifyResult;
}

// ══════════════════════════════════════════════════════════════
//  GENERATE CV — IA génère tout
// ══════════════════════════════════════════════════════════════
async function generateCV(intake: IntakeData): Promise<GeneratedCV> {
  const lang = intake.lang === 'fr';
  const hasImport = !!intake.importedContent;

  const sys = `Expert rédacteur CV haut de gamme — FAANG, académique, recherche.
Style: ${intake.style === 'french' ? 'CV français complet, détaillé' : 'American résumé, impact-first, 1-2 pages'}.
Langue: ${lang ? 'FRANÇAIS exclusivement' : 'ENGLISH only'}.
RETOURNE UNIQUEMENT DU JSON VALIDE, SANS MARKDOWN.`;

  const importCtx = hasImport
    ? `\n\nCONTENU CV IMPORTÉ:\n${intake.importedContent}\n\nMISES À JOUR DEMANDÉES: ${intake.updateInstructions || 'Améliorer et moderniser le contenu'}` : '';

  const projectsCtx = intake.rawProjects
    ? `\n\nPROJETS (format: Nom | Description | Lien | GitHub | Technologies):\n${intake.rawProjects}` : '';

  const prompt = `
Candidat:
- Nom: ${intake.name} | Titre: ${intake.title}
- Poste visé: ${intake.targetRole} | Expérience: ${intake.yearsExp} ans
- Ville: ${intake.city} | Email: ${intake.email} | Phone: ${intake.phone}
- LinkedIn: ${intake.linkedin} | GitHub: ${intake.github}
- Expériences: ${intake.rawExps}
- Formation: ${intake.rawEdu}
- Compétences: ${intake.rawSkills}
- Réalisation clé: ${intake.keyAchievement}${importCtx}${projectsCtx}

JSON EXACT requis:
{
  "personal": {
    "name": "${intake.name || 'Prénom Nom'}",
    "title": "${intake.title || intake.targetRole}",
    "email": "${intake.email}",
    "phone": "${intake.phone}",
    "city": "${intake.city}",
    "linkedin": "${intake.linkedin}",
    "github": "${intake.github}",
    "website": "",
    "summary": "<accroche 3-4 lignes percutantes, 1ère personne, mentionne poste visé + réalisation clé>"
  },
  "experience": [{
    "role": "<titre exact>",
    "company": "<entreprise>",
    "location": "<ville>",
    "start": "<mois/année>",
    "end": "<mois/année ou présent>",
    "current": true,
    "bullets": [
      "<verb d'action fort + résultat chiffré>",
      "<impact business ou technique>",
      "<leadership/collaboration ou méthode>",
      "<réalisation notable>"
    ],
    "techs": ["<tech1>","<tech2>"]
  }],
  "education": [{
    "degree": "<diplôme>", "field": "<spécialité>",
    "school": "<école>", "city": "<ville>", "year": "<année>", "mention": "<mention>"
  }],
  "skills": [
    {"cat": "<Langages>", "items": ["Python","Java","Go","TypeScript"]},
    {"cat": "<Frameworks>", "items": ["React","FastAPI","Spring"]},
    {"cat": "<Cloud & DevOps>", "items": ["AWS","Docker","Kubernetes","Terraform"]},
    {"cat": "<Outils>", "items": ["Git","Jira","Figma","LaTeX"]}
  ],
  "languages": [
    {"lang": "${lang?'Français':'French'}", "level": "${lang?'Langue maternelle':'Native'}"},
    {"lang": "${lang?'Anglais':'English'}", "level": "${lang?'Courant (B2+)':'Fluent (B2+)'}"}
  ],
  "projects": [{
    "name": "<nom projet>",
    "desc": "<description 1-2 lignes impactante>",
    "impact": "<métriques ou résultats>",
    "techs": ["<tech1>"],
    "link": "<url ou vide>",
    "github": "<github url ou vide>"
  }],
  "certifications": [{"name": "<cert>", "issuer": "<issuer>", "year": "<year>", "url": ""}],
  "awards": [{"name": "<award>", "org": "<org>", "year": "<year>"}],
  "interests": ["<intérêt 1>", "<intérêt 2>", "<intérêt 3>"]
}

RÈGLES:
- 3-4 bullets RÉELS par expérience, verbe d'action fort, impact chiffré
- Si données manquantes: inventer de façon cohérente avec le secteur ${intake.sector}
- ${hasImport ? 'Intégrer TOUTES les infos du CV importé + les mises à jour demandées' : 'Enrichir les données fournies'}
- JSON pur SANS commentaires ni markdown`;

  const raw = await callGPT(sys, prompt, 'gpt-4o', 4500);
  const parsed = JSON.parse(cleanJSON(raw)) as GeneratedCV;
  if (intake.photo) parsed.personal.photo = intake.photo;
  return parsed;
}

export { generateCV, verifyCV, extractCVFromImage, extractCVFromPDFText };
export type { GeneratedCV, AIVerifyResult };
export { Popup, ImportCVPanel, DesignPanel, DEFAULT_DESIGN };
export type { PopupState };