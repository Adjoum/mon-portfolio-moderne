// deploy/oracle/next.sh : garanties de la sauvegarde MongoDB, de l'inventaire et du lancement
// parallèle, vérifiées dans le texte du script et de sa documentation. Sans Docker ni réseau ;
// le banc d'exécution réel est tests/oracle/sauvegarde-mongo.bench.sh (Docker Desktop).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const script = read('deploy/oracle/next.sh')
const readme = read('deploy/oracle/README.md')

/** Contenu d'une variable shell définie entre apostrophes : NOM='…' */
function quoted(name: string): string {
  const match = new RegExp(`^${name}='([\\s\\S]*?)'$`, 'm').exec(script)
  if (!match) throw new Error(`${name} introuvable`)
  return match[1]
}
/** Corps d'une fonction shell : nom() { … } jusqu'à l'accolade fermante en début de ligne */
function body(name: string): string {
  const match = new RegExp(`^${name}\\(\\) \\{\\n([\\s\\S]*?)^\\}`, 'm').exec(script)
  if (!match) throw new Error(`fonction ${name} introuvable`)
  return match[1]
}
const dump = quoted('DUMP_SCRIPT')
const restore = quoted('RESTORE_SCRIPT')

describe('sauvegarde MongoDB : une sauvegarde annoncée réussie est complète', () => {
  it('produit trois fichiers : archive, comptes par collection, empreintes des deux', () => {
    expect(dump).toMatch(/> "\/backup\/\$1\.comptes"/)
    expect(dump).toContain('sha256sum "$1" "$1.comptes" > "$1.sha256"')
    expect(dump).toMatch(/\[ -s "\/backup\/\$1\.comptes" \] \|\| \{ rm -f "\/backup\/\$1" "\/backup\/\$1\.comptes"/)
  })

  it('n’annonce le succès qu’après une restauration qui exige ces trois fichiers et les totaux de mongodump', () => {
    const save = body('cmd_sauvegarder_mongo')
    expect(save).toContain('restore_check "$name" "$BACKUP_DIR" exiger-comptes "$collections $expected"')
    const check = save.indexOf('restore_check "$name"')
    const announce = save.indexOf('echo "SAUVEGARDE $name')
    expect(check).toBeGreaterThan(0)
    expect(announce).toBeGreaterThan(check)
    expect(save.slice(check, announce)).toContain('if [ "$BLOCKERS" -eq 0 ]; then')
  })

  it('la restauration refuse une sauvegarde incomplète', () => {
    expect(restore).toContain('[ -s "$1" ] ||')
    expect(restore).toContain('[ -s "$1.sha256" ] ||')
    expect(restore).toMatch(/grep -q " \$1\\\$" "\$1\.sha256" \|\|/)
    expect(restore).toContain('[ -s "$1.comptes" ] || { echo "sauvegarde incomplète')
    expect(restore).toContain('[ "$2" != exiger-comptes ] || { echo "sauvegarde incomplète')
  })

  it('accepte le format antérieur (archive et empreinte seules) en le signalant', () => {
    expect(restore).toContain('mode=anterieur')
    expect(restore).toContain('présent mais non couvert par les empreintes : ignoré')
    expect(body('restore_check')).toContain("grep -qx 'FORMAT anterieur'")
  })
})

describe('sauvegarde MongoDB : intégrité', () => {
  it('contrôle gzip, objets BSON, CRC de chaque collection et code de sortie de mongorestore', () => {
    expect(restore).toContain('gzip -t "$1"')
    expect(restore).toMatch(/if ! mongorestore --uri="\$L" --gzip --archive="\/backup\/\$1" --objcheck --stopOnError/)
  })

  it('compare chaque collection : lue dans l’archive, présente après restauration, et comptes de la sauvegarde', () => {
    expect(restore).toContain('finished restoring')
    expect(restore).toContain('cmp -s /tmp/lu /tmp/obtenu')
    expect(restore).toContain('cmp -s /tmp/attendu /tmp/obtenu')
    expect(restore).toContain('awk "\\$3 != 0 { bad = 1 } END { exit bad }" /tmp/rapport')
    expect(restore).toContain('[ "$total" -gt 0 ] || { echo "sauvegarde vide"')
  })

  it('confronte les totaux attendus quand ils sont fournis', () => {
    expect(restore).toContain('[ "$3" = "$n $total" ]')
    expect(body('cmd_verifier_archive')).toContain("grep -Eqx '[0-9]+ [0-9]+'")
  })
})

describe('sauvegarde MongoDB : Atlas, secrets et ressources Docker', () => {
  it('la restauration ne reçoit aucune adresse et ne peut joindre que la boucle locale', () => {
    const check = body('restore_check')
    expect(check).toContain('--network none')
    expect(check).not.toMatch(/docker run[^\n]*\s-i\s/)
    expect(restore).not.toContain('MONGODB_URI')
    expect(restore).toContain('L=mongodb://127.0.0.1:27017')
    expect(restore).toContain('[ "${i##*/}" = lo ] ||')
    expect(restore).toMatch(/mongod --dbpath \/tmp\/db --bind_ip 127\.0\.0\.1/)
  })

  it('l’adresse MongoDB passe par l’entrée standard et un tmpfs, jamais en argument', () => {
    expect(body('cmd_sauvegarder_mongo')).toMatch(/dump=\$\(mongo_uri \| docker run -i --rm/)
    expect(script).not.toMatch(/-e MONGODB_URI/)
    expect(dump).toContain('mongodump --config=/tmp/dump.yaml')
    expect(dump).not.toMatch(/mongodump[^\n]*--uri/)
    expect(dump).toContain('rm -f /tmp/dump.yaml')
    expect(dump).toContain('s#://[^@ ]*@#://<masqué>@#g')
  })

  it('aucun journal Docker, aucune capacité, aucun volume, ressources nommées et étiquetées', () => {
    const harden = /^HARDEN="([^"]+)"$/m.exec(script)?.[1] ?? ''
    for (const flag of ['--cap-drop ALL', '--security-opt no-new-privileges', '--log-driver none', '--label $SAVE_LABEL_KEY=$SAVE_LABEL_VALUE']) {
      expect(harden).toContain(flag)
    }
    expect(script).toMatch(/^NO_VOLUMES="--tmpfs \/data\/db:[^"]*--tmpfs \/data\/configdb:[^"]*"$/m)
    expect(script).toMatch(/^MONGO_IMAGE=mongo@sha256:[0-9a-f]{64}$/m)
    const cleanup = body('backup_cleanup')
    expect(cleanup).toContain('if ours "$c"; then docker rm -f -v "$c"')
    expect(cleanup).toContain('if [ "$PULLED_IMAGE" = 1 ]')
  })

  it('aucune commande Docker globale dans tout le script', () => {
    const code = script.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')
    expect(code).not.toMatch(/\bprune\b|docker volume rm|docker system (df|prune)|rm -f \$\(docker ps|systemctl restart/)
  })
})

describe('inventaire en lecture seule', () => {
  const inventory = body('cmd_inventaire')

  it('git sans verrou optionnel, nginx lu et jamais appelé, aucun parcours de volumes', () => {
    expect(inventory).toContain('git --no-optional-locks')
    expect(inventory).not.toMatch(/^\s*nginx\s/m)
    expect(inventory).not.toMatch(/^\s*(docker system df|du -sh)/m)
    expect(inventory).not.toMatch(/\bdu -s/)
  })
})

describe('documentation alignée sur les fichiers produits', () => {
  it('décrit les deux formats et la vérification sur le poste', () => {
    expect(readme).toContain('<archive>.comptes')
    expect(readme).toContain('format antérieur')
    expect(readme).toContain('NEXT_ATTENDU')
    expect(readme).toContain('verifier-archive')
  })

  it('copie les fichiers listés par l’empreinte, sans créer de fichier vide en cas d’échec', () => {
    expect(readme).toMatch(/awk '\{ ?print \$2 ?\}' "\$A\.sha256"/)
    expect(readme).toMatch(/> "\$f\.part" && \[ -s "\$f\.part" \] && mv "\$f\.part" "\$f"/)
  })

  it('exécute sur la VM la version d’un commit précis, jamais la copie de travail', () => {
    expect(readme).toMatch(/git show "?\$c"?:deploy\/oracle\/next\.sh \| ssh/)
    expect(readme).not.toMatch(/'sudo sh -s [a-z-]+' < deploy\/oracle\/next\.sh/)
  })

  it('archive sans conversion de fins de ligne', () => {
    expect(readme).toMatch(/git (-C \S+ )?-c core\.autocrlf=false archive/)
    expect(readme).not.toMatch(/\bgit archive\b/)
  })
})

describe('syntaxe POSIX', () => {
  const sh = spawnSync('sh', ['-c', 'exit 0'])
  it.skipIf(sh.error !== undefined)('next.sh et le banc passent sh -n', () => {
    for (const file of ['deploy/oracle/next.sh', 'tests/oracle/sauvegarde-mongo.bench.sh']) {
      const result = spawnSync('sh', ['-n', path.join(ROOT, file)], { encoding: 'utf8' })
      expect(result.status, `${file} : ${result.stderr}`).toBe(0)
    }
  })
})
