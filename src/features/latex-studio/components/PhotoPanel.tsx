// Photo optionnelle : choisie localement, recadrée au format identité (35 × 45) et réencodée en
// JPEG par le navigateur (métadonnées et contenu actif éliminés). Elle ne quitte le navigateur
// que pour la compilation, jamais conservée par le serveur.
import { useId, useRef, useState, type PointerEvent } from 'react'
import { Dialog } from './Dialog'
import { btn, btnDanger, btnPrimary } from './ui'

const ASPECT = 35 / 45
const MAX_INPUT_BYTES = 15 * 1024 * 1024

export function PhotoPanel({ photo, width, setWidth, onPhoto, hasMarker }: {
  photo: string | null
  width: number
  setWidth: (w: number) => void
  onPhoto: (dataUrl: string | null) => void
  hasMarker: boolean
}) {
  const id = useId()
  const [raw, setRaw] = useState<string | null>(null)
  const [cropping, setCropping] = useState<string | null>(null)
  const [error, setError] = useState('')

  const pick = (file: File) => {
    setError('')
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_INPUT_BYTES) {
      setError('Image JPEG, PNG ou WebP de 15 Mo au maximum.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      setRaw(url)
      setCropping(url)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3 text-xs text-gray-300">
      <p className="leading-relaxed text-gray-400">
        La photo s’insère à l’emplacement <code className="text-gray-200">%%PHOTO%%</code> du code.
        {!hasMarker && <span className="mt-1 block text-amber-300">Ce document ne contient pas ce marqueur : choisissez un modèle « avec photo » ou ajoutez-le.</span>}
      </p>
      <label className={`${btn} w-full cursor-pointer`} htmlFor={`${id}-file`}>
        {photo ? '🔄 Changer la photo' : '⬆ Choisir une photo'}
      </label>
      <input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {photo && (
        <>
          <img src={photo} alt="Photo du CV (aperçu)" className="w-full rounded-lg border border-[#30363d]" />
          {raw && <button type="button" className={`${btn} w-full`} onClick={() => setCropping(raw)}>✂️ Recadrer</button>}
          <label className="block" htmlFor={`${id}-width`}>Largeur : <strong>{width.toFixed(1)} cm</strong></label>
          <input id={`${id}-width`} type="range" min={2} max={5} step={0.1} value={width} onChange={e => setWidth(parseFloat(e.target.value))} className="w-full" />
          <button type="button" className={`${btnDanger} w-full`} onClick={() => onPhoto(null)}>🗑 Retirer la photo</button>
        </>
      )}
      {cropping && <CropDialog src={cropping} onCancel={() => setCropping(null)} onConfirm={url => { setCropping(null); onPhoto(url) }} />}
    </div>
  )
}

function CropDialog({ src, onCancel, onConfirm }: { src: string; onCancel: () => void; onConfirm: (dataUrl: string) => void }) {
  const img = useRef<HTMLImageElement>(null)
  const [disp, setDisp] = useState({ w: 0, h: 0 })
  const [box, setBox] = useState({ x: 0, y: 0, w: 0 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const clamp = (b: { x: number; y: number; w: number }, d = disp) => {
    const w = Math.min(b.w, d.w, d.h * ASPECT)
    return { x: Math.min(Math.max(0, b.x), d.w - w), y: Math.min(Math.max(0, b.y), d.h - w / ASPECT), w }
  }
  const onLoad = () => {
    const el = img.current!
    const max = Math.min(300, window.innerWidth - 64)
    const r = el.naturalWidth / el.naturalHeight
    let w = max, h = max / r
    if (h > 380) { h = 380; w = 380 * r }
    const d = { w, h }
    setDisp(d)
    const bw = Math.min(w * 0.7, h * ASPECT)
    setBox(clamp({ x: (w - bw) / 2, y: Math.max(0, (h - bw / ASPECT) / 2), w: bw }, d))
  }
  const start = (e: PointerEvent) => {
    drag.current = { dx: e.clientX - box.x, dy: e.clientY - box.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (drag.current) setBox(b => clamp({ ...b, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy }))
  }
  const confirm = () => {
    const el = img.current!
    const scale = el.naturalWidth / disp.w
    const canvas = document.createElement('canvas')
    canvas.width = 350
    canvas.height = 450
    canvas.getContext('2d')!.drawImage(el, box.x * scale, box.y * scale, box.w * scale, (box.w / ASPECT) * scale, 0, 0, 350, 450)
    onConfirm(canvas.toDataURL('image/jpeg', 0.9))
  }

  return (
    <Dialog
      title="✂️ Recadrer la photo d’identité"
      onClose={onCancel}
      footer={<>
        <button type="button" className={btn} onClick={onCancel}>Annuler</button>
        <button type="button" className={btnPrimary} onClick={confirm} disabled={!disp.w}>✓ Valider</button>
      </>}
    >
      <div className="relative mx-auto touch-none select-none" style={{ width: disp.w, height: disp.h }}>
        <img ref={img} src={src} onLoad={onLoad} draggable={false} alt="Photo à recadrer" className="block rounded" style={{ width: disp.w, height: disp.h }} />
        {disp.w > 0 && (
          <div
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={() => { drag.current = null }}
            className="absolute cursor-move rounded-sm border-2 border-indigo-500"
            style={{ left: box.x, top: box.y, width: box.w, height: box.w / ASPECT, boxShadow: '0 0 0 9999px rgba(0,0,0,.55)' }}
            aria-label="Cadre de recadrage : faites-le glisser"
          />
        )}
      </div>
      {disp.w > 0 && (
        <label className="mt-3 block text-xs text-gray-400">
          Taille du cadre
          <input type="range" min={Math.max(40, disp.w * 0.25)} max={disp.w} step={1} value={box.w} onChange={e => setBox(b => clamp({ ...b, w: parseFloat(e.target.value) }))} className="mt-1 w-full" />
        </label>
      )}
    </Dialog>
  )
}
