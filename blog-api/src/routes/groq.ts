// blog-api/src/routes/groq.ts
// URL historiques d'InkSpace et de NovaMind : simples adaptateurs de la passerelle IA.
// Le fournisseur et le modèle sont résolus par fonctionnalité : le nom de la route ne
// préjuge plus de Groq. Seul le format de réponse attendu par ces clients est conservé.

import { Router } from 'express';
import { featureLimiter, respondWithFeature } from './ai';
import type { AiGateway } from '../ai/services/gateway';

export function createGroqRouter(gateway: AiGateway) {
  const router = Router();

  // InkSpace (app statique) lit choices[0].message.content
  router.post('/generate', featureLimiter(gateway, 'inkspace.generate'), (req, res) =>
    respondWithFeature(gateway, 'inkspace.generate', req, res, content => ({ choices: [{ message: { content } }] })));

  // NovaMind reçoit directement le diagramme, validé par la passerelle
  router.post('/generate-diagram', featureLimiter(gateway, 'novamind.diagram'), (req, res) =>
    respondWithFeature(gateway, 'novamind.diagram', req, res, content => JSON.parse(content)));

  return router;
}
