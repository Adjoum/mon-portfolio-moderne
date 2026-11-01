// Quatre accès directs sous le Hero (styles : home.css)
import { Link } from 'react-router-dom'
import { ArrowRight, FileText, FolderKanban, FlaskConical, Code2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavCard {
  to: string
  title: string
  description: string
  icon: LucideIcon
  gradient: string
}

const CARDS: NavCard[] = [
  {
    to: '/cv-generator',
    title: 'CV Generator Pro',
    description: 'Créez un CV professionnel : 8 modèles, design personnalisable, export PDF.',
    icon: FileText,
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  },
  {
    to: '/projects',
    title: 'Mes projets',
    description: 'Applications web, mobiles, data et IA que j’ai conçues et livrées.',
    icon: FolderKanban,
    gradient: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
  },
  {
    to: '/ai-lab',
    title: 'IA Lab',
    description: 'Expérimentations et démonstrations en intelligence artificielle.',
    icon: FlaskConical,
    gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
  },
  {
    to: '/skills',
    title: 'Mes compétences',
    description: 'Technologies, outils et domaines que je maîtrise au quotidien.',
    icon: Code2,
    gradient: 'linear-gradient(135deg, #10b981, #0ea5e9)',
  },
]

export default function HomeNavCards() {
  return (
    <nav aria-label="Accès rapides" className="container mx-auto px-5 sm:px-6 pb-16 sm:pb-20">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ to, title, description, icon: Icon, gradient }) => (
          <li key={to}>
            <Link to={to} className="hp-card">
              <span className="hp-card-icon" style={{ background: gradient }}>
                <Icon size={22} aria-hidden="true" />
              </span>
              <span className="flex items-center justify-between gap-3 text-base font-semibold text-white">
                {title}
                <ArrowRight size={18} className="hp-card-arrow text-violet-300 shrink-0" aria-hidden="true" />
              </span>
              <span className="text-sm leading-relaxed text-slate-300">{description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
