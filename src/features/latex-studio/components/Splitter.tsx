// Poignée de redimensionnement entre deux panneaux (souris, tactile et clavier : flèches).
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

export function Splitter({ label, value, min, max, onChange, toValue }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  /** Convertit la position horizontale du pointeur en valeur */
  toValue: (clientX: number) => number
}) {
  const dragging = useRef(false)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const step = (max - min) / 20
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className="group relative w-1.5 shrink-0 cursor-col-resize bg-[#21262d] hover:bg-indigo-500/60 focus-visible:bg-indigo-500 focus-visible:outline-none"
      onPointerDown={(e: PointerEvent) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
      onPointerMove={(e: PointerEvent) => { if (dragging.current) onChange(clamp(toValue(e.clientX))) }}
      onPointerUp={() => { dragging.current = false }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(clamp(value - step)) }
        if (e.key === 'ArrowRight') { e.preventDefault(); onChange(clamp(value + step)) }
      }}
    />
  )
}
