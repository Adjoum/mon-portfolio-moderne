// P7.3 — Chemin d'administration : configuration du build, outils locaux, journaux et analytics.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import nodeCrypto from 'node:crypto'
import { ADMIN_PATH_PATTERN, analyticsOptOutScript, measurementIds } from '../../vite-plugins/adminPrivacy'
import { adminRouteHashStatus } from '../../vite-plugins/publicEnv'
import { envHash, hashSegment, newSegment, SEGMENT_RE } from '../../scripts/lib/admin-route.mjs'
import { scanText } from '../../scripts/check-bundle-secrets.mjs'
import { ADMIN_SEGMENT_RE } from '../../src/lib/adminRoute'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('génération du chemin (scripts/admin-route.mjs)', () => {
  it('192 bits du générateur cryptographique, base64url, jamais deux fois le même', () => {
    const values = new Set(Array.from({ length: 200 }, () => newSegment()))
    expect(values.size).toBe(200)
    for (const v of values) {
      expect(v).toMatch(/^[A-Za-z0-9_-]{32}$/)
      expect(v).toMatch(SEGMENT_RE)
      expect(v).toMatch(ADMIN_SEGMENT_RE)
    }
    expect(read('scripts/lib/admin-route.mjs')).toMatch(/crypto\.randomBytes\(24\)\.toString\('base64url'\)/)
  })

  it('empreinte identique à celle du navigateur (SHA-256 hexadécimal)', () => {
    const s = newSegment()
    expect(hashSegment(s)).toBe(nodeCrypto.createHash('sha256').update(s).digest('hex'))
  })

  it('lecture de VITE_ADMIN_ROUTE_HASH dans un fichier d’environnement', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-route-'))
    const file = path.join(dir, '.env')
    fs.writeFileSync(file, 'VITE_API_URL=x\nVITE_ADMIN_ROUTE_HASH="abc"\n')
    expect(envHash(file)).toBe('abc')
    fs.writeFileSync(file, 'VITE_API_URL=x\n')
    expect(envHash(file)).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('le chemin n’est jamais affiché par l’outil, ni écrit hors de secrets/', () => {
    const cli = read('scripts/admin-route.mjs')
    // Seule l'empreinte du segment est affichée, jamais le segment lui-même
    expect(cli).not.toMatch(/\$\{segment\}|console\.(log|error)\(segment/)
    expect(cli).toMatch(/VITE_ADMIN_ROUTE_HASH=\$\{hashSegment\(segment\)\}/)
    expect(read('scripts/lib/admin-route.mjs')).toMatch(/path\.join\(ROOT, 'secrets', 'admin-route'\)/)
    expect(read('.gitignore')).toMatch(/^secrets\/$/m)
  })
})

describe('configuration du build', () => {
  it('empreinte valide, absente ou invalide (chemin collé par erreur : build refusé)', () => {
    expect(adminRouteHashStatus({})).toBe('absent')
    expect(adminRouteHashStatus({ VITE_ADMIN_ROUTE_HASH: 'a'.repeat(64) })).toBe('valide')
    expect(adminRouteHashStatus({ VITE_ADMIN_ROUTE_HASH: newSegment() })).toBe('invalide')
    const config = read('vite.config.ts')
    expect(config).toMatch(/adminRoute === 'invalide'[\s\S]*throw new Error/)
    expect(config).toMatch(/adminSegments\.some\(s => text\.includes\(s\)\)/)
  })

  it('un chemin d’administration en clair dans le bundle est détecté (sans être affiché)', () => {
    const s = newSegment()
    const findings = scanText(`const r = "/${s}"`, { secretValues: new Map([['admin-route:production', s]]) })
    expect(findings).toEqual([{ type: 'env-value', name: 'admin-route:production' }])
    expect(JSON.stringify(findings)).not.toContain(s)
  })
})

describe('mesure d’audience coupée sur l’administration', () => {
  const html = read('index.html')
  const run = (pathname: string) => {
    const window: Record<string, unknown> = {}
    vm.runInNewContext(analyticsOptOutScript(measurementIds(html)), { window, location: { pathname } })
    return window
  }

  it('identifiant de mesure lu dans index.html', () => {
    expect(measurementIds(html)).toEqual(['G-7CTJQHVB7H'])
    expect(analyticsOptOutScript([])).toBe('')
  })

  it('administration : exclusion officielle de gtag.js ; pages publiques : inchangé', () => {
    expect(run(`/${newSegment()}`)).toEqual({ 'ga-disable-G-7CTJQHVB7H': true })
    expect(run(`/${newSegment()}/knowledge`)).toEqual({ 'ga-disable-G-7CTJQHVB7H': true })
    for (const p of ['/', '/about', '/blog/un-article-au-titre-tres-long-pour-le-test', '/admin', '/cv-generator']) expect(run(p)).toEqual({})
  })

  it('même forme que le routeur', () => {
    const re = new RegExp(ADMIN_PATH_PATTERN)
    for (const s of [newSegment(), 'a'.repeat(31), 'a'.repeat(128), 'a'.repeat(129)]) {
      expect(re.test(`/${s}`)).toBe(ADMIN_SEGMENT_RE.test(s))
    }
  })

  it('plugin branché, index.html laissé intact', () => {
    expect(read('vite.config.ts')).toMatch(/adminPrivacy\(\),/)
    expect(html).not.toMatch(/ga-disable/)
  })

  it('le suivi des visites ignore l’administration et sa provenance', () => {
    const tracker = read('src/hooks/useVisitTracker.ts')
    expect(tracker).toMatch(/if\(looksLikeAdminPath\(location\.pathname\)\) return/)
    expect(tracker).toMatch(/looksLikeAdminPath\(from\.pathname\)\) return null/)
  })
})

describe('anti-indexation (pas une protection d’accès)', () => {
  it('administration, éditeur du blog et 404 : noindex ; administration sans Referer', () => {
    expect(read('src/components/admin/AdminArea.tsx')).toMatch(/useNoIndex\(\{ noReferrer: true \}\)/)
    expect(read('src/pages/AdminBlogPage.tsx')).toMatch(/useNoIndex\(\)/)
    expect(read('src/pages/NotFoundPage.tsx')).toMatch(/useNoIndex\(\)/)
    expect(read('src/hooks/useNoIndex.ts')).toMatch(/noindex, nofollow, noarchive/)
  })

  it('le chemin n’apparaît dans aucun fichier de configuration versionné', () => {
    for (const file of ['vercel.json', 'nginx.conf', 'index.html', 'Dockerfile.frontend']) {
      expect(read(file), file).not.toMatch(/\/[A-Za-z0-9_-]{32,128}(["'/\s]|$)/m)
    }
  })
})
