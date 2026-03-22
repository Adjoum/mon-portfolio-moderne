// src/pages/BlogPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Article, Tag } from '../types/blog';
import { getArticles, getTags } from '../lib/api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatNumber(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function topReaction(r: Record<string, number>): string {
  const entries = Object.entries(r ?? {});
  if (!entries.length) return '';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

const Skeleton: React.FC<{ h?: number; w?: string }> = ({ h = 20, w = '100%' }) => (
  <div style={{ height: h, width: w, borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'skeleton 1.4s ease-in-out infinite' }} />
);

const Cursor: React.FC = () => (
  <span style={{ display: 'inline-block', width: 10, height: 18, background: '#00ff88', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
);

const SkeletonCard: React.FC = () => (
  <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
    <div style={{ height: 200, background: 'rgba(255,255,255,0.04)' }} />
    <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton h={14} w="40%" />
      <Skeleton h={22} w="90%" />
      <Skeleton h={18} w="75%" />
      <Skeleton h={14} w="60%" />
    </div>
  </div>
);

const ArticleCard: React.FC<{
  article: Article;
  index: number;
  featured?: boolean;
  isAdmin?: boolean;
  onDeleteSuccess?: (id: string) => void;
}> = ({ article, index, featured, isAdmin = false, onDeleteSuccess }) => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const totalReactions = Object.values(article.reactionsCount ?? {}).reduce((a, b) => a + b, 0);

  // ✅ FIX 1 : template literals — les \` échappés sont remplacés par de vrais backticks
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Supprimer "${article.title}" ?`)) return;
    try {
      const token = localStorage.getItem('blog_token');
      await fetch(`${import.meta.env.VITE_API_URL}/articles/${article._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onDeleteSuccess?.(article._id);
    } catch {
      alert('Erreur lors de la suppression');
    }
  };

  if (featured) {
    return (
      <Link to={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
        <article
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'relative', overflow: 'hidden', borderRadius: 16,
            background: 'rgba(0,255,136,0.03)',
            border: `1px solid ${hovered ? '#00ff88' : 'rgba(0,255,136,0.15)'}`,
            transition: 'all 0.4s cubic-bezier(0.23,1,0.32,1)',
            transform: hovered ? 'translateY(-4px)' : 'none',
            boxShadow: hovered ? '0 20px 60px rgba(0,255,136,0.15)' : 'none',
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            animation: `fadeInUp 0.6s ease ${index * 0.1}s both`,
          }}
        >
          <div style={{ position: 'relative', height: 380, overflow: 'hidden' }}>
            {article.coverImage && (
              <img
                src={article.coverImage}
                alt={article.title}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  filter: `brightness(${hovered ? 0.85 : 0.65}) saturate(1.2)`,
                  transition: 'all 0.6s ease',
                  transform: hovered ? 'scale(1.05)' : 'scale(1)',
                }}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 60%, #0a0e1a)' }} />
            <div style={{ position: 'absolute', top: 16, left: 16, background: '#00ff88', color: '#0a0e1a', padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 2, fontFamily: '"JetBrains Mono", monospace' }}>
              ★ FEATURED
            </div>
            {article.series && (
              <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', color: '#00ff88', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>
                {article.series} #{article.seriesOrder}
              </div>
            )}
          </div>
          <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {article.tags.slice(0, 3).map((tag: Tag) => (
                <span key={tag._id} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontFamily: '"JetBrains Mono", monospace', background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}>
                  {tag.name}
                </span>
              ))}
            </div>
            <div>
              <h2 style={{ fontSize: 28, fontFamily: '"Syne", sans-serif', fontWeight: 800, color: '#f0f4ff', lineHeight: 1.2, marginBottom: 16, letterSpacing: -0.5 }}>
                {article.title}
              </h2>
              <p style={{ color: 'rgba(200,210,255,0.65)', fontSize: 15, lineHeight: 1.7, marginBottom: 24, fontFamily: '"DM Sans", sans-serif' }}>
                {article.excerpt}
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(200,210,255,0.5)', fontFamily: '"JetBrains Mono", monospace' }}>
                <span>👁 {formatNumber(article.views)}</span>
                <span>💬 {article.commentsCount}</span>
                <span>{topReaction(article.reactionsCount)} {formatNumber(totalReactions)}</span>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
                {article.readTime} min read
              </span>
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
                {formatDate(article.publishedAt ?? article.createdAt)}
              </span>
              <span style={{ color: '#00ff88', fontSize: 13, fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
                Lire l'article{' '}
                <span style={{ transition: 'transform 0.3s', transform: hovered ? 'translateX(4px)' : 'none' }}>→</span>
              </span>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  // ✅ FIX 2 : </article> fermant manquant dans la branche non-featured
  return (
    <Link to={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
      <article
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative', overflow: 'hidden', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)',
          border: `1px solid ${hovered ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.06)'}`,
          transition: 'all 0.3s cubic-bezier(0.23,1,0.32,1)',
          transform: hovered ? 'translateY(-3px)' : 'none',
          boxShadow: hovered ? '0 12px 40px rgba(0,255,136,0.1)' : 'none',
          animation: `fadeInUp 0.6s ease ${index * 0.1}s both`,
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', height: '100%',
        }}
      >
        {/* Zone image */}
        <div style={{ height: 200, overflow: 'hidden', position: 'relative', flexShrink: 0, background: 'rgba(0,255,136,0.03)' }}>
          {article.coverImage ? (
            <>
              <img
                src={article.coverImage}
                alt={article.title}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  filter: `brightness(${hovered ? 0.8 : 0.6}) saturate(1.1)`,
                  transition: 'all 0.5s ease',
                  transform: hovered ? 'scale(1.04)' : 'scale(1)',
                }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, #0a0e1a)' }} />
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(0,255,136,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16 }}>📝</span>
              </div>
              <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, color: 'rgba(0,255,136,0.2)', letterSpacing: 3 }}>ARTICLE</span>
            </div>
          )}
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {article.tags.slice(0, 2).map((tag: Tag) => (
              <span key={tag._id} style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, fontFamily: '"JetBrains Mono", monospace', background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}33` }}>
                {tag.name}
              </span>
            ))}
          </div>

          <h3 style={{ fontSize: 18, fontFamily: '"Syne", sans-serif', fontWeight: 700, color: hovered ? '#f0f4ff' : '#c8d2ff', lineHeight: 1.3, marginBottom: 10, letterSpacing: -0.3, transition: 'color 0.3s' }}>
            {article.title}
          </h3>

          <p style={{ color: 'rgba(180,190,240,0.55)', fontSize: 13, lineHeight: 1.65, marginBottom: 16, fontFamily: '"DM Sans", sans-serif', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>
            {article.excerpt}
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 'auto' }}>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(180,190,240,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
              <span>👁 {formatNumber(article.views)}</span>
              <span>💬 {article.commentsCount}</span>
            </div>
            <span style={{ fontSize: 11, color: 'rgba(180,190,240,0.35)', fontFamily: '"JetBrains Mono", monospace' }}>
              {article.readTime}min · {formatDate(article.publishedAt ?? article.createdAt)}
            </span>
          </div>

          {/* Boutons admin */}
          {isAdmin && (
            <div
              onClick={e => { e.preventDefault(); e.stopPropagation(); }}
              style={{ display: 'flex', gap: 6, paddingTop: 10, borderTop: '1px dashed rgba(0,255,136,0.1)', marginTop: 10 }}
            >
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); navigate('/blog/edit/' + article._id); }}
                style={{ flex: 1, padding: '6px 0', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, cursor: 'pointer', color: '#00ff88', fontSize: 10, fontFamily: '"JetBrains Mono",monospace', letterSpacing: 1 }}
              >
                ✏ MODIFIER
              </button>
              {/* ✅ FIX 3 : bouton supprimer utilise maintenant deleteArticle de l'api (propre) via handleDelete */}
              <button
                onClick={handleDelete}
                style={{ flex: 1, padding: '6px 0', background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 6, cursor: 'pointer', color: '#ff6b6b', fontSize: 10, fontFamily: '"JetBrains Mono",monospace', letterSpacing: 1 }}
              >
                🗑 SUPPRIMER
              </button>
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); navigate('/blog/new'); }}
                style={{ padding: '6px 10px', background: 'rgba(97,218,251,0.08)', border: '1px solid rgba(97,218,251,0.2)', borderRadius: 6, cursor: 'pointer', color: '#61dafb', fontSize: 12 }}
                title="Nouvel article"
              >
                ＋
              </button>
            </div>
          )}
        </div>
      </article>  {/* ✅ FIX 2 : </article> était manquant ici */}
    </Link>
  );
};

const BlogPage: React.FC = () => {
  //const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('blog_user') || '{}');
      setIsAdmin(user?.role === 'admin');
    } catch { setIsAdmin(false); }
  }, []);

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typedText, setTypedText] = useState('');
  const [scrollY, setScrollY] = useState(0);
  const [totalStats, setTotalStats] = useState({ articles: 0, views: 0, reactions: 0, comments: 0 });
  const fullTitle = 'Vibe Coding Chronicles';
  const heroRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      if (i <= fullTitle.length) { setTypedText(fullTitle.slice(0, i)); i++; }
      else clearInterval(iv);
    }, 70);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => {
    getTags().then((data: Tag[]) => setTags(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: '1', limit: '20' });
    if (activeTag) params.append('tag', activeTag);
    if (debouncedSearch) params.append('search', debouncedSearch);
    getArticles(`?${params.toString()}`)
      .then((data: { articles: Article[]; total: number }) => {
        setArticles(data.articles);
        const views     = data.articles.reduce((s, a) => s + (a.views ?? 0), 0);
        const reactions = data.articles.reduce((s, a) => s + Object.values(a.reactionsCount ?? {}).reduce((x, y) => x + y, 0), 0);
        const comments  = data.articles.reduce((s, a) => s + (a.commentsCount ?? 0), 0);
        setTotalStats({ articles: data.total, views, reactions, comments });
      })
      .catch(() => setError("Impossible de charger les articles. L'API est-elle lancée ?"))
      .finally(() => setLoading(false));
  }, [activeTag, debouncedSearch]);

  const featuredArticles = articles.filter(a => a.featured);
  const regularArticles  = articles.filter(a => !a.featured);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes glitch   { 0%,100%{clip-path:inset(0 0 98% 0);transform:translate(-2px,0)} 20%{clip-path:inset(30% 0 50% 0);transform:translate(2px,0)} 40%{clip-path:inset(70% 0 10% 0);transform:translate(-1px,0)} 60%{clip-path:inset(10% 0 80% 0);transform:translate(1px,0)} 80%{clip-path:inset(50% 0 30% 0);transform:translate(0,0)} }
        @keyframes gridFloat{ 0%,100%{opacity:.03} 50%{opacity:.07} }
        @keyframes skeleton { 0%,100%{opacity:.5} 50%{opacity:1} }
        .blog-page *{box-sizing:border-box;margin:0;padding:0;}
        .search-input::placeholder{color:rgba(0,255,136,.3);}
        .search-input:focus{outline:none;border-color:rgba(0,255,136,.6)!important;}
        .tag-btn:hover{transform:translateY(-1px);}
      `}</style>

      <div className="blog-page" style={{ minHeight: '100vh', background: '#0a0e1a', color: '#c8d2ff', fontFamily: '"DM Sans",sans-serif', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, backgroundImage: 'linear-gradient(rgba(0,255,136,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.04) 1px,transparent 1px)', backgroundSize: '60px 60px', animation: 'gridFloat 4s ease-in-out infinite' }} />
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(to bottom,transparent,rgba(0,255,136,.06),transparent)', animation: 'scanline 8s linear infinite', pointerEvents: 'none', zIndex: 1 }} />
        <div style={{ position: 'fixed', top: -200, right: -200, width: 600, height: 600, borderRadius: '50%', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(circle,rgba(0,255,136,.06) 0%,transparent 70%)' }} />

        <header ref={heroRef} style={{ position: 'relative', zIndex: 2, padding: '80px 0 60px', transform: `translateY(${scrollY * 0.3}px)` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, fontFamily: '"JetBrains Mono",monospace', fontSize: 13, color: 'rgba(0,255,136,.6)' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#ff5f57', '#febc2e', '#28c840'].map(c => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                ))}
              </div>
              <span style={{ marginLeft: 8 }}>adjoumani@vibe-coding ~ $</span>
              <span style={{ color: '#00ff88' }}>cat blog.md</span>
            </div>
            <div style={{ position: 'relative' }}>
              {[{ color: '#ff0040', delay: '0.5s' }, { color: '#00ffff', delay: '0.7s' }].map((g, i) => (
                <div key={i} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', color: g.color, fontFamily: '"Syne",sans-serif', fontSize: 'clamp(48px,8vw,96px)', fontWeight: 800, animation: `glitch 4s infinite ${g.delay}`, userSelect: 'none' }}>
                  {typedText}
                </div>
              ))}
              <h1 style={{ fontSize: 'clamp(48px,8vw,96px)', fontFamily: '"Syne",sans-serif', fontWeight: 800, color: '#f0f4ff', lineHeight: 1, letterSpacing: -2, position: 'relative' }}>
                {typedText}<Cursor />
              </h1>
            </div>
            <p style={{ marginTop: 24, fontSize: 18, fontFamily: '"DM Sans",sans-serif', fontStyle: 'italic', color: 'rgba(200,210,255,.55)', maxWidth: 600, lineHeight: 1.7, animation: 'fadeInUp .8s ease .8s both' }}>
              Les vraies histoires du développement — les bugs, les nuits blanches, les solutions inattendues et les leçons apprises en{' '}
              <span style={{ color: '#00ff88', fontStyle: 'normal' }}>vibe coding</span>.
            </p>
            <div style={{ display: 'flex', gap: 32, marginTop: 32, animation: 'fadeInUp .8s ease 1s both' }}>
              {[
                { label: 'Articles',     value: loading ? '...' : totalStats.articles,               icon: '📝' },
                { label: 'Lectures',     value: loading ? '...' : formatNumber(totalStats.views),     icon: '👁' },
                { label: 'Réactions',    value: loading ? '...' : formatNumber(totalStats.reactions),  icon: '🔥' },
                { label: 'Commentaires', value: loading ? '...' : formatNumber(totalStats.comments),   icon: '💬' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontFamily: '"Syne",sans-serif', fontWeight: 800, color: '#00ff88' }}>{s.icon} {s.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(200,210,255,.4)', fontFamily: '"JetBrains Mono",monospace', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Sticky filters */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(10,14,26,.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,255,136,.1)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '0 0 280px' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,255,136,.5)', fontSize: 14, fontFamily: '"JetBrains Mono",monospace' }}>$_</span>
              <input
                className="search-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="rechercher..."
                style={{ width: '100%', background: 'rgba(0,255,136,.05)', border: '1px solid rgba(0,255,136,.2)', borderRadius: 8, padding: '10px 16px 10px 40px', color: '#c8d2ff', fontSize: 13, fontFamily: '"JetBrains Mono",monospace', transition: 'border-color .2s' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
              <button
                className="tag-btn"
                onClick={() => setActiveTag(null)}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: '"JetBrains Mono",monospace', whiteSpace: 'nowrap', transition: 'all .2s', background: !activeTag ? 'rgba(0,255,136,.15)' : 'transparent', border: `1px solid ${!activeTag ? '#00ff88' : 'rgba(255,255,255,.1)'}`, color: !activeTag ? '#00ff88' : 'rgba(200,210,255,.5)' }}
              >
                All
              </button>
              {tags.map((tag: Tag) => (
                <button
                  key={tag._id}
                  className="tag-btn"
                  onClick={() => setActiveTag(activeTag === tag.slug ? null : tag.slug)}
                  style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: '"JetBrains Mono",monospace', whiteSpace: 'nowrap', transition: 'all .2s', background: activeTag === tag.slug ? `${tag.color}22` : 'transparent', border: `1px solid ${activeTag === tag.slug ? tag.color : 'rgba(255,255,255,.08)'}`, color: activeTag === tag.slug ? tag.color : 'rgba(200,210,255,.45)' }}
                >
                  {tag.name} <span style={{ opacity: .5 }}>{tag.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <main style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '48px 24px 80px' }}>
          {error && (
            <div style={{ textAlign: 'center', padding: '60px 0', background: 'rgba(255,80,80,.05)', border: '1px solid rgba(255,80,80,.2)', borderRadius: 12 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <p style={{ fontFamily: '"JetBrains Mono",monospace', color: 'rgba(255,100,100,.8)', fontSize: 14 }}>{error}</p>
              <p style={{ fontFamily: '"JetBrains Mono",monospace', color: 'rgba(200,210,255,.4)', fontSize: 12, marginTop: 8 }}>$ cd blog-api && npm run dev</p>
            </div>
          )}

          {loading && !error && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 20 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {!loading && !error && featuredArticles.length > 0 && (
            <section style={{ marginBottom: 64 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: '#00ff88', letterSpacing: 3 }}>// featured</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,255,136,.15)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {featuredArticles.map((a, i) => (
                  <ArticleCard
                    key={a._id}
                    article={a}
                    index={i}
                    featured
                    isAdmin={isAdmin}
                    onDeleteSuccess={id => setArticles(prev => prev.filter(x => x._id !== id))}
                  />
                ))}
              </div>
            </section>
          )}

          {!loading && !error && regularArticles.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: 'rgba(200,210,255,.4)', letterSpacing: 3 }}>// latest_posts</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
                <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: 'rgba(200,210,255,.3)' }}>{regularArticles.length} articles</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 20, alignItems: 'stretch' }}>
                {regularArticles.map((a, i) => (
                  <ArticleCard
                    key={a._id}
                    article={a}
                    index={i}
                    isAdmin={isAdmin}
                    onDeleteSuccess={id => setArticles(prev => prev.filter(x => x._id !== id))}
                  />
                ))}
              </div>
            </section>
          )}

          {!loading && !error && articles.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <p style={{ fontFamily: '"JetBrains Mono",monospace', color: 'rgba(0,255,136,.6)', fontSize: 14 }}>
                $ grep -r "{search || activeTag}" ./blog → 0 results found
              </p>
            </div>
          )}
        </main>

        <footer style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(0,255,136,.1)', padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, color: 'rgba(0,255,136,.4)' }}>
            © 2026 Adjoumani Koffi Wilfried · Built with ❤️ & ☕ · Vibe Coded in Yamoussoukro
          </p>
        </footer>
      </div>
    </>
  );
};

export default BlogPage;














// import React, { useState, useEffect, useRef } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import type { Article, Tag } from '../types/blog';
// import { getArticles, getTags } from '../lib/api';

// function formatDate(iso: string): string {
//   return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
// }
// function formatNumber(n: number): string {
//   return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
// }
// function topReaction(r: Record<string, number>): string {
//   const entries = Object.entries(r ?? {});
//   if (!entries.length) return '';
//   return entries.sort((a, b) => b[1] - a[1])[0][0];
// }

// const Skeleton: React.FC<{ h?: number; w?: string }> = ({ h = 20, w = '100%' }) => (
//   <div style={{ height: h, width: w, borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'skeleton 1.4s ease-in-out infinite' }} />
// );

// const Cursor: React.FC = () => (
//   <span style={{ display: 'inline-block', width: 10, height: 18, background: '#00ff88', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
// );

// const SkeletonCard: React.FC = () => (
//   <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
//     <div style={{ height: 200, background: 'rgba(255,255,255,0.04)' }} />
//     <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
//       <Skeleton h={14} w="40%" />
//       <Skeleton h={22} w="90%" />
//       <Skeleton h={18} w="75%" />
//       <Skeleton h={14} w="60%" />
//     </div>
//   </div>
// );

// const ArticleCard: React.FC<{
//   article: Article;
//   index: number;
//   featured?: boolean;
//   isAdmin?: boolean;
//   onDeleteSuccess?: (id: string) => void;
// }> = ({ article, index, featured, isAdmin = false, onDeleteSuccess }) => {
//   const navigate = useNavigate();
//   const [hovered, setHovered] = useState(false);
//   const totalReactions = Object.values(article.reactionsCount ?? {}).reduce((a, b) => a + b, 0);

//   // ✅ FIX 1 : handleDelete — template literal correctement écrit (pas d'échappement nécessaire ici)
//   const handleDelete = async (e: React.MouseEvent) => {
//     e.preventDefault();
//     e.stopPropagation();
//     if (!confirm(`Supprimer "${article.title}" ?`)) return;
//     try {
//       const token = localStorage.getItem('blog_token');
//       await fetch(`${import.meta.env.VITE_API_URL}/articles/${article._id}`, {
//         method: 'DELETE',
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       onDeleteSuccess?.(article._id);
//     } catch {
//       alert('Erreur lors de la suppression');
//     }
//   };

//   if (featured) {
//     return (
//       <Link to={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
//         <article
//           onMouseEnter={() => setHovered(true)}
//           onMouseLeave={() => setHovered(false)}
//           style={{
//             position: 'relative', overflow: 'hidden', borderRadius: 16,
//             background: 'rgba(0,255,136,0.03)',
//             border: `1px solid ${hovered ? '#00ff88' : 'rgba(0,255,136,0.15)'}`,
//             transition: 'all 0.4s cubic-bezier(0.23,1,0.32,1)',
//             transform: hovered ? 'translateY(-4px)' : 'none',
//             boxShadow: hovered ? '0 20px 60px rgba(0,255,136,0.15)' : 'none',
//             display: 'grid', gridTemplateColumns: '1fr 1fr',
//             animation: `fadeInUp 0.6s ease ${index * 0.1}s both`,
//           }}
//         >
//           <div style={{ position: 'relative', height: 380, overflow: 'hidden' }}>
//             {article.coverImage && (
//               <img
//                 src={article.coverImage}
//                 alt={article.title}
//                 style={{
//                   width: '100%', height: '100%', objectFit: 'cover',
//                   filter: `brightness(${hovered ? 0.85 : 0.65}) saturate(1.2)`,
//                   transition: 'all 0.6s ease',
//                   transform: hovered ? 'scale(1.05)' : 'scale(1)',
//                 }}
//               />
//             )}
//             <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 60%, #0a0e1a)' }} />
//             <div style={{ position: 'absolute', top: 16, left: 16, background: '#00ff88', color: '#0a0e1a', padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 2, fontFamily: '"JetBrains Mono", monospace' }}>
//               ★ FEATURED
//             </div>
//             {article.series && (
//               <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', color: '#00ff88', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>
//                 {article.series} #{article.seriesOrder}
//               </div>
//             )}
//           </div>
//           <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
//             <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
//               {article.tags.slice(0, 3).map((tag: Tag) => (
//                 <span key={tag._id} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontFamily: '"JetBrains Mono", monospace', background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}>
//                   {tag.name}
//                 </span>
//               ))}
//             </div>
//             <div>
//               <h2 style={{ fontSize: 28, fontFamily: '"Syne", sans-serif', fontWeight: 800, color: '#f0f4ff', lineHeight: 1.2, marginBottom: 16, letterSpacing: -0.5 }}>
//                 {article.title}
//               </h2>
//               <p style={{ color: 'rgba(200,210,255,0.65)', fontSize: 15, lineHeight: 1.7, marginBottom: 24, fontFamily: '"DM Sans", sans-serif' }}>
//                 {article.excerpt}
//               </p>
//             </div>
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//               <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(200,210,255,0.5)', fontFamily: '"JetBrains Mono", monospace' }}>
//                 <span>👁 {formatNumber(article.views)}</span>
//                 <span>💬 {article.commentsCount}</span>
//                 <span>{topReaction(article.reactionsCount)} {formatNumber(totalReactions)}</span>
//               </div>
//               <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
//                 {article.readTime} min read
//               </span>
//             </div>
//             <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//               <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
//                 {formatDate(article.publishedAt ?? article.createdAt)}
//               </span>
//               <span style={{ color: '#00ff88', fontSize: 13, fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
//                 Lire l'article{' '}
//                 <span style={{ transition: 'transform 0.3s', transform: hovered ? 'translateX(4px)' : 'none' }}>→</span>
//               </span>
//             </div>
//           </div>
//         </article>
//       </Link>
//     );
//   }

//   // ✅ FIX 2 : accolade fermante du return non-featured était manquante — la voici correctement structurée
//   return (
//     <Link to={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
//       <article
//         onMouseEnter={() => setHovered(true)}
//         onMouseLeave={() => setHovered(false)}
//         style={{
//           position: 'relative', overflow: 'hidden', borderRadius: 12,
//           background: 'rgba(255,255,255,0.02)',
//           border: `1px solid ${hovered ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.06)'}`,
//           transition: 'all 0.3s cubic-bezier(0.23,1,0.32,1)',
//           transform: hovered ? 'translateY(-3px)' : 'none',
//           boxShadow: hovered ? '0 12px 40px rgba(0,255,136,0.1)' : 'none',
//           animation: `fadeInUp 0.6s ease ${index * 0.1}s both`,
//           cursor: 'pointer',
//           display: 'flex', flexDirection: 'column', height: '100%',
//         }}
//       >
//         {/* Zone image */}
//         <div style={{ height: 200, overflow: 'hidden', position: 'relative', flexShrink: 0, background: 'rgba(0,255,136,0.03)' }}>
//           {article.coverImage ? (
//             <>
//               <img
//                 src={article.coverImage}
//                 alt={article.title}
//                 style={{
//                   width: '100%', height: '100%', objectFit: 'cover',
//                   filter: `brightness(${hovered ? 0.8 : 0.6}) saturate(1.1)`,
//                   transition: 'all 0.5s ease',
//                   transform: hovered ? 'scale(1.04)' : 'scale(1)',
//                 }}
//               />
//               <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, #0a0e1a)' }} />
//             </>
//           ) : (
//             <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
//               <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(0,255,136,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                 <span style={{ fontSize: 16 }}>📝</span>
//               </div>
//               <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 9, color: 'rgba(0,255,136,0.2)', letterSpacing: 3 }}>ARTICLE</span>
//             </div>
//           )}
//         </div>

//         <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
//           <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
//             {article.tags.slice(0, 2).map((tag: Tag) => (
//               <span key={tag._id} style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, fontFamily: '"JetBrains Mono", monospace', background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}33` }}>
//                 {tag.name}
//               </span>
//             ))}
//           </div>

//           <h3 style={{ fontSize: 18, fontFamily: '"Syne", sans-serif', fontWeight: 700, color: hovered ? '#f0f4ff' : '#c8d2ff', lineHeight: 1.3, marginBottom: 10, letterSpacing: -0.3, transition: 'color 0.3s' }}>
//             {article.title}
//           </h3>

//           <p style={{ color: 'rgba(180,190,240,0.55)', fontSize: 13, lineHeight: 1.65, marginBottom: 16, fontFamily: '"DM Sans", sans-serif', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>
//             {article.excerpt}
//           </p>

//           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 'auto' }}>
//             <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(180,190,240,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
//               <span>👁 {formatNumber(article.views)}</span>
//               <span>💬 {article.commentsCount}</span>
//             </div>
//             <span style={{ fontSize: 11, color: 'rgba(180,190,240,0.35)', fontFamily: '"JetBrains Mono", monospace' }}>
//               {article.readTime}min · {formatDate(article.publishedAt ?? article.createdAt)}
//             </span>
//           </div>

//           {/* Boutons admin */}
//           {isAdmin && (
//             <div
//               onClick={e => { e.preventDefault(); e.stopPropagation(); }}
//               style={{ display: 'flex', gap: 6, paddingTop: 10, borderTop: '1px dashed rgba(0,255,136,0.1)', marginTop: 10 }}
//             >
//               <button
//                 onClick={e => { e.preventDefault(); e.stopPropagation(); navigate('/blog/edit/' + article._id); }}
//                 style={{ flex: 1, padding: '6px 0', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, cursor: 'pointer', color: '#00ff88', fontSize: 10, fontFamily: '"JetBrains Mono",monospace', letterSpacing: 1 }}
//               >
//                 ✏ MODIFIER
//               </button>
//               <button
//                 onClick={handleDelete}
//                 style={{ flex: 1, padding: '6px 0', background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 6, cursor: 'pointer', color: '#ff6b6b', fontSize: 10, fontFamily: '"JetBrains Mono",monospace', letterSpacing: 1 }}
//               >
//                 🗑 SUPPRIMER
//               </button>
//               <button
//                 onClick={e => { e.preventDefault(); e.stopPropagation(); navigate('/blog/new'); }}
//                 style={{ padding: '6px 10px', background: 'rgba(97,218,251,0.08)', border: '1px solid rgba(97,218,251,0.2)', borderRadius: 6, cursor: 'pointer', color: '#61dafb', fontSize: 12 }}
//                 title="Nouvel article"
//               >
//                 ＋
//               </button>
//             </div>
//           )}
//         </div>
//       </article>
//     </Link>
//   );
// };

// const BlogPage: React.FC = () => {
//   const navigate = useNavigate();
//   const [articles, setArticles] = useState<Article[]>([]);
//   const [isAdmin, setIsAdmin] = useState(false);

//   useEffect(() => {
//     try {
//       const user = JSON.parse(localStorage.getItem('blog_user') || '{}');
//       setIsAdmin(user?.role === 'admin');
//     } catch { setIsAdmin(false); }
//   }, []);

//   const [tags, setTags] = useState<Tag[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [activeTag, setActiveTag] = useState<string | null>(null);
//   const [search, setSearch] = useState('');
//   const [debouncedSearch, setDebouncedSearch] = useState('');
//   const [typedText, setTypedText] = useState('');
//   const [scrollY, setScrollY] = useState(0);
//   const [totalStats, setTotalStats] = useState({ articles: 0, views: 0, reactions: 0, comments: 0 });
//   const fullTitle = 'Vibe Coding Chronicles';
//   const heroRef = useRef<HTMLDivElement>(null);
//   const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

//   useEffect(() => {
//     let i = 0;
//     const iv = setInterval(() => {
//       if (i <= fullTitle.length) { setTypedText(fullTitle.slice(0, i)); i++; }
//       else clearInterval(iv);
//     }, 70);
//     return () => clearInterval(iv);
//   }, []);

//   useEffect(() => {
//     const onScroll = () => setScrollY(window.scrollY);
//     window.addEventListener('scroll', onScroll, { passive: true });
//     return () => window.removeEventListener('scroll', onScroll);
//   }, []);

//   useEffect(() => {
//     clearTimeout(searchTimer.current);
//     searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
//     return () => clearTimeout(searchTimer.current);
//   }, [search]);

//   useEffect(() => {
//     getTags().then((data: Tag[]) => setTags(data)).catch(() => {});
//   }, []);

//   useEffect(() => {
//     setLoading(true);
//     setError(null);
//     const params = new URLSearchParams({ page: '1', limit: '20' });
//     if (activeTag) params.append('tag', activeTag);
//     if (debouncedSearch) params.append('search', debouncedSearch);
//     getArticles(`?${params.toString()}`)
//       .then((data: { articles: Article[]; total: number }) => {
//         setArticles(data.articles);
//         const views     = data.articles.reduce((s, a) => s + (a.views ?? 0), 0);
//         const reactions = data.articles.reduce((s, a) => s + Object.values(a.reactionsCount ?? {}).reduce((x, y) => x + y, 0), 0);
//         const comments  = data.articles.reduce((s, a) => s + (a.commentsCount ?? 0), 0);
//         setTotalStats({ articles: data.total, views, reactions, comments });
//       })
//       .catch(() => setError("Impossible de charger les articles. L'API est-elle lancée ?"))
//       .finally(() => setLoading(false));
//   }, [activeTag, debouncedSearch]);

//   const featuredArticles = articles.filter(a => a.featured);
//   const regularArticles  = articles.filter(a => !a.featured);

//   return (
//     <>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
//         @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
//         @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
//         @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
//         @keyframes glitch   { 0%,100%{clip-path:inset(0 0 98% 0);transform:translate(-2px,0)} 20%{clip-path:inset(30% 0 50% 0);transform:translate(2px,0)} 40%{clip-path:inset(70% 0 10% 0);transform:translate(-1px,0)} 60%{clip-path:inset(10% 0 80% 0);transform:translate(1px,0)} 80%{clip-path:inset(50% 0 30% 0);transform:translate(0,0)} }
//         @keyframes gridFloat{ 0%,100%{opacity:.03} 50%{opacity:.07} }
//         @keyframes skeleton { 0%,100%{opacity:.5} 50%{opacity:1} }
//         .blog-page *{box-sizing:border-box;margin:0;padding:0;}
//         .search-input::placeholder{color:rgba(0,255,136,.3);}
//         .search-input:focus{outline:none;border-color:rgba(0,255,136,.6)!important;}
//         .tag-btn:hover{transform:translateY(-1px);}
//       `}</style>

//       <div className="blog-page" style={{ minHeight: '100vh', background: '#0a0e1a', color: '#c8d2ff', fontFamily: '"DM Sans",sans-serif', position: 'relative', overflow: 'hidden' }}>
//         {/* Background grid */}
//         <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, backgroundImage: 'linear-gradient(rgba(0,255,136,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.04) 1px,transparent 1px)', backgroundSize: '60px 60px', animation: 'gridFloat 4s ease-in-out infinite' }} />
//         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(to bottom,transparent,rgba(0,255,136,.06),transparent)', animation: 'scanline 8s linear infinite', pointerEvents: 'none', zIndex: 1 }} />
//         <div style={{ position: 'fixed', top: -200, right: -200, width: 600, height: 600, borderRadius: '50%', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(circle,rgba(0,255,136,.06) 0%,transparent 70%)' }} />

//         {/* Hero */}
//         <header ref={heroRef} style={{ position: 'relative', zIndex: 2, padding: '80px 0 60px', transform: `translateY(${scrollY * 0.3}px)` }}>
//           <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, fontFamily: '"JetBrains Mono",monospace', fontSize: 13, color: 'rgba(0,255,136,.6)' }}>
//               <div style={{ display: 'flex', gap: 6 }}>
//                 {['#ff5f57', '#febc2e', '#28c840'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
//               </div>
//               <span style={{ marginLeft: 8 }}>adjoumani@vibe-coding ~ $</span>
//               <span style={{ color: '#00ff88' }}>cat blog.md</span>
//             </div>
//             <div style={{ position: 'relative' }}>
//               {[{ color: '#ff0040', delay: '0.5s' }, { color: '#00ffff', delay: '0.7s' }].map((g, i) => (
//                 <div key={i} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', color: g.color, fontFamily: '"Syne",sans-serif', fontSize: 'clamp(48px,8vw,96px)', fontWeight: 800, animation: `glitch 4s infinite ${g.delay}`, userSelect: 'none' }}>
//                   {typedText}
//                 </div>
//               ))}
//               <h1 style={{ fontSize: 'clamp(48px,8vw,96px)', fontFamily: '"Syne",sans-serif', fontWeight: 800, color: '#f0f4ff', lineHeight: 1, letterSpacing: -2, position: 'relative' }}>
//                 {typedText}<Cursor />
//               </h1>
//             </div>
//             <p style={{ marginTop: 24, fontSize: 18, fontFamily: '"DM Sans",sans-serif', fontStyle: 'italic', color: 'rgba(200,210,255,.55)', maxWidth: 600, lineHeight: 1.7, animation: 'fadeInUp .8s ease .8s both' }}>
//               Les vraies histoires du développement — les bugs, les nuits blanches, les solutions inattendues et les leçons apprises en{' '}
//               <span style={{ color: '#00ff88', fontStyle: 'normal' }}>vibe coding</span>.
//             </p>
//             <div style={{ display: 'flex', gap: 32, marginTop: 32, animation: 'fadeInUp .8s ease 1s both' }}>
//               {[
//                 { label: 'Articles',     value: loading ? '...' : totalStats.articles,              icon: '📝' },
//                 { label: 'Lectures',     value: loading ? '...' : formatNumber(totalStats.views),    icon: '👁' },
//                 { label: 'Réactions',    value: loading ? '...' : formatNumber(totalStats.reactions), icon: '🔥' },
//                 { label: 'Commentaires', value: loading ? '...' : formatNumber(totalStats.comments),  icon: '💬' },
//               ].map(s => (
//                 <div key={s.label} style={{ textAlign: 'center' }}>
//                   <div style={{ fontSize: 22, fontFamily: '"Syne",sans-serif', fontWeight: 800, color: '#00ff88' }}>{s.icon} {s.value}</div>
//                   <div style={{ fontSize: 11, color: 'rgba(200,210,255,.4)', fontFamily: '"JetBrains Mono",monospace', marginTop: 2 }}>{s.label}</div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </header>

//         {/* Sticky nav / filters */}
//         <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(10,14,26,.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,255,136,.1)' }}>
//           <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
//             <div style={{ position: 'relative', flex: '0 0 280px' }}>
//               <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,255,136,.5)', fontSize: 14, fontFamily: '"JetBrains Mono",monospace' }}>$_</span>
//               <input
//                 className="search-input"
//                 value={search}
//                 onChange={e => setSearch(e.target.value)}
//                 placeholder="rechercher..."
//                 style={{ width: '100%', background: 'rgba(0,255,136,.05)', border: '1px solid rgba(0,255,136,.2)', borderRadius: 8, padding: '10px 16px 10px 40px', color: '#c8d2ff', fontSize: 13, fontFamily: '"JetBrains Mono",monospace', transition: 'border-color .2s' }}
//               />
//             </div>
//             <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: 'auto', paddingBottom: 2 }}>
//               <button
//                 className="tag-btn"
//                 onClick={() => setActiveTag(null)}
//                 style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: '"JetBrains Mono",monospace', whiteSpace: 'nowrap', transition: 'all .2s', background: !activeTag ? 'rgba(0,255,136,.15)' : 'transparent', border: `1px solid ${!activeTag ? '#00ff88' : 'rgba(255,255,255,.1)'}`, color: !activeTag ? '#00ff88' : 'rgba(200,210,255,.5)' }}
//               >
//                 All
//               </button>
//               {tags.map((tag: Tag) => (
//                 <button
//                   key={tag._id}
//                   className="tag-btn"
//                   onClick={() => setActiveTag(activeTag === tag.slug ? null : tag.slug)}
//                   style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: '"JetBrains Mono",monospace', whiteSpace: 'nowrap', transition: 'all .2s', background: activeTag === tag.slug ? `${tag.color}22` : 'transparent', border: `1px solid ${activeTag === tag.slug ? tag.color : 'rgba(255,255,255,.08)'}`, color: activeTag === tag.slug ? tag.color : 'rgba(200,210,255,.45)' }}
//                 >
//                   {tag.name} <span style={{ opacity: .5 }}>{tag.count}</span>
//                 </button>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* Main content */}
//         <main style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '48px 24px 80px' }}>
//           {error && (
//             <div style={{ textAlign: 'center', padding: '60px 0', background: 'rgba(255,80,80,.05)', border: '1px solid rgba(255,80,80,.2)', borderRadius: 12 }}>
//               <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
//               <p style={{ fontFamily: '"JetBrains Mono",monospace', color: 'rgba(255,100,100,.8)', fontSize: 14 }}>{error}</p>
//               <p style={{ fontFamily: '"JetBrains Mono",monospace', color: 'rgba(200,210,255,.4)', fontSize: 12, marginTop: 8 }}>$ cd blog-api && npm run dev</p>
//             </div>
//           )}

//           {loading && !error && (
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 20 }}>
//               {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
//             </div>
//           )}

//           {!loading && !error && featuredArticles.length > 0 && (
//             <section style={{ marginBottom: 64 }}>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
//                 <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: '#00ff88', letterSpacing: 3 }}>// featured</span>
//                 <div style={{ flex: 1, height: 1, background: 'rgba(0,255,136,.15)' }} />
//               </div>
//               <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
//                 {featuredArticles.map((a, i) => (
//                   <ArticleCard
//                     key={a._id}
//                     article={a}
//                     index={i}
//                     featured
//                     isAdmin={isAdmin}
//                     onDeleteSuccess={id => setArticles(prev => prev.filter(x => x._id !== id))}
//                   />
//                 ))}
//               </div>
//             </section>
//           )}

//           {!loading && !error && regularArticles.length > 0 && (
//             <section>
//               <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
//                 <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: 'rgba(200,210,255,.4)', letterSpacing: 3 }}>// latest_posts</span>
//                 <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
//                 <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 11, color: 'rgba(200,210,255,.3)' }}>{regularArticles.length} articles</span>
//               </div>
//               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 20, alignItems: 'stretch' }}>
//                 {regularArticles.map((a, i) => (
//                   <ArticleCard
//                     key={a._id}
//                     article={a}
//                     index={i}
//                     isAdmin={isAdmin}
//                     onDeleteSuccess={id => setArticles(prev => prev.filter(x => x._id !== id))}
//                   />
//                 ))}
//               </div>
//             </section>
//           )}

//           {!loading && !error && articles.length === 0 && (
//             <div style={{ textAlign: 'center', padding: '80px 0' }}>
//               <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
//               <p style={{ fontFamily: '"JetBrains Mono",monospace', color: 'rgba(0,255,136,.6)', fontSize: 14 }}>
//                 $ grep -r "{search || activeTag}" ./blog → 0 results found
//               </p>
//             </div>
//           )}
//         </main>

//         <footer style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(0,255,136,.1)', padding: '32px 24px', textAlign: 'center' }}>
//           <p style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 12, color: 'rgba(0,255,136,.4)' }}>
//             © 2026 Adjoumani Koffi Wilfried · Built with ❤️ & ☕ · Vibe Coded in Yamoussoukro
//           </p>
//         </footer>
//       </div>
//     </>
//   );
// };

// export default BlogPage;

























// // src/pages/BlogPage.tsx
// import React, { useState, useEffect, useRef } from 'react';
// import { Link } from 'react-router-dom';
// import type { Article, Tag } from '../types/blog';
// import { getArticles, getTags } from '../lib/api';

// function formatDate(iso: string): string {
//   return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
// }
// function formatNumber(n: number): string {
//   return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
// }
// function topReaction(r: Record<string, number>): string {
//   const entries = Object.entries(r ?? {});
//   if (!entries.length) return '';
//   return entries.sort((a, b) => b[1] - a[1])[0][0];
// }

// const Skeleton: React.FC<{ h?: number; w?: string }> = ({ h = 20, w = '100%' }) => (
//   <div style={{ height: h, width: w, borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'skeleton 1.4s ease-in-out infinite' }} />
// );

// const Cursor: React.FC = () => (
//   <span style={{ display: 'inline-block', width: 10, height: 18, background: '#00ff88', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
// );

// const SkeletonCard: React.FC = () => (
//   <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
//     <div style={{ height: 200, background: 'rgba(255,255,255,0.04)' }} />
//     <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
//       <Skeleton h={14} w="40%" />
//       <Skeleton h={22} w="90%" />
//       <Skeleton h={18} w="75%" />
//       <Skeleton h={14} w="60%" />
//     </div>
//   </div>
// );

// const ArticleCard: React.FC<{ article: Article; index: number; featured?: boolean }> = ({ article, index, featured }) => {
//   const [hovered, setHovered] = useState(false);
//   const totalReactions = Object.values(article.reactionsCount ?? {}).reduce((a, b) => a + b, 0);

//   if (featured) {
//     return (
//       <Link to={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
//         <article
//           onMouseEnter={() => setHovered(true)}
//           onMouseLeave={() => setHovered(false)}
//           style={{
//             position: 'relative', overflow: 'hidden', borderRadius: 16,
//             background: 'rgba(0,255,136,0.03)',
//             border: `1px solid ${hovered ? '#00ff88' : 'rgba(0,255,136,0.15)'}`,
//             transition: 'all 0.4s cubic-bezier(0.23,1,0.32,1)',
//             transform: hovered ? 'translateY(-4px)' : 'none',
//             boxShadow: hovered ? '0 20px 60px rgba(0,255,136,0.15)' : 'none',
//             display: 'grid', gridTemplateColumns: '1fr 1fr',
//             animation: `fadeInUp 0.6s ease ${index * 0.1}s both`,
//           }}
//         >
//           <div style={{ position: 'relative', height: 380, overflow: 'hidden' }}>
//             {article.coverImage && (
//               <img src={article.coverImage} alt={article.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `brightness(${hovered ? 0.85 : 0.65}) saturate(1.2)`, transition: 'all 0.6s ease', transform: hovered ? 'scale(1.05)' : 'scale(1)' }} />
//             )}
//             <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 60%, #0a0e1a)' }} />
//             <div style={{ position: 'absolute', top: 16, left: 16, background: '#00ff88', color: '#0a0e1a', padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 2, fontFamily: '"JetBrains Mono", monospace' }}>★ FEATURED</div>
//             {article.series && (
//               <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', color: '#00ff88', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>
//                 {article.series} #{article.seriesOrder}
//               </div>
//             )}
//           </div>
//           <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
//             <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
//               {article.tags.slice(0, 3).map((tag: Tag) => (
//                 <span key={tag._id} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontFamily: '"JetBrains Mono", monospace', background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}>{tag.name}</span>
//               ))}
//             </div>
//             <div>
//               <h2 style={{ fontSize: 28, fontFamily: '"Syne", sans-serif', fontWeight: 800, color: '#f0f4ff', lineHeight: 1.2, marginBottom: 16, letterSpacing: -0.5 }}>{article.title}</h2>
//               <p style={{ color: 'rgba(200,210,255,0.65)', fontSize: 15, lineHeight: 1.7, marginBottom: 24, fontFamily: '"DM Sans", sans-serif' }}>{article.excerpt}</p>
//             </div>
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//               <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(200,210,255,0.5)', fontFamily: '"JetBrains Mono", monospace' }}>
//                 <span>👁 {formatNumber(article.views)}</span>
//                 <span>💬 {article.commentsCount}</span>
//                 <span>{topReaction(article.reactionsCount)} {formatNumber(totalReactions)}</span>
//               </div>
//               <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>{article.readTime} min read</span>
//             </div>
//             <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//               <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>{formatDate(article.publishedAt ?? article.createdAt)}</span>
//               <span style={{ color: '#00ff88', fontSize: 13, fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
//                 Lire l'article <span style={{ transition: 'transform 0.3s', transform: hovered ? 'translateX(4px)' : 'none' }}>→</span>
//               </span>
//             </div>
//           </div>
//         </article>
//       </Link>
//     );
//   }

//   return (
//     <Link to={`/blog/${article.slug}`} style={{ textDecoration: 'none' }}>
//       <article
//         onMouseEnter={() => setHovered(true)}
//         onMouseLeave={() => setHovered(false)}
//         style={{
//           position: 'relative', overflow: 'hidden', borderRadius: 12,
//           background: 'rgba(255,255,255,0.02)',
//           border: `1px solid ${hovered ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.06)'}`,
//           transition: 'all 0.3s cubic-bezier(0.23,1,0.32,1)',
//           transform: hovered ? 'translateY(-3px)' : 'none',
//           boxShadow: hovered ? '0 12px 40px rgba(0,255,136,0.1)' : 'none',
//           animation: `fadeInUp 0.6s ease ${index * 0.1}s both`, cursor: 'pointer',
//         }}
//       >
//         {article.coverImage && (
//           <div style={{ height: 200, overflow: 'hidden', position: 'relative' }}>
//             <img src={article.coverImage} alt={article.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `brightness(${hovered ? 0.8 : 0.6}) saturate(1.1)`, transition: 'all 0.5s ease', transform: hovered ? 'scale(1.04)' : 'scale(1)' }} />
//             <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, #0a0e1a)' }} />
//           </div>
//         )}
//         <div style={{ padding: '20px 24px 24px' }}>
//           <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
//             {article.tags.slice(0, 2).map((tag: Tag) => (
//               <span key={tag._id} style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, fontFamily: '"JetBrains Mono", monospace', background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}33` }}>{tag.name}</span>
//             ))}
//           </div>
//           <h3 style={{ fontSize: 18, fontFamily: '"Syne", sans-serif', fontWeight: 700, color: hovered ? '#f0f4ff' : '#c8d2ff', lineHeight: 1.3, marginBottom: 10, letterSpacing: -0.3, transition: 'color 0.3s' }}>{article.title}</h3>
//           <p style={{ color: 'rgba(180,190,240,0.55)', fontSize: 13, lineHeight: 1.65, marginBottom: 16, fontFamily: '"DM Sans", sans-serif', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{article.excerpt}</p>
//           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
//             <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(180,190,240,0.4)', fontFamily: '"JetBrains Mono", monospace' }}>
//               <span>👁 {formatNumber(article.views)}</span>
//               <span>💬 {article.commentsCount}</span>
//             </div>
//             <span style={{ fontSize: 11, color: 'rgba(180,190,240,0.35)', fontFamily: '"JetBrains Mono", monospace' }}>{article.readTime}min · {formatDate(article.publishedAt ?? article.createdAt)}</span>
//           </div>
//         </div>
//       </article>
//     </Link>
//   );
// };

// const BlogPage: React.FC = () => {
//   const [articles, setArticles] = useState<Article[]>([]);
//   const [tags, setTags] = useState<Tag[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [activeTag, setActiveTag] = useState<string | null>(null);
//   const [search, setSearch] = useState('');
//   const [debouncedSearch, setDebouncedSearch] = useState('');
//   const [typedText, setTypedText] = useState('');
//   const [scrollY, setScrollY] = useState(0);
//   const [totalStats, setTotalStats] = useState({ articles: 0, views: 0, reactions: 0, comments: 0 });
//   const fullTitle = 'Vibe Coding Chronicles';
//   const heroRef = useRef<HTMLDivElement>(null);
//   const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

//   useEffect(() => {
//     let i = 0;
//     const iv = setInterval(() => {
//       if (i <= fullTitle.length) { setTypedText(fullTitle.slice(0, i)); i++; }
//       else clearInterval(iv);
//     }, 70);
//     return () => clearInterval(iv);
//   }, []);

//   useEffect(() => {
//     const onScroll = () => setScrollY(window.scrollY);
//     window.addEventListener('scroll', onScroll, { passive: true });
//     return () => window.removeEventListener('scroll', onScroll);
//   }, []);

//   useEffect(() => {
//     clearTimeout(searchTimer.current);
//     searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
//     return () => clearTimeout(searchTimer.current);
//   }, [search]);

//   useEffect(() => {
//     getTags().then((data: Tag[]) => setTags(data)).catch(() => {});
//   }, []);

//   useEffect(() => {
//     setLoading(true);
//     setError(null);
//     const params = new URLSearchParams({ page: '1', limit: '20' });
//     if (activeTag) params.append('tag', activeTag);
//     if (debouncedSearch) params.append('search', debouncedSearch);
//     getArticles(`?${params.toString()}`)
//       .then((data: { articles: Article[]; total: number }) => {
//         setArticles(data.articles);
//         const views     = data.articles.reduce((s, a) => s + (a.views ?? 0), 0);
//         const reactions = data.articles.reduce((s, a) => s + Object.values(a.reactionsCount ?? {}).reduce((x, y) => x + y, 0), 0);
//         const comments  = data.articles.reduce((s, a) => s + (a.commentsCount ?? 0), 0);
//         setTotalStats({ articles: data.total, views, reactions, comments });
//       })
//       .catch(() => setError("Impossible de charger les articles. L'API est-elle lancée ?"))
//       .finally(() => setLoading(false));
//   }, [activeTag, debouncedSearch]);

//   const featuredArticles = articles.filter(a => a.featured);
//   const regularArticles  = articles.filter(a => !a.featured);

//   return (
//     <>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
//         @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
//         @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
//         @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
//         @keyframes glitch   { 0%,100%{clip-path:inset(0 0 98% 0);transform:translate(-2px,0)} 20%{clip-path:inset(30% 0 50% 0);transform:translate(2px,0)} 40%{clip-path:inset(70% 0 10% 0);transform:translate(-1px,0)} 60%{clip-path:inset(10% 0 80% 0);transform:translate(1px,0)} 80%{clip-path:inset(50% 0 30% 0);transform:translate(0,0)} }
//         @keyframes gridFloat{ 0%,100%{opacity:.03} 50%{opacity:.07} }
//         @keyframes skeleton { 0%,100%{opacity:.5} 50%{opacity:1} }
//         .blog-page *{box-sizing:border-box;margin:0;padding:0;}
//         .search-input::placeholder{color:rgba(0,255,136,.3);}
//         .search-input:focus{outline:none;border-color:rgba(0,255,136,.6)!important;}
//         .tag-btn:hover{transform:translateY(-1px);}
//       `}</style>
//       <div className="blog-page" style={{ minHeight:'100vh', background:'#0a0e1a', color:'#c8d2ff', fontFamily:'"DM Sans",sans-serif', position:'relative', overflow:'hidden' }}>
//         <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, backgroundImage:'linear-gradient(rgba(0,255,136,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.04) 1px,transparent 1px)', backgroundSize:'60px 60px', animation:'gridFloat 4s ease-in-out infinite' }} />
//         <div style={{ position:'fixed', top:0, left:0, right:0, height:3, background:'linear-gradient(to bottom,transparent,rgba(0,255,136,.06),transparent)', animation:'scanline 8s linear infinite', pointerEvents:'none', zIndex:1 }} />
//         <div style={{ position:'fixed', top:-200, right:-200, width:600, height:600, borderRadius:'50%', pointerEvents:'none', zIndex:0, background:'radial-gradient(circle,rgba(0,255,136,.06) 0%,transparent 70%)' }} />

//         <header ref={heroRef} style={{ position:'relative', zIndex:2, padding:'80px 0 60px', transform:`translateY(${scrollY * 0.3}px)` }}>
//           <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 24px' }}>
//             <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:32, fontFamily:'"JetBrains Mono",monospace', fontSize:13, color:'rgba(0,255,136,.6)' }}>
//               <div style={{ display:'flex', gap:6 }}>
//                 {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c }} />)}
//               </div>
//               <span style={{ marginLeft:8 }}>adjoumani@vibe-coding ~ $</span>
//               <span style={{ color:'#00ff88' }}>cat blog.md</span>
//             </div>
//             <div style={{ position:'relative' }}>
//               {[{color:'#ff0040',delay:'0.5s'},{color:'#00ffff',delay:'0.7s'}].map((g,i) => (
//                 <div key={i} style={{ position:'absolute', inset:0, pointerEvents:'none', color:g.color, fontFamily:'"Syne",sans-serif', fontSize:'clamp(48px,8vw,96px)', fontWeight:800, animation:`glitch 4s infinite ${g.delay}`, userSelect:'none' }}>{typedText}</div>
//               ))}
//               <h1 style={{ fontSize:'clamp(48px,8vw,96px)', fontFamily:'"Syne",sans-serif', fontWeight:800, color:'#f0f4ff', lineHeight:1, letterSpacing:-2, position:'relative' }}>{typedText}<Cursor /></h1>
//             </div>
//             <p style={{ marginTop:24, fontSize:18, fontFamily:'"DM Sans",sans-serif', fontStyle:'italic', color:'rgba(200,210,255,.55)', maxWidth:600, lineHeight:1.7, animation:'fadeInUp .8s ease .8s both' }}>
//               Les vraies histoires du développement — les bugs, les nuits blanches, les solutions inattendues et les leçons apprises en <span style={{ color:'#00ff88', fontStyle:'normal' }}>vibe coding</span>.
//             </p>
//             <div style={{ display:'flex', gap:32, marginTop:32, animation:'fadeInUp .8s ease 1s both' }}>
//               {[
//                 { label:'Articles', value: loading ? '...' : totalStats.articles, icon:'📝' },
//                 { label:'Lectures', value: loading ? '...' : formatNumber(totalStats.views), icon:'👁' },
//                 { label:'Réactions', value: loading ? '...' : formatNumber(totalStats.reactions), icon:'🔥' },
//                 { label:'Commentaires', value: loading ? '...' : formatNumber(totalStats.comments), icon:'💬' },
//               ].map(s => (
//                 <div key={s.label} style={{ textAlign:'center' }}>
//                   <div style={{ fontSize:22, fontFamily:'"Syne",sans-serif', fontWeight:800, color:'#00ff88' }}>{s.icon} {s.value}</div>
//                   <div style={{ fontSize:11, color:'rgba(200,210,255,.4)', fontFamily:'"JetBrains Mono",monospace', marginTop:2 }}>{s.label}</div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </header>

//         <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(10,14,26,.92)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(0,255,136,.1)' }}>
//           <div style={{ maxWidth:1200, margin:'0 auto', padding:'16px 24px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
//             <div style={{ position:'relative', flex:'0 0 280px' }}>
//               <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'rgba(0,255,136,.5)', fontSize:14, fontFamily:'"JetBrains Mono",monospace' }}>$_</span>
//               <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="rechercher..."
//                 style={{ width:'100%', background:'rgba(0,255,136,.05)', border:'1px solid rgba(0,255,136,.2)', borderRadius:8, padding:'10px 16px 10px 40px', color:'#c8d2ff', fontSize:13, fontFamily:'"JetBrains Mono",monospace', transition:'border-color .2s' }} />
//             </div>
//             <div style={{ display:'flex', gap:8, flex:1, overflowX:'auto', paddingBottom:2 }}>
//               <button className="tag-btn" onClick={() => setActiveTag(null)} style={{ padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:'"JetBrains Mono",monospace', whiteSpace:'nowrap', transition:'all .2s', background:!activeTag?'rgba(0,255,136,.15)':'transparent', border:`1px solid ${!activeTag?'#00ff88':'rgba(255,255,255,.1)'}`, color:!activeTag?'#00ff88':'rgba(200,210,255,.5)' }}>All</button>
//               {tags.map((tag: Tag) => (
//                 <button key={tag._id} className="tag-btn" onClick={() => setActiveTag(activeTag === tag.slug ? null : tag.slug)}
//                   style={{ padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:'"JetBrains Mono",monospace', whiteSpace:'nowrap', transition:'all .2s', background:activeTag===tag.slug?`${tag.color}22`:'transparent', border:`1px solid ${activeTag===tag.slug?tag.color:'rgba(255,255,255,.08)'}`, color:activeTag===tag.slug?tag.color:'rgba(200,210,255,.45)' }}>
//                   {tag.name} <span style={{ opacity:.5 }}>{tag.count}</span>
//                 </button>
//               ))}
//             </div>
//           </div>
//         </div>

//         <main style={{ position:'relative', zIndex:2, maxWidth:1200, margin:'0 auto', padding:'48px 24px 80px' }}>
//           {error && (
//             <div style={{ textAlign:'center', padding:'60px 0', background:'rgba(255,80,80,.05)', border:'1px solid rgba(255,80,80,.2)', borderRadius:12 }}>
//               <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
//               <p style={{ fontFamily:'"JetBrains Mono",monospace', color:'rgba(255,100,100,.8)', fontSize:14 }}>{error}</p>
//               <p style={{ fontFamily:'"JetBrains Mono",monospace', color:'rgba(200,210,255,.4)', fontSize:12, marginTop:8 }}>$ cd blog-api && npm run dev</p>
//             </div>
//           )}
//           {loading && !error && (
//             <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:20 }}>
//               {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
//             </div>
//           )}
//           {!loading && !error && featuredArticles.length > 0 && (
//             <section style={{ marginBottom:64 }}>
//               <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:28 }}>
//                 <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:'#00ff88', letterSpacing:3 }}>// featured</span>
//                 <div style={{ flex:1, height:1, background:'rgba(0,255,136,.15)' }} />
//               </div>
//               <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
//                 {featuredArticles.map((a, i) => <ArticleCard key={a._id} article={a} index={i} featured />)}
//               </div>
//             </section>
//           )}
//           {!loading && !error && regularArticles.length > 0 && (
//             <section>
//               <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:28 }}>
//                 <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:'rgba(200,210,255,.4)', letterSpacing:3 }}>// latest_posts</span>
//                 <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }} />
//                 <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:'rgba(200,210,255,.3)' }}>{regularArticles.length} articles</span>
//               </div>
//               <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:20 }}>
//                 {regularArticles.map((a, i) => <ArticleCard key={a._id} article={a} index={i} />)}
//               </div>
//             </section>
//           )}
//           {!loading && !error && articles.length === 0 && (
//             <div style={{ textAlign:'center', padding:'80px 0' }}>
//               <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
//               <p style={{ fontFamily:'"JetBrains Mono",monospace', color:'rgba(0,255,136,.6)', fontSize:14 }}>$ grep -r "{search || activeTag}" ./blog → 0 results found</p>
//             </div>
//           )}
//         </main>

//         <footer style={{ position:'relative', zIndex:2, borderTop:'1px solid rgba(0,255,136,.1)', padding:'32px 24px', textAlign:'center' }}>
//           <p style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:12, color:'rgba(0,255,136,.4)' }}>
//             © 2026 Adjoumani Koffi Wilfried · Built with ❤️ & ☕ · Vibe Coded in Yamoussoukro
//           </p>
//         </footer>
//       </div>
//     </>
//   );
// };

// export default BlogPage;