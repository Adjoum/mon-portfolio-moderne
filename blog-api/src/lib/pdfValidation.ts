// blog-api/src/lib/pdfValidation.ts
// Contrôle d'un PDF destiné à être publié : taille, signature, structure, contenu actif.

import { PDFParse } from 'pdf-parse';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 20;
const PARSE_TIMEOUT_MS = 15_000;

// Un CV n'a aucune raison de contenir du code ou des fichiers embarqués
const ACTIVE_CONTENT = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/;

export class PdfValidationError extends Error {
  constructor(public status: 413 | 415 | 422, public code: string, message: string) {
    super(message);
  }
}

export async function validatePdf(buffer: Buffer): Promise<{ pages: number }> {
  if (buffer.length > MAX_PDF_BYTES) {
    throw new PdfValidationError(413, 'CV_TOO_LARGE', 'PDF trop volumineux (10 Mo maximum)');
  }
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new PdfValidationError(415, 'CV_NOT_PDF', 'Le fichier n’est pas un PDF');
  }
  if (!buffer.subarray(-1024).toString('latin1').includes('%%EOF')) {
    throw new PdfValidationError(422, 'CV_INVALID_PDF', 'PDF incomplet ou corrompu');
  }
  if (ACTIVE_CONTENT.test(buffer.toString('latin1'))) {
    throw new PdfValidationError(422, 'CV_ACTIVE_CONTENT', 'Le PDF contient du contenu actif (script ou fichier embarqué)');
  }

  // Copie : pdf.js peut transférer le tampon reçu à son worker
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let timer: NodeJS.Timeout | undefined;
  try {
    const info = await Promise.race([
      parser.getInfo(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), PARSE_TIMEOUT_MS);
      }),
    ]);
    const pages = Number(info.total);
    if (!Number.isInteger(pages) || pages < 1) {
      throw new PdfValidationError(422, 'CV_INVALID_PDF', 'PDF sans page lisible');
    }
    if (pages > MAX_PAGES) {
      throw new PdfValidationError(422, 'CV_TOO_MANY_PAGES', `PDF trop long (${MAX_PAGES} pages maximum)`);
    }
    return { pages };
  } catch (err) {
    if (err instanceof PdfValidationError) throw err;
    throw new PdfValidationError(422, 'CV_INVALID_PDF', 'PDF illisible, corrompu ou protégé par mot de passe');
  } finally {
    clearTimeout(timer);
    await parser.destroy().catch(() => {});
  }
}
