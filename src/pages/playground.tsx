import { useState, useEffect } from 'react'

const CODE_SERVER_URL = 'https://code.adjoumani-koffi.com'

const FEATURES = [
  { icon: '⚡', title: 'VS Code complet',      desc: 'Vrai VS Code dans le navigateur. Extensions, IntelliSense, Git intégré.' },
  { icon: '🌐', title: '10+ langages',         desc: 'Python, C/C++, JavaScript, Java, Go, Rust, PHP, Ruby et plus.' },
  { icon: '📦', title: 'pip / npm / cargo',    desc: 'Installez de vrais packages. Les dépendances persistent entre sessions.' },
  { icon: '🖥️', title: 'Terminal bash',        desc: 'Terminal Linux complet. Compilez, exécutez, debuggez comme en local.' },
  { icon: '🤖', title: 'GitHub Copilot',       desc: 'Installez l\'extension GitHub Copilot directement dans l\'IDE.' },
  { icon: '💾', title: 'Workspace persistant', desc: 'Vos fichiers sont sauvegardés sur le serveur entre les sessions.' },
]

export default function Playground() {
  const [loading, setLoading]   = useState(true)
  const [fullscreen, setFull]   = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [online, setOnline]     = useState<boolean | null>(null)

  useEffect(() => {
    document.title = 'Playground — IDE en ligne · Adjoumani Koffi'
  }, [])

  useEffect(() => {
    const check = async () => {
      try {
        await fetch(CODE_SERVER_URL, { mode: 'no-cors', signal: AbortSignal.timeout(5000) })
        setOnline(true)
      } catch {
        setOnline(false)
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const toggleFullscreen = () => {
    const iframe = document.getElementById('cs-iframe') as HTMLIFrameElement
    if (!document.fullscreenElement) {
      iframe?.requestFullscreen()
      setFull(true)
    } else {
      document.exitFullscreen()
      setFull(false)
    }
  }

  useEffect(() => {
    const handler = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1117',
      color: '#e6edf3',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── TOPBAR ── */}
      {!fullscreen && (
        <div style={{
          height: 56, background: '#010409',
          borderBottom: '1px solid #21262d',
          display: 'flex', alignItems: 'center',
          padding: '0 24px', gap: 16, flexShrink: 0,
        }}>
          {/* Lien retour — React Router ou simple <a> */}
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#8b949e' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span style={{ fontSize: 13 }}>Portfolio</span>
          </a>

          <div style={{ width: 1, height: 20, background: '#21262d' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚒</span>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>
              Code<span style={{
                background: 'linear-gradient(135deg,#58a6ff,#bc8cff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>Forge</span>
            </span>
            <span style={{
              fontSize: 10, fontFamily: 'monospace',
              padding: '2px 8px', borderRadius: 100,
              background: 'rgba(88,166,255,.15)',
              border: '1px solid rgba(88,166,255,.3)',
              color: '#58a6ff', letterSpacing: '0.05em',
            }}>WebIDE</span>
          </div>

          {/* Status serveur */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: online === null ? '#f0883e' : online ? '#3fb950' : '#f85149',
              boxShadow: online ? '0 0 8px #3fb950' : 'none',
            }} />
            <span style={{ fontSize: 12, color: '#8b949e' }}>
              {online === null ? 'Vérification…' : online ? 'Serveur en ligne' : 'Serveur hors ligne'}
            </span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowInfo(s => !s)}
              style={{ padding: '6px 14px', borderRadius: 6, background: 'rgba(255,255,255,.06)', border: '1px solid #30363d', color: '#8b949e', fontSize: 12, cursor: 'pointer' }}
            >
              {showInfo ? 'Masquer' : 'À propos'}
            </button>
            <button
              onClick={toggleFullscreen}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#238636', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              ⛶ Plein écran
            </button>
          </div>
        </div>
      )}

      {/* ── INFO BANNER ── */}
      {showInfo && !fullscreen && (
        <div style={{ background: '#161b22', borderBottom: '1px solid #21262d', padding: '20px 24px', flexShrink: 0 }}>
          <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            IDE complet VS Code hébergé sur Oracle Cloud. Utilisez le terminal pour installer vos packages
            (<code style={{ background: '#21262d', padding: '1px 6px', borderRadius: 4, color: '#58a6ff' }}>pip install</code>,{' '}
            <code style={{ background: '#21262d', padding: '1px 6px', borderRadius: 4, color: '#58a6ff' }}>npm install</code>…).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                padding: '14px 16px', background: '#0d1117',
                border: '1px solid #21262d', borderRadius: 10,
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── IDE IFRAME ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>

        {/* Loading */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, background: '#0d1117',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 5, gap: 20,
          }}>
            <div style={{ fontSize: 40 }}>⚒</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>
              Code<span style={{ background: 'linear-gradient(135deg,#58a6ff,#bc8cff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Forge</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#58a6ff',
                  animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>
            <p style={{ fontSize: 13, color: '#8b949e' }}>Chargement de l'IDE…</p>
          </div>
        )}

        {/* Offline */}
        {online === false && (
          <div style={{
            position: 'absolute', inset: 0, background: '#0d1117',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 5, gap: 16, textAlign: 'center', padding: 40,
          }}>
            <div style={{ fontSize: 48 }}>🔌</div>
            <h2 style={{ fontWeight: 700, fontSize: 22 }}>Serveur temporairement indisponible</h2>
            <p style={{ color: '#8b949e', maxWidth: 400, lineHeight: 1.7 }}>
              Le serveur CodeForge redémarre peut-être. Réessayez dans quelques secondes.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 24px', borderRadius: 8, background: '#238636', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Réessayer
            </button>
          </div>
        )}

        <iframe
          id="cs-iframe"
          src={CODE_SERVER_URL}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="clipboard-read; clipboard-write; fullscreen"
          onLoad={() => setLoading(false)}
          title="CodeForge WebIDE"
        />
      </div>

      {/* ── STATUS BAR ── */}
      {!fullscreen && (
        <div style={{
          height: 22, background: '#010409',
          borderTop: '1px solid #21262d',
          display: 'flex', alignItems: 'center',
          padding: '0 14px', fontSize: 11,
          fontFamily: 'monospace', color: '#8b949e', flexShrink: 0,
        }}>
          <span style={{ background: 'rgba(35,134,54,.25)', color: '#3fb950', padding: '0 10px', height: 22, display: 'flex', alignItems: 'center', gap: 4 }}>
            ⚒ CodeForge
          </span>
          <span style={{ padding: '0 10px', borderRight: '1px solid #21262d' }}>VS Code Server</span>
          <span style={{ padding: '0 10px' }}>Oracle Cloud · Ubuntu 20.04</span>
          <span style={{ marginLeft: 'auto', padding: '0 10px' }}>code-server v4.111</span>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}