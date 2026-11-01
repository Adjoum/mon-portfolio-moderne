// src/features/latex-studio/useCompile.ts
// Compilation de l'aperçu via blog-api → latex-runner (src/lib/latexCompile.ts) :
//   - automatique 3 s après la dernière frappe, immédiate sur demande (compileSoon) ;
//   - une seule requête à la fois par onglet, jamais deux fois le même source ;
//   - changements rapides (modèles, réglages) : le résultat d'une compilation devenue obsolète
//     n'est jamais affiché, seule la dernière version est compilée ensuite (P2) ;
//   - pause sur quota, nouvel essai si le service est occupé, repli sur le .tex s'il est coupé.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compileLatexPdf, LatexCompileError, type LatexCompileResult } from '../../lib/latexCompile'
import { buildFinalLatex } from '../../pages/CVBuilder/latexTemplates'

export const AUTO_COMPILE_DELAY_MS = 3000

export interface CompileInput { code: string; photo: string | null; photoWidth: number }

export function compileKey({ code, photo, photoWidth }: CompileInput): string {
  return `${buildFinalLatex(code, !!photo, photoWidth)}\u0000${photo ?? ''}`
}

export function useCompile(code: string, photo: string | null, photoWidth: number) {
  const input = useMemo<CompileInput>(() => ({ code, photo, photoWidth }), [code, photo, photoWidth])
  const [result, setResult] = useState<(LatexCompileResult & { url: string; key: string }) | null>(null)
  const [error, setError] = useState<LatexCompileError | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [autoCompile, setAutoCompile] = useState(true)

  const latest = useRef(input)
  const state = useRef({ running: false, pending: false, lastKey: '', pausedUntil: 0, downloadWhenReady: false })
  const immediate = useRef(true)   // première compilation dès l'ouverture
  const nextDelay = useRef<number | null>(null)
  /** Compilations terminées alors qu'une version plus récente attendait : résultat ignoré */
  const [obsoleteSkipped, setObsoleteSkipped] = useState(0)
  const urlRef = useRef('')
  const runRef = useRef<(force: boolean) => Promise<void>>(async () => {})

  useEffect(() => { latest.current = input }, [input])

  const run = useCallback(async (force: boolean) => {
    const s = state.current
    if (s.running) {
      s.pending = true
      return
    }
    const current = latest.current
    const key = compileKey(current)
    if (!force && (key === s.lastKey || Date.now() < s.pausedUntil)) return

    s.running = true
    setRendering(true)
    let skipped = false
    try {
      const compiled = await compileLatexPdf(buildFinalLatex(current.code, !!current.photo, current.photoWidth), current.photo)
      // Une version plus récente attend : ce PDF ne correspond plus à rien de ce qui est affiché
      if (s.pending && compileKey(latest.current) !== key) {
        skipped = true
        setObsoleteSkipped(n => n + 1)
        return
      }
      const url = URL.createObjectURL(compiled.pdf)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      s.lastKey = key
      setResult({ ...compiled, url, key })
      setError(null)
      setUnavailable(false)
      if (s.downloadWhenReady) downloadUrl(url, 'cv.pdf')
    } catch (e) {
      const err = e instanceof LatexCompileError ? e : new LatexCompileError('LATEX_NETWORK', 0, 'Service de compilation injoignable.')
      // Erreur d'une version déjà remplacée : la suivante sera compilée, rien à afficher
      if (s.pending && compileKey(latest.current) !== key && !err.throttled && !err.unavailable) {
        skipped = true
        setObsoleteSkipped(n => n + 1)
        return
      }
      setError(err)
      if (err.unavailable) setUnavailable(true)
      if (err.code === 'LATEX_BUSY') {
        setTimeout(() => void runRef.current(false), (err.retryAfterSec ?? 3) * 1000)
      } else if (err.throttled) {
        s.pausedUntil = Date.now() + (err.retryAfterSec ?? 60) * 1000
      } else if (!err.unavailable) {
        // Erreur du document : pas de nouvel essai tant qu'il n'est pas modifié
        s.lastKey = key
      }
    } finally {
      s.running = false
      // Téléchargement demandé : conservé pour la version suivante si celle-ci a été ignorée
      if (!skipped) s.downloadWhenReady = false
      setRendering(false)
      if (s.pending) {
        s.pending = false
        void runRef.current(false)
      }
    }
  }, [])

  useEffect(() => { runRef.current = run }, [run])

  useEffect(() => {
    if (!autoCompile || unavailable) return
    const delay = immediate.current ? 0 : nextDelay.current ?? AUTO_COMPILE_DELAY_MS
    // Drapeau levé au déclenchement, pas avant : un effet monté deux fois (React StrictMode) reste immédiat
    const timer = setTimeout(() => { immediate.current = false; nextDelay.current = null; void run(false) }, delay)
    return () => clearTimeout(timer)
  }, [input, autoCompile, unavailable, run])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  /** Compilation immédiate au prochain changement (template, IA, photo, import) */
  const compileSoon = useCallback(() => { immediate.current = true }, [])
  /** Compilation après une courte temporisation (réglages graphiques successifs) */
  const compileAfter = useCallback((ms: number) => { nextDelay.current = ms }, [])

  const compileNow = useCallback(() => {
    setUnavailable(false)
    void run(true)
  }, [run])

  const currentKey = compileKey(input)
  const stale = !!result && result.key !== currentKey

  /** PDF à jour : téléchargé tel quel ; sinon compilé d'abord, puis téléchargé */
  const downloadPdf = useCallback(() => {
    if (result && result.key === compileKey(latest.current)) return downloadUrl(result.url, 'cv.pdf')
    state.current.downloadWhenReady = true
    compileNow()
  }, [result, compileNow])

  return { result, error, unavailable, rendering, autoCompile, setAutoCompile, compileNow, compileSoon, compileAfter, downloadPdf, stale, runRef, obsoleteSkipped }
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
