// P4 — « Mes CV » : le mode d'enregistrement est décidé par la base (cv_history_allowed), l'envoi
// au serveur respecte l'ordre ligne → fichiers, et rien n'est conservé si un fichier échoue.
// Client Supabase simulé : aucun appel réseau (les droits réels : scripts/cv-history-recette.mjs).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: string[] = []
let session: { user: { id: string } } | null = { user: { id: 'u1' } }
let allowed: unknown = true
let uploadFails = false
let insertError: { message: string } | null = null

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session } }) },
    rpc: async (name: string) => { calls.push(`rpc:${name}`); return { data: allowed, error: null } },
    from: () => ({
      insert: async (row: Record<string, unknown>) => { calls.push(`insert:${row.pdf_path}|${row.tex_path}|${row.owner_id}`); return { error: insertError } },
      delete: () => ({ eq: async (_c: string, id: string) => { calls.push(`delete:${id}`); return { error: null } } }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string, _b: Blob, o: { contentType: string; upsert: boolean }) => { calls.push(`upload:${path}:${o.contentType}:${o.upsert}`); return { error: uploadFails && path.endsWith('.tex') ? { message: 'refusé' } : null } },
        remove: async (paths: string[]) => { calls.push(`remove:${paths.join(',')}`); return { error: null } },
      }),
    },
  },
}))

const { detectMode, history, restorableCode, cleanTitle } = await import('./history')
const input = { title: '  CV —  Awa  ', templateId: 'silicon-valley', target: { organization: 'Hôpital', role: '' }, pdf: new Blob(['%PDF-1.5']), tex: '\\documentclass{article}' }

beforeEach(() => {
  calls.length = 0
  session = { user: { id: 'u1' } }
  allowed = true
  uploadFails = false
  insertError = null
})

describe('mode d’enregistrement', () => {
  it('serveur seulement si la base l’autorise (administrateur avec MFA)', async () => {
    expect(await detectMode()).toBe('server')
    allowed = false
    expect(await detectMode()).toBe('device')
  })

  it('visiteur sans session : appareil, sans interroger la base', async () => {
    session = null
    expect(await detectMode()).toBe('device')
    expect(calls).toEqual([])
  })
})

describe('enregistrement sur le serveur', () => {
  it('ligne d’abord (quota vérifié par la base), puis PDF et .tex dans le dossier du propriétaire, sans remplacement', async () => {
    const saved = await history.server.save(input)
    expect(saved.title).toBe('CV — Awa')
    expect(calls[0]).toMatch(/^insert:u1\/[0-9a-f-]{36}\.pdf\|u1\/[0-9a-f-]{36}\.tex\|u1$/)
    expect(calls[1]).toMatch(/^upload:u1\/[0-9a-f-]{36}\.pdf:application\/pdf:false$/)
    expect(calls[2]).toMatch(/^upload:u1\/[0-9a-f-]{36}\.tex:application\/x-tex:false$/)
  })

  it('échec d’un fichier : fichiers et ligne retirés, rien n’est conservé', async () => {
    uploadFails = true
    await expect(history.server.save(input)).rejects.toThrow(/rien n’a été conservé/)
    expect(calls.some(c => c.startsWith('remove:'))).toBe(true)
    expect(calls.some(c => c.startsWith('delete:'))).toBe(true)
  })

  it('quota atteint : message clair', async () => {
    insertError = { message: 'cv_history_quota' }
    await expect(history.server.save(input)).rejects.toThrow(/Limite de 30 CV/)
  })

  it('session expirée : rien n’est envoyé', async () => {
    session = null
    await expect(history.server.save(input)).rejects.toThrow(/reconnectez-vous/)
    expect(calls).toEqual([])
  })
})

describe('restauration', () => {
  it('la photo, absente de l’historique, redevient le marqueur', () => {
    expect(restorableCode('a \\includegraphics[width=3.2cm,keepaspectratio]{photo.jpg} b')).toBe('a %%PHOTO%% b')
    expect(restorableCode('\\includegraphics{logo.png}')).toBe('\\includegraphics{logo.png}')
  })

  it('titre nettoyé et borné', () => {
    expect(cleanTitle('   ')).toBe('CV sans titre')
    expect(cleanTitle('x'.repeat(200))).toHaveLength(120)
  })
})
