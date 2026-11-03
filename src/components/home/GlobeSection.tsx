// Dernière section de l'accueil, juste avant le pied de page : globe terrestre 3D et commande de vitesse
// (styles : globe.css). Image statique du même globe tant que la 3D n'a pas pris le relais, ou à sa
// place (mouvement réduit, appareil modeste, WebGL absent ou trop lent).
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { GlobeControl } from './GlobeScene'
import { DEFAULT_GLOBE_SPEED, GLOBE_SPEEDS, speedValue, type GlobeSpeedId } from './globeMotion'
import { GLOBE_LABELS } from './globePlaces'
import { REDUCED_MOTION_QUERY } from './scene3dRules'
import { useIdleStart, useMediaQuery, useModestDevice, useViewport } from './useScene3d'
import poster from '../../assets/globe/globe-poster.webp'
import './globe.css'

const GlobeScene = lazy(() => import('./GlobeScene'))

const SMALL_QUERY = '(max-width: 767.98px)'

export default function GlobeSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [labels, setLabels] = useState<HTMLDivElement | null>(null)
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const small = useMediaQuery(SMALL_QUERY)
  const modest = useModestDevice()
  const [failed, setFailed] = useState(false)
  const [live, setLive] = useState(false)
  const [speedId, setSpeedId] = useState<GlobeSpeedId>(DEFAULT_GLOBE_SPEED)
  const [paused, setPaused] = useState(false)

  // Une scène déjà validée n'est jamais interrompue par l'abandon d'une autre
  const want3d = !reduceMotion && (!modest || live) && !failed
  const { near, visible } = useViewport(sectionRef, '500px')
  const started = useIdleStart(want3d && near)
  const mode = !want3d ? 'static' : live ? 'live' : 'loading'

  const control = useRef<GlobeControl>({ speed: speedValue(DEFAULT_GLOBE_SPEED), wake: () => {} })
  const apply = (id: GlobeSpeedId, pause: boolean) => {
    setSpeedId(id)
    setPaused(pause)
    control.current.speed = pause ? 0 : speedValue(id)
    control.current.wake()
  }
  const onFail = () => setFailed(true)

  // Canevas démonté (mouvement réduit activé) : la 3D devra refaire ses preuves
  useEffect(() => {
    if (!want3d) setLive(false)
  }, [want3d])

  return (
    <section ref={sectionRef} className="gl-section" aria-labelledby="globe-title" data-mode={mode} data-failed={failed || undefined}>
      <div className="gl-backdrop" aria-hidden="true" />
      <div className="gl-grid container mx-auto px-5 sm:px-6">
        <div className="gl-text">
          <p className="gl-eyebrow">Depuis la Côte d’Ivoire</p>
          <h2 id="globe-title" className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            <span className="gradient-text">Vers tous les continents</span>
          </h2>
          <p className="gl-lead">
            Chaque arc relie la Côte d’Ivoire à une grande zone du monde : où que vous soyez, nous
            pouvons collaborer à distance.
          </p>
        </div>

        <div
          ref={setStage}
          className="gl-stage"
          role="img"
          aria-label="Globe terrestre sombre, couvert de points lumineux sur les continents ; des arcs relient la Côte d’Ivoire à des pays de chaque continent."
        >
          <img className="gl-poster" src={poster} alt="" width={900} height={900} loading="lazy" decoding="async" draggable={false} />
          <div ref={setLabels} className="gl-labels" aria-hidden="true">
            {GLOBE_LABELS.map(l => (
              <span key={l.name} className={`gl-label gl-label-${l.kind}`} data-major={l.major}>{l.name}</span>
            ))}
          </div>
          {started && stage && labels && (
            <Suspense fallback={null}>
              <GlobeScene
                control={control.current}
                labels={labels}
                stage={stage}
                visible={visible}
                lite={small}
                onLive={() => setLive(true)}
                onFail={onFail}
              />
            </Suspense>
          )}
        </div>

        {/* Après un abandon de la 3D, place conservée : la page ne saute pas */}
        {(want3d || failed) && (
          <div className="gl-panel">
            <fieldset className="gl-speeds">
              <legend>Vitesse de rotation</legend>
              <div className="gl-speed-row">
                {GLOBE_SPEEDS.map(s => (
                  <label key={s.id} className="gl-speed">
                    <input
                      type="radio"
                      name="globe-speed"
                      value={s.id}
                      checked={speedId === s.id}
                      onChange={() => apply(s.id, false)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="button" className="gl-pause" aria-pressed={paused} onClick={() => apply(speedId, !paused)}>
              {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              {paused ? 'Reprendre' : 'Pause'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
