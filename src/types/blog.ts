// ═══════════════════════════════════════════════════════════
// SuperBlog — Types TypeScript & Schémas MongoDB
// Blog personnel Adjoumani Koffi Wilfried — Vibe Coding
// ═══════════════════════════════════════════════════════════

// ── MongoDB Collections ──────────────────────────────────────
//
// Collection: users
// Collection: articles
// Collection: comments  (arbre infini via parentId)
// Collection: reactions (likes/emojis par article/commentaire)
// Collection: tags
// Collection: views     (analytics SEO)
//
// Jointures (via $lookup / populate) :
//  articles  →  users    (author)
//  articles  →  tags     (tags)
//  comments  →  users    (author)
//  comments  →  comments (parentId → enfants récursifs)
//  reactions →  users    (userId)
//  reactions →  articles (targetId)
// ────────────────────────────────────────────────────────────

export interface User {
  _id: string;
  username: string;
  email: string;
  avatar?: string;
  bio?: string;
  role: 'admin' | 'visitor';
  createdAt: string;
  // MongoDB index: { email: 1 }, { username: 1 }
}

export interface Tag {
  _id: string;
  name: string;               // ex: "Python", "Oracle Cloud", "React"
  slug: string;               // ex: "python", "oracle-cloud"
  color: string;              // ex: "#00ff88"
  count: number;              // nb d'articles
  // MongoDB index: { slug: 1 } unique
}

export interface Article {
  _id: string;
  title: string;
  slug: string;               // unique, SEO-friendly
  excerpt: string;            // résumé 160 chars (meta description SEO)
  content: string;            // Markdown + code blocks + images
  coverImage?: string;        // URL image de couverture
  images: string[];           // galerie d'images uploadées
  author: User;               // $lookup users
  tags: Tag[];                // $lookup tags
  status: 'draft' | 'published';
  featured: boolean;
  readTime: number;           // minutes estimées
  views: number;
  commentsCount: number;
  reactionsCount: Record<string, number>; // { '❤️': 12, '🔥': 8, ... }
  seo: {
    title?: string;
    description?: string;
    keywords: string[];
    ogImage?: string;
  };
  series?: string;            // ex: "Oracle Cloud Chronicles"
  seriesOrder?: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  // MongoDB indexes:
  //   { slug: 1 } unique
  //   { status: 1, publishedAt: -1 }
  //   { tags: 1 }
  //   { author: 1 }
  //   text index: { title: "text", content: "text", excerpt: "text" }
}

export interface Comment {
  _id: string;
  articleId: string;          // FK → articles._id
  parentId: string | null;    // null = commentaire racine, sinon FK → comments._id
  depth: number;              // profondeur dans l'arbre (0 = racine)
  path: string;               // ex: "abc123/def456/ghi789" pour tri rapide
  author: User | GuestAuthor;
  content: string;
  isEdited: boolean;
  editedAt?: string;
  reactions: Record<string, string[]>; // { '❤️': [userId1, userId2], ... }
  replies?: Comment[];        // peuplé côté client (récursif)
  repliesCount: number;
  isDeleted: boolean;         // soft delete
  createdAt: string;
  updatedAt: string;
  // MongoDB indexes:
  //   { articleId: 1, parentId: 1, createdAt: -1 }
  //   { path: 1 }
  //   { "author._id": 1 }
}

export interface GuestAuthor {
  name: string;
  email: string;              // hashé en MD5 pour Gravatar
  website?: string;
}

export interface Reaction {
  _id: string;
  targetId: string;           // articleId ou commentId
  targetType: 'article' | 'comment';
  userId?: string;            // null si visiteur anonyme
  sessionId: string;          // fingerprint session
  emoji: string;
  createdAt: string;
  // MongoDB index: { targetId: 1, targetType: 1, sessionId: 1 } unique
}

// ── API Response types ────────────────────────────────────────
export interface PaginatedArticles {
  articles: Article[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CommentTree {
  comment: Comment;
  replies: CommentTree[];
}

// ── MongoDB Aggregation pipelines (documentation) ────────────
/*
  PIPELINE — Articles avec auteur + tags + compteurs :
  db.articles.aggregate([
    { $match: { status: "published" } },
    { $lookup: { from: "users", localField: "authorId", foreignField: "_id", as: "author" } },
    { $unwind: "$author" },
    { $lookup: { from: "tags", localField: "tagIds", foreignField: "_id", as: "tags" } },
    { $sort: { publishedAt: -1 } },
    { $limit: 10 }
  ])

  PIPELINE — Arbre de commentaires récursif (MongoDB 5.0+) :
  db.comments.aggregate([
    { $match: { articleId: ObjectId("..."), parentId: null } },
    { $graphLookup: {
        from: "comments",
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "parentId",
        as: "allReplies",
        maxDepth: 10,
        depthField: "depth"
    }},
    { $sort: { createdAt: 1 } }
  ])
*/