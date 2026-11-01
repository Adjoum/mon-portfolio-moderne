// src/features/ai-admin/ui.tsx
// Éléments communs du centre IA, dans le style du dashboard (glass-effect, dégradé primary/secondary)

import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'

import type { Notice } from './useServerAction'
type Tone = 'green' | 'red' | 'amber' | 'gray' | 'indigo' | 'sky'

const TONES: Record<Tone, string> = {
  green:  'bg-green-500/15 text-green-300 border-green-500/30',
  red:    'bg-red-500/15 text-red-300 border-red-500/30',
  amber:  'bg-amber-500/15 text-amber-200 border-amber-500/30',
  gray:   'bg-white/5 text-gray-300 border-white/10',
  indigo: 'bg-primary/15 text-indigo-200 border-primary/30',
  sky:    'bg-sky-500/15 text-sky-200 border-sky-500/30',
}

export function Badge({ tone = 'gray', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}

export function NoticeBanner({ notice, onClose }: { notice: Notice | null; onClose?: () => void }) {
  if (!notice) return null
  const ok = notice.type === 'success'
  const tone = ok ? 'bg-green-500/10 text-green-300' : notice.type === 'warning' ? 'bg-amber-500/10 text-amber-200' : 'bg-red-500/10 text-red-300'
  const Icon = ok ? CheckCircle : notice.type === 'warning' ? AlertTriangle : AlertCircle
  return (
    <div role={ok ? 'status' : 'alert'} data-notice={notice.type} className={`flex items-start gap-3 p-4 rounded-xl ${tone}`}>
      <Icon size={20} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span className="flex-1 whitespace-pre-line">{notice.text}</span>
      {onClose && <button type="button" onClick={onClose} className="text-sm opacity-70 hover:opacity-100" aria-label="Fermer le message">✕</button>}
    </div>
  )
}

const BUTTON = {
  primary:   'bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90',
  secondary: 'glass-effect text-gray-200 hover:text-white',
  danger:    'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25',
}

export function Button({ variant = 'secondary', busy, children, className = '', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON[variant]} ${className}`}
    >
      {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm text-gray-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass-effect p-5 rounded-2xl space-y-4 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h4 className="text-lg font-semibold text-white">{title}</h4>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Meter({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) {
  const tone = used >= 90 ? 'bg-red-500' : used >= 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-primary to-secondary'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm"><span className="text-gray-300">{label}</span><span className="text-gray-400">{text}</span></div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, used)}%` }} />
      </div>
    </div>
  )
}
