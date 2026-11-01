// Aperçu PDF rendu par pdf.js en images (ordinateur, tablette et smartphone, où les PDF en iframe
// ne s'affichent pas). Les pages précédentes restent visibles pendant le rendu suivant.
import { useEffect, useRef, useState } from 'react'
import { openPdf } from '../lib/pdfjs'
import { btn, btnGhost } from './ui'

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function PdfPreview({ pdf, url, dimmed, onDownload }: {
  pdf: Blob
  url: string
  dimmed: boolean
  /** Bouton « ⬇ PDF » dans la barre de l'aperçu (absent dans le studio : l'en-tête le propose déjà) */
  onDownload?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pages, setPages] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  // Pages en cours de rendu : l'image affichée est encore celle du PDF précédent
  const [painting, setPainting] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => setWidth(el.clientWidth), 120)
    })
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (!width) return
    let cancelled = false
    const created: string[] = []
    setPainting(true)
    ;(async () => {
      const task = await openPdf(pdf)
      try {
        const doc = await task.promise
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
          const page = await doc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: ((width - 24) / base.width) * zoom * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
          const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
          if (blob) created.push(URL.createObjectURL(blob))
          if (cancelled) break
        }
        if (cancelled) {
          created.forEach(u => URL.revokeObjectURL(u))
          return
        }
        setPages(old => { old.forEach(u => URL.revokeObjectURL(u)); return created })
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setPainting(false)
        await task.destroy().catch(() => {})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf, width, zoom])

  useEffect(() => () => setPages(old => { old.forEach(u => URL.revokeObjectURL(u)); return [] }), [])

  const index = ZOOMS.indexOf(zoom)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[#21262d] bg-[#13161d] px-2 py-1" role="toolbar" aria-label="Commandes de l’aperçu">
        <button type="button" className={`${btnGhost} px-2`} onClick={() => setZoom(ZOOMS[Math.max(0, index - 1)])} disabled={index <= 0} aria-label="Zoom arrière" title="Zoom arrière">−</button>
        <span className="min-w-11 shrink-0 text-center text-xs text-gray-400" aria-live="polite">{Math.round(zoom * 100)} %</span>
        <button type="button" className={`${btnGhost} px-2`} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, index + 1)])} disabled={index >= ZOOMS.length - 1} aria-label="Zoom avant" title="Zoom avant">+</button>
        <button type="button" className={`${btnGhost} px-2`} onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Ajuster à la largeur" title="Ajuster à la largeur">↔</button>
        <span className="ml-auto shrink-0 px-1 text-xs text-gray-500">{pages.length ? `${pages.length} p.` : ''}<span className="sr-only">{pages.length > 1 ? 'pages' : 'page'}</span></span>
        <a className={`${btnGhost} shrink-0 px-2`} href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir le PDF dans un nouvel onglet">↗ Ouvrir</a>
        {onDownload && <button type="button" className={`${btn} shrink-0`} onClick={onDownload}>⬇ PDF</button>}
      </div>
      <div ref={box} data-preview aria-busy={painting} className={`relative min-h-0 flex-1 overflow-auto bg-[#1c2129] p-3 transition-opacity ${dimmed ? 'opacity-50' : ''}`}>
        {painting && pages.length > 0 && (
          <span className="sticky top-0 z-10 float-right rounded bg-[#13161d]/90 px-2 py-1 text-[11px] text-amber-300" role="status">⏳ Mise à jour de l’aperçu…</span>
        )}
        {failed && <p className="text-sm text-amber-300">Aperçu impossible dans ce navigateur : utilisez « Ouvrir » ou « ⬇ PDF ».</p>}
        <div className="mx-auto flex flex-col items-center gap-3" style={{ width: `${zoom * 100}%` }}>
          {pages.map((src, i) => (
            <img key={src} src={src} alt={`Page ${i + 1} du CV`} className="w-full bg-white shadow-lg" draggable={false} />
          ))}
        </div>
      </div>
    </div>
  )
}
