import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { ReactTyped } from 'react-typed'
import { ArrowRight, Download, Mail, Sparkles } from 'lucide-react'
import { SiGithub, SiLinkedin, SiFacebook, SiX } from 'react-icons/si'
import { fetchActiveCv } from '../lib/cvDocument'
import HeroBubbles from './home/HeroBubbles'
import HomeNavCards from './home/HomeNavCards'
import { useGreeting } from './home/useGreeting'
import './home/home.css'

const ROLES = [
  'Développeur Full Stack',
  'Data Analyst & Engineer',
  'Expert en Intelligence Artificielle',
  'Spécialiste Mobile Flutter & React Native',
  'Créateur de solutions de santé numérique',
]

const SOCIALS = [
  { label: 'GitHub',   icon: SiGithub,   href: 'https://github.com/Adjoum' },
  { label: 'LinkedIn', icon: SiLinkedin, href: 'https://www.linkedin.com/in/koffi-wilfried-adjoumani/' },
  { label: 'Facebook', icon: SiFacebook, href: 'https://web.facebook.com/profile.php?id=100084939496635' },
  { label: 'X',        icon: SiX,        href: 'https://x.com/home' },
  { label: 'E-mail',   icon: Mail,       href: 'mailto:contact@adjoumani-koffi.com' },
]

/** Télécharge la version active du CV (même source que la page /cv) ; repli sur /cv en cas d'erreur */
function DownloadCvButton() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const download = async () => {
    if (busy) return
    setBusy(true)
    try {
      const cv = await fetchActiveCv()
      if (cv.kind === 'error') return navigate('/cv')
      const link = document.createElement('a')
      link.href = cv.downloadUrl
      link.download = 'CV-Adjoumani.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      aria-busy={busy}
      className="hp-focus inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3 font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
    >
      <Download size={18} aria-hidden="true" />
      {busy ? 'Préparation…' : 'Télécharger mon CV'}
    </button>
  )
}

const Hero: React.FC = () => {
  const reduceMotion = useReducedMotion()
  const greeting = useGreeting()

  return (
    <section className="hp-hero" aria-labelledby="hero-title">
      <div className="hp-backdrop" aria-hidden="true" />

      <div className="container mx-auto grid items-center gap-8 px-5 pb-14 pt-28 sm:px-6 sm:pt-32 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-6 lg:pb-20 lg:pt-36">
        <div className="hp-content text-center lg:order-1 lg:text-left">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-200 backdrop-blur">
            <Sparkles size={15} className="text-violet-300" aria-hidden="true" />
            Bienvenue sur mon portfolio
          </p>

          <h1 id="hero-title" className="mb-5 text-[2.35rem] font-extrabold leading-[1.08] tracking-tight text-white min-[380px]:text-[2.6rem] sm:text-6xl xl:text-7xl">
            <span key={greeting.text} className={greeting.changed ? 'hp-greeting-in' : undefined}>{greeting.text}</span>, je suis <span className="gradient-text">Adjoumani</span>
          </h1>

          <p className="hp-typed mb-5 text-lg font-semibold text-indigo-200 sm:text-2xl">
            {reduceMotion ? (
              'Full Stack · Data · Intelligence artificielle · Santé numérique'
            ) : (
              <ReactTyped strings={ROLES} typeSpeed={45} backSpeed={25} backDelay={1800} loop />
            )}
          </p>

          <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg lg:mx-0">
            Étudiant en analyse de données à INP-HB/UVCI, je transforme des idées complexes en
            solutions digitales élégantes et performantes : applications web et mobiles, analyse de
            données et intelligence artificielle.
          </p>

          <div className="mb-8 flex flex-col items-stretch justify-center gap-3 min-[420px]:flex-row min-[420px]:items-center lg:justify-start">
            <Link
              to="/projects"
              className="hp-focus inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-7 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30 transition-transform hover:-translate-y-0.5"
            >
              Voir mes projets
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <DownloadCvButton />
          </div>

          <ul className="flex flex-wrap justify-center gap-3 lg:justify-start" aria-label="Réseaux et contact">
            {SOCIALS.map(({ label, icon: Icon, href }) => {
              const external = !href.startsWith('mailto:')
              return (
                <li key={label}>
                  <a
                    href={href}
                    aria-label={label}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="hp-focus flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition-colors hover:border-violet-400/50 hover:text-white"
                  >
                    <Icon size={18} aria-hidden="true" />
                  </a>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Bulles : décor derrière les textes ; à droite sur desktop, au-dessus du texte sur mobile.
            Après le texte dans le document (lecture et référencement), affichées en premier sur mobile. */}
        <div className="order-first lg:order-2 lg:py-10">
          <HeroBubbles reduceMotion={!!reduceMotion} />
        </div>
      </div>

      <HomeNavCards />
    </section>
  )
}

export default Hero
