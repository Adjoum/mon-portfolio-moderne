// Aperçu fidèle du CV : page A4 réelle (794 px de large) mise à l'échelle, jamais recomposée à la
// largeur de l'écran. Zoom (ajusté, 50 à 200 %), déplacement par défilement (souris, doigt, clavier).
// L'iframe n'exécute aucun script (sandbox sans allow-scripts) ; le même HTML sert à l'export.
import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'

export const A4_WIDTH = 794
export const A4_HEIGHT = 1123
const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2]

export default function CvPreview({ html, title = 'Aperçu du CV' }: { html: string; title?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [fit, setFit] = useState(0.75)
  const [height, setHeight] = useState(A4_HEIGHT)
  // Rendu différé : un curseur que l'on fait glisser ne recharge pas l'aperçu à chaque pixel
  const [shown, setShown] = useState(html)
  useEffect(() => {
    const t = window.setTimeout(() => setShown(html), 120)
    return () => window.clearTimeout(t)
  }, [html])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => setFit(Math.max(0.2, Math.min(1.25, (el.clientWidth - 24) / A4_WIDTH)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = zoom === 'fit' ? fit : zoom
  const step = (dir: 1 | -1) => {
    const current = scale
    const next = dir > 0 ? ZOOMS.find(z => z > current + 0.001) : [...ZOOMS].reverse().find(z => z < current - 0.001)
    if (next) setZoom(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-center gap-1.5 border-b border-[#30363d] bg-[#161b22] px-2 py-1.5" role="toolbar" aria-label="Zoom de l’aperçu">
        <button type="button" onClick={() => step(-1)} disabled={scale <= ZOOMS[0]} aria-label="Zoom arrière"
          className="grid h-9 w-9 place-items-center rounded-md border border-[#30363d] text-gray-300 hover:text-white disabled:opacity-40"><Minus size={15} aria-hidden="true" /></button>
        <span className="w-14 text-center text-xs tabular-nums text-gray-300" aria-live="polite">{Math.round(scale * 100)} %</span>
        <button type="button" onClick={() => step(1)} disabled={scale >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom avant"
          className="grid h-9 w-9 place-items-center rounded-md border border-[#30363d] text-gray-300 hover:text-white disabled:opacity-40"><Plus size={15} aria-hidden="true" /></button>
        <button type="button" onClick={() => setZoom('fit')} aria-pressed={zoom === 'fit'}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${zoom === 'fit' ? 'border-indigo-400 text-indigo-100' : 'border-[#30363d] text-gray-300 hover:text-white'}`}>
          <Maximize2 size={13} aria-hidden="true" /> Ajuster
        </button>
        <span className="ml-2 hidden text-[11px] text-gray-500 sm:inline">≈ {Math.max(1, Math.ceil((height - 4) / A4_HEIGHT))} page(s) A4</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-[#2a2d3e] p-3 [touch-action:pan-x_pan-y]" tabIndex={0} aria-label="Aperçu du CV, défilable">
        <div className="mx-auto" style={{ width: A4_WIDTH * scale, height: height * scale }}>
          <iframe
            title={title}
            srcDoc={shown}
            sandbox="allow-same-origin"
            className="block origin-top-left border-0 bg-white shadow-[0_8px_40px_rgba(0,0,0,.6)]"
            style={{ width: A4_WIDTH, height, transform: `scale(${scale})` }}
            onLoad={e => {
              // Mesure à hauteur d'une page : un contenu raccourci réduit bien la hauteur affichée
              const frame = e.currentTarget
              const doc = frame.contentDocument
              if (!doc) return
              frame.style.height = `${A4_HEIGHT}px`
              setHeight(Math.max(A4_HEIGHT, doc.documentElement.scrollHeight))
            }}
          />
        </div>
      </div>
    </div>
  )
}
