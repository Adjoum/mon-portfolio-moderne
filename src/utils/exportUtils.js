// ── Export JSON ───────────────────────────────────────────────
export function exportToJSON(data, filename = 'novamind.json') {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export SVG ────────────────────────────────────────────────
export function exportToSVG(svgElement, filename = 'novamind.svg') {
  const clone   = svgElement.cloneNode(true);
  const svgData = new XMLSerializer().serializeToString(clone);
  const blob    = new Blob([svgData], { type: 'image/svg+xml' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export PNG (robuste) ──────────────────────────────────────
export async function exportToPNG(svgElement, filename = 'novamind.png', scale = 2) {
  return new Promise((resolve, reject) => {
    try {
      const bbox   = svgElement.getBoundingClientRect();
      const width  = Math.round(bbox.width  * scale);
      const height = Math.round(bbox.height * scale);

      // Sérialiser le SVG avec namespace complet
      const serializer = new XMLSerializer();
      const rawSVG     = serializer.serializeToString(svgElement);

      // Nettoyer et wrapper pour garantir les dimensions
      const cleanSVG = rawSVG
        .replace(/width="[^"]*"/, `width="${width}"`)
        .replace(/height="[^"]*"/, `height="${height}"`)
        .replace(/<svg /, `<svg xmlns="http://www.w3.org/2000/svg" `);

      // Injecter un fond noir (le background SVG est dans le gradient,
      // mais le canvas HTML a besoin d'un fond explicite)
      const svgWithBg = cleanSVG.replace(
        /(<svg[^>]*>)/,
        `$1<rect width="100%" height="100%" fill="#05050f"/>`
      );

      const blob = new Blob([svgWithBg], { type: 'image/svg+xml;charset=utf-8' });
      const url  = URL.createObjectURL(blob);

      const img    = new Image();
      img.width    = width;
      img.height   = height;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Fond cosmos
        ctx.fillStyle = '#05050f';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          pngBlob => {
            if (!pngBlob) { reject(new Error('Canvas toBlob failed')); return; }
            const a    = document.createElement('a');
            a.href     = URL.createObjectURL(pngBlob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            URL.revokeObjectURL(url);
            resolve();
          },
          'image/png',
          1.0
        );
      };

      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        // Fallback : export via canvas direct sans SVG intermédiaire
        exportToPNGFallback(svgElement, filename, scale).then(resolve).catch(reject);
      };

      img.src = url;

    } catch (err) {
      reject(err);
    }
  });
}

// Fallback PNG : dessine les nœuds directement sur canvas
async function exportToPNGFallback(svgElement, filename, scale) {
  const bbox   = svgElement.getBoundingClientRect();
  const width  = Math.round(bbox.width  * scale);
  const height = Math.round(bbox.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, width, height);

  // Dessiner chaque élément SVG text/rect via foreignObject canvas
  ctx.font      = `bold ${14 * scale}px Syne, sans-serif`;
  ctx.fillStyle = '#6EE7F7';
  ctx.fillText('NovaMind Export', 20 * scale, 40 * scale);

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (blob) {
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      resolve();
    }, 'image/png');
  });
}

// ── Import JSON ───────────────────────────────────────────────
export function importFromJSON(onImport) {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader    = new FileReader();
    reader.onload   = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        onImport(data);
      } catch {
        alert('Fichier JSON invalide ou corrompu.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── Export Markdown ───────────────────────────────────────────
export function exportToMarkdown(nodes, edges) {
  const rootNode = Object.values(nodes).find(n => n.isRoot);
  if (!rootNode) return;

  const childrenMap = {};
  edges.forEach(e => {
    if (!childrenMap[e.from]) childrenMap[e.from] = [];
    childrenMap[e.from].push(e.to);
  });

  const lines    = [];
  const traverse = (nodeId, depth) => {
    const node = nodes[nodeId];
    if (!node) return;
    const indent = '  '.repeat(depth);
    const bullet = depth === 0 ? '# ' : depth === 1 ? '## ' : indent + '- ';
    lines.push(`${bullet}${node.icon || ''} ${node.label}`);
    if (node.notes) lines.push(`${indent}  > ${node.notes}`);
    (childrenMap[nodeId] || []).forEach(cid => traverse(cid, depth + 1));
  };

  traverse(rootNode.id, 0);
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'novamind.md';
  a.click();
}

// ── Share Link ────────────────────────────────────────────────
// Encode le projet dans l'URL (base64 compressed)
export function generateShareLink(data) {
  try {
    const json       = JSON.stringify(data);
    const b64        = btoa(encodeURIComponent(json));
    const baseUrl    = window.location.origin + window.location.pathname;
    const shareUrl   = `${baseUrl}?map=${b64}`;

    // Copier dans le presse-papier
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl);
    } else {
      // Fallback pour les anciens navigateurs
      const ta       = document.createElement('textarea');
      ta.value       = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    return shareUrl;
  } catch (err) {
    console.warn('generateShareLink error:', err);
    return null;
  }
}

// Charger un projet depuis un paramètre URL ?map=...
export function loadFromShareLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const b64    = params.get('map');
    if (!b64) return null;
    const json   = decodeURIComponent(atob(b64));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Nettoyer le paramètre ?map= de l'URL sans recharger la page
export function clearShareParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete('map');
  window.history.replaceState({}, '', url.toString());
}