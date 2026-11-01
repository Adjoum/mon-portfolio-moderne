// Contrôle qualité du dernier PDF compilé (lib/quality.ts), recalculé à chaque compilation réussie.
import { useEffect, useState } from 'react'
import type { LatexWarning } from '../../lib/latexCompile'
import { analyzeQuality, extractPageText, type QualityIssue } from './lib/quality'
import { openPdf } from './lib/pdfjs'

export function useQuality(pdf: Blob | null, warnings: LatexWarning[], expectedName: string) {
  const [issues, setIssues] = useState<QualityIssue[] | null>(null)
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    ;(async () => {
      const task = await openPdf(pdf)
      try {
        const pages = await extractPageText(await task.promise)
        if (!cancelled) setIssues(analyzeQuality(pages, warnings, expectedName))
      } catch {
        if (!cancelled) setIssues(null)
      } finally {
        await task.destroy().catch(() => {})
      }
    })()
    return () => { cancelled = true }
  }, [pdf, warnings, expectedName])
  return pdf ? issues : null
}
