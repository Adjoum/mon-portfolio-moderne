// blog-api/src/routes/agent.ts
// URL historique de l'assistant Clone IA : simple adaptateur de la passerelle IA
// (historique validé, recherche Pinecone et prompt système côté serveur).

import { Router } from 'express';
import { featureLimiter, respondWithFeature } from './ai';
import type { AiGateway } from '../ai/services/gateway';

export function createAgentRouter(gateway: AiGateway) {
  const router = Router();

  router.post('/chat', featureLimiter(gateway, 'agent.chat'), (req, res) =>
    respondWithFeature(gateway, 'agent.chat', req, res, content => ({ reply: content })));

  return router;
}
