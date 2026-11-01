// cv-extractor/src/worker.mjs — thread d'extraction (un par fichier, détruit ensuite)
import { parentPort, workerData } from 'node:worker_threads';
import { extractText } from './parsers.mjs';

parentPort.once('message', async bytes => {
  try {
    const result = await extractText(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), workerData.kind);
    parentPort.postMessage({ ok: true, text: result.text, pages: result.pages, needsOcr: result.needsOcr });
  } catch (err) {
    parentPort.postMessage({ ok: false, code: err?.code ?? 'EXTRACT_INVALID_FILE' });
  }
});
