// src/pages/AdminBlogPage.tsx — Code Forge Editor with MarkdownRenderer
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { apiFetch, getTags, getArticleById } from '../lib/api';
import type { Tag, Article } from '../types/blog';

function toSlug(t: string) {
  return t.toLowerCase().replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a').replace(/[ùûü]/g,'u').replace(/[ôö]/g,'o').replace(/[îï]/g,'i').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
}
function estimateReadTime(c: string) { return Math.max(1, Math.ceil(c.split(/\s+/).length / 250)); }

const Btn: React.FC<{ label: string; title: string; onClick: () => void }> = ({ label, title, onClick }) => (
  <button title={title} onClick={onClick}
    style={{ background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.2)', borderRadius:6, padding:'4px 10px', cursor:'pointer', color:'#00ff88', fontSize:12, fontFamily:'"JetBrains Mono",monospace', transition:'all .15s' }}
    onMouseEnter={e => (e.currentTarget.style.background='rgba(0,255,136,.18)')}
    onMouseLeave={e => (e.currentTarget.style.background='rgba(0,255,136,.08)')}
  >{label}</button>
);

const AdminBlogPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [title,        setTitle]        = useState('');
  const [slug,         setSlug]         = useState('');
  const [slugManual,   setSlugManual]   = useState(false);
  const [excerpt,      setExcerpt]      = useState('');
  const [content,      setContent]      = useState('');
  const [coverImage,   setCoverImage]   = useState('');
  const [status,       setStatus]       = useState<'draft'|'published'>('draft');
  const [featured,     setFeatured]     = useState(false);
  const [series,       setSeries]       = useState('');
  const [seriesOrder,  setSeriesOrder]  = useState<number|''>('');
  const [seoTitle,     setSeoTitle]     = useState('');
  const [seoDesc,      setSeoDesc]      = useState('');
  const [seoKeywords,  setSeoKeywords]  = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags,      setAllTags]      = useState<Tag[]>([]);
  const [preview,      setPreview]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);
  const [activeSection, setActiveSection] = useState<'content'|'meta'|'seo'>('content');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auth protection
  useEffect(() => {
    const token = localStorage.getItem('blog_token');
    const user  = JSON.parse(localStorage.getItem('blog_user') || '{}');
    if (!token || user?.role !== 'admin') navigate('/admin');
  }, [navigate]);

  const handleLogout = () => { localStorage.removeItem('blog_token'); localStorage.removeItem('blog_user'); navigate('/admin'); };

  useEffect(() => { getTags().then((t: Tag[]) => setAllTags(t)).catch(() => {}); }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    getArticleById(id).then((a: Article) => {
      setTitle(a.title); setSlug(a.slug); setSlugManual(true); setExcerpt(a.excerpt); setContent(a.content);
      setCoverImage(a.coverImage ?? ''); setStatus(a.status); setFeatured(a.featured);
      setSeries(a.series ?? ''); setSeriesOrder(a.seriesOrder ?? '');
      setSeoTitle(a.seo?.title ?? ''); setSeoDesc(a.seo?.description ?? '');
      setSeoKeywords((a.seo?.keywords ?? []).join(', '));
      setSelectedTags(a.tags.map((t: Tag) => t._id));
    }).catch(() => setError('Article introuvable'));
  }, [id, isEdit]);

  useEffect(() => { if (!slugManual && title) setSlug(toSlug(title)); }, [title, slugManual]);

  const wc = content.split(/\s+/).filter(Boolean).length;
  const rt = estimateReadTime(content);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's')     { e.preventDefault(); doSave('draft'); }
      if (e.ctrlKey && e.key === 'p')     { e.preventDefault(); setPreview(p => !p); }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); doSave('published'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const ins = useCallback((b: string, a = '', ph = '') => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = content.slice(s, e) || ph;
    setContent(content.slice(0, s) + b + sel + a + content.slice(e));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + b.length, s + b.length + sel.length); }, 0);
  }, [content]);

  const handleUpload = async (file: File) => {
    setUploadingImg(true);
    try {
      const form = new FormData(); form.append('image', file);
      const token = localStorage.getItem('blog_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, { method:'POST', headers: token ? { Authorization:`Bearer ${token}` } : {}, body: form });
      const d = await res.json();
      if (d.url) ins(`![Image](${d.url})`, '', '');
    } catch { setError('Erreur upload'); } finally { setUploadingImg(false); }
  };

  const doSave = async (s: 'draft'|'published') => {
    if (!title.trim()) { setError('Titre requis'); return; }
    if (!content.trim()) { setError('Contenu requis'); return; }
    setSaving(true); setError('');
    try {
      const payload = { title, slug, excerpt, content, coverImage, status: s, featured, series: series||undefined, seriesOrder: seriesOrder||undefined, tags: selectedTags, seo: { title: seoTitle||undefined, description: seoDesc||undefined, keywords: seoKeywords.split(',').map(k => k.trim()).filter(Boolean) } };
      if (isEdit && id) await apiFetch(`/articles/${id}`, { method:'PUT', body:JSON.stringify(payload) });
      else await apiFetch('/articles', { method:'POST', body:JSON.stringify(payload) });
      setStatus(s); setSaved(true); setTimeout(() => setSaved(false), 3000);
      if (s === 'published') navigate('/blog');
    } catch (e: any) { setError(e?.error || 'Erreur sauvegarde'); } finally { setSaving(false); }
  };

  //const fi = (s: TemplateStringsArray | string, ...v: any[]) => typeof s === 'string' ? s : String.raw({ raw: s }, ...v);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&family=Lora:ital,wght@0,400;1,400&display=swap');
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes scanln{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        .adm *{box-sizing:border-box;margin:0;padding:0}
        .adm textarea,.adm input,.adm select{font-family:"JetBrains Mono",monospace}
        .adm textarea:focus,.adm input:focus,.adm select:focus{outline:none}
        .adm textarea::placeholder,.adm input::placeholder{color:rgba(0,255,136,.25)}
        .fl{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:2px;color:rgba(0,255,136,.6);text-transform:uppercase;margin-bottom:8px;display:block}
        .fi{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(0,255,136,.15);border-radius:8px;padding:10px 14px;color:#c8d2ff;font-size:13px;transition:border-color .2s}
        .fi:focus{border-color:rgba(0,255,136,.5)}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(0,255,136,.2);border-radius:2px}
      `}</style>

      <div className="adm" style={{ minHeight:'100vh', background:'#080c14', color:'#c8d2ff', fontFamily:'"JetBrains Mono",monospace' }}>
        <div style={{ position:'fixed', top:0, left:0, right:0, height:2, background:'linear-gradient(transparent,rgba(0,255,136,.05),transparent)', animation:'scanln 10s linear infinite', pointerEvents:'none', zIndex:100 }} />
        <div style={{ position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(0,255,136,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.03) 1px,transparent 1px)', backgroundSize:'48px 48px', pointerEvents:'none', zIndex:0 }} />

        {/* TOPBAR */}
        <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(8,12,20,.95)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(0,255,136,.1)', padding:'0 24px' }}>
          <div style={{ maxWidth:1400, margin:'0 auto', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 }}>
              <div style={{ display:'flex', gap:6 }}>
                {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} onClick={() => navigate('/blog')} style={{ width:10, height:10, borderRadius:'50%', background:c, cursor:'pointer' }} />)}
              </div>
              <span style={{ fontSize:11, color:'rgba(0,255,136,.5)' }}>{isEdit ? '~/blog/edit' : '~/blog/new'}</span>
              <span style={{ color:'rgba(0,255,136,.3)' }}>›</span>
              <span style={{ fontSize:12, color:'rgba(200,210,255,.6)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title || 'sans-titre.md'}</span>
              <div style={{ padding:'2px 10px', borderRadius:4, fontSize:10, letterSpacing:2, background:status==='published'?'rgba(0,255,136,.15)':'rgba(254,188,46,.1)', color:status==='published'?'#00ff88':'#febc2e', border:`1px solid ${status==='published'?'rgba(0,255,136,.3)':'rgba(254,188,46,.3)'}`, whiteSpace:'nowrap' }}>
                {status === 'published' ? '● PUBLIÉ' : '○ BROUILLON'}
              </div>
              {saved && <span style={{ fontSize:11, color:'#00ff88', animation:'fadeIn .3s ease' }}>✓ Sauvegardé</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:11, color:'rgba(200,210,255,.35)' }}>{wc} mots · {rt} min</span>
              <button onClick={() => setPreview(!preview)} style={{ background:preview?'rgba(97,218,251,.15)':'rgba(255,255,255,.04)', border:`1px solid ${preview?'rgba(97,218,251,.4)':'rgba(255,255,255,.1)'}`, borderRadius:6, padding:'6px 14px', cursor:'pointer', color:preview?'#61dafb':'rgba(200,210,255,.6)', fontSize:11 }}>
                {preview ? '⌨ Éditer' : '👁 Aperçu'}
              </button>
              <button onClick={() => doSave('draft')} disabled={saving} style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', borderRadius:6, padding:'6px 14px', cursor:'pointer', color:'rgba(200,210,255,.6)', fontSize:11, opacity:saving?.5:1 }}>
                {saving ? '...' : '💾 Brouillon'}
              </button>
              <button onClick={() => doSave('published')} disabled={saving} style={{ background:'rgba(0,255,136,.15)', border:'1px solid rgba(0,255,136,.4)', borderRadius:8, padding:'6px 18px', cursor:'pointer', color:'#00ff88', fontSize:11, fontWeight:700, opacity:saving?.5:1 }}>
                {saving ? '...' : '🚀 Publier'}
              </button>
              <button onClick={handleLogout} title="Se déconnecter"
                style={{ background:'transparent', border:'1px solid rgba(255,100,100,.2)', borderRadius:6, padding:'6px 10px', cursor:'pointer', color:'rgba(255,100,100,.45)', fontSize:13, transition:'all .2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,100,100,.6)'; e.currentTarget.style.color='rgba(255,100,100,.9)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,100,100,.2)'; e.currentTarget.style.color='rgba(255,100,100,.45)'; }}
              >⏻</button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background:'rgba(255,60,60,.1)', border:'1px solid rgba(255,60,60,.3)', margin:'16px 24px', borderRadius:8, padding:'10px 16px', fontSize:12, color:'rgba(255,120,120,.9)', display:'flex', justifyContent:'space-between' }}>
            <span>⚠ {error}</span>
            <button onClick={() => setError('')} style={{ background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,120,120,.7)', fontSize:16 }}>×</button>
          </div>
        )}

        <div style={{ maxWidth:1400, margin:'0 auto', padding:'24px', display:'grid', gridTemplateColumns:'1fr 380px', gap:20, position:'relative', zIndex:1 }}>

          {/* LEFT */}
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

            <textarea value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de l'article..." rows={2}
              style={{ width:'100%', background:'transparent', border:'none', borderBottom:'2px solid rgba(0,255,136,.2)', padding:'8px 0', color:'#f0f4ff', fontFamily:'"Syne",sans-serif', fontSize:'clamp(22px,3vw,36px)', fontWeight:800, lineHeight:1.2, marginBottom:20, resize:'none', transition:'border-color .2s' }}
              onFocus={e => (e.target.style.borderBottomColor='rgba(0,255,136,.6)')}
              onBlur={e  => (e.target.style.borderBottomColor='rgba(0,255,136,.2)')}
            />

            <div style={{ marginBottom:20 }}>
              <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Résumé accrocheur (160 chars max)..." rows={2} maxLength={300}
                style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,.06)', padding:'6px 0', color:'rgba(200,210,255,.65)', fontFamily:'"Lora",serif', fontSize:15, fontStyle:'italic', lineHeight:1.6, resize:'none' }}
              />
              <div style={{ textAlign:'right', fontSize:10, color:'rgba(200,210,255,.25)' }}>{excerpt.length}/300</div>
            </div>

            {!preview && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', padding:'10px 0', borderTop:'1px solid rgba(0,255,136,.08)', borderBottom:'1px solid rgba(0,255,136,.08)', marginBottom:12 }}>
                <Btn label="H1"     title="Titre 1"         onClick={() => ins('# ','','Titre')} />
                <Btn label="H2"     title="Titre 2"         onClick={() => ins('## ','','Titre')} />
                <Btn label="H3"     title="Titre 3"         onClick={() => ins('### ','','Titre')} />
                <Btn label="**B**"  title="Gras"            onClick={() => ins('**','**','texte')} />
                <Btn label="_I_"    title="Italique"        onClick={() => ins('*','*','texte')} />
                <Btn label="~~S~~"  title="Barré"           onClick={() => ins('~~','~~','texte')} />
                <Btn label="`c`"    title="Code inline"     onClick={() => ins('`','`','code')} />
                <Btn label="```"    title="Bloc code"       onClick={() => ins('```\n','\n```','code ici  ← spécifie le langage ex: ```python')} />
                <Btn label=">cite"  title="Citation"        onClick={() => ins('> ','','citation')} />
                <Btn label="- li"   title="Liste"           onClick={() => ins('- ','','item')} />
                <Btn label="1. ol"  title="Liste numérotée" onClick={() => ins('1. ','','item')} />
                <Btn label="☑ task" title="Tâche"           onClick={() => ins('- [x] ','','tâche')} />
                <Btn label="table"  title="Tableau"         onClick={() => ins('| Col 1 | Col 2 |\n| --- | --- |\n| ','','val | val |')} />
                <Btn label="[lien]" title="Lien"            onClick={() => ins('[','](url)','texte')} />
                <Btn label="![img]" title="Image URL"       onClick={() => ins('![','](https://)','alt')} />
                <Btn label="$math"  title="Math inline"     onClick={() => ins('$','$','x^2')} />
                <Btn label="$$"     title="Math bloc"       onClick={() => ins('$$\n','\n$$','E=mc^2')} />
                <Btn label="---"    title="Séparateur"      onClick={() => ins('\n---\n','','')} />
                <label style={{ background:'rgba(97,218,251,.08)', border:'1px solid rgba(97,218,251,.2)', borderRadius:6, padding:'4px 10px', cursor:'pointer', color:'#61dafb', fontSize:12, fontFamily:'"JetBrains Mono",monospace', display:'flex', alignItems:'center', gap:6 }}>
                  {uploadingImg ? <span style={{ animation:'pulse 1s infinite' }}>⬆...</span> : '⬆ Upload'}
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                </label>
              </div>
            )}

            {!preview ? (
              <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value)}
                placeholder={`# Titre principal\n\nCommence ici...\n\n\`\`\`python\nprint("Vibe coding")\n\`\`\`\n\n| Col | Col |\n|-----|-----|\n| val | val |\n\n- [x] Tâche\n- [ ] À faire\n\n$$E = mc^2$$`}
                style={{ width:'100%', minHeight:'65vh', background:'rgba(0,0,0,.2)', border:'1px solid rgba(0,255,136,.1)', borderRadius:12, padding:'20px 24px', color:'#c8d2ff', fontSize:14, lineHeight:2, transition:'border-color .2s', resize:'none' }}
                onFocus={e => (e.target.style.borderColor='rgba(0,255,136,.3)')}
                onBlur={e  => (e.target.style.borderColor='rgba(0,255,136,.1)')}
              />
            ) : (
              <div style={{ minHeight:'65vh', background:'rgba(0,0,0,.2)', border:'1px solid rgba(0,255,136,.15)', borderRadius:12, padding:'28px 32px', overflowY:'auto' }}>
                {content
                  ? <MarkdownRenderer content={content} preview />
                  : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'rgba(0,255,136,.2)', fontSize:13 }}>
                      <span style={{ animation:'blink 2s step-end infinite' }}>▋</span>&nbsp;Commence à écrire...
                    </div>
                }
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,.03)', borderRadius:8, padding:4 }}>
              {(['content','meta','seo'] as const).map(s => (
                <button key={s} onClick={() => setActiveSection(s)} style={{ flex:1, padding:'7px 0', borderRadius:6, cursor:'pointer', fontSize:10, letterSpacing:1, border:'none', transition:'all .2s', background:activeSection===s?'rgba(0,255,136,.12)':'transparent', color:activeSection===s?'#00ff88':'rgba(200,210,255,.4)' }}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            {activeSection === 'content' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>
                <div>
                  <span className="fl">Image de couverture</span>
                  {coverImage && (
                    <div style={{ position:'relative', marginBottom:8, borderRadius:8, overflow:'hidden', height:120 }}>
                      <img src={coverImage} alt="cover" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.7)' }} />
                      <button onClick={() => setCoverImage('')} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.6)', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer', color:'#ff6b6b', fontSize:11 }}>✕</button>
                    </div>
                  )}
                  <input className="fi" value={coverImage} onChange={e => setCoverImage(e.target.value)} placeholder="https://..." />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <span className="fl">Statut</span>
                    <select value={status} onChange={e => setStatus(e.target.value as any)} className="fi" style={{ cursor:'pointer' }}>
                      <option value="draft">Brouillon</option>
                      <option value="published">Publié</option>
                    </select>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 14px', background:'rgba(0,0,0,.3)', border:`1px solid ${featured?'rgba(0,255,136,.4)':'rgba(0,255,136,.1)'}`, borderRadius:8, transition:'all .2s' }}>
                      <div style={{ width:20, height:20, borderRadius:4, background:featured?'#00ff88':'transparent', border:`2px solid ${featured?'#00ff88':'rgba(0,255,136,.3)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {featured && <span style={{ fontSize:12, color:'#080c14', fontWeight:700 }}>✓</span>}
                      </div>
                      <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} style={{ display:'none' }} />
                      <span style={{ fontSize:11, color:featured?'#00ff88':'rgba(200,210,255,.5)' }}>★ Featured</span>
                    </label>
                  </div>
                </div>
                <div>
                  <span className="fl">Tags</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {allTags.map((tag: Tag) => {
                      const sel = selectedTags.includes(tag._id);
                      return (
                        <button key={tag._id} onClick={() => setSelectedTags(prev => sel ? prev.filter(x => x !== tag._id) : [...prev, tag._id])}
                          style={{ padding:'4px 12px', borderRadius:6, fontSize:11, cursor:'pointer', background:sel?`${tag.color}22`:'rgba(255,255,255,.04)', border:`1px solid ${sel?tag.color:'rgba(255,255,255,.08)'}`, color:sel?tag.color:'rgba(200,210,255,.45)', transition:'all .2s' }}
                        >{tag.name}</button>
                      );
                    })}
                    {allTags.length === 0 && <span style={{ fontSize:11, color:'rgba(200,210,255,.3)' }}>Aucun tag — POST /api/tags</span>}
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10 }}>
                  <div><span className="fl">Série</span><input className="fi" value={series} onChange={e => setSeries(e.target.value)} placeholder="Oracle Cloud Chronicles" /></div>
                  <div><span className="fl">Ordre</span><input className="fi" type="number" min={1} value={seriesOrder} onChange={e => setSeriesOrder(Number(e.target.value)||'')} placeholder="1" /></div>
                </div>
              </div>
            )}

            {activeSection === 'meta' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>
                <div>
                  <span className="fl">Slug URL</span>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(0,255,136,.4)', fontSize:11 }}>/blog/</span>
                    <input className="fi" value={slug} onChange={e => { setSlug(e.target.value); setSlugManual(true); }} style={{ paddingLeft:52 }} placeholder="mon-article-slug" />
                  </div>
                  {!slugManual && title && <span style={{ fontSize:10, color:'rgba(0,255,136,.4)', marginTop:4, display:'block' }}>↳ auto-généré</span>}
                </div>
                <div style={{ padding:'12px 14px', background:'rgba(0,255,136,.04)', border:'1px solid rgba(0,255,136,.1)', borderRadius:8 }}>
                  <div style={{ fontSize:11, color:'rgba(0,255,136,.6)', marginBottom:8 }}>Statistiques</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    {[{l:'Mots',v:wc},{l:'Lecture',v:`${rt}min`},{l:'Chars',v:content.length}].map(s => (
                      <div key={s.l} style={{ textAlign:'center' }}>
                        <div style={{ fontSize:18, fontFamily:'"Syne",sans-serif', fontWeight:800, color:'#00ff88' }}>{s.v}</div>
                        <div style={{ fontSize:10, color:'rgba(200,210,255,.4)', marginTop:2 }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {(title||excerpt||coverImage) && (
                  <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid rgba(255,255,255,.06)' }}>
                    <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', padding:'6px 12px', borderBottom:'1px solid rgba(255,255,255,.05)', letterSpacing:2 }}>APERÇU CARTE</div>
                    {coverImage && <div style={{ height:80, overflow:'hidden' }}><img src={coverImage} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.6)' }} /></div>}
                    <div style={{ padding:'10px 12px' }}>
                      <div style={{ fontSize:13, fontFamily:'"Syne",sans-serif', fontWeight:700, color:'#c8d2ff', lineHeight:1.3, marginBottom:6 }}>{title||'Sans titre'}</div>
                      <div style={{ fontSize:11, color:'rgba(200,210,255,.45)', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{excerpt||'Résumé...'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'seo' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>
                <div>
                  <span className="fl">Titre SEO</span>
                  <input className="fi" value={seoTitle} onChange={e => setSeoTitle(e.target.value)} placeholder={title||"Titre Google"} />
                  <div style={{ textAlign:'right', fontSize:10, color:(seoTitle||title).length>60?'#ff6b6b':'rgba(200,210,255,.25)', marginTop:4 }}>{(seoTitle||title).length}/60</div>
                </div>
                <div>
                  <span className="fl">Meta description</span>
                  <textarea className="fi" value={seoDesc} onChange={e => setSeoDesc(e.target.value)} placeholder={excerpt||"160 chars max"} rows={3} style={{ resize:'vertical' }} />
                  <div style={{ textAlign:'right', fontSize:10, color:(seoDesc||excerpt).length>160?'#ff6b6b':'rgba(200,210,255,.25)', marginTop:4 }}>{(seoDesc||excerpt).length}/160</div>
                </div>
                <div>
                  <span className="fl">Mots-clés</span>
                  <input className="fi" value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} placeholder="python, oracle cloud, vibe coding" />
                </div>
                <div style={{ padding:'14px', background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)', borderRadius:8 }}>
                  <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:10 }}>APERÇU GOOGLE</div>
                  <div style={{ fontSize:13, color:'#8ab4f8', marginBottom:4, fontFamily:'sans-serif' }}>{seoTitle||title||"Titre"}</div>
                  <div style={{ fontSize:11, color:'rgba(26,200,80,.8)', marginBottom:6, fontFamily:'sans-serif' }}>adjoumani-koffi.com/blog/{slug||'slug'}</div>
                  <div style={{ fontSize:11, color:'rgba(200,200,200,.6)', lineHeight:1.5, fontFamily:'sans-serif', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{seoDesc||excerpt||"Description..."}</div>
                </div>
              </div>
            )}

            <div style={{ marginTop:'auto', padding:'12px', background:'rgba(0,0,0,.2)', borderRadius:8, border:'1px solid rgba(255,255,255,.04)' }}>
              <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:8 }}>MARKDOWN SUPPORTÉ</div>
              {[['GFM','Tables, ~~barré~~, task lists'],['Code','Coloration 50+ langages'],['Math','LaTeX $inline$ et $$bloc$$'],['Slugs','Ancres auto H1–H6'],['Images','Upload + légende'],['XSS','Protection sanitize']].map(([k,v]) => (
                <div key={k} style={{ display:'flex', gap:8, fontSize:10, color:'rgba(200,210,255,.35)', marginBottom:3 }}>
                  <code style={{ color:'rgba(0,255,136,.5)', minWidth:44 }}>{k}</code><span>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ padding:'10px 12px', background:'rgba(0,0,0,.2)', borderRadius:8, border:'1px solid rgba(255,255,255,.04)' }}>
              <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:6 }}>RACCOURCIS</div>
              {[['Ctrl+S','Brouillon'],['Ctrl+P','Aperçu'],['Ctrl+↵','Publier']].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'rgba(200,210,255,.35)', marginBottom:3 }}>
                  <code style={{ color:'rgba(0,255,136,.5)' }}>{k}</code><span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminBlogPage;
















// // src/pages/AdminBlogPage.tsx — Code Forge Editor with MarkdownRenderer
// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import { useNavigate, useParams } from 'react-router-dom';
// import MarkdownRenderer from '../components/MarkdownRenderer';
// import { apiFetch, getTags, getArticle } from '../lib/api';
// import type { Tag, Article } from '../types/blog';





// function toSlug(t: string) {
//   return t.toLowerCase().replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a').replace(/[ùûü]/g,'u').replace(/[ôö]/g,'o').replace(/[îï]/g,'i').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
// }
// function estimateReadTime(c: string) { return Math.max(1, Math.ceil(c.split(/\s+/).length / 250)); }

// const Btn: React.FC<{ label: string; title: string; onClick: () => void }> = ({ label, title, onClick }) => (
//   <button title={title} onClick={onClick}
//     style={{ background:'rgba(0,255,136,.08)', border:'1px solid rgba(0,255,136,.2)', borderRadius:6, padding:'4px 10px', cursor:'pointer', color:'#00ff88', fontSize:12, fontFamily:'"JetBrains Mono",monospace', transition:'all .15s' }}
//     onMouseEnter={e => (e.currentTarget.style.background='rgba(0,255,136,.18)')}
//     onMouseLeave={e => (e.currentTarget.style.background='rgba(0,255,136,.08)')}
//   >{label}</button>
// );

// const AdminBlogPage: React.FC = () => {
//   const { id } = useParams<{ id?: string }>();
//   const navigate = useNavigate();
//   const isEdit = !!id;

//   const [title,        setTitle]        = useState('');
//   const [slug,         setSlug]         = useState('');
//   const [slugManual,   setSlugManual]   = useState(false);
//   const [excerpt,      setExcerpt]      = useState('');
//   const [content,      setContent]      = useState('');
//   const [coverImage,   setCoverImage]   = useState('');
//   const [status,       setStatus]       = useState<'draft'|'published'>('draft');
//   const [featured,     setFeatured]     = useState(false);
//   const [series,       setSeries]       = useState('');
//   const [seriesOrder,  setSeriesOrder]  = useState<number|''>('');
//   const [seoTitle,     setSeoTitle]     = useState('');
//   const [seoDesc,      setSeoDesc]      = useState('');
//   const [seoKeywords,  setSeoKeywords]  = useState('');
//   const [selectedTags, setSelectedTags] = useState<string[]>([]);
//   const [allTags,      setAllTags]      = useState<Tag[]>([]);
//   const [preview,      setPreview]      = useState(false);
//   const [saving,       setSaving]       = useState(false);
//   const [saved,        setSaved]        = useState(false);
//   const [error,        setError]        = useState('');
//   const [uploadingImg, setUploadingImg] = useState(false);
//   const [activeSection, setActiveSection] = useState<'content'|'meta'|'seo'>('content');
//   const taRef = useRef<HTMLTextAreaElement>(null);

//   // Auth protection
//   useEffect(() => {
//     const token = localStorage.getItem('blog_token');
//     const user  = JSON.parse(localStorage.getItem('blog_user') || '{}');
//     if (!token || user?.role !== 'admin') navigate('/blog-admin');
//   }, [navigate]);

//   const handleLogout = () => { 
//     localStorage.removeItem('blog_token'); 
//     localStorage.removeItem('blog_user'); 
//     navigate('/blog-admin'); 
//   };

//   useEffect(() => { getTags().then((t: Tag[]) => setAllTags(t)).catch(() => {}); }, []);

//   useEffect(() => {
//     if (!isEdit || !id) return;
//     getArticle(id).then((a: Article) => {
//       setTitle(a.title); setSlug(a.slug); setSlugManual(true); setExcerpt(a.excerpt); setContent(a.content);
//       setCoverImage(a.coverImage ?? ''); setStatus(a.status); setFeatured(a.featured);
//       setSeries(a.series ?? ''); setSeriesOrder(a.seriesOrder ?? '');
//       setSeoTitle(a.seo?.title ?? ''); setSeoDesc(a.seo?.description ?? '');
//       setSeoKeywords((a.seo?.keywords ?? []).join(', '));
//       setSelectedTags(a.tags.map((t: Tag) => t._id));
//     }).catch(() => setError('Article introuvable'));
//   }, [id, isEdit]);

//   useEffect(() => { if (!slugManual && title) setSlug(toSlug(title)); }, [title, slugManual]);

//   const wc = content.split(/\s+/).filter(Boolean).length;
//   const rt = estimateReadTime(content);

//   useEffect(() => {
//     const h = (e: KeyboardEvent) => {
//       if (e.ctrlKey && e.key === 's')     { e.preventDefault(); doSave('draft'); }
//       if (e.ctrlKey && e.key === 'p')     { e.preventDefault(); setPreview(p => !p); }
//       if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); doSave('published'); }
//     };
//     window.addEventListener('keydown', h);
//     return () => window.removeEventListener('keydown', h);
//   });

//   const ins = useCallback((b: string, a = '', ph = '') => {
//     const ta = taRef.current; if (!ta) return;
//     const s = ta.selectionStart, e = ta.selectionEnd;
//     const sel = content.slice(s, e) || ph;
//     setContent(content.slice(0, s) + b + sel + a + content.slice(e));
//     setTimeout(() => { ta.focus(); ta.setSelectionRange(s + b.length, s + b.length + sel.length); }, 0);
//   }, [content]);

//   const handleUpload = async (file: File) => {
//     setUploadingImg(true);
//     try {
//       const form = new FormData(); form.append('image', file);
//       const token = localStorage.getItem('blog_token');
//       const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, { method:'POST', headers: token ? { Authorization:`Bearer ${token}` } : {}, body: form });
//       const d = await res.json();
//       if (d.url) ins(`![Image](${d.url})`, '', '');
//     } catch { setError('Erreur upload'); } finally { setUploadingImg(false); }
//   };

//   const doSave = async (s: 'draft'|'published') => {
//     if (!title.trim()) { setError('Titre requis'); return; }
//     if (!content.trim()) { setError('Contenu requis'); return; }
//     setSaving(true); setError('');
//     try {
//       const payload = { title, slug, excerpt, content, coverImage, status: s, featured, series: series||undefined, seriesOrder: seriesOrder||undefined, tags: selectedTags, seo: { title: seoTitle||undefined, description: seoDesc||undefined, keywords: seoKeywords.split(',').map(k => k.trim()).filter(Boolean) } };
//       if (isEdit && id) await apiFetch(`/articles/${id}`, { method:'PUT', body:JSON.stringify(payload) });
//       else await apiFetch('/articles', { method:'POST', body:JSON.stringify(payload) });
//       setStatus(s); setSaved(true); setTimeout(() => setSaved(false), 3000);
//       if (s === 'published') navigate('/blog');
//     } catch (e: any) { setError(e?.error || 'Erreur sauvegarde'); } finally { setSaving(false); }
//   };

//   const fi = (s: TemplateStringsArray | string, ...v: any[]) => typeof s === 'string' ? s : String.raw({ raw: s }, ...v);

//   return (
//     <>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&family=Lora:ital,wght@0,400;1,400&display=swap');
//         @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
//         @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
//         @keyframes scanln{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
//         @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
//         .adm *{box-sizing:border-box;margin:0;padding:0}
//         .adm textarea,.adm input,.adm select{font-family:"JetBrains Mono",monospace}
//         .adm textarea:focus,.adm input:focus,.adm select:focus{outline:none}
//         .adm textarea::placeholder,.adm input::placeholder{color:rgba(0,255,136,.25)}
//         .fl{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:2px;color:rgba(0,255,136,.6);text-transform:uppercase;margin-bottom:8px;display:block}
//         .fi{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(0,255,136,.15);border-radius:8px;padding:10px 14px;color:#c8d2ff;font-size:13px;transition:border-color .2s}
//         .fi:focus{border-color:rgba(0,255,136,.5)}
//         ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(0,255,136,.2);border-radius:2px}
//       `}</style>

//       <div className="adm" style={{ minHeight:'100vh', background:'#080c14', color:'#c8d2ff', fontFamily:'"JetBrains Mono",monospace' }}>
//         <div style={{ position:'fixed', top:0, left:0, right:0, height:2, background:'linear-gradient(transparent,rgba(0,255,136,.05),transparent)', animation:'scanln 10s linear infinite', pointerEvents:'none', zIndex:100 }} />
//         <div style={{ position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(0,255,136,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.03) 1px,transparent 1px)', backgroundSize:'48px 48px', pointerEvents:'none', zIndex:0 }} />

//         {/* TOPBAR */}
//         <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(8,12,20,.95)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(0,255,136,.1)', padding:'0 24px' }}>
//           <div style={{ maxWidth:1400, margin:'0 auto', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
//             <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 }}>
//               <div style={{ display:'flex', gap:6 }}>
//                 {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} onClick={() => navigate('/blog')} style={{ width:10, height:10, borderRadius:'50%', background:c, cursor:'pointer' }} />)}
//               </div>
//               <span style={{ fontSize:11, color:'rgba(0,255,136,.5)' }}>{isEdit ? '~/blog/edit' : '~/blog/new'}</span>
//               <span style={{ color:'rgba(0,255,136,.3)' }}>›</span>
//               <span style={{ fontSize:12, color:'rgba(200,210,255,.6)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title || 'sans-titre.md'}</span>
//               <div style={{ padding:'2px 10px', borderRadius:4, fontSize:10, letterSpacing:2, background:status==='published'?'rgba(0,255,136,.15)':'rgba(254,188,46,.1)', color:status==='published'?'#00ff88':'#febc2e', border:`1px solid ${status==='published'?'rgba(0,255,136,.3)':'rgba(254,188,46,.3)'}`, whiteSpace:'nowrap' }}>
//                 {status === 'published' ? '● PUBLIÉ' : '○ BROUILLON'}
//               </div>
//               {saved && <span style={{ fontSize:11, color:'#00ff88', animation:'fadeIn .3s ease' }}>✓ Sauvegardé</span>}
//             </div>
//             <div style={{ display:'flex', alignItems:'center', gap:10 }}>
//               <span style={{ fontSize:11, color:'rgba(200,210,255,.35)' }}>{wc} mots · {rt} min</span>
//               <button onClick={() => setPreview(!preview)} style={{ background:preview?'rgba(97,218,251,.15)':'rgba(255,255,255,.04)', border:`1px solid ${preview?'rgba(97,218,251,.4)':'rgba(255,255,255,.1)'}`, borderRadius:6, padding:'6px 14px', cursor:'pointer', color:preview?'#61dafb':'rgba(200,210,255,.6)', fontSize:11 }}>
//                 {preview ? '⌨ Éditer' : '👁 Aperçu'}
//               </button>
//               <button onClick={() => doSave('draft')} disabled={saving} style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', borderRadius:6, padding:'6px 14px', cursor:'pointer', color:'rgba(200,210,255,.6)', fontSize:11, opacity:saving?.5:1 }}>
//                 {saving ? '...' : '💾 Brouillon'}
//               </button>
//               <button onClick={() => doSave('published')} disabled={saving} style={{ background:'rgba(0,255,136,.15)', border:'1px solid rgba(0,255,136,.4)', borderRadius:8, padding:'6px 18px', cursor:'pointer', color:'#00ff88', fontSize:11, fontWeight:700, opacity:saving?.5:1 }}>
//                 {saving ? '...' : '🚀 Publier'}
//               </button>
//               <button onClick={handleLogout} title="Se déconnecter"
//                 style={{ background:'transparent', border:'1px solid rgba(255,100,100,.2)', borderRadius:6, padding:'6px 10px', cursor:'pointer', color:'rgba(255,100,100,.45)', fontSize:13, transition:'all .2s' }}
//                 onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,100,100,.6)'; e.currentTarget.style.color='rgba(255,100,100,.9)'; }}
//                 onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,100,100,.2)'; e.currentTarget.style.color='rgba(255,100,100,.45)'; }}
//               >⏻</button>
//             </div>
//           </div>
//         </div>

//         {error && (
//           <div style={{ background:'rgba(255,60,60,.1)', border:'1px solid rgba(255,60,60,.3)', margin:'16px 24px', borderRadius:8, padding:'10px 16px', fontSize:12, color:'rgba(255,120,120,.9)', display:'flex', justifyContent:'space-between' }}>
//             <span>⚠ {error}</span>
//             <button onClick={() => setError('')} style={{ background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,120,120,.7)', fontSize:16 }}>×</button>
//           </div>
//         )}

//         <div style={{ maxWidth:1400, margin:'0 auto', padding:'24px', display:'grid', gridTemplateColumns:'1fr 380px', gap:20, position:'relative', zIndex:1 }}>

//           {/* LEFT */}
//           <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

//             <textarea value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de l'article..." rows={2}
//               style={{ width:'100%', background:'transparent', border:'none', borderBottom:'2px solid rgba(0,255,136,.2)', padding:'8px 0', color:'#f0f4ff', fontFamily:'"Syne",sans-serif', fontSize:'clamp(22px,3vw,36px)', fontWeight:800, lineHeight:1.2, marginBottom:20, resize:'none', transition:'border-color .2s' }}
//               onFocus={e => (e.target.style.borderBottomColor='rgba(0,255,136,.6)')}
//               onBlur={e  => (e.target.style.borderBottomColor='rgba(0,255,136,.2)')}
//             />

//             <div style={{ marginBottom:20 }}>
//               <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Résumé accrocheur (160 chars max)..." rows={2} maxLength={300}
//                 style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,.06)', padding:'6px 0', color:'rgba(200,210,255,.65)', fontFamily:'"Lora",serif', fontSize:15, fontStyle:'italic', lineHeight:1.6, resize:'none' }}
//               />
//               <div style={{ textAlign:'right', fontSize:10, color:'rgba(200,210,255,.25)' }}>{excerpt.length}/300</div>
//             </div>

//             {!preview && (
//               <div style={{ display:'flex', gap:6, flexWrap:'wrap', padding:'10px 0', borderTop:'1px solid rgba(0,255,136,.08)', borderBottom:'1px solid rgba(0,255,136,.08)', marginBottom:12 }}>
//                 <Btn label="H1"     title="Titre 1"         onClick={() => ins('# ','','Titre')} />
//                 <Btn label="H2"     title="Titre 2"         onClick={() => ins('## ','','Titre')} />
//                 <Btn label="H3"     title="Titre 3"         onClick={() => ins('### ','','Titre')} />
//                 <Btn label="**B**"  title="Gras"            onClick={() => ins('**','**','texte')} />
//                 <Btn label="_I_"    title="Italique"        onClick={() => ins('*','*','texte')} />
//                 <Btn label="~~S~~"  title="Barré"           onClick={() => ins('~~','~~','texte')} />
//                 <Btn label="`c`"    title="Code inline"     onClick={() => ins('`','`','code')} />
//                 <Btn label="```"    title="Bloc code"       onClick={() => ins('```python\n','\n```','code')} />
//                 <Btn label=">cite"  title="Citation"        onClick={() => ins('> ','','citation')} />
//                 <Btn label="- li"   title="Liste"           onClick={() => ins('- ','','item')} />
//                 <Btn label="1. ol"  title="Liste numérotée" onClick={() => ins('1. ','','item')} />
//                 <Btn label="☑ task" title="Tâche"           onClick={() => ins('- [x] ','','tâche')} />
//                 <Btn label="table"  title="Tableau"         onClick={() => ins('| Col 1 | Col 2 |\n| --- | --- |\n| ','','val | val |')} />
//                 <Btn label="[lien]" title="Lien"            onClick={() => ins('[','](url)','texte')} />
//                 <Btn label="![img]" title="Image URL"       onClick={() => ins('![','](https://)','alt')} />
//                 <Btn label="$math"  title="Math inline"     onClick={() => ins('$','$','x^2')} />
//                 <Btn label="$$"     title="Math bloc"       onClick={() => ins('$$\n','\n$$','E=mc^2')} />
//                 <Btn label="---"    title="Séparateur"      onClick={() => ins('\n---\n','','')} />
//                 <label style={{ background:'rgba(97,218,251,.08)', border:'1px solid rgba(97,218,251,.2)', borderRadius:6, padding:'4px 10px', cursor:'pointer', color:'#61dafb', fontSize:12, fontFamily:'"JetBrains Mono",monospace', display:'flex', alignItems:'center', gap:6 }}>
//                   {uploadingImg ? <span style={{ animation:'pulse 1s infinite' }}>⬆...</span> : '⬆ Upload'}
//                   <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
//                 </label>
//               </div>
//             )}

//             {!preview ? (
//               <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value)}
//                 placeholder={`# Titre principal\n\nCommence ici...\n\n\`\`\`python\nprint("Vibe coding")\n\`\`\`\n\n| Col | Col |\n|-----|-----|\n| val | val |\n\n- [x] Tâche\n- [ ] À faire\n\n$$E = mc^2$$`}
//                 style={{ width:'100%', minHeight:'65vh', background:'rgba(0,0,0,.2)', border:'1px solid rgba(0,255,136,.1)', borderRadius:12, padding:'20px 24px', color:'#c8d2ff', fontSize:14, lineHeight:2, transition:'border-color .2s', resize:'none' }}
//                 onFocus={e => (e.target.style.borderColor='rgba(0,255,136,.3)')}
//                 onBlur={e  => (e.target.style.borderColor='rgba(0,255,136,.1)')}
//               />
//             ) : (
//               <div style={{ minHeight:'65vh', background:'rgba(0,0,0,.2)', border:'1px solid rgba(0,255,136,.15)', borderRadius:12, padding:'28px 32px', overflowY:'auto' }}>
//                 {content
//                   ? <MarkdownRenderer content={content} preview />
//                   : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'rgba(0,255,136,.2)', fontSize:13 }}>
//                       <span style={{ animation:'blink 2s step-end infinite' }}>▋</span>&nbsp;Commence à écrire...
//                     </div>
//                 }
//               </div>
//             )}
//           </div>

//           {/* RIGHT */}
//           <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
//             <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,.03)', borderRadius:8, padding:4 }}>
//               {(['content','meta','seo'] as const).map(s => (
//                 <button key={s} onClick={() => setActiveSection(s)} style={{ flex:1, padding:'7px 0', borderRadius:6, cursor:'pointer', fontSize:10, letterSpacing:1, border:'none', transition:'all .2s', background:activeSection===s?'rgba(0,255,136,.12)':'transparent', color:activeSection===s?'#00ff88':'rgba(200,210,255,.4)' }}>
//                   {s.toUpperCase()}
//                 </button>
//               ))}
//             </div>

//             {activeSection === 'content' && (
//               <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>
//                 <div>
//                   <span className="fl">Image de couverture</span>
//                   {coverImage && (
//                     <div style={{ position:'relative', marginBottom:8, borderRadius:8, overflow:'hidden', height:120 }}>
//                       <img src={coverImage} alt="cover" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.7)' }} />
//                       <button onClick={() => setCoverImage('')} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.6)', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer', color:'#ff6b6b', fontSize:11 }}>✕</button>
//                     </div>
//                   )}
//                   <input className="fi" value={coverImage} onChange={e => setCoverImage(e.target.value)} placeholder="https://..." />
//                 </div>
//                 <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
//                   <div>
//                     <span className="fl">Statut</span>
//                     <select value={status} onChange={e => setStatus(e.target.value as any)} className="fi" style={{ cursor:'pointer' }}>
//                       <option value="draft">Brouillon</option>
//                       <option value="published">Publié</option>
//                     </select>
//                   </div>
//                   <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
//                     <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 14px', background:'rgba(0,0,0,.3)', border:`1px solid ${featured?'rgba(0,255,136,.4)':'rgba(0,255,136,.1)'}`, borderRadius:8, transition:'all .2s' }}>
//                       <div style={{ width:20, height:20, borderRadius:4, background:featured?'#00ff88':'transparent', border:`2px solid ${featured?'#00ff88':'rgba(0,255,136,.3)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
//                         {featured && <span style={{ fontSize:12, color:'#080c14', fontWeight:700 }}>✓</span>}
//                       </div>
//                       <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} style={{ display:'none' }} />
//                       <span style={{ fontSize:11, color:featured?'#00ff88':'rgba(200,210,255,.5)' }}>★ Featured</span>
//                     </label>
//                   </div>
//                 </div>
//                 <div>
//                   <span className="fl">Tags</span>
//                   <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
//                     {allTags.map((tag: Tag) => {
//                       const sel = selectedTags.includes(tag._id);
//                       return (
//                         <button key={tag._id} onClick={() => setSelectedTags(prev => sel ? prev.filter(x => x !== tag._id) : [...prev, tag._id])}
//                           style={{ padding:'4px 12px', borderRadius:6, fontSize:11, cursor:'pointer', background:sel?`${tag.color}22`:'rgba(255,255,255,.04)', border:`1px solid ${sel?tag.color:'rgba(255,255,255,.08)'}`, color:sel?tag.color:'rgba(200,210,255,.45)', transition:'all .2s' }}
//                         >{tag.name}</button>
//                       );
//                     })}
//                     {allTags.length === 0 && <span style={{ fontSize:11, color:'rgba(200,210,255,.3)' }}>Aucun tag — POST /api/tags</span>}
//                   </div>
//                 </div>
//                 <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10 }}>
//                   <div><span className="fl">Série</span><input className="fi" value={series} onChange={e => setSeries(e.target.value)} placeholder="Oracle Cloud Chronicles" /></div>
//                   <div><span className="fl">Ordre</span><input className="fi" type="number" min={1} value={seriesOrder} onChange={e => setSeriesOrder(Number(e.target.value)||'')} placeholder="1" /></div>
//                 </div>
//               </div>
//             )}

//             {activeSection === 'meta' && (
//               <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>
//                 <div>
//                   <span className="fl">Slug URL</span>
//                   <div style={{ position:'relative' }}>
//                     <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(0,255,136,.4)', fontSize:11 }}>/blog/</span>
//                     <input className="fi" value={slug} onChange={e => { setSlug(e.target.value); setSlugManual(true); }} style={{ paddingLeft:52 }} placeholder="mon-article-slug" />
//                   </div>
//                   {!slugManual && title && <span style={{ fontSize:10, color:'rgba(0,255,136,.4)', marginTop:4, display:'block' }}>↳ auto-généré</span>}
//                 </div>
//                 <div style={{ padding:'12px 14px', background:'rgba(0,255,136,.04)', border:'1px solid rgba(0,255,136,.1)', borderRadius:8 }}>
//                   <div style={{ fontSize:11, color:'rgba(0,255,136,.6)', marginBottom:8 }}>Statistiques</div>
//                   <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
//                     {[{l:'Mots',v:wc},{l:'Lecture',v:`${rt}min`},{l:'Chars',v:content.length}].map(s => (
//                       <div key={s.l} style={{ textAlign:'center' }}>
//                         <div style={{ fontSize:18, fontFamily:'"Syne",sans-serif', fontWeight:800, color:'#00ff88' }}>{s.v}</div>
//                         <div style={{ fontSize:10, color:'rgba(200,210,255,.4)', marginTop:2 }}>{s.l}</div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//                 {(title||excerpt||coverImage) && (
//                   <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid rgba(255,255,255,.06)' }}>
//                     <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', padding:'6px 12px', borderBottom:'1px solid rgba(255,255,255,.05)', letterSpacing:2 }}>APERÇU CARTE</div>
//                     {coverImage && <div style={{ height:80, overflow:'hidden' }}><img src={coverImage} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.6)' }} /></div>}
//                     <div style={{ padding:'10px 12px' }}>
//                       <div style={{ fontSize:13, fontFamily:'"Syne",sans-serif', fontWeight:700, color:'#c8d2ff', lineHeight:1.3, marginBottom:6 }}>{title||'Sans titre'}</div>
//                       <div style={{ fontSize:11, color:'rgba(200,210,255,.45)', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{excerpt||'Résumé...'}</div>
//                     </div>
//                   </div>
//                 )}
//               </div>
//             )}

//             {activeSection === 'seo' && (
//               <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>
//                 <div>
//                   <span className="fl">Titre SEO</span>
//                   <input className="fi" value={seoTitle} onChange={e => setSeoTitle(e.target.value)} placeholder={title||"Titre Google"} />
//                   <div style={{ textAlign:'right', fontSize:10, color:(seoTitle||title).length>60?'#ff6b6b':'rgba(200,210,255,.25)', marginTop:4 }}>{(seoTitle||title).length}/60</div>
//                 </div>
//                 <div>
//                   <span className="fl">Meta description</span>
//                   <textarea className="fi" value={seoDesc} onChange={e => setSeoDesc(e.target.value)} placeholder={excerpt||"160 chars max"} rows={3} style={{ resize:'vertical' }} />
//                   <div style={{ textAlign:'right', fontSize:10, color:(seoDesc||excerpt).length>160?'#ff6b6b':'rgba(200,210,255,.25)', marginTop:4 }}>{(seoDesc||excerpt).length}/160</div>
//                 </div>
//                 <div>
//                   <span className="fl">Mots-clés</span>
//                   <input className="fi" value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} placeholder="python, oracle cloud, vibe coding" />
//                 </div>
//                 <div style={{ padding:'14px', background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)', borderRadius:8 }}>
//                   <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:10 }}>APERÇU GOOGLE</div>
//                   <div style={{ fontSize:13, color:'#8ab4f8', marginBottom:4, fontFamily:'sans-serif' }}>{seoTitle||title||"Titre"}</div>
//                   <div style={{ fontSize:11, color:'rgba(26,200,80,.8)', marginBottom:6, fontFamily:'sans-serif' }}>adjoumani-koffi.com/blog/{slug||'slug'}</div>
//                   <div style={{ fontSize:11, color:'rgba(200,200,200,.6)', lineHeight:1.5, fontFamily:'sans-serif', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{seoDesc||excerpt||"Description..."}</div>
//                 </div>
//               </div>
//             )}

//             <div style={{ marginTop:'auto', padding:'12px', background:'rgba(0,0,0,.2)', borderRadius:8, border:'1px solid rgba(255,255,255,.04)' }}>
//               <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:8 }}>MARKDOWN SUPPORTÉ</div>
//               {[['GFM','Tables, ~~barré~~, task lists'],['Code','Coloration 50+ langages'],['Math','LaTeX $inline$ et $$bloc$$'],['Slugs','Ancres auto H1–H6'],['Images','Upload + légende'],['XSS','Protection sanitize']].map(([k,v]) => (
//                 <div key={k} style={{ display:'flex', gap:8, fontSize:10, color:'rgba(200,210,255,.35)', marginBottom:3 }}>
//                   <code style={{ color:'rgba(0,255,136,.5)', minWidth:44 }}>{k}</code><span>{v}</span>
//                 </div>
//               ))}
//             </div>

//             <div style={{ padding:'10px 12px', background:'rgba(0,0,0,.2)', borderRadius:8, border:'1px solid rgba(255,255,255,.04)' }}>
//               <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:6 }}>RACCOURCIS</div>
//               {[['Ctrl+S','Brouillon'],['Ctrl+P','Aperçu'],['Ctrl+↵','Publier']].map(([k,v]) => (
//                 <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'rgba(200,210,255,.35)', marginBottom:3 }}>
//                   <code style={{ color:'rgba(0,255,136,.5)' }}>{k}</code><span>{v}</span>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// };

// export default AdminBlogPage;



























// // src/pages/AdminBlogPage.tsx
// // Page de saisie d'article — aesthetic "Code Forge"
// // Éditeur split-screen Markdown + Preview live
// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import { useNavigate, useParams } from 'react-router-dom';
// import { apiFetch, getTags, getArticle } from '../lib/api';
// import type { Tag, Article } from '../types/blog';

// // ── Markdown renderer minimal (remplacer par react-markdown en prod) ──
// function renderMd(md: string): string {
//   return md
//     .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
//       `<pre class="adm-code" data-lang="${lang||'code'}"><code>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`)
//     .replace(/`([^`]+)`/g, '<code class="adm-inline">$1</code>')
//     .replace(/^### (.+)$/gm, '<h3>$1</h3>')
//     .replace(/^## (.+)$/gm, '<h2>$1</h2>')
//     .replace(/^# (.+)$/gm, '<h1>$1</h1>')
//     .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
//     .replace(/\*(.+?)\*/g, '<em>$1</em>')
//     .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:16px 0">')
//     .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
//     .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
//     .replace(/^- (.+)$/gm, '<li>$1</li>')
//     .replace(/\n\n/g, '</p><p>')
//     .replace(/^(?![<\n])(.+)$/gm, (line) => line.trim() ? line : '');
// }

// // ── Slug generator ──
// function toSlug(title: string): string {
//   return title.toLowerCase()
//     .replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a')
//     .replace(/[ùûü]/g,'u').replace(/[ôö]/g,'o').replace(/[îï]/g,'i')
//     .replace(/[^a-z0-9\s-]/g,'').trim()
//     .replace(/\s+/g,'-').replace(/-+/g,'-');
// }

// // ── Read time estimator ──
// function estimateReadTime(content: string): number {
//   return Math.max(1, Math.ceil(content.split(/\s+/).length / 250));
// }

// // ── Toolbar button ──
// const ToolbarBtn: React.FC<{ label: string; title: string; onClick: () => void }> = ({ label, title, onClick }) => (
//   <button title={title} onClick={onClick} style={{
//     background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)',
//     borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
//     color: '#00ff88', fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
//     transition: 'all 0.15s',
//   }}
//     onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.18)'; }}
//     onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.08)'; }}
//   >{label}</button>
// );

// // ═══════════════════════════════════════════════════
// const AdminBlogPage: React.FC = () => {
//   const { id } = useParams<{ id?: string }>();
//   const navigate = useNavigate();
//   const isEdit = !!id;

//   // ── Form state ──
//   const [title, setTitle]           = useState('');
//   const [slug, setSlug]             = useState('');
//   const [slugManual, setSlugManual] = useState(false);
//   const [excerpt, setExcerpt]       = useState('');
//   const [content, setContent]       = useState('');
//   const [coverImage, setCoverImage] = useState('');
//   const [status, setStatus]         = useState<'draft'|'published'>('draft');
//   const [featured, setFeatured]     = useState(false);
//   const [series, setSeries]         = useState('');
//   const [seriesOrder, setSeriesOrder] = useState<number|''>('');
//   const [seoTitle, setSeoTitle]     = useState('');
//   const [seoDesc, setSeoDesc]       = useState('');
//   const [seoKeywords, setSeoKeywords] = useState('');
//   const [selectedTags, setSelectedTags] = useState<string[]>([]);

//   // ── UI state ──
//   const [allTags, setAllTags]       = useState<Tag[]>([]);
//   const [preview, setPreview]       = useState(false);
//   const [saving, setSaving]         = useState(false);
//   const [saved, setSaved]           = useState(false);
//   const [error, setError]           = useState('');
//   const [uploadingImg, setUploadingImg] = useState(false);
//   const [wordCount, setWordCount]   = useState(0);
//   const [activeSection, setActiveSection] = useState<'content'|'meta'|'seo'>('content');
//   const textareaRef = useRef<HTMLTextAreaElement>(null);
//   const fileRef = useRef<HTMLInputElement>(null);

//   // ── Load tags ──
//   useEffect(() => {
//     getTags().then((t: Tag[]) => setAllTags(t)).catch(() => {});
//   }, []);

//   // ── Load article if editing ──
//   useEffect(() => {
//     if (!isEdit || !id) return;
//     getArticle(id).then((a: Article) => {
//       setTitle(a.title); setSlug(a.slug); setSlugManual(true);
//       setExcerpt(a.excerpt); setContent(a.content);
//       setCoverImage(a.coverImage ?? ''); setStatus(a.status);
//       setFeatured(a.featured); setSeries(a.series ?? '');
//       setSeriesOrder(a.seriesOrder ?? '');
//       setSeoTitle(a.seo.title ?? ''); setSeoDesc(a.seo.description ?? '');
//       setSeoKeywords((a.seo.keywords ?? []).join(', '));
//       setSelectedTags(a.tags.map((t: Tag) => t._id));
//     }).catch(() => setError('Article introuvable'));
//   }, [id, isEdit]);

//   // ── Auto-slug from title ──
//   useEffect(() => {
//     if (!slugManual && title) setSlug(toSlug(title));
//   }, [title, slugManual]);

//   // ── Word count ──
//   useEffect(() => {
//     setWordCount(content.split(/\s+/).filter(Boolean).length);
//   }, [content]);

//   // ── Keyboard shortcuts ──
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       if (e.ctrlKey && e.key === 's') { e.preventDefault(); save('draft'); }
//       if (e.ctrlKey && e.key === 'p') { e.preventDefault(); setPreview(p => !p); }
//       if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); save('published'); }
//     };
//     window.addEventListener('keydown', handler);
//     return () => window.removeEventListener('keydown', handler);
//   }, [content, title, excerpt, slug, coverImage, status, featured, series, seriesOrder, seoTitle, seoDesc, seoKeywords, selectedTags]);

//   // ── Toolbar insert ──
//   const insert = useCallback((before: string, after = '', placeholder = '') => {
//     const ta = textareaRef.current;
//     if (!ta) return;
//     const start = ta.selectionStart;
//     const end   = ta.selectionEnd;
//     const sel   = content.slice(start, end) || placeholder;
//     const newContent = content.slice(0, start) + before + sel + after + content.slice(end);
//     setContent(newContent);
//     setTimeout(() => {
//       ta.focus();
//       ta.setSelectionRange(start + before.length, start + before.length + sel.length);
//     }, 0);
//   }, [content]);

//   // ── Upload image ──
//   const handleImageUpload = async (file: File) => {
//     setUploadingImg(true);
//     try {
//       const form = new FormData();
//       form.append('image', file);
//       const token = localStorage.getItem('blog_token');
//       const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
//         method: 'POST',
//         headers: token ? { Authorization: `Bearer ${token}` } : {},
//         body: form,
//       });
//       const data = await res.json();
//       if (data.url) {
//         insert(`![Image](${data.url})`, '', '');
//       }
//     } catch { setError('Erreur upload image'); }
//     finally { setUploadingImg(false); }
//   };

//   // ── Save ──
//   const save = async (targetStatus: 'draft'|'published') => {
//     if (!title.trim()) { setError('Le titre est requis'); return; }
//     if (!content.trim()) { setError('Le contenu est requis'); return; }
//     setSaving(true); setError('');
//     try {
//       const payload = {
//         title, slug, excerpt, content, coverImage,
//         status: targetStatus, featured,
//         series: series || undefined,
//         seriesOrder: seriesOrder || undefined,
//         tags: selectedTags,
//         seo: {
//           title: seoTitle || undefined,
//           description: seoDesc || undefined,
//           keywords: seoKeywords.split(',').map(k => k.trim()).filter(Boolean),
//         },
//       };
//       if (isEdit && id) {
//         await apiFetch(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
//       } else {
//         await apiFetch('/articles', { method: 'POST', body: JSON.stringify(payload) });
//       }
//       setStatus(targetStatus);
//       setSaved(true);
//       setTimeout(() => setSaved(false), 3000);
//       if (targetStatus === 'published') navigate('/blog');
//     } catch (e: any) {
//       setError(e?.error || 'Erreur lors de la sauvegarde');
//     } finally { setSaving(false); }
//   };

//   const readTime = estimateReadTime(content);

//   return (
//     <>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');
//         @keyframes fadeIn  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
//         @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
//         @keyframes scanln  { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
//         .adm * { box-sizing:border-box; margin:0; padding:0; }
//         .adm textarea { resize:none; }
//         .adm textarea:focus, .adm input:focus, .adm select:focus { outline:none; }
//         .adm textarea::placeholder, .adm input::placeholder { color:rgba(0,255,136,.25); }
//         .adm-code { background:#0d1117; border:1px solid rgba(0,255,136,.15); border-radius:8px; padding:16px 20px; margin:16px 0; overflow-x:auto; position:relative; }
//         .adm-code::before { content:attr(data-lang); position:absolute; top:6px; right:10px; font-family:"JetBrains Mono",monospace; font-size:10px; color:rgba(0,255,136,.4); letter-spacing:2px; text-transform:uppercase; }
//         .adm-code code { font-family:"JetBrains Mono",monospace; font-size:13px; color:#e2e8f0; line-height:1.7; }
//         .adm-inline { font-family:"JetBrains Mono",monospace; font-size:13px; background:rgba(0,255,136,.1); color:#00ff88; padding:2px 6px; border-radius:4px; }
//         .adm-preview h1 { font-family:"Syne",sans-serif; font-size:32px; color:#f0f4ff; margin:28px 0 16px; }
//         .adm-preview h2 { font-family:"Syne",sans-serif; font-size:24px; color:#c8d2ff; border-left:3px solid #00ff88; padding-left:14px; margin:24px 0 12px; }
//         .adm-preview h3 { font-family:"Syne",sans-serif; font-size:19px; color:#a0b0e0; margin:20px 0 10px; }
//         .adm-preview p  { color:rgba(200,210,255,.75); line-height:1.85; font-size:15px; margin:14px 0; font-family:"Lora",serif; }
//         .adm-preview blockquote { border-left:3px solid #00ff88; margin:20px 0; padding:10px 18px; background:rgba(0,255,136,.05); border-radius:0 8px 8px 0; color:rgba(200,210,255,.6); font-style:italic; }
//         .adm-preview li { color:rgba(200,210,255,.7); line-height:1.7; margin:6px 0 6px 22px; list-style:disc; font-family:"Lora",serif; }
//         .adm-preview a { color:#00ff88; text-decoration:none; border-bottom:1px solid rgba(0,255,136,.3); }
//         .adm-preview strong { color:#f0f4ff; }
//         .tag-chip { transition:all .2s; }
//         .tag-chip:hover { transform:scale(1.05); }
//         .field-label { font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:2px; color:rgba(0,255,136,.6); text-transform:uppercase; margin-bottom:8px; display:block; }
//         .field-input { width:100%; background:rgba(0,0,0,.3); border:1px solid rgba(0,255,136,.15); border-radius:8px; padding:10px 14px; color:#c8d2ff; font-family:"JetBrains Mono",monospace; font-size:13px; transition:border-color .2s; }
//         .field-input:focus { border-color:rgba(0,255,136,.5); }
//         .section-tab { padding:8px 16px; borderRadius:6px; cursor:pointer; font-family:"JetBrains Mono",monospace; font-size:11px; letter-spacing:1px; border:none; transition:all .2s; }
//         ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:rgba(0,255,136,.2); border-radius:2px; }
//       `}</style>

//       <div className="adm" style={{ minHeight:'100vh', background:'#080c14', color:'#c8d2ff', fontFamily:'"JetBrains Mono",monospace' }}>

//         {/* Scan line */}
//         <div style={{ position:'fixed', top:0, left:0, right:0, height:2, background:'linear-gradient(to bottom,transparent,rgba(0,255,136,.05),transparent)', animation:'scanln 10s linear infinite', pointerEvents:'none', zIndex:100 }} />

//         {/* Grid bg */}
//         <div style={{ position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(0,255,136,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.03) 1px,transparent 1px)', backgroundSize:'48px 48px', pointerEvents:'none', zIndex:0 }} />

//         {/* ── TOPBAR ── */}
//         <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(8,12,20,.95)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(0,255,136,.1)', padding:'0 24px' }}>
//           <div style={{ maxWidth:1400, margin:'0 auto', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>

//             {/* Left — title + status */}
//             <div style={{ display:'flex', alignItems:'center', gap:16, flex:1, minWidth:0 }}>
//               <div style={{ display:'flex', gap:6 }}>
//                 {['#ff5f57','#febc2e','#28c840'].map(c => (
//                   <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c, cursor:'pointer' }} onClick={() => navigate('/blog')} />
//                 ))}
//               </div>
//               <span style={{ fontSize:11, color:'rgba(0,255,136,.5)', whiteSpace:'nowrap' }}>
//                 {isEdit ? '~/blog/edit' : '~/blog/new'}
//               </span>
//               <span style={{ color:'rgba(0,255,136,.3)' }}>›</span>
//               <span style={{ fontSize:12, color:'rgba(200,210,255,.6)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
//                 {title || 'sans-titre.md'}
//               </span>

//               {/* Status badge */}
//               <div style={{
//                 padding:'2px 10px', borderRadius:4, fontSize:10, letterSpacing:2,
//                 background: status==='published' ? 'rgba(0,255,136,.15)' : 'rgba(254,188,46,.1)',
//                 color: status==='published' ? '#00ff88' : '#febc2e',
//                 border: `1px solid ${status==='published' ? 'rgba(0,255,136,.3)' : 'rgba(254,188,46,.3)'}`,
//                 whiteSpace:'nowrap',
//               }}>
//                 {status === 'published' ? '● PUBLIÉ' : '○ BROUILLON'}
//               </div>

//               {saved && (
//                 <span style={{ fontSize:11, color:'#00ff88', animation:'fadeIn .3s ease' }}>✓ Sauvegardé</span>
//               )}
//             </div>

//             {/* Right — stats + actions */}
//             <div style={{ display:'flex', alignItems:'center', gap:12 }}>
//               <div style={{ display:'flex', gap:16, fontSize:11, color:'rgba(200,210,255,.35)' }}>
//                 <span>{wordCount} mots</span>
//                 <span>{readTime} min</span>
//               </div>

//               <button onClick={() => setPreview(!preview)} style={{
//                 background: preview ? 'rgba(97,218,251,.15)' : 'rgba(255,255,255,.04)',
//                 border: `1px solid ${preview ? 'rgba(97,218,251,.4)' : 'rgba(255,255,255,.1)'}`,
//                 borderRadius:6, padding:'6px 14px', cursor:'pointer',
//                 color: preview ? '#61dafb' : 'rgba(200,210,255,.6)', fontSize:11,
//               }}>
//                 {preview ? '⌨ Éditer' : '👁 Aperçu'}
//               </button>

//               <button onClick={() => save('draft')} disabled={saving} style={{
//                 background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)',
//                 borderRadius:6, padding:'6px 14px', cursor:'pointer',
//                 color:'rgba(200,210,255,.6)', fontSize:11, opacity: saving ? .5 : 1,
//               }}>
//                 {saving ? '...' : '💾 Brouillon'}
//               </button>

//               <button onClick={() => save('published')} disabled={saving} style={{
//                 background:'rgba(0,255,136,.15)', border:'1px solid rgba(0,255,136,.4)',
//                 borderRadius:8, padding:'6px 18px', cursor:'pointer',
//                 color:'#00ff88', fontSize:11, fontWeight:700, opacity: saving ? .5 : 1,
//               }}>
//                 {saving ? '...' : '🚀 Publier'}
//               </button>
//             </div>
//           </div>
//         </div>

//         {/* ── ERROR BANNER ── */}
//         {error && (
//           <div style={{ background:'rgba(255,60,60,.1)', border:'1px solid rgba(255,60,60,.3)', margin:'16px 24px', borderRadius:8, padding:'10px 16px', fontSize:12, color:'rgba(255,120,120,.9)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
//             <span>⚠ {error}</span>
//             <button onClick={() => setError('')} style={{ background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,120,120,.7)', fontSize:16 }}>×</button>
//           </div>
//         )}

//         <div style={{ maxWidth:1400, margin:'0 auto', padding:'24px', display:'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr 380px', gap:20, position:'relative', zIndex:1 }}>

//           {/* ══════════════════════════════════════
//               LEFT — EDITOR / PREVIEW
//           ══════════════════════════════════════ */}
//           <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

//             {/* Title field */}
//             <div style={{ marginBottom:20 }}>
//               <textarea
//                 value={title}
//                 onChange={e => setTitle(e.target.value)}
//                 placeholder="Titre de l'article..."
//                 rows={2}
//                 style={{
//                   width:'100%', background:'transparent',
//                   border:'none', borderBottom:'2px solid rgba(0,255,136,.2)',
//                   padding:'8px 0', color:'#f0f4ff',
//                   fontFamily:'"Syne",sans-serif', fontSize:'clamp(22px,3vw,36px)',
//                   fontWeight:800, lineHeight:1.2,
//                   transition:'border-color .2s',
//                 }}
//                 onFocus={e => e.target.style.borderBottomColor = 'rgba(0,255,136,.6)'}
//                 onBlur={e => e.target.style.borderBottomColor = 'rgba(0,255,136,.2)'}
//               />
//             </div>

//             {/* Excerpt */}
//             <div style={{ marginBottom:20 }}>
//               <textarea
//                 value={excerpt}
//                 onChange={e => setExcerpt(e.target.value)}
//                 placeholder="Résumé accrocheur (160 caractères max — affiché dans les cartes et le SEO)..."
//                 rows={2}
//                 maxLength={300}
//                 style={{
//                   width:'100%', background:'transparent', border:'none',
//                   borderBottom:'1px solid rgba(255,255,255,.06)',
//                   padding:'6px 0', color:'rgba(200,210,255,.65)',
//                   fontFamily:'"Lora",serif', fontSize:15, fontStyle:'italic',
//                   lineHeight:1.6,
//                 }}
//               />
//               <div style={{ textAlign:'right', fontSize:10, color:'rgba(200,210,255,.25)', marginTop:4 }}>
//                 {excerpt.length}/300
//               </div>
//             </div>

//             {/* Markdown toolbar */}
//             {!preview && (
//               <div style={{
//                 display:'flex', gap:6, flexWrap:'wrap', padding:'10px 0',
//                 borderTop:'1px solid rgba(0,255,136,.08)',
//                 borderBottom:'1px solid rgba(0,255,136,.08)',
//                 marginBottom:12,
//               }}>
//                 <ToolbarBtn label="H1" title="Titre 1" onClick={() => insert('# ', '', 'Titre')} />
//                 <ToolbarBtn label="H2" title="Titre 2" onClick={() => insert('## ', '', 'Titre')} />
//                 <ToolbarBtn label="H3" title="Titre 3" onClick={() => insert('### ', '', 'Titre')} />
//                 <ToolbarBtn label="**B**" title="Gras" onClick={() => insert('**', '**', 'texte')} />
//                 <ToolbarBtn label="_I_" title="Italique" onClick={() => insert('*', '*', 'texte')} />
//                 <ToolbarBtn label="`code`" title="Code inline" onClick={() => insert('`', '`', 'code')} />
//                 <ToolbarBtn label="```" title="Bloc de code" onClick={() => insert('```python\n', '\n```', 'code ici')} />
//                 <ToolbarBtn label="> cite" title="Citation" onClick={() => insert('> ', '', 'citation')} />
//                 <ToolbarBtn label="- list" title="Liste" onClick={() => insert('- ', '', 'élément')} />
//                 <ToolbarBtn label="[lien]" title="Lien" onClick={() => insert('[', '](url)', 'texte')} />
//                 <ToolbarBtn label="![img]" title="Image URL" onClick={() => insert('![', '](https://)', 'alt')} />
//                 <label style={{
//                   background:'rgba(97,218,251,.08)', border:'1px solid rgba(97,218,251,.2)',
//                   borderRadius:6, padding:'4px 10px', cursor:'pointer',
//                   color:'#61dafb', fontSize:12, fontFamily:'"JetBrains Mono",monospace',
//                   display:'flex', alignItems:'center', gap:6,
//                 }}>
//                   {uploadingImg ? <span style={{ animation:'pulse 1s infinite' }}>⬆...</span> : '⬆ Upload'}
//                   <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
//                     onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
//                 </label>
//               </div>
//             )}

//             {/* Editor / Preview */}
//             <div style={{ flex:1, display:'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap:16 }}>
//               {/* Editor */}
//               {!preview || true ? (
//                 <div style={{ display: preview ? 'block' : 'block' }}>
//                   {!preview ? (
//                     <textarea
//                       ref={textareaRef}
//                       value={content}
//                       onChange={e => setContent(e.target.value)}
//                       placeholder={`Commence à écrire en Markdown...\n\n# Titre principal\n\nTon histoire de développement commence ici.\n\n\`\`\`python\n# Colle ton code ici\nprint("Vibe coding")\n\`\`\``}
//                       style={{
//                         width:'100%', minHeight:'60vh',
//                         background:'rgba(0,0,0,.2)', border:'1px solid rgba(0,255,136,.1)',
//                         borderRadius:12, padding:'20px 24px', color:'#c8d2ff',
//                         fontFamily:'"JetBrains Mono",monospace', fontSize:14,
//                         lineHeight:2,
//                       }}
//                       onFocus={e => e.target.style.borderColor = 'rgba(0,255,136,.3)'}
//                       onBlur={e => e.target.style.borderColor = 'rgba(0,255,136,.1)'}
//                     />
//                   ) : (
//                     <div
//                       className="adm-preview"
//                       style={{ minHeight:'60vh', background:'rgba(0,0,0,.2)', border:'1px solid rgba(255,255,255,.06)', borderRadius:12, padding:'24px 28px', overflow:'auto' }}
//                       dangerouslySetInnerHTML={{ __html: `<p>${renderMd(content)}</p>` }}
//                     />
//                   )}
//                 </div>
//               ) : null}
//             </div>
//           </div>

//           {/* ══════════════════════════════════════
//               RIGHT — META PANEL
//           ══════════════════════════════════════ */}
//           <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

//             {/* Section tabs */}
//             <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,.03)', borderRadius:8, padding:4 }}>
//               {(['content','meta','seo'] as const).map(s => (
//                 <button key={s} onClick={() => setActiveSection(s)} style={{
//                   flex:1, padding:'7px 0', borderRadius:6, cursor:'pointer',
//                   fontFamily:'"JetBrains Mono",monospace', fontSize:10, letterSpacing:1,
//                   border:'none', transition:'all .2s',
//                   background: activeSection===s ? 'rgba(0,255,136,.12)' : 'transparent',
//                   color: activeSection===s ? '#00ff88' : 'rgba(200,210,255,.4)',
//                 }}>
//                   {s.toUpperCase()}
//                 </button>
//               ))}
//             </div>

//             {/* ── CONTENT SECTION ── */}
//             {activeSection === 'content' && (
//               <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>

//                 {/* Cover image */}
//                 <div>
//                   <span className="field-label">Image de couverture</span>
//                   {coverImage && (
//                     <div style={{ position:'relative', marginBottom:8, borderRadius:8, overflow:'hidden', height:120 }}>
//                       <img src={coverImage} alt="cover" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.7)' }} />
//                       <button onClick={() => setCoverImage('')} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.6)', border:'none', borderRadius:4, padding:'2px 8px', cursor:'pointer', color:'#ff6b6b', fontSize:11 }}>✕</button>
//                     </div>
//                   )}
//                   <input
//                     className="field-input"
//                     value={coverImage}
//                     onChange={e => setCoverImage(e.target.value)}
//                     placeholder="https://... ou uploader via l'éditeur"
//                   />
//                 </div>

//                 {/* Status + Featured */}
//                 <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
//                   <div>
//                     <span className="field-label">Statut</span>
//                     <select
//                       value={status}
//                       onChange={e => setStatus(e.target.value as 'draft'|'published')}
//                       className="field-input"
//                       style={{ cursor:'pointer' }}
//                     >
//                       <option value="draft">Brouillon</option>
//                       <option value="published">Publié</option>
//                     </select>
//                   </div>
//                   <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
//                     <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 14px', background:'rgba(0,0,0,.3)', border:`1px solid ${featured ? 'rgba(0,255,136,.4)' : 'rgba(0,255,136,.1)'}`, borderRadius:8, transition:'all .2s' }}>
//                       <div style={{
//                         width:20, height:20, borderRadius:4,
//                         background: featured ? '#00ff88' : 'transparent',
//                         border: `2px solid ${featured ? '#00ff88' : 'rgba(0,255,136,.3)'}`,
//                         display:'flex', alignItems:'center', justifyContent:'center',
//                         transition:'all .2s', flexShrink:0,
//                       }}>
//                         {featured && <span style={{ fontSize:12, color:'#080c14', fontWeight:700 }}>✓</span>}
//                       </div>
//                       <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} style={{ display:'none' }} />
//                       <span style={{ fontSize:11, color: featured ? '#00ff88' : 'rgba(200,210,255,.5)' }}>★ Featured</span>
//                     </label>
//                   </div>
//                 </div>

//                 {/* Tags */}
//                 <div>
//                   <span className="field-label">Tags</span>
//                   <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
//                     {allTags.map(tag => {
//                       const selected = selectedTags.includes(tag._id);
//                       return (
//                         <button key={tag._id} className="tag-chip"
//                           onClick={() => setSelectedTags(prev =>
//                             selected ? prev.filter(id => id !== tag._id) : [...prev, tag._id]
//                           )}
//                           style={{
//                             padding:'4px 12px', borderRadius:6, fontSize:11, cursor:'pointer',
//                             fontFamily:'"JetBrains Mono",monospace',
//                             background: selected ? `${tag.color}22` : 'rgba(255,255,255,.04)',
//                             border: `1px solid ${selected ? tag.color : 'rgba(255,255,255,.08)'}`,
//                             color: selected ? tag.color : 'rgba(200,210,255,.45)',
//                           }}
//                         >{tag.name}</button>
//                       );
//                     })}
//                     {allTags.length === 0 && (
//                       <span style={{ fontSize:11, color:'rgba(200,210,255,.3)' }}>Aucun tag — créez-en via l'API /tags</span>
//                     )}
//                   </div>
//                 </div>

//                 {/* Series */}
//                 <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10 }}>
//                   <div>
//                     <span className="field-label">Série</span>
//                     <input className="field-input" value={series} onChange={e => setSeries(e.target.value)} placeholder="Oracle Cloud Chronicles" />
//                   </div>
//                   <div>
//                     <span className="field-label">Ordre</span>
//                     <input className="field-input" type="number" min={1} value={seriesOrder} onChange={e => setSeriesOrder(Number(e.target.value) || '')} placeholder="1" />
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* ── META SECTION ── */}
//             {activeSection === 'meta' && (
//               <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>

//                 {/* Slug */}
//                 <div>
//                   <span className="field-label">Slug URL</span>
//                   <div style={{ position:'relative' }}>
//                     <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(0,255,136,.4)', fontSize:11 }}>/blog/</span>
//                     <input
//                       className="field-input"
//                       value={slug}
//                       onChange={e => { setSlug(e.target.value); setSlugManual(true); }}
//                       style={{ paddingLeft:52 }}
//                       placeholder="mon-article-slug"
//                     />
//                   </div>
//                   {!slugManual && title && (
//                     <span style={{ fontSize:10, color:'rgba(0,255,136,.4)', marginTop:4, display:'block' }}>
//                       ↳ auto-généré depuis le titre
//                     </span>
//                   )}
//                 </div>

//                 {/* Read time */}
//                 <div style={{ padding:'12px 14px', background:'rgba(0,255,136,.04)', border:'1px solid rgba(0,255,136,.1)', borderRadius:8 }}>
//                   <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
//                     <span style={{ fontSize:11, color:'rgba(0,255,136,.6)' }}>Statistiques</span>
//                   </div>
//                   <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
//                     {[
//                       { label:'Mots', value: wordCount },
//                       { label:'Lecture', value: `${readTime}min` },
//                       { label:'Caractères', value: content.length },
//                     ].map(s => (
//                       <div key={s.label} style={{ textAlign:'center' }}>
//                         <div style={{ fontSize:18, fontFamily:'"Syne",sans-serif', fontWeight:800, color:'#00ff88' }}>{s.value}</div>
//                         <div style={{ fontSize:10, color:'rgba(200,210,255,.4)', marginTop:2 }}>{s.label}</div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>

//                 {/* Preview card */}
//                 {(title || excerpt || coverImage) && (
//                   <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.02)' }}>
//                     <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', padding:'6px 12px', borderBottom:'1px solid rgba(255,255,255,.05)', letterSpacing:2 }}>APERÇU CARTE</div>
//                     {coverImage && <div style={{ height:80, overflow:'hidden' }}><img src={coverImage} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.6)' }} /></div>}
//                     <div style={{ padding:'10px 12px' }}>
//                       <div style={{ fontSize:13, fontFamily:'"Syne",sans-serif', fontWeight:700, color:'#c8d2ff', lineHeight:1.3, marginBottom:6 }}>{title || 'Sans titre'}</div>
//                       <div style={{ fontSize:11, color:'rgba(200,210,255,.45)', lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{excerpt || 'Résumé de l\'article...'}</div>
//                     </div>
//                   </div>
//                 )}
//               </div>
//             )}

//             {/* ── SEO SECTION ── */}
//             {activeSection === 'seo' && (
//               <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s ease' }}>
//                 <div>
//                   <span className="field-label">Titre SEO</span>
//                   <input className="field-input" value={seoTitle} onChange={e => setSeoTitle(e.target.value)} placeholder={title || "Titre pour les moteurs de recherche"} />
//                   <div style={{ textAlign:'right', fontSize:10, color: seoTitle.length > 60 ? '#ff6b6b' : 'rgba(200,210,255,.25)', marginTop:4 }}>
//                     {(seoTitle || title).length}/60 {(seoTitle || title).length > 60 ? '⚠ trop long' : ''}
//                   </div>
//                 </div>

//                 <div>
//                   <span className="field-label">Meta description</span>
//                   <textarea
//                     className="field-input"
//                     value={seoDesc}
//                     onChange={e => setSeoDesc(e.target.value)}
//                     placeholder={excerpt || "Description pour les moteurs de recherche (160 chars max)"}
//                     rows={3}
//                     style={{ resize:'vertical' }}
//                   />
//                   <div style={{ textAlign:'right', fontSize:10, color: seoDesc.length > 160 ? '#ff6b6b' : 'rgba(200,210,255,.25)', marginTop:4 }}>
//                     {(seoDesc || excerpt).length}/160 {(seoDesc || excerpt).length > 160 ? '⚠ trop long' : ''}
//                   </div>
//                 </div>

//                 <div>
//                   <span className="field-label">Mots-clés</span>
//                   <input className="field-input" value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} placeholder="python, oracle cloud, boto3, vibe coding" />
//                   <span style={{ fontSize:10, color:'rgba(200,210,255,.25)', marginTop:4, display:'block' }}>Séparés par des virgules</span>
//                 </div>

//                 {/* Google preview */}
//                 <div style={{ padding:'14px', background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)', borderRadius:8 }}>
//                   <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:10 }}>APERÇU GOOGLE</div>
//                   <div style={{ fontSize:13, color:'#8ab4f8', marginBottom:4, fontFamily:'sans-serif' }}>
//                     {seoTitle || title || 'Titre de l\'article'}
//                   </div>
//                   <div style={{ fontSize:11, color:'rgba(26,200,80,.8)', marginBottom:6, fontFamily:'sans-serif' }}>
//                     adjoumani-koffi.com/blog/{slug || 'slug-article'}
//                   </div>
//                   <div style={{ fontSize:11, color:'rgba(200,200,200,.6)', lineHeight:1.5, fontFamily:'sans-serif', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
//                     {seoDesc || excerpt || 'Description de l\'article qui apparaît dans les résultats de recherche...'}
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* ── KEYBOARD SHORTCUTS ── */}
//             <div style={{ marginTop:'auto', padding:'12px', background:'rgba(0,0,0,.2)', borderRadius:8, border:'1px solid rgba(255,255,255,.04)' }}>
//               <div style={{ fontSize:10, color:'rgba(0,255,136,.4)', letterSpacing:2, marginBottom:8 }}>RACCOURCIS</div>
//               {[
//                 ['Ctrl+S', 'Sauvegarder brouillon'],
//                 ['Ctrl+P', 'Basculer aperçu'],
//                 ['Ctrl+Enter', 'Publier'],
//               ].map(([k, v]) => (
//                 <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'rgba(200,210,255,.35)', marginBottom:4 }}>
//                   <code style={{ color:'rgba(0,255,136,.5)' }}>{k}</code>
//                   <span>{v}</span>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// };

// export default AdminBlogPage;