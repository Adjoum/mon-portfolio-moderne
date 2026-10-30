/**
 * fileConverters.ts
 * --------------------------------------------------------------------------
 * Toute la logique de conversion de fichiers, 100% côté navigateur.
 *
 * Les bibliothèques lourdes (pdfjs, mammoth, docx, pdf-lib, xlsx, html2pdf...)
 * sont chargées en import dynamique À L'INTÉRIEUR de chaque fonction.
 * => Elles ne pèsent PAS sur le bundle initial du portfolio : elles ne sont
 *    téléchargées que lorsque l'utilisateur lance réellement une conversion.
 *
 * Chaque convertisseur renvoie un { blob, filename } prêt à télécharger.
 * --------------------------------------------------------------------------
 */

export interface ConversionResult {
  blob: Blob;
  filename: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers internes                                                          */
/* -------------------------------------------------------------------------- */

/** Retire l'extension d'un nom de fichier ("rapport.docx" -> "rapport"). */
const baseName = (name: string): string => name.replace(/\.[^/.]+$/, '');

/**
 * Enveloppe un fragment HTML dans un document stylé, pour que les PDF générés
 * depuis du Markdown / Word soient lisibles (typo, marges, code, tableaux).
 */
const wrapHtmlForPdf = (innerHtml: string, _title: string): string => `
  <div style="
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a2e;
    font-size: 13px;
    line-height: 1.65;
    padding: 8px 4px;
  ">
    <style>
      h1,h2,h3,h4 { color:#111; line-height:1.25; margin:1.1em 0 .5em; font-weight:700; }
      h1 { font-size:24px; border-bottom:2px solid #6366f1; padding-bottom:.3em; }
      h2 { font-size:19px; } h3 { font-size:16px; }
      p { margin:.5em 0; }
      a { color:#4f46e5; text-decoration:none; }
      code { background:#f1f1f7; padding:2px 5px; border-radius:4px; font-size:.9em;
             font-family:'SFMono-Regular',Consolas,monospace; }
      pre { background:#1e1e2e; color:#e4e4f0; padding:14px; border-radius:8px;
            overflow:auto; font-size:12px; }
      pre code { background:none; color:inherit; padding:0; }
      blockquote { border-left:4px solid #818cf8; margin:.8em 0; padding:.2em 1em;
                   color:#444; background:#f7f7fc; }
      table { border-collapse:collapse; width:100%; margin:1em 0; font-size:12px; }
      th,td { border:1px solid #ddd; padding:7px 10px; text-align:left; }
      th { background:#f1f1f7; font-weight:600; }
      img { max-width:100%; }
      ul,ol { padding-left:1.4em; }
    </style>
    ${innerHtml}
  </div>
`;

/** Type minimal du worker chaînable de html2pdf.js (mal typé par le package). */
interface Html2PdfWorker {
  set(opt: Record<string, unknown>): Html2PdfWorker;
  from(element: HTMLElement | string): Html2PdfWorker;
  outputPdf(type: 'blob'): Promise<Blob>;
}

/**
 * HTML -> Blob PDF via html2pdf.js.
 * On insère un conteneur hors écran le temps du rendu, puis on le retire.
 */
async function htmlToPdfBlob(innerHtml: string, title: string): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;

  // Le HTML vient d'un fichier non fiable : DOMPurify retire scripts et gestionnaires d'événements
  const DOMPurify = (await import('dompurify')).default;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.innerHTML = wrapHtmlForPdf(DOMPurify.sanitize(innerHtml), title);
  document.body.appendChild(container);

  const opt = {
    margin: [12, 12, 14, 12],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  };

  try {
    const worker = html2pdf() as unknown as Html2PdfWorker;
    const blob: Blob = await worker.set(opt).from(container).outputPdf('blob');
    return blob;
  } finally {
    document.body.removeChild(container);
  }
}

/** Convertit n'importe quelle image (webp, gif, bmp...) en octets PNG via canvas. */
async function imageFileToPngBytes(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b!), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/* -------------------------------------------------------------------------- */
/*  Configuration de pdf.js (worker) — initialisé une seule fois              */
/* -------------------------------------------------------------------------- */

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import('pdfjs-dist');
  // Vite : on importe l'URL du worker en module.
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  lib.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  pdfjsLib = lib;
  return lib;
}

/* -------------------------------------------------------------------------- */
/*  MARKDOWN                                                                  */
/* -------------------------------------------------------------------------- */

export async function markdownToHtml(file: File): Promise<ConversionResult> {
  const { marked } = await import('marked');
  const md = await file.text();
  const body = await marked.parse(md);
  const full = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">`
    + `<title>${baseName(file.name)}</title></head><body>`
    + wrapHtmlForPdf(body as string, baseName(file.name))
    + `</body></html>`;
  return {
    blob: new Blob([full], { type: 'text/html;charset=utf-8' }),
    filename: `${baseName(file.name)}.html`,
  };
}

export async function markdownToPdf(file: File): Promise<ConversionResult> {
  const { marked } = await import('marked');
  const md = await file.text();
  const body = await marked.parse(md);
  const blob = await htmlToPdfBlob(body as string, baseName(file.name));
  return { blob, filename: `${baseName(file.name)}.pdf` };
}

/* -------------------------------------------------------------------------- */
/*  WORD (.docx)                                                              */
/* -------------------------------------------------------------------------- */

export async function docxToHtml(file: File): Promise<ConversionResult> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  const full = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">`
    + `<title>${baseName(file.name)}</title></head><body>`
    + wrapHtmlForPdf(value, baseName(file.name))
    + `</body></html>`;
  return {
    blob: new Blob([full], { type: 'text/html;charset=utf-8' }),
    filename: `${baseName(file.name)}.html`,
  };
}

export async function docxToPdf(file: File): Promise<ConversionResult> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  const blob = await htmlToPdfBlob(value, baseName(file.name));
  return { blob, filename: `${baseName(file.name)}.pdf` };
}

export async function docxToTxt(file: File): Promise<ConversionResult> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return {
    blob: new Blob([value], { type: 'text/plain;charset=utf-8' }),
    filename: `${baseName(file.name)}.txt`,
  };
}

/* -------------------------------------------------------------------------- */
/*  PDF                                                                       */
/* -------------------------------------------------------------------------- */

/** Extrait le texte natif d'un PDF (pas d'OCR : ne lit pas les PDF scannés). */
export async function pdfToText(file: File): Promise<ConversionResult> {
  const pdfjs = await getPdfjs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;

  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ');
    out += text + '\n\n';
  }
  return {
    blob: new Blob([out.trim()], { type: 'text/plain;charset=utf-8' }),
    filename: `${baseName(file.name)}.txt`,
  };
}

/** Rend chaque page en PNG haute résolution et renvoie un ZIP. */
export async function pdfToImagesZip(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<ConversionResult> {
  const pdfjs = await getPdfjs();
  const JSZip = (await import('jszip')).default;
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const zip = new JSZip();

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const pngBlob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), 'image/png'),
    );
    zip.file(`${baseName(file.name)}-page-${String(i).padStart(3, '0')}.png`, pngBlob);
    onProgress?.(i, pdf.numPages);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: `${baseName(file.name)}-images.zip` };
}

/**
 * PDF -> Word (.docx).
 * ⚠️ Extraction du TEXTE uniquement : la mise en page d'origine n'est PAS
 * conservée (impossible de façon fiable en pur navigateur). Le .docx produit
 * est entièrement éditable. Pour une fidélité parfaite, passer par un backend
 * LibreOffice (voir note d'intégration).
 */
export async function pdfToDocx(file: File): Promise<ConversionResult> {
  const pdfjs = await getPdfjs();
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;

  const paragraphs: InstanceType<typeof Paragraph>[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // On reconstruit des lignes en se basant sur la position verticale (Y).
    let line = '';
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5] as number;
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        paragraphs.push(new Paragraph({ children: [new TextRun(line.trim())] }));
        line = '';
      }
      line += item.str + ' ';
      lastY = y;
    }
    if (line.trim()) {
      paragraphs.push(new Paragraph({ children: [new TextRun(line.trim())] }));
    }
    // Saut de page entre les pages PDF
    if (i < pdf.numPages) {
      paragraphs.push(new Paragraph({ children: [new TextRun('')], pageBreakBefore: true }));
    }
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  return { blob, filename: `${baseName(file.name)}.docx` };
}

/** Fusionne plusieurs PDF en un seul, dans l'ordre fourni. */
export async function mergePdfs(files: File[]): Promise<ConversionResult> {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (const file of files) {
    const src = await PDFDocument.load(await file.arrayBuffer());
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  const bytes = await merged.save();
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    filename: 'fusion.pdf',
  };
}

/* -------------------------------------------------------------------------- */
/*  IMAGES -> PDF                                                             */
/* -------------------------------------------------------------------------- */

/** Combine une ou plusieurs images en un seul PDF (une image = une page). */
export async function imagesToPdf(files: File[]): Promise<ConversionResult> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    let img;
    if (file.type === 'image/png') {
      img = await pdfDoc.embedPng(await file.arrayBuffer());
    } else if (file.type === 'image/jpeg') {
      img = await pdfDoc.embedJpg(await file.arrayBuffer());
    } else {
      // webp, gif, bmp... -> conversion en PNG via canvas
      img = await pdfDoc.embedPng(await imageFileToPngBytes(file));
    }
    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const bytes = await pdfDoc.save();
  const name = files.length === 1 ? baseName(files[0].name) : 'images';
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    filename: `${name}.pdf`,
  };
}

/* -------------------------------------------------------------------------- */
/*  EXCEL <-> CSV                                                             */
/* -------------------------------------------------------------------------- */

export async function xlsxToCsv(file: File): Promise<ConversionResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const csv = XLSX.utils.sheet_to_csv(firstSheet);
  return {
    blob: new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), // BOM pour Excel
    filename: `${baseName(file.name)}.csv`,
  };
}

export async function csvToXlsx(file: File): Promise<ConversionResult> {
  const XLSX = await import('xlsx');
  const text = await file.text();
  const wb = XLSX.read(text, { type: 'string', raw: false });
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return {
    blob: new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename: `${baseName(file.name)}.xlsx`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Déclenche le téléchargement d'un Blob                                     */
/* -------------------------------------------------------------------------- */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}