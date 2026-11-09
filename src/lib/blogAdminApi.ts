// src/lib/blogAdminApi.ts
// Écritures d'administration du blog (articles, brouillons, images) avec le jeton de session
// Supabase : blog-api exige l'administrateur du portfolio, la MFA (aal2) et une session ouverte.
// Le jeton du blog (compte MongoDB, mot de passe seul) n'y donne plus accès.

import { adminFetch, describeAdminApiError } from './adminAuth'
import type { Article } from '../types/blog'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

async function adminJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const res = await adminFetch(`${BASE}${path}`, { ...init, headers })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(describeAdminApiError(res.status, body))
  return body as T
}

const at = (id: string) => `/articles/${encodeURIComponent(id)}`

/** Article par identifiant, brouillon compris (éditeur) */
export const getArticleForEdit = (id: string) => adminJson<Article>(`/articles/id/${encodeURIComponent(id)}`)

/** Création (sans id) ou modification */
export const saveArticle = (payload: object, id?: string) =>
  adminJson<Article>(id ? at(id) : '/articles', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) })

export const deleteArticleAsAdmin = (id: string) => adminJson<{ success: boolean }>(at(id), { method: 'DELETE' })

export function uploadBlogImage(file: File) {
  const form = new FormData()
  form.append('image', file)
  return adminJson<{ url: string }>('/upload', { method: 'POST', body: form })
}
