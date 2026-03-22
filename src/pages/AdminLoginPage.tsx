// src/pages/AdminLoginPage.tsx
// Page de connexion admin — aesthetic "Ghost Terminal"
// Invisible au public — accessible via /admin uniquement
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';

const AdminLoginPage: React.FC = () => {
  const navigate   = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [phase, setPhase]       = useState(0); // animation phase
  const [glitch, setGlitch]     = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Redirect si déjà connecté
  useEffect(() => {
    const token = localStorage.getItem('blog_token');
    if (token) navigate('/blog/new');
  }, [navigate]);

  // Staggered entrance
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 900),
      setTimeout(() => { setPhase(4); emailRef.current?.focus(); }, 1100),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Random glitch
  useEffect(() => {
    const iv = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(iv);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const data = await login(email, password) as any;
      if (data.user?.role !== 'admin') {
        setError('Accès réservé aux administrateurs.');
        localStorage.removeItem('blog_token');
        return;
      }
      localStorage.setItem('blog_token', data.token);
      localStorage.setItem('blog_user', JSON.stringify(data.user));
      // Flash vert puis redirect
      setPhase(5);
      setTimeout(() => navigate('/blog/new'), 800);
    } catch (err: any) {
      setError(err?.error || 'Identifiants incorrects');
      setPhase(4);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#050810; }

        @keyframes scanline {
          0%   { transform: translateY(-100vh); }
          100% { transform: translateY(100vh); }
        }
        @keyframes flicker {
          0%,100% { opacity:1 }
          92%     { opacity:1 }
          93%     { opacity:.8 }
          94%     { opacity:1 }
          96%     { opacity:.9 }
          97%     { opacity:1 }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes glitch1 {
          0%,100% { clip-path:inset(0 0 95% 0); transform:translate(-3px,0); }
          25%     { clip-path:inset(40% 0 40% 0); transform:translate(3px,0); }
          50%     { clip-path:inset(80% 0 5% 0);  transform:translate(-2px,0); }
          75%     { clip-path:inset(20% 0 65% 0); transform:translate(2px,0); }
        }
        @keyframes glitch2 {
          0%,100% { clip-path:inset(10% 0 80% 0); transform:translate(3px,0); }
          33%     { clip-path:inset(60% 0 20% 0); transform:translate(-3px,0); }
          66%     { clip-path:inset(30% 0 50% 0); transform:translate(1px,0); }
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes success {
          0%  { background:rgba(0,255,136,0);  }
          30% { background:rgba(0,255,136,.08); }
          100%{ background:rgba(0,255,136,0);  }
        }
        .login-input {
          width:100%; background:transparent;
          border:none; border-bottom:1px solid rgba(0,255,136,.2);
          padding:12px 0; color:#00ff88;
          font-family:'JetBrains Mono',monospace; font-size:15px;
          letter-spacing:1px; transition:border-color .3s;
          caret-color:#00ff88;
        }
        .login-input:focus { outline:none; border-bottom-color:rgba(0,255,136,.7); }
        .login-input::placeholder { color:rgba(0,255,136,.2); letter-spacing:2px; font-size:12px; }
        .login-input:-webkit-autofill {
          -webkit-text-fill-color:#00ff88 !important;
          -webkit-box-shadow:0 0 0 100px #050810 inset !important;
        }
        .submit-btn { transition:all .2s; }
        .submit-btn:hover:not(:disabled) {
          background:rgba(0,255,136,.2) !important;
          box-shadow: 0 0 20px rgba(0,255,136,.15);
        }
        .submit-btn:active:not(:disabled) { transform:scale(.98); }
        ::-webkit-scrollbar { display:none; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: '#050810',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"JetBrains Mono", monospace',
        animation: 'flicker 8s infinite',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* ── CRT scanline ── */}
        <div style={{
          position: 'fixed', left: 0, right: 0, height: '4px',
          background: 'linear-gradient(transparent, rgba(0,255,136,.04), transparent)',
          animation: 'scanline 6s linear infinite',
          pointerEvents: 'none', zIndex: 10,
        }} />

        {/* ── Grid ── */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(0,255,136,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,.025) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }} />

        {/* ── Corner decorations ── */}
        {[
          { top: 24, left: 24, borderTop: '1px solid', borderLeft: '1px solid' },
          { top: 24, right: 24, borderTop: '1px solid', borderRight: '1px solid' },
          { bottom: 24, left: 24, borderBottom: '1px solid', borderLeft: '1px solid' },
          { bottom: 24, right: 24, borderBottom: '1px solid', borderRight: '1px solid' },
        ].map((s, i) => (
          <div key={i} style={{
            position: 'fixed', width: 32, height: 32,
            borderColor: 'rgba(0,255,136,.2)',
            opacity: phase >= 1 ? 1 : 0,
            transition: `opacity .4s ease ${i * 0.1}s`,
            ...s,
          }} />
        ))}

        {/* ── Ambient glow ── */}
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,255,136,.04) 0%, transparent 70%)',
          pointerEvents: 'none',
          animation: phase === 5 ? 'success .8s ease' : 'none',
        }} />

        {/* ── MAIN FORM ── */}
        <div style={{
          width: '100%', maxWidth: 400,
          padding: '48px 40px',
          position: 'relative', zIndex: 2,
        }}>

          {/* Logo / Title with glitch */}
          <div style={{
            marginBottom: 48,
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? 'none' : 'translateY(16px)',
            transition: 'all .5s ease',
            position: 'relative',
          }}>
            {/* Glitch layers */}
            {glitch && <>
              <div style={{
                position: 'absolute', inset: 0,
                color: '#ff003c', fontFamily: '"Syne", sans-serif',
                fontSize: 42, fontWeight: 800, letterSpacing: -1,
                animation: 'glitch1 .15s steps(1) forwards',
                userSelect: 'none',
              }}>FORGE</div>
              <div style={{
                position: 'absolute', inset: 0,
                color: '#00ffff', fontFamily: '"Syne", sans-serif',
                fontSize: 42, fontWeight: 800, letterSpacing: -1,
                animation: 'glitch2 .15s steps(1) forwards',
                userSelect: 'none',
              }}>FORGE</div>
            </>}

            <h1 style={{
              fontFamily: '"Syne", sans-serif',
              fontSize: 42, fontWeight: 800,
              color: '#f0f4ff', letterSpacing: -1,
              lineHeight: 1,
            }}>FORGE</h1>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
              fontSize: 11, color: 'rgba(0,255,136,.5)', letterSpacing: 3,
            }}>
              <span style={{ animation: 'blink 1s step-end infinite' }}>▋</span>
              <span>BLOG ADMIN TERMINAL</span>
            </div>
          </div>

          {/* System info */}
          {phase >= 2 && (
            <div style={{
              marginBottom: 36, fontSize: 11,
              color: 'rgba(0,255,136,.3)', lineHeight: 2,
              animation: 'fadeUp .4s ease',
            }}>
              <div>sys<span style={{ color: 'rgba(0,255,136,.5)' }}>@adjoumani-blog</span> ~ v1.0.0</div>
              <div style={{ animation: 'pulse 2s ease-in-out infinite' }}>
                ● connexion sécurisée · JWT · AES-256
              </div>
            </div>
          )}

          {/* Form */}
          {phase >= 3 && (
            <form onSubmit={handleSubmit} style={{ animation: 'fadeUp .4s ease' }}>

              {/* Email field */}
              <div style={{ marginBottom: 28, opacity: phase >= 4 ? 1 : 0, transition: 'opacity .3s ease' }}>
                <div style={{ fontSize: 10, color: 'rgba(0,255,136,.4)', letterSpacing: 3, marginBottom: 8 }}>
                  IDENTIFIANT
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'rgba(0,255,136,.4)', fontSize: 13 }}>$</span>
                  <input
                    ref={emailRef}
                    type="email"
                    className="login-input"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@domaine.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {/* Password field */}
              <div style={{ marginBottom: 36, opacity: phase >= 4 ? 1 : 0, transition: 'opacity .3s ease .1s' }}>
                <div style={{ fontSize: 10, color: 'rgba(0,255,136,.4)', letterSpacing: 3, marginBottom: 8 }}>
                  MOT DE PASSE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'rgba(0,255,136,.4)', fontSize: 13 }}>$</span>
                  <input
                    type="password"
                    className="login-input"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    style={{ letterSpacing: password ? '4px' : '2px' }}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  marginBottom: 20, padding: '10px 14px',
                  background: 'rgba(255,50,50,.08)',
                  border: '1px solid rgba(255,50,50,.2)',
                  borderRadius: 6, fontSize: 12,
                  color: 'rgba(255,100,100,.8)',
                  animation: 'fadeUp .2s ease',
                  fontFamily: '"JetBrains Mono", monospace',
                }}>
                  ✕ {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="submit-btn"
                style={{
                  width: '100%', padding: '14px',
                  background: phase === 5
                    ? 'rgba(0,255,136,.2)'
                    : 'rgba(0,255,136,.08)',
                  border: '1px solid rgba(0,255,136,.35)',
                  borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
                  color: '#00ff88', fontSize: 13,
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: 3, fontWeight: 700,
                  opacity: (!email || !password) ? .4 : 1,
                  transition: 'all .2s',
                }}
              >
                {loading ? (
                  <span style={{ animation: 'pulse 1s infinite' }}>AUTHENTIFICATION...</span>
                ) : phase === 5 ? (
                  '✓ ACCÈS AUTORISÉ'
                ) : (
                  'ACCÉDER →'
                )}
              </button>

            </form>
          )}

          {/* Footer hint */}
          {phase >= 4 && (
            <div style={{
              marginTop: 32, textAlign: 'center',
              fontSize: 10, color: 'rgba(0,255,136,.2)',
              letterSpacing: 2, animation: 'fadeUp .4s ease',
            }}>
              ACCÈS RESTREINT · ADJOUMANI © 2026
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminLoginPage;