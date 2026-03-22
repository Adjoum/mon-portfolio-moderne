// src/hooks/useTextMeasure.js
// ─────────────────────────────────────────────────────────────
//  Mesure la largeur réelle d'un texte SVG via un élément
//  <text> caché. Cache les résultats pour éviter les reflows.
//  Usage: const measure = useTextMeasure(); measure('Hello', 13, 600)
// ─────────────────────────────────────────────────────────────
import { useRef, useCallback, useEffect } from 'react';

const cache = new Map();
const MAX_CACHE = 500;

export function useTextMeasure() {
  const svgRef  = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    // Create a hidden SVG used exclusively for measurement
    const svg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    svg.style.cssText = 'position:absolute;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none';
    svg.appendChild(text);
    document.body.appendChild(svg);
    svgRef.current  = svg;
    textRef.current = text;
    return () => { document.body.removeChild(svg); };
  }, []);

  /**
   * @param {string} str
   * @param {number} fontSize   — in px
   * @param {number} fontWeight — e.g. 600
   * @param {string} fontFamily — default 'Syne, sans-serif'
   * @returns {number} width in px
   */
  const measure = useCallback((str, fontSize = 13, fontWeight = 600, fontFamily = 'Syne, sans-serif') => {
    if (!str) return 0;
    const key = `${str}::${fontSize}::${fontWeight}::${fontFamily}`;
    if (cache.has(key)) return cache.get(key);

    const text = textRef.current;
    if (!text) {
      // Fallback: ~7.5px per char at 13px Syne
      return str.length * (fontSize * 0.575);
    }

    text.setAttribute('font-size',   String(fontSize));
    text.setAttribute('font-weight', String(fontWeight));
    text.setAttribute('font-family', fontFamily);
    text.textContent = str;

    const width = text.getComputedTextLength();

    // Evict if cache too large
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(key, width);
    return width;
  }, []);

  return measure;
}

/**
 * Standalone utility (no hook needed) for use outside React.
 * Uses a shared singleton element.
 */
let _sharedSvg  = null;
let _sharedText = null;
function ensureShared() {
  if (_sharedSvg) return;
  _sharedSvg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  _sharedText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  _sharedSvg.style.cssText = 'position:absolute;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none';
  _sharedSvg.appendChild(_sharedText);
  document.body.appendChild(_sharedSvg);
}

export function measureText(str, fontSize = 13, fontWeight = 600) {
  const key = `${str}::${fontSize}::${fontWeight}`;
  if (cache.has(key)) return cache.get(key);
  try {
    ensureShared();
    _sharedText.setAttribute('font-size',   String(fontSize));
    _sharedText.setAttribute('font-weight', String(fontWeight));
    _sharedText.setAttribute('font-family', 'Syne, sans-serif');
    _sharedText.textContent = str;
    const w = _sharedText.getComputedTextLength();
    cache.set(key, w);
    return w;
  } catch {
    return str.length * (fontSize * 0.575);
  }
}
