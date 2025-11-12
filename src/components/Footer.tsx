import React from 'react'
import { motion } from 'framer-motion'
import { Github, Linkedin, Mail, X, Facebook, Heart, ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'

const Footer: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const socialLinks = [
    { icon: Github, href: 'https://github.com/Adjoum', label: 'GitHub' },
    { icon: Linkedin, href: 'https://www.linkedin.com/in/koffi-wilfried-adjoumani/', label: 'LinkedIn' },
    {icon: Facebook, href: "https://web.facebook.com/profile.php?id=100084939496635", label: 'Facebook'},
    { icon: X, href: 'https://x.com/home', label: 'X' },
    { icon: Mail, href: 'mailto:adjoumanideveloppeurwebmob@gmail.com', label: 'Email' },
  ]

  const quickLinks = [
    { name: 'Accueil', href: '/' },
    { name: 'À propos', href: '/about' },
    { name: 'Projets', href: '/projects' },
    { name: 'Compétences', href: '/skills' },
    { name: 'CV', href: '/cv' },
    { name: 'Contact', href: '/contact' },
  ]

  return (
    <footer className="relative bg-gradient-to-b from-dark to-slate-950 border-t border-white/10">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        {/* Main footer content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 py-16">
          {/* Brand section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-2"
          >
            <Link to="/" className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-white font-bold text-xl">A</span>
              </div>
              <span className="text-2xl font-bold gradient-text">Adjoumani</span>
            </Link>
            <p className="text-gray-400 mb-6 max-w-md">
              Développeur Full Stack passionné par la création de solutions digitales innovantes. 
              Spécialisé en Web, Mobile, IA et Data Analytics.
            </p>
            <div className="flex gap-4">
              {socialLinks.map((social, index) => (
                <motion.a
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  whileHover={{ scale: 1.2, rotate: 360 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-12 h-12 glass-effect rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                >
                  <social.icon size={20} />
                </motion.a>
              ))}
            </div>
          </motion.div>

          {/* Quick links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h3 className="text-lg font-bold text-white mb-6">Liens Rapides</h3>
            <ul className="space-y-3">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <Link
                    to={link.href}
                    className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 group"
                  >
                    <span className="w-0 h-0.5 bg-gradient-to-r from-primary to-secondary group-hover:w-4 transition-all" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Contact info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <h3 className="text-lg font-bold text-white mb-6">Contact</h3>
            <ul className="space-y-4 text-gray-400">
              <li>
                <strong className="text-white">Email:</strong>
                <br />
                <a href="mailto:adjoumanideveloppeurwebmob@gmail.com" className="hover:text-primary transition-colors">
                  adjoumanideveloppeurwebmob@gmail.com
                </a>
              </li>
              <li>
                <strong className="text-white">Téléphone:</strong>
                <br />
                <a href="tel:+2250778288868" className="hover:text-primary transition-colors">
                  +225 07 78 28 88 68
                </a>
              </li>
              <li>
                <strong className="text-white">Localisation:</strong>
                <br />
                San-Pedro, Côte d'Ivoire
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="text-gray-400 text-sm flex items-center gap-2"
            >
              © {new Date().getFullYear()} Adjoumani. Fait avec{' '}
              <Heart size={16} className="text-red-500 animate-pulse" fill="currentColor" /> 
              {' '}en Côte d'Ivoire
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex gap-6 text-sm text-gray-400"
            >
              <Link to="/privacy" className="hover:text-white transition-colors">
                Confidentialité
              </Link>
              <Link to="/terms" className="hover:text-white transition-colors">
                Conditions
              </Link>
              <Link to="/sitemap" className="hover:text-white transition-colors">
                Plan du site
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Scroll to top button */}
      <motion.button
        onClick={scrollToTop}
        className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center text-white shadow-lg neon-glow z-50"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <ArrowUp size={24} />
      </motion.button>
    </footer>
  )
}

export default Footer