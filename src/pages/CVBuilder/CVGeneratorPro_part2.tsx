// CVGeneratorPro — Part 2: 8 Premium Templates
import type { GeneratedCV, DesignConfig, TemplateId } from './CVGeneratorPro_part1';

const esc = (s: string) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const sBar = (pct: number, c: string, bg = 'rgba(0,0,0,.12)') =>
  `<div style="height:5px;background:${bg};border-radius:999px;margin-top:3px;"><div style="width:${Math.min(100,pct)}%;background:${c};height:5px;border-radius:999px;"></div></div>`;

const buls = (list: string[], fz: string, col: string) => list?.length
  ? `<ul style="margin:4px 0 0;padding-left:16px;">${list.map(b=>`<li style="font-size:${fz};line-height:1.6;margin-bottom:3px;color:${col};">${esc(b)}</li>`).join('')}</ul>` : '';

const techChips = (techs: string[], pc: string) => techs?.length
  ? `<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:3px;">${techs.map(t=>`<span style="background:${pc}15;color:${pc};border:1px solid ${pc}30;border-radius:3px;padding:1px 7px;font-size:8pt;">${esc(t)}</span>`).join('')}</div>` : '';

const projectLink = (url: string, label: string, col: string) => url
  ? `<a href="${esc(url)}" style="font-size:8pt;color:${col};text-decoration:none;">${label} ↗</a>` : '';


// ── Photo CSS helpers ─────────────────────────────────────────

const spacing = (d: DesignConfig) =>
  d.spacing === 'compact' ? { pad: '20px 28px', gap: '8px' }
  : d.spacing === 'spacious' ? { pad: '36px 44px', gap: '14px' }
  : { pad: '26px 34px', gap: '11px' };

function headerBG(d: DesignConfig): string {
  if (d.headerStyle === 'gradient')
    return `linear-gradient(135deg,${d.primaryColor},${d.accentColor})`;
  if (d.headerStyle === 'minimal')
    return 'transparent';
  return d.primaryColor;
}

// photoEl inlined per template below

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 1 — CASCADE (FR sidebar navy)
// ══════════════════════════════════════════════════════════════
function tCascade(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const sp = spacing(d);
  const pc = d.primaryColor, ac = d.accentColor;
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const lvls = [85,70,80,65,90,75,88,72];

  let side = `
    ${d.showPhoto && p.photo ? `<div style="display:flex;justify-content:center;margin-bottom:14px;"><img src="${p.photo}" style="width:110px;height:130px;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;border:3px solid rgba(255,255,255,.4);border-radius:4px;"></div>` : ''}
    <h1 style="font-size:14pt;font-weight:700;color:#fff;text-align:center;margin-bottom:3px;line-height:1.2;">${esc(p.name)}</h1>
    <p style="font-size:8.5pt;text-align:center;color:${ac};margin-bottom:12px;">${esc(p.title)}</p>
    <div style="height:1px;background:rgba(255,255,255,.2);margin-bottom:12px;"></div>
    <div style="margin-bottom:12px;">
      <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${ac};margin-bottom:7px;">${L('Informations','Contact')}</div>
      ${p.city    ? `<div style="font-size:8pt;color:#e0ecf8;margin-bottom:4px;">📍 ${esc(p.city)}</div>` : ''}
      ${p.phone   ? `<div style="font-size:8pt;color:#e0ecf8;margin-bottom:4px;word-break:break-all;">📞 ${esc(p.phone)}</div>` : ''}
      ${p.email   ? `<div style="font-size:8pt;color:#e0ecf8;margin-bottom:4px;word-break:break-all;">✉ ${esc(p.email)}</div>` : ''}
      ${p.linkedin ? `<div style="font-size:8pt;color:#e0ecf8;margin-bottom:4px;word-break:break-all;">🔗 ${esc(p.linkedin)}</div>` : ''}
      ${p.github  ? `<div style="font-size:8pt;color:#e0ecf8;margin-bottom:4px;word-break:break-all;">💻 ${esc(p.github)}</div>` : ''}
    </div>`;

  let idx = 0;
  cv.skills.forEach(sg => {
    side += `<div style="margin-bottom:10px;"><div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${ac};margin-bottom:7px;">${esc(sg.cat)}</div>`;
    sg.items.forEach(item => {
      const pct = lvls[idx++ % lvls.length];
      side += `<div style="margin-bottom:5px;"><span style="font-size:8pt;color:#e0ecf8;">${esc(item)}</span>`;
      if (d.showBars) side += sBar(pct, ac, 'rgba(255,255,255,.15)');
      side += `</div>`;
    });
    side += `</div>`;
  });

  if (cv.languages?.length) {
    side += `<div style="margin-bottom:10px;"><div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${ac};margin-bottom:7px;">${L('Langues','Languages')}</div>`;
    cv.languages.forEach((l,i) => {
      const pct = [90,75,55,40][i] ?? 60;
      side += `<div style="margin-bottom:5px;"><div style="display:flex;justify-content:space-between;"><span style="font-size:8pt;color:#e0ecf8;">${esc(l.lang)}</span><span style="font-size:7pt;color:${ac};">${esc(l.level)}</span></div>`;
      if (d.showBars) side += sBar(pct, ac, 'rgba(255,255,255,.15)');
      side += `</div>`;
    });
    side += `</div>`;
  }

  if (cv.interests?.length) {
    side += `<div><div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${ac};margin-bottom:7px;">${L("Centres d'intérêt",'Interests')}</div>`;
    cv.interests.forEach(i => { side += `<div style="font-size:8pt;color:#c8daea;margin-bottom:3px;">• ${esc(i)}</div>`; });
    side += `</div>`;
  }

  const SH = (t: string) => `<h2 style="font-size:12pt;font-weight:700;color:${pc};border-bottom:2px solid ${pc};padding-bottom:3px;margin:14px 0 9px;text-transform:capitalize;">${esc(t)}</h2>`;
  let main = `<p style="font-size:9.5pt;line-height:1.65;color:#333;margin-bottom:14px;text-align:justify;">${esc(p.summary)}</p>`;

  if (cv.experience?.length) {
    main += SH(L('Expérience professionnelle','Professional Experience'));
    cv.experience.forEach(exp => {
      main += `<div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="width:78px;flex-shrink:0;text-align:right;font-size:8pt;color:#666;line-height:1.5;">${esc(exp.start)}<br>${esc(exp.end)}</div>
        <div style="flex:1;border-left:2px solid ${ac};padding-left:10px;">
          <div style="font-size:10.5pt;font-weight:700;color:${pc};">${esc(exp.role)}</div>
          <div style="font-size:9pt;color:#555;font-style:italic;margin-bottom:4px;">${esc(exp.company)}, ${esc(exp.location)}</div>
          ${buls(exp.bullets,'9pt','#333')}
          ${techChips(exp.techs, pc)}
        </div>
      </div>`;
    });
  }

  if (cv.projects?.length) {
    main += SH(L('Projets','Projects'));
    cv.projects.forEach(pr => {
      main += `<div style="margin-bottom:10px;padding:8px 10px;background:#f4f8fc;border-left:3px solid ${ac};border-radius:0 6px 6px 0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
          <strong style="font-size:10pt;color:${pc};">${esc(pr.name)}</strong>
          ${projectLink(pr.link||'', '🌐 Demo', pc)}
          ${projectLink(pr.github||'', '💻 GitHub', pc)}
        </div>
        ${pr.techs?.length?`<div style="font-size:8.5pt;color:#666;margin-bottom:3px;">${esc(pr.techs.join(' · '))}</div>`:''}
        <div style="font-size:9pt;color:#333;">${esc(pr.desc)}</div>
        ${pr.impact?`<div style="font-size:8.5pt;color:${pc};font-weight:700;margin-top:3px;">📊 ${esc(pr.impact)}</div>`:''}
      </div>`;
    });
  }

  if (cv.education?.length) {
    main += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      main += `<div style="display:flex;gap:12px;margin-bottom:8px;">
        <div style="width:78px;flex-shrink:0;text-align:right;font-size:8pt;color:#666;">${esc(edu.year)}</div>
        <div style="flex:1;border-left:2px solid ${ac};padding-left:10px;">
          <div style="font-size:10.5pt;font-weight:700;color:${pc};">${esc(edu.degree)}${edu.field?' — '+esc(edu.field):''}</div>
          <div style="font-size:9pt;color:#555;font-style:italic;">${esc(edu.school)}${edu.city?', '+esc(edu.city):''}</div>
          ${edu.mention?`<div style="font-size:8.5pt;color:#888;">${esc(edu.mention)}</div>`:''}
          ${edu.thesis?`<div style="font-size:8.5pt;font-style:italic;color:#555;">${L('Mémoire','Thesis')}: ${esc(edu.thesis)}</div>`:''}
        </div>
      </div>`;
    });
  }

  if (cv.awards?.length) {
    main += SH(L('Distinctions','Awards'));
    cv.awards.forEach(a => { main += `<div style="font-size:9pt;margin-bottom:4px;display:flex;justify-content:space-between;"><div><strong>${esc(a.name)}</strong> — ${esc(a.org)}</div><span style="color:#888;">${esc(a.year)}</span></div>`; });
  }

  return wrapHTML(cv, d, lang,
    `<div style="width:220px;flex-shrink:0;background:${pc};padding:${sp.pad};color:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact;">${side}</div><div style="flex:1;padding:${sp.pad};">${main}</div>`,
    `display:flex;min-height:100vh;`, false
  );
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 2 — MODERNE (teal header, 2 cols)
// ══════════════════════════════════════════════════════════════
function tModerne(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const pc = d.primaryColor, ac = d.accentColor;
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const hBG = headerBG(d);
  const headerFgColor = d.headerStyle === 'minimal' ? pc : '#fff';

  const SH = (t: string, side = false) => `<div style="margin:${side?'10px':'12px'} 0 ${side?'5px':'7px'};"><span style="background:${ac};color:#fff;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:3px 10px;border-radius:2px;display:inline-block;">${esc(t)}</span></div>`;

  let left = `${SH(L('Profil','Profile'), true)}<p style="font-size:8.5pt;line-height:1.6;color:#333;text-align:justify;">${esc(p.summary)}</p>`;
  left += `${SH(L('Coordonnées','Contact'), true)}`;
  [p.city&&`📍 ${p.city}`,p.phone&&`📞 ${p.phone}`,p.email&&`✉ ${p.email}`,p.linkedin&&`🔗 ${p.linkedin}`,p.github&&`💻 ${p.github}`].filter(Boolean).forEach(c => {
    left += `<div style="font-size:8pt;color:#444;margin-bottom:4px;word-break:break-all;">${esc(c as string)}</div>`;
  });

  if (cv.skills?.length) {
    left += SH(L('Compétences','Skills'), true);
    cv.skills.forEach(sg => {
      left += `<div style="margin-bottom:7px;"><div style="font-size:8pt;font-weight:700;color:${pc};margin-bottom:3px;">${esc(sg.cat)}</div><div style="display:flex;flex-wrap:wrap;gap:3px;">${sg.items.map(i=>`<span style="background:#fff;border:1px solid ${ac};color:${pc};border-radius:2px;padding:1px 6px;font-size:7.5pt;">${esc(i)}</span>`).join('')}</div></div>`;
    });
  }
  if (cv.languages?.length) {
    left += SH(L('Langues','Languages'), true);
    cv.languages.forEach(l => { left += `<div style="display:flex;justify-content:space-between;font-size:8.5pt;margin-bottom:4px;"><span style="font-weight:600;color:${pc};">${esc(l.lang)}</span><span style="color:#555;">${esc(l.level)}</span></div>`; });
  }
  if (cv.interests?.length) {
    left += SH(L('Hobbies','Interests'), true);
    cv.interests.forEach(i => { left += `<div style="font-size:8.5pt;color:#444;margin-bottom:2px;">• ${esc(i)}</div>`; });
  }

  let right = '';
  if (cv.experience?.length) {
    right += SH(L('Expériences','Experience'));
    cv.experience.forEach(exp => {
      right += `<div style="display:flex;gap:10px;margin-bottom:12px;">
        <div style="min-width:82px;text-align:right;font-size:8pt;color:${ac};font-weight:600;padding-top:2px;line-height:1.5;">${esc(exp.start)}<br>${esc(exp.end)}</div>
        <div style="flex:1;border-left:2px solid #e0eaec;padding-left:10px;">
          <div style="font-size:10pt;font-weight:700;color:${pc};">${esc(exp.role)}</div>
          <div style="font-size:8.5pt;color:${ac};font-style:italic;margin-bottom:4px;">${esc(exp.company)}, ${esc(exp.location)}</div>
          ${buls(exp.bullets,'8.5pt','#333')}
          ${techChips(exp.techs, pc)}
        </div>
      </div>`;
    });
  }
  if (cv.projects?.length) {
    right += SH(L('Projets','Projects'));
    cv.projects.forEach(pr => {
      right += `<div style="margin-bottom:9px;background:#f5fafa;border-left:3px solid ${ac};padding:7px 10px;border-radius:0 5px 5px 0;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:2px;">
          <strong style="font-size:9.5pt;color:${pc};">${esc(pr.name)}</strong>
          ${projectLink(pr.link||'','🌐',pc)} ${projectLink(pr.github||'','💻',pc)}
        </div>
        <div style="font-size:8.5pt;color:#555;">${esc(pr.desc)}</div>
        ${pr.impact?`<div style="font-size:8pt;color:${ac};font-weight:700;">📊 ${esc(pr.impact)}</div>`:''}
        ${pr.techs?.length?`<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px;">${pr.techs.map(t=>`<span style="background:#e0eaec;color:${pc};border-radius:2px;padding:1px 6px;font-size:7.5pt;">${esc(t)}</span>`).join('')}</div>`:''}
      </div>`;
    });
  }
  if (cv.education?.length) {
    right += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      right += `<div style="margin-bottom:8px;border-left:2px solid #e0eaec;padding-left:10px;">
        <div style="font-size:10pt;font-weight:700;color:${pc};">${esc(edu.degree)}${edu.field?' — '+esc(edu.field):''}</div>
        <div style="font-size:8.5pt;color:${ac};font-style:italic;">${esc(edu.school)}, ${esc(edu.city)} · ${esc(edu.year)}</div>
        ${edu.mention?`<div style="font-size:8pt;color:#888;">${esc(edu.mention)}</div>`:''}
      </div>`;
    });
  }

  
  return wrapHTML(cv, d, lang, `
    <div style="background:${hBG};padding:20px 28px;color:${headerFgColor};print-color-adjust:exact;-webkit-print-color-adjust:exact;">
      <div style="display:flex;align-items:center;gap:16px;">
        ${d.showPhoto && p.photo ? `<img src="${p.photo}" style="width:85px;height:85px;border-radius:50%;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;border:3px solid rgba(255,255,255,.5);">` : ''}
        <div style="flex:1;">
          <h1 style="font-size:20pt;font-weight:700;margin:0;color:${headerFgColor};">${esc(p.name)}</h1>
          <div style="font-size:10.5pt;color:${headerFgColor === pc ? ac : 'rgba(255,255,255,.85)'};margin-top:3px;">${esc(p.title)}</div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:200px 1fr;">
      <div style="background:#f0f4f5;padding:16px 14px;">${left}</div>
      <div style="padding:16px 20px;">${right}</div>
    </div>`, '', false
  );
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 3 — CLASSIQUE (bandeau + lignes)
// ══════════════════════════════════════════════════════════════
function tClassique(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const pc = d.primaryColor;
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const sp = spacing(d);

  const SH = (t: string) => `<div style="display:flex;align-items:center;gap:8px;margin:14px 0 8px;">
    <span style="flex:1;height:1px;background:${pc};"></span>
    <h2 style="font-size:10.5pt;font-weight:700;color:${pc};white-space:nowrap;text-transform:uppercase;letter-spacing:1px;">${esc(t)}</h2>
    <span style="flex:1;height:1px;background:${pc};"></span>
  </div>`;

  let body = '';
  if (p.summary) { body += SH(L('Profil','Profile')); body += `<p style="font-size:9.5pt;line-height:1.7;color:#333;text-align:justify;">${esc(p.summary)}</p>`; }

  if (cv.skills?.length) {
    body += SH(L('Compétences','Skills'));
    body += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;">`;
    cv.skills.forEach(sg => {
      body += `<div><div style="font-size:9pt;font-weight:700;color:${pc};">${esc(sg.cat)}</div><div style="font-size:8.5pt;color:#444;">${esc(sg.items.join(' · '))}</div></div>`;
    });
    body += `</div>`;
  }

  if (cv.experience?.length) {
    body += SH(L('Expériences professionnelles','Professional Experience'));
    cv.experience.forEach(exp => {
      body += `<div style="margin-bottom:11px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <div><div style="font-size:10.5pt;font-weight:700;color:${pc};">${esc(exp.role)}</div>
          <div style="font-size:9pt;color:#555;font-style:italic;">${esc(exp.company)}, ${esc(exp.location)}</div></div>
          <div style="font-size:8.5pt;color:#666;white-space:nowrap;margin-left:8px;">${esc(exp.start)} – ${esc(exp.end)}</div>
        </div>
        ${buls(exp.bullets,'9pt','#333')}
        ${techChips(exp.techs, pc)}
      </div>`;
    });
  }

  if (cv.projects?.length) {
    body += SH(L('Projets','Projects'));
    cv.projects.forEach(pr => {
      body += `<div style="margin-bottom:9px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <strong style="font-size:10pt;color:${pc};">${esc(pr.name)}</strong>
          ${projectLink(pr.link||'','🌐 Demo',pc)} ${projectLink(pr.github||'','💻 GitHub',pc)}
        </div>
        ${pr.techs?.length?`<div style="font-size:8.5pt;color:#666;margin-bottom:2px;">${esc(pr.techs.join(' · '))}</div>`:''}
        <div style="font-size:9pt;color:#333;">${esc(pr.desc)}</div>
        ${pr.impact?`<div style="font-size:8.5pt;color:${pc};font-weight:700;">📊 ${esc(pr.impact)}</div>`:''}
      </div>`;
    });
  }

  if (cv.education?.length) {
    body += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      body += `<div style="margin-bottom:7px;display:flex;justify-content:space-between;align-items:baseline;"><div>
        <div style="font-size:10.5pt;font-weight:700;color:${pc};">${esc(edu.degree)}${edu.field?' — '+esc(edu.field):''}</div>
        <div style="font-size:9pt;color:#555;font-style:italic;">${esc(edu.school)}, ${esc(edu.city)}</div>
        ${edu.mention?`<div style="font-size:8.5pt;color:#888;">${esc(edu.mention)}</div>`:''}
      </div><div style="font-size:8.5pt;color:#666;flex-shrink:0;margin-left:8px;">${esc(edu.year)}</div></div>`;
    });
  }

  if (cv.languages?.length) {
    body += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">`;
    body += `<div>${SH(L('Langues','Languages'))}${cv.languages.map(l=>`<div style="display:flex;justify-content:space-between;font-size:9pt;margin-bottom:3px;"><span style="font-weight:700;color:${pc};">${esc(l.lang)}</span><span style="color:#555;">${esc(l.level)}</span></div>`).join('')}</div>`;
    if (cv.interests?.length) {
      body += `<div>${SH(L("Centres d'intérêt",'Interests'))}${cv.interests.map(i=>`<div style="font-size:9pt;color:#444;margin-bottom:2px;">• ${esc(i)}</div>`).join('')}</div>`;
    }
    body += `</div>`;
  }

  const contacts = [p.city&&`📍 ${p.city}`,p.phone&&`📞 ${p.phone}`,p.email&&`✉ ${p.email}`,p.linkedin&&`🔗 ${p.linkedin}`,p.github&&`💻 ${p.github}`].filter(Boolean);

  return wrapHTML(cv, d, lang, `
    <div style="background:${headerBG(d)};padding:22px 30px;display:flex;align-items:center;gap:18px;print-color-adjust:exact;">
      ${d.showPhoto && p.photo ? `<img src="${p.photo}" style="width:100px;height:115px;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;border:3px solid rgba(255,255,255,.45);border-radius:3px;flex-shrink:0;">` : ''}
      <div style="flex:1;">
        <h1 style="font-size:22pt;font-weight:400;margin:0;color:#fff;letter-spacing:2px;">${esc(p.name).toUpperCase()}</h1>
        <div style="font-size:11pt;color:rgba(255,255,255,.8);margin:4px 0 10px;">${esc(p.title)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px 12px;">${contacts.map(c=>`<span style="font-size:8pt;color:rgba(255,255,255,.75);">${esc(c as string)}</span>`).join('')}</div>
      </div>
    </div>
    <div style="padding:${sp.pad};">${body}</div>
  `, '', false);
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 4 — STANFORD (académique, serif, publications)
// ══════════════════════════════════════════════════════════════
function tStanford(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const pc = d.primaryColor, ac = d.accentColor;
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;

  const SH = (t: string) => `<table width="100%" style="border-collapse:collapse;margin-top:13px;margin-bottom:5px;">
    <tr><td colspan="2" style="border-bottom:1.5px double ${pc};padding-bottom:3px;">
      <h2 style="font-size:11pt;font-weight:700;color:${pc};text-transform:uppercase;letter-spacing:1.5px;margin:0;">${esc(t)}</h2>
    </td></tr>
  </table>`;

  const ROW = (label: string, content: string) => `<table width="100%" style="border-collapse:collapse;margin-top:9px;">
    <tr>
      <td style="width:22%;font-size:9pt;font-weight:700;color:#666;text-align:right;padding-right:12px;vertical-align:top;">${esc(label)}</td>
      <td style="border-left:1px solid ${pc}30;padding-left:14px;vertical-align:top;font-size:9.5pt;">${content}</td>
    </tr>
  </table>`;

  let body = '';
  if (p.summary) body += ROW(L('Résumé','Profile'), `<p style="line-height:1.7;color:#222;text-align:justify;margin:0;">${esc(p.summary)}</p>`);
  if (cv.education?.length) {
    body += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      body += ROW(esc(edu.year), `<div style="font-weight:700;color:${pc};">${esc(edu.degree)}${edu.field?', '+esc(edu.field):''}</div>
        <div style="color:#555;font-style:italic;">${esc(edu.school)}${edu.city?', '+esc(edu.city):''}</div>
        ${edu.thesis?`<div style="font-size:9pt;font-style:italic;color:#666;">${L('Thèse','Thesis')}: "${esc(edu.thesis)}"</div>`:''}
        ${edu.mention?`<div style="font-size:9pt;color:#888;">${esc(edu.mention)}</div>`:''}`);
    });
  }
  if (cv.experience?.length) {
    body += SH(L('Positions académiques & Expériences','Academic Positions & Experience'));
    cv.experience.forEach(exp => {
      body += ROW(`${esc(exp.start)}<br><span style="font-size:8pt;">${esc(exp.end)}</span>`,
        `<div style="font-weight:700;color:${pc};font-style:italic;">${esc(exp.role)}</div>
        <div style="color:#555;">${esc(exp.company)}${exp.location?', '+esc(exp.location):''}</div>
        ${buls(exp.bullets,'9pt','#333')}`);
    });
  }
  if (cv.projects?.length) {
    body += SH(L('Projets de Recherche','Research Projects'));
    cv.projects.forEach(pr => {
      body += ROW('Projet', `<div style="font-weight:700;color:${pc};">${esc(pr.name)}
        ${pr.link?` · ${projectLink(pr.link,'site',pc)}`:''}
        ${pr.github?` · ${projectLink(pr.github,'code',pc)}`:''}</div>
        <div style="font-style:italic;color:#444;margin-bottom:3px;">${esc(pr.techs?.join(', ')||'')}</div>
        <div style="color:#333;">${esc(pr.desc)}</div>
        ${pr.impact?`<div style="color:${ac};font-weight:600;">Impact: ${esc(pr.impact)}</div>`:''}`);
    });
  }
  if (cv.skills?.length) {
    body += SH(L('Compétences & Outils','Skills & Tools'));
    cv.skills.forEach(sg => {
      body += ROW(esc(sg.cat), `<span style="color:#333;">${esc(sg.items.join(' · '))}</span>`);
    });
  }
  if (cv.awards?.length) {
    body += SH(L('Prix & Distinctions','Awards & Honors'));
    cv.awards.forEach(a => { body += ROW(esc(a.year), `<strong>${esc(a.name)}</strong> — ${esc(a.org)}`); });
  }
  if (cv.languages?.length) {
    body += SH(L('Langues','Languages'));
    body += ROW('', cv.languages.map(l=>`<span style="margin-right:18px;"><strong>${esc(l.lang)}</strong>: ${esc(l.level)}</span>`).join(''));
  }

  const contacts = [p.email,p.phone,p.city,p.website,p.linkedin,p.github].filter(Boolean).map(esc).join('  ·  ');
  return wrapHTML(cv, d, lang, `
    <div style="padding:36px 52px;background:#fff;">
      <div style="text-align:center;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid ${pc};">
        ${d.showPhoto && p.photo ? `<img src="${p.photo}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;border:3px solid ${ac};display:block;margin:0 auto 10px;">` : ''}
        <h1 style="font-size:24pt;font-weight:400;margin:0;color:${pc};letter-spacing:1px;">${esc(p.name)}</h1>
        ${p.title?`<div style="font-size:12pt;color:#555;font-style:italic;margin-top:4px;">${esc(p.title)}</div>`:''}
        <div style="font-size:10pt;color:#888;margin-top:8px;">${contacts}</div>
      </div>
      ${body}
    </div>
  `, 'font-family:Palatino Linotype,Palatino,Georgia,serif;', false);
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 5 — OPENAI DARK (premium dark, gradient)
// ══════════════════════════════════════════════════════════════
function tOpenAIDark(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const pc = '#6366f1', ac = '#a5b4fc';
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;

  const SH = (t: string) => `<div style="display:flex;align-items:center;gap:8px;margin:14px 0 8px;"><div style="width:4px;height:16px;background:${pc};border-radius:2px;"></div><h2 style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${ac};margin:0;">${esc(t)}</h2></div>`;

  let left = '', right = '';

  if (d.showPhoto && p.photo) {
    left += `<div style="text-align:center;margin-bottom:14px;"><img src="${p.photo}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;border:3px solid ${pc};"></div>`;
  }

  left += `<h1 style="font-size:16pt;font-weight:700;color:#fff;margin-bottom:2px;line-height:1.2;">${esc(p.name)}</h1>
    <div style="font-size:9.5pt;color:${ac};margin-bottom:12px;">${esc(p.title)}</div>
    <div style="font-size:8.5pt;color:#8892a4;line-height:2;">
      ${p.email?`<div>✉ ${esc(p.email)}</div>`:''}
      ${p.phone?`<div>📞 ${esc(p.phone)}</div>`:''}
      ${p.city?`<div>📍 ${esc(p.city)}</div>`:''}
      ${p.linkedin?`<div style="word-break:break-all;">🔗 ${esc(p.linkedin)}</div>`:''}
      ${p.github?`<div style="word-break:break-all;">💻 ${esc(p.github)}</div>`:''}
    </div>`;

  if (cv.skills?.length) {
    left += SH(L('Compétences','Skills'));
    cv.skills.forEach(sg => {
      left += `<div style="margin-bottom:8px;"><div style="font-size:8pt;color:#8892a4;margin-bottom:3px;">${esc(sg.cat)}</div><div style="display:flex;flex-wrap:wrap;gap:3px;">${sg.items.map(i=>`<span style="background:${pc}20;border:1px solid ${pc}50;color:${ac};border-radius:3px;padding:1px 7px;font-size:8pt;">${esc(i)}</span>`).join('')}</div></div>`;
    });
  }
  if (cv.languages?.length) {
    left += SH(L('Langues','Languages'));
    cv.languages.forEach(l => { left += `<div style="font-size:8.5pt;margin-bottom:3px;"><span style="color:#fff;font-weight:600;">${esc(l.lang)}</span><span style="color:#8892a4;"> — ${esc(l.level)}</span></div>`; });
  }

  if (p.summary) {
    right += `<div style="background:${pc}15;border:1px solid ${pc}30;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:9.5pt;line-height:1.65;color:#c9d1d9;">${esc(p.summary)}</div>`;
  }

  if (cv.experience?.length) {
    right += SH(L('Expérience','Experience'));
    cv.experience.forEach(exp => {
      right += `<div style="margin-bottom:12px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:11px 13px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
          <span style="font-size:11pt;font-weight:700;color:${ac};">${esc(exp.role)}</span>
          <span style="font-size:8.5pt;color:#8892a4;">${esc(exp.start)} – ${esc(exp.end)}</span>
        </div>
        <div style="font-size:9pt;color:#8892a4;margin-bottom:5px;">${esc(exp.company)} · ${esc(exp.location)}</div>
        ${buls(exp.bullets,'9pt','#c9d1d9')}
        ${techChips(exp.techs, pc)}
      </div>`;
    });
  }

  if (cv.projects?.length) {
    right += SH(L('Projets','Projects'));
    cv.projects.forEach(pr => {
      right += `<div style="margin-bottom:10px;border:1px solid ${pc}40;border-radius:8px;padding:10px 13px;background:${pc}08;">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;">
          <strong style="font-size:10.5pt;color:#fff;">${esc(pr.name)}</strong>
          ${projectLink(pr.link||'','🌐',ac)} ${projectLink(pr.github||'','💻 GitHub',ac)}
        </div>
        <div style="font-size:9pt;color:#8892a4;margin-bottom:3px;">${esc(pr.desc)}</div>
        ${pr.impact?`<div style="font-size:8.5pt;color:${ac};font-weight:600;">📊 ${esc(pr.impact)}</div>`:''}
        ${pr.techs?.length?`<div style="margin-top:5px;">${pr.techs.map(t=>`<span style="background:#21262d;border:1px solid #30363d;color:#8892a4;border-radius:3px;padding:1px 7px;font-size:8pt;">${esc(t)}</span>`).join('')}</div>`:''}
      </div>`;
    });
  }

  if (cv.education?.length) {
    right += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      right += `<div style="margin-bottom:7px;"><div style="font-weight:700;font-size:10pt;color:#fff;">${esc(edu.degree)}${edu.field?' — '+esc(edu.field):''}</div>
        <div style="font-size:9pt;color:#8892a4;">${esc(edu.school)} · ${esc(edu.year)}</div>
        ${edu.mention?`<div style="font-size:8.5pt;color:${ac};">${esc(edu.mention)}</div>`:''}</div>`;
    });
  }

  return wrapHTML(cv, d, lang, `
    <div style="display:flex;min-height:100vh;">
      <div style="width:230px;flex-shrink:0;background:#0d1117;border-right:1px solid #30363d;padding:24px 18px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">${left}</div>
      <div style="flex:1;background:#0d1117;padding:24px 22px;">${right}</div>
    </div>
  `, 'background:#0d1117;color:#c9d1d9;', false);
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 6 — AMAZON BOLD (metrics-first, orange/navy)
// ══════════════════════════════════════════════════════════════
function tAmazonBold(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const orange = '#ff9900', navy = '#232f3e';
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;

  const SH = (t: string) => `<div style="margin:12px 0 6px;"><div style="background:${navy};color:#fff;padding:5px 12px;display:inline-block;font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">${esc(t)}</div><div style="height:1px;background:${orange};margin-top:-1px;"></div></div>`;

  let body = '';
  if (p.summary) { body += SH(L('Profil','Summary')); body += `<p style="font-size:9.5pt;line-height:1.7;color:#333;margin-bottom:6px;">${esc(p.summary)}</p>`; }

  if (cv.skills?.length) {
    body += SH(L('Compétences techniques','Technical Skills'));
    body += `<table style="width:100%;border-collapse:collapse;">`;
    for (let i = 0; i < cv.skills.length; i+=2) {
      body += `<tr>`;
      for (let j = i; j < Math.min(i+2, cv.skills.length); j++) {
        const sk = cv.skills[j];
        body += `<td style="padding:3px 8px 3px 0;vertical-align:top;width:50%;font-size:9pt;"><strong style="color:${navy};">${esc(sk.cat)}:</strong> ${esc(sk.items.join(', '))}</td>`;
      }
      body += `</tr>`;
    }
    body += `</table>`;
  }

  if (cv.experience?.length) {
    body += SH(L('Expériences — Impact Chiffré','Experience — Quantified Impact'));
    cv.experience.forEach(exp => {
      body += `<div style="margin-bottom:11px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:11pt;font-weight:800;color:${navy};">${esc(exp.company)}</span>
          <span style="font-size:9pt;color:#666;">${esc(exp.start)} – ${esc(exp.end)}</span>
        </div>
        <div style="font-size:10pt;color:${orange};font-weight:700;margin-bottom:4px;">${esc(exp.role)} · ${esc(exp.location)}</div>
        ${buls(exp.bullets,'9pt','#333')}
        ${techChips(exp.techs, navy)}
      </div>`;
    });
  }

  if (cv.projects?.length) {
    body += SH(L('Projets & Réalisations','Projects & Impact'));
    cv.projects.forEach(pr => {
      body += `<div style="margin-bottom:9px;">
        <span style="font-size:10.5pt;font-weight:700;color:${navy};">${esc(pr.name)}</span>
        ${projectLink(pr.link||'','🌐',orange)} ${projectLink(pr.github||'','💻',orange)}
        <span style="font-size:9pt;color:#555;"> | ${esc(pr.techs?.join(', ')||'')}</span>
        <p style="font-size:9pt;margin:3px 0;color:#333;">${esc(pr.desc)}</p>
        ${pr.impact?`<div style="font-size:9pt;color:${orange};font-weight:700;">📊 ${esc(pr.impact)}</div>`:''}
      </div>`;
    });
  }

  if (cv.education?.length) {
    body += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      body += `<div style="margin-bottom:6px;font-size:9pt;display:flex;justify-content:space-between;align-items:baseline;">
        <div><strong>${esc(edu.school)}</strong> — ${esc(edu.degree)}${edu.field?' · '+esc(edu.field):''}${edu.mention?' · '+esc(edu.mention):''}</div>
        <span style="color:#666;">${esc(edu.year)}</span>
      </div>`;
    });
  }

  if (cv.languages?.length || cv.interests?.length) {
    body += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">`;
    if (cv.languages?.length) { body += `<div>${SH(L('Langues','Languages'))}${cv.languages.map(l=>`<div style="font-size:9pt;margin-bottom:3px;"><strong>${esc(l.lang)}</strong> — ${esc(l.level)}</div>`).join('')}</div>`; }
    if (cv.interests?.length) { body += `<div>${SH(L("Centres d'intérêt",'Interests'))}${cv.interests.map(i=>`<div style="font-size:9pt;color:#444;margin-bottom:2px;">• ${esc(i)}</div>`).join('')}</div>`; }
    body += `</div>`;
  }

  const contacts = [p.email,p.phone,p.city,p.linkedin,p.github].filter(Boolean).map(esc).join(' | ');
  return wrapHTML(cv, d, lang, `
    <div style="background:${navy};padding:20px 28px;print-color-adjust:exact;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div style="display:flex;align-items:center;gap:14px;">
          ${d.showPhoto&&p.photo?`<img src="${p.photo}" style="width:85px;height:95px;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;border:2px solid ${orange};border-radius:2px;">`:'' }
          <div>
            <h1 style="font-size:24pt;font-weight:900;margin:0;color:#fff;">${esc(p.name)}</h1>
            <div style="font-size:12pt;color:${orange};font-weight:700;margin-top:3px;">${esc(p.title)}</div>
          </div>
        </div>
        <div style="text-align:right;font-size:9pt;color:rgba(255,255,255,.75);line-height:1.8;">${[p.email,p.phone,p.city].filter(Boolean).map(esc).join('<br>')}</div>
      </div>
      ${contacts?`<div style="font-size:9pt;color:rgba(255,255,255,.6);margin-top:8px;border-top:1px solid rgba(255,255,255,.15);padding-top:8px;">${contacts}</div>`:''}
    </div>
    <div style="padding:20px 28px;">${body}</div>
  `, '', false);
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 7 — GOOGLE CHIP (material design, colorful)
// ══════════════════════════════════════════════════════════════
function tGoogleChip(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const bl = d.primaryColor, ac = d.accentColor;
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;

  const SH = (t: string) => `<h3 style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${bl};border-bottom:2px solid ${bl};padding-bottom:3px;margin:12px 0 8px;">${esc(t)}</h3>`;
  const chip = (s: string) => `<span style="background:${bl}18;color:${bl};border:1px solid ${bl}40;border-radius:999px;padding:2px 10px;font-size:8.5pt;margin:2px;">${esc(s)}</span>`;

  let L_col = '', R_col = '';

  if (d.showPhoto && p.photo) L_col += `<div style="display:flex;justify-content:center;margin-bottom:12px;"><img src="${p.photo}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;border:3px solid ${bl};"></div>`;

  L_col += `<div style="font-size:9pt;color:#444;line-height:2.1;">
    ${p.email?`<div>✉ <a href="mailto:${esc(p.email)}" style="color:${bl};">${esc(p.email)}</a></div>`:''}
    ${p.phone?`<div>📞 ${esc(p.phone)}</div>`:''}
    ${p.city?`<div>📍 ${esc(p.city)}</div>`:''}
    ${p.linkedin?`<div>🔗 <a href="${esc(p.linkedin)}" style="color:${bl};">LinkedIn</a></div>`:''}
    ${p.github?`<div>💻 <a href="${esc(p.github)}" style="color:${bl};">GitHub</a></div>`:''}
  </div>`;

  if (cv.skills?.length) {
    L_col += SH(L('Compétences','Skills'));
    cv.skills.forEach(sg => {
      L_col += `<div style="margin-bottom:8px;"><div style="font-size:8.5pt;font-weight:600;color:#333;margin-bottom:4px;">${esc(sg.cat)}</div><div>${sg.items.map(chip).join('')}</div></div>`;
    });
  }
  if (cv.languages?.length) {
    L_col += SH(L('Langues','Languages'));
    cv.languages.forEach(l => { L_col += `<div style="font-size:9pt;margin-bottom:4px;"><strong style="color:${bl};">${esc(l.lang)}</strong><br><span style="color:#888;">${esc(l.level)}</span></div>`; });
  }
  if (cv.interests?.length) {
    L_col += SH(L("Centres d'intérêt",'Interests'));
    L_col += cv.interests.map(i=>`<div style="font-size:9pt;color:#555;margin-bottom:2px;">• ${esc(i)}</div>`).join('');
  }

  if (p.summary) { R_col += SH(L('À propos','About')); R_col += `<p style="font-size:9.5pt;line-height:1.7;color:#333;margin-bottom:8px;">${esc(p.summary)}</p>`; }

  if (cv.experience?.length) {
    R_col += SH(L('Expérience professionnelle','Experience'));
    cv.experience.forEach(exp => {
      R_col += `<div style="margin-bottom:11px;background:#fafafa;border-left:4px solid ${bl};border-radius:0 8px 8px 0;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-size:11pt;font-weight:700;color:${bl};">${esc(exp.company)}</span>
          <span style="font-size:9pt;background:${bl}15;color:${bl};padding:1px 8px;border-radius:4px;">${esc(exp.start)} – ${esc(exp.end)}</span>
        </div>
        <div style="font-size:9.5pt;color:#555;font-style:italic;margin-bottom:5px;">${esc(exp.role)} · ${esc(exp.location)}</div>
        ${buls(exp.bullets,'9pt','#333')}
        ${exp.techs?.length?`<div style="margin-top:5px;">${exp.techs.map(chip).join('')}</div>`:''}
      </div>`;
    });
  }

  if (cv.projects?.length) {
    R_col += SH(L('Projets','Projects'));
    R_col += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
    cv.projects.forEach(pr => {
      R_col += `<div style="border:1px solid #e8eaed;border-radius:8px;padding:10px;border-top:3px solid ${bl};">
        <div style="font-weight:700;font-size:10pt;color:#111;">${esc(pr.name)}</div>
        <div style="font-size:8.5pt;margin:2px 0;">${projectLink(pr.link||'','🌐 Demo',bl)} ${projectLink(pr.github||'','💻 GitHub',bl)}</div>
        <div style="font-size:9pt;color:#555;">${esc(pr.desc)}</div>
        ${pr.impact?`<div style="font-size:8.5pt;color:${bl};font-weight:700;margin-top:3px;">📊 ${esc(pr.impact)}</div>`:''}
        ${pr.techs?.length?`<div style="margin-top:5px;">${pr.techs.map(chip).join('')}</div>`:''}
      </div>`;
    });
    R_col += `</div>`;
  }

  if (cv.education?.length) {
    R_col += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      R_col += `<div style="margin-bottom:8px;background:#fafafa;border-left:4px solid ${ac};border-radius:0 8px 8px 0;padding:8px 12px;">
        <div style="font-weight:700;font-size:10.5pt;color:#111;">${esc(edu.school)}</div>
        <div style="font-size:9pt;color:${bl};">${esc(edu.degree)}${edu.field?' in '+esc(edu.field):''}${edu.mention?' — '+esc(edu.mention):''}</div>
        <div style="font-size:8.5pt;color:#888;">${esc(edu.year)}</div>
      </div>`;
    });
  }

  return wrapHTML(cv, d, lang, `
    <div style="background:${bl};padding:24px 28px;color:#fff;print-color-adjust:exact;">
      <h1 style="font-size:26pt;font-weight:700;margin:0;">${esc(p.name)}</h1>
      <div style="font-size:12pt;opacity:.9;margin-top:4px;">${esc(p.title)}</div>
      ${cv.targetRole?`<div style="font-size:10pt;opacity:.7;margin-top:2px;">🎯 ${esc('')}</div>`:''}
    </div>
    <div style="display:grid;grid-template-columns:220px 1fr;">
      <div style="border-right:1px solid #e8eaed;padding:18px 16px;">${L_col}</div>
      <div style="padding:18px 22px;">${R_col}</div>
    </div>
  `, '', false);
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE 8 — FAANG MINIMAL (Jake's style, ATS-optimized)
// ══════════════════════════════════════════════════════════════
function tFaangMinimal(cv: GeneratedCV, d: DesignConfig, lang: 'fr'|'en'): string {
  const p = cv.personal;
  const pc = d.primaryColor;
  const L = (fr: string, en: string) => lang === 'fr' ? fr : en;

  const SH = (t: string) => `<div style="margin:11px 0 5px;"><h2 style="font-size:10.5pt;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${pc};border-bottom:1.5px solid ${pc};padding-bottom:2px;margin:0;">${esc(t)}</h2></div>`;

  const contacts = [
    p.email&&`<a href="mailto:${esc(p.email)}" style="color:${pc};">${esc(p.email)}</a>`,
    p.phone&&esc(p.phone),
    p.city&&esc(p.city),
    p.linkedin&&`<a href="${esc(p.linkedin)}" style="color:${pc};">LinkedIn ↗</a>`,
    p.github&&`<a href="${esc(p.github)}" style="color:${pc};">GitHub ↗</a>`,
    p.website&&`<a href="${esc(p.website)}" style="color:${pc};">${esc(p.website)}</a>`,
  ].filter(Boolean).join(`<span style="color:#aaa;margin:0 4px;">|</span>`);

  let body = '';
  if (p.summary) { body += SH(L('Summary','Summary')); body += `<p style="font-size:10.5pt;line-height:1.65;margin:4px 0;">${esc(p.summary)}</p>`; }

  if (cv.experience?.length) {
    body += SH(L('Expérience','Experience'));
    cv.experience.forEach(exp => {
      body += `<div style="margin-bottom:9px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-size:11pt;font-weight:800;color:${pc};">${esc(exp.company)}</span>
          <span style="font-size:9.5pt;color:#555;">${esc(exp.location)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
          <span style="font-size:10.5pt;font-style:italic;color:#333;">${esc(exp.role)}</span>
          <span style="font-size:9.5pt;color:#555;">${esc(exp.start)} – ${esc(exp.end)}</span>
        </div>
        ${buls(exp.bullets,'10.5pt','#222')}
        ${exp.techs?.length?`<div style="margin-top:4px;font-size:9.5pt;color:#555;"><em>Technologies: ${esc(exp.techs.join(', '))}</em></div>`:''}
      </div>`;
    });
  }

  if (cv.projects?.length) {
    body += SH(L('Projets','Projects'));
    cv.projects.forEach(pr => {
      body += `<div style="margin-bottom:8px;">
        <div style="display:flex;align-items:baseline;gap:8px;">
          <strong style="font-size:11pt;color:${pc};">${esc(pr.name)}</strong>
          ${pr.techs?.length?`<em style="font-size:9.5pt;color:#555;">| ${esc(pr.techs.join(', '))}</em>`:''}
          ${projectLink(pr.link||'','🌐',pc)} ${projectLink(pr.github||'','GitHub ↗',pc)}
        </div>
        <div style="font-size:10.5pt;color:#333;margin-top:2px;">${esc(pr.desc)}</div>
        ${pr.impact?`<div style="font-size:10pt;color:${pc};font-weight:700;">📊 ${esc(pr.impact)}</div>`:''}
      </div>`;
    });
  }

  if (cv.skills?.length) {
    body += SH(L('Compétences','Technical Skills'));
    cv.skills.forEach(sk => { body += `<div style="font-size:10.5pt;margin-bottom:3px;"><strong>${esc(sk.cat)}:</strong> ${esc(sk.items.join(', '))}</div>`; });
  }

  if (cv.education?.length) {
    body += SH(L('Formation','Education'));
    cv.education.forEach(edu => {
      body += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:baseline;">
        <div>
          <span style="font-size:11pt;font-weight:800;">${esc(edu.school)}</span>
          <span style="font-size:10.5pt;color:#333;"> — ${esc(edu.degree)}${edu.field?' in '+esc(edu.field):''}${edu.mention?' · '+esc(edu.mention):''}</span>
        </div>
        <span style="font-size:9.5pt;color:#555;">${esc(edu.year)}</span>
      </div>`;
    });
  }

  if (cv.certifications?.length) {
    body += SH(L('Certifications','Certifications'));
    body += cv.certifications.map(c=>`<span style="font-size:10.5pt;margin-right:14px;"><strong>${esc(c.name)}</strong> — ${esc(c.issuer)} (${esc(c.year)})</span>`).join('');
  }

  if (cv.languages?.length) {
    body += SH(L('Langues','Languages'));
    body += `<div style="font-size:10.5pt;">${cv.languages.map(l=>`${esc(l.lang)}: <em>${esc(l.level)}</em>`).join('  ·  ')}</div>`;
  }

  return wrapHTML(cv, d, lang, `
    <div style="padding:32px 44px;">
      ${d.showPhoto&&p.photo?`<div style="float:right;margin-left:14px;"><img src="${p.photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;object-position:${d.photoX}% ${d.photoY}%;"></div>`:''}
      <h1 style="font-size:24pt;font-weight:900;margin:0 0 3px;letter-spacing:2px;text-transform:uppercase;color:${pc};">${esc(p.name)}</h1>
      ${p.title?`<div style="font-size:11pt;color:#444;margin-bottom:6px;">${esc(p.title)}</div>`:''}
      <div style="font-size:10pt;margin-bottom:4px;">${contacts}</div>
      ${body}
    </div>
  `, "font-family:'Times New Roman',Georgia,serif;", false);
}

// ── HTML wrapper ───────────────────────────────────────────────
function wrapHTML(cv: GeneratedCV, d: DesignConfig, lang: string, inner: string, extraBody: string, _logo: boolean): string {
  const esc2 = (s: string) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const font = d.fontFamily || 'Calibri,Segoe UI,Arial,sans-serif';
  const fSize = d.spacing === 'compact' ? '9.5pt' : d.spacing === 'spacious' ? '11pt' : '10.5pt';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CV — ${esc2(cv.personal.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:${font};font-size:${fSize};line-height:1.4;color:#222;background:#fff;${extraBody}}
a{color:inherit;text-decoration:none;}
*{print-color-adjust:exact;-webkit-print-color-adjust:exact;}
@media print{
  body{font-size:${d.spacing==='compact'?'9pt':d.spacing==='spacious'?'10.5pt':'9.5pt'};}
  @page{margin:0;size:A4;}
  .no-print{display:none!important;}
  *{print-color-adjust:exact;-webkit-print-color-adjust:exact;}
}
</style>
</head>
<body>${inner}</body>
</html>`;
}

// ── Template dispatcher ────────────────────────────────────────
export function renderTemplate(cv: GeneratedCV, id: TemplateId, design: DesignConfig, lang: 'fr'|'en'): string {
  switch (id) {
    case 'cascade':      return tCascade(cv, design, lang);
    case 'moderne':      return tModerne(cv, design, lang);
    case 'classique':    return tClassique(cv, design, lang);
    case 'stanford':     return tStanford(cv, design, lang);
    case 'openai-dark':  return tOpenAIDark(cv, design, lang);
    case 'amazon-bold':  return tAmazonBold(cv, design, lang);
    case 'google-chip':  return tGoogleChip(cv, design, lang);
    case 'faang-minimal':return tFaangMinimal(cv, design, lang);
    default:             return tCascade(cv, design, lang);
  }
}

export const TEMPLATE_META = [
  { id:'cascade'      as TemplateId, name:'Cascade',        emoji:'🔵', badge:'FR Pro',       primaryColor:'#1e3a5f', desc:'Sidebar navy · Photo · Barres compétences · Style FR' },
  { id:'moderne'      as TemplateId, name:'Moderne',         emoji:'🟢', badge:'Bilingue',     primaryColor:'#0d4a52', desc:'Header sombre · 2 colonnes · Badges teal' },
  { id:'classique'    as TemplateId, name:'Classique',       emoji:'⬜', badge:'Élégant',      primaryColor:'#1e3a5f', desc:'Bandeau coloré · Lignes épurées · ATS-ready' },
  { id:'stanford'     as TemplateId, name:'Stanford',        emoji:'🎓', badge:'Académique',   primaryColor:'#8c1515', desc:'Tableau bicolonne · Serif élégant · Académique/Recherche' },
  { id:'openai-dark'  as TemplateId, name:'OpenAI Dark',     emoji:'🌑', badge:'Premium',      primaryColor:'#6366f1', desc:'Dark mode · Chips indigo · GitHub-style · Tech/IA' },
  { id:'amazon-bold'  as TemplateId, name:'Amazon Bold',     emoji:'📦', badge:'Impact',       primaryColor:'#ff9900', desc:'Metrics-first · Orange/Navy · SDE Amazon-style' },
  { id:'google-chip'  as TemplateId, name:'Google Chip',     emoji:'🔵', badge:'Material',     primaryColor:'#1a73e8', desc:'Material Design · Chip skills · Cards · Google-style' },
  { id:'faang-minimal'as TemplateId, name:"Jake's FAANG",    emoji:'📄', badge:'ATS #1',       primaryColor:'#1a1a2e', desc:"Jake's Résumé · Ultra-minimal · ATS-optimisé · FAANG" },
];