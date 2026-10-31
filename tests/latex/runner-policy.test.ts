// latex-runner : politique de compilation, analyse du journal et validation des requêtes.
// Tests sans TeX (sur l'hôte). La compilation réelle est couverte par scripts/latex-recette.mjs.
import { describe, it, expect } from 'vitest'
// @ts-expect-error module JavaScript du service, sans déclarations de types
import { checkSource, PolicyError, ALLOWED_PACKAGES, MAX_SOURCE_BYTES } from '../../latex-runner/src/policy.mjs'
// @ts-expect-error idem
import { parseLog, sanitize, needsRerun } from '../../latex-runner/src/log.mjs'
// @ts-expect-error idem
import { parseJob, MAX_PHOTO_BYTES } from '../../latex-runner/src/server.mjs'
import { TEMPLATES, buildFinalLatex } from '../../src/pages/CVBuilder/latexTemplates'

const doc = (body: string, preamble = '') => `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`

function refusal(source: string): { code: string; subject?: string; line?: number } | null {
  try {
    checkSource(source)
    return null
  } catch (err) {
    expect(err).toBeInstanceOf(PolicyError)
    const e = err as { code: string; subject?: string; line?: number }
    return { code: e.code, subject: e.subject, line: e.line }
  }
}

describe('politique : documents légitimes acceptés', () => {
  it.each(Object.entries(TEMPLATES))('template %s (avec et sans photo)', (_id, template) => {
    expect(refusal(buildFinalLatex(template.code, false, 3.2))).toBeNull()
    expect(refusal(buildFinalLatex(template.code, true, 3.2))).toBeNull()
  })

  it('« \\\\ » suivi d’un mot n’est pas une commande (\\\\write = saut de ligne + « write »)', () => {
    expect(refusal(doc('Ligne\\\\write et \\\\input, \\inputencoding'))).toBeNull()
  })

  it('tous les paquets autorisés, chargés ensemble ou séparément', () => {
    expect(refusal(doc('x', `\\usepackage{${[...ALLOWED_PACKAGES].join(',')}}\n`))).toBeNull()
    expect(refusal(doc('x', '\\usepackage[utf8]{inputenc}\n\\usepackage[a4paper, margin=2cm]{geometry}\n\\usepackage{amsmath,\n  amssymb}\n'))).toBeNull()
  })
})

describe('politique : documents malveillants refusés avant TeX', () => {
  it.each([
    ['\\immediate\\write18{env > /tmp/x}', '\\write'],
    ['\\immediate\\pdfobj stream file {/etc/passwd}', '\\pdfobj'],
    ['\\write18{curl https://exemple.invalide}', '\\write'],
    ['\\input{/etc/passwd}', '\\input'],
    ['\\input|"env"', '\\input'],
    ['\\include{../secret}', '\\include'],
    ['\\newread\\r\\openin\\r=/proc/self/environ', '\\newread'],
    ['\\pdfobj stream file {/etc/passwd}', '\\pdfobj'],
    ['\\pdffiledump length 100 {/etc/passwd}', '\\pdffiledump'],
    ['\\pdfmdfivesum file {/etc/passwd}', '\\pdfmdfivesum'],
    ['\\pdfximage{/etc/hostname}', '\\pdfximage'],
    ['\\catcode`\\X=0 Xwrite18{id}', '\\catcode'],
    ['\\csname write\\endcsname18{id}', '\\csname'],
    ['\\scantokens{\\write18{id}}', '\\scantokens'],
    ['\\makeatletter\\@@input /etc/passwd', '\\makeatletter'],
    ['\\ExplSyntaxOn \\iow_open:Nn', '\\ExplSyntaxOn'],
    ['\\directlua{os.execute("id")}', '\\directlua'],
    ['\\font\\x=/etc/passwd', '\\font'],
    ['\\verbatiminput{/etc/passwd}', '\\verbatiminput'],
  ])('%s', (body, subject) => {
    const r = refusal(doc(body))
    expect(r?.code).toBe('LATEX_FORBIDDEN_COMMAND')
    expect(r?.subject).toBe(subject)
    expect(r?.line).toBe(3)
  })

  it('notation ^^ : fabriquer une barre oblique inverse', () => {
    expect(refusal(doc('^^5cwrite18{id}'))).toMatchObject({ code: 'LATEX_FORBIDDEN_COMMAND', subject: '^^' })
  })

  it('environnement filecontents : un .sty écrit dans le dossier remplacerait un paquet relu', () => {
    const source = `\\begin{filecontents*}{hyperref.sty}\n\\end{filecontents*}\n${doc('x')}`
    expect(refusal(source)?.subject).toBe('filecontents*')
  })

  it('les commentaires sont aussi contrôlés (\\verb peut les neutraliser)', () => {
    expect(refusal(doc('\\verb|50%|\\write18{id}'))?.subject).toBe('\\write')
    expect(refusal(doc('% \\input{/etc/passwd}'))?.subject).toBe('\\input')
  })

  it.each([
    ['\\usepackage{shellesc}', 'shellesc'],
    ['\\usepackage{minted}', 'minted'],
    ['\\usepackage{fontawesome5}', 'fontawesome5'],
    ['\\usepackage{amsmath,attachfile}', 'attachfile'],
    ['\\RequirePackage{embedfile}', 'embedfile'],
  ])('paquet hors liste : %s', (preamble, name) => {
    expect(refusal(doc('x', `${preamble}\n`))).toMatchObject({ code: 'LATEX_PACKAGE_NOT_ALLOWED', subject: name })
  })

  it('classe hors liste, classe absente ou multiple', () => {
    expect(refusal('\\documentclass{moderncv}\\begin{document}x\\end{document}')).toMatchObject({ code: 'LATEX_CLASS_NOT_ALLOWED', subject: 'moderncv' })
    expect(refusal('\\begin{document}x\\end{document}')?.code).toBe('LATEX_CLASS_NOT_ALLOWED')
    expect(refusal(`${doc('x')}\\documentclass{report}`)?.code).toBe('LATEX_CLASS_NOT_ALLOWED')
  })

  it('chargement non analysable : refusé plutôt qu’ignoré', () => {
    expect(refusal(doc('x', '\\usepackage{\\nomdepaquet}\n'))).toMatchObject({ code: 'LATEX_PACKAGE_NOT_ALLOWED', subject: '\\nomdepaquet' })
    expect(refusal(doc('x', '\\usepackage[a={b]}]{geometry}\n'))?.code).toBe('LATEX_INVALID_SOURCE')
  })

  it('source vide, trop volumineux ou contenant des caractères de contrôle', () => {
    expect(refusal('   ')?.code).toBe('LATEX_INVALID_SOURCE')
    expect(refusal(doc('x'.repeat(MAX_SOURCE_BYTES)))?.code).toBe('LATEX_TOO_LARGE')
    expect(refusal(doc('a\u0000b'))?.code).toBe('LATEX_INVALID_SOURCE')
    expect(refusal(doc('a\u001bb'))?.code).toBe('LATEX_INVALID_SOURCE')
  })
})

describe('journal TeX : erreurs filtrées, jamais le journal brut', () => {
  const LOG = [
    'This is pdfTeX, Version 3.141592653-2.6-1.40.24 (TeX Live 2022/Debian) (preloaded format=pdflatex)',
    '(/usr/share/texlive/texmf-dist/tex/latex/base/article.cls',
    './main.tex:12: Undefined control sequence.',
    'l.12 \\textbfz',
    '              {Nom}',
    '/usr/share/texlive/texmf-dist/tex/latex/xcolor/xcolor.sty:1290: Package xcolor Error: Undefined color `bleu\'.',
    'See the xcolor package documentation for explanation.',
    '!pdfTeX error: pdflatex: cannot find image file /work/job-AbC123/photo.jpg',
    ' ==> Fatal error occurred, no output PDF file produced!',
  ].join('\n')

  it('ligne, message et extrait du document ; aucun chemin ni version', () => {
    const errors = parseLog(LOG)
    expect(errors[0]).toEqual({ line: 12, message: 'Undefined control sequence.', context: '\\textbfz {Nom}' })
    expect(errors[1]).toEqual({ message: 'Package xcolor Error: Undefined color `bleu\'. (dans xcolor.sty)' })
    expect(errors[2].message).toBe('pdfTeX error: pdflatex: cannot find image file photo.jpg')
    const text = JSON.stringify(errors)
    expect(text).not.toMatch(/\/usr\/|\/work\/|job-|TeX Live|pdfTeX, Version/)
  })

  it('cinq erreurs au plus, messages bornés, caractères de contrôle retirés', () => {
    const many = Array.from({ length: 20 }, (_, i) => `./main.tex:${i + 1}: Erreur ${'x'.repeat(500)}\u0007`).join('\n')
    const errors = parseLog(many)
    expect(errors).toHaveLength(5)
    for (const e of errors) {
      expect(e.message.length).toBeLessThanOrEqual(240)
      // eslint-disable-next-line no-control-regex
      expect(e.message).not.toMatch(/[\u0000-\u001f]/)
    }
  })

  it('les URL du document restent lisibles, les chemins du conteneur disparaissent', () => {
    expect(sanitize('\\href{https://github.com/Adjoum}{GitHub} /etc/passwd ./main.tex')).toBe('\\href{https://github.com/Adjoum}{GitHub} passwd main.tex')
  })

  it('passe supplémentaire seulement si TeX la demande', () => {
    expect(needsRerun('LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.')).toBe(true)
    expect(needsRerun('Output written on main.pdf (1 page).')).toBe(false)
  })
})

describe('requête du runner : exactement { tex, photo? }', () => {
  const body = (value: unknown) => Buffer.from(JSON.stringify(value))
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

  it('accepte le source seul ou avec une photo JPEG', () => {
    expect(parseJob(body({ tex: 'x' }))).toEqual({ tex: 'x', photo: undefined })
    expect(parseJob(body({ tex: 'x', photo: jpeg.toString('base64') })).photo).toEqual(jpeg)
  })

  it.each([
    ['JSON invalide', Buffer.from('{'), 'LATEX_INVALID_REQUEST'],
    ['champ inconnu', body({ tex: 'x', env: 'PATH' }), 'LATEX_INVALID_REQUEST'],
    ['source absent', body({ photo: 'AA==' }), 'LATEX_INVALID_REQUEST'],
    ['photo PNG', body({ tex: 'x', photo: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }), 'LATEX_INVALID_PHOTO'],
    ['photo en data URL', body({ tex: 'x', photo: 'data:image/jpeg;base64,/9j/' }), 'LATEX_INVALID_PHOTO'],
    ['photo trop lourde', body({ tex: 'x', photo: Buffer.concat([jpeg, Buffer.alloc(MAX_PHOTO_BYTES)]).toString('base64') }), 'LATEX_PHOTO_TOO_LARGE'],
  ])('%s', (_label, raw, code) => {
    expect(parseJob(raw).error).toBe(code)
  })
})
