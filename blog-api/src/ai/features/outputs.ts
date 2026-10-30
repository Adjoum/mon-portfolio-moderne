// blog-api/src/ai/features/outputs.ts
// Contrôle des sorties structurées : le navigateur ne reçoit jamais la réponse brute du modèle.

import { ProviderError } from '../providers/types';

const MAX_DIAGRAM_NODES = 60;
const MAX_DIAGRAM_EDGES = 150;
const MAX_LIST_ITEMS = 8;

function stripFences(raw: string): string {
  return raw.replace(/^\s*```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '').trim();
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(stripFences(raw));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const shortText = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

/** Liste d'InkSpace. Un texte libre reste affichable sous forme de liste d'un élément. */
export function normalizeInkspaceOutput(raw: string): string {
  const parsed = parseObject(raw);
  const items = Array.isArray(parsed?.items)
    ? parsed.items.filter((item): item is string => typeof item === 'string').slice(0, MAX_LIST_ITEMS).map(item => item.slice(0, 500))
    : [];
  if (!parsed || !items.length) return JSON.stringify({ type: 'list', title: 'Résultat', items: [raw.slice(0, 300)] });

  const note = shortText(parsed.note, 500);
  return JSON.stringify({ type: 'list', title: shortText(parsed.title, 200), items, ...(note ? { note } : {}) });
}

/** Diagramme de NovaMind : nœuds et arêtes obligatoires, taille bornée */
export function normalizeDiagramOutput(raw: string): string {
  const parsed = parseObject(raw);
  const nodes = parsed?.nodes;
  const edges = parsed?.edges;
  const valid = typeof nodes === 'object' && nodes !== null && !Array.isArray(nodes) && Array.isArray(edges)
    && Object.keys(nodes).length > 0
    && Object.keys(nodes).length <= MAX_DIAGRAM_NODES
    && edges.length <= MAX_DIAGRAM_EDGES;
  if (!valid) throw new ProviderError('invalid_response', undefined, 'diagramme invalide');
  return JSON.stringify({ diagramType: shortText(parsed?.diagramType, 40), nodes, edges });
}
