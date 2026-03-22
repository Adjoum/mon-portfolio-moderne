// src/lib/api.ts
// Il communique uniquement via HTTP → cette librairie

import type { Article, Tag } from '../types/blog';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

// ── Fetch générique ───────────────────────────────────────────
export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = localStorage.getItem('blog_token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// ── Articles ──────────────────────────────────────────────────
export const getArticles = (params = '') =>
  apiFetch<{ articles: Article[]; total: number; hasMore: boolean }>(`/articles${params}`);

export const getArticle = (slug: string) =>
  apiFetch<Article>(`/articles/${slug}`);

// Par _id — pour l'éditeur admin (Modifier)
export const getArticleById = (id: string) =>
  apiFetch<Article>(`/articles/id/${id}`);

// Supprimer un article par _id
export const deleteArticle = (id: string) =>
  apiFetch<void>(`/articles/${id}`, { method: 'DELETE' });

// ── Tags ──────────────────────────────────────────────────────
export const getTags = () =>
  apiFetch<Tag[]>('/tags');

// ── Commentaires ──────────────────────────────────────────────
export const getComments = (articleId: string) =>
  apiFetch<{ comments: any[]; total: number }>(`/comments/${articleId}`);

export const postComment = (data: object) =>
  apiFetch<any>('/comments', { method: 'POST', body: JSON.stringify(data) });

export const editComment = (id: string, content: string) =>
  apiFetch<any>(`/comments/${id}`, { method: 'PUT', body: JSON.stringify({ content }) });

export const deleteComment = (id: string) =>
  apiFetch<void>(`/comments/${id}`, { method: 'DELETE' });

// ── Auth ──────────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  apiFetch<{ token: string; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const logout = () =>
  apiFetch<void>('/auth/logout', { method: 'POST' });

export const getMe = () =>
  apiFetch<any>('/auth/me');


















// // src/lib/api.ts
// // Centralise tous les appels vers blog-api
// // Le frontend NE IMPORTE JAMAIS depuis blog-api/src/models
// // Il communique uniquement via HTTP → cette librairie

// import type { Article, Tag } from '../types/blog';

// const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

// // ── Fetch générique ───────────────────────────────────────────
// export async function apiFetch<T>(
//   path: string,
//   options?: RequestInit
// ): Promise<T> {
//   const token = localStorage.getItem('blog_token');
//   const res = await fetch(`${BASE}${path}`, {
//     ...options,
//     credentials: 'include',
//     headers: {
//       'Content-Type': 'application/json',
//       ...(token ? { Authorization: `Bearer ${token}` } : {}),
//       ...options?.headers,
//     },
//   });
//   if (!res.ok) throw await res.json();
//   return res.json();
// }

// // ── Articles ──────────────────────────────────────────────────
// export const getArticles = (params = '') =>
//   apiFetch<{ articles: Article[]; total: number; hasMore: boolean }>(`/articles${params}`);

// export const getArticle = (slug: string) =>
//   apiFetch<Article>(`/articles/${slug}`);

// // ── Tags ──────────────────────────────────────────────────────
// export const getTags = () =>
//   apiFetch<Tag[]>('/tags');

// // ── Commentaires ──────────────────────────────────────────────
// export const getComments = (articleId: string) =>
//   apiFetch<{ comments: any[]; total: number }>(`/comments/${articleId}`);

// export const postComment = (data: object) =>
//   apiFetch<any>('/comments', { method: 'POST', body: JSON.stringify(data) });

// export const editComment = (id: string, content: string) =>
//   apiFetch<any>(`/comments/${id}`, { method: 'PUT', body: JSON.stringify({ content }) });

// export const deleteComment = (id: string) =>
//   apiFetch<void>(`/comments/${id}`, { method: 'DELETE' });

// // ── Auth ──────────────────────────────────────────────────────
// export const login = (email: string, password: string) =>
//   apiFetch<{ token: string; user: any }>('/auth/login', {
//     method: 'POST',
//     body: JSON.stringify({ email, password }),
//   });

// export const logout = () =>
//   apiFetch<void>('/auth/logout', { method: 'POST' });

// export const getMe = () =>
//   apiFetch<any>('/auth/me');