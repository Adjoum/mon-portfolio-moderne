import React from 'react'
import { motion } from 'framer-motion'
import { Shield, Lock, Eye, Database, Cookie, UserCheck } from 'lucide-react'

const PrivacyPage: React.FC = () => {
  const sections = [
    {
      icon: Eye,
      title: "1. Données Collectées",
      content: `Données collectées via le formulaire : nom, email, message. Aucune donnée de tracking.`
    },
    {
      icon: Database,
      title: "2. Utilisation",
      content: `Vos données servent uniquement à répondre à vos demandes. Elles ne sont jamais vendues ou partagées.`
    },
    {
      icon: Lock,
      title: "3. Sécurité",
      content: `HTTPS, base de données sécurisée Supabase, accès restreint.`
    },
    {
      icon: Cookie,
      title: "4. Cookies",
      content: `Uniquement des cookies essentiels (authentification). Aucun tracking publicitaire.`
    },
    {
      icon: UserCheck,
      title: "5. Vos Droits RGPD",
      content: `Droit d'accès, rectification, effacement, portabilité. Contactez-moi pour exercer vos droits.`
    },
    {
      icon: Shield,
      title: "6. Contact",
      content: `Questions sur vos données ? Utilisez le formulaire de contact.`
    },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-32 pb-20 px-6">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <motion.div
            className="inline-block p-4 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-full mb-6"
            whileHover={{ scale: 1.05 }}
          >
            <Shield size={48} className="text-primary" />
          </motion.div>
          
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Politique de Confidentialité</span>
          </h1>
          
          <p className="text-lg text-gray-400">
            Mise à jour : {new Date().toLocaleDateString('fr-FR')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-effect-dark p-6 rounded-2xl mb-12"
        >
          <p className="text-gray-300 text-center">
            🔒 Conforme RGPD • 🚫 Aucun tracking • ✅ Données sécurisées
          </p>
        </motion.div>

        <div className="space-y-6">
          {sections.map((section, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-effect-dark p-6 rounded-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg">
                  <section.icon size={24} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">
                    {section.title}
                  </h2>
                  <p className="text-gray-300">{section.content}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-12 text-center"
        >
          <a
            href="/contact"
            className="inline-block px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-full text-white font-semibold hover:scale-105 transition-transform"
          >
            Me contacter
          </a>
        </motion.div>
      </div>
    </div>
  )
}

export default PrivacyPage