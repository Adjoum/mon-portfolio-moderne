// Accès directs sous le Hero (styles : home.css).
//
// Les quatre liens sont toujours de vrais liens, dans le document : clavier, lecteurs d'écran et
// référencement ne dépendent jamais de la 3D. Selon l'appareil :
//   - desktop et tablette : cylindre 3D, les liens forment la rangée qui le pilote (survol, focus) ;
//   - mobile : carrousel à glissement, aucun octet de three.js ;
//   - mouvement réduit, appareil modeste, WebGL absent ou trop lent : grille de cartes.
import { lazy, Suspense, useEffect, useRef, useState, type UIEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Pause, Play, FileText, FolderKanban, FlaskConical, Code2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CylinderControl } from './CardCylinder'
import { HOME_CARDS } from './homeCards'
import { REDUCED_MOTION_QUERY } from './scene3dRules'
import { useIdleStart, useMediaQuery, useModestDevice, useViewport } from './useScene3d'

const CardCylinder = lazy(() => import('./CardCylinder'))

const ICONS: Record<string, LucideIcon> = { '/cv-generator': FileText, '/projects': FolderKanban, '/ai-lab': FlaskConical, '/skills': Code2 }

/** Assez de place pour un cylindre lisible ; un téléphone couché garde le carrousel */
const STAGE_QUERY = '(min-width: 768px) and (min-height: 520px)'
const DESKTOP_QUERY = '(min-width: 1024px)'
/** Délai avant de reprendre la rotation libre quand le focus quitte les liens */
const RELEASE_MS = 900

export default function HomeNavCards() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLElement>(null)
  const [stage, setStage] = useState<HTMLElement | null>(null)
  const roomy = useMediaQuery(STAGE_QUERY)
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const modest = useModestDevice()
  /** Hauteur au moment d'un abandon de la 3D, conservée pour que la page ne saute pas */
  const [failedHeight, setFailedHeight] = useState<number | null>(null)
  const [live, setLive] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activeDot, setActiveDot] = useState(0)

  // Une scène déjà validée n'est jamais interrompue par l'abandon d'une autre
  const want3d = roomy && !reduceMotion && (!modest || live) && failedHeight === null
  const { near, visible } = useViewport(rootRef, '320px')
  const started = useIdleStart(want3d && near)
  const mode = !want3d ? 'cards' : live ? 'live' : 'poster'

  const control = useRef<CylinderControl>({ target: null, paused: false, wake: () => {} })
  const releaseTimer = useRef(0)

  // Canevas démonté (fenêtre réduite, mouvement réduit activé) : la 3D devra refaire ses preuves
  useEffect(() => {
    if (!want3d) setLive(false)
  }, [want3d])

  const aim = (index: number) => {
    window.clearTimeout(releaseTimer.current)
    control.current.target = index
    control.current.wake()
  }
  const release = () => {
    window.clearTimeout(releaseTimer.current)
    releaseTimer.current = window.setTimeout(() => {
      control.current.target = null
      control.current.wake()
    }, RELEASE_MS)
  }
  const togglePause = () => {
    control.current.paused = !paused
    control.current.wake()
    setPaused(!paused)
  }
  const onFail = () => setFailedHeight(rootRef.current?.offsetHeight ?? 0)
  const onNavigate = (to: string, newTab: boolean) => {
    if (newTab) window.open(to, '_blank', 'noopener')
    else navigate(to)
  }

  // Carrousel mobile : pastille de la carte la plus centrée
  const onScroll = (e: UIEvent<HTMLUListElement>) => {
    const list = e.currentTarget
    const center = list.scrollLeft + list.clientWidth / 2
    let best = 0, gap = Infinity
    Array.from(list.children).forEach((item, i) => {
      const el = item as HTMLElement
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center)
      if (d < gap) { gap = d; best = i }
    })
    if (best !== activeDot) setActiveDot(best)
  }

  return (
    <nav
      ref={rootRef}
      aria-label="Accès rapides"
      className="hc-root container mx-auto px-5 sm:px-6"
      data-mode={mode}
      data-frozen={failedHeight === null ? undefined : true}
      style={failedHeight === null ? undefined : { minHeight: failedHeight }}
    >
      {want3d && (
        <div ref={setStage} className="hc-stage" data-cursor="native" aria-hidden="true">
          <span className="hc-poster" />
          {started && stage && (
            <Suspense fallback={null}>
              <CardCylinder
                control={control.current}
                stage={stage}
                visible={visible}
                lite={!desktop}
                onLive={() => setLive(true)}
                onFail={onFail}
                onNavigate={onNavigate}
              />
            </Suspense>
          )}
        </div>
      )}

      <ul className="hc-list" onScroll={roomy ? undefined : onScroll}>
        {HOME_CARDS.map(({ to, title, description, colors }, i) => {
          const Icon = ICONS[to]
          return (
            <li key={to}>
              <Link
                to={to}
                className="hp-card"
                onFocus={want3d ? () => aim(i) : undefined}
                onBlur={want3d ? release : undefined}
                onPointerEnter={want3d ? e => { if (e.pointerType === 'mouse') aim(i) } : undefined}
                onPointerLeave={want3d ? release : undefined}
              >
                <span className="hp-card-icon" style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}>
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="hp-card-title">
                  {title}
                  <ArrowRight size={18} className="hp-card-arrow text-violet-300 shrink-0" aria-hidden="true" />
                </span>
                <span className="hp-card-text">{description}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      {want3d ? (
        <button type="button" className="hc-pause hp-focus" onClick={togglePause} aria-pressed={paused}>
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          {paused ? 'Reprendre la rotation' : 'Mettre la rotation en pause'}
        </button>
      ) : (
        <div className="hc-dots" aria-hidden="true">
          {HOME_CARDS.map((card, i) => <span key={card.to} data-on={i === activeDot} />)}
        </div>
      )}
    </nav>
  )
}
