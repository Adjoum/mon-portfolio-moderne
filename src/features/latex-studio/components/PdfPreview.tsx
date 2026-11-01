// Aperçu PDF rendu par pdf.js en images (ordinateur, tablette et smartphone, où les PDF en iframe
// ne s'affichent pas). Les pages précédentes restent visibles pendant le rendu suivant.
// Synchronisation (P4) : un clic sur une page donne sa position au studio ; les zones du code courant
// sont surlignées par-dessus l'image. Les pages restent des images : aucun lien, aucune annotation ni
// aucun script du PDF n'est actif.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { openPdf } from '../lib/pdfjs'
import type { SyncRect } from '../lib/sync'
import { btn, btnGhost } from './ui'

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function PdfPreview({ pdf, url, dimmed, onDownload, pageSizes, highlights = [], onPageClick, reveal, navigation, overlay }: {
  pdf: Blob
  url: string
  dimmed: boolean
  /** Bouton « ⬇ PDF » dans la barre de l'aperçu (absent dans le studio : l'en-tête le propose déjà) */
  onDownload?: () => void
  /** Taille des pages en points (synchronisation) */
  pageSizes?: { width: number; height: number }[]
  /** Zones à surligner, en points depuis le haut de la page */
  highlights?: SyncRect[]
  /** Clic sur une page : position en points depuis le haut de la page */
  onPageClick?: (page: number, x: number, y: number) => void
  /** Zone à amener à l'écran (nonce : nouvelle demande) */
  reveal?: { rect: SyncRect; nonce: number } | null
  /** Commandes de navigation ajoutées à la barre de l'aperçu */
  navigation?: ReactNode
  /** Bulle posée sur une page (passage cliqué), en points depuis le haut de la page */
  overlay?: { page: number; x: number; y: number; node: ReactNode } | null
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

  // Zone demandée amenée au tiers supérieur de l'aperçu
  // Chaque demande n'est traitée qu'une fois (une recompilation ne ramène pas l'aperçu en arrière)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const revealed = useRef(0)
  useEffect(() => {
    if (!reveal || !pageSizes || revealed.current === reveal.nonce) return
    const el = pageRefs.current[reveal.rect.page - 1]
    const size = pageSizes[reveal.rect.page - 1]
    const container = box.current
    if (!el || !size || !container) return
    revealed.current = reveal.nonce
    const y = el.offsetTop + (reveal.rect.top / size.height) * el.clientHeight
    container.scrollTo({ top: Math.max(0, y - container.clientHeight / 3), behavior: 'smooth' })
  }, [reveal, pageSizes, pages])

  const click = (index: number) => (e: MouseEvent<HTMLDivElement>) => {
    const size = pageSizes?.[index]
    if (!onPageClick || !size) return
    const r = e.currentTarget.getBoundingClientRect()
    onPageClick(index + 1, ((e.clientX - r.left) / r.width) * size.width, ((e.clientY - r.top) / r.height) * size.height)
  }

  const index = ZOOMS.indexOf(zoom)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#21262d] bg-[#13161d] px-2 py-1" role="toolbar" aria-label="Commandes de l’aperçu">
        <button type="button" className={`${btnGhost} px-2`} onClick={() => setZoom(ZOOMS[Math.max(0, index - 1)])} disabled={index <= 0} aria-label="Zoom arrière" title="Zoom arrière">−</button>
        <span className="min-w-11 shrink-0 text-center text-xs text-gray-400" aria-live="polite">{Math.round(zoom * 100)} %</span>
        <button type="button" className={`${btnGhost} px-2`} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, index + 1)])} disabled={index >= ZOOMS.length - 1} aria-label="Zoom avant" title="Zoom avant">+</button>
        <button type="button" className={`${btnGhost} px-2`} onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Ajuster à la largeur" title="Ajuster à la largeur">↔</button>
        {navigation}
        <span className="ml-auto shrink-0 px-1 text-xs text-gray-500">{pages.length ? `${pages.length} p.` : ''}<span className="sr-only">{pages.length > 1 ? 'pages' : 'page'}</span></span>
        <a className={`${btnGhost} shrink-0 px-2`} href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir le PDF dans un nouvel onglet">↗ Ouvrir</a>
        {onDownload && <button type="button" className={`${btn} shrink-0`} onClick={onDownload}>⬇ PDF</button>}
      </div>
      <div ref={box} data-preview aria-busy={painting} className={`relative min-h-0 flex-1 overflow-auto bg-[#1c2129] p-3 transition-opacity ${dimmed ? 'opacity-50' : ''}`}>
        {/* Indicateur superposé, sans hauteur : les pages ne bougent pas pendant leur mise à jour (un clic reste à sa place) */}
        {painting && pages.length > 0 && (
          <div className="pointer-events-none sticky top-0 z-20 flex h-0 justify-end">
            <span className="rounded bg-[#13161d]/90 px-2 py-1 text-[11px] text-amber-300" role="status">⏳ Mise à jour de l’aperçu…</span>
          </div>
        )}
        {failed && <p className="text-sm text-amber-300">Aperçu impossible dans ce navigateur : utilisez « Ouvrir » ou « ⬇ PDF ».</p>}
        <div className="mx-auto flex flex-col items-center gap-3" style={{ width: `${zoom * 100}%` }}>
          {pages.map((src, i) => (
            <div key={src} ref={el => { pageRefs.current[i] = el }} className={`relative w-full ${onPageClick && pageSizes?.[i] ? 'cursor-pointer' : ''}`}
              onClick={click(i)} data-page={i + 1} title={onPageClick ? 'Cliquez sur un passage pour afficher son code LaTeX' : undefined}>
              <img src={src} alt={`Page ${i + 1} du CV`} className="w-full bg-white shadow-lg" draggable={false} />
              {pageSizes?.[i] && highlights.filter(h => h.page === i + 1).map((h, k) => (
                <span key={k} aria-hidden="true" data-sync-highlight
                  className="pointer-events-none absolute rounded-sm bg-amber-300/35 outline outline-2 outline-amber-500/80"
                  style={{
                    left: `${(h.x0 / pageSizes[i].width) * 100}%`, width: `${((h.x1 - h.x0) / pageSizes[i].width) * 100}%`,
                    top: `${(h.top / pageSizes[i].height) * 100}%`, height: `${((h.bottom - h.top) / pageSizes[i].height) * 100}%`,
                  }} />
              ))}
              {overlay && overlay.page === i + 1 && pageSizes?.[i] && (
                <div className="absolute z-10 -translate-x-1/2 pt-2" onClick={e => e.stopPropagation()}
                  style={{ left: `${Math.min(80, Math.max(20, (overlay.x / pageSizes[i].width) * 100))}%`, top: `${(overlay.y / pageSizes[i].height) * 100}%` }}>
                  {overlay.node}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
