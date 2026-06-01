import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface AnimatedPhotoFrameProps {
  src: string
  alt?: string
  /** Rayon des coins en px (doit matcher le rounded de ton cadre, ici rounded-3xl ≈ 24px) */
  radius?: number
  /** Hauteur max du cadre (CSS). Par défaut: min(78vh, 700px) */
  maxHeight?: string
}

type Particle = { x: number; y: number; vx: number; vy: number; r: number }

const PARTICLE_DESKTOP = 30
const PARTICLE_MOBILE = 14

const MARGIN = 38 // marge du calque voiture autour du cadre (px)
const GAP = 14    // distance entre le bord du cadre et la trajectoire de la voiture (px)

const STYLE_ID = 'apf-styles'
const CSS = `
.apf-wrap { position: relative; }
.apf-img-layer { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }

.apf-rgb { opacity:0; mix-blend-mode:screen; pointer-events:none; will-change:transform,opacity; }
.apf-wrap[data-hover="true"] .apf-rgb-r { animation: apf-glitch-r 3.2s infinite steps(1); }
.apf-wrap[data-hover="true"] .apf-rgb-c { animation: apf-glitch-c 3.2s infinite steps(1); }

@keyframes apf-glitch-r {
  0%,100% { opacity:0; transform:translate(0,0); }
  4%   { opacity:.55; transform:translate(3px,-2px); }
  6%   { opacity:0; transform:translate(0,0); }
  41%  { opacity:.45; transform:translate(-4px,1px); }
  43%  { opacity:0; }
  72%  { opacity:.5; transform:translate(2px,2px); }
  74%  { opacity:0; }
}
@keyframes apf-glitch-c {
  0%,100% { opacity:0; transform:translate(0,0); }
  4%   { opacity:.55; transform:translate(-3px,2px); }
  6%   { opacity:0; transform:translate(0,0); }
  41%  { opacity:.45; transform:translate(4px,-1px); }
  43%  { opacity:0; }
  72%  { opacity:.5; transform:translate(-2px,-2px); }
  74%  { opacity:0; }
}

.apf-base { transition: transform .6s cubic-bezier(.2,.7,.2,1), filter .6s ease; }
.apf-wrap[data-hover="true"] .apf-base { transform: scale(1.05); filter: saturate(1.15) contrast(1.05); }

.apf-grid {
  position:absolute; inset:0; pointer-events:none; opacity:0; transition:opacity .5s ease;
  background-image:
    linear-gradient(rgba(129,140,248,.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(129,140,248,.18) 1px, transparent 1px);
  background-size: 28px 28px; mix-blend-mode: screen;
  mask-image: radial-gradient(circle at var(--mx,50%) var(--my,50%), #000 0%, rgba(0,0,0,.15) 40%, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at var(--mx,50%) var(--my,50%), #000 0%, rgba(0,0,0,.15) 40%, transparent 70%);
}
.apf-wrap[data-hover="true"] .apf-grid { opacity:1; }

.apf-scan {
  position:absolute; left:0; right:0; height:14%; pointer-events:none; opacity:0;
  background: linear-gradient(180deg, transparent, rgba(199,210,254,.35), transparent);
  mix-blend-mode: screen;
}
.apf-wrap[data-hover="true"] .apf-scan { opacity:1; animation: apf-scan 2.6s linear infinite; }
@keyframes apf-scan { 0% { top:-14%; } 100% { top:100%; } }

@media (prefers-reduced-motion: reduce) {
  .apf-wrap[data-hover="true"] .apf-rgb-r,
  .apf-wrap[data-hover="true"] .apf-rgb-c,
  .apf-wrap[data-hover="true"] .apf-scan { animation: none; }
  .apf-base { transition: none; }
}
`

/** roundRect avec repli si non supporte par le navigateur */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (ctx as any).roundRect === 'function') {
    ;(ctx as any).roundRect(x, y, w, h, r)
    return
  }
  const rad = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

const AnimatedPhotoFrame: React.FC<AnimatedPhotoFrameProps> = ({
  src,
  alt = '',
  radius = 22,
  maxHeight = 'min(78vh, 700px)',
}) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const partCanvasRef = useRef<HTMLCanvasElement>(null) // particules (dans le cadre)
  const carCanvasRef = useRef<HTMLCanvasElement>(null)   // voiture (bord externe)
  const [hovering, setHovering] = useState(false)
  const [ratio, setRatio] = useState(9 / 16) // ratio L/H, mis a jour au chargement de l'image

  const sizeRef = useRef({ w: 0, h: 0 })
  const mouseRef = useRef({ x: -9999, y: -9999, inside: false })
  const particlesRef = useRef<Particle[]>([])
  const orbitRef = useRef(0)
  const trailRef = useRef<{ x: number; y: number }[]>([])
  const hiRef = useRef(0)
  const rafRef = useRef(0)
  const reduced = useRef(false)

  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }
  }, [])

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const wrap = wrapRef.current!
    const partCanvas = partCanvasRef.current!
    const carCanvas = carCanvasRef.current!
    const pctx = partCanvas.getContext('2d')!
    const cctx = carCanvas.getContext('2d')!
    const isMobile = window.matchMedia('(max-width: 640px)').matches
    const count = isMobile ? PARTICLE_MOBILE : PARTICLE_DESKTOP

    const seed = () => {
      const { w, h } = sizeRef.current
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.6 + 0.7,
      }))
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      sizeRef.current = { w: rect.width, h: rect.height }

      // canvas particules = taille du cadre
      partCanvas.width = Math.floor(rect.width * dpr)
      partCanvas.height = Math.floor(rect.height * dpr)
      partCanvas.style.width = rect.width + 'px'
      partCanvas.style.height = rect.height + 'px'
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // canvas voiture = cadre + marge (deborde a l'exterieur)
      const cw = rect.width + MARGIN * 2
      const ch = rect.height + MARGIN * 2
      carCanvas.width = Math.floor(cw * dpr)
      carCanvas.height = Math.floor(ch * dpr)
      carCanvas.style.width = cw + 'px'
      carCanvas.style.height = ch + 'px'
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (particlesRef.current.length === 0) seed()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    seed()

    // point + angle de tangente sur le perimetre d'un rectangle arrondi (sens horaire)
    const perimeter = (t: number, w: number, h: number, rad: number) => {
      const r = Math.min(rad, w / 2, h / 2)
      const sw = w - 2 * r
      const sh = h - 2 * r
      const arc = (Math.PI / 2) * r
      const total = 2 * sw + 2 * sh + 4 * arc
      let d = (((t % 1) + 1) % 1) * total
      if (d < sw) return { x: r + d, y: 0, angle: 0 }
      d -= sw
      if (d < arc) { const a = -Math.PI / 2 + (d / arc) * (Math.PI / 2); return { x: w - r + r * Math.cos(a), y: r + r * Math.sin(a), angle: a + Math.PI / 2 } }
      d -= arc
      if (d < sh) return { x: w, y: r + d, angle: Math.PI / 2 }
      d -= sh
      if (d < arc) { const a = (d / arc) * (Math.PI / 2); return { x: w - r + r * Math.cos(a), y: h - r + r * Math.sin(a), angle: a + Math.PI / 2 } }
      d -= arc
      if (d < sw) return { x: w - r - d, y: h, angle: Math.PI }
      d -= sw
      if (d < arc) { const a = Math.PI / 2 + (d / arc) * (Math.PI / 2); return { x: r + r * Math.cos(a), y: h - r + r * Math.sin(a), angle: a + Math.PI / 2 } }
      d -= arc
      if (d < sh) return { x: 0, y: h - r - d, angle: (3 * Math.PI) / 2 }
      d -= sh
      const a = Math.PI + (d / arc) * (Math.PI / 2)
      return { x: r + r * Math.cos(a), y: r + r * Math.sin(a), angle: a + Math.PI / 2 }
    }

    // dessin d'une petite voiture (vue de dessus), avant oriente vers +x
    const drawCar = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)

      // ombre douce
      ctx.fillStyle = 'rgba(0,0,0,.35)'
      ctx.beginPath()
      ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2)
      ctx.fill()

      // roues
      ctx.fillStyle = '#1b1730'
      const wheels: [number, number][] = [[-8, -8], [8, -8], [-8, 8], [8, 8]]
      for (const [wx, wy] of wheels) {
        ctx.beginPath()
        rr(ctx, wx - 3.5, wy - 2.5, 7, 5, 2)
        ctx.fill()
      }

      // carrosserie (degrade indigo -> rose)
      const grad = ctx.createLinearGradient(-13, 0, 13, 0)
      grad.addColorStop(0, '#6366f1')
      grad.addColorStop(1, '#ec4899')
      ctx.fillStyle = grad
      ctx.shadowColor = 'rgba(129,140,248,.9)'
      ctx.shadowBlur = 14
      ctx.beginPath()
      rr(ctx, -13, -7, 26, 14, 6)
      ctx.fill()
      ctx.shadowBlur = 0

      // pare-brise / cabine
      ctx.fillStyle = 'rgba(199,210,254,.85)'
      ctx.beginPath()
      rr(ctx, 0, -5, 8, 10, 3)
      ctx.fill()

      // phares avant
      ctx.fillStyle = '#fde68a'
      ctx.beginPath(); ctx.arc(12, -4, 1.6, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(12, 4, 1.6, 0, Math.PI * 2); ctx.fill()

      ctx.restore()
    }

    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(now - last, 50); last = now
      rafRef.current = requestAnimationFrame(frame)
      if (document.hidden) return

      const { w, h } = sizeRef.current
      if (w <= 1 || h <= 1) return // taille pas encore prete

      // calque particules (dans le cadre)
      pctx.clearRect(0, 0, w, h)
      const target = mouseRef.current.inside ? 1 : 0
      hiRef.current += (target - hiRef.current) * 0.08
      const hi = hiRef.current
      const sp = reduced.current ? 0.2 : 1
      const ps = particlesRef.current
      const mx = mouseRef.current.x, my = mouseRef.current.y

      for (const p of ps) {
        p.x += p.vx * dt * 0.06 * sp
        p.y += p.vy * dt * 0.06 * sp
        if (hi > 0.01) {
          const dx = mx - p.x, dy = my - p.y
          const dist = Math.hypot(dx, dy)
          if (dist < 170 && dist > 0.001) {
            const f = (1 - dist / 170) * 0.0006 * hi * dt
            p.vx += dx * f; p.vy += dy * f
          }
        }
        p.vx *= 0.985; p.vy *= 0.985
        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) }
        if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx) }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) }
        if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy) }
      }
      const link = 110, baseA = 0.05 + hi * 0.22
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y
          const dist = Math.hypot(dx, dy)
          if (dist < link) {
            pctx.strokeStyle = `rgba(129,140,248,${(1 - dist / link) * baseA})`
            pctx.lineWidth = 1
            pctx.beginPath(); pctx.moveTo(ps[i].x, ps[i].y); pctx.lineTo(ps[j].x, ps[j].y); pctx.stroke()
          }
        }
      }
      if (hi > 0.02) {
        for (const p of ps) {
          const dist = Math.hypot(p.x - mx, p.y - my)
          if (dist < 160) {
            pctx.strokeStyle = `rgba(236,72,153,${(1 - dist / 160) * 0.5 * hi})`
            pctx.lineWidth = 1
            pctx.beginPath(); pctx.moveTo(p.x, p.y); pctx.lineTo(mx, my); pctx.stroke()
          }
        }
      }
      for (const p of ps) {
        pctx.beginPath()
        pctx.fillStyle = `rgba(165,180,252,${0.45 + hi * 0.45})`
        pctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        pctx.fill()
      }
      if (hi > 0.02) {
        pctx.beginPath()
        pctx.shadowColor = 'rgba(236,72,153,.9)'; pctx.shadowBlur = 18 * hi
        pctx.fillStyle = `rgba(236,72,153,${0.85 * hi})`
        pctx.arc(mx, my, 3.5, 0, Math.PI * 2); pctx.fill()
        pctx.shadowBlur = 0
      }

      // calque voiture (bord externe, non rogne)
      const cw = w + MARGIN * 2, ch = h + MARGIN * 2
      cctx.clearRect(0, 0, cw, ch)
      orbitRef.current += (reduced.current ? 0 : dt) * 0.00011
      const pathW = w + GAP * 2, pathH = h + GAP * 2
      const off = MARGIN - GAP
      const pt = perimeter(orbitRef.current, pathW, pathH, radius + GAP)
      const ox = pt.x + off, oy = pt.y + off

      // trainee lumineuse
      const trail = trailRef.current
      trail.push({ x: ox, y: oy })
      if (trail.length > 18) trail.shift()
      for (let i = 0; i < trail.length; i++) {
        const a = i / trail.length
        cctx.beginPath()
        cctx.fillStyle = `rgba(99,102,241,${a * 0.4})`
        cctx.arc(trail[i].x, trail[i].y, a * 3, 0, Math.PI * 2)
        cctx.fill()
      }
      drawCar(cctx, ox, oy, pt.angle)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [radius])

  const updatePointer = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    const x = clientX - rect.left, y = clientY - rect.top
    mouseRef.current.x = x; mouseRef.current.y = y
    wrapRef.current!.style.setProperty('--mx', `${(x / rect.width) * 100}%`)
    wrapRef.current!.style.setProperty('--my', `${(y / rect.height) * 100}%`)
  }
  const enter = () => { mouseRef.current.inside = true; setHovering(true) }
  const leave = () => { mouseRef.current.inside = false; setHovering(false) }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="relative w-fit mx-auto"
    >
      {/* halo lumineux derriere le cadre */}
      <div
        className="absolute -inset-4 rounded-[2rem] blur-2xl opacity-60 pointer-events-none"
        style={{ background: 'conic-gradient(from 0deg, rgba(99,102,241,.35), rgba(236,72,153,.35), rgba(34,211,238,.35), rgba(99,102,241,.35))' }}
      />

      {/* cadre : ratio adaptatif a la photo, plein visage visible */}
      <div
        ref={wrapRef}
        data-hover={hovering}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onMouseMove={(e) => updatePointer(e.clientX, e.clientY)}
        onTouchStart={(e) => { enter(); const t = e.touches[0]; updatePointer(t.clientX, t.clientY) }}
        onTouchMove={(e) => { const t = e.touches[0]; updatePointer(t.clientX, t.clientY) }}
        onTouchEnd={leave}
        className="apf-wrap relative z-10 rounded-3xl overflow-hidden border border-white/10"
        style={{ aspectRatio: String(ratio), height: maxHeight, maxWidth: '100%', width: 'auto' }}
      >
        <img
          src={src}
          alt={alt}
          className="apf-img-layer apf-base"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth && img.naturalHeight) {
              setRatio(img.naturalWidth / img.naturalHeight)
            }
          }}
        />
        <img src={src} alt="" aria-hidden className="apf-img-layer apf-base apf-rgb apf-rgb-r" draggable={false} style={{ filter: 'url(#apf-red)' }} />
        <img src={src} alt="" aria-hidden className="apf-img-layer apf-base apf-rgb apf-rgb-c" draggable={false} style={{ filter: 'url(#apf-cyan)' }} />

        <div className="apf-grid" />
        <div className="apf-scan" />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-transparent to-transparent pointer-events-none" />
        <canvas ref={partCanvasRef} className="absolute inset-0 pointer-events-none" />

        
      </div>

      {/* calque voiture : deborde le cadre, jamais rogne */}
      <canvas
        ref={carCanvasRef}
        className="absolute z-20 pointer-events-none"
        style={{ top: -MARGIN, left: -MARGIN }}
      />

      {/* filtres SVG separation chromatique */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="apf-red">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
        </filter>
        <filter id="apf-cyan">
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
        </filter>
      </svg>
    </motion.div>
  )
}

export default AnimatedPhotoFrame