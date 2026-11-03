import { useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { Object3D } from 'three'

/**
 * Compile les shaders sans bloquer la page (compileAsync, parallèle quand le pilote le permet) avant
 * la première image : jusque-là, l'objet reste caché et aucune image n'est demandée.
 * Renvoie un indicateur à lire dans useFrame.
 */
export function useWarmScene(root: RefObject<Object3D | null>) {
  const gl = useThree(s => s.gl)
  const scene = useThree(s => s.scene)
  const camera = useThree(s => s.camera)
  const invalidate = useThree(s => s.invalidate)
  const ready = useRef(false)

  useEffect(() => {
    const object = root.current
    if (!object) return
    let alive = true
    object.visible = true
    const pending = gl.compileAsync(scene, camera)
    object.visible = false
    pending.catch(() => {}).then(() => {
      if (!alive) return
      ready.current = true
      object.visible = true
      invalidate()
    })
    return () => { alive = false }
  }, [root, gl, scene, camera, invalidate])

  return ready
}
