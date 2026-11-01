// Correspondance PDF ↔ code (P4) du dernier PDF compilé : textes et positions lus par pdf.js
// (lecture seule, aucun script ni lien du PDF exécuté), rapprochés du code qui l'a produit.
import { useEffect, useState } from 'react'
import { openPdf } from './lib/pdfjs'
import { extractPageText } from './lib/quality'
import { buildSync, type SyncMap } from './lib/sync'

export function useSync(result: { pdf: Blob; key: string } | null): SyncMap | null {
  const [map, setMap] = useState<SyncMap | null>(null)
  useEffect(() => {
    if (!result) { setMap(null); return }
    let cancelled = false
    ;(async () => {
      const task = await openPdf(result.pdf)
      try {
        const pages = await extractPageText(await task.promise)
        // Code compilé (photo insérée sur la même ligne que son emplacement : numéros de ligne identiques)
        const code = result.key.split('\u0000')[0]
        if (!cancelled) setMap(buildSync(code, pages))
      } catch {
        if (!cancelled) setMap(null)
      } finally {
        await task.destroy().catch(() => {})
      }
    })()
    return () => { cancelled = true }
  }, [result])
  return map
}
