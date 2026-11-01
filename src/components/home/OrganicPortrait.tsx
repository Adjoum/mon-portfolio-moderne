// Portrait d'accueil dans une bulle organique animée (styles et coût d'animation : home.css)
import { useEffect, useRef, useState } from 'react'
import { Database, Code2, Brain, HeartPulse } from 'lucide-react'
import portrait400 from '../../assets/portrait/adjoumani-portrait-400.webp'
import portrait640 from '../../assets/portrait/adjoumani-portrait-640.webp'
import portrait960 from '../../assets/portrait/adjoumani-portrait-960.webp'
import portraitJpg from '../../assets/portrait/adjoumani-portrait-640.jpg'

const BADGES = [
  { id: 'data',      label: 'Data',            icon: Database,   color: '#34d399' },
  { id: 'fullstack', label: 'Full Stack',      icon: Code2,      color: '#818cf8' },
  { id: 'ai',        label: 'IA / ML',         icon: Brain,      color: '#c084fc' },
  { id: 'health',    label: 'Santé numérique', icon: HeartPulse, color: '#f472b6' },
] as const

export default function OrganicPortrait() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  // Animations suspendues dès que le portrait sort de l'écran
  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry.isIntersecting), { rootMargin: '80px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={rootRef} className={`op-root${paused ? ' is-paused' : ''}`}>
      <div className="op-stage">
        <span className="op-glow" aria-hidden="true" />
        <span className="op-ring op-shape" aria-hidden="true" />
        <div className="op-clip op-shape">
          <picture>
            <source
              type="image/webp"
              srcSet={`${portrait400} 400w, ${portrait640} 640w, ${portrait960} 960w`}
              sizes="(min-width: 1024px) 440px, (min-width: 640px) 340px, 300px"
            />
            <img
              src={portraitJpg}
              alt="Portrait de Koffi Wilfried Adjoumani"
              width={640}
              height={640}
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
          </picture>
          <span className="op-tint" aria-hidden="true" />
          <span className="op-sheen" aria-hidden="true" />
        </div>
        <span className="op-dot op-dot-1" aria-hidden="true" />
        <span className="op-dot op-dot-2" aria-hidden="true" />
        <span className="op-dot op-dot-3" aria-hidden="true" />
      </div>

      {/* Mobile : rangée sous le portrait. ≥ 640 px : posés autour de la bulle (home.css) */}
      <ul className="op-badges" aria-label="Domaines">
        {BADGES.map(({ id, label, icon: Icon, color }) => (
          <li key={id} className={`op-badge op-badge-${id}`}>
            <Icon size={16} color={color} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
