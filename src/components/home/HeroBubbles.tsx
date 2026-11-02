// Décor du Hero : grande bulle élastique (photo derrière un verre sombre) et petite bulle
// circulaire à dégradé violet / rose, derrière les textes (styles : home.css).
//
// Affichage immédiat d'une version statique (image LCP, aucune dépendance), puis, une fois la page
// chargée et le navigateur au repos, la bulle WebGL (elasticBubble.ts) prend le relais en fondu.
// Version statique conservée : mouvement réduit, économie de données, WebGL absent ou perdu.
import { useEffect, useRef, useState } from 'react'
import { Database, Code2, Brain, HeartPulse } from 'lucide-react'
import glass400 from '../../assets/portrait/adjoumani-glass-400.webp'
import glass640 from '../../assets/portrait/adjoumani-glass-640.webp'
import glass960 from '../../assets/portrait/adjoumani-glass-960.webp'
import glassJpg from '../../assets/portrait/adjoumani-glass-640.jpg'

/** Cadrage commun à la version statique (home.css) et au WebGL : point de la photo au centre, part couverte */
const PHOTO_FOCUS = { x: 0.5, y: 0.45 }
const PHOTO_ZOOM = 0.9

const BADGES = [
  { id: 'data',      label: 'Data',            icon: Database,   color: '#34d399' },
  { id: 'fullstack', label: 'Full Stack',      icon: Code2,      color: '#818cf8' },
  { id: 'ai',        label: 'IA / ML',         icon: Brain,      color: '#c084fc' },
  { id: 'health',    label: 'Santé numérique', icon: HeartPulse, color: '#f472b6' },
] as const

type Mode = 'static' | 'morph' | 'live'

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true

export default function HeroBubbles({ reduceMotion }: { reduceMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [mode, setMode] = useState<Mode>('static')

  useEffect(() => {
    if (reduceMotion || saveData()) return
    // Aucun test WebGL au montage : créer un contexte retarderait le premier affichage.
    // Tout se décide au repos du navigateur ; sans WebGL, contour animé en CSS (photo intacte).
    let cancelled = false
    let controller: { destroy(): void } | null = null
    const start = async () => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const { startElasticBubble } = await import('./elasticBubble')
      if (cancelled) return
      const small = window.matchMedia('(max-width: 1023px)').matches
      const started = await startElasticBubble(canvas, {
        // Même fichier que la version statique : déjà en cache, aucun octet de plus
        photoUrl: imgRef.current?.currentSrc || glass640,
        focus: PHOTO_FOCUS,
        zoom: PHOTO_ZOOM,
        segments: small ? [72, 144] : undefined,
        maxDpr: small ? 1.5 : 1.75,
        onReady: () => { if (!cancelled) setMode('live') },
        onFail: () => { if (!cancelled) setMode('morph') },
      })
      if (cancelled) return started?.destroy()
      controller = started
      if (!controller) setMode('morph')
    }
    // Après le chargement de la page, au repos du navigateur : le premier affichage n'attend pas
    const hasIdle = typeof window.requestIdleCallback === 'function'
    let handle: number | undefined
    const schedule = () => {
      handle = hasIdle ? window.requestIdleCallback(() => void start(), { timeout: 2500 }) : window.setTimeout(() => void start(), 1200)
    }
    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })
    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      if (handle !== undefined) {
        if (hasIdle) window.cancelIdleCallback(handle)
        else window.clearTimeout(handle)
      }
      controller?.destroy()
      setMode('static')
    }
  }, [reduceMotion])

  return (
    <div className={`hb-root hb-${mode}`} data-mode={mode}>
      <div className="hb-stage">
        <canvas ref={canvasRef} className="hb-canvas" aria-hidden="true" />
        <div className="hb-fallback hb-shape">
          <picture>
            <source
              type="image/webp"
              srcSet={`${glass400} 400w, ${glass640} 640w, ${glass960} 960w`}
              sizes="(min-width: 1024px) 520px, (min-width: 640px) 380px, 340px"
            />
            <img
              ref={imgRef}
              src={glassJpg}
              alt="Portrait de Koffi Wilfried Adjoumani"
              width={640}
              height={640}
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
          </picture>
          <span className="hb-smoke" aria-hidden="true" />
          <span className="hb-rim" aria-hidden="true" />
        </div>
        <span className="hb-orb" aria-hidden="true"><span className="hb-orb-ring" /></span>
      </div>

      {/* Mobile : rangée sous les bulles. ≥ 1024 px : posés discrètement autour (home.css) */}
      <ul className="hb-badges" aria-label="Domaines">
        {BADGES.map(({ id, label, icon: Icon, color }) => (
          <li key={id} className={`hb-badge hb-badge-${id}`}>
            <Icon size={14} color={color} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
