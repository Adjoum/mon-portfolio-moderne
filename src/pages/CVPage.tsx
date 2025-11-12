import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Download, Mail, Phone, MapPin, Globe, Github, Linkedin, Briefcase, GraduationCap, Award, Code, Eye, X } from 'lucide-react'

const CVPage: React.FC = () => {
  const [downloading, setDownloading] = useState(false)
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  const [cvUrl, setCvUrl] = useState<string>('')

  useEffect(() => {
    // Charger le CV depuis localStorage
    const savedCv = localStorage.getItem('cvFile')
    if (savedCv) {
      setCvUrl(savedCv)
    } else {
      // URL par défaut (à remplacer par votre CV dans public/)
      setCvUrl('/cv.pdf')
    }
  }, [])

  const handleDownload = () => {
    setDownloading(true)
    
    // Créer un lien de téléchargement
    const link = document.createElement('a')
    link.href = cvUrl
    link.download = 'CV-Adjoumani.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    setTimeout(() => {
      setDownloading(false)
    }, 1000)
  }

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
      className="min-h-screen pt-32 pb-20"
    >
      {/* Hero Section */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />
        <div className="container mx-auto relative z-10">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h1 className="text-5xl lg:text-7xl font-bold mb-6">
                <span className="gradient-text">Curriculum Vitae</span>
              </h1>
              <p className="text-xl text-gray-300 mb-8">
                Développeur Full Stack • IA Specialist • Data Analyst
              </p>
              
              {/* Boutons d'action */}
              <div className="flex flex-wrap gap-4 justify-center">
                <motion.button
                  onClick={handleDownload}
                  disabled={downloading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-full font-semibold text-white shadow-lg neon-glow flex items-center gap-3"
                >
                  <Download size={20} />
                  {downloading ? 'Téléchargement...' : 'Télécharger le CV (PDF)'}
                </motion.button>

                {cvUrl && (
                  <motion.button
                    onClick={() => setShowPdfViewer(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-4 glass-effect rounded-full font-semibold text-white border border-white/20 flex items-center gap-3"
                  >
                    <Eye size={20} />
                    Voir le CV en grand
                  </motion.button>
                )}
              </div>
            </motion.div>

            {/* CV Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="glass-effect-dark p-8 lg:p-12 rounded-3xl"
            >
              {/* Contact Info */}
              <div className="mb-12 pb-8 border-b border-white/10">
                <h2 className="text-4xl font-bold text-white mb-6">Adjoumani</h2>
                <div className="grid md:grid-cols-2 gap-4 text-gray-300">
                  <div className="flex items-center gap-3">
                    <Mail className="text-primary" size={20} />
                    <span>adjoumanideveloppeurwebmob@gmail.com</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="text-primary" size={20} />
                    <span>+225 07 78 28 88 68</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="text-primary" size={20} />
                    <span>San-Pedro, Côte d'Ivoire</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Globe className="text-primary" size={20} />
                    <a href="https://les-experts-en-solutions-digitales.com/" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                      adjoumani.com
                    </a>
                  </div>
                </div>
                <div className="flex gap-4 mt-6">
                  <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-colors">
                    <Github size={24} />
                  </a>
                  <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-colors">
                    <Linkedin size={24} />
                  </a>
                </div>
              </div>

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
            </motion.div>
          </div>
        </div>
      </section>

      {/* Modal Viewer PDF */}
      {showPdfViewer && cvUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-dark/95 backdrop-blur-xl"
          onClick={() => setShowPdfViewer(false)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            className="relative w-full max-w-6xl h-[90vh] glass-effect-dark rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-xl font-bold text-white">Curriculum Vitae - Adjoumani</h3>
              <div className="flex gap-2">
                <a
                  href={cvUrl}
                  download="CV-Adjoumani.pdf"
                  className="px-4 py-2 bg-primary/20 text-primary rounded-lg flex items-center gap-2 hover:bg-primary/30 transition-colors"
                >
                  <Download size={18} />
                  Télécharger
                </a>
                <button
                  onClick={() => setShowPdfViewer(false)}
                  className="w-10 h-10 glass-effect rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* PDF Viewer */}
            <div className="w-full h-[calc(90vh-80px)]">
              <iframe
                src={cvUrl}
                className="w-full h-full"
                title="CV PDF"
              />
            </div>
          </motion.div>
        </motion.div>
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