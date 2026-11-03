// Dessin d'une carte de l'accueil pour la surface du cylindre 3D (Canvas 2D, puis texture).
// Le texte reste aussi dans les vrais liens de HomeNavCards : la texture n'est qu'une image.
import type { HomeCard } from './homeCards'

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Attend Inter si la feuille de polices répond ; sinon la police système est utilisée */
export async function cardFontsReady() {
  await Promise.all(['400 52px Inter', '700 84px Inter'].map(font => document.fonts?.load(font).catch(() => null)))
}

/** Toutes les mesures sont rapportées à une largeur de 1100 px */
export function drawCard(card: HomeCard, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const k = width / 1100
  ctx.scale(k, k)
  const w = 1100
  const h = height / k
  const [from, to] = card.colors

  const inset = 5
  const shape = new Path2D()
  shape.roundRect(inset, inset, w - inset * 2, h - inset * 2, 56)

  const glass = ctx.createLinearGradient(0, 0, w * 0.6, h)
  glass.addColorStop(0, '#1b1c4b')
  glass.addColorStop(1, '#0d1226')
  ctx.fillStyle = glass
  ctx.fill(shape)

  // Lueur colorée, en haut à droite : la couleur de la carte, sans gêner le texte
  ctx.save()
  ctx.clip(shape)
  const glow = ctx.createRadialGradient(w * 0.9, 0, 0, w * 0.9, 0, w * 0.75)
  glow.addColorStop(0, `${to}66`)
  glow.addColorStop(1, `${to}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  const border = ctx.createLinearGradient(0, 0, w, h)
  border.addColorStop(0, `${from}cc`)
  border.addColorStop(0.55, 'rgba(165, 180, 252, 0.28)')
  border.addColorStop(1, `${to}aa`)
  ctx.strokeStyle = border
  ctx.lineWidth = 5
  ctx.stroke(shape)

  // Icône
  const tile = new Path2D()
  tile.roundRect(72, 72, 136, 136, 40)
  const tileFill = ctx.createLinearGradient(72, 72, 208, 208)
  tileFill.addColorStop(0, from)
  tileFill.addColorStop(1, to)
  ctx.fillStyle = tileFill
  ctx.fill(tile)
  ctx.save()
  ctx.translate(72 + 28, 72 + 28)
  ctx.scale(80 / 24, 80 / 24)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of card.iconPaths) ctx.stroke(new Path2D(d))
  ctx.restore()

  // Flèche
  ctx.save()
  ctx.translate(w - 72 - 64, 72 + 36)
  ctx.scale(64 / 24, 64 / 24)
  ctx.strokeStyle = '#c4b5fd'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D('M5 12h14'))
  ctx.stroke(new Path2D('m12 5 7 7-7 7'))
  ctx.restore()

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  ctx.font = `700 84px ${FONT}`
  ctx.fillText(card.title, 72, 352)

  ctx.fillStyle = '#cbd5e1'
  ctx.font = `400 52px ${FONT}`
  wrap(ctx, card.description, w - 144).slice(0, 3).forEach((line, i) => ctx.fillText(line, 72, 450 + i * 74))

  return canvas
}
