// src/features/latex-studio/useVersions.ts
// Versions de la session : un instantané est pris avant chaque transformation (correction IA,
// génération, amélioration, template, import), pour revenir à la version précédente à tout moment.
// Conservé dans sessionStorage (cet onglet seulement, effacé à sa fermeture), jamais sur un serveur.

import { useCallback, useEffect, useState } from 'react'

export interface CodeVersion { id: string; label: string; code: string; at: number }

const KEY = 'latex-studio:versions'
const MAX_VERSIONS = 30

function load(): CodeVersion[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(v => typeof v?.code === 'string').slice(-MAX_VERSIONS) : []
  } catch {
    return []
  }
}

export function useVersions(code: string, setCode: (code: string) => void) {
  const [versions, setVersions] = useState<CodeVersion[]>(load)

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(versions)) } catch { /* stockage plein ou désactivé */ }
  }, [versions])

  /** Instantané du code actuel, avant une transformation */
  const snapshot = useCallback((label: string, current = code) => {
    setVersions(list => list.at(-1)?.code === current ? list : [...list, { id: crypto.randomUUID(), label, code: current, at: Date.now() }].slice(-MAX_VERSIONS))
  }, [code])

  /** Remplace le code après un instantané : la version remplacée reste restaurable */
  const replace = useCallback((next: string, label: string) => {
    if (next === code) return
    snapshot(label)
    setCode(next)
  }, [code, setCode, snapshot])

  const restore = useCallback((id: string) => {
    const version = versions.find(v => v.id === id)
    if (!version) return
    snapshot('Avant restauration')
    setCode(version.code)
  }, [versions, snapshot, setCode])

  /** Version précédente : le dernier instantané différent du code actuel */
  const undo = useCallback(() => {
    const previous = [...versions].reverse().find(v => v.code !== code)
    if (!previous) return false
    setVersions(list => [...list.filter(v => v.id !== previous.id), { id: crypto.randomUUID(), label: 'Annulé', code, at: Date.now() }].slice(-MAX_VERSIONS))
    setCode(previous.code)
    return true
  }, [versions, code, setCode])

  const canUndo = versions.some(v => v.code !== code)
  return { versions, snapshot, replace, restore, undo, canUndo }
}
