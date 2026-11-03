#!/usr/bin/env node
// P8.3 — Génère src/components/home/globeData.ts : données compactes du globe de l'accueil.
//
//   Source : Natural Earth (domaine public), via world-atlas 2.0.2 (ISC) et topojson-client 3.1.0 (ISC).
//   Ces deux paquets ne servent qu'à cette génération : ils ne sont ni dans package.json ni dans le bundle.
//
//     npm i --prefix <dossier hors dépôt> world-atlas@2.0.2 topojson-client@3.1.0
//     GEO_DIR=<dossier hors dépôt> node scripts/generate-globe-data.mjs
//
// Sortie, en base 64 :
//   - LAND_RLE : grille 720 × 360 (0,5°), 0 = océan, 1 à 7 = continent (voir CONTINENTS), comprimée par plages ;
//   - BORDERS : frontières terrestres (1:110m), au dixième de degré ;
//   - HOME_OUTLINE : contour de la Côte d'Ivoire (1:50m).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.GEO_DIR) {
  console.error('GEO_DIR requis (dossier contenant node_modules/world-atlas et topojson-client)');
  process.exit(2);
}
const require = createRequire(path.join(process.env.GEO_DIR, 'noop.js'));
const { feature, mesh } = require('topojson-client');
const fine = require('world-atlas/countries-50m.json');
const coarse = require('world-atlas/countries-110m.json');

const W = 720;
const H = 360;
const IVORY_COAST = '384';

// Découpage volontairement simple : il ne sert qu'à teinter les points de chaque continent.
const NONE = 0, AFRICA = 1, EUROPE = 2, ASIA = 3, NORTH_AMERICA = 4, SOUTH_AMERICA = 5, OCEANIA = 6, ANTARCTICA = 7;
function continentOf(lon, lat) {
  if (lat < -60) return ANTARCTICA;
  if (lon < -168 && lat > 50) return ASIA; // Tchoukotka, à l'est de l'antiméridien
  if (lon < -25 || (lat > 69 && lon < -10)) { // Groenland compris
    // Isthme de Panama : frontière Colombie–Panama vers 77,3° O ; Caraïbes au nord
    const south = lat < 12.6 && lon > -82.6 && (lat < 7.2 || lon > -77.4);
    return south ? SOUTH_AMERICA : NORTH_AMERICA;
  }
  if (lon > 170 || lon < -168) return lat > 0 ? ASIA : OCEANIA;
  // Mer Rouge, de Suez (32,5° E ; 30° N) à Bab-el-Mandeb (43,4° E ; 12,6° N)
  const redSeaLon = 32.5 + ((30 - lat) * (43.4 - 32.5)) / (30 - 12.6);
  const westOfRedSea = lat >= 12.6 ? lon < redSeaLon : lon < 52;
  if (lat < 37.6 && lon < 52 && westOfRedSea && lon > -25) return AFRICA;
  if (lat > 35.8 && lon < 26.5) return EUROPE;
  if (lat > 41.2 && lon < 60 && !(lat < 44 && lon > 40)) return EUROPE; // Oural, Caucase
  if (lon > 110 && (lat < -10.6 || (lon > 141 && lat < 0))) return OCEANIA; // Australie, Nouvelle-Guinée orientale
  return ASIA;
}

/**
 * Les polygones de world-atlas sont recousus à l'antiméridien : la longitude y saute de +180 à -180
 * (Russie, Fidji) et l'Antarctique entoure le pôle sans jamais le toucher. On rend chaque contour
 * continu, puis on ferme par le pôle celui qui en fait le tour : le remplissage à plat devient juste.
 */
function unwrap(ring) {
  const out = [[...ring[0]]];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    const previous = out[i - 1][0];
    while (lon - previous > 180) lon -= 360;
    while (lon - previous < -180) lon += 360;
    out.push([lon, ring[i][1]]);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.abs(last[0] - first[0]) > 180) {
    const pole = first[1] < 0 ? -90 : 90;
    out.push([last[0], pole], [first[0], pole], [...first]);
  }
  return out;
}

/** Remplit un polygone (règle pair-impair) : centre de chaque cellule de la grille */
function rasterize(polygon, grid) {
  const rings = polygon.map(unwrap);
  for (let row = 0; row < H; row++) {
    const lat = 90 - (row + 0.5) / 2;
    const cuts = [];
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        if ((y1 > lat) !== (y2 > lat)) cuts.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const first = Math.ceil((cuts[i] + 180) * 2 - 0.5);
      const last = Math.floor((cuts[i + 1] + 180) * 2 - 0.5);
      for (let c = first; c <= last; c++) {
        const col = ((c % W) + W) % W; // contour déroulé au-delà de ±180°
        grid[row * W + col] = continentOf(col / 2 - 180 + 0.25, lat);
      }
    }
  }
}

const varint = (out, value) => {
  while (value > 127) { out.push((value & 127) | 128); value = Math.floor(value / 128); }
  out.push(value);
};
const zigzag = v => (v < 0 ? -2 * v - 1 : 2 * v);

const grid = new Uint8Array(W * H).fill(NONE);
const countries = feature(fine, fine.objects.countries).features;
for (const country of countries) {
  const g = country.geometry;
  if (!g) continue;
  for (const polygon of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) rasterize(polygon, grid);
}

const land = [];
for (let i = 0; i < grid.length;) {
  let j = i;
  while (j < grid.length && grid[j] === grid[i]) j++;
  varint(land, (j - i) * 8 + grid[i]);
  i = j;
}

/** Polylignes [[lon, lat], …] : nombre de points, puis écarts au dixième de degré */
function encodeLines(lines) {
  const out = [];
  varint(out, lines.length);
  for (const line of lines) {
    varint(out, line.length);
    let px = 0, py = 0;
    for (const [lon, lat] of line) {
      const x = Math.round(lon * 10), y = Math.round(lat * 10);
      varint(out, zigzag(x - px));
      varint(out, zigzag(y - py));
      px = x; py = y;
    }
  }
  return out;
}

const borders = mesh(coarse, coarse.objects.countries, (a, b) => a !== b).coordinates;
const ivory = countries.find(c => c.id === IVORY_COAST);
if (!ivory) throw new Error('Côte d’Ivoire absente des données');
const outline = ivory.geometry.type === 'Polygon' ? ivory.geometry.coordinates : ivory.geometry.coordinates.flat();

const b64 = bytes => Buffer.from(bytes).toString('base64');
const out = `// Généré par scripts/generate-globe-data.mjs : ne pas modifier à la main.
// Source : Natural Earth (domaine public), via world-atlas 2.0.2.
export const LAND_W = ${W}
export const LAND_H = ${H}
export const LAND_RLE = '${b64(land)}'
export const BORDERS = '${b64(encodeLines(borders))}'
export const HOME_OUTLINE = '${b64(encodeLines(outline))}'
`;
fs.writeFileSync(path.join(ROOT, 'src/components/home/globeData.ts'), out);
const counts = {};
for (const v of grid) counts[v] = (counts[v] ?? 0) + 1;
console.log(`globeData.ts : ${(out.length / 1024).toFixed(1)} Ko — grille ${(land.length / 1024).toFixed(1)} Ko, frontières ${borders.length} lignes ; cellules par continent ${JSON.stringify(counts)}`);
