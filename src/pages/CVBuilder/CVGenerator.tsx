// CVGeneratorPro — Part 3: Main Component
import React, { useState, useRef, useCallback } from 'react';
import {
  Popup, ImportCVPanel, DEFAULT_DESIGN,
  generateCV, verifyCV,
  type GeneratedCV, type PopupState,
  type IntakeData, type DesignConfig, type TemplateId
} from './CVGeneratorPro_part1';
import { renderTemplate, TEMPLATE_META } from './CVGeneratorPro_part2';
import { DesignPanelFull } from './CVLiveEditor';

// ── Empty intake ───────────────────────────────────────────────
const emptyIntake = (): IntakeData => ({
  name: '', title: '', email: '', phone: '', city: '',
  linkedin: '', github: '', targetRole: '', yearsExp: '4-5',
  sector: 'tech', style: 'french', lang: 'fr',
  rawExps: '', rawEdu: '', rawSkills: '',
  keyAchievement: '', rawProjects: '',
});

// ── Field helpers ──────────────────────────────────────────────
const Inp: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }> =
  ({ label, value, onChange, placeholder, hint }) => (
    <label className="gp-field">
      <span className="gp-field-label">{label}</span>
      <input className="gp-input" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} />
      {hint && <span className="gp-hint">{hint}</span>}
    </label>
  );

const Sel: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }> =
  ({ label, value, onChange, options }) => (
    <label className="gp-field">
      <span className="gp-field-label">{label}</span>
      <select className="gp-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );

const TA: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; hint?: string }> =
  ({ label, value, onChange, placeholder, rows = 4, hint }) => (
    <div className="gp-field">
      <span className="gp-field-label">{label}</span>
      {hint && <span className="gp-hint gp-hint-top">{hint}</span>}
      <textarea className="gp-textarea" value={value} rows={rows}
        placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );

// ══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

// ── TagsInput — comma fields that work properly ───────────────
// Maintains local raw string, only parses on blur → space/comma work fine
function TagsInput({
  value, onChange, placeholder, className = 'ep-input',
}: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; className?: string }) {
  const [raw, setRaw] = React.useState(value.join(', '));
  const committed = React.useRef(value.join(', '));

  // Sync only when external value changed substantially (not on every render)
  React.useEffect(() => {
    const ext = value.join(', ');
    if (ext !== committed.current) {
      setRaw(ext);
      committed.current = ext;
    }
  }, [value.join(', ')]);

  return (
    <input
      className={className}
      value={raw}
      placeholder={placeholder ?? 'item1, item2, item3'}
      onChange={e => setRaw(e.target.value)}
      onBlur={() => {
        const parsed = raw.split(',').map(t => t.trim()).filter(Boolean);
        committed.current = parsed.join(', ');
        onChange(parsed);
      }}
    />
  );
}

// ── PhotoCropWidget — drag to reposition photo in frame ────────
function PhotoCropWidget({
  photo, shape, photoX, photoY,
  onPositionChange, onPhotoChange,
}: {
  photo?: string; shape: DesignConfig['photoShape'];
  photoX: number; photoY: number;
  onPositionChange: (x: number, y: number) => void;
  onPhotoChange: (url: string) => void;
}) {
  const dragRef = React.useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const radius = shape === 'circle' ? '50%' : shape === 'rectangle' ? '6px' : '8px';
  const W = shape === 'rectangle' ? 76 : 100;
  const H = 100;

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: photoX, oy: photoY };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ((ev.clientX - dragRef.current.startX) / W) * 100;
      const dy = ((ev.clientY - dragRef.current.startY) / H) * 100;
      const nx = Math.max(0, Math.min(100, dragRef.current.ox - dx));
      const ny = Math.max(0, Math.min(100, dragRef.current.oy - dy));
      onPositionChange(Math.round(nx), Math.round(ny));
    };
    const up = () => { dragRef.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startY: t.clientY, ox: photoX, oy: photoY };
    const move = (ev: TouchEvent) => {
      if (!dragRef.current) return;
      const touch = ev.touches[0];
      const dx = ((touch.clientX - dragRef.current.startX) / W) * 100;
      const dy = ((touch.clientY - dragRef.current.startY) / H) * 100;
      const nx = Math.max(0, Math.min(100, dragRef.current.ox - dx));
      const ny = Math.max(0, Math.min(100, dragRef.current.oy - dy));
      onPositionChange(Math.round(nx), Math.round(ny));
    };
    const up = () => { dragRef.current = null; window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
  };

  return (
    <div className="pcw-root">
      <div className="pcw-title">📸 Photo</div>
      <div className="pcw-hint">
        {photo ? '🖱 Glissez la photo pour recadrer le visage' : 'Aucune photo — cliquez pour importer'}
      </div>
      <div className="pcw-frame-wrap">
        <div
          className="pcw-frame"
          style={{ width: W, height: H, borderRadius: radius, cursor: photo ? 'grab' : 'default' }}
          onMouseDown={photo ? onMouseDown : undefined}
          onTouchStart={photo ? onTouchStart : undefined}
        >
          {photo ? (
            <img src={photo} className="pcw-img"
              style={{ objectPosition: `${photoX}% ${photoY}%` }}
              draggable={false} />
          ) : (
            <div className="pcw-placeholder">?</div>
          )}
        </div>
        <div className="pcw-coords">{photoX}% · {photoY}%</div>
        <button className="pcw-reset" onClick={() => onPositionChange(50, 25)}>⌖ Centrer</button>
      </div>
      <button className="pcw-change" onClick={() => fileRef.current?.click()}>
        {photo ? '🔄 Changer la photo' : '📤 Importer une photo'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          const r = new FileReader();
          r.onload = ev => onPhotoChange(ev.target?.result as string);
          r.readAsDataURL(f);
        }} />
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
//  CVEditPanel — panneau d'édition inline du CV généré
// ══════════════════════════════════════════════════════════════
function CVEditPanel({
  cv, onChange, design, onDesignChange,
}: {
  cv: GeneratedCV; onChange: (cv: GeneratedCV) => void; lang: 'fr'|'en';
  design: DesignConfig; onDesignChange: (d: DesignConfig) => void;
}) {
  const [tab, setTab] = useState<'personal'|'experience'|'education'|'skills'|'projects'|'other'>('personal');
  const p = cv.personal;
  const upP = (k: string, v: string) => onChange({ ...cv, personal: { ...p, [k]: v } });

  const TABS = [
    { id:'personal',   label:'👤 Identité' },
    { id:'experience', label:'💼 Expériences' },
    { id:'education',  label:'🎓 Formation' },
    { id:'skills',     label:'⚡ Compétences' },
    { id:'projects',   label:'🚀 Projets' },
    { id:'other',      label:'🌍 Autres' },
  ] as const;

  return (
    <div className="ep-root">
      <div className="ep-header">✏️ Modifier le CV</div>
      <div className="ep-tabs">
        {TABS.map(t => (
          <button key={t.id}
            className={`ep-tab${tab === t.id ? ' ep-tab-active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ep-body">

        {/* ── IDENTITÉ ────────────────────────────────────────── */}
        {tab === 'personal' && (
          <div className="ep-section">
            {([
              ['name',    'Nom complet'],
              ['title',   'Titre / Poste'],
              ['email',   'Email'],
              ['phone',   'Téléphone'],
              ['city',    'Ville'],
              ['linkedin','LinkedIn'],
              ['github',  'GitHub / Portfolio'],
              ['website', 'Site web'],
            ] as [string,string][]).map(([k,l]) => (
              <label key={k} className="ep-field">
                <span className="ep-label">{l}</span>
                <input className="ep-input" value={(p as any)[k] || ''}
                  onChange={e => upP(k, e.target.value)} />
              </label>
            ))}
            <label className="ep-field">
              <span className="ep-label">Résumé / Accroche</span>
              <textarea className="ep-textarea" rows={4}
                value={p.summary} onChange={e => upP('summary', e.target.value)} />
            </label>
            {/* Photo crop widget */}
            <PhotoCropWidget
              photo={p.photo}
              shape={design.photoShape}
              photoX={design.photoX}
              photoY={design.photoY}
              onPositionChange={(x, y) => onDesignChange({ ...design, photoX: x, photoY: y })}
              onPhotoChange={url => onChange({ ...cv, personal: { ...p, photo: url } })}
            />
          </div>
        )}

        {/* ── EXPÉRIENCES ─────────────────────────────────────── */}
        {tab === 'experience' && (
          <div className="ep-section">
            {cv.experience.map((exp, i) => (
              <div key={i} className="ep-card">
                <div className="ep-card-title">
                  {exp.role || 'Expérience ' + (i+1)}
                  <button className="ep-del" onClick={() => onChange({ ...cv, experience: cv.experience.filter((_,j) => j!==i) })}>✕</button>
                </div>
                <div className="ep-row2">
                  <label className="ep-field"><span className="ep-label">Rôle</span>
                    <input className="ep-input" value={exp.role}
                      onChange={e => onChange({ ...cv, experience: cv.experience.map((x,j) => j===i?{...x,role:e.target.value}:x) })} />
                  </label>
                  <label className="ep-field"><span className="ep-label">Entreprise</span>
                    <input className="ep-input" value={exp.company}
                      onChange={e => onChange({ ...cv, experience: cv.experience.map((x,j) => j===i?{...x,company:e.target.value}:x) })} />
                  </label>
                  <label className="ep-field"><span className="ep-label">Ville</span>
                    <input className="ep-input" value={exp.location}
                      onChange={e => onChange({ ...cv, experience: cv.experience.map((x,j) => j===i?{...x,location:e.target.value}:x) })} />
                  </label>
                  <label className="ep-field"><span className="ep-label">Dates (début – fin)</span>
                    <div style={{display:'flex',gap:4}}>
                      <input className="ep-input" value={exp.start} placeholder="01/2023"
                        onChange={e => onChange({ ...cv, experience: cv.experience.map((x,j) => j===i?{...x,start:e.target.value}:x) })} />
                      <input className="ep-input" value={exp.end} placeholder="présent"
                        onChange={e => onChange({ ...cv, experience: cv.experience.map((x,j) => j===i?{...x,end:e.target.value}:x) })} />
                    </div>
                  </label>
                </div>
                <label className="ep-field"><span className="ep-label">Points clés (un par ligne)</span>
                  <textarea className="ep-textarea" rows={4}
                    value={exp.bullets.join('\n')}
                    onChange={e => onChange({ ...cv, experience: cv.experience.map((x,j) => j===i?{...x,bullets:e.target.value.split('\n')}:x) })} />
                </label>
                <label className="ep-field"><span className="ep-label">Technologies (virgules)</span>
                  <TagsInput value={exp.techs}
                    onChange={techs => onChange({ ...cv, experience: cv.experience.map((x,j) => j===i?{...x,techs}:x) })} />
                </label>
              </div>
            ))}
            <button className="ep-add-btn" onClick={() => onChange({ ...cv, experience: [...cv.experience, { role:'', company:'', location:'', start:'', end:'présent', current:true, bullets:[''], techs:[] }] })}>
              + Ajouter une expérience
            </button>
          </div>
        )}

        {/* ── FORMATION ───────────────────────────────────────── */}
        {tab === 'education' && (
          <div className="ep-section">
            {cv.education.map((edu, i) => (
              <div key={i} className="ep-card">
                <div className="ep-card-title">
                  {edu.degree || 'Formation ' + (i+1)}
                  <button className="ep-del" onClick={() => onChange({ ...cv, education: cv.education.filter((_,j) => j!==i) })}>✕</button>
                </div>
                <div className="ep-row2">
                  {([['degree','Diplôme'],['field','Spécialité'],['school','École'],['city','Ville'],['year','Année(s)'],['mention','Mention']] as [string,string][]).map(([k,l]) => (
                    <label key={k} className="ep-field"><span className="ep-label">{l}</span>
                      <input className="ep-input" value={(edu as any)[k]||''}
                        onChange={e => onChange({ ...cv, education: cv.education.map((x,j) => j===i?{...x,[k]:e.target.value}:x) })} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button className="ep-add-btn" onClick={() => onChange({ ...cv, education: [...cv.education, { degree:'', field:'', school:'', city:'', year:'', mention:'' }] })}>
              + Ajouter une formation
            </button>
          </div>
        )}

        {/* ── COMPÉTENCES ─────────────────────────────────────── */}
        {tab === 'skills' && (
          <div className="ep-section">
            {cv.skills.map((sg, i) => (
              <div key={i} className="ep-card">
                <label className="ep-field"><span className="ep-label">Catégorie</span>
                  <input className="ep-input" value={sg.cat}
                    onChange={e => onChange({ ...cv, skills: cv.skills.map((x,j) => j===i?{...x,cat:e.target.value}:x) })} />
                </label>
                <label className="ep-field"><span className="ep-label">Éléments (séparés par virgule)</span>
                  <TagsInput value={sg.items}
                    onChange={items => onChange({ ...cv, skills: cv.skills.map((x,j) => j===i?{...x,items}:x) })} />
                </label>
              </div>
            ))}
            <button className="ep-add-btn" onClick={() => onChange({ ...cv, skills: [...cv.skills, { cat:'', items:[] }] })}>
              + Ajouter une catégorie
            </button>
          </div>
        )}

        {/* ── PROJETS ─────────────────────────────────────────── */}
        {tab === 'projects' && (
          <div className="ep-section">
            {(cv.projects ?? []).map((pr, i) => (
              <div key={i} className="ep-card">
                <div className="ep-card-title">
                  {pr.name || 'Projet ' + (i+1)}
                  <button className="ep-del" onClick={() => onChange({ ...cv, projects: (cv.projects??[]).filter((_,j) => j!==i) })}>✕</button>
                </div>
                <div className="ep-row2">
                  {([['name','Nom'],['link','Lien démo'],['github','GitHub']] as [string,string][]).map(([k,l]) => (
                    <label key={k} className="ep-field"><span className="ep-label">{l}</span>
                      <input className="ep-input" value={(pr as any)[k]||''}
                        onChange={e => onChange({ ...cv, projects: (cv.projects??[]).map((x,j) => j===i?{...x,[k]:e.target.value}:x) })} />
                    </label>
                  ))}
                </div>
                <label className="ep-field"><span className="ep-label">Description</span>
                  <textarea className="ep-textarea" rows={2} value={pr.desc}
                    onChange={e => onChange({ ...cv, projects: (cv.projects??[]).map((x,j) => j===i?{...x,desc:e.target.value}:x) })} />
                </label>
                <label className="ep-field"><span className="ep-label">Impact / Résultat</span>
                  <input className="ep-input" value={pr.impact}
                    onChange={e => onChange({ ...cv, projects: (cv.projects??[]).map((x,j) => j===i?{...x,impact:e.target.value}:x) })} />
                </label>
                <label className="ep-field"><span className="ep-label">Technologies (virgules)</span>
                  <TagsInput value={pr.techs ?? []}
                    onChange={techs => onChange({ ...cv, projects: (cv.projects??[]).map((x,j) => j===i?{...x,techs}:x) })} />
                </label>
              </div>
            ))}
            <button className="ep-add-btn" onClick={() => onChange({ ...cv, projects: [...(cv.projects??[]), { name:'', desc:'', impact:'', techs:[], link:'', github:'' }] })}>
              + Ajouter un projet
            </button>
          </div>
        )}

        {/* ── AUTRES ──────────────────────────────────────────── */}
        {tab === 'other' && (
          <div className="ep-section">
            <div className="ep-field">
              <span className="ep-label">Langues (une par ligne: Français — Natif)</span>
              <textarea className="ep-textarea" rows={3}
                value={(cv.languages??[]).map(l => `${l.lang} — ${l.level}`).join('\n')}
                onChange={e => onChange({ ...cv, languages: e.target.value.split('\n').filter(Boolean).map(l => {
                  const [lang, ...rest] = l.split('—');
                  return { lang: lang.trim(), level: rest.join('—').trim() };
                }) })} />
            </div>
            <div className="ep-field">
              <span className="ep-label">Centres d&apos;intérêt (un par ligne)</span>
              <textarea className="ep-textarea" rows={3}
                value={(cv.interests??[]).join('\n')}
                onChange={e => onChange({ ...cv, interests: e.target.value.split('\n').filter(Boolean) })} />
            </div>
            {(cv.awards?.length ?? 0) > 0 && (
              <div className="ep-field">
                <span className="ep-label">Distinctions</span>
                {(cv.awards??[]).map((a,i) => (
                  <div key={i} style={{display:'flex',gap:4,marginBottom:4}}>
                    <input className="ep-input" value={a.name} placeholder="Nom"
                      onChange={e => onChange({ ...cv, awards: (cv.awards??[]).map((x,j) => j===i?{...x,name:e.target.value}:x) })} />
                    <input className="ep-input" value={a.org} placeholder="Org"
                      onChange={e => onChange({ ...cv, awards: (cv.awards??[]).map((x,j) => j===i?{...x,org:e.target.value}:x) })} />
                    <input className="ep-input" value={a.year} placeholder="Année" style={{width:70}}
                      onChange={e => onChange({ ...cv, awards: (cv.awards??[]).map((x,j) => j===i?{...x,year:e.target.value}:x) })} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default function CVGeneratorPro({ onGoHome }: { onGoHome?: () => void }) {
  // State
  const [step,        setStep]        = useState<'form' | 'preview'>('form');
  const [intake,      setIntake]      = useState<IntakeData>(emptyIntake());
  const [cv,          setCv]          = useState<GeneratedCV | null>(null);
  const [template,    setTemplate]    = useState<TemplateId>('cascade');
  const [design,      setDesign]      = useState<DesignConfig>(DEFAULT_DESIGN);
  const [showDesign,  setShowDesign]  = useState(false);
  const [showImport,  setShowImport]  = useState(false);
  const [activeTab,   setActiveTab]   = useState<'identity'|'experience'|'education'|'skills'|'projects'>('identity');
  const [popup,       setPopup]       = useState<PopupState>({ open: false, type: 'info', title: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const showPopup = useCallback((p: Omit<PopupState, 'open'>) =>
    setPopup({ ...p, open: true }), []);

  const closePopup = useCallback(() =>
    setPopup(p => ({ ...p, open: false })), []);

  const upI = (k: keyof IntakeData, v: string) => setIntake(p => ({ ...p, [k]: v }));

  // ── Photo upload ─────────────────────────────────────────────
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      setIntake(p => ({ ...p, photo: url }));
      showPopup({ type: 'success', title: '📸 Photo chargée', message: 'Votre photo sera intégrée dans le CV. Utilisez une photo professionnelle, fond uni.' });
    };
    reader.readAsDataURL(f);
  };

  // ── Generate ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!intake.name.trim()) {
      showPopup({ type: 'warning', title: '⚠️ Nom requis', message: 'Veuillez renseigner votre nom complet avant de générer le CV.' });
      return;
    }
    if (!intake.rawExps.trim() && !intake.importedContent) {
      showPopup({ type: 'warning', title: '⚠️ Expériences manquantes', message: 'Ajoutez au moins une expérience professionnelle ou importez un CV existant.' });
      return;
    }

    showPopup({ type: 'loading', title: '🤖 Génération IA en cours…', message: 'L\'IA rédige votre CV avec du contenu réel et percutant. Environ 15-30 secondes…', loading: true });

    try {
      const generated = await generateCV(intake);
      setCv(generated);
      setStep('preview');
      closePopup();
      setTimeout(() => {
        showPopup({ type: 'success', title: '✅ CV généré avec succès !', message: `CV de ${generated.experience?.length || 0} expérience(s) et ${generated.skills?.length || 0} catégorie(s) de compétences. Choisissez un template et personnalisez le design.` });
      }, 300);
    } catch (e: any) {
      showPopup({ type: 'error', title: '❌ Erreur de génération', message: e.message || 'Vérifiez votre clé OpenAI dans le fichier .env (VITE_OPENAI_API_KEY).' });
    }
  };

  // ── Regenerate ───────────────────────────────────────────────
  const handleRegenerate = async () => {
    showPopup({ type: 'loading', title: '🔄 Régénération…', message: 'Nouvelle version de votre CV en cours de rédaction…', loading: true });
    try {
      const generated = await generateCV(intake);
      setCv(generated);
      closePopup();
      showPopup({ type: 'success', title: '✅ CV régénéré !', message: 'Une nouvelle version a été créée. Le contenu est différent — choisissez la meilleure version.' });
    } catch (e: any) {
      showPopup({ type: 'error', title: '❌ Erreur', message: e.message });
    }
  };

  // ── AI Verify before export ──────────────────────────────────
  const handleVerifyAndExport = async () => {
    if (!cv) return;
    showPopup({ type: 'loading', title: '🔍 Vérification IA…', message: 'L\'IA analyse la qualité, l\'impact et l\'optimisation ATS de votre CV…', loading: true });
    try {
      const result = await verifyCV(cv, intake.lang);
      closePopup();
      setTimeout(() => {
        showPopup({
          type: 'verify',
          title: `🔍 Résultat de la vérification IA — ${result.grade}`,
          score: result.score,
          details: result,
          confirmLabel: '🖨 Exporter quand même',
          cancelLabel: '🔄 Régénérer',
          onConfirm: () => { closePopup(); setTimeout(doExport, 200); },
          onCancel:  () => { closePopup(); setTimeout(handleRegenerate, 200); },
        });
      }, 300);
    } catch (e: any) {
      closePopup();
      showPopup({ type: 'error', title: '❌ Vérification impossible', message: e.message,
        confirmLabel: 'Exporter quand même', onConfirm: () => { closePopup(); doExport(); } });
    }
  };

  // ── Export ───────────────────────────────────────────────────
  const doExport = useCallback(() => {
    if (!cv) return;
    const html = renderTemplate(cv, template, design, intake.lang);
    const w = window.open('', '_blank');
    if (!w) {
      showPopup({ type: 'warning', title: '⚠️ Popup bloqué', message: 'Autorisez les popups pour ce site dans les paramètres de votre navigateur, puis réessayez.' });
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.print();
      showPopup({ type: 'info', title: '🖨 Impression ouverte', message: 'Utilisez Ctrl+P ou ⌘+P pour imprimer. Choisissez "Enregistrer en PDF" pour obtenir un fichier PDF.' });
    }, 700);
  }, [cv, template, design, intake.lang]);

  const doDownload = useCallback(() => {
    if (!cv) return;
    const html = renderTemplate(cv, template, design, intake.lang);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CV_${cv.personal.name.replace(/\s+/g,'_')}_${template}.html`;
    a.click();
    showPopup({ type: 'success', title: '✅ CV téléchargé', message: 'Ouvrez le fichier .html dans votre navigateur, puis imprimez en PDF avec Ctrl+P.' });
  }, [cv, template, design, intake.lang]);

  // ── Import callback ──────────────────────────────────────────
  const handleImported = (content: string, photo?: string) => {
    setIntake(p => ({ ...p, importedContent: content, photo: photo || p.photo }));
    setShowImport(false);
    showPopup({ type: 'success', title: '✅ CV importé !', message: 'Le contenu a été extrait. Complétez les informations manquantes puis cliquez sur Générer.' });
  };

  const getHTML = () => cv ? renderTemplate(cv, template, design, intake.lang) : '';

  // ══════════════════════════════════════════════════════════════
  //  RENDER FORM
  // ══════════════════════════════════════════════════════════════
  const renderForm = () => (
    <div className="gp-form-wrap">
      <div className="gp-form-header">
        <h2>⚡ CV Generator Pro</h2>
        <p className="gp-form-subtitle">Remplissez les informations clés — l'IA rédige un CV complet et professionnel.</p>
      </div>

      {/* Import ancien CV */}
      {!showImport ? (
        <div className="gp-import-banner" onClick={() => setShowImport(true)}>
          <span className="gp-import-icon">📄</span>
          <div>
            <div className="gp-import-title">Vous avez déjà un CV ?</div>
            <div className="gp-import-sub">Importez-le et l'IA l'améliorera automatiquement</div>
          </div>
          <span className="gp-import-arrow">→</span>
        </div>
      ) : (
        <ImportCVPanel onExtracted={handleImported} />
      )}

      {/* Tabs */}
      <div className="gp-tabs">
        {([
          { id:'identity',   label:'👤 Identité' },
          { id:'experience', label:'💼 Expériences' },
          { id:'education',  label:'🎓 Formation' },
          { id:'skills',     label:'⚡ Compétences' },
          { id:'projects',   label:'🚀 Projets' },
        ] as const).map(tab => (
          <button key={tab.id}
            className={`gp-tab${activeTab === tab.id ? ' gp-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="gp-tab-content">

        {activeTab === 'identity' && (
          <div className="gp-section">
            <div className="gp-grid-2">
              <Inp label="Nom complet *" value={intake.name} onChange={v => upI('name', v)} placeholder="Martin Huet" />
              <Inp label="Titre / Poste actuel *" value={intake.title} onChange={v => upI('title', v)} placeholder="Graphiste · Software Engineer" />
              <Inp label="Email" value={intake.email} onChange={v => upI('email', v)} placeholder="martin@gmail.com" />
              <Inp label="Téléphone" value={intake.phone} onChange={v => upI('phone', v)} placeholder="+33 6 78 90 12 34" />
              <Inp label="Ville" value={intake.city} onChange={v => upI('city', v)} placeholder="Paris" />
              <Inp label="LinkedIn" value={intake.linkedin} onChange={v => upI('linkedin', v)} placeholder="linkedin.com/in/martinhuet" />
              <Inp label="GitHub / Portfolio" value={intake.github} onChange={v => upI('github', v)} placeholder="github.com/martin" />
              <div className="gp-field">
                <span className="gp-field-label">📸 Photo de profil</span>
                <button className={`gp-photo-btn${intake.photo ? ' gp-photo-loaded' : ''}`}
                  onClick={() => fileRef.current?.click()}>
                  {intake.photo ? '✅ Photo chargée · Cliquer pour changer' : '📸 Importer une photo (JPG · PNG · max 5 Mo)'}
                </button>
                {intake.photo && <img src={intake.photo} className="gp-photo-preview" alt="preview" />}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
              </div>
            </div>

            <div className="gp-grid-2 gp-mt">
             {/* <Sel label="🎯 Poste visé / Rôle cible" value={intake.targetRole}
                onChange={v => upI('targetRole', v)}
                options={[
                  { v:'', l:'-- Tapez ci-dessous --' },
                  { v:'Software Engineer L5 @ Google',  l:'SWE L5 @ Google' },
                  { v:'ML Engineer @ OpenAI',            l:'ML Engineer @ OpenAI' },
                  { v:'Senior SWE @ Amazon',             l:'Senior SWE @ Amazon' },
                  { v:'Research Scientist @ MIT',        l:'Research Scientist @ MIT' },
                  { v:'Postdoc @ Stanford',              l:'Postdoc @ Stanford' },
                  { v:'Data Scientist Senior',           l:'Data Scientist Senior' },
                  { v:'Graphiste Senior',                l:'Graphiste Senior' },
                  { v:'Product Manager',                 l:'Product Manager' },
                ]} />
              <Inp label="Poste visé (libre)" value={intake.targetRole} onChange={v => upI('targetRole', v)}
                placeholder="Ex: Senior Software Engineer @ OpenAI" />     */}
              <label className="gp-field">
                <span className="gp-field-label">🎯 Poste visé / Rôle cible</span>
                <input
                  className="gp-input"
                  list="targetRole-suggestions"
                  value={intake.targetRole}
                  onChange={e => upI('targetRole', e.target.value)}
                  placeholder="Tapez ou sélectionnez un poste…"
                />
                <datalist id="targetRole-suggestions">
                  <option value="Software Engineer L5 @ Google" />
                  <option value="ML Engineer @ OpenAI" />
                  <option value="Senior SWE @ Amazon" />
                  <option value="Research Scientist @ MIT" />
                  <option value="Postdoc @ Stanford" />
                  <option value="Data Scientist Senior" />
                  <option value="Data Analyst" />
                  <option value="Graphiste Senior" />
                  <option value="Product Manager" />
                  <option value="DevOps Engineer" />
                  <option value="Fullstack Developer" />
                  <option value="Ingénieur en imagerie médicale" />
                  <option value="Technicien de santé" />
                  <option value="Chef de projet digital" />
                  <option value="Consultant Business Intelligence" />
                </datalist>
              </label>
              <Sel label="Style CV" value={intake.style} onChange={v => upI('style', v as any)} options={[
                { v:'french', l:'🇫🇷 Français — complet avec photo' },
                { v:'american', l:'🇺🇸 Américain — concis, impact-first' },
              ]} />
              <Sel label="Langue du CV" value={intake.lang} onChange={v => upI('lang', v as any)} options={[
                { v:'fr', l:'🇫🇷 Français' },
                { v:'en', l:'🇬🇧 English' },
              ]} />
            </div>

            <Sel label="Réalisation / Impact clé" value={intake.keyAchievement} onChange={v => upI('keyAchievement', v)}
              options={[{ v:'', l:'Entrez ci-dessous' }]} />
            <TA label="" value={intake.keyAchievement} onChange={v => upI('keyAchievement', v)} rows={2}
              placeholder="Portfolio de 30 entreprises clientes. Réduction des délais de 25%. Charte graphique complète de 5 marques." />

            {intake.importedContent && (
              <div className="gp-import-note">
                ✅ CV importé ({intake.importedContent.split('\n').length} lignes) chargé.
                {intake.updateInstructions ? '' : ' Ajoutez vos mises à jour ci-dessous.'}
                <TA label="Instructions de mise à jour" value={intake.updateInstructions || ''}
                  onChange={v => setIntake(p => ({ ...p, updateInstructions: v }))} rows={3}
                  placeholder="Ajouter mon nouveau poste chez Google depuis jan 2024. Mettre à jour les compétences. Améliorer les métriques." />
              </div>
            )}
          </div>
        )}

        {activeTab === 'experience' && (
          <div className="gp-section">
            <TA label="Expériences professionnelles *"
              value={intake.rawExps} onChange={v => upI('rawExps', v)} rows={7}
              hint="Format: Rôle | Entreprise | Ville | Dates (une ligne par poste)"
              placeholder={"Graphiste marketeur | BuyMe | Toulouse | 04/2020–présent\nGraphiste | GG Design | Toulouse | 09/2018–03/2020\nGraphiste junior | Veni vidi vici | Toulouse | 08/2017–08/2018"} />
            <div className="gp-examples">
              <div className="gp-examples-title">Exemples FAANG :</div>
              <div className="gp-example-chips">
                {[
                  'Senior SWE | Google | Mountain View | 2021–présent',
                  'ML Engineer | OpenAI | San Francisco | 2022–2024',
                  'SWE II | Amazon | Seattle | 2019–2022',
                  'Postdoc | MIT CSAIL | Cambridge | 2020–2023',
                ].map(ex => (
                  <button key={ex} className="gp-example-chip"
                    onClick={() => upI('rawExps', intake.rawExps ? intake.rawExps + '\n' + ex : ex)}>
                    + {ex.split('|')[0].trim()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'education' && (
          <div className="gp-section">
            <TA label="Formation"
              value={intake.rawEdu} onChange={v => upI('rawEdu', v)} rows={5}
              hint="Format: Diplôme | École | Ville | Années"
              placeholder={"Master Informatique | Polytechnique | Paris | 2018–2020\nLicence Mathématiques-Informatique | Paris VI | Paris | 2015–2018\nBTS Design graphique | LISAA | Toulouse | 2015–2017"} />
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="gp-section">
            <TA label="Compétences, outils, technologies"
              value={intake.rawSkills} onChange={v => upI('rawSkills', v)} rows={4}
              hint="Séparez par virgule — L'IA regroupera automatiquement par catégories"
              placeholder="Python, JavaScript, React, Node.js, AWS, Docker, Kubernetes, PostgreSQL, Git, Figma, InDesign, Illustrator, Photoshop" />
            <Sel label="Années d'expérience" value={intake.yearsExp} onChange={v => upI('yearsExp', v)} options={[
              { v:'0-1', l:'0-1 an (Junior)' },
              { v:'2-3', l:'2-3 ans' },
              { v:'4-5', l:'4-5 ans' },
              { v:'6-8', l:'6-8 ans (Senior)' },
              { v:'9-12', l:'9-12 ans (Lead)' },
              { v:'12+', l:'12+ ans (Principal/CTO)' },
            ]} />
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="gp-section">
            <TA label="Projets réalisés"
              value={intake.rawProjects} onChange={v => upI('rawProjects', v)} rows={8}
              hint="Format: Nom | Description | Lien démo | GitHub | Technologies (un projet par ligne)"
              placeholder={"AI Code Reviewer | Outil d'analyse de code en temps réel avec GPT-4 | https://aireviewer.dev | https://github.com/martin/ai-reviewer | Python, FastAPI, React\nPortfolio E-commerce | Refonte complète UX/UI d'une boutique en ligne | https://shop.buyMe.fr | | Shopify, Figma, CSS\nDataViz Dashboard | Tableau de bord analytique temps réel | | https://github.com/martin/dashboard | D3.js, React, PostgreSQL"} />
            <div className="gp-info-box">
              💡 Les liens seront cliquables dans le CV final. Ajoutez vos meilleures réalisations avec des résultats mesurables.
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <button className="gp-generate-btn" onClick={handleGenerate}>
        ⚡ Générer mon CV professionnel avec l'IA
      </button>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  RENDER PREVIEW
  // ══════════════════════════════════════════════════════════════
  const renderPreview = () => (
    <div className="gp-preview-layout">
      {/* Template bar */}
      <div className="gp-template-bar">
        <span className="gp-tbar-label">Template :</span>
        <div className="gp-tpl-scroll">
          {TEMPLATE_META.map(t => (
            <button key={t.id}
              className={`gp-tpl-btn${template === t.id ? ' gp-tpl-active' : ''}`}
              style={{ '--tc': t.primaryColor } as React.CSSProperties}
              onClick={() => setTemplate(t.id)}
              title={t.desc}>
              <span className="gp-tpl-stripe" style={{ background: t.primaryColor }} />
              {t.emoji} {t.name}
              <span className="gp-tpl-badge" style={{ background: t.primaryColor }}>{t.badge}</span>
            </button>
          ))}
        </div>
        <div className="gp-tbar-right">
          <span className="gp-tbar-label">Langue :</span>
          <button className={`gp-lang-btn${intake.lang === 'fr' ? ' gp-lang-active' : ''}`}
            onClick={() => setIntake(p => ({ ...p, lang: 'fr' }))}>🇫🇷 FR</button>
          <button className={`gp-lang-btn${intake.lang === 'en' ? ' gp-lang-active' : ''}`}
            onClick={() => setIntake(p => ({ ...p, lang: 'en' }))}>🇬🇧 EN</button>
        </div>
      </div>

      {/* Actions + Design */}
      <div className="gp-actions-bar">
        <div className="gp-actions-left">
          <button className="gp-action-btn" onClick={() => setStep('form')}>✏️ Modifier</button>
          <button className="gp-action-btn" onClick={handleRegenerate}>🔄 Régénérer</button>
          <button className={`gp-action-btn${showDesign ? ' gp-action-active' : ''}`}
            onClick={() => setShowDesign(s => !s)}>🎨 Design</button>
        </div>
        <div className="gp-actions-right">
          <button className="gp-action-btn" onClick={doDownload}>⬇️ Télécharger .html</button>
          <button className="gp-btn-verify" onClick={handleVerifyAndExport}>
            🔍 Vérifier & Exporter PDF
          </button>
        </div>
      </div>

      {/* Design panel */}
      {showDesign && (
        <div className="gp-design-overlay">
          <DesignPanelFull design={design} onChange={setDesign} />
          <button className="gp-design-close" onClick={() => setShowDesign(false)}>✓ Appliquer</button>
        </div>
      )}

      {/* Split: edit panel + iframe real template */}
      <div className="gp-split-area">

        {/* LEFT — Edit panel */}
        <div className="gp-edit-panel">
          <CVEditPanel cv={cv!} onChange={setCv} lang={intake.lang} design={design} onDesignChange={setDesign} />
        </div>

        {/* RIGHT — Real template preview */}
        <div className="gp-iframe-area">
          <div className="gp-iframe-hint no-print">
            ✏️ Éditez à gauche — le rendu réel du template s'actualise ici
          </div>
          <div className="gp-iframe-wrap">
            <iframe
              key={`${template}-${JSON.stringify(design)}-${intake.lang}-${JSON.stringify(cv?.personal)}`}
              srcDoc={getHTML()}
              className="gp-iframe"
              title="CV Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>

      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="gp-root">
      {/* Global header */}
      <header className="gp-header">
        <div className="gp-header-left">
          {onGoHome && <button className="gp-nav-btn" onClick={onGoHome}>🏠</button>}
          <div className="gp-logo">⚡ CV Generator Pro</div>
          <div className="gp-logo-sub">IA · 8 Templates · Vérification qualité</div>
          <button
            onClick={() => window.location.href = '/latex-cv-editor'}
            style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', border: '1px solid rgba(99,102,241,.4)',
              background: 'rgba(99,102,241,.1)', color: '#a5b4fc',
              whiteSpace: 'nowrap',
            }}
          >
            ⚗️ Éditeur LaTeX
          </button>
        </div>
        {cv && step === 'preview' && (
          <div className="gp-header-right">
            <div className="gp-cv-name">{cv.personal.name} · {TEMPLATE_META.find(t => t.id === template)?.name}</div>
          </div>
        )}
        {step === 'form' && (
          <div className="gp-header-right">
            <div className="gp-step-indicator">
              <span className="gp-step gp-step-active">① Informations</span>
              <span className="gp-step">② Génération IA</span>
              <span className="gp-step">③ Export PDF</span>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="gp-content">
        {step === 'form'    && renderForm()}
        {step === 'preview' && renderPreview()}
      </div>

      {/* Popup system */}
      <Popup state={popup} onClose={closePopup} />

      {/* ═══════════════════════════════════════════════════════
          GLOBAL CSS
          ═══════════════════════════════════════════════════════ */}
      <style>{`
        /* ── Root & layout ─────────────────────────────────── */
        .gp-root {
          display:flex; flex-direction:column; height:100vh;
          background:#0d1117; color:#e6edf3;
          font-family:'Inter','Segoe UI',system-ui,sans-serif; font-size:13px;
        }

        /* ── Header ─────────────────────────────────────────── */
        .gp-header {
          display:flex; align-items:center; justify-content:space-between;
          padding:10px 18px; background:#161b22; border-bottom:1px solid #30363d; flex-shrink:0;
        }
        .gp-header-left { display:flex; align-items:center; gap:10px; }
        .gp-nav-btn {
          width:32px; height:32px; background:none; border:1px solid #30363d;
          border-radius:7px; color:#8b949e; cursor:pointer; font-size:15px;
          display:flex; align-items:center; justify-content:center; transition:all .15s;
        }
        .gp-nav-btn:hover { border-color:#6366f1; color:#e6edf3; }
        .gp-logo { font-size:16px; font-weight:800; color:#6366f1; }
        .gp-logo-sub { font-size:10px; color:#8b949e; }
        .gp-header-right { display:flex; align-items:center; gap:12px; }
        .gp-cv-name { font-size:12px; color:#8b949e; font-weight:600; }
        .gp-step-indicator { display:flex; gap:6px; }
        .gp-step { font-size:11px; color:#30363d; font-weight:600; }
        .gp-step-active { color:#6366f1 !important; }

        /* ── Content ─────────────────────────────────────────── */
        .gp-content { flex:1; overflow:hidden; display:flex; flex-direction:column; }

        /* ── Form ─────────────────────────────────────────────── */
        .gp-form-wrap { flex:1; overflow-y:auto; padding:24px; max-width:900px; margin:0 auto; width:100%; }
        .gp-form-header { margin-bottom:20px; }
        .gp-form-header h2 { font-size:22px; font-weight:900; margin-bottom:5px; }
        .gp-form-subtitle { color:#8b949e; font-size:13px; }

        /* Import banner */
        .gp-import-banner {
          display:flex; align-items:center; gap:12px; padding:14px 18px;
          background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.3);
          border-radius:10px; cursor:pointer; margin-bottom:16px; transition:all .15s;
        }
        .gp-import-banner:hover { background:rgba(99,102,241,.14); border-color:#6366f1; }
        .gp-import-icon { font-size:24px; flex-shrink:0; }
        .gp-import-title { font-size:13px; font-weight:700; color:#a5b4fc; }
        .gp-import-sub { font-size:11px; color:#8b949e; margin-top:2px; }
        .gp-import-arrow { margin-left:auto; color:#6366f1; font-size:16px; }

        /* Tabs */
        .gp-tabs { display:flex; gap:4px; margin-bottom:16px; border-bottom:1px solid #30363d; padding-bottom:0; flex-wrap:wrap; }
        .gp-tab {
          padding:8px 16px; background:none; border:none; border-bottom:2px solid transparent;
          color:#8b949e; font-size:12.5px; font-weight:600; cursor:pointer;
          transition:all .15s; margin-bottom:-1px;
        }
        .gp-tab:hover { color:#e6edf3; }
        .gp-tab-active { color:#6366f1 !important; border-bottom-color:#6366f1 !important; }

        /* Tab content */
        .gp-tab-content { }
        .gp-section { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:18px 20px; margin-bottom:16px; }
        .gp-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gp-mt { margin-top:14px; }

        /* Fields */
        .gp-field { display:flex; flex-direction:column; gap:4px; }
        .gp-field-label { font-size:11px; font-weight:600; color:#8b949e; }
        .gp-hint { font-size:10px; color:#8b949e; line-height:1.5; }
        .gp-hint-top { margin-bottom:3px; }
        .gp-input, .gp-select, .gp-textarea {
          background:#21262d; border:1px solid #30363d; border-radius:7px;
          color:#e6edf3; font-size:12px; padding:8px 10px;
          font-family:inherit; transition:border-color .15s; width:100%;
        }
        .gp-input:focus, .gp-select:focus, .gp-textarea:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.12); }
        .gp-select { height:36px; }
        .gp-textarea { resize:vertical; min-height:70px; }
        .gp-photo-btn {
          background:#21262d; border:1px dashed #30363d; border-radius:7px;
          color:#8b949e; padding:9px 12px; cursor:pointer; font-size:11px;
          text-align:left; transition:all .15s; width:100%;
        }
        .gp-photo-btn:hover { border-color:#6366f1; color:#a5b4fc; }
        .gp-photo-loaded { border-color:#22c55e; color:#4ade80; }
        .gp-photo-preview { width:60px; height:60px; border-radius:8px; object-fit:cover; margin-top:6px; border:2px solid #30363d; }

        /* Examples */
        .gp-examples { margin-top:12px; }
        .gp-examples-title { font-size:11px; color:#8b949e; margin-bottom:6px; }
        .gp-example-chips { display:flex; flex-wrap:wrap; gap:6px; }
        .gp-example-chip {
          padding:3px 10px; background:#21262d; border:1px solid #30363d;
          border-radius:999px; font-size:11px; color:#8b949e; cursor:pointer;
          transition:all .1s;
        }
        .gp-example-chip:hover { border-color:#6366f1; color:#a5b4fc; }

        /* Info box */
        .gp-info-box {
          background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.25);
          border-radius:8px; padding:10px 14px; font-size:12px; color:#a5b4fc;
          margin-top:10px;
        }

        /* Import note */
        .gp-import-note {
          background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.25);
          border-radius:8px; padding:10px 14px; font-size:12px; color:#4ade80;
          margin-top:12px;
        }

        /* Generate button */
        .gp-generate-btn {
          width:100%; padding:15px; margin-top:8px;
          background:linear-gradient(135deg,#6366f1,#8b5cf6);
          border:none; border-radius:12px; color:#fff;
          font-size:15px; font-weight:800; cursor:pointer; transition:all .2s;
        }
        .gp-generate-btn:hover { transform:translateY(-2px); box-shadow:0 8px 28px rgba(99,102,241,.4); }

        /* ── Preview layout ──────────────────────────────────── */
        .gp-preview-layout { flex:1; display:flex; flex-direction:column; overflow:hidden; position:relative; }

        /* Template bar */
        .gp-template-bar {
          display:flex; align-items:center; gap:8px; padding:8px 14px;
          background:#161b22; border-bottom:1px solid #30363d; flex-shrink:0;
        }
        .gp-tbar-label { font-size:11px; font-weight:600; color:#8b949e; white-space:nowrap; }
        .gp-tpl-scroll { display:flex; gap:6px; overflow-x:auto; flex:1; padding-bottom:2px; }
        .gp-tpl-scroll::-webkit-scrollbar { height:3px; }
        .gp-tpl-scroll::-webkit-scrollbar-thumb { background:#30363d; border-radius:999px; }
        .gp-tpl-btn {
          display:flex; align-items:center; gap:6px; position:relative;
          padding:5px 12px; border-radius:8px; font-size:11.5px; font-weight:600;
          cursor:pointer; border:1px solid #30363d; background:#21262d;
          color:#8b949e; transition:all .15s; white-space:nowrap; flex-shrink:0; overflow:hidden;
        }
        .gp-tpl-btn:hover { border-color:var(--tc,#6366f1); color:#e6edf3; }
        .gp-tpl-active { border-color:var(--tc,#6366f1) !important; color:#e6edf3 !important; background:rgba(99,102,241,.1) !important; }
        .gp-tpl-stripe { width:3px; height:16px; border-radius:999px; flex-shrink:0; }
        .gp-tpl-badge {
          font-size:8.5px; font-weight:800; color:#fff; padding:1px 6px;
          border-radius:999px; text-transform:uppercase; flex-shrink:0;
        }
        .gp-tbar-right { display:flex; align-items:center; gap:5px; margin-left:auto; }
        .gp-lang-btn {
          padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600;
          cursor:pointer; border:1px solid #30363d; background:#21262d; color:#8b949e; transition:all .15s;
        }
        .gp-lang-btn:hover { border-color:#6366f1; }
        .gp-lang-active { border-color:#6366f1 !important; color:#a5b4fc !important; background:rgba(99,102,241,.1) !important; }

        /* Actions bar */
        .gp-actions-bar {
          display:flex; align-items:center; justify-content:space-between;
          padding:7px 14px; background:#161b22; border-bottom:1px solid #30363d; flex-shrink:0; gap:8px; flex-wrap:wrap;
        }
        .gp-actions-left, .gp-actions-right { display:flex; gap:6px; align-items:center; }
        .gp-action-btn {
          padding:6px 13px; border-radius:7px; font-size:12px; font-weight:600; cursor:pointer;
          border:1px solid #30363d; background:#21262d; color:#8b949e; transition:all .15s;
        }
        .gp-action-btn:hover { border-color:#6366f1; color:#e6edf3; }
        .gp-action-active { border-color:#8b5cf6 !important; color:#c084fc !important; background:rgba(139,92,246,.1) !important; }
        .gp-btn-verify {
          padding:7px 16px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;
          background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; color:#fff;
          box-shadow:0 2px 8px rgba(99,102,241,.35); transition:all .15s;
        }
        .gp-btn-verify:hover { transform:translateY(-1px); box-shadow:0 4px 16px rgba(99,102,241,.45); }

        /* Design panel */
        .gp-design-overlay {
          position:absolute; top:96px; right:14px; z-index:200;
          background:#161b22; border:1px solid #30363d; border-radius:14px;
          padding:16px; width:320px; max-height:70vh; overflow-y:auto;
          box-shadow:0 16px 48px rgba(0,0,0,.6);
          animation:slideInRight .2s ease;
        }
        @keyframes slideInRight { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:none} }
        .gp-design-close {
          width:100%; margin-top:12px; padding:8px; background:#6366f1; border:none;
          border-radius:8px; color:#fff; font-weight:700; cursor:pointer; font-size:13px;
        }

        /* Preview area */
        /* Split layout */
        .gp-split-area { flex:1; display:grid; grid-template-columns:380px 1fr; overflow:hidden; }
        .gp-edit-panel { overflow-y:auto; background:#161b22; border-right:1px solid #30363d; }
        .gp-iframe-area { display:flex; flex-direction:column; overflow:auto; background:#2a2d3e; }
        .gp-iframe-hint { font-size:11px; color:#8b949e; padding:8px 16px; background:#161b22; border-bottom:1px solid #30363d; text-align:center; flex-shrink:0; }
        .gp-iframe-wrap { padding:20px; display:flex; justify-content:center; flex:1; }
        .gp-iframe { width:794px; min-height:1100px; border:none; background:#fff; box-shadow:0 8px 40px rgba(0,0,0,.6); flex-shrink:0; }

        /* Edit panel */
        .ep-root { height:100%; display:flex; flex-direction:column; }
        .ep-header { padding:12px 16px; font-size:13px; font-weight:700; border-bottom:1px solid #30363d; flex-shrink:0; }
        .ep-tabs { display:flex; flex-wrap:wrap; border-bottom:1px solid #30363d; flex-shrink:0; }
        .ep-tab { padding:7px 10px; background:none; border:none; border-bottom:2px solid transparent; color:#8b949e; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; }
        .ep-tab:hover { color:#e6edf3; }
        .ep-tab-active { color:#6366f1 !important; border-bottom-color:#6366f1 !important; }
        .ep-body { flex:1; overflow-y:auto; padding:14px; }
        .ep-section { display:flex; flex-direction:column; gap:10px; }
        .ep-card { background:#21262d; border:1px solid #30363d; border-radius:8px; padding:12px; }
        .ep-card-title { font-size:12px; font-weight:700; color:#e6edf3; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; }
        .ep-del { background:none; border:none; color:#ef4444; cursor:pointer; font-size:13px; padding:2px 5px; border-radius:3px; }
        .ep-del:hover { background:rgba(239,68,68,.1); }
        .ep-row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
        .ep-field { display:flex; flex-direction:column; gap:3px; }
        .ep-label { font-size:10px; font-weight:600; color:#8b949e; }
        .ep-input { background:#161b22; border:1px solid #30363d; border-radius:5px; color:#e6edf3; font-size:11.5px; padding:6px 8px; width:100%; transition:border-color .12s; }
        .ep-input:focus { outline:none; border-color:#6366f1; }
        .ep-textarea { background:#161b22; border:1px solid #30363d; border-radius:5px; color:#e6edf3; font-size:11.5px; padding:6px 8px; width:100%; resize:vertical; font-family:inherit; }
        .ep-textarea:focus { outline:none; border-color:#6366f1; }
        .ep-add-btn { width:100%; padding:8px; background:rgba(99,102,241,.1); border:1px dashed rgba(99,102,241,.4); border-radius:7px; color:#a5b4fc; font-size:12px; cursor:pointer; transition:all .15s; }
        .ep-add-btn:hover { background:rgba(99,102,241,.2); border-color:#6366f1; }

        /* PhotoCropWidget */
        .pcw-root { background:#21262d; border:1px solid #30363d; border-radius:8px; padding:12px; }
        .pcw-title { font-size:11px; font-weight:700; color:#e6edf3; margin-bottom:3px; }
        .pcw-hint { font-size:10px; color:#8b949e; margin-bottom:10px; }
        .pcw-frame-wrap { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        .pcw-frame { overflow:hidden; flex-shrink:0; border:2px solid #6366f1; position:relative; user-select:none; touch-action:none; }
        .pcw-img { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
        .pcw-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:24px; color:#8b949e; background:#30363d; }
        .pcw-coords { font-size:10px; color:#8b949e; font-family:monospace; }
        .pcw-reset { background:none; border:1px solid #30363d; border-radius:5px; color:#8b949e; font-size:10px; padding:3px 8px; cursor:pointer; display:block; margin-top:4px; }
        .pcw-reset:hover { border-color:#6366f1; color:#a5b4fc; }
        .pcw-change { width:100%; padding:7px; background:rgba(99,102,241,.1); border:1px dashed rgba(99,102,241,.4); border-radius:6px; color:#a5b4fc; font-size:11px; cursor:pointer; }
        .pcw-change:hover { background:rgba(99,102,241,.2); }

        /* ── Design panel components ─────────────────────────── */
        .dp-root { }
        .dp-title { font-size:13px; font-weight:800; margin-bottom:14px; }
        .dp-section { margin-bottom:14px; }
        .dp-label { font-size:11px; font-weight:600; color:#8b949e; margin-bottom:6px; display:block; }
        .dp-color-presets { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px; }
        .dp-preset { display:flex; flex-direction:column; align-items:center; gap:3px; padding:4px 6px; border-radius:7px; border:1px solid #30363d; background:#21262d; cursor:pointer; font-size:9px; color:#8b949e; transition:all .1s; }
        .dp-preset:hover, .dp-preset-active { border-color:#6366f1; color:#e6edf3; }
        .dp-preset-swatch { width:18px; height:10px; border-radius:2px; }
        .dp-custom-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .dp-color-input { width:40px; height:28px; border:none; border-radius:5px; cursor:pointer; padding:0; }
        .dp-select { background:#21262d; border:1px solid #30363d; border-radius:7px; color:#e6edf3; font-size:12px; padding:7px 10px; width:100%; }
        .dp-btn-group { display:flex; gap:5px; }
        .dp-spacing-btn { padding:5px 10px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#8b949e; font-size:11px; cursor:pointer; transition:all .1s; }
        .dp-active { border-color:#6366f1 !important; color:#a5b4fc !important; background:rgba(99,102,241,.1) !important; }
        .dp-toggle { display:flex; align-items:center; gap:8px; font-size:12px; color:#8b949e; cursor:pointer; margin-bottom:6px; }
        .dp-toggle input { accent-color:#6366f1; }

        /* ── Import panel ─────────────────────────────────────── */
        .import-panel { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:18px; margin-bottom:16px; }
        .import-title { font-size:13px; font-weight:700; margin-bottom:5px; }
        .import-hint { font-size:11px; color:#8b949e; margin-bottom:12px; }
        .import-dropzone {
          border:2px dashed #30363d; border-radius:10px; padding:30px;
          text-align:center; cursor:pointer; transition:all .15s; margin-bottom:10px;
        }
        .import-dropzone:hover, .import-drag { border-color:#6366f1; background:rgba(99,102,241,.05); }
        .import-loading { display:flex; align-items:center; gap:10px; justify-content:center; }
        .import-spinner { width:20px; height:20px; border:2px solid #30363d; border-top-color:#6366f1; border-radius:50%; animation:spin .8s linear infinite; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .import-dz-icon { font-size:32px; margin-bottom:8px; }
        .import-dz-text { font-size:13px; font-weight:600; color:#e6edf3; }
        .import-dz-hint { font-size:11px; color:#8b949e; margin-top:4px; }
        .import-dz-formats { display:flex; gap:8px; margin:8px 0 4px; }
        .import-fmt { padding:3px 10px; border:1px solid #30363d; border-radius:6px; font-size:11px; color:#8b949e; background:#21262d; }
        .import-loading { display:flex; align-items:center; gap:14px; padding:8px 0; }
        .import-loading-main { font-size:13px; font-weight:600; color:#e6edf3; }
        .import-loading-sub { font-size:10px; color:#8b949e; margin-top:3px; }
        .import-extracted-title { font-size:11px; font-weight:600; color:#22c55e; margin-bottom:6px; }
        .import-extracted-ta { width:100%; background:#21262d; border:1px solid #30363d; border-radius:7px; color:#e6edf3; font-size:11.5px; padding:10px; font-family:monospace; resize:vertical; margin-bottom:10px; }
        .import-updates-title { font-size:11px; font-weight:700; color:#f59e0b; margin-bottom:4px; }
        .import-updates-hint { font-size:10px; color:#8b949e; margin-bottom:6px; }
        .import-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; flex-wrap:wrap; }
        .import-btn-ghost { padding:7px 14px; border:1px solid #30363d; border-radius:7px; background:none; color:#8b949e; font-size:12px; cursor:pointer; }
        .import-btn-ghost:disabled { opacity:.5; cursor:not-allowed; }
        /* Error */
        .import-error { display:flex; align-items:center; justify-content:space-between; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.3); border-radius:8px; padding:10px 14px; font-size:12px; color:#f87171; margin-bottom:10px; }
        .import-error-close { background:none; border:none; color:#f87171; cursor:pointer; font-size:14px; padding:0 4px; flex-shrink:0; }
        /* PDF panel */
        .import-pdf-title { font-size:13px; font-weight:700; color:#f59e0b; margin-bottom:5px; }
        .import-pdf-hint { font-size:11px; color:#8b949e; margin-bottom:8px; line-height:1.6; }
        .import-dz-pdf-note { font-size:10px; color:#8b949e; margin-top:8px; }
        .import-pdf-link { background:none; border:none; color:#6366f1; cursor:pointer; font-size:10px; text-decoration:underline; padding:0; }
        .import-pdf-link:hover { color:#a5b4fc; }
        .import-btn-primary { padding:7px 16px; border:none; border-radius:7px; background:#6366f1; color:#fff; font-size:12px; font-weight:700; cursor:pointer; }

        /* ── Popup system ─────────────────────────────────────── */
        .popup-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,.75);
          display:flex; align-items:center; justify-content:center;
          z-index:1000; padding:16px;
          backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
          animation:fadeIn .15s ease;
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .popup-box {
          width:100%; max-width:520px; border-radius:16px;
          border:1px solid; overflow:hidden;
          box-shadow:0 24px 80px rgba(0,0,0,.7);
          animation:popIn .2s cubic-bezier(.16,1,.3,1);
          max-height:90vh; display:flex; flex-direction:column;
        }
        @keyframes popIn { from{opacity:0;transform:scale(.9) translateY(8px)} to{opacity:1;transform:none} }
        .popup-header {
          display:flex; align-items:center; gap:10px;
          padding:14px 18px; border-bottom:1px solid; flex-shrink:0;
        }
        .popup-icon { font-size:20px; flex-shrink:0; }
        .popup-title { font-size:14px; font-weight:800; flex:1; }
        .popup-close { background:none; border:none; color:#8b949e; cursor:pointer; font-size:16px; padding:2px 6px; border-radius:4px; }
        .popup-close:hover { background:rgba(255,255,255,.1); color:#e6edf3; }
        .popup-body { padding:16px 18px; overflow-y:auto; flex:1; }
        .popup-message { font-size:13px; line-height:1.65; color:#8b949e; }
        .popup-footer {
          display:flex; gap:8px; justify-content:flex-end;
          padding:12px 18px; border-top:1px solid; flex-shrink:0;
        }
        .popup-btn { padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:none; transition:all .15s; }
        .popup-btn-ghost { background:rgba(255,255,255,.08); color:#8b949e; border:1px solid #30363d !important; }
        .popup-btn-ghost:hover { color:#e6edf3; background:rgba(255,255,255,.12); }
        .popup-btn-primary { color:#fff; }
        .popup-btn-primary:hover { filter:brightness(1.1); transform:translateY(-1px); }

        /* Loading popup */
        .popup-loading-wrap { display:flex; flex-direction:column; align-items:center; gap:14px; padding:10px 0; }
        .popup-spinner { width:40px; height:40px; border:3px solid #30363d; border-top-color:#6366f1; border-radius:50%; animation:spin .8s linear infinite; }
        .popup-loading-text { font-size:13px; color:#8b949e; text-align:center; }

        /* Verify result */
        .popup-verify { display:flex; flex-direction:column; gap:12px; }
        .popup-score-row { display:flex; align-items:center; gap:14px; }
        .popup-score-circle {
          width:72px; height:72px; border-radius:50%; border:3px solid;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          flex-shrink:0;
        }
        .popup-score-num { font-size:22px; font-weight:900; line-height:1; }
        .popup-score-max { font-size:10px; opacity:.7; }
        .popup-score-info { flex:1; }
        .popup-grade { font-size:16px; font-weight:800; margin-bottom:3px; }
        .popup-approved { font-size:12px; }
        .popup-cats { display:flex; flex-direction:column; gap:8px; }
        .popup-cat { background:#21262d; border-radius:8px; padding:10px 12px; }
        .popup-cat-header { display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:600; margin-bottom:5px; }
        .popup-cat-bar { height:4px; background:#30363d; border-radius:999px; overflow:hidden; margin-bottom:5px; }
        .popup-cat-bar div { height:4px; border-radius:999px; transition:width .4s ease; }
        .popup-cat-comment { font-size:11px; color:#8b949e; }
        .popup-global-tip { background:rgba(99,102,241,.1); border:1px solid rgba(99,102,241,.25); border-radius:8px; padding:10px 12px; font-size:12px; color:#a5b4fc; }
        .popup-suggestions { display:flex; flex-direction:column; gap:5px; }
        .popup-suggestion { font-size:11.5px; color:#8b949e; }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width:860px) {
          .gp-grid-2 { grid-template-columns:1fr; }
          .gp-split-area { grid-template-columns:1fr; }
          .gp-edit-panel { border-right:none; border-bottom:1px solid #30363d; max-height:50vh; }
          .gp-iframe { width:100%; }
          .gp-template-bar { flex-wrap:wrap; }
          .gp-tbar-right { margin-left:0; }
          .gp-design-overlay { right:0; left:0; border-radius:0; width:100%; max-height:60vh; }
          .popup-box { max-width:100%; border-radius:12px; }
        }
        @media (max-width:520px) {
          .gp-tabs { gap:0; }
          .gp-tab { padding:6px 10px; font-size:11px; }
          .gp-form-wrap { padding:12px; }
        }
      `}</style>
    </div>
  );
}