// src/pages/BlogPostPage.tsx
// Page article individuel avec :
//  - Rendu Markdown+code (react-markdown + prism)
//  - Réactions emoji (social-like)
//  - Commentaires infinis récursifs
//  - SEO (Helmet)
//  - Partage social
import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { Comment, Article } from '../types/blog';
import { getArticle, getComments, postComment as apiPostComment, editComment as apiEditComment, deleteComment as apiDeleteComment } from '../lib/api';





// ── Build comment tree ────────────────────────────────────────
function buildTree(comments: Comment[]): Comment[] {
  const map: Record<string, Comment & { replies: Comment[] }> = {};
  const roots: (Comment & { replies: Comment[] })[] = [];
  comments.forEach(c => { map[c._id] = { ...c, replies: [] }; });
  comments.forEach(c => {
    if (c.parentId && map[c.parentId]) {
      map[c.parentId].replies.push(map[c._id]);
    } else if (!c.parentId) {
      roots.push(map[c._id]);
    }
  });
  return roots;
}

// ── Helpers ───────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

const REACTIONS = ['❤️', '🔥', '🤯', '💡', '👏', '😭', '🙏', '🚀'];

// ── CommentItem (recursive) ───────────────────────────────────
const CommentItem: React.FC<{
  comment: Comment & { replies?: (Comment & { replies?: Comment[] })[] };
  articleId: string;
  currentUser: string | null;
  isAdmin: boolean;
  onReply: (parentId: string, content: string, authorName: string, authorEmail: string) => void;
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  depth?: number;
}> = ({ comment, articleId, currentUser, isAdmin, onReply, onEdit, onDelete, depth = 0 }) => {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showReplies, setShowReplies] = useState(depth < 2);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openEmoji  = () => { clearTimeout(emojiHideTimer.current); setShowEmojiPicker(true); };
  const closeEmoji = () => { emojiHideTimer.current = setTimeout(() => setShowEmojiPicker(false), 200); };
  const isGuest = 'name' in comment.author;
  const authorName = isGuest ? (comment.author as any).name : (comment.author as any).username;
  const isOwn = !isGuest && currentUser === (comment.author as any)._id;
  const canModify = isOwn || isAdmin;
  const reactionCount = Object.values(comment.reactions || {}).flat().length;

  const borderLeft = depth > 0 ? `2px solid rgba(${depth === 1 ? '0,255,136' : '97,218,251'},0.2)` : 'none';

  if (comment.isDeleted) {
    return (
      <div style={{ marginLeft: depth * 24, padding: '12px 16px', borderLeft, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.25)', fontStyle: 'italic', fontFamily: '"JetBrains Mono", monospace' }}>
          [commentaire supprimé]
        </span>
        {comment.replies && comment.replies.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {comment.replies.map((r: any) => (
              <CommentItem key={r._id} comment={r} articleId={articleId} currentUser={currentUser}
                isAdmin={isAdmin} onReply={onReply} onEdit={onEdit} onDelete={onDelete} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginLeft: depth * 24, paddingLeft: depth > 0 ? 16 : 0, borderLeft, marginBottom: 16 }}>
      {/* Comment bubble */}
      <div style={{
        background: depth === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,255,136,0.02)',
        border: `1px solid rgba(${depth === 0 ? '255,255,255' : '0,255,136'},0.06)`,
        borderRadius: 12, padding: '16px 20px',
        transition: 'border-color 0.2s',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: `hsl(${authorName.charCodeAt(0) * 7 % 360}, 60%, 40%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#fff',
              border: isAdmin && !isGuest ? '2px solid #00ff88' : 'none',
              flexShrink: 0,
            }}>
              {authorName[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#e0e8ff', fontFamily: '"DM Sans", sans-serif' }}>
                  {authorName}
                </span>
                {!isGuest && (comment.author as any).role === 'admin' && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3,
                    background: 'rgba(0,255,136,0.15)', color: '#00ff88',
                    fontFamily: '"JetBrains Mono", monospace', letterSpacing: 1,
                  }}>AUTEUR</span>
                )}
                {isGuest && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3,
                    background: 'rgba(255,255,255,0.05)', color: 'rgba(200,210,255,0.4)',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>guest</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(200,210,255,0.35)', fontFamily: '"JetBrains Mono", monospace' }}>
                {timeAgo(comment.createdAt)}
                {comment.isEdited && <span style={{ marginLeft: 8, opacity: 0.6 }}>· modifié</span>}
              </div>
            </div>
          </div>

          {/* Actions */}
          {canModify && (
            <div style={{ display: 'flex', gap: 8 }}>
              {isOwn && !isGuest && (
                <button onClick={() => setIsEditing(!isEditing)} style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  fontSize: 11, color: 'rgba(200,210,255,0.5)',
                  fontFamily: '"JetBrains Mono", monospace', transition: 'all 0.2s',
                }}>✏️ edit</button>
              )}
              {canModify && (
                <button onClick={() => onDelete(comment._id)} style={{
                  background: 'transparent', border: '1px solid rgba(255,80,80,0.2)',
                  borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  fontSize: 11, color: 'rgba(255,100,100,0.6)',
                  fontFamily: '"JetBrains Mono", monospace', transition: 'all 0.2s',
                }}>🗑 del</button>
              )}
            </div>
          )}
        </div>

        {/* Content or Edit form */}
        {isEditing ? (
          <div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              style={{
                width: '100%', minHeight: 80, background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(0,255,136,0.3)', borderRadius: 8,
                padding: 12, color: '#c8d2ff', fontSize: 14,
                fontFamily: '"DM Sans", sans-serif', resize: 'vertical',
              }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { onEdit(comment._id, editContent); setIsEditing(false); }}
                style={{
                  background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88',
                  borderRadius: 6, padding: '6px 16px', cursor: 'pointer',
                  color: '#00ff88', fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
                }}>Sauvegarder</button>
              <button onClick={() => setIsEditing(false)}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, padding: '6px 16px', cursor: 'pointer',
                  color: 'rgba(200,210,255,0.5)', fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
                }}>Annuler</button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 14, lineHeight: 1.75, color: 'rgba(200,210,255,0.8)', fontFamily: '"DM Sans", sans-serif' }}>
            {comment.content}
          </p>
        )}

        {/* Reactions + Reply */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
            {/* Reaction button */}
            <div style={{ position: 'relative' }}
              onMouseEnter={openEmoji}
              onMouseLeave={closeEmoji}
            >
              <button style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16, padding: '3px 10px', cursor: 'pointer',
                fontSize: 13, color: 'rgba(200,210,255,0.5)',
              }}>
                + 😊 {reactionCount > 0 && reactionCount}
              </button>
              {/* Emoji picker */}
              {showEmojiPicker && (
                <div
                  onMouseEnter={openEmoji}
                  onMouseLeave={closeEmoji}
                  style={{
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                  background: '#131828', border: '1px solid rgba(0,255,136,0.2)',
                  borderRadius: 12, padding: '8px 12px',
                  display: 'flex', gap: 6, zIndex: 10,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                  {REACTIONS.map(r => (
                    <button key={r} style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 20, transition: 'transform 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.3)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >{r}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Existing reactions */}
            {Object.entries(comment.reactions || {}).map(([emoji, users]) =>
              (users as string[]).length > 0 && (
                <span key={emoji} style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, padding: '2px 8px', fontSize: 12,
                  color: 'rgba(200,210,255,0.6)',
                }}>
                  {emoji} {(users as string[]).length}
                </span>
              )
            )}
          </div>

          <button onClick={() => setShowReplyForm(!showReplyForm)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'rgba(0,255,136,0.6)',
            fontFamily: '"JetBrains Mono", monospace', padding: '4px 8px',
          }}>
            ↩ répondre
          </button>
        </div>
      </div>

      {/* Reply form */}
      {showReplyForm && (
        <div style={{
          marginTop: 12, marginLeft: 24, padding: 16,
          background: 'rgba(0,255,136,0.03)', borderRadius: 10,
          border: '1px solid rgba(0,255,136,0.15)',
          animation: 'fadeInUp 0.3s ease',
        }}>
          {!currentUser && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input value={guestName} onChange={e => setGuestName(e.target.value)}
                placeholder="Votre nom *"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, padding: '8px 12px', color: '#c8d2ff', fontSize: 13, fontFamily: '"DM Sans", sans-serif' }} />
              <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                placeholder="Email (non publié) *"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, padding: '8px 12px', color: '#c8d2ff', fontSize: 13, fontFamily: '"DM Sans", sans-serif' }} />
            </div>
          )}
          <textarea value={replyContent} onChange={e => setReplyContent(e.target.value)}
            placeholder="Votre réponse..."
            style={{
              width: '100%', minHeight: 80,
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)',
              borderRadius: 8, padding: 12, color: '#c8d2ff', fontSize: 14,
              fontFamily: '"DM Sans", sans-serif', resize: 'vertical',
            }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                if (replyContent.trim()) {
                  onReply(comment._id, replyContent, guestName, guestEmail);
                  setReplyContent(''); setGuestName(''); setGuestEmail('');
                  setShowReplyForm(false);
                }
              }}
              style={{
                background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.5)',
                borderRadius: 6, padding: '7px 18px', cursor: 'pointer',
                color: '#00ff88', fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
              }}>Envoyer →</button>
            <button onClick={() => setShowReplyForm(false)}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '7px 14px', cursor: 'pointer',
                color: 'rgba(200,210,255,0.4)', fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
              }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {!showReplies && (
            <button onClick={() => setShowReplies(true)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'rgba(0,255,136,0.5)',
              fontFamily: '"JetBrains Mono", monospace', padding: '4px 0 4px 20px',
            }}>
              ↓ Voir {comment.replies.length} réponse{comment.replies.length > 1 ? 's' : ''}
            </button>
          )}
          {showReplies && comment.replies.map((reply: any) => (
            <CommentItem key={reply._id} comment={reply} articleId={articleId}
              currentUser={currentUser} isAdmin={isAdmin}
              onReply={onReply} onEdit={onEdit} onDelete={onDelete}
              depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main BlogPostPage ─────────────────────────────────────────
const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | undefined>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [_loadingArticle, setLoadingArticle] = useState(true);

  // Charger l'article depuis l'API
  useEffect(() => {
    if (!slug) return;
    setLoadingArticle(true);
    getArticle(slug)
      .then((data: Article) => setArticle(data))
      .catch(() => setArticle(undefined))
      .finally(() => setLoadingArticle(false));
  }, [slug]);

  // Charger les commentaires depuis l'API
  useEffect(() => {
    if (!article?._id) return;
    getComments(article._id)
      .then((data: { comments: Comment[]; total: number }) => {
        // Aplatir l'arbre reçu du serveur en liste plate pour buildTree
        const flatten = (nodes: any[]): Comment[] =>
          nodes.flatMap(n => [n, ...flatten(n.replies ?? [])]);
        setComments(flatten(data.comments));
      })
      .catch(console.error);
  }, [article?._id]);
  const [newComment, setNewComment] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [articleReaction, setArticleReaction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const currentUser = null; // remplacer par ton auth context
  const isAdmin = false;    // remplacer par ton auth context
  const contentRef = useRef<HTMLDivElement>(null);

  // Reading progress
  useEffect(() => {
    const onScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const { top, height } = el.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (-top) / (height - window.innerHeight)));
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // SEO meta tags
  useEffect(() => {
    if (article) {
      document.title = `${article.seo.title || article.title} | Adjoumani Blog`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', article.seo.description || article.excerpt);
    }
  }, [article]);

  const tree = buildTree(comments);

  const handleAddComment = async () => {
    if (!newComment.trim() || !article) return;
    if (!currentUser && (!guestName.trim() || !guestEmail.trim())) return;
    try {
      const c = await apiPostComment({
        articleId: article._id,
        content: newComment,
        parentId: null,
        guestName: currentUser ? undefined : guestName,
        guestEmail: currentUser ? undefined : guestEmail,
      });
      setComments(prev => [c, ...prev]);
      setNewComment(''); setGuestName(''); setGuestEmail('');
    } catch (err) {
      console.error('Erreur post comment:', err);
    }
  };

  const handleReply = async (parentId: string, content: string, name: string, email: string) => {
    if (!article) return;
    try {
      const c = await apiPostComment({
        articleId: article._id, content, parentId,
        guestName: currentUser ? undefined : name,
        guestEmail: currentUser ? undefined : email,
      });
      setComments(prev => [...prev, c]);
    } catch (err) {
      console.error('Erreur reply:', err);
    }
  };

  const handleEdit = async (id: string, content: string) => {
    try {
      await apiEditComment(id, content);
      setComments(prev => prev.map(c => c._id === id
        ? { ...c, content, isEdited: true, editedAt: new Date().toISOString() } : c));
    } catch (err) {
      console.error('Erreur edit:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteComment(id);
      setComments(prev => prev.map(c => c._id === id ? { ...c, isDeleted: true } : c));
    } catch (err) {
      console.error('Erreur delete:', err);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!article) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: '"JetBrains Mono", monospace', color: '#00ff88', fontSize: 18 }}>
            $ find . -name "{slug}" → not found
          </p>
          <Link to="/blog" style={{ color: 'rgba(0,255,136,0.6)', fontFamily: '"JetBrains Mono", monospace', fontSize: 14 }}>
            ← retour au blog
          </Link>
        </div>
      </div>
    );
  }

  const totalReactions = Object.values(article.reactionsCount).reduce((a, b) => a + b, 0);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
        @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .article-content h1,h2,h3 { font-family:"Syne",sans-serif; color:#f0f4ff; margin:32px 0 16px; }
        .article-content h1 { font-size:32px; }
        .article-content h2 { font-size:24px; color:#c8d2ff; border-left:3px solid #00ff88; padding-left:16px; }
        .article-content h3 { font-size:20px; color:#a0b0e0; }
        .article-content p { color:rgba(200,210,255,0.75); line-height:1.85; font-size:16px; margin:16px 0; font-family:"DM Sans",sans-serif; }
        .article-content a { color:#00ff88; text-decoration:none; border-bottom:1px solid rgba(0,255,136,0.3); }
        .article-content a:hover { border-bottom-color:#00ff88; }
        .article-content blockquote { border-left:3px solid #00ff88; margin:24px 0; padding:12px 20px; background:rgba(0,255,136,0.05); border-radius:0 8px 8px 0; color:rgba(200,210,255,0.65); font-style:italic; }
        .article-content li { color:rgba(200,210,255,0.7); line-height:1.7; margin:6px 0 6px 24px; list-style:disc; font-family:"DM Sans",sans-serif; }
        .code-block { background:#0d1117; border:1px solid rgba(0,255,136,0.15); border-radius:10px; padding:20px 24px; margin:24px 0; overflow-x:auto; position:relative; }
        .code-block::before { content:attr(data-lang); position:absolute; top:8px; right:12px; font-family:"JetBrains Mono",monospace; font-size:10px; color:rgba(0,255,136,0.4); letter-spacing:2px; text-transform:uppercase; }
        .code-block code { font-family:"JetBrains Mono",monospace; font-size:14px; color:#e2e8f0; line-height:1.7; }
        .inline-code { font-family:"JetBrains Mono",monospace; font-size:13px; background:rgba(0,255,136,0.1); color:#00ff88; padding:2px 6px; border-radius:4px; }
        textarea:focus, input:focus { outline:none; }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:#0a0e1a; } ::-webkit-scrollbar-thumb { background:rgba(0,255,136,0.3); border-radius:3px; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0a0e1a', color: '#c8d2ff' }}>

        {/* Reading progress bar */}
        <div style={{
          position: 'fixed', top: 0, left: 0, height: 3, zIndex: 100,
          width: `${scrollProgress * 100}%`,
          background: 'linear-gradient(to right, #00ff88, #61dafb)',
          transition: 'width 0.1s linear',
        }} />

        {/* Grid background */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        {/* ── HERO ── */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Cover image */}
          {article.coverImage && (
            <div style={{ height: 420, overflow: 'hidden', position: 'relative' }}>
              <img src={article.coverImage} alt={article.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.4) saturate(1.2)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, #0a0e1a)' }} />
            </div>
          )}

          <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ marginTop: article.coverImage ? -200 : 80, position: 'relative', zIndex: 1 }}>
              {/* Breadcrumb */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'rgba(0,255,136,0.5)' }}>
                <Link to="/blog" style={{ color: 'rgba(0,255,136,0.5)', textDecoration: 'none' }}>~/blog</Link>
                <span>/</span>
                <span style={{ color: 'rgba(200,210,255,0.4)' }}>{article.slug}</span>
              </div>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {article.tags.map(tag => (
                  <span key={tag._id} style={{
                    padding: '4px 12px', borderRadius: 4, fontSize: 12,
                    fontFamily: '"JetBrains Mono", monospace',
                    background: `${tag.color}22`, color: tag.color,
                    border: `1px solid ${tag.color}44`,
                  }}>{tag.name}</span>
                ))}
              </div>

              {/* Title */}
              <h1 style={{
                fontSize: 'clamp(28px, 5vw, 48px)',
                fontFamily: '"Syne", sans-serif', fontWeight: 800,
                color: '#f0f4ff', lineHeight: 1.15, letterSpacing: -1,
                marginBottom: 20,
              }}>{article.title}</h1>

              {/* Meta */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 32, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'rgba(200,210,255,0.4)' }}>
                <span>👤 {article.author.username}</span>
                <span>📅 {new Date(article.publishedAt || article.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span>⏱ {article.readTime} min de lecture</span>
                <span>👁 {article.views.toLocaleString()} vues</span>
                <span>💬 {comments.filter(c => !c.isDeleted).length} commentaires</span>
              </div>

              {/* Series badge */}
              {article.series && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
                  borderRadius: 8, padding: '10px 16px', marginBottom: 32,
                }}>
                  <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(0,255,136,0.6)', letterSpacing: 2 }}>SÉRIE</span>
                  <span style={{ color: '#00ff88', fontFamily: '"Syne", sans-serif', fontWeight: 700 }}>{article.series}</span>
                  <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(0,255,136,0.4)' }}>#{article.seriesOrder}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── ARTICLE CONTENT ── */}
        <div ref={contentRef} style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 60px', position: 'relative', zIndex: 2 }}>

          {/* Excerpt */}
          <div style={{
            background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 40,
          }}>
            <p style={{ fontSize: 17, lineHeight: 1.8, color: 'rgba(200,210,255,0.7)', fontStyle: 'italic', fontFamily: '"DM Sans", sans-serif' }}>
              {article.excerpt}
            </p>
          </div>

          {/* Content */}
          {/* ── ARTICLE CONTENT via MarkdownRenderer ── */}
          <MarkdownRenderer content={article.content || ''} />

          {/* Image gallery */}
          {article.images.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h3 style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'rgba(0,255,136,0.5)', letterSpacing: 3, marginBottom: 16 }}>
                // galerie
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {article.images.map((img, i) => (
                  <img key={i} src={img} alt={`Image ${i + 1}`}
                    style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }} />
                ))}
              </div>
            </div>
          )}

          {/* ── REACTIONS BAR ── */}
          <div style={{
            marginTop: 48, padding: '24px 28px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
          }}>
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'rgba(0,255,136,0.5)', letterSpacing: 2, marginBottom: 16 }}>
              // cet article vous a aidé ?
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {REACTIONS.map(r => (
                <button key={r}
                  onClick={() => setArticleReaction(articleReaction === r ? null : r)}
                  style={{
                    background: articleReaction === r ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${articleReaction === r ? '#00ff88' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 22,
                    transition: 'all 0.2s',
                    transform: articleReaction === r ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {r}
                  {article.reactionsCount[r] && (
                    <span style={{ fontSize: 12, marginLeft: 4, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(200,210,255,0.5)' }}>
                      {article.reactionsCount[r]}
                    </span>
                  )}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'rgba(200,210,255,0.3)' }}>
                {totalReactions} réactions
              </span>
            </div>
          </div>

          {/* ── SHARE ── */}
          <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'rgba(200,210,255,0.4)' }}>
              Partager :
            </span>
            {[
              { label: 'Twitter/X', icon: '𝕏', url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(window.location.href)}` },
              { label: 'LinkedIn', icon: 'in', url: `https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}` },
            ].map(s => (
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: '6px 14px', textDecoration: 'none',
                  color: 'rgba(200,210,255,0.6)', fontSize: 13, fontFamily: '"JetBrains Mono", monospace',
                  transition: 'all 0.2s',
                }}
              >{s.icon} {s.label}</a>
            ))}
            <button onClick={copyLink} style={{
              background: copied ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${copied ? '#00ff88' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
              color: copied ? '#00ff88' : 'rgba(200,210,255,0.6)', fontSize: 13,
              fontFamily: '"JetBrains Mono", monospace', transition: 'all 0.2s',
            }}>🔗 {copied ? 'Copié !' : 'Copier le lien'}</button>
          </div>

          {/* ── COMMENTS SECTION ── */}
          <div style={{ marginTop: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
              <h2 style={{
                fontFamily: '"Syne", sans-serif', fontWeight: 800,
                fontSize: 28, color: '#f0f4ff',
              }}>
                💬 Commentaires
              </h2>
              <span style={{
                background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.3)',
                borderRadius: 20, padding: '2px 12px',
                fontSize: 13, color: '#00ff88', fontFamily: '"JetBrains Mono", monospace',
              }}>
                {comments.filter(c => !c.isDeleted).length}
              </span>
            </div>

            {/* New comment form */}
            <div style={{
              background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 14, padding: '24px', marginBottom: 40,
            }}>
              <h3 style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: 'rgba(0,255,136,0.6)', letterSpacing: 2, marginBottom: 20 }}>
                // laisser_un_commentaire()
              </h3>

              {!currentUser && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  {[
                    { val: guestName, set: setGuestName, ph: 'Votre nom *' },
                    { val: guestEmail, set: setGuestEmail, ph: 'Email (non publié) *' },
                  ].map((f, i) => (
                    <input key={i} value={f.val} onChange={e => f.set(e.target.value)}
                      placeholder={f.ph}
                      style={{
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)',
                        borderRadius: 8, padding: '10px 14px', color: '#c8d2ff',
                        fontSize: 14, fontFamily: '"DM Sans", sans-serif',
                      }} />
                  ))}
                </div>
              )}

              <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                placeholder="Partagez votre expérience, une question, une correction..."
                style={{
                  width: '100%', minHeight: 120,
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)',
                  borderRadius: 10, padding: '14px 16px', color: '#c8d2ff',
                  fontSize: 15, fontFamily: '"DM Sans", sans-serif',
                  resize: 'vertical', lineHeight: 1.7,
                }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <span style={{ fontSize: 12, color: 'rgba(200,210,255,0.3)', fontFamily: '"JetBrains Mono", monospace' }}>
                  Markdown, code et liens supportés
                </span>
                <button onClick={handleAddComment} style={{
                  background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(97,218,251,0.15))',
                  border: '1px solid rgba(0,255,136,0.4)', borderRadius: 8,
                  padding: '10px 24px', cursor: 'pointer', color: '#00ff88',
                  fontSize: 14, fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700, transition: 'all 0.2s',
                }}>
                  Publier →
                </button>
              </div>
            </div>

            {/* Comments tree */}
            <div>
              {tree.map((c: any) => (
                <CommentItem key={c._id} comment={c} articleId={article._id}
                  currentUser={currentUser} isAdmin={isAdmin}
                  onReply={handleReply} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </div>
          </div>

          {/* Back to blog */}
          <div style={{ marginTop: 60, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <Link to="/blog" style={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: 13,
              color: 'rgba(0,255,136,0.6)', textDecoration: 'none',
              border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8,
              padding: '10px 24px', transition: 'all 0.2s', display: 'inline-block',
            }}>
              ← retour au blog
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default BlogPostPage;