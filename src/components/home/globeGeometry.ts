// Géométrie du globe : lecture des données compactes, points, frontières, arcs. Aucun import de three.js.
import { BORDERS, HOME_OUTLINE, LAND_H, LAND_RLE, LAND_W } from './globeData'

export type Vec3 = [number, number, number]

const RAD = Math.PI / 180

/** Latitude, longitude → sphère : y vers le nord, longitude 0 face à +z, est vers +x */
export function toVec3(lat: number, lon: number, radius = 1): Vec3 {
  const c = Math.cos(lat * RAD)
  return [radius * c * Math.sin(lon * RAD), radius * Math.sin(lat * RAD), radius * c * Math.cos(lon * RAD)]
}

function bytesOf(base64: string) {
  const text = atob(base64)
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
  return out
}

/** Lecteur d'entiers de longueur variable, 7 bits par octet */
function varints(bytes: Uint8Array) {
  let pos = 0
  return {
    more: () => pos < bytes.length,
    next() {
      let value = 0, unit = 1, byte = 0
      do {
        byte = bytes[pos++]
        value += (byte & 127) * unit
        unit *= 128
      } while (byte & 128)
      return value
    },
  }
}

/** Grille LAND_W × LAND_H : 0 pour l'océan, 1 à 7 pour le continent */
export function decodeLand(): Uint8Array {
  const grid = new Uint8Array(LAND_W * LAND_H)
  const reader = varints(bytesOf(LAND_RLE))
  let at = 0
  while (reader.more()) {
    const value = reader.next()
    const run = Math.floor(value / 8)
    grid.fill(value % 8, at, at + run)
    at += run
  }
  return grid
}

export const landAt = (grid: Uint8Array, lat: number, lon: number) => {
  const row = Math.min(LAND_H - 1, Math.floor(((90 - lat) * LAND_H) / 180))
  const col = Math.min(LAND_W - 1, Math.floor(((lon + 180) * LAND_W) / 360))
  return grid[row * LAND_W + col]
}

/** Polylignes, chacune sous la forme [lon, lat, lon, lat, …] */
function decodeLines(base64: string): number[][] {
  const reader = varints(bytesOf(base64))
  const unzig = (v: number) => (v % 2 ? -(v + 1) / 2 : v / 2)
  const lines: number[][] = []
  for (let n = reader.next(); n > 0; n--) {
    const line: number[] = []
    let x = 0, y = 0
    for (let k = reader.next(); k > 0; k--) {
      x += unzig(reader.next())
      y += unzig(reader.next())
      line.push(x / 10, y / 10)
    }
    lines.push(line)
  }
  return lines
}

export const decodeBorders = () => decodeLines(BORDERS)
export const decodeHomeOutline = () => decodeLines(HOME_OUTLINE)

/**
 * Segments à plat pour LineSegments. Les grands segments sont découpés en latitude et longitude :
 * une frontière droite sur la carte (49e parallèle) suit ainsi la sphère au lieu de la traverser.
 */
export function lineSegments(lines: number[][], radius: number, maxStepDeg = 3): Float32Array {
  const out: number[] = []
  for (const line of lines) {
    for (let i = 0; i + 3 < line.length; i += 2) {
      const [lon1, lat1, lon2, lat2] = [line[i], line[i + 1], line[i + 2], line[i + 3]]
      const steps = Math.max(1, Math.ceil(Math.hypot(lon2 - lon1, lat2 - lat1) / maxStepDeg))
      for (let s = 0; s < steps; s++) {
        const [a, b] = [s / steps, (s + 1) / steps]
        out.push(...toVec3(lat1 + (lat2 - lat1) * a, lon1 + (lon2 - lon1) * a, radius))
        out.push(...toVec3(lat1 + (lat2 - lat1) * b, lon1 + (lon2 - lon1) * b, radius))
      }
    }
  }
  return new Float32Array(out)
}

export const hexToRgb = (hex: string): Vec3 => {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

/** Points répartis régulièrement sur la sphère (suite de Fibonacci), gardés s'ils tombent sur une terre */
export function landDots(samples: number, grid: Uint8Array, palette: string[], radius = 1.0015) {
  const colors = palette.map(hexToRgb)
  const positions: number[] = []
  const tints: number[] = []
  const seeds: number[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < samples; i++) {
    const lat = Math.asin(1 - (2 * i + 1) / samples) / RAD
    const lon = ((i * golden) % (2 * Math.PI)) / RAD - 180
    const id = landAt(grid, lat, lon)
    if (!id) continue
    positions.push(...toVec3(lat, lon, radius))
    tints.push(...colors[id])
    seeds.push((i * 0.618034) % 1)
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(tints), seeds: new Float32Array(seeds) }
}

/** Arc de grand cercle au ras de la sphère : assez bas pour ne pas former de boucle autour du disque */
export function arcPoints(from: Vec3, to: Vec3, steps: number): Vec3[] {
  const dot = Math.max(-1, Math.min(1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2]))
  const angle = Math.acos(dot)
  const lift = 0.035 + 0.13 * (angle / Math.PI)
  const sin = Math.sin(angle) || 1
  const out: Vec3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = Math.sin((1 - t) * angle) / sin
    const b = Math.sin(t * angle) / sin
    const r = 1 + lift * Math.sin(Math.PI * t)
    out.push([(from[0] * a + to[0] * b) * r, (from[1] * a + to[1] * b) * r, (from[2] * a + to[2] * b) * r])
  }
  return out
}
