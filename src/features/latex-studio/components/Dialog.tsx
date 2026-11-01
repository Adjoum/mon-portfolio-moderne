// Fenêtre modale accessible : rôle dialog, titre lié, focus piégé, Échap pour fermer, focus rendu
// à l'élément d'origine. Plein écran sur smartphone, centrée au-delà.
import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({ title, onClose, children, footer, wide = false }: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  // onClose change à chaque rendu du parent : lu via une référence, pour ne pas ramener le focus
  // au premier bouton à chaque mise à jour de l'interface (compilation, statut…)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    root?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
      }
      if (e.key !== 'Tab' || !root) return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[1000] flex items-stretch sm:items-center justify-center bg-black/75 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex w-full flex-col bg-[#13161d] text-gray-200 sm:max-h-[92vh] sm:rounded-xl sm:border sm:border-[#21262d] ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#21262d] px-4 py-3">
          <h2 id={titleId} className="text-base font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white" aria-label="Fermer">✕</button>
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[#21262d] px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}
