// Cylindre 3D de l'accueil (chunk chargé à la demande, avec three.js).
// Les cartes sont posées sur la surface d'un vrai cylindre : une texture sur un quartier de
// cylindre, donc réellement courbe, éclairée, et sans décalage entre DOM et WebGL.
//
// Le canevas n'est qu'une image pour les technologies d'assistance : le texte, le focus et la
// navigation au clavier restent portés par les vrais liens de HomeNavCards, qui pilotent la rotation.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, CircleGeometry, CylinderGeometry, SRGBColorSpace, TorusGeometry, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import Scene3d from './Scene3d'
import { cardFontsReady, drawCard } from './cardTexture'
import { CARD_STEP, atRest, flick, stepCylinder, type CylinderState } from './cylinderMotion'
import { HOME_CARDS } from './homeCards'
import { FrameBudget, reportTooSlow } from './scene3dRules'

const RADIUS = 3.1
const CARD_HEIGHT = 2.34
const BODY_HEIGHT = 2.66
const CARD_ARC = (64 * Math.PI) / 180
/** Texture : mêmes proportions que la carte (arc × rayon / hauteur) */
const CARD_RATIO = (CARD_ARC * RADIUS) / CARD_HEIGHT
const CAMERA = { fov: 26, position: [0, 1.5, 11.4] as [number, number, number], lookAt: [0, -0.1, 0] as [number, number, number] }
/** Hauteur de scène visible à la distance du centre du cylindre */
const VISIBLE_HEIGHT = 2 * Math.hypot(1.6, 11.4) * Math.tan((13 * Math.PI) / 180)
const HOVER_EASING_S = 0.14
/** Déplacement minimal avant qu'un appui devienne un glissement (et non un clic) */
const DRAG_THRESHOLD = 7

export interface CylinderControl {
  /** Carte à amener de face (lien survolé ou focalisé) */
  target: number | null
  /** Pause demandée par le visiteur */
  paused: boolean
  /** Réveille la scène après un changement ci-dessus */
  wake: () => void
}

interface SceneProps {
  control: CylinderControl
  stage: HTMLElement
  textures: CanvasTexture[]
  segments: number
  onLive: () => void
  onFail: (reason: string) => void
  onNavigate: (to: string, newTab: boolean) => void
}

function Scene({ control, stage, textures, segments, onLive, onFail, onNavigate }: SceneProps) {
  const groupRef = useRef<Group>(null)
  const cardsRef = useRef<(Mesh | null)[]>([])
  const motion = useRef<CylinderState>({ angle: 0, speed: 0 })
  const hovered = useRef<number | null>(null)
  const hoverLevels = useRef([0, 0, 0, 0])
  const dragging = useRef(false)
  const frames = useRef(0)
  const shown = useRef(false)
  const budget = useRef(new FrameBudget())
  const setDpr = useThree(s => s.setDpr)
  const invalidate = useThree(s => s.invalidate)

  const cardGeometry = useMemo(() => new CylinderGeometry(RADIUS + 0.014, RADIUS + 0.014, CARD_HEIGHT, Math.round(segments / 3.5), 1, true, -CARD_ARC / 2, CARD_ARC), [segments])
  const bodyGeometry = useMemo(() => new CylinderGeometry(RADIUS, RADIUS, BODY_HEIGHT, segments, 1, false), [segments])
  const ringGeometry = useMemo(() => new TorusGeometry(RADIUS + 0.004, 0.017, 8, segments), [segments])
  const capGeometry = useMemo(() => new CircleGeometry(RADIUS, segments), [segments])
  const capTexture = useMemo(() => glowTexture([[0, 'rgba(49, 46, 129, 0.05)'], [0.62, 'rgba(67, 56, 202, 0.2)'], [1, 'rgba(139, 124, 255, 0.62)']]), [])
  useEffect(() => () => {
    cardGeometry.dispose(); bodyGeometry.dispose(); ringGeometry.dispose(); capGeometry.dispose(); capTexture.dispose()
  }, [cardGeometry, bodyGeometry, ringGeometry, capGeometry, capTexture])

  useEffect(() => {
    control.wake = invalidate
    invalidate()
    return () => { control.wake = () => {} }
  }, [control, invalidate])

  // Glissement horizontal : capture du pointeur seulement une fois le geste reconnu, rendue à la fin.
  // Le défilement vertical reste au navigateur (touch-action: pan-y) ; la molette n'est jamais retenue.
  useEffect(() => {
    let id: number | null = null
    let startX = 0, startY = 0, lastX = 0, lastTime = 0, velocity = 0
    const radiansPerPixel = () => VISIBLE_HEIGHT / (stage.clientHeight * RADIUS)
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      id = e.pointerId
      startX = lastX = e.clientX
      startY = e.clientY
      lastTime = e.timeStamp
      velocity = 0
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      if (!dragging.current) {
        const dx = Math.abs(e.clientX - startX)
        if (dx < DRAG_THRESHOLD || dx < Math.abs(e.clientY - startY)) return
        dragging.current = true
        stage.setPointerCapture(e.pointerId)
        stage.dataset.dragging = 'true'
        lastX = e.clientX
      }
      const delta = -(e.clientX - lastX) * radiansPerPixel()
      const dt = Math.max((e.timeStamp - lastTime) / 1000, 1 / 240)
      lastX = e.clientX
      lastTime = e.timeStamp
      motion.current.angle += delta
      velocity = delta / dt
      invalidate()
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      if (!dragging.current) return
      dragging.current = false
      delete stage.dataset.dragging
      motion.current.speed = flick(velocity)
      invalidate()
    }
    // Au toucher, le navigateur capture d'abord le pointeur sur le canevas : la perte de cette capture
    // implicite remonte jusqu'ici au moment où la scène prend le relais, le geste n'est pas fini
    const lost = (e: PointerEvent) => { if (e.target === stage) end(e) }
    stage.addEventListener('pointerdown', down)
    stage.addEventListener('pointermove', move)
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    stage.addEventListener('lostpointercapture', lost)
    return () => {
      stage.removeEventListener('pointerdown', down)
      stage.removeEventListener('pointermove', move)
      stage.removeEventListener('pointerup', end)
      stage.removeEventListener('pointercancel', end)
      stage.removeEventListener('lostpointercapture', lost)
    }
  }, [stage, invalidate])

  const setHover = (index: number | null) => {
    hovered.current = index
    stage.style.cursor = index === null ? '' : 'pointer'
    stage.dataset.hover = index === null ? '' : String(index)
    invalidate()
  }

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const verdict = budget.current.push(rawDelta * 1000)
    if (verdict === 'lower') {
      stage.dataset.quality = 'réduite'
      setDpr(1)
    } else if (verdict === 'abandon') {
      reportTooSlow()
      onFail('appareil trop lent')
      return
    }

    const input = { target: dragging.current ? null : control.target, hold: control.paused || hovered.current !== null || dragging.current }
    if (!dragging.current) motion.current = stepCylinder(motion.current, input, dt)
    const { angle } = motion.current
    if (groupRef.current) groupRef.current.rotation.y = -angle

    // Mise en valeur de la carte survolée ou choisie depuis un lien
    let settling = false
    const active = hovered.current ?? control.target
    cardsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const wanted = i === active ? 1 : 0
      const level = hoverLevels.current[i] + (wanted - hoverLevels.current[i]) * (1 - Math.exp(-dt / HOVER_EASING_S))
      hoverLevels.current[i] = level
      if (Math.abs(wanted - level) > 0.002) settling = true
      const scale = 1 + 0.02 * level
      mesh.scale.set(scale, 1, scale)
      ;(mesh.material as MeshStandardMaterial).emissiveIntensity = 0.8 + 0.2 * level
    })

    frames.current++
    stage.dataset.frames = String(frames.current)
    stage.dataset.angle = angle.toFixed(3)
    if (budget.current.verified && !shown.current) {
      shown.current = true
      onLive()
    }
    if (!shown.current || dragging.current || settling || !atRest(motion.current, input)) invalidate()
  })

  const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation()

  return (
    <>
      <ambientLight intensity={0.7} color="#c7d2fe" />
      <directionalLight position={[1.5, 3.5, 7]} intensity={1.4} color="#e0e7ff" />
      <directionalLight position={[-7, 1.5, 1.5]} intensity={2.2} color="#8b5cf6" />
      <directionalLight position={[7, -0.5, 1]} intensity={1.8} color="#ec4899" />

      <group ref={groupRef}>
        {/* Le corps arrête les pointeurs : une carte du dos n'est jamais atteinte à travers lui */}
        <mesh geometry={bodyGeometry} onPointerOver={stop} onPointerMove={stop} onClick={stop}>
          <meshStandardMaterial color="#10163a" metalness={0.72} roughness={0.36} />
        </mesh>
        <mesh geometry={capGeometry} position-y={BODY_HEIGHT / 2 + 0.002} rotation-x={-Math.PI / 2}>
          <meshBasicMaterial map={capTexture} transparent depthWrite={false} />
        </mesh>
        {[1, -1].map(side => (
          <mesh key={side} geometry={ringGeometry} position-y={(side * BODY_HEIGHT) / 2} rotation-x={Math.PI / 2}>
            <meshBasicMaterial color={side > 0 ? '#c7d2fe' : '#8b5cf6'} />
          </mesh>
        ))}
        {HOME_CARDS.map((card, i) => (
          <mesh
            key={card.to}
            ref={el => { cardsRef.current[i] = el }}
            geometry={cardGeometry}
            rotation-y={i * CARD_STEP}
            onPointerOver={e => { e.stopPropagation(); setHover(i) }}
            onPointerOut={() => { if (hovered.current === i) setHover(null) }}
            onClick={e => {
              e.stopPropagation()
              if (e.delta > DRAG_THRESHOLD) return
              onNavigate(card.to, e.nativeEvent.ctrlKey || e.nativeEvent.metaKey)
            }}
          >
            <meshStandardMaterial map={textures[i]} emissiveMap={textures[i]} emissive="#ffffff" emissiveIntensity={0.8} roughness={0.55} metalness={0.05} transparent alphaTest={0.02} depthWrite={false} />
          </mesh>
        ))}
      </group>

      <GroundGlow />
    </>
  )
}

/** Dégradé radial, du centre au bord */
function glowTexture(stops: [number, string][]) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const glow = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    for (const [offset, color] of stops) glow.addColorStop(offset, color)
    ctx.fillStyle = glow
    ctx.arc(128, 128, 128, 0, Math.PI * 2)
    ctx.fill()
  }
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  return map
}

/** Halo sous le cylindre : additif, aucune ombre à calculer ; il s'éteint avant les bords du canevas */
function GroundGlow() {
  const texture = useMemo(() => glowTexture([[0, 'rgba(129, 140, 248, 0.5)'], [0.74, 'rgba(129, 140, 248, 0.34)'], [0.84, 'rgba(139, 92, 246, 0.12)'], [1, 'rgba(139, 92, 246, 0)']]), [])
  const geometry = useMemo(() => new CircleGeometry(1, 64), [])
  useEffect(() => () => { texture.dispose(); geometry.dispose() }, [texture, geometry])
  return (
    <mesh geometry={geometry} position-y={-BODY_HEIGHT / 2 - 0.12} rotation-x={-Math.PI / 2} scale={RADIUS * 1.32}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} blending={AdditiveBlending} />
    </mesh>
  )
}

interface Props {
  control: CylinderControl
  stage: HTMLElement
  visible: boolean
  /** Tablette : maillage et textures allégés */
  lite: boolean
  onLive: () => void
  onFail: (reason: string) => void
  onNavigate: (to: string, newTab: boolean) => void
}

export default function CardCylinder({ control, stage, visible, lite, onLive, onFail, onNavigate }: Props) {
  const [textures, setTextures] = useState<CanvasTexture[] | null>(null)

  useEffect(() => {
    let alive = true
    let made: CanvasTexture[] = []
    void cardFontsReady().then(() => {
      if (!alive) return
      const width = lite ? 760 : 1100
      const height = Math.round(width / CARD_RATIO)
      made = HOME_CARDS.map(card => {
        const texture = new CanvasTexture(drawCard(card, width, height))
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = 8
        return texture
      })
      setTextures(made)
    })
    return () => {
      alive = false
      made.forEach(t => t.dispose())
    }
  }, [lite])

  if (!textures) return null
  return (
    <Scene3d camera={CAMERA} maxDpr={lite ? 1.5 : 1.75} frameloop={visible ? 'demand' : 'never'} eventSource={stage} onFail={onFail}>
      <Scene control={control} stage={stage} textures={textures} segments={lite ? 56 : 112} onLive={onLive} onFail={onFail} onNavigate={onNavigate} />
    </Scene3d>
  )
}
