// P2 — Le schéma des données de CV du navigateur (src/features/latex-studio/lib/cvData.ts) reste
// accepté par la validation STRICTE du serveur (blog-api/src/ai/features/cvData.ts, latex.rewrite).
import { describe, it, expect } from 'vitest'
import { emptyCv, forServer } from '../../src/features/latex-studio/lib/cvData'
import { sampleCv } from '../../src/features/latex-studio/templates/sample'
import { normalizeCvData } from '../../blog-api/src/ai/features/cvData'

describe('concordance des schémas navigateur / serveur', () => {
  it.each([['exemple court', sampleCv('short')], ['exemple long', sampleCv('long')], ['CV vide', emptyCv()]])('%s : accepté tel quel', (_label, cv) => {
    const sent = forServer(cv)
    expect(normalizeCvData(sent, 'strict')).toEqual(sent)
  })
})
