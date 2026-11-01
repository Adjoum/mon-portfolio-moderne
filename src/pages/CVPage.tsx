import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Mail, Phone, MapPin, Globe, Github, Linkedin, Briefcase, GraduationCap, Award, Code, Eye, RefreshCw, FileText, ShieldCheck } from 'lucide-react'
import { fetchActiveCv, type CvResolution } from '../lib/cvDocument'
import { PdfPreview } from '../features/latex-studio/components/PdfPreview'
import { Dialog } from '../features/latex-studio/components/Dialog'

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; cv: Exclude<CvResolution, { kind: 'error' }>; pdf: Blob; url: string }

const SPECIALTIES = ['Full Stack', 'Data', 'IA / ML', 'Santé numérique']

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Version active du CV (rpc cv_active, jamais mise en cache), téléchargée une seule fois : l'aperçu
 * et le bouton « Télécharger » utilisent exactement ce fichier. Son empreinte est comparée à celle de
 * la version publiée : un fichier différent n'est jamais affiché en silence.
 */
async function loadActiveCv(): Promise<Loaded> {
  const cv = await fetchActiveCv()
  if (cv.kind === 'error') return { state: 'error', message: 'Le CV est momentanément indisponible.' }
  const res = await fetch(cv.viewUrl, { cache: 'no-store' }).catch(() => null)
  if (!res?.ok) return { state: 'error', message: 'Le fichier du CV n’a pas pu être chargé.' }
  const pdf = await res.blob()
  if (cv.kind === 'active' && cv.version.sha256 && (crypto?.subtle ? (await sha256Hex(pdf)) !== cv.version.sha256 : false)) {
    return { state: 'error', message: 'Le fichier reçu ne correspond pas à la version publiée du CV.' }
  }
  return { state: 'ready', cv, pdf: pdf.type === 'application/pdf' ? pdf : new Blob([pdf], { type: 'application/pdf' }), url: URL.createObjectURL(pdf) }
}

const CVPage: React.FC = () => {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  const viewButton = useRef<HTMLButtonElement>(null)
  // Safari ne donne pas le focus à un bouton cliqué : il est rendu explicitement à la fermeture
  const closeViewer = () => {
    setShowPdfViewer(false)
    requestAnimationFrame(() => viewButton.current?.focus())
  }

  // Version active lue en base à chaque visite : même CV pour tous, sur tous les appareils
  const loadCv = useCallback(() => {
    setLoaded({ state: 'loading' })
    void loadActiveCv().then(setLoaded).catch(() => setLoaded({ state: 'error', message: 'Le CV est momentanément indisponible.' }))
  }, [])
  useEffect(loadCv, [loadCv])
  useEffect(() => () => { if (loaded.state === 'ready') URL.revokeObjectURL(loaded.url) }, [loaded])

  // Téléchargement du fichier exactement affiché
  const handleDownload = () => {
    if (loaded.state !== 'ready') return
    const link = document.createElement('a')
    link.href = loaded.url
    link.download = 'CV-Adjoumani.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const versionLabel = loaded.state === 'ready'
    ? loaded.cv.kind === 'active'
      ? `Version en ligne du ${new Date(loaded.cv.version.activated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'Version de référence'
    : ''

  const experiences = [
    {
      period: '2024 - Présent',
      title: 'Développeur Full Stack',
      company: 'Les Experts en Solutions Digitales (LESD)',
      location: 'Yamoussoukro, CI',
      responsibilities: [
        'Développement de solutions web et mobile complètes',
        'Intégration de modèles d\'IA dans les applications',
        'Gestion de projets clients de A à Z',
        'Architecture et déploiement d\'applications'
      ]
    },
    {
      period: '2023 - 2024',
      title: 'Développeur Web & Mobile',
      company: 'Projets Freelance',
      location: 'Côte d\'Ivoire',
      responsibilities: [
        'Développement d\'applications React et Flutter',
        'Création de plateformes web avec Node.js',
        'Intégration d\'APIs et services cloud',
        'Optimisation des performances applications'
      ]
    }
  ]

  const education = [
    {
      period: '2022 - 2025',
      degree: 'Licence en Analyse de Données Industrielles',
      institution: 'Institut National Polytechnique Houphouët-Boigny',
      location: 'Yamoussoukro, CI',
      details: [
        'Analyse statistique et machine learning',
        'Programmation et bases de données',
        'Systèmes industriels et IoT',
        'Visualisation de données'
      ]
    }
  ]

  const certifications = [
    'TensorFlow Developer Certificate',
    'AWS Cloud Practitioner',
    'MongoDB Developer',
    'Flutter Development Bootcamp',
    'Google AI Certification',
    'Data Science Specialization'
  ]

  const technicalSkills = {
    'Langages': ['JavaScript/TypeScript', 'Python', 'Dart', 'SQL', 'HTML/CSS'],
    'Frontend': ['React', 'Vue.js', 'Next.js', 'Tailwind CSS', 'Framer Motion'],
    'Backend': ['Node.js', 'Express', 'FastAPI', 'Django', 'GraphQL'],
    'Mobile': ['Flutter', 'React Native', 'Firebase'],
    'IA & Data': ['TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn'],
    'Database': ['PostgreSQL', 'MongoDB', 'Redis', 'Supabase'],
    'DevOps': ['Docker', 'Git', 'CI/CD', 'AWS', 'Vercel', 'Heroku']
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen px-4 pb-20 pt-28 sm:px-6 sm:pt-32"
    >
      <div className="container mx-auto max-w-6xl">
        {/* ── Identité et actions ── */}
        <section aria-labelledby="cv-title" className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/80 via-slate-900/80 to-violet-950/70 p-6 shadow-2xl shadow-indigo-950/40 sm:p-10">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-200">
              <FileText size={15} className="text-violet-300" aria-hidden="true" /> Curriculum Vitae
            </p>
            <h1 id="cv-title" className="mb-3 text-3xl font-extrabold leading-tight text-white sm:text-5xl">
              Koffi Wilfried <span className="gradient-text">Adjoumani</span>
            </h1>
            <p className="mb-5 text-lg text-slate-300">Développeur Full Stack • IA Specialist • Data Analyst</p>
            <ul className="mb-6 flex flex-wrap gap-2" aria-label="Spécialités">
              {SPECIALTIES.map(s => (
                <li key={s} className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-sm font-semibold text-indigo-100">{s}</li>
              ))}
            </ul>
            <ul className="mb-7 grid gap-3 text-slate-300 sm:grid-cols-2" aria-label="Coordonnées">
              <li className="flex items-center gap-3"><Mail className="shrink-0 text-primary" size={19} aria-hidden="true" /><a href="mailto:contact@adjoumani-koffi.com" className="break-all hover:text-white">contact@adjoumani-koffi.com</a></li>
              <li className="flex items-center gap-3"><Phone className="shrink-0 text-primary" size={19} aria-hidden="true" /><a href="tel:+2250778288868" className="hover:text-white">+225 07 78 28 88 68</a></li>
              <li className="flex items-center gap-3"><MapPin className="shrink-0 text-primary" size={19} aria-hidden="true" /><span>San-Pedro, Côte d'Ivoire</span></li>
              <li className="flex items-center gap-3"><Globe className="shrink-0 text-primary" size={19} aria-hidden="true" />
                <a href="https://les-experts-en-solutions-digitales.com/" target="_blank" rel="noopener noreferrer" className="hover:text-white">adjoumani.com</a></li>
            </ul>
            <div className="flex flex-col gap-3 min-[460px]:flex-row min-[460px]:flex-wrap min-[460px]:items-center">
              <button
                type="button"
                onClick={handleDownload}
                disabled={loaded.state !== 'ready'}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-7 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              >
                <Download size={19} aria-hidden="true" /> Télécharger le CV
              </button>
              <button
                ref={viewButton}
                type="button"
                onClick={() => setShowPdfViewer(true)}
                disabled={loaded.state !== 'ready'}
                aria-haspopup="dialog"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3 font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              >
                <Eye size={19} aria-hidden="true" /> Voir en grand
              </button>
              <div className="flex gap-2">
                <a href="https://github.com/Adjoum" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:text-white"><Github size={19} aria-hidden="true" /></a>
                <a href="https://www.linkedin.com/in/koffi-wilfried-adjoumani/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:text-white"><Linkedin size={19} aria-hidden="true" /></a>
              </div>
            </div>
            {versionLabel && (
              <p className="mt-4 flex items-center gap-2 text-sm text-emerald-200/90">
                <ShieldCheck size={16} aria-hidden="true" /> {versionLabel}
              </p>
            )}
          </div>
        </section>

        {/* ── Aperçu du CV (toutes les pages, pdf.js) ── */}
        <section aria-label="Aperçu du CV" className="mb-12 overflow-hidden rounded-3xl border border-white/10 bg-[#13161d] shadow-2xl shadow-black/40">
          {loaded.state === 'loading' && (
            <div role="status" aria-label="Chargement du CV" className="flex h-[60vh] flex-col items-center justify-center gap-4 p-6">
              <div className="aspect-[1/1.414] w-full max-w-sm animate-pulse rounded-lg bg-white/5" aria-hidden="true" />
              <p className="text-slate-400">Chargement de la dernière version du CV…</p>
            </div>
          )}
          {loaded.state === 'error' && (
            <div role="alert" className="flex flex-col items-center justify-center gap-4 p-10 text-center">
              <p className="text-amber-200">{loaded.message}</p>
              <button type="button" onClick={loadCv} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-white hover:bg-white/10">
                <RefreshCw size={16} aria-hidden="true" /> Réessayer
              </button>
            </div>
          )}
          {loaded.state === 'ready' && (
            <div className="flex h-[78vh] min-h-[480px] flex-col sm:h-[85vh]">
              <PdfPreview pdf={loaded.pdf} url={loaded.url} dimmed={false} onDownload={handleDownload} />
            </div>
          )}
        </section>

        {/* ── Parcours en bref (texte, lisible sans ouvrir le PDF) ── */}
        <section aria-labelledby="parcours-title">
          <h2 id="parcours-title" className="mb-6 text-2xl font-bold text-white sm:text-3xl">Parcours en bref</h2>
            <div className="glass-effect-dark rounded-3xl p-6 sm:p-10">
              {/* Summary */}
              <div className="mb-12">
                <h3 className="text-2xl font-bold gradient-text mb-4 flex items-center gap-3">
                  <Code size={24} />
                  Profil
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  Développeur Full Stack passionné et étudiant en analyse de données industrielles à l'INP-HB, 
                  avec une expertise approfondie en développement web (React, Node.js), développement mobile (Flutter), 
                  intelligence artificielle et analyse de données. Expérience avérée dans la création de solutions 
                  digitales innovantes pour divers clients. Forte capacité d'apprentissage et d'adaptation aux 
                  nouvelles technologies. Recherche d'opportunités pour contribuer à des projets ambitieux et 
                  stimulants.
                </p>
              </div>

              {/* Experience */}
              <div className="mb-12">
                <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
                  <Briefcase size={24} />
                  Expérience Professionnelle
                </h3>
                <div className="space-y-8">
                  {experiences.map((exp, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.1 }}
                      viewport={{ once: true }}
                      className="relative pl-8 border-l-2 border-primary/30"
                    >
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary" />
                      <p className="text-sm text-primary font-semibold mb-1">{exp.period}</p>
                      <h4 className="text-xl font-bold text-white mb-1">{exp.title}</h4>
                      <p className="text-gray-400 mb-3">
                        {exp.company} • {exp.location}
                      </p>
                      <ul className="space-y-2">
                        {exp.responsibilities.map((resp, i) => (
                          <li key={i} className="text-gray-300 flex items-start gap-2">
                            <span className="text-primary mt-1.5">•</span>
                            <span>{resp}</span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Education */}
              <div className="mb-12">
                <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
                  <GraduationCap size={24} />
                  Formation
                </h3>
                {education.map((edu, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="relative pl-8 border-l-2 border-secondary/30"
                  >
                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-secondary" />
                    <p className="text-sm text-secondary font-semibold mb-1">{edu.period}</p>
                    <h4 className="text-xl font-bold text-white mb-1">{edu.degree}</h4>
                    <p className="text-gray-400 mb-3">
                      {edu.institution} • {edu.location}
                    </p>
                    <ul className="space-y-2">
                      {edu.details.map((detail, i) => (
                        <li key={i} className="text-gray-300 flex items-start gap-2">
                          <span className="text-secondary mt-1.5">•</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>

              {/* Technical Skills */}
              <div className="mb-12">
                <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
                  <Code size={24} />
                  Compétences Techniques
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {Object.entries(technicalSkills).map(([category, skills], index) => (
                    <motion.div
                      key={category}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.1 }}
                      viewport={{ once: true }}
                      className="glass-effect p-4 rounded-xl"
                    >
                      <h4 className="font-bold text-white mb-3">{category}</h4>
                      <div className="flex flex-wrap gap-2">
                        {skills.map((skill, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-white/5 rounded-full text-sm text-gray-300"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Certifications */}
              <div>
                <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
                  <Award size={24} />
                  Certifications
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {certifications.map((cert, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: index * 0.05 }}
                      viewport={{ once: true }}
                      className="flex items-center gap-3 text-gray-300"
                    >
                      <Award className="text-accent flex-shrink-0" size={20} />
                      <span>{cert}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
        </section>
      </div>

      {/* Visionneuse plein écran : dialogue accessible (Échap, focus piégé puis rendu) */}
      {showPdfViewer && loaded.state === 'ready' && (
        <Dialog wide title="Curriculum Vitae — Koffi Wilfried Adjoumani" onClose={closeViewer}>
          <div className="-mx-4 -my-4 flex h-[calc(100dvh-64px)] flex-col sm:h-[82vh]">
            <PdfPreview pdf={loaded.pdf} url={loaded.url} dimmed={false} onDownload={handleDownload} />
          </div>
        </Dialog>
      )}
    </motion.div>
  )
}

export default CVPage

















// import React, { useState } from 'react'
// import { motion } from 'framer-motion'
// import { Download, Mail, Phone, MapPin, Globe, Github, Linkedin, Briefcase, GraduationCap, Award, Code } from 'lucide-react'

// const CVPage: React.FC = () => {
//   const [downloading, setDownloading] = useState(false)

//   const handleDownload = () => {
//     setDownloading(true)
//     // Simuler le téléchargement
//     setTimeout(() => {
//       setDownloading(false)
//       // Ajouter ici la logique réelle de téléchargement
//       alert('Le téléchargement du CV va démarrer...')
//     }, 1000)
//   }

//   const experiences = [
//     {
//       period: '2024 - Présent',
//       title: 'Développeur Full Stack',
//       company: 'Les Experts en Solutions Digitales (LESD)',
//       location: 'Yamoussoukro, CI',
//       responsibilities: [
//         'Développement de solutions web et mobile complètes',
//         'Intégration de modèles d\'IA dans les applications',
//         'Gestion de projets clients de A à Z',
//         'Architecture et déploiement d\'applications'
//       ]
//     },
//     {
//       period: '2023 - 2024',
//       title: 'Développeur Web & Mobile',
//       company: 'Projets Freelance',
//       location: 'Côte d\'Ivoire',
//       responsibilities: [
//         'Développement d\'applications React et Flutter',
//         'Création de plateformes web avec Node.js',
//         'Intégration d\'APIs et services cloud',
//         'Optimisation des performances applications'
//       ]
//     }
//   ]

//   const education = [
//     {
//       period: '2022 - 2025',
//       degree: 'Licence en Analyse de Données Industrielles',
//       institution: 'Institut National Polytechnique Houphouët-Boigny',
//       location: 'Yamoussoukro, CI',
//       details: [
//         'Analyse statistique et machine learning',
//         'Programmation et bases de données',
//         'Systèmes industriels et IoT',
//         'Visualisation de données'
//       ]
//     }
//   ]

//   const certifications = [
//     'TensorFlow Developer Certificate',
//     'AWS Cloud Practitioner',
//     'MongoDB Developer',
//     'Flutter Development Bootcamp',
//     'Google AI Certification',
//     'Data Science Specialization'
//   ]

//   const technicalSkills = {
//     'Langages': ['JavaScript/TypeScript', 'Python', 'Dart', 'SQL', 'HTML/CSS'],
//     'Frontend': ['React', 'Vue.js', 'Next.js', 'Tailwind CSS', 'Framer Motion'],
//     'Backend': ['Node.js', 'Express', 'FastAPI', 'Django', 'GraphQL'],
//     'Mobile': ['Flutter', 'React Native', 'Firebase'],
//     'IA & Data': ['TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn'],
//     'Database': ['PostgreSQL', 'MongoDB', 'Redis', 'Supabase'],
//     'DevOps': ['Docker', 'Git', 'CI/CD', 'AWS', 'Vercel', 'Heroku']
//   }

//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       exit={{ opacity: 0 }}
//       className="min-h-screen pt-32 pb-20"
//     >
//       {/* Hero Section */}
//       <section className="py-20 px-6 relative overflow-hidden">
//         <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />
//         <div className="container mx-auto relative z-10">
//           <div className="max-w-6xl mx-auto">
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.6 }}
//               className="text-center mb-12"
//             >
//               <h1 className="text-5xl lg:text-7xl font-bold mb-6">
//                 <span className="gradient-text">Curriculum Vitae</span>
//               </h1>
//               <p className="text-xl text-gray-300 mb-8">
//                 Développeur Full Stack • IA Specialist • Data Analyst
//               </p>
//               <motion.button
//                 onClick={handleDownload}
//                 disabled={downloading}
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white shadow-lg neon-glow flex items-center gap-3 mx-auto"
//               >
//                 <Download size={20} />
//                 {downloading ? 'Téléchargement...' : 'Télécharger le CV (PDF)'}
//               </motion.button>
//             </motion.div>

//             {/* CV Content */}
//             <motion.div
//               initial={{ opacity: 0, y: 30 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.8, delay: 0.2 }}
//               className="glass-effect-dark p-8 lg:p-12 rounded-3xl"
//             >
//               {/* Contact Info */}
//               <div className="mb-12 pb-8 border-b border-white/10">
//                 <h2 className="text-4xl font-bold text-white mb-6">Adjoumani</h2>
//                 <div className="grid md:grid-cols-2 gap-4 text-gray-300">
//                   <div className="flex items-center gap-3">
//                     <Mail className="text-primary" size={20} />
//                     <span>adjoumanideveloppeurwebmob@gmail.com</span>
//                   </div>
//                   <div className="flex items-center gap-3">
//                     <Phone className="text-primary" size={20} />
//                     <span>+225 07 78 28 88 68</span>
//                   </div>
//                   <div className="flex items-center gap-3">
//                     <MapPin className="text-primary" size={20} />
//                     <span>San-Pedro, Côte d'Ivoire</span>
//                   </div>
//                   <div className="flex items-center gap-3">
//                     <Globe className="text-primary" size={20} />
//                     <a href="https://les-experts-en-solutions-digitales.com/" className="hover:text-primary transition-colors">
//                       adjoumani.com
//                     </a>
//                   </div>
//                 </div>
//                 <div className="flex gap-4 mt-6">
//                   <a href="https://github.com" className="text-gray-400 hover:text-primary transition-colors">
//                     <Github size={24} />
//                   </a>
//                   <a href="https://linkedin.com" className="text-gray-400 hover:text-primary transition-colors">
//                     <Linkedin size={24} />
//                   </a>
//                 </div>
//               </div>

//               {/* Summary */}
//               <div className="mb-12">
//                 <h3 className="text-2xl font-bold gradient-text mb-4 flex items-center gap-3">
//                   <Code size={24} />
//                   Profil
//                 </h3>
//                 <p className="text-gray-300 leading-relaxed">
//                   Développeur Full Stack passionné et étudiant en analyse de données industrielles à l'INP-HB, 
//                   avec une expertise approfondie en développement web (React, Node.js), développement mobile (Flutter), 
//                   intelligence artificielle et analyse de données. Expérience avérée dans la création de solutions 
//                   digitales innovantes pour divers clients. Forte capacité d'apprentissage et d'adaptation aux 
//                   nouvelles technologies. Recherche d'opportunités pour contribuer à des projets ambitieux et 
//                   stimulants.
//                 </p>
//               </div>

//               {/* Experience */}
//               <div className="mb-12">
//                 <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
//                   <Briefcase size={24} />
//                   Expérience Professionnelle
//                 </h3>
//                 <div className="space-y-8">
//                   {experiences.map((exp, index) => (
//                     <motion.div
//                       key={index}
//                       initial={{ opacity: 0, x: -20 }}
//                       whileInView={{ opacity: 1, x: 0 }}
//                       transition={{ duration: 0.6, delay: index * 0.1 }}
//                       viewport={{ once: true }}
//                       className="relative pl-8 border-l-2 border-primary/30"
//                     >
//                       <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary" />
//                       <p className="text-sm text-primary font-semibold mb-1">{exp.period}</p>
//                       <h4 className="text-xl font-bold text-white mb-1">{exp.title}</h4>
//                       <p className="text-gray-400 mb-3">
//                         {exp.company} • {exp.location}
//                       </p>
//                       <ul className="space-y-2">
//                         {exp.responsibilities.map((resp, i) => (
//                           <li key={i} className="text-gray-300 flex items-start gap-2">
//                             <span className="text-primary mt-1.5">•</span>
//                             <span>{resp}</span>
//                           </li>
//                         ))}
//                       </ul>
//                     </motion.div>
//                   ))}
//                 </div>
//               </div>

//               {/* Education */}
//               <div className="mb-12">
//                 <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
//                   <GraduationCap size={24} />
//                   Formation
//                 </h3>
//                 {education.map((edu, index) => (
//                   <motion.div
//                     key={index}
//                     initial={{ opacity: 0, x: -20 }}
//                     whileInView={{ opacity: 1, x: 0 }}
//                     transition={{ duration: 0.6 }}
//                     viewport={{ once: true }}
//                     className="relative pl-8 border-l-2 border-secondary/30"
//                   >
//                     <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-secondary" />
//                     <p className="text-sm text-secondary font-semibold mb-1">{edu.period}</p>
//                     <h4 className="text-xl font-bold text-white mb-1">{edu.degree}</h4>
//                     <p className="text-gray-400 mb-3">
//                       {edu.institution} • {edu.location}
//                     </p>
//                     <ul className="space-y-2">
//                       {edu.details.map((detail, i) => (
//                         <li key={i} className="text-gray-300 flex items-start gap-2">
//                           <span className="text-secondary mt-1.5">•</span>
//                           <span>{detail}</span>
//                         </li>
//                       ))}
//                     </ul>
//                   </motion.div>
//                 ))}
//               </div>

//               {/* Technical Skills */}
//               <div className="mb-12">
//                 <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
//                   <Code size={24} />
//                   Compétences Techniques
//                 </h3>
//                 <div className="grid md:grid-cols-2 gap-6">
//                   {Object.entries(technicalSkills).map(([category, skills], index) => (
//                     <motion.div
//                       key={category}
//                       initial={{ opacity: 0, y: 20 }}
//                       whileInView={{ opacity: 1, y: 0 }}
//                       transition={{ duration: 0.6, delay: index * 0.1 }}
//                       viewport={{ once: true }}
//                       className="glass-effect p-4 rounded-xl"
//                     >
//                       <h4 className="font-bold text-white mb-3">{category}</h4>
//                       <div className="flex flex-wrap gap-2">
//                         {skills.map((skill, i) => (
//                           <span
//                             key={i}
//                             className="px-3 py-1 bg-white/5 rounded-full text-sm text-gray-300"
//                           >
//                             {skill}
//                           </span>
//                         ))}
//                       </div>
//                     </motion.div>
//                   ))}
//                 </div>
//               </div>

//               {/* Certifications */}
//               <div>
//                 <h3 className="text-2xl font-bold gradient-text mb-6 flex items-center gap-3">
//                   <Award size={24} />
//                   Certifications
//                 </h3>
//                 <div className="grid md:grid-cols-2 gap-4">
//                   {certifications.map((cert, index) => (
//                     <motion.div
//                       key={index}
//                       initial={{ opacity: 0, scale: 0.9 }}
//                       whileInView={{ opacity: 1, scale: 1 }}
//                       transition={{ duration: 0.4, delay: index * 0.05 }}
//                       viewport={{ once: true }}
//                       className="flex items-center gap-3 text-gray-300"
//                     >
//                       <Award className="text-accent flex-shrink-0" size={20} />
//                       <span>{cert}</span>
//                     </motion.div>
//                   ))}
//                 </div>
//               </div>
//             </motion.div>
//           </div>
//         </div>
//       </section>
//     </motion.div>
//   )
// }

// export default CVPage