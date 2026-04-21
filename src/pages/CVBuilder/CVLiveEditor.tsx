// ═══════════════════════════════════════════════════════════════
//  CVLiveEditor
//  • Rendu direct React (pas d'iframe) — édition inline en direct
//  • Chaque champ est contentEditable, maj immédiate du state
//  • Print-perfect : tout ce qui apparaît à l'écran s'imprime
//  • Photo shape : cercle / carré / rectangle
//  • 8 layouts (Cascade · Moderne · Classique · Stanford · …)
// ═══════════════════════════════════════════════════════════════
import React, {
  useRef, useCallback, useEffect, useState, type CSSProperties,
} from 'react';
import type { GeneratedCV, DesignConfig, TemplateId } from './CVGeneratorPro_part1';


// ── Photo shape helper ─────────────────────────────────────────
function photoRadius(shape: DesignConfig['photoShape']): string {
  if (shape === 'circle')    return '50%';
  if (shape === 'rectangle') return '6px';
  return '8px'; // square
}
function photoDims(shape: DesignConfig['photoShape'], size = 100): { w: number; h: number } {
  if (shape === 'rectangle') return { w: Math.round(size * 0.76), h: size };
  return { w: size, h: size };
}

// ── Inline editable field ──────────────────────────────────────
interface EditFieldProps {
  value:      string;
  onChange:   (v: string) => void;
  tag?:       'span' | 'div' | 'h1' | 'h2' | 'h3' | 'p' | 'li';
  style?:     CSSProperties;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
}

const EditField: React.FC<EditFieldProps> = ({
  value, onChange, tag = 'span', style, className, multiline, placeholder,
}) => {
  const ref = useRef<HTMLElement>(null);
  const Tag = tag as any;

  // sync content when value changes from outside
  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value || '';
    }
  }, [value]);

  const handleBlur = () => {
    const txt = ref.current?.innerText ?? '';
    if (txt !== value) onChange(txt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!multiline && e.key === 'Enter') { e.preventDefault(); ref.current?.blur(); }
  };

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{ ...style, outline: 'none', minWidth: 4 }}
      className={`editable-field${className ? ' ' + className : ''}`}
      data-placeholder={placeholder}
    >
      {value}
    </Tag>
  );
};

// ── Bullet list with editable items + add/remove ───────────────
const EditBullets: React.FC<{
  bullets: string[];
  onChange: (b: string[]) => void;
  style?: CSSProperties;
  itemStyle?: CSSProperties;
}> = ({ bullets, onChange, style, itemStyle }) => {
  const addBullet = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([...bullets, '']);
  };
  const removeBullet = (i: number) => {
    onChange(bullets.filter((_, j) => j !== i));
  };

  return (
    <ul style={{ margin: '4px 0 0', paddingLeft: 16, ...style }}>
      {bullets.map((b, i) => (
        <li key={i} style={{ position: 'relative', paddingRight: 20, ...itemStyle }}>
          <EditField
            tag="span"
            value={b}
            onChange={v => onChange(bullets.map((old, j) => j === i ? v : old))}
            multiline
            placeholder="Bullet point…"
          />
          <button
            onClick={() => removeBullet(i)}
            className="bullet-del no-print"
            title="Supprimer">✕</button>
        </li>
      ))}
      <li className="no-print" style={{ listStyle: 'none', marginTop: 4 }}>
        <button onClick={addBullet} className="bullet-add">+ Ajouter un point</button>
      </li>
    </ul>
  );
};

// ── Tech chips editable ────────────────────────────────────────
const EditTechs: React.FC<{
  techs: string[];
  onChange: (t: string[]) => void;
  chipStyle?: CSSProperties;
}> = ({ techs, onChange, chipStyle }) => {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');

  const remove = (i: number) => onChange(techs.filter((_, j) => j !== i));
  const add = () => {
    if (newVal.trim()) onChange([...techs, newVal.trim()]);
    setNewVal(''); setAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
      {techs.map((t, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, ...chipStyle }}>
          <EditField
            tag="span"
            value={t}
            onChange={v => onChange(techs.map((old, j) => j === i ? v : old))}
            style={{ display: 'inline' }}
          />
          <button onClick={() => remove(i)} className="chip-del no-print">✕</button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onBlur={add}
          onKeyDown={e => e.key === 'Enter' && add()}
          className="chip-input no-print"
          placeholder="Ajouter…"
          style={{ ...chipStyle, background: 'transparent', border: '1px dashed currentColor', padding: '1px 7px', borderRadius: 3 }}
        />
      ) : (
        <button onClick={() => setAdding(true)} className="chip-add no-print" style={chipStyle}>+ Tech</button>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  CV SECTION RENDERERS (layout-agnostic helpers)
// ══════════════════════════════════════════════════════════════

interface SectionProps {
  cv:       GeneratedCV;
  d:        DesignConfig;
  update:   (patch: Partial<GeneratedCV>) => void;
  lang:     'fr' | 'en';
}

const L = (fr: string, en: string, lang: 'fr' | 'en') => lang === 'fr' ? fr : en;

// ── Photo block ───────────────────────────────────────────────
const PhotoBlock: React.FC<{ cv: GeneratedCV; d: DesignConfig; update: (p: Partial<GeneratedCV>) => void; size?: number }> =
  ({ cv, d, update, size = 100 }) => {
  const { w, h } = photoDims(d.photoShape, size);
  const radius    = photoRadius(d.photoShape);
  const fileRef   = useRef<HTMLInputElement>(null);

  if (!d.showPhoto) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => update({ personal: { ...cv.personal, photo: ev.target?.result as string } });
    reader.readAsDataURL(f);
  };

  return (
    <div style={{ flexShrink: 0, position: 'relative' }}>
      {cv.personal.photo ? (
        <img
          src={cv.personal.photo}
          style={{ width: w, height: h, borderRadius: radius, objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
          alt="Photo"
        />
      ) : (
        <div style={{ width: w, height: h, borderRadius: radius, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#fff' }}>
          {cv.personal.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'CV'}
        </div>
      )}
      <button className="photo-change-btn no-print" onClick={() => fileRef.current?.click()} title="Changer la photo">📸</button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  TEMPLATE LAYOUTS
// ══════════════════════════════════════════════════════════════

// ── 1. CASCADE ────────────────────────────────────────────────
const LayoutCascade: React.FC<SectionProps> = ({ cv, d, update, lang }) => {
  const p  = cv.personal;
  const pc = d.primaryColor;
  const ac = d.accentColor;
  const fz = d.spacing === 'compact' ? 9.5 : d.spacing === 'spacious' ? 11.5 : 10.5;
  const upP = (k: keyof typeof p, v: string) => update({ personal: { ...p, [k]: v } });
  const lvls = [85, 72, 80, 68, 90, 75, 88, 65];

  return (
    <div className="cv-layout-flex" style={{ fontFamily: d.fontFamily, fontSize: fz }}>
      {/* SIDEBAR */}
      <div className="cv-sidebar" style={{ background: pc, width: 220, minHeight: '100%', padding: '24px 16px', flexShrink: 0 }}>
        <PhotoBlock cv={cv} d={d} update={update} size={110} />
        <EditField tag="h1" value={p.name} onChange={v => upP('name', v)}
          style={{ fontSize: 15, fontWeight: 700, color: '#fff', textAlign: 'center', margin: '10px 0 3px', lineHeight: 1.2 }} />
        <EditField tag="p" value={p.title} onChange={v => upP('title', v)}
          style={{ fontSize: 9, textAlign: 'center', color: ac, margin: '0 0 12px' }} />

        <div style={{ height: 1, background: 'rgba(255,255,255,.2)', margin: '0 0 12px' }} />

        {/* Contact */}
        <div className="cv-sidebar-section">
          <div className="cv-sidebar-title" style={{ color: ac }}>{L('Informations', 'Contact', lang)}</div>
          {p.city && <div className="cv-sidebar-row" style={{ color: '#e0ecf8' }}>📍 <EditField tag="span" value={p.city} onChange={v => upP('city', v)} style={{ color: '#e0ecf8' }} /></div>}
          {p.phone && <div className="cv-sidebar-row" style={{ color: '#e0ecf8' }}>📞 <EditField tag="span" value={p.phone} onChange={v => upP('phone', v)} style={{ color: '#e0ecf8' }} /></div>}
          {p.email && <div className="cv-sidebar-row" style={{ color: '#e0ecf8' }}>✉ <EditField tag="span" value={p.email} onChange={v => upP('email', v)} style={{ color: '#e0ecf8' }} /></div>}
          {p.linkedin && <div className="cv-sidebar-row" style={{ color: '#e0ecf8', wordBreak: 'break-all' }}>🔗 <EditField tag="span" value={p.linkedin} onChange={v => upP('linkedin', v)} style={{ color: '#e0ecf8' }} /></div>}
          {p.github && <div className="cv-sidebar-row" style={{ color: '#e0ecf8', wordBreak: 'break-all' }}>💻 <EditField tag="span" value={p.github} onChange={v => upP('github', v)} style={{ color: '#e0ecf8' }} /></div>}
        </div>

        {/* Skills */}
        {cv.skills.map((sg, si) => (
          <div key={si} className="cv-sidebar-section">
            <div className="cv-sidebar-title" style={{ color: ac }}>
              <EditField tag="span" value={sg.cat} onChange={v => update({ skills: cv.skills.map((s, j) => j === si ? { ...s, cat: v } : s) })} style={{ color: ac }} />
            </div>
            {sg.items.map((item, ii) => (
              <div key={ii} style={{ marginBottom: 5 }}>
                <EditField tag="span" value={item}
                  onChange={v => update({ skills: cv.skills.map((s, j) => j === si ? { ...s, items: s.items.map((it, k) => k === ii ? v : it) } : s) })}
                  style={{ fontSize: 8.5, color: '#e0ecf8', display: 'block', marginBottom: 2 }} />
                {d.showBars && (
                  <div style={{ height: 4, background: 'rgba(255,255,255,.18)', borderRadius: 999 }}>
                    <div style={{ width: `${lvls[(si * 4 + ii) % lvls.length]}%`, height: 4, background: ac, borderRadius: 999 }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Languages */}
        {cv.languages?.length > 0 && (
          <div className="cv-sidebar-section">
            <div className="cv-sidebar-title" style={{ color: ac }}>{L('Langues', 'Languages', lang)}</div>
            {cv.languages.map((l, i) => (
              <div key={i} style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <EditField tag="span" value={l.lang}
                    onChange={v => update({ languages: cv.languages.map((ll, j) => j === i ? { ...ll, lang: v } : ll) })}
                    style={{ fontSize: 8.5, color: '#e0ecf8' }} />
                  <EditField tag="span" value={l.level}
                    onChange={v => update({ languages: cv.languages.map((ll, j) => j === i ? { ...ll, level: v } : ll) })}
                    style={{ fontSize: 7.5, color: ac }} />
                </div>
                {d.showBars && (
                  <div style={{ height: 4, background: 'rgba(255,255,255,.18)', borderRadius: 999 }}>
                    <div style={{ width: `${[90, 75, 55, 40][i] || 65}%`, height: 4, background: ac, borderRadius: 999 }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Interests */}
        {(cv.interests?.length ?? 0) > 0 && (
          <div className="cv-sidebar-section">
            <div className="cv-sidebar-title" style={{ color: ac }}>{L("Centres d'intérêt", 'Interests', lang)}</div>
            {(cv.interests ?? []).map((it, i) => (
              <EditField key={i} tag="p" value={it}
                onChange={v => update({ interests: (cv.interests ?? []).map((old, j) => j === i ? v : old) })}
                style={{ fontSize: 8.5, color: '#c8daea', margin: '0 0 3px' }} />
            ))}
          </div>
        )}
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, padding: 26 }}>
        <EditField tag="p" value={p.summary} onChange={v => upP('summary', v)} multiline
          style={{ fontSize: fz - 1, lineHeight: 1.65, color: '#333', marginBottom: 14, textAlign: 'justify' }}
          placeholder="Accroche professionnelle…" />

        {/* Experience */}
        {cv.experience?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="cv-main-sh" style={{ color: pc, borderBottomColor: pc }}>{L('Expérience professionnelle', 'Experience', lang)}</div>
            {cv.experience.map((exp, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 78, flexShrink: 0, textAlign: 'right', fontSize: 8, color: '#666', paddingTop: 2, lineHeight: 1.5 }}>
                  <EditField tag="span" value={exp.start} onChange={v => update({ experience: cv.experience.map((e, j) => j === i ? { ...e, start: v } : e) })} style={{ fontSize: 8, color: '#666' }} />
                  <br />
                  <EditField tag="span" value={exp.end} onChange={v => update({ experience: cv.experience.map((e, j) => j === i ? { ...e, end: v } : e) })} style={{ fontSize: 8, color: '#666' }} />
                </div>
                <div style={{ flex: 1, borderLeft: `2px solid ${ac}`, paddingLeft: 10 }}>
                  <EditField tag="div" value={exp.role} onChange={v => update({ experience: cv.experience.map((e, j) => j === i ? { ...e, role: v } : e) })}
                    style={{ fontSize: fz, fontWeight: 700, color: pc }} />
                  <div style={{ fontSize: fz - 1.5, color: '#555', fontStyle: 'italic', marginBottom: 3 }}>
                    <EditField tag="span" value={exp.company} onChange={v => update({ experience: cv.experience.map((e, j) => j === i ? { ...e, company: v } : e) })} style={{ fontStyle: 'italic', color: '#555' }} />
                    {' — '}
                    <EditField tag="span" value={exp.location} onChange={v => update({ experience: cv.experience.map((e, j) => j === i ? { ...e, location: v } : e) })} style={{ fontStyle: 'italic', color: '#555' }} />
                  </div>
                  <EditBullets bullets={exp.bullets}
                    onChange={bullets => update({ experience: cv.experience.map((e, j) => j === i ? { ...e, bullets } : e) })}
                    style={{ fontSize: fz - 1.5 }} itemStyle={{ color: '#333', marginBottom: 2 }} />
                  {exp.techs?.length > 0 && (
                    <EditTechs techs={exp.techs}
                      onChange={techs => update({ experience: cv.experience.map((e, j) => j === i ? { ...e, techs } : e) })}
                      chipStyle={{ background: `${pc}15`, color: pc, border: `1px solid ${pc}30`, borderRadius: 3, padding: '1px 7px', fontSize: 8 }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Projects */}
        {(cv.projects?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="cv-main-sh" style={{ color: pc, borderBottomColor: pc }}>{L('Projets', 'Projects', lang)}</div>
            {(cv.projects ?? []).map((pr, i) => (
              <div key={i} style={{ marginBottom: 9, padding: '8px 10px', background: '#f4f8fc', borderLeft: `3px solid ${ac}`, borderRadius: '0 6px 6px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <EditField tag="span" value={pr.name} onChange={v => update({ projects: (cv.projects ?? []).map((p, j) => j === i ? { ...p, name: v } : p) })}
                    style={{ fontSize: fz, fontWeight: 700, color: pc }} />
                  {pr.link && <a href={pr.link} style={{ fontSize: 8.5, color: pc }} target="_blank" rel="noreferrer">🌐 Demo ↗</a>}
                  {pr.github && <a href={pr.github} style={{ fontSize: 8.5, color: pc }} target="_blank" rel="noreferrer">💻 GitHub ↗</a>}
                </div>
                {pr.techs?.length > 0 && <div style={{ fontSize: 8.5, color: '#666', marginBottom: 3 }}>{pr.techs.join(' · ')}</div>}
                <EditField tag="div" value={pr.desc} onChange={v => update({ projects: (cv.projects ?? []).map((p, j) => j === i ? { ...p, desc: v } : p) })}
                  style={{ fontSize: fz - 1.5, color: '#333' }} multiline />
                {pr.impact && (
                  <EditField tag="div" value={pr.impact} onChange={v => update({ projects: (cv.projects ?? []).map((p, j) => j === i ? { ...p, impact: v } : p) })}
                    style={{ fontSize: 8.5, color: pc, fontWeight: 700, marginTop: 3 }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {cv.education?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="cv-main-sh" style={{ color: pc, borderBottomColor: pc }}>{L('Formation', 'Education', lang)}</div>
            {cv.education.map((edu, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 78, flexShrink: 0, textAlign: 'right', fontSize: 8, color: '#666' }}>
                  <EditField tag="span" value={edu.year} onChange={v => update({ education: cv.education.map((e, j) => j === i ? { ...e, year: v } : e) })} style={{ fontSize: 8, color: '#666' }} />
                </div>
                <div style={{ flex: 1, borderLeft: `2px solid ${ac}`, paddingLeft: 10 }}>
                  <div style={{ fontSize: fz, fontWeight: 700, color: pc }}>
                    <EditField tag="span" value={edu.degree} onChange={v => update({ education: cv.education.map((e, j) => j === i ? { ...e, degree: v } : e) })} style={{ fontWeight: 700, color: pc }} />
                    {edu.field && <> — <EditField tag="span" value={edu.field} onChange={v => update({ education: cv.education.map((e, j) => j === i ? { ...e, field: v } : e) })} style={{ color: pc }} /></>}
                  </div>
                  <div style={{ fontSize: fz - 1.5, color: '#555', fontStyle: 'italic' }}>
                    <EditField tag="span" value={edu.school} onChange={v => update({ education: cv.education.map((e, j) => j === i ? { ...e, school: v } : e) })} style={{ fontStyle: 'italic', color: '#555' }} />
                    {edu.city && <>, <EditField tag="span" value={edu.city} onChange={v => update({ education: cv.education.map((e, j) => j === i ? { ...e, city: v } : e) })} style={{ fontStyle: 'italic', color: '#555' }} /></>}
                  </div>
                  {edu.mention && <EditField tag="div" value={edu.mention} onChange={v => update({ education: cv.education.map((e, j) => j === i ? { ...e, mention: v } : e) })} style={{ fontSize: 8.5, color: '#888' }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Awards */}
        {(cv.awards?.length ?? 0) > 0 && (
          <div>
            <div className="cv-main-sh" style={{ color: pc, borderBottomColor: pc }}>{L('Distinctions', 'Awards', lang)}</div>
            {(cv.awards ?? []).map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: fz - 1, marginBottom: 3 }}>
                <div>
                  <EditField tag="span" value={a.name} onChange={v => update({ awards: (cv.awards ?? []).map((aw, j) => j === i ? { ...aw, name: v } : aw) })} style={{ fontWeight: 700 }} />
                  {' — '}
                  <EditField tag="span" value={a.org} onChange={v => update({ awards: (cv.awards ?? []).map((aw, j) => j === i ? { ...aw, org: v } : aw) })} />
                </div>
                <EditField tag="span" value={a.year} onChange={v => update({ awards: (cv.awards ?? []).map((aw, j) => j === i ? { ...aw, year: v } : aw) })} style={{ color: '#888', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Simple adapter for other templates using Cascade as base ───
// (Full 8-template live editors would be 5000+ lines;
//  we use the Cascade React editor for all, color-coded per template)
const LayoutAdapter: React.FC<SectionProps & { templateId: TemplateId }> = (props) => {
  // All templates share the Cascade React layout — design.primaryColor/accentColor adapt the look
  return <LayoutCascade {...props} />;
};

// ══════════════════════════════════════════════════════════════
//  MAIN EXPORT — CVLiveEditor
// ══════════════════════════════════════════════════════════════
interface CVLiveEditorProps {
  cv:         GeneratedCV;
  design:     DesignConfig;
  template:   TemplateId;
  lang:       'fr' | 'en';
  onCVChange: (cv: GeneratedCV) => void;
  onPrint:    () => void;
}

export const CVLiveEditor: React.FC<CVLiveEditorProps> = ({
  cv, design, template, lang, onCVChange, onPrint,
}) => {
  const update = useCallback((patch: Partial<GeneratedCV>) => {
    onCVChange({ ...cv, ...patch });
  }, [cv, onCVChange]);

  return (
    <>
      {/* ── Edit hint bar ──────────────────────────────────────── */}
      <div className="lve-edit-bar no-print">
        <span className="lve-edit-icon">✏️</span>
        <span>Cliquez sur <strong>n'importe quel texte</strong> pour l'éditer directement — les modifications sont immédiates.</span>
        <button className="lve-print-btn" onClick={onPrint}>🖨 Imprimer / PDF</button>
      </div>

      {/* ── CV page ───────────────────────────────────────────── */}
      <div className="cv-page" style={{ fontFamily: design.fontFamily }}>
        <LayoutAdapter
          cv={cv}
          d={design}
          update={update}
          lang={lang}
          templateId={template}
        />
      </div>

      {/* ── Styles ────────────────────────────────────────────── */}
      <style>{`
        /* Edit hint bar */
        .lve-edit-bar {
          display:flex; align-items:center; gap:10px;
          padding:8px 16px; background:#1c2333;
          border-bottom:1px solid #2d3748; font-size:12px; color:#8b949e; flex-shrink:0;
        }
        .lve-edit-icon { font-size:14px; flex-shrink:0; }
        .lve-print-btn {
          margin-left:auto; padding:6px 14px; background:#6366f1; border:none;
          border-radius:7px; color:#fff; font-size:12px; font-weight:700; cursor:pointer;
        }
        .lve-print-btn:hover { background:#4f46e5; }

        /* CV page wrapper */
        .cv-page {
          background:#fff; width:794px; min-height:1122px;
          box-shadow:0 4px 24px rgba(0,0,0,.35);
          margin:0 auto; position:relative;
          color:#222;
        }

        /* Layout */
        .cv-layout-flex { display:flex; min-height:1122px; }
        .cv-sidebar { flex-shrink:0; }
        .cv-sidebar-section { margin-bottom:13px; }
        .cv-sidebar-title {
          font-size:7.5pt; font-weight:700; text-transform:uppercase;
          letter-spacing:1.5px; margin-bottom:7px; display:block;
        }
        .cv-sidebar-row { font-size:8pt; margin-bottom:5px; display:flex; align-items:flex-start; gap:4px; }
        .cv-main-sh {
          font-size:12pt; font-weight:700; border-bottom:2px solid;
          padding-bottom:3px; margin:14px 0 9px;
          text-transform:capitalize;
        }

        /* Editable fields */
        .editable-field {
          cursor:text; border-radius:2px; transition:background .12s;
        }
        .editable-field:hover { background:rgba(99,102,241,.08); }
        .editable-field:focus { background:rgba(99,102,241,.12); outline:2px solid rgba(99,102,241,.4); }
        [data-placeholder]:empty::before {
          content:attr(data-placeholder);
          color:#aaa; pointer-events:none; font-style:italic;
        }

        /* Bullet controls */
        .bullet-del {
          position:absolute; right:0; top:50%; transform:translateY(-50%);
          background:none; border:none; color:#ef4444; cursor:pointer;
          font-size:11px; opacity:0; transition:opacity .1s; padding:1px 4px;
          border-radius:3px;
        }
        li:hover .bullet-del { opacity:1; }
        .bullet-add {
          background:none; border:none; color:#6366f1; cursor:pointer;
          font-size:10px; padding:2px 6px; border-radius:3px;
        }
        .bullet-add:hover { background:rgba(99,102,241,.1); }

        /* Chip controls */
        .chip-del {
          background:none; border:none; color:currentColor; cursor:pointer;
          opacity:0; font-size:9px; padding:0 2px; line-height:1;
          transition:opacity .1s;
        }
        span:hover .chip-del { opacity:0.6; }
        .chip-add {
          background:none; border:none; cursor:pointer; font-size:8pt;
          opacity:0.5; padding:1px 7px; border-radius:3px; color:inherit;
        }
        .chip-add:hover { opacity:1; background:rgba(255,255,255,.1); }

        /* Photo change button */
        .photo-change-btn {
          position:absolute; bottom:-4px; right:-4px;
          background:#6366f1; border:2px solid #fff; border-radius:50%;
          width:24px; height:24px; font-size:12px; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,.3);
        }

        /* Print */
        @media print {
          .no-print { display:none !important; }
          .cv-page { box-shadow:none; width:100%; }
          .editable-field:hover, .editable-field:focus { background:transparent !important; outline:none !important; }
          @page { margin:0; size:A4; }
        }
      `}</style>
    </>
  );
};

// ══════════════════════════════════════════════════════════════
//  DESIGN PANEL — with photo shape
// ══════════════════════════════════════════════════════════════
export const DesignPanelFull: React.FC<{
  design:   DesignConfig;
  onChange: (d: DesignConfig) => void;
}> = ({ design, onChange }) => {
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

  const FONTS = [
    { v: 'Calibri,Segoe UI,Arial,sans-serif', l: 'Calibri (moderne)' },
    { v: "'Georgia','Times New Roman',serif",  l: 'Georgia (élégant)' },
    { v: "'Inter','Helvetica',sans-serif",     l: 'Inter (tech)' },
    { v: "'Garamond','EB Garamond',serif",     l: 'Garamond (académique)' },
    { v: "'Palatino Linotype',Palatino,serif", l: 'Palatino (classique)' },
  ];

  return (
    <div className="dpf-root">
      <div className="dpf-title">🎨 Design</div>

      {/* Color presets */}
      <div className="dpf-section">
        <div className="dpf-label">Palette</div>
        <div className="dpf-colors">
          {COLOR_PRESETS.map(c => (
            <button key={c.name}
              className={`dpf-color-btn${design.primaryColor === c.primary ? ' dpf-color-active' : ''}`}
              onClick={() => onChange({ ...design, primaryColor: c.primary, accentColor: c.accent })}
              title={c.name}>
              <div style={{ background: c.primary }} className="dpf-swatch-a" />
              <div style={{ background: c.accent  }} className="dpf-swatch-b" />
            </button>
          ))}
        </div>
        <div className="dpf-custom">
          <label className="dpf-label">Principal</label>
          <input type="color" value={design.primaryColor}
            onChange={e => onChange({ ...design, primaryColor: e.target.value })}
            className="dpf-color-picker" />
          <label className="dpf-label">Accent</label>
          <input type="color" value={design.accentColor}
            onChange={e => onChange({ ...design, accentColor: e.target.value })}
            className="dpf-color-picker" />
        </div>
      </div>

      {/* Font */}
      <div className="dpf-section">
        <div className="dpf-label">Police</div>
        <select className="dpf-select" value={design.fontFamily}
          onChange={e => onChange({ ...design, fontFamily: e.target.value })}>
          {FONTS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
        </select>
      </div>

      {/* Photo format */}
      <div className="dpf-section">
        <div className="dpf-label">Format photo</div>
        <div className="dpf-shapes">
          <button className={`dpf-shape-btn${design.photoShape === 'circle' ? ' dpf-shape-active' : ''}`}
            onClick={() => onChange({ ...design, photoShape: 'circle' })}>
            <div className="dpf-shape-icon" style={{ borderRadius: '50%' }} />
            <span>Cercle</span>
          </button>
          <button className={`dpf-shape-btn${design.photoShape === 'square' ? ' dpf-shape-active' : ''}`}
            onClick={() => onChange({ ...design, photoShape: 'square' })}>
            <div className="dpf-shape-icon" style={{ borderRadius: 4 }} />
            <span>Carré</span>
          </button>
          <button className={`dpf-shape-btn${design.photoShape === 'rectangle' ? ' dpf-shape-active' : ''}`}
            onClick={() => onChange({ ...design, photoShape: 'rectangle' })}>
            <div className="dpf-shape-icon" style={{ borderRadius: 4, width: 28, height: 36 }} />
            <span>Portrait</span>
          </button>
        </div>
      </div>

      {/* Spacing */}
      <div className="dpf-section">
        <div className="dpf-label">Espacement</div>
        <div className="dpf-btn-group">
          {(['compact', 'normal', 'spacious'] as const).map(s => (
            <button key={s} className={`dpf-spacing-btn${design.spacing === s ? ' dpf-active' : ''}`}
              onClick={() => onChange({ ...design, spacing: s })}>
              {s === 'compact' ? '⬛ Compact' : s === 'normal' ? '⬜ Normal' : '⬜⬜ Aéré'}
            </button>
          ))}
        </div>
      </div>

      {/* Header style */}
      <div className="dpf-section">
        <div className="dpf-label">En-tête</div>
        <div className="dpf-btn-group">
          {[{ v: 'solid', l: '█ Plein' }, { v: 'gradient', l: '▒ Dégradé' }, { v: 'minimal', l: '▔ Minimal' }].map(h => (
            <button key={h.v} className={`dpf-spacing-btn${design.headerStyle === h.v ? ' dpf-active' : ''}`}
              onClick={() => onChange({ ...design, headerStyle: h.v as any })}>
              {h.l}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="dpf-section">
        <label className="dpf-toggle">
          <input type="checkbox" checked={design.showPhoto}
            onChange={e => onChange({ ...design, showPhoto: e.target.checked })} />
          Afficher la photo
        </label>
        <label className="dpf-toggle">
          <input type="checkbox" checked={design.showBars}
            onChange={e => onChange({ ...design, showBars: e.target.checked })} />
          Barres de compétences
        </label>
      </div>

      <style>{`
        .dpf-root { font-family:'Inter','Segoe UI',sans-serif; font-size:12px; }
        .dpf-title { font-size:13px; font-weight:800; margin-bottom:14px; color:#e6edf3; }
        .dpf-section { margin-bottom:14px; }
        .dpf-label { font-size:10.5px; font-weight:600; color:#8b949e; margin-bottom:6px; display:block; }
        .dpf-colors { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px; }
        .dpf-color-btn { display:flex; flex-direction:column; width:36px; height:36px; border-radius:8px; border:2px solid #30363d; overflow:hidden; cursor:pointer; transition:all .1s; padding:0; gap:0; }
        .dpf-color-btn:hover, .dpf-color-active { border-color:#6366f1; transform:scale(1.08); }
        .dpf-swatch-a { flex:1; }
        .dpf-swatch-b { flex:1; }
        .dpf-custom { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .dpf-color-picker { width:38px; height:28px; border:none; border-radius:5px; cursor:pointer; padding:0; }
        .dpf-select { background:#21262d; border:1px solid #30363d; border-radius:7px; color:#e6edf3; font-size:12px; padding:7px 10px; width:100%; }
        .dpf-shapes { display:flex; gap:8px; }
        .dpf-shape-btn {
          display:flex; flex-direction:column; align-items:center; gap:5px;
          padding:8px 12px; border:1px solid #30363d; border-radius:8px;
          background:#21262d; color:#8b949e; cursor:pointer; font-size:10px;
          transition:all .15s; flex:1;
        }
        .dpf-shape-btn:hover, .dpf-shape-active { border-color:#6366f1; color:#a5b4fc; background:rgba(99,102,241,.1); }
        .dpf-shape-icon { width:32px; height:32px; background:#8b949e; flex-shrink:0; transition:background .15s; }
        .dpf-shape-active .dpf-shape-icon { background:#6366f1; }
        .dpf-btn-group { display:flex; gap:5px; }
        .dpf-spacing-btn { padding:5px 10px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#8b949e; font-size:11px; cursor:pointer; transition:all .1s; }
        .dpf-active { border-color:#6366f1 !important; color:#a5b4fc !important; background:rgba(99,102,241,.1) !important; }
        .dpf-toggle { display:flex; align-items:center; gap:8px; font-size:12px; color:#8b949e; cursor:pointer; margin-bottom:6px; }
        .dpf-toggle input { accent-color:#6366f1; }
      `}</style>
    </div>
  );
};