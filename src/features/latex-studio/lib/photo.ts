// Éditeur photo (P3).
//   Cadre : forme, largeur, hauteur, arrondi, bordure, position. Réglage du document, propre à chaque
//           modèle (options.photoFrames[modèle]) : il passe dans le code LaTeX et suit l'annulation.
//   Cadrage : zoom, rotation, déplacement. Appliqué à l'image dans le navigateur, en mémoire seulement.
// latex-runner n'accepte que du JPEG et n'autorise pas TikZ (politique de sécurité conservée) : la forme,
// l'arrondi et la bordure sont dessinés dans l'image, sur la couleur du fond où elle est posée (blanc, ou
// bandeau du modèle). Le réencodage élimine les métadonnées (EXIF, position GPS). La photo ne quitte le
// navigateur que pour la compilation et n'est jamais conservée en session ni sur un serveur.

export type PhotoShape = 'portrait' | 'square' | 'landscape' | 'circle' | 'free'

/** Rapport hauteur / largeur de chaque forme (null : libre) */
export const PHOTO_SHAPES: { id: PhotoShape; label: string; ratio: number | null }[] = [
  { id: 'portrait', label: 'Portrait', ratio: 45 / 35 },
  { id: 'square', label: 'Carré', ratio: 1 },
  { id: 'landscape', label: 'Paysage', ratio: 3 / 4 },
  { id: 'circle', label: 'Cercle', ratio: 1 },
  { id: 'free', label: 'Libre', ratio: null },
]

export interface PhotoFrame {
  shape: PhotoShape
  /** Largeur en cm */
  width: number
  /** Hauteur en cm (forme libre ; sinon déduite de la largeur) */
  height: number
  /** Arrondi des angles, en % du petit côté (0 à 50) ; sans effet sur le cercle */
  radius: number
  /** Épaisseur de la bordure en pt (0 : aucune) */
  border: number
  /** 'accent' (couleur du document) ou hexadécimal sans « # » */
  borderColor: string
  position: 'right' | 'left'
}

export const FRAME_BOUNDS = {
  width: { min: 2, max: 5, step: 0.1 },
  height: { min: 2, max: 6, step: 0.1 },
  radius: { min: 0, max: 50, step: 1 },
  border: { min: 0, max: 4, step: 0.25 },
} as const

export const DEFAULT_FRAME: PhotoFrame = { shape: 'portrait', width: 3.2, height: 4.1, radius: 0, border: 0, borderColor: 'accent', position: 'right' }

const bounded = (value: unknown, b: { min: number; max: number; step: number }, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const stepped = Math.round(Math.min(b.max, Math.max(b.min, n)) / b.step) * b.step
  return Number(stepped.toFixed(2))
}

/** Cadre relu et borné : valeurs inconnues ou hors limites remplacées, jamais d'injection dans le LaTeX */
export function sanitizeFrame(raw: unknown, base: PhotoFrame = DEFAULT_FRAME): PhotoFrame {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const shape = PHOTO_SHAPES.some(s => s.id === r.shape) ? r.shape as PhotoShape : base.shape
  const width = bounded(r.width, FRAME_BOUNDS.width, base.width)
  const ratio = PHOTO_SHAPES.find(s => s.id === shape)!.ratio
  const height = ratio === null ? bounded(r.height, FRAME_BOUNDS.height, base.height) : bounded(width * ratio, { ...FRAME_BOUNDS.height, min: 1, max: 7 }, base.height)
  const borderColor = r.borderColor === 'accent' || (typeof r.borderColor === 'string' && /^[0-9A-Fa-f]{6}$/.test(r.borderColor))
    ? (r.borderColor === 'accent' ? 'accent' : (r.borderColor as string).toUpperCase()) : base.borderColor
  return {
    shape, width, height,
    radius: bounded(r.radius, FRAME_BOUNDS.radius, base.radius),
    border: bounded(r.border, FRAME_BOUNDS.border, base.border),
    borderColor,
    position: r.position === 'left' || r.position === 'right' ? r.position : base.position,
  }
}

/** Cadre effectif d'un modèle : style du modèle, puis réglages de l'utilisateur pour ce modèle */
export function resolveFrame(templateDefault: Partial<PhotoFrame> | undefined, overrides: Partial<PhotoFrame> | undefined): PhotoFrame {
  return sanitizeFrame({ ...DEFAULT_FRAME, ...templateDefault, ...overrides })
}

const SHAPE_NAMES: Record<PhotoShape, string> = { portrait: 'portrait', square: 'carré', landscape: 'paysage', circle: 'cercle', free: 'libre' }
const cm = (n: number) => n.toFixed(1)

/** Résumé lisible du cadre, écrit en commentaire dans le code LaTeX */
export function frameSummary(f: PhotoFrame): string {
  const parts = [`${SHAPE_NAMES[f.shape]} ${cm(f.width)} × ${cm(f.height)} cm`]
  if (f.shape !== 'circle' && f.radius > 0) parts.push(`angles arrondis ${f.radius} %`)
  if (f.border > 0) parts.push(`bordure ${f.border} pt ${f.borderColor === 'accent' ? 'couleur d’accent' : `#${f.borderColor}`}`)
  parts.push(f.position === 'left' ? 'à gauche' : 'à droite')
  return parts.join(', ')
}

// ── Cadrage ───────────────────────────────────────────────────

/** Zoom (1 = l'image couvre juste le cadre), rotation en degrés, décalage en fraction du cadre */
export interface PhotoTransform { zoom: number; rotation: number; x: number; y: number }
export const IDENTITY: PhotoTransform = { zoom: 1, rotation: 0, x: 0, y: 0 }
export const ZOOM_MAX = 5

/** Échelle minimale (pixels source → pixels du cadre) pour que l'image tournée couvre tout le cadre */
export function coverScale(iw: number, ih: number, fw: number, fh: number, degrees: number): number {
  const t = (degrees * Math.PI) / 180
  const c = Math.abs(Math.cos(t))
  const s = Math.abs(Math.sin(t))
  return Math.max((fw * c + fh * s) / iw, (fw * s + fh * c) / ih)
}

/** Les quatre coins du cadre tombent-ils dans l'image (aucune zone vide) ? */
export function covers(t: PhotoTransform, iw: number, ih: number, fw: number, fh: number): boolean {
  const scale = coverScale(iw, ih, fw, fh, t.rotation) * t.zoom
  const a = (t.rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const eps = 1e-6
  for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = (cx * fw) / 2 - t.x * fw
    const py = (cy * fh) / 2 - t.y * fh
    const qx = (px * cos + py * sin) / scale
    const qy = (-px * sin + py * cos) / scale
    if (Math.abs(qx) > iw / 2 + eps || Math.abs(qy) > ih / 2 + eps) return false
  }
  return true
}

const normalizeAngle = (d: number) => {
  const r = ((d % 360) + 540) % 360 - 180
  return r === -180 ? 180 : Math.round(r * 10) / 10
}

/** Cadrage borné : zoom entre 1 et ZOOM_MAX, déplacement limité pour que l'image couvre toujours le cadre */
export function clampTransform(t: PhotoTransform, iw: number, ih: number, fw: number, fh: number): PhotoTransform {
  const finite = (n: number, f: number) => (Number.isFinite(n) ? n : f)
  const zoom = Math.min(ZOOM_MAX, Math.max(1, finite(t.zoom, 1)))
  const rotation = normalizeAngle(finite(t.rotation, 0))
  const x = finite(t.x, 0)
  const y = finite(t.y, 0)
  if (covers({ zoom, rotation, x, y }, iw, ih, fw, fh)) return { zoom, rotation, x, y }
  // Zone admissible convexe et contenant le centre : on recule vers le centre jusqu'à la limite
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (covers({ zoom, rotation, x: x * mid, y: y * mid }, iw, ih, fw, fh)) lo = mid
    else hi = mid
  }
  return { zoom, rotation, x: x * lo, y: y * lo }
}

// ── Rendu ─────────────────────────────────────────────────────

export const PHOTO_DPI = 300
const MAX_SIDE_PX = 1200
/** Taille de l'image produite : 300 dpi pour la taille imprimée, côté le plus long ≤ 1200 px */
export function photoPixels(f: PhotoFrame): { width: number; height: number } {
  const w = (f.width / 2.54) * PHOTO_DPI
  const h = (f.height / 2.54) * PHOTO_DPI
  const k = Math.min(1, MAX_SIDE_PX / Math.max(w, h))
  return { width: Math.round(w * k), height: Math.round(h * k) }
}

export interface PhotoColors { matte: string; border: string }

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function shapePath(ctx: Ctx, f: PhotoFrame, w: number, h: number, inset: number) {
  ctx.beginPath()
  if (f.shape === 'circle') {
    ctx.ellipse(w / 2, h / 2, Math.max(0, w / 2 - inset), Math.max(0, h / 2 - inset), 0, 0, Math.PI * 2)
    return
  }
  const x0 = inset
  const y0 = inset
  const x1 = w - inset
  const y1 = h - inset
  const r = Math.max(0, Math.min((Math.min(w, h) * f.radius) / 100 - inset, (x1 - x0) / 2, (y1 - y0) / 2))
  ctx.moveTo(x0 + r, y0)
  ctx.arcTo(x1, y0, x1, y1, r)
  ctx.arcTo(x1, y1, x0, y1, r)
  ctx.arcTo(x0, y1, x0, y0, r)
  ctx.arcTo(x0, y0, x1, y0, r)
  ctx.closePath()
}

/** Dessine la photo cadrée dans un contexte de w × h pixels (aperçu de l'éditeur et image finale) */
export function drawPhoto(ctx: Ctx, source: CanvasImageSource, sw: number, sh: number, t: PhotoTransform, f: PhotoFrame, w: number, h: number, colors: PhotoColors) {
  ctx.save()
  ctx.fillStyle = `#${colors.matte}`
  ctx.fillRect(0, 0, w, h)
  shapePath(ctx, f, w, h, 0)
  ctx.clip()
  const scale = coverScale(sw, sh, w, h, t.rotation) * t.zoom
  ctx.translate(w / 2 + t.x * w, h / 2 + t.y * h)
  ctx.rotate((t.rotation * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh)
  ctx.restore()
  if (f.border > 0) {
    // Épaisseur en points convertie en pixels de l'image (largeur imprimée connue)
    const px = (f.border * w) / ((f.width / 2.54) * 72.27)
    ctx.save()
    ctx.lineWidth = px
    ctx.strokeStyle = `#${colors.border}`
    shapePath(ctx, f, w, h, px / 2)
    ctx.stroke()
    ctx.restore()
  }
}

/** Plafond de latex-runner (2 Mo) avec une marge */
export const MAX_OUTPUT_BYTES = 1_800_000

/** Image finale : JPEG, qualité réduite si besoin pour rester sous la limite du service de compilation */
export async function renderPhotoJpeg(source: PhotoSource, t: PhotoTransform, f: PhotoFrame, colors: PhotoColors): Promise<string> {
  const { width, height } = photoPixels(f)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Dessin de la photo impossible dans ce navigateur.')
  drawPhoto(ctx, source.canvas, source.width, source.height, clampTransform(t, source.width, source.height, width, height), f, width, height, colors)
  for (const quality of [0.92, 0.85, 0.75, 0.6]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.startsWith('data:image/jpeg') && (url.length - url.indexOf(',') - 1) * 0.75 <= MAX_OUTPUT_BYTES) return url
  }
  throw new Error('Photo trop lourde après compression.')
}

// ── Fichier source ────────────────────────────────────────────

export const MAX_INPUT_BYTES = 15 * 1024 * 1024
export const MAX_INPUT_PIXELS = 50_000_000
export const MAX_INPUT_SIDE = 12_000
/** Copie de travail : côté le plus long ≤ 2000 px (mémoire bornée, largement assez pour 300 dpi) */
export const SOURCE_SIDE = 2000

export interface PhotoSource { canvas: HTMLCanvasElement; width: number; height: number }

/** Format reconnu par sa signature (le type annoncé par le navigateur ne suffit pas) */
export function sniffImage(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'webp'
  return null
}

export class PhotoError extends Error {}

/** Lecture d'une photo choisie : format vérifié, dimensions bornées, copie de travail réduite */
export async function loadPhotoSource(file: File): Promise<PhotoSource> {
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('Photo trop lourde : 15 Mo au maximum.')
  if (!sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()))) throw new PhotoError('Format non pris en charge : JPEG, PNG ou WebP uniquement.')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode().catch(() => { throw new PhotoError('Image illisible ou endommagée.') })
    // Orientation EXIF appliquée par le navigateur (image-orientation: from-image)
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    if (!iw || !ih) throw new PhotoError('Image illisible ou endommagée.')
    if (iw > MAX_INPUT_SIDE || ih > MAX_INPUT_SIDE || iw * ih > MAX_INPUT_PIXELS) throw new PhotoError('Image trop grande : 50 mégapixels au maximum.')
    if (Math.min(iw, ih) < 120) throw new PhotoError('Image trop petite : 120 pixels de côté au minimum.')
    const k = Math.min(1, SOURCE_SIDE / Math.max(iw, ih))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(iw * k)
    canvas.height = Math.round(ih * k)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new PhotoError('Dessin de la photo impossible dans ce navigateur.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { canvas, width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}
