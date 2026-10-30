// blog-api/src/lib/publicComment.ts
// Représentation PUBLIQUE d'un commentaire, construite en liste blanche.
// Jamais exposés : e-mail des invités, identifiants de session des réactions,
// champs internes ajoutés plus tard au modèle (tout champ non listé ici est exclu).

type Id = { toString(): string };

interface RawComment {
  _id: Id;
  articleId?: Id | null;
  parentId?: Id | null;
  depth?: number | null;
  path?: string | null;
  authorId?: unknown;
  guestName?: string | null;
  content?: string | null;
  isEdited?: boolean | null;
  editedAt?: Date | null;
  reactions?: Map<string, string[]> | Record<string, string[]> | null;
  repliesCount?: number | null;
  isDeleted?: boolean | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

interface PopulatedUser { _id: Id; username?: string; avatar?: string; role?: string }

function isPopulatedUser(value: unknown): value is PopulatedUser {
  return typeof value === 'object' && value !== null && 'username' in value;
}

/** Réactions : nombre par emoji (les identifiants de session restent privés) */
export function reactionCounts(reactions: RawComment['reactions']): Record<string, number> {
  const entries = reactions instanceof Map ? [...reactions.entries()] : Object.entries(reactions ?? {});
  return Object.fromEntries(entries.map(([emoji, ids]) => [emoji, Array.isArray(ids) ? ids.length : 0]));
}

export function toPublicComment(c: RawComment) {
  const user = isPopulatedUser(c.authorId) ? c.authorId : null;
  return {
    _id:          c._id.toString(),
    articleId:    c.articleId?.toString(),
    parentId:     c.parentId ? c.parentId.toString() : null,
    depth:        c.depth ?? 0,
    path:         c.path,
    author:       user
      ? { _id: user._id.toString(), username: user.username, avatar: user.avatar, role: user.role }
      : { name: c.guestName || 'Invité' },
    content:      c.isDeleted ? '' : c.content ?? '',
    isEdited:     !!c.isEdited,
    editedAt:     c.editedAt,
    reactions:    reactionCounts(c.reactions),
    repliesCount: c.repliesCount ?? 0,
    isDeleted:    !!c.isDeleted,
    createdAt:    c.createdAt,
    updatedAt:    c.updatedAt,
  };
}
