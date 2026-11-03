// Globe terrestre de l'accueil (chunk chargé à la demande, avec three.js).
// Points sur les terres, frontières fines, arcs et points lumineux, libellés en DOM : aucune texture
// à télécharger. Dessiné seulement à l'écran ; à la pause, plus aucune image n'est calculée.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Group, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import Scene3d from './Scene3d'
import { arcPoints, decodeBorders, decodeHomeOutline, decodeLand, hexToRgb, landDots, lineSegments, toVec3 } from './globeGeometry'
import { easeSpeed, rotationAfter, rotationFacing, speedValue } from './globeMotion'
import { CONTINENT_COLORS, GLOBE_LABELS, HOME, HOME_COLOR, PLACES } from './globePlaces'
import {
  ARC_FRAGMENT, ARC_VERTEX, ATMOSPHERE_FRAGMENT, BODY_FRAGMENT, BODY_VERTEX, DOTS_FRAGMENT, DOTS_VERTEX,
  HUBS_FRAGMENT, HUBS_VERTEX, LINE_FRAGMENT, LINE_VERTEX,
} from './globeShaders'
import { FrameBudget, createPacer, reportTooSlow } from './scene3dRules'
import { useWarmScene } from './useWarmScene'

/** Sphère de rayon 1 et halo logés dans le canevas, avec une marge */
const CAMERA = { fov: 28, position: [0, 0, 5.1] as [number, number, number] }
/** Légère inclinaison : le nord s'éloigne, comme sur une vue de l'espace */
const TILT = { x: 0.22, z: -0.14 }
const ATMOSPHERE_SCALE = 1.14
const LABEL_FADE = { from: 0.3, to: 0.52 }
/** En dessous (Lent, Normal), la rotation est posée à 30 images par seconde */
const CALM_SPEED = speedValue('normal') * 1.2

export interface GlobeControl {
  /** Vitesse voulue, en rad/s ; 0 pour la pause */
  speed: number
  wake: () => void
}

interface SceneProps {
  control: GlobeControl
  labels: HTMLElement
  stage: HTMLElement
  lite: boolean
  onLive: () => void
  onFail: (reason: string) => void
}

function Arc({ to, color, phase, time, segments }: { to: [number, number, number]; color: string; phase: number; time: { value: number }; segments: [number, number] }) {
  const geometry = useMemo(() => {
    const from = toVec3(HOME.lat, HOME.lon)
    const curve = new CatmullRomCurve3(arcPoints(from, to, 28).map(p => new Vector3(...p)))
    return new TubeGeometry(curve, segments[0], 0.0034, segments[1], false)
  }, [to, segments])
  useEffect(() => () => geometry.dispose(), [geometry])
  const uniforms = useMemo(() => ({
    uTime: time,
    uPhase: { value: phase },
    uFrom: { value: new Color(...hexToRgb(HOME_COLOR)) },
    uTo: { value: new Color(...hexToRgb(color)) },
  }), [time, phase, color])
  return (
    <mesh geometry={geometry} renderOrder={3}>
      <shaderMaterial vertexShader={ARC_VERTEX} fragmentShader={ARC_FRAGMENT} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} />
    </mesh>
  )
}

function Globe({ control, labels, stage, lite, onLive, onFail }: SceneProps) {
  const rootRef = useRef<Group>(null)
  const spinRef = useRef<Group>(null)
  const speed = useRef(0)
  const rotation = useRef(rotationFacing(HOME.lon + 8))
  const clock = useRef({ value: 0 })
  const frames = useRef(0)
  const shown = useRef(false)
  const budget = useRef(new FrameBudget())
  const size = useThree(s => s.size)
  const dpr = useThree(s => s.viewport.dpr)
  const setDpr = useThree(s => s.setDpr)
  const invalidate = useThree(s => s.invalidate)
  const pacer = useMemo(() => createPacer(invalidate), [invalidate])
  useEffect(() => () => pacer.stop(), [pacer])
  const warm = useWarmScene(rootRef)

  const scene = useMemo(() => {
    const land = decodeLand()
    const dots = landDots(lite ? 20000 : 34000, land, CONTINENT_COLORS)
    const dotGeometry = new BufferGeometry()
    dotGeometry.setAttribute('position', new BufferAttribute(dots.positions, 3))
    dotGeometry.setAttribute('aColor', new BufferAttribute(dots.colors, 3))
    dotGeometry.setAttribute('aSeed', new BufferAttribute(dots.seeds, 1))

    const borders = new BufferGeometry()
    borders.setAttribute('position', new BufferAttribute(lineSegments(decodeBorders(), 1.0025), 3))
    const outline = new BufferGeometry()
    outline.setAttribute('position', new BufferAttribute(lineSegments(decodeHomeOutline(), 1.003, 1), 3))

    const hubsList = [...PLACES.filter(p => !lite || p.major).map(p => ({ ...p, color: CONTINENT_COLORS[p.continent], size: 15 })), { ...HOME, color: HOME_COLOR, size: 30 }]
    const hubs = new BufferGeometry()
    hubs.setAttribute('position', new BufferAttribute(new Float32Array(hubsList.flatMap(h => toVec3(h.lat, h.lon, 1.004))), 3))
    hubs.setAttribute('aColor', new BufferAttribute(new Float32Array(hubsList.flatMap(h => hexToRgb(h.color))), 3))
    hubs.setAttribute('aSize', new BufferAttribute(new Float32Array(hubsList.map(h => h.size)), 1))
    hubs.setAttribute('aPhase', new BufferAttribute(new Float32Array(hubsList.map((_, i) => (i * 0.37) % 1)), 1))

    const arcs = PLACES.filter(p => p.arc && (!lite || p.major)).map((p, i) => ({
      key: p.name,
      to: toVec3(p.lat, p.lon),
      color: CONTINENT_COLORS[p.continent],
      phase: (i * 0.29) % 1,
    }))
    return { dotGeometry, borders, outline, hubs, arcs }
  }, [lite])

  const sphere = useMemo(() => new SphereGeometry(1, lite ? 48 : 72, lite ? 36 : 54), [lite])
  useEffect(() => () => {
    scene.dotGeometry.dispose()
    scene.borders.dispose()
    scene.outline.dispose()
    scene.hubs.dispose()
    sphere.dispose()
  }, [scene, sphere])

  // Valeurs partagées par plusieurs matériaux : même objet, mis à jour à chaque image
  const uniforms = useMemo(() => ({
    dots: { uTime: clock.current, uPointSize: { value: 2 } },
    hubs: { uTime: clock.current, uPixelScale: { value: 1 } },
    borders: { uColor: { value: new Color(0.65, 0.71, 0.99) }, uOpacity: { value: 0.3 } },
    outline: { uColor: { value: new Color(...hexToRgb(HOME_COLOR)) }, uOpacity: { value: 0.95 } },
    atmosphere: { uInner: { value: Math.sqrt(1 - 1 / (ATMOSPHERE_SCALE * ATMOSPHERE_SCALE)) } },
  }), [])

  useEffect(() => {
    const scale = dpr * Math.min(1.25, size.height / 560)
    uniforms.dots.uPointSize.value = (lite ? 2.5 : 2.35) * scale
    uniforms.hubs.uPixelScale.value = scale
    invalidate()
  }, [size, dpr, lite, uniforms, invalidate])

  useEffect(() => {
    control.wake = invalidate
    invalidate()
    return () => { control.wake = () => {} }
  }, [control, invalidate])

  const labelNodes = useMemo(() => Array.from(labels.children) as HTMLElement[], [labels])
  const labelPoints = useMemo(() => GLOBE_LABELS.map(l => new Vector3(...toVec3(l.lat, l.lon, 1.01))), [])
  const probe = useMemo(() => new Vector3(), [])
  const toCamera = useMemo(() => new Vector3(), [])

  useFrame(({ camera, size: view }, rawDelta) => {
    const spin = spinRef.current
    if (!spin || !warm.current) return
    const dt = Math.min(rawDelta, 0.05)
    const verdict = budget.current.push(rawDelta * 1000, pacer.expectedMs)
    if (verdict === 'lower') {
      stage.dataset.quality = 'réduite'
      setDpr(1)
    } else if (verdict === 'abandon') {
      reportTooSlow()
      onFail('appareil trop lent')
      return
    }

    speed.current = easeSpeed(speed.current, control.speed, dt)
    rotation.current = rotationAfter(rotation.current, speed.current, dt)
    spin.rotation.y = rotation.current
    spin.updateWorldMatrix(true, false)
    // Les impulsions ralentissent avec le globe et s'arrêtent avec lui
    clock.current.value += dt * Math.min(1, speed.current * 40)

    labelNodes.forEach((node, i) => {
      probe.copy(labelPoints[i]).applyMatrix4(spin.matrixWorld)
      const facing = toCamera.copy(camera.position).sub(probe).normalize().dot(probe) / probe.length()
      const alpha = Math.max(0, Math.min(1, (facing - LABEL_FADE.from) / (LABEL_FADE.to - LABEL_FADE.from)))
      if (alpha === 0) {
        if (node.style.opacity !== '0') node.style.opacity = '0'
        return
      }
      probe.project(camera)
      node.style.transform = `translate3d(${((probe.x + 1) * view.width) / 2}px, ${((1 - probe.y) * view.height) / 2}px, 0)`
      node.style.opacity = alpha.toFixed(2)
    })

    frames.current++
    stage.dataset.frames = String(frames.current)
    stage.dataset.rotation = rotation.current.toFixed(3)
    stage.dataset.speed = speed.current.toFixed(3)
    if (budget.current.verified && !shown.current) {
      shown.current = true
      onLive()
    }
    if (!shown.current || speed.current > 0 || control.speed > 0) {
      const changing = Math.abs(speed.current - control.speed) > 0.01
      pacer.next(shown.current && !changing && control.speed < CALM_SPEED)
    } else {
      pacer.stop()
    }
  })

  return (
    <group ref={rootRef} rotation={[TILT.x, 0, TILT.z]} visible={false}>
      <mesh geometry={sphere} scale={ATMOSPHERE_SCALE} renderOrder={0}>
        <shaderMaterial vertexShader={BODY_VERTEX} fragmentShader={ATMOSPHERE_FRAGMENT} uniforms={uniforms.atmosphere} side={BackSide} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <group ref={spinRef} rotation-y={rotation.current}>
        <mesh geometry={sphere} renderOrder={1}>
          <shaderMaterial vertexShader={BODY_VERTEX} fragmentShader={BODY_FRAGMENT} />
        </mesh>
        <points geometry={scene.dotGeometry} renderOrder={2}>
          <shaderMaterial vertexShader={DOTS_VERTEX} fragmentShader={DOTS_FRAGMENT} uniforms={uniforms.dots} transparent depthWrite={false} />
        </points>
        <lineSegments geometry={scene.borders} renderOrder={2}>
          <shaderMaterial vertexShader={LINE_VERTEX} fragmentShader={LINE_FRAGMENT} uniforms={uniforms.borders} transparent depthWrite={false} />
        </lineSegments>
        <lineSegments geometry={scene.outline} renderOrder={3}>
          <shaderMaterial vertexShader={LINE_VERTEX} fragmentShader={LINE_FRAGMENT} uniforms={uniforms.outline} transparent depthWrite={false} />
        </lineSegments>
        {scene.arcs.map(arc => (
          <Arc key={arc.key} to={arc.to} color={arc.color} phase={arc.phase} time={clock.current} segments={lite ? [40, 3] : [72, 5]} />
        ))}
        <points geometry={scene.hubs} renderOrder={4}>
          <shaderMaterial vertexShader={HUBS_VERTEX} fragmentShader={HUBS_FRAGMENT} uniforms={uniforms.hubs} transparent depthWrite={false} />
        </points>
      </group>
    </group>
  )
}

interface Props {
  control: GlobeControl
  labels: HTMLElement
  stage: HTMLElement
  visible: boolean
  lite: boolean
  onLive: () => void
  onFail: (reason: string) => void
}

export default function GlobeScene({ control, labels, stage, visible, lite, onLive, onFail }: Props) {
  return (
    <Scene3d camera={CAMERA} maxDpr={lite ? 1.5 : 1.75} frameloop={visible ? 'demand' : 'never'} onFail={onFail}>
      <Globe control={control} labels={labels} stage={stage} lite={lite} onLive={onLive} onFail={onFail} />
    </Scene3d>
  )
}
