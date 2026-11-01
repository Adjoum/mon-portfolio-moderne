// P2 — cv-extractor : extraction du texte des CV importés, sans exécuter aucun contenu actif.
// Les vraies bibliothèques (pdf.js, mammoth, JSZip) tournent ici dans des threads, comme dans le conteneur.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
// @ts-expect-error module JavaScript du service, sans déclarations de types
import { extract } from '../../cv-extractor/src/extract.mjs'
// @ts-expect-error idem
import { rtfToText } from '../../cv-extractor/src/rtf.mjs'
// @ts-expect-error idem
import { cleanText, MAX_TEXT_CHARS } from '../../cv-extractor/src/text.mjs'
// @ts-expect-error idem
import { createServer, MAX_FILE_BYTES } from '../../cv-extractor/src/server.mjs'

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name))
const failure = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code)

describe('formats acceptés', () => {
  it('PDF avec couche texte (compilé par latex-runner)', async () => {
    const r = await extract(fixture('cv-texte.pdf'), 'pdf')
    expect(r.text).toContain('Awa Konan')
    expect(r.text).toContain('Côte')
    expect(r.needsOcr).toBe(false)
    expect(r.pages).toBe(1)
  })

  it('PDF scanné (image seule) : signalé pour la lecture par l’IA', async () => {
    const r = await extract(fixture('cv-scanne.pdf'), 'pdf')
    expect(r.needsOcr).toBe(true)
  })

  it('PDF contenant du JavaScript : texte lu, script ignoré', async () => {
    const r = await extract(fixture('cv-javascript.pdf'), 'pdf')
    expect(r.text).toContain('CV avec script')
    expect(r.text).not.toMatch(/app\.alert|submitForm/)
  })

  it('DOCX', async () => {
    const r = await extract(fixture('cv.docx'), 'docx')
    expect(r.text).toContain('Awa Konan')
    expect(r.text).toContain('Tableaux de bord Power BI pour 12 districts sanitaires')
  })

  it.each([['cv.txt'], ['cv-windows-1252.txt']])('TXT %s (UTF-8 ou Windows-1252)', async (name) => {
    const r = await extract(fixture(name), 'txt')
    expect(r.text).toContain('Santé publique')
    expect(r.text).toContain('Côte d')
  })

  it('RTF : texte et accents ; polices, image, métadonnées, objet et lien ignorés', async () => {
    const r = await extract(fixture('cv.rtf'), 'rtf')
    expect(r.text).toContain('Awa Konan')
    expect(r.text).toContain('Data Analyst – Santé publique')
    expect(r.text).toContain('Côte d’Ivoire')
    expect(r.text).toContain('Expérience : Institut fictif (2023)')
    expect(r.text).toContain('• Tableaux de bord')
    expect(r.text).toContain('Portfolio')
    expect(r.text).not.toMatch(/Calibri|Ne pas extraire|89504e47|HYPERLINK|exemple\.invalide|Traitement de texte|4571756174696f6e/)
  })
})

describe('fichiers refusés', () => {
  it('DOCX à macros', async () => {
    expect(await failure(extract(fixture('cv-macro.docx'), 'docx'))).toBe('EXTRACT_ACTIVE_CONTENT')
  })

  it('bombe de décompression : refusée avant toute lecture', async () => {
    const started = Date.now()
    expect(await failure(extract(fixture('bombe.docx'), 'docx'))).toBe('EXTRACT_TOO_COMPLEX')
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('PDF corrompu', async () => {
    expect(await failure(extract(fixture('corrompu.pdf'), 'pdf'))).toBe('EXTRACT_INVALID_FILE')
  })

  it.each([
    ['PDF annoncé DOCX', 'cv-texte.pdf', 'docx'],
    ['DOCX annoncé PDF', 'cv.docx', 'pdf'],
    ['image annoncée texte', 'cv-image.jpg', 'txt'],
    ['PDF annoncé RTF', 'cv-texte.pdf', 'rtf'],
  ])('type déclaré différent du contenu (%s)', async (_label, name, kind) => {
    expect(await failure(extract(fixture(name), kind))).toBe('EXTRACT_TYPE_MISMATCH')
  })

  it('délai dépassé : le thread d’extraction est arrêté', async () => {
    expect(await failure(extract(fixture('cv-texte.pdf'), 'pdf', 1))).toBe('EXTRACT_TIMEOUT')
  })
})

describe('texte renvoyé', () => {
  it('caractères de contrôle et de direction retirés, longueur bornée', () => {
    const { text, truncated } = cleanText(`a\u0000b${String.fromCharCode(0x202E)}c${String.fromCharCode(0x200B)}d ${'x'.repeat(MAX_TEXT_CHARS)}`)
    expect(text.startsWith('abcd ')).toBe(true)
    expect(text.length).toBe(MAX_TEXT_CHARS)
    expect(truncated).toBe(true)
  })

  it('RTF : profondeur de groupes bornée, données binaires sautées', () => {
    expect(() => rtfToText(`{\\rtf1${'{'.repeat(300)}x`)).toThrow()
    expect(cleanText(rtfToText('{\\rtf1 avant \\bin4 ABCD apr\\\'e8s}')).text).toBe('avant après')
  })
})

describe('service HTTP', () => {
  let server: Server
  let url = ''
  beforeAll(async () => {
    server = createServer()
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>(r => server.close(() => r())))

  const post = (body: Buffer, kind?: string) => fetch(`${url}/extract`, { method: 'POST', body, headers: kind ? { 'X-File-Kind': kind } : {} })

  it('extraction : JSON { text, truncated, pages, needsOcr }', async () => {
    const res = await post(fixture('cv.docx'), 'docx')
    expect(res.status).toBe(200)
    expect(Object.keys(await res.json()).sort()).toEqual(['needsOcr', 'pages', 'text', 'truncated'])
  })

  it.each([
    ['type absent', fixture('cv.txt'), undefined, 400, 'EXTRACT_UNSUPPORTED_TYPE'],
    ['type inconnu', fixture('cv.txt'), 'html', 400, 'EXTRACT_UNSUPPORTED_TYPE'],
    ['fichier vide', Buffer.alloc(0), 'txt', 400, 'EXTRACT_EMPTY'],
    ['fichier trop gros', Buffer.alloc(MAX_FILE_BYTES + 1), 'pdf', 413, 'EXTRACT_TOO_LARGE'],
    ['macro', fixture('cv-macro.docx'), 'docx', 422, 'EXTRACT_ACTIVE_CONTENT'],
  ])('%s → %i %s', async (_label, body, kind, status, code) => {
    const res = await post(body, kind)
    expect(res.status).toBe(status)
    expect((await res.json()).code).toBe(code)
  })

  it('GET /extract → 405 ; autre chemin → 404', async () => {
    expect((await fetch(`${url}/extract`)).status).toBe(405)
    expect((await fetch(`${url}/etc/passwd`)).status).toBe(404)
  })
})
