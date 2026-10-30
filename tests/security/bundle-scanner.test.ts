// P0.A2 — Scanner de bundle (scripts/check-bundle-secrets.mjs) : il doit détecter les vraies fuites
// et ne jamais révéler une valeur secrète dans son rapport.
import { describe, it, expect } from 'vitest'
// @ts-expect-error module JavaScript sans déclaration de types
import { scanText } from '../../scripts/check-bundle-secrets.mjs'

const fakeJwt = (payload: object) =>
  ['{"alg":"HS256"}', JSON.stringify(payload)].map(p => Buffer.from(p).toString('base64url')).join('.') + '.c2lnbmF0dXJlLWZhY3RpY2U'

describe('scanText', () => {
  it.each([
    ['clé OpenAI de compte de service', 'const k="sk-svcacct-' + 'A'.repeat(40) + '"', 'Clé OpenAI'],
    ['clé Groq',                        'k="gsk_' + 'b'.repeat(40) + '"',             'Clé Groq'],
    ['clé Anthropic',                   'sk-ant-api03-' + 'c'.repeat(40),             'Clé Anthropic'],
    // construite à l'exécution pour ne pas déclencher les scanners de secrets du dépôt
    ['chaîne MongoDB',                  '"mongodb+srv://' + 'user:' + 'p4ss' + '@cluster.example.net/db"', 'Chaîne MongoDB avec mot de passe'],
  ])('détecte : %s', (_label, text, name) => {
    expect(scanText(text).map((f: { name: string }) => f.name)).toContain(name)
  })

  it('détecte un appel direct à un fournisseur', () => {
    expect(scanText('fetch("https://api.openai.com/v1/chat/completions")')).toEqual([{ type: 'provider-host', name: 'api.openai.com' }])
  })

  it('détecte un JWT Supabase service_role mais pas la clé anon publique', () => {
    expect(scanText(`k="${fakeJwt({ role: 'service_role' })}"`).length).toBe(1)
    expect(scanText(`k="${fakeJwt({ role: 'anon' })}"`)).toEqual([])
  })

  it('détecte la valeur exacte d’un secret local, en ne rapportant que son nom', () => {
    const secretValues = new Map([['.env:MY_SECRET_TOKEN', 'valeur-tres-secrete-123456']])
    const findings = scanText('x="valeur-tres-secrete-123456"', { secretValues })
    expect(findings).toEqual([{ type: 'env-value', name: '.env:MY_SECRET_TOKEN' }])
    expect(JSON.stringify(findings)).not.toContain('valeur-tres-secrete')
  })

  it('pas de faux positif sur du CSS ou du code courant', () => {
    expect(scanText('.react-flow__minimap-mask-background-color{} task-runner-something-long desk-organizer-items')).toEqual([])
  })
})
