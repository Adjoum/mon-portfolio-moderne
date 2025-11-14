import React from 'react'
import { motion } from 'framer-motion'
import { Shield, FileText, Lock, Eye, AlertCircle, CheckCircle } from 'lucide-react'

const TermsPage: React.FC = () => {
  const sections = [
    {
      icon: FileText,
      title: "1. Acceptation des Conditions",
      content: `En accédant et en utilisant ce portfolio professionnel, vous acceptez d'être lié par ces Conditions Générales d'Utilisation (CGU). Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser ce site.`
    },
    {
      icon: Eye,
      title: "2. Propriété Intellectuelle",
      content: `Tous les contenus présents sur ce site (textes, images, graphiques, logos, code source) sont la propriété exclusive d'Adjoumani ou de leurs auteurs respectifs. Toute reproduction, distribution, modification ou utilisation commerciale sans autorisation préalable est strictement interdite.`
    },
    {
      icon: Lock,
      title: "3. Utilisation du Site",
      content: `Ce site est destiné à présenter mes compétences et projets professionnels. Vous vous engagez à :

• Ne pas tenter d'accéder à des zones restreintes sans autorisation
• Ne pas perturber le fonctionnement du site
• Ne pas extraire ou copier du contenu de manière automatisée
• Utiliser le site uniquement à des fins légales`
    },
    {
      icon: Shield,
      title: "4. Protection des Données",
      content: `Conformément au RGPD :

• Les données collectées sont utilisées uniquement pour répondre à vos demandes
• Vos données ne sont jamais vendues ou partagées
• Vous disposez d'un droit d'accès, de rectification et de suppression
• Les données sont stockées de manière sécurisée`
    },
    {
      icon: AlertCircle,
      title: "5. Limitation de Responsabilité",
      content: `Ce site est fourni "tel quel" sans garantie. Je ne saurais être tenu responsable de :

• L'exactitude des informations
• Les interruptions de service
• Les éventuels dommages liés à l'utilisation
• Les liens externes`
    },
    {
      icon: CheckCircle,
      title: "6. Modifications",
      content: `Je me réserve le droit de modifier ces CGU à tout moment. Les modifications prennent effet dès leur publication.`
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
            whileHover={{ scale: 1.05, rotate: 360 }}
            transition={{ duration: 0.5 }}
          >
            <FileText size={48} className="text-primary" />
          </motion.div>
          
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Conditions Générales d'Utilisation</span>
          </h1>
          
          <p className="text-lg text-gray-400">
            Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-effect-dark p-8 rounded-2xl mb-12"
        >
          <p className="text-lg text-gray-300 leading-relaxed">
            Ces Conditions Générales d'Utilisation définissent les règles d'utilisation de ce site web. 
            En naviguant sur ce site, vous acceptez pleinement ces conditions.
          </p>
        </motion.div>

        <div className="space-y-8 mb-12">
          {sections.map((section, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              className="glass-effect-dark p-8 rounded-2xl hover:border-primary border border-transparent transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl flex-shrink-0">
                  <section.icon size={28} className="text-primary" />
                </div>
                
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white mb-4">
                    {section.title}
                  </h2>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-line">
                    {section.content}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="glass-effect-dark p-8 rounded-2xl text-center"
        >
          <h3 className="text-2xl font-bold text-white mb-4">
            Questions ?
          </h3>
          <p className="text-gray-300 mb-6">
            Pour toute question concernant ces CGU, n'hésitez pas à me contacter.
          </p>
          <a
            href="/contact"
            className="inline-block px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-full text-white font-semibold hover:scale-105 transition-transform"
          >
            Me contacter
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center mt-12 text-gray-500 text-sm"
        >
          <p>© {new Date().getFullYear()} Adjoumani - Tous droits réservés</p>
        </motion.div>
      </div>
    </div>
  )
}

export default TermsPage