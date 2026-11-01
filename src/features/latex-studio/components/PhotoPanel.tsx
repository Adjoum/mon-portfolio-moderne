// Photo du CV (P3). Le panneau règle le cadre (forme, taille, arrondi, bordure, position), propre au
// modèle choisi : chaque réglage passe par le document (code régénéré, PDF recompilé, annulable).
// L'éditeur règle le cadrage (déplacement, zoom, rotation) à la souris, au toucher et au clavier.
// L'aperçu affiché est l'image exacte envoyée à la compilation. La photo reste en mémoire dans cet
// onglet : jamais enregistrée en session, ni sur un serveur, ni dans l'historique.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Dialog } from './Dialog'
import { ColorField, Range } from './DesignPanel'
import { btn, btnDanger, btnPrimary, label } from './ui'
import {
  FRAME_BOUNDS, IDENTITY, PHOTO_SHAPES, PhotoError, ZOOM_MAX, clampTransform, drawPhoto, loadPhotoSource,
  type PhotoColors, type PhotoFrame, type PhotoSource, type PhotoTransform,
} from '../lib/photo'

const PX_PER_CM = 40

export function PhotoPanel({ source, photo, frame, colors, transform, templateName, supportsPhoto, rendering, markerMissing, onSource, onTransform, onFrame, onResetFrame, onRemove, previous, onPrevious }: {
  source: PhotoSource | null
  /** Image finale (JPEG) envoyée à la compilation */
  photo: string | null
  frame: PhotoFrame
  colors: PhotoColors
  transform: PhotoTransform
  templateName: string
  supportsPhoto: boolean
  rendering: boolean
  /** Code importé ou modifié sans l'emplacement %%PHOTO%% : la photo ne peut pas apparaître */
  markerMissing: boolean
  onSource: (source: PhotoSource) => void
  onTransform: (t: PhotoTransform) => void
  onFrame: (patch: Partial<PhotoFrame>) => void
  onResetFrame: () => void
  onRemove: () => void
  previous: string | null
  onPrevious: () => void
}) {
  const id = useId()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const pick = async (file: File) => {
    setError('')
    setLoading(true)
    try {
      onSource(await loadPhotoSource(file))
      setEditing(true)
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : 'Image illisible.')
    } finally {
      setLoading(false)
    }
  }
  const ratioFixed = PHOTO_SHAPES.find(s => s.id === frame.shape)!.ratio !== null

  return (
    <div className="space-y-3 text-xs text-gray-300">
      <p className="leading-relaxed text-gray-400">
        Recadrez, zoomez et faites pivoter votre photo, puis choisissez sa forme et sa taille. Le code et le PDF suivent aussitôt.
      </p>
      {!supportsPhoto && <p className="rounded-lg border border-amber-900 bg-amber-500/10 p-2 text-amber-200">Le modèle « {templateName} » n’affiche pas de photo (lecture fiable par les logiciels de recrutement). Votre photo est gardée pour les autres modèles.</p>}
      {markerMissing && <p className="rounded-lg border border-amber-900 bg-amber-500/10 p-2 text-amber-200">Le code actuel ne contient pas l’emplacement de la photo (code importé ou modifié à la main) : régénérez le CV depuis l’onglet « Modèles » pour l’afficher.</p>}
      {previous && <button type="button" className={`${btn} w-full`} onClick={onPrevious}>↶ {previous}</button>}

      <label className={`${btn} w-full cursor-pointer`} htmlFor={`${id}-file`} aria-busy={loading}>
        {loading ? '⏳ Lecture de la photo…' : source ? '🔄 Changer la photo' : '⬆ Choisir une photo'}
      </label>
      <input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
      <p className="text-[11px] text-gray-500">JPEG, PNG ou WebP, 15 Mo au plus. Les métadonnées (appareil, position GPS) sont retirées.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}

      {source && (
        <>
          <figure className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center rounded-lg p-3" style={{ background: `#${colors.matte}` }} data-testid="photo-preview" aria-busy={rendering}>
              {photo
                ? <img src={photo} alt={`Photo du CV : ${frame.shape === 'circle' ? 'ronde' : 'rectangulaire'}, ${frame.width.toFixed(1)} × ${frame.height.toFixed(1)} cm`}
                    style={{ width: frame.width * PX_PER_CM, height: frame.height * PX_PER_CM }} className="block" />
                : <span className="text-gray-500">⏳</span>}
            </div>
            <figcaption className="text-[11px] text-gray-500">Aperçu exact de l’image compilée, sur le fond du modèle</figcaption>
          </figure>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${btnPrimary} col-span-2`} onClick={() => setEditing(true)}>✂️ Recadrer, zoomer, pivoter</button>
            <button type="button" className={btn} onClick={() => onTransform({ ...transform, x: 0, y: 0 })}>⊕ Centrer</button>
            <button type="button" className={btn} onClick={() => onTransform(IDENTITY)}>↺ Cadrage d’origine</button>
          </div>
        </>
      )}

      <fieldset className="space-y-3 rounded-lg border border-[#2a313c] p-3">
        <legend className="px-1 text-xs font-bold text-gray-200">Cadre — modèle « {templateName} »</legend>
        <div>
          <span className={label} id={`${id}-shape`}>Forme</span>
          <div role="radiogroup" aria-labelledby={`${id}-shape`} className="grid grid-cols-3 gap-1">
            {PHOTO_SHAPES.map(s => (
              <button key={s.id} type="button" role="radio" aria-checked={frame.shape === s.id} onClick={() => onFrame({ shape: s.id })}
                className={`${btn} ${frame.shape === s.id ? 'border-indigo-500 text-indigo-200' : ''}`}>{s.label}</button>
            ))}
          </div>
        </div>
        <Range id={`${id}-w`} text="Largeur" value={frame.width} {...FRAME_BOUNDS.width} unit="cm" onChange={width => onFrame({ width })} />
        <Range id={`${id}-h`} text={ratioFixed ? 'Hauteur (déduite de la forme)' : 'Hauteur'} value={frame.height} {...FRAME_BOUNDS.height} unit="cm"
          disabled={ratioFixed} onChange={height => onFrame({ height })} />
        <Range id={`${id}-r`} text={frame.shape === 'circle' ? 'Arrondi des angles (sans objet pour le cercle)' : 'Arrondi des angles'} value={frame.radius} {...FRAME_BOUNDS.radius} unit="%"
          disabled={frame.shape === 'circle'} onChange={radius => onFrame({ radius })} />
        <Range id={`${id}-b`} text="Épaisseur de la bordure" value={frame.border} {...FRAME_BOUNDS.border} unit="pt" onChange={border => onFrame({ border })} />
        {frame.border > 0 && (
          <ColorField id={`${id}-bc`} text="Couleur de la bordure" value={frame.borderColor === 'accent' ? undefined : frame.borderColor} fallback={colors.border}
            onChange={hex => onFrame({ borderColor: hex ?? 'accent' })} />
        )}
        <div>
          <span className={label} id={`${id}-pos`}>Position dans l’en-tête</span>
          <div role="radiogroup" aria-labelledby={`${id}-pos`} className="grid grid-cols-2 gap-1">
            {(['left', 'right'] as const).map(p => (
              <button key={p} type="button" role="radio" aria-checked={frame.position === p} onClick={() => onFrame({ position: p })}
                className={`${btn} ${frame.position === p ? 'border-indigo-500 text-indigo-200' : ''}`}>{p === 'left' ? '◧ À gauche' : 'À droite ◨'}</button>
            ))}
          </div>
        </div>
        <button type="button" className={`${btn} w-full`} onClick={onResetFrame}>Cadre d’origine du modèle</button>
        <p className="text-[11px] text-gray-500">Chaque modèle garde son propre cadre. Le cercle, les angles arrondis et la bordure sont dessinés dans l’image, sur la couleur du fond.</p>
      </fieldset>

      {source && (confirmRemove
        ? <div className="space-y-2 rounded-lg border border-red-900 bg-red-500/10 p-2" role="group" aria-label="Confirmer le retrait de la photo">
            <p className="text-red-200">La photo sera retirée du CV et de ce navigateur.</p>
            <div className="flex gap-2">
              <button type="button" className={btn} onClick={() => setConfirmRemove(false)} autoFocus>Annuler</button>
              <button type="button" className={btnDanger} onClick={() => { setConfirmRemove(false); onRemove() }}>Retirer la photo</button>
            </div>
          </div>
        : <button type="button" className={`${btnDanger} w-full`} onClick={() => setConfirmRemove(true)}>🗑 Retirer la photo…</button>)}
      <p className="text-[11px] text-gray-500">La photo reste dans cet onglet : elle n’est envoyée qu’au service de compilation, jamais enregistrée.</p>

      {editing && source && (
        <PhotoEditor source={source} frame={frame} colors={colors} initial={transform}
          onCancel={() => setEditing(false)} onConfirm={t => { setEditing(false); onTransform(t) }} />
      )}
    </div>
  )
}

/** Cadrage : la zone affichée est le cadre lui-même (ce que l'on voit est ce qui sera imprimé) */
function PhotoEditor({ source, frame, colors, initial, onCancel, onConfirm }: {
  source: PhotoSource
  frame: PhotoFrame
  colors: PhotoColors
  initial: PhotoTransform
  onCancel: () => void
  onConfirm: (t: PhotoTransform) => void
}) {
  const id = useId()
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const ratio = frame.height / frame.width
  const maxW = Math.min(320, (typeof window === 'undefined' ? 360 : window.innerWidth) - 64)
  const w = Math.round(Math.min(maxW, 340 / ratio))
  const h = Math.round(w * ratio)
  const fit = (t: PhotoTransform) => clampTransform(t, source.width, source.height, w, h)
  const [t, setT] = useState<PhotoTransform>(() => fit(initial))
  const update = (next: (prev: PhotoTransform) => PhotoTransform) => setT(prev => fit(next(prev)))

  // Rendu de l'aperçu à chaque changement (densité de l'écran respectée)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const frameId = requestAnimationFrame(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      const ctx = el.getContext('2d')
      if (ctx) drawPhoto(ctx, source.canvas, source.width, source.height, t, frame, el.width, el.height, colors)
    })
    return () => cancelAnimationFrame(frameId)
  }, [t, w, h, source, frame, colors])

  // Glisser (un doigt ou la souris), pincer (deux doigts)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointers.current
    const before = p.get(e.pointerId)
    if (!before) return
    if (p.size === 1) {
      update(prev => ({ ...prev, x: prev.x + (e.clientX - before.x) / w, y: prev.y + (e.clientY - before.y) / h }))
    } else if (p.size === 2) {
      const other = [...p.entries()].find(([k]) => k !== e.pointerId)![1]
      const d0 = Math.hypot(before.x - other.x, before.y - other.y)
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y)
      if (d0 > 0) update(prev => ({ ...prev, zoom: prev.zoom * (d1 / d0) }))
    }
    p.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => { pointers.current.delete(e.pointerId) }

  // Molette : zoom (écouteur non passif pour ne pas faire défiler la page)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      update(prev => ({ ...prev, zoom: prev.zoom * Math.exp(-e.deltaY * 0.0015) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02
    const actions: Record<string, (p: PhotoTransform) => PhotoTransform> = {
      ArrowLeft: p => ({ ...p, x: p.x - step }), ArrowRight: p => ({ ...p, x: p.x + step }),
      ArrowUp: p => ({ ...p, y: p.y - step }), ArrowDown: p => ({ ...p, y: p.y + step }),
      '+': p => ({ ...p, zoom: p.zoom * 1.1 }), '=': p => ({ ...p, zoom: p.zoom * 1.1 }), '-': p => ({ ...p, zoom: p.zoom / 1.1 }),
      '[': p => ({ ...p, rotation: p.rotation - 1 }), ']': p => ({ ...p, rotation: p.rotation + 1 }),
    }
    const action = actions[e.key]
    if (!action) return
    e.preventDefault()
    update(action)
  }

  return (
    <Dialog
      title="✂️ Cadrer la photo"
      onClose={onCancel}
      footer={<>
        <button type="button" className={btn} onClick={onCancel}>Annuler</button>
        <button type="button" className={btnPrimary} onClick={() => onConfirm(t)}>✓ Valider le cadrage</button>
      </>}
    >
      <div className="space-y-3 text-xs text-gray-300">
        <div
          ref={stage} tabIndex={0} role="group" aria-roledescription="zone de cadrage" aria-label="Photo à cadrer" aria-describedby={`${id}-help`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
          className="mx-auto cursor-move touch-none select-none rounded-lg p-2 outline-none ring-indigo-400 focus-visible:ring-2"
          style={{ width: w + 16, background: `#${colors.matte}` }} data-testid="photo-stage">
          <canvas ref={canvas} style={{ width: w, height: h }} className="block" aria-hidden="true" />
        </div>
        <p id={`${id}-help`} className="text-center text-[11px] text-gray-500">
          Glissez pour déplacer, pincez ou utilisez la molette pour zoomer. Clavier : flèches (Maj : plus vite), + et −, [ et ] pour pivoter.
        </p>
        <Range id={`${id}-zoom`} text="Zoom" value={Math.round(t.zoom * 100)} min={100} max={ZOOM_MAX * 100} step={1} unit="%" onChange={v => update(p => ({ ...p, zoom: v / 100 }))} />
        <Range id={`${id}-rot`} text="Rotation" value={t.rotation} min={-180} max={180} step={1} unit="°" onChange={v => update(p => ({ ...p, rotation: v }))} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={btn} onClick={() => update(p => ({ ...p, rotation: p.rotation - 90 }))} aria-label="Pivoter de 90 degrés vers la gauche">⟲ 90°</button>
          <button type="button" className={btn} onClick={() => update(p => ({ ...p, rotation: p.rotation + 90 }))} aria-label="Pivoter de 90 degrés vers la droite">⟳ 90°</button>
          <button type="button" className={btn} onClick={() => update(p => ({ ...p, x: 0, y: 0 }))}>⊕ Centrer</button>
          <button type="button" className={btn} onClick={() => setT(fit(IDENTITY))}>↺ Réinitialiser</button>
        </div>
      </div>
    </Dialog>
  )
}
