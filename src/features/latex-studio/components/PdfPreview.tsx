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
  onDownload: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pages, setPages] = useState<string[]>([])
  const [failed, setFailed] = useState(false)

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
      <div className="flex flex-wrap items-center gap-1 border-b border-[#21262d] bg-[#13161d] px-2 py-1" aria-label="Commandes de l’aperçu">
        <button type="button" className={btnGhost} onClick={() => setZoom(ZOOMS[Math.max(0, index - 1)])} disabled={index <= 0} aria-label="Zoom arrière">−</button>
        <span className="min-w-12 text-center text-xs text-gray-400" aria-live="polite">{Math.round(zoom * 100)} %</span>
        <button type="button" className={btnGhost} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, index + 1)])} disabled={index >= ZOOMS.length - 1} aria-label="Zoom avant">+</button>
        <button type="button" className={btnGhost} onClick={() => setZoom(1)}>Largeur</button>
        <span className="ml-auto text-xs text-gray-500">{pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : ''}</span>
        <a className={btnGhost} href={url} target="_blank" rel="noopener noreferrer">Ouvrir</a>
        <button type="button" className={btn} onClick={onDownload}>⬇ PDF</button>
      </div>
      <div ref={box} className={`min-h-0 flex-1 overflow-auto bg-[#1c2129] p-3 transition-opacity ${dimmed ? 'opacity-50' : ''}`}>
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
