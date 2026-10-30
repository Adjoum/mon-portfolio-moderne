// src/pages/CVBuilder/cvPrint.ts
// Impression d'un CV dans une iframe isolée : les scripts n'y sont jamais exécutés
// (sandbox sans allow-scripts). Une fenêtre ouverte par window.open('') hériterait
// de l'origine du site et de son localStorage. allow-modals autorise print().

const FRAME_LIFETIME_MS = 120_000;

export function printInIsolatedFrame(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
  frame.onload = () => {
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), FRAME_LIFETIME_MS);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
