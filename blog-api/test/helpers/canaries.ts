// Valeurs « canari » factices injectées comme secrets du serveur pendant les tests.
// Aucune réponse de l'API ne doit en contenir la moindre trace.
export const SECRET_CANARIES = {
  PINECONE_API_KEY:      'CANARY_pinecone_key_should_never_leak',
  GROQ_API_KEY:          'CANARY_groq_key_should_never_leak',
  OPENAI_API_KEY:        'CANARY_openai_key_should_never_leak',
  AI_LOG_HMAC_SECRET:    'CANARY_hmac_salt_should_never_leak',
  JWT_SECRET:            'CANARY_blog_jwt_secret_should_never_leak_0123456789',
  ADMIN_SECRET:          'CANARY_admin_bootstrap_secret_never_leak_0123456789',
  CLOUDINARY_API_SECRET: 'CANARY_cloudinary_secret_never_leak',
  MONGODB_URI:           'mongodb://canary-user:CANARY_mongo_password@127.0.0.1:1/never',
};

/** Vérifie qu'un corps de réponse ne contient aucun canari (ni fragment caractéristique) */
export function findLeakedSecret(body: string): string | null {
  for (const [name, value] of Object.entries(SECRET_CANARIES)) {
    if (body.includes(value) || body.includes('CANARY_')) return name;
  }
  return null;
}
