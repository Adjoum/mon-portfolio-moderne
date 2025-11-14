import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Phone, MapPin, Send, MessageSquare, User, FileText } from 'lucide-react'
import { FaGithub, FaLinkedin, FaFacebook, FaXTwitter } from 'react-icons/fa6'
import { submitContact } from '../lib/supabase'

const ContactPage: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')

    try {
      await submitContact(formData)
      setSubmitStatus('success')
      setFormData({ name: '', email: '', subject: '', message: '' })
      
      setTimeout(() => {
        setSubmitStatus('idle')
      }, 5000)
    } catch (error) {
      console.error('Error submitting contact form:', error)
      setSubmitStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const contactInfo = [
    {
      icon: Mail,
      title: 'Email',
      value: 'adjoumanideveloppeurwebmob@gmail.com',
      shortValue: 'adjoumani...@gmail.com',
      href: 'mailto:adjoumanideveloppeurwebmob@gmail.com',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      icon: Phone,
      title: 'Téléphone',
      value: '+225 07 78 28 88 68',
      shortValue: '+225 07 78 28 88 68',
      href: 'tel:+2250778288868',
      color: 'from-green-500 to-emerald-500'
    },
    {
      icon: MapPin,
      title: 'Localisation',
      value: 'San-Pedro, Côte d\'Ivoire',
      shortValue: 'San-Pedro, CI',
      href: 'https://maps.google.com',
      color: 'from-red-500 to-pink-500'
    }
  ]

  const socialLinks = [
    { 
      icon: FaGithub, 
      href: 'https://github.com/Adjoum', 
      label: 'GitHub', 
      color: 'hover:text-gray-400' 
    },
    { 
      icon: FaLinkedin, 
      href: 'https://www.linkedin.com/in/koffi-wilfried-adjoumani/', 
      label: 'LinkedIn', 
      color: 'hover:text-blue-400' 
    },
    { 
      icon: FaFacebook, 
      href: "https://web.facebook.com/profile.php?id=100084939496635", 
      label: 'Facebook', 
      color: 'hover:text-blue-500' 
    },
    { 
      icon: FaXTwitter, 
      href: 'https://x.com', 
      label: 'X (Twitter)', 
      color: 'hover:text-sky-400' 
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-20 sm:pt-24 md:pt-28 lg:pt-32 pb-12 sm:pb-16 md:pb-20"
    >
      {/* Hero Section - Responsive */}
      <section className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />
        <div className="container mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold mb-4 sm:mb-6 px-4">
              <span className="gradient-text">Contactez-moi</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-3xl mx-auto px-4">
              Une question ? Un projet ? Un partenariat ? N'hésitez pas à me contacter. 
              Je serais ravi de discuter avec vous !
            </p>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 md:gap-10 lg:gap-12 max-w-6xl mx-auto">
          
          {/* Contact Form - Responsive */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="order-2 lg:order-1"
          >
            <div className="glass-effect-dark p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">
                <span className="gradient-text">Envoyez un message</span>
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                {/* Name Field - Responsive */}
                <div>
                  <label htmlFor="name" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    <User size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
                    Nom complet
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="Votre nom"
                  />
                </div>

                {/* Email Field - Responsive */}
                <div>
                  <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    <Mail size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
                    Adresse email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="votre.email@exemple.com"
                  />
                </div>

                {/* Subject Field - Responsive */}
                <div>
                  <label htmlFor="subject" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    <FileText size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
                    Sujet
                  </label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="Sujet de votre message"
                  />
                </div>

                {/* Message Field - Responsive */}
                <div>
                  <label htmlFor="message" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    <MessageSquare size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={5}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                    placeholder="Votre message..."
                  />
                </div>

                {/* Submit Button - Responsive */}
                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full py-3 sm:py-4 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base text-white flex items-center justify-center gap-2 sm:gap-3 transition-all ${
                    isSubmitting
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-primary to-secondary neon-glow'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="hidden sm:inline">Envoi en cours...</span>
                      <span className="sm:hidden">Envoi...</span>
                    </>
                  ) : (
                    <>
                      <Send size={18} className="sm:w-5 sm:h-5" />
                      <span className="hidden sm:inline">Envoyer le message</span>
                      <span className="sm:hidden">Envoyer</span>
                    </>
                  )}
                </motion.button>

                {/* Status Messages - Responsive */}
                {submitStatus === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 sm:p-4 bg-green-500/20 border border-green-500/50 rounded-lg sm:rounded-xl text-green-400 text-center text-xs sm:text-sm"
                  >
                    <span className="hidden sm:inline">Message envoyé avec succès ! Je vous répondrai bientôt.</span>
                    <span className="sm:hidden">Message envoyé !</span>
                  </motion.div>
                )}

                {submitStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 sm:p-4 bg-red-500/20 border border-red-500/50 rounded-lg sm:rounded-xl text-red-400 text-center text-xs sm:text-sm"
                  >
                    <span className="hidden sm:inline">Une erreur est survenue. Veuillez réessayer.</span>
                    <span className="sm:hidden">Erreur. Réessayez.</span>
                  </motion.div>
                )}
              </form>
            </div>
          </motion.div>

          {/* Contact Info & Social - Responsive */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6 sm:space-y-8 order-1 lg:order-2"
          >
            {/* Contact Cards - Responsive */}
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">
                <span className="gradient-text">Coordonnées</span>
              </h2>
              {contactInfo.map((info, index) => (
                <motion.a
                  key={index}
                  href={info.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="block glass-effect p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl hover-lift"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center flex-shrink-0`}>
                      <info.icon className="text-white" size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-gray-400 mb-1">{info.title}</p>
                      {/* Version mobile - texte court */}
                      <p className="text-white font-semibold text-sm sm:text-base sm:hidden truncate">
                        {info.shortValue}
                      </p>
                      {/* Version desktop - texte complet */}
                      <p className="text-white font-semibold text-sm sm:text-base hidden sm:block break-words">
                        {info.value}
                      </p>
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>

            {/* Social Links - Responsive */}
            <div className="glass-effect p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl">
              <h3 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-white">Suivez-moi</h3>
              <div className="flex flex-wrap gap-3 sm:gap-4">
                {socialLinks.map((social, index) => {
                  const IconComponent = social.icon
                  return (
                    <motion.a
                      key={index}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label}
                      whileHover={{ scale: 1.2, rotate: 360 }}
                      whileTap={{ scale: 0.9 }}
                      className={`w-12 h-12 sm:w-14 sm:h-14 glass-effect rounded-full flex items-center justify-center text-gray-400 ${social.color} transition-all`}
                    >
                      <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
                    </motion.a>
                  )
                })}
              </div>
            </div>

            {/* Availability Status - Responsive */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="glass-effect p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl"
            >
              <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">
                  <span className="hidden sm:inline">Disponible pour de nouveaux projets</span>
                  <span className="sm:hidden">Disponible</span>
                </h3>
              </div>
              <p className="text-gray-400 text-xs sm:text-sm md:text-base">
                <span className="hidden sm:inline">
                  Je suis actuellement ouvert aux opportunités freelance et aux collaborations. 
                  Temps de réponse moyen : 24-48h.
                </span>
                <span className="sm:hidden">
                  Ouvert aux opportunités freelance. Réponse sous 24-48h.
                </span>
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

export default ContactPage











// import React, { useState } from 'react'
// import { motion } from 'framer-motion'
// import { Mail, Phone, MapPin, Send, Github, Linkedin, Facebook, X, MessageSquare, User, FileText } from 'lucide-react'
// import { submitContact } from '../lib/supabase'

// const ContactPage: React.FC = () => {
//   const [formData, setFormData] = useState({
//     name: '',
//     email: '',
//     subject: '',
//     message: ''
//   })
//   const [isSubmitting, setIsSubmitting] = useState(false)
//   const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
//     setFormData({
//       ...formData,
//       [e.target.name]: e.target.value
//     })
//   }

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     setIsSubmitting(true)
//     setSubmitStatus('idle')

//     try {
//       await submitContact(formData)
//       setSubmitStatus('success')
//       setFormData({ name: '', email: '', subject: '', message: '' })
      
//       setTimeout(() => {
//         setSubmitStatus('idle')
//       }, 5000)
//     } catch (error) {
//       console.error('Error submitting contact form:', error)
//       setSubmitStatus('error')
//     } finally {
//       setIsSubmitting(false)
//     }
//   }

//   const contactInfo = [
//     {
//       icon: Mail,
//       title: 'Email',
//       value: 'adjoumanideveloppeurwebmob@gmail.com',
//       shortValue: 'adjoumani...@gmail.com',
//       href: 'mailto:adjoumanideveloppeurwebmob@gmail.com',
//       color: 'from-blue-500 to-cyan-500'
//     },
//     {
//       icon: Phone,
//       title: 'Téléphone',
//       value: '+225 07 78 28 88 68',
//       shortValue: '+225 07 78 28 88 68',
//       href: 'tel:+2250778288868',
//       color: 'from-green-500 to-emerald-500'
//     },
//     {
//       icon: MapPin,
//       title: 'Localisation',
//       value: 'San-Pedro, Côte d\'Ivoire',
//       shortValue: 'San-Pedro, CI',
//       href: 'https://maps.google.com',
//       color: 'from-red-500 to-pink-500'
//     }
//   ]

//   const socialLinks = [
//     { icon: Github, href: 'https://github.com/Adjoum', label: 'GitHub', color: 'hover:text-gray-400' },
//     { icon: Linkedin, href: 'https://www.linkedin.com/in/koffi-wilfried-adjoumani/', label: 'LinkedIn', color: 'hover:text-blue-400' },
//     { icon: Facebook, href: "https://web.facebook.com/profile.php?id=100084939496635", label: 'Facebook', color: 'hover:text-blue-500' },
//     { icon: X, href: 'https://x.com', label: 'X', color: 'hover:text-sky-400' },
//   ]

//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       exit={{ opacity: 0 }}
//       className="min-h-screen pt-20 sm:pt-24 md:pt-28 lg:pt-32 pb-12 sm:pb-16 md:pb-20"
//     >
//       {/* Hero Section - Responsive */}
//       <section className="py-12 sm:py-16 md:py-20 px-4 sm:px-6 relative overflow-hidden">
//         <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10" />
//         <div className="container mx-auto relative z-10 text-center">
//           <motion.div
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.6 }}
//           >
//             <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold mb-4 sm:mb-6 px-4">
//               <span className="gradient-text">Contactez-moi</span>
//             </h1>
//             <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-3xl mx-auto px-4">
//               Une question ? Un projet ? Un partenariat ? N'hésitez pas à me contacter. 
//               Je serais ravi de discuter avec vous !
//             </p>
//           </motion.div>
//         </div>
//       </section>

//       <div className="container mx-auto px-4 sm:px-6">
//         <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 md:gap-10 lg:gap-12 max-w-6xl mx-auto">
          
//           {/* Contact Form - Responsive */}
//           <motion.div
//             initial={{ opacity: 0, x: -50 }}
//             animate={{ opacity: 1, x: 0 }}
//             transition={{ duration: 0.8 }}
//             className="order-2 lg:order-1"
//           >
//             <div className="glass-effect-dark p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl">
//               <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">
//                 <span className="gradient-text">Envoyez un message</span>
//               </h2>
              
//               <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
//                 {/* Name Field - Responsive */}
//                 <div>
//                   <label htmlFor="name" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
//                     <User size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
//                     Nom complet
//                   </label>
//                   <input
//                     type="text"
//                     id="name"
//                     name="name"
//                     value={formData.name}
//                     onChange={handleChange}
//                     required
//                     className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
//                     placeholder="Votre nom"
//                   />
//                 </div>

//                 {/* Email Field - Responsive */}
//                 <div>
//                   <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
//                     <Mail size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
//                     Adresse email
//                   </label>
//                   <input
//                     type="email"
//                     id="email"
//                     name="email"
//                     value={formData.email}
//                     onChange={handleChange}
//                     required
//                     className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
//                     placeholder="votre.email@exemple.com"
//                   />
//                 </div>

//                 {/* Subject Field - Responsive */}
//                 <div>
//                   <label htmlFor="subject" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
//                     <FileText size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
//                     Sujet
//                   </label>
//                   <input
//                     type="text"
//                     id="subject"
//                     name="subject"
//                     value={formData.subject}
//                     onChange={handleChange}
//                     required
//                     className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
//                     placeholder="Sujet de votre message"
//                   />
//                 </div>

//                 {/* Message Field - Responsive */}
//                 <div>
//                   <label htmlFor="message" className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
//                     <MessageSquare size={16} className="inline mr-1 sm:mr-2 sm:w-[18px] sm:h-[18px]" />
//                     Message
//                   </label>
//                   <textarea
//                     id="message"
//                     name="message"
//                     value={formData.message}
//                     onChange={handleChange}
//                     required
//                     rows={5}
//                     className="w-full px-3 sm:px-4 py-2.5 sm:py-3 glass-effect rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
//                     placeholder="Votre message..."
//                   />
//                 </div>

//                 {/* Submit Button - Responsive */}
//                 <motion.button
//                   type="submit"
//                   disabled={isSubmitting}
//                   whileHover={{ scale: 1.02 }}
//                   whileTap={{ scale: 0.98 }}
//                   className={`w-full py-3 sm:py-4 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base text-white flex items-center justify-center gap-2 sm:gap-3 transition-all ${
//                     isSubmitting
//                       ? 'bg-gray-600 cursor-not-allowed'
//                       : 'bg-gradient-to-r from-primary to-secondary neon-glow'
//                   }`}
//                 >
//                   {isSubmitting ? (
//                     <>
//                       <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
//                       <span className="hidden sm:inline">Envoi en cours...</span>
//                       <span className="sm:hidden">Envoi...</span>
//                     </>
//                   ) : (
//                     <>
//                       <Send size={18} className="sm:w-5 sm:h-5" />
//                       <span className="hidden sm:inline">Envoyer le message</span>
//                       <span className="sm:hidden">Envoyer</span>
//                     </>
//                   )}
//                 </motion.button>

//                 {/* Status Messages - Responsive */}
//                 {submitStatus === 'success' && (
//                   <motion.div
//                     initial={{ opacity: 0, y: 10 }}
//                     animate={{ opacity: 1, y: 0 }}
//                     className="p-3 sm:p-4 bg-green-500/20 border border-green-500/50 rounded-lg sm:rounded-xl text-green-400 text-center text-xs sm:text-sm"
//                   >
//                     <span className="hidden sm:inline">Message envoyé avec succès ! Je vous répondrai bientôt.</span>
//                     <span className="sm:hidden">Message envoyé !</span>
//                   </motion.div>
//                 )}

//                 {submitStatus === 'error' && (
//                   <motion.div
//                     initial={{ opacity: 0, y: 10 }}
//                     animate={{ opacity: 1, y: 0 }}
//                     className="p-3 sm:p-4 bg-red-500/20 border border-red-500/50 rounded-lg sm:rounded-xl text-red-400 text-center text-xs sm:text-sm"
//                   >
//                     <span className="hidden sm:inline">Une erreur est survenue. Veuillez réessayer.</span>
//                     <span className="sm:hidden">Erreur. Réessayez.</span>
//                   </motion.div>
//                 )}
//               </form>
//             </div>
//           </motion.div>

//           {/* Contact Info & Social - Responsive */}
//           <motion.div
//             initial={{ opacity: 0, x: 50 }}
//             animate={{ opacity: 1, x: 0 }}
//             transition={{ duration: 0.8, delay: 0.2 }}
//             className="space-y-6 sm:space-y-8 order-1 lg:order-2"
//           >
//             {/* Contact Cards - Responsive */}
//             <div className="space-y-3 sm:space-y-4">
//               <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">
//                 <span className="gradient-text">Coordonnées</span>
//               </h2>
//               {contactInfo.map((info, index) => (
//                 <motion.a
//                   key={index}
//                   href={info.href}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   initial={{ opacity: 0, y: 20 }}
//                   animate={{ opacity: 1, y: 0 }}
//                   transition={{ duration: 0.6, delay: index * 0.1 }}
//                   whileHover={{ scale: 1.02 }}
//                   className="block glass-effect p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl hover-lift"
//                 >
//                   <div className="flex items-center gap-3 sm:gap-4">
//                     <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center flex-shrink-0`}>
//                       <info.icon className="text-white" size={20} />
//                     </div>
//                     <div className="min-w-0 flex-1">
//                       <p className="text-xs sm:text-sm text-gray-400 mb-1">{info.title}</p>
//                       {/* Version mobile - texte court */}
//                       <p className="text-white font-semibold text-sm sm:text-base sm:hidden truncate">
//                         {info.shortValue}
//                       </p>
//                       {/* Version desktop - texte complet */}
//                       <p className="text-white font-semibold text-sm sm:text-base hidden sm:block break-words">
//                         {info.value}
//                       </p>
//                     </div>
//                   </div>
//                 </motion.a>
//               ))}
//             </div>

//             {/* Social Links - Responsive */}
//             <div className="glass-effect p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl">
//               <h3 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-white">Suivez-moi</h3>
//               <div className="flex flex-wrap gap-3 sm:gap-4">
//                 {socialLinks.map((social, index) => (
//                   <motion.a
//                     key={index}
//                     href={social.href}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     aria-label={social.label}
//                     whileHover={{ scale: 1.2, rotate: 360 }}
//                     whileTap={{ scale: 0.9 }}
//                     className={`w-12 h-12 sm:w-14 sm:h-14 glass-effect rounded-full flex items-center justify-center text-gray-400 ${social.color} transition-all`}
//                   >
//                     <social.icon size={20} className="sm:w-6 sm:h-6" />
//                   </motion.a>
//                 ))}
//               </div>
//             </div>

//             {/* Availability Status - Responsive */}
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.6, delay: 0.6 }}
//               className="glass-effect p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl"
//             >
//               <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
//                 <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
//                 <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">
//                   <span className="hidden sm:inline">Disponible pour de nouveaux projets</span>
//                   <span className="sm:hidden">Disponible</span>
//                 </h3>
//               </div>
//               <p className="text-gray-400 text-xs sm:text-sm md:text-base">
//                 <span className="hidden sm:inline">
//                   Je suis actuellement ouvert aux opportunités freelance et aux collaborations. 
//                   Temps de réponse moyen : 24-48h.
//                 </span>
//                 <span className="sm:hidden">
//                   Ouvert aux opportunités freelance. Réponse sous 24-48h.
//                 </span>
//               </p>
//             </motion.div>
//           </motion.div>
//         </div>
//       </div>
//     </motion.div>
//   )
// }

// export default ContactPage

















// import React, { useState } from 'react'
// import { motion } from 'framer-motion'
// import { Mail, Phone, MapPin, Send, Github, Linkedin, Facebook, X, MessageSquare, User, FileText } from 'lucide-react'
// import { submitContact } from '../lib/supabase'

// const ContactPage: React.FC = () => {
//   const [formData, setFormData] = useState({
//     name: '',
//     email: '',
//     subject: '',
//     message: ''
//   })
//   const [isSubmitting, setIsSubmitting] = useState(false)
//   const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
//     setFormData({
//       ...formData,
//       [e.target.name]: e.target.value
//     })
//   }

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     setIsSubmitting(true)
//     setSubmitStatus('idle')

//     try {
//       await submitContact(formData)
//       setSubmitStatus('success')
//       setFormData({ name: '', email: '', subject: '', message: '' })
      
//       setTimeout(() => {
//         setSubmitStatus('idle')
//       }, 5000)
//     } catch (error) {
//       console.error('Error submitting contact form:', error)
//       setSubmitStatus('error')
//     } finally {
//       setIsSubmitting(false)
//     }
//   }

//   const contactInfo = [
//     {
//       icon: Mail,
//       title: 'Email',
//       value: 'adjoumanideveloppeurwebmob@gmail.com',
//       href: 'mailto:adjoumanideveloppeurwebmob@gmail.com',
//       color: 'from-blue-500 to-cyan-500'
//     },
//     {
//       icon: Phone,
//       title: 'Téléphone',
//       value: '+225 07 78 28 88 68',
//       href: 'tel:+2250778288868',
//       color: 'from-green-500 to-emerald-500'
//     },
//     {
//       icon: MapPin,
//       title: 'Localisation',
//       value: 'San-Pedro, Côte d\'Ivoire',
//       href: 'https://maps.google.com',
//       color: 'from-red-500 to-pink-500'
//     }
//   ]

//   const socialLinks = [
//     { icon: Github, href: 'https://github.com/Adjoum', label: 'GitHub', color: 'hover:text-gray-400' },
//     { icon: Linkedin, href: 'https://www.linkedin.com/in/koffi-wilfried-adjoumani/', label: 'LinkedIn', color: 'hover:text-blue-400' },
//     {icon: Facebook, href: "https://web.facebook.com/profile.php?id=100084939496635", label: 'Facebook'},
//     { icon: X, href: 'https://x.com', label: 'X', color: 'hover:text-sky-400' },
//   ]

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
//         <div className="container mx-auto relative z-10 text-center">
//           <motion.div
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.6 }}
//           >
//             <h1 className="text-5xl lg:text-7xl font-bold mb-6">
//               <span className="gradient-text">Contactez-moi</span>
//             </h1>
//             <p className="text-xl text-gray-300 max-w-3xl mx-auto">
//               Une question ? Un projet ? Un partenariat ? N'hésitez pas à me contacter. 
//               Je serais ravi de discuter avec vous !
//             </p>
//           </motion.div>
//         </div>
//       </section>

//       <div className="container mx-auto px-6">
//         <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
//           {/* Contact Form */}
//           <motion.div
//             initial={{ opacity: 0, x: -50 }}
//             animate={{ opacity: 1, x: 0 }}
//             transition={{ duration: 0.8 }}
//           >
//             <div className="glass-effect-dark p-8 rounded-3xl">
//               <h2 className="text-3xl font-bold mb-6">
//                 <span className="gradient-text">Envoyez un message</span>
//               </h2>
              
//               <form onSubmit={handleSubmit} className="space-y-6">
//                 {/* Name Field */}
//                 <div>
//                   <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
//                     <User size={18} className="inline mr-2" />
//                     Nom complet
//                   </label>
//                   <input
//                     type="text"
//                     id="name"
//                     name="name"
//                     value={formData.name}
//                     onChange={handleChange}
//                     required
//                     className="w-full px-4 py-3 glass-effect rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
//                     placeholder="Votre nom"
//                   />
//                 </div>

//                 {/* Email Field */}
//                 <div>
//                   <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
//                     <Mail size={18} className="inline mr-2" />
//                     Adresse email
//                   </label>
//                   <input
//                     type="email"
//                     id="email"
//                     name="email"
//                     value={formData.email}
//                     onChange={handleChange}
//                     required
//                     className="w-full px-4 py-3 glass-effect rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
//                     placeholder="votre.email@exemple.com"
//                   />
//                 </div>

//                 {/* Subject Field */}
//                 <div>
//                   <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-2">
//                     <FileText size={18} className="inline mr-2" />
//                     Sujet
//                   </label>
//                   <input
//                     type="text"
//                     id="subject"
//                     name="subject"
//                     value={formData.subject}
//                     onChange={handleChange}
//                     required
//                     className="w-full px-4 py-3 glass-effect rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
//                     placeholder="Sujet de votre message"
//                   />
//                 </div>

//                 {/* Message Field */}
//                 <div>
//                   <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
//                     <MessageSquare size={18} className="inline mr-2" />
//                     Message
//                   </label>
//                   <textarea
//                     id="message"
//                     name="message"
//                     value={formData.message}
//                     onChange={handleChange}
//                     required
//                     rows={6}
//                     className="w-full px-4 py-3 glass-effect rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
//                     placeholder="Votre message..."
//                   />
//                 </div>

//                 {/* Submit Button */}
//                 <motion.button
//                   type="submit"
//                   disabled={isSubmitting}
//                   whileHover={{ scale: 1.02 }}
//                   whileTap={{ scale: 0.98 }}
//                   className={`w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-3 transition-all ${
//                     isSubmitting
//                       ? 'bg-gray-600 cursor-not-allowed'
//                       : 'bg-gradient-to-r from-primary to-secondary neon-glow'
//                   }`}
//                 >
//                   {isSubmitting ? (
//                     <>
//                       <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
//                       Envoi en cours...
//                     </>
//                   ) : (
//                     <>
//                       <Send size={20} />
//                       Envoyer le message
//                     </>
//                   )}
//                 </motion.button>

//                 {/* Status Messages */}
//                 {submitStatus === 'success' && (
//                   <motion.div
//                     initial={{ opacity: 0, y: 10 }}
//                     animate={{ opacity: 1, y: 0 }}
//                     className="p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-green-400 text-center"
//                   >
//                     Message envoyé avec succès ! Je vous répondrai bientôt.
//                   </motion.div>
//                 )}

//                 {submitStatus === 'error' && (
//                   <motion.div
//                     initial={{ opacity: 0, y: 10 }}
//                     animate={{ opacity: 1, y: 0 }}
//                     className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-center"
//                   >
//                     Une erreur est survenue. Veuillez réessayer.
//                   </motion.div>
//                 )}
//               </form>
//             </div>
//           </motion.div>

//           {/* Contact Info & Social */}
//           <motion.div
//             initial={{ opacity: 0, x: 50 }}
//             animate={{ opacity: 1, x: 0 }}
//             transition={{ duration: 0.8, delay: 0.2 }}
//             className="space-y-8"
//           >
//             {/* Contact Cards */}
//             <div className="space-y-4">
//               <h2 className="text-3xl font-bold mb-6">
//                 <span className="gradient-text">Coordonnées</span>
//               </h2>
//               {contactInfo.map((info, index) => (
//                 <motion.a
//                   key={index}
//                   href={info.href}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   initial={{ opacity: 0, y: 20 }}
//                   animate={{ opacity: 1, y: 0 }}
//                   transition={{ duration: 0.6, delay: index * 0.1 }}
//                   whileHover={{ scale: 1.02 }}
//                   className="block glass-effect p-6 rounded-2xl hover-lift"
//                 >
//                   <div className="flex items-center gap-4">
//                     <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center flex-shrink-0`}>
//                       <info.icon className="text-white" size={24} />
//                     </div>
//                     <div>
//                       <p className="text-sm text-gray-400 mb-1">{info.title}</p>
//                       <p className="text-white font-semibold">{info.value}</p>
//                     </div>
//                   </div>
//                 </motion.a>
//               ))}
//             </div>

//             {/* Social Links */}
//             <div className="glass-effect p-8 rounded-2xl">
//               <h3 className="text-2xl font-bold mb-6 text-white">Suivez-moi</h3>
//               <div className="flex gap-4">
//                 {socialLinks.map((social, index) => (
//                   <motion.a
//                     key={index}
//                     href={social.href}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     aria-label={social.label}
//                     whileHover={{ scale: 1.2, rotate: 360 }}
//                     whileTap={{ scale: 0.9 }}
//                     className={`w-14 h-14 glass-effect rounded-full flex items-center justify-center text-gray-400 ${social.color} transition-all`}
//                   >
//                     <social.icon size={24} />
//                   </motion.a>
//                 ))}
//               </div>
//             </div>

//             {/* Availability Status */}
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.6, delay: 0.6 }}
//               className="glass-effect p-8 rounded-2xl"
//             >
//               <div className="flex items-center gap-4 mb-4">
//                 <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
//                 <h3 className="text-xl font-bold text-white">Disponible pour de nouveaux projets</h3>
//               </div>
//               <p className="text-gray-400">
//                 Je suis actuellement ouvert aux opportunités freelance et aux collaborations. 
//                 Temps de réponse moyen : 24-48h.
//               </p>
//             </motion.div>
//           </motion.div>
//         </div>
//       </div>
//     </motion.div>
//   )
// }

// export default ContactPage