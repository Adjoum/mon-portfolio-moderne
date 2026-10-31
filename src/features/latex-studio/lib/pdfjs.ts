// pdf.js chargé à la demande, worker local (aucun CDN) ; pdf.js 6 n’évalue jamais de code.
type PdfJs = typeof import('pdfjs-dist')
let loading: Promise<PdfJs> | null = null

export function getPdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const lib = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    lib.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default
    return lib
  })()
  return loading
}

export async function openPdf(pdf: Blob) {
  const pdfjs = await getPdfjs()
  return pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), enableXfa: false, verbosity: 0 })
}
