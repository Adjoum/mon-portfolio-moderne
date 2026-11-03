// Enveloppe commune des scènes 3D de l'accueil, sur @react-three/fiber.
//
// createRoot plutôt que <Canvas> : <Canvas> enregistre tout three.js (extend(THREE)), ce qui ajoute
// environ 100 Ko compressés au chunk ; ici, seules les classes utilisées sont enregistrées.
// Le canevas est créé à chaque montage : l'effet est rejoué sans conflit en mode strict.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, events, extend, type RootState } from '@react-three/fiber'
import {
  AmbientLight, BufferGeometry, DirectionalLight, Group, LineSegments, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, Points, ShaderMaterial, setConsoleFunction,
} from 'three'

extend({ AmbientLight, BufferGeometry, DirectionalLight, Group, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, Points, ShaderMaterial })

// @react-three/fiber 9.8 crée encore un THREE.Clock : avertissement sans objet pour le visiteur.
// Tous les autres messages de three.js passent normalement.
setConsoleFunction((type: 'log' | 'warn' | 'error', message: string, ...params: unknown[]) => {
  if (type === 'warn' && message.startsWith('THREE.Clock:')) return
  console[type](message, ...params)
})

type Frameloop = 'demand' | 'never'

interface Props {
  camera: { fov: number; position: [number, number, number]; lookAt?: [number, number, number] }
  maxDpr: number
  frameloop: Frameloop
  /** Élément qui reçoit les pointeurs ; sans lui, la scène n'écoute rien */
  eventSource?: HTMLElement | null
  /** WebGL absent, perdu, ou scène impossible à monter */
  onFail: (reason: string) => void
  children: ReactNode
}

export default function Scene3d({ camera, maxDpr, frameloop, eventSource, onFail, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null)
  const [configured, setConfigured] = useState(false)
  const [state, setState] = useState<RootState | null>(null)
  const failRef = useRef(onFail)
  useEffect(() => { failRef.current = onFail }, [onFail])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(canvas)

    let alive = true
    const fail = (reason: string) => { if (alive) failRef.current(reason) }
    const onLost = (e: Event) => { e.preventDefault(); fail('contexte WebGL perdu') }
    canvas.addEventListener('webglcontextlost', onLost)

    const root = createRoot(canvas)
    rootRef.current = root
    const perspective = new PerspectiveCamera(camera.fov, 1, 0.1, 40)
    perspective.position.set(...camera.position)
    perspective.lookAt(...(camera.lookAt ?? [0, 0, 0]))
    const measure = () => ({ width: host.clientWidth, height: host.clientHeight, top: 0, left: 0 })

    root.configure({
      gl: { alpha: true, antialias: true, stencil: false, powerPreference: 'default' },
      camera: perspective,
      events,
      flat: true,
      dpr: [1, maxDpr],
      frameloop: 'never',
      size: measure(),
      onCreated: created => {
        if (!alive) return
        if (eventSource) created.events.connect?.(eventSource)
        setState(created)
      },
    }).then(() => { if (alive) setConfigured(true) }, err => fail(err instanceof Error ? err.message : 'WebGL indisponible'))

    let resized = false
    const resize = new ResizeObserver(() => {
      // Premier signal immédiat, à la mise en observation : la taille vient d'être donnée
      if (!resized) { resized = true; return }
      const { width, height, top, left } = measure()
      if (width && height) root.configure({ size: { width, height, top, left } }).catch(() => {})
    })
    resize.observe(host)

    return () => {
      alive = false
      resize.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      rootRef.current = null
      setConfigured(false)
      setState(null)
      root.unmount()
      canvas.remove()
    }
    // Paramètres de création : fixés au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // onCreated n'est appelé qu'après ce premier rendu
  useEffect(() => {
    if (configured) rootRef.current?.render(children)
  }, [configured, children])

  useEffect(() => {
    if (!state) return
    state.setFrameloop(frameloop)
    if (frameloop === 'demand') state.invalidate()
  }, [state, frameloop])

  return <div ref={hostRef} className="h3d-host" />
}
