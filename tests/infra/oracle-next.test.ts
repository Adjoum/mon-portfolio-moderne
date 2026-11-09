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
    // Avec git -C, un -o relatif écrirait l'archive dans le dépôt
    for (const command of readme.match(/git -C [\s\S]*?\barchive\b[\s\S]*?-o "([^"]+)"/g) ?? []) {
      expect(/-o "([^"]+)"/.exec(command)?.[1], command).toMatch(/^(\/|\$PWD\/|[A-Z]:)/)
    }
  })
})

describe('livraison depuis GitLab : récupération par commit exact', () => {
  const fetch = body('cmd_recuperer')

  it('sans root, commit hexadécimal d’au moins 12 caractères, dépôt nu déjà créé', () => {
    expect(fetch).toContain('[ "$(id -u)" != 0 ] || die')
    expect(fetch).toContain("grep -Eq '^[0-9a-f]{12,40}$'")
    expect(fetch).toContain('[ -d "$DEPOT" ] || die')
  })

  it('lit seulement la branche de release, sans étiquette, et exige le commit dans son historique publié', () => {
    expect(fetch).toContain('fetch --quiet --no-tags origin "+refs/heads/$BRANCH:$ref" </dev/null')
    const ancestor = fetch.indexOf('merge-base --is-ancestor "$full" "$ref" || die')
    expect(ancestor).toBeGreaterThan(0)
    expect(fetch.indexOf('archive --format=tar')).toBeGreaterThan(ancestor)
    expect(script).toMatch(/^BRANCH=\$\{NEXT_BRANCHE:-release\/portfolio-next\}$/m)
  })

  it('extrait sans conversion de fins de ligne et refuse une copie en CRLF', () => {
    expect(fetch).toContain('git -C "$DEPOT" -c core.autocrlf=false')
    expect(fetch).toContain('block "$crlf fichier(s) en CRLF dans le commit"')
  })

  it('ne remplace jamais une copie existante : comparaison fichier par fichier', () => {
    expect(fetch).toContain('diff -rq -x .next-commit "$tmp" "$dest"')
    const replace = fetch.indexOf('mv "$tmp" "$dest"')
    expect(fetch.lastIndexOf('elif [ "$BLOCKERS" -eq 0 ]; then', replace)).toBeGreaterThan(fetch.indexOf('if [ -e "$dest" ]; then'))
    expect(fetch.match(/mv "\$tmp"/g)).toHaveLength(1)
  })

  it('jamais de git pull, push ni clone, ni de lecture du dépôt de l’ancien déploiement', () => {
    const code = script.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')
    expect(code).not.toMatch(/\bgit\b[^\n]*\b(pull|push|clone)\b/)
    expect(fetch).not.toContain('LEGACY')
  })

  it('journal de chaque démarrage et arrêt, historique en lecture seule', () => {
    expect(body('cmd_demarrer')).toContain('journal demarrer "$rc"')
    expect(body('cmd_arreter')).toContain('journal arreter "$rc"')
    expect(body('journal')).toContain('>> "$STATE_DIR/deploiements.log"')
    const history = body('cmd_historique').replace(/2>\/dev\/null/g, '')
    expect(history).not.toMatch(/docker (rm|stop|run|start|compose|image rm|network)|\bdc\b|>/)
  })

  it('le README livre par GitHub : HTTPS sans clé, script du commit livré, jamais de force push', () => {
    expect(readme).toContain('git push github release/portfolio-next')
    expect(readme).toContain('remote set-url origin https://github.com/Adjoum/mon-portfolio-moderne.git')
    expect(readme).toMatch(/git -C depot\.git show "\$c":deploy\/oracle\/next\.sh \| sh -s recuperer "\$c"/)
    expect(readme).not.toMatch(/^\s*git( -C \S+)? pull\b/m)
    const pushes = readme.split('\n').filter(l => /^\s*git push/.test(l)).map(l => l.split('#')[0])
    expect(pushes.length).toBeGreaterThan(0)
    for (const push of pushes) expect(push).not.toMatch(/--force|\s-f\b|\s\+\S/)
  })
})

describe('certificat Supabase et connexion TLS', () => {
  const compose = read('deploy/oracle/compose.next.yml')

  it('certificat monté en lecture seule, jamais créé par Docker, utilisé par la connexion IA', () => {
    expect(compose).toMatch(/source: \$\{NEXT_SUPABASE_CA:-\/etc\/portfolio-next\/supabase-ca\.crt\}\n\s+target: \/run\/certs\/supabase-ca\.crt\n\s+read_only: true\n\s+bind:\n\s+create_host_path: false/)
    expect(compose).toContain('- AI_DATABASE_CA_FILE=/run/certs/supabase-ca.crt')
    expect(script).toContain('NEXT_SUPABASE_CA="$CA_FILE" docker compose')
  })

  it('verifier bloque sans certificat PEM valide et lisible', () => {
    const verify = body('cmd_verifier')
    expect(verify).toContain('block "$CA_FILE absent')
    expect(verify).toContain('openssl x509 -in "$CA_FILE" -noout -subject')
    expect(verify).toContain('-checkend 2592000')
    expect(verify).toMatch(/stat -c '%a' "\$CA_FILE"\)" != 644/)
  })

  it('verifier-tls : poignée de main vérifiée (certificat et nom), sans lire l’URL secrète', () => {
    const tls = body('cmd_verifier_tls')
    expect(tls).toContain('-starttls postgres')
    expect(tls).toContain('-verify_hostname "$host" -verify_return_error')
    expect(tls).toContain('tls -CAfile "$CA_FILE"')
    expect(tls).toContain('timeout 20 openssl s_client')
    expect(tls).not.toMatch(/AI_DATABASE_URL|ENV_FILE/)
  })
})

describe('variables : env-definir et activation progressive', () => {
  it('valeur jamais en argument ni affichée : saisie sans écho ou tube, transmise par l’entrée standard', () => {
    const set = body('cmd_env_definir')
    expect(set).toContain("grep -Eq '^[A-Z][A-Z0-9_]*$'")
    expect(set).toContain('stty -echo')
    expect(set).toContain("trap 'stty echo 2>/dev/null' EXIT INT TERM")
    expect(set).toMatch(/printf '%s' "\$value" \| NEXT_ENV_FILE="\$ENV_FILE" NEXT_COMPOSE_FILE="\$COMPOSE_FILE" NEXT_SUPABASE_CA="\$CA_FILE" \\\n\s+python3 "\$HERE\/env_definir\.py" "\$name"/)
    expect(set).not.toMatch(/echo "\$value"|\$value"?\s*$/m)
  })

  it('env_definir.py : erreurs de Compose masquées, remplacement atomique après relecture', () => {
    const py = read('deploy/oracle/env_definir.py')
    expect(py).toContain('stderr=subprocess.DEVNULL')
    expect(py).toContain('os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600')
    const check = py.indexOf("if after.get(key) != expected")
    expect(check).toBeGreaterThan(0)
    expect(py.indexOf('os.replace(TMP, F)')).toBeGreaterThan(check)
    expect(py).not.toMatch(/print\([^)]*\bvalue\b/)
  })

  it('verifier : amorçage toujours fermé ; administration, connaissances et IA activables avec leurs variables', () => {
    const verify = body('cmd_verifier')
    expect(verify).toContain('if value ADMIN_BOOTSTRAP_ENABLED false; then ok')
    expect(verify).toContain('block "SUPABASE_URL et SUPABASE_ANON_KEY vont ensemble"')
    expect(verify).toContain('block "IA active sans $v"')
    expect(verify).not.toContain('doit valoir false pour le lancement isolé')
  })
})

describe('bascule nginx préparée, jamais exécutée par les scripts', () => {
  it('README : copie, nginx -t, rechargement, restauration si le test échoue, retour sur 5000', () => {
    expect(readme).toContain('sudo cp -p "$S" /var/lib/portfolio-next/nginx-blog-api.avant-5001')
    expect(readme).toContain('sudo nginx -t && sudo systemctl reload nginx || sudo cp -p /var/lib/portfolio-next/nginx-blog-api.avant-5001 "$S"')
    expect(readme).toContain("sudo sed -i 's#proxy_pass http://127.0.0.1:5001/;#proxy_pass http://127.0.0.1:5000/;#'")
    expect(readme).not.toMatch(/^\s*sudo systemctl restart nginx/m)
  })

  it('aucun script ne touche nginx', () => {
    const code = script.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')
    expect(code).not.toMatch(/systemctl (reload|restart) nginx|nginx -s|sites-available/)
  })

  it('README : relevé de la chaîne d’adresse en lecture seule, valeurs sensibles masquées, comptes seulement', () => {
    const start = readme.indexOf('Relevé en\nlecture seule')
    const releve = readme.slice(readme.indexOf('```bash', start), readme.indexOf('Attendu :', start))
    expect(start).toBeGreaterThan(0)
    expect(releve).toContain('proxy_set_header')
    expect(releve).toContain('real_ip_header')
    expect(releve).toContain('[valeur masquée]')
    expect(releve).toContain('adresses distinctes')
    // seule redirection admise : 2>/dev/null
    expect(releve).not.toMatch(/sed -i|\btee\b|systemctl|nginx -[ts]|\b(cp|mv|rm|install) |(?<!2)>\s*\S/)
  })
})

describe('commentaires et adresse des visiteurs (controler, lecture seule)', () => {
  const controle = body('cmd_controler')
  it('lectures de commentaires répétées sans refus, compteur de lecture distinct', () => {
    expect(controle).toContain('u="$base/comments/000000000000000000000000"')
    expect(controle).toContain('[ "$lim" = 300 ]')
    expect(controle).not.toMatch(/-X (POST|PUT|DELETE)[^\n]*comments/)
  })
  it('un compteur par visiteur derrière le proxy local, sinon bloquant', () => {
    expect(controle).toMatch(/a2=\$\(ratelimit remaining -H 'X-Forwarded-For: 203\.0\.113\.201'/)
    expect(controle).toMatch(/b1=\$\(ratelimit remaining -H 'X-Forwarded-For: 203\.0\.113\.202'/)
    expect(controle).toContain('block "adresse des visiteurs')
  })
})

describe('Vercel : une branche de release ne déclenche aucun déploiement', () => {
  const vercel = JSON.parse(read('vercel.json'))
  const enabled = vercel.git?.deploymentEnabled

  it('release/* désactivée, main toujours déployée', () => {
    expect(enabled).toBeTypeOf('object')
    expect(enabled['release/*']).toBe(false)
    for (const [pattern, value] of Object.entries(enabled)) {
      if (value === false) expect(pattern, pattern).toMatch(/^release\//)
    }
  })
})

describe('syntaxe POSIX', () => {
  const sh = spawnSync('sh', ['-c', 'exit 0'])
  it.skipIf(sh.error !== undefined)('next.sh et les bancs passent sh -n', () => {
    for (const file of ['deploy/oracle/next.sh', 'tests/oracle/sauvegarde-mongo.bench.sh', 'tests/oracle/recuperer.bench.sh']) {

      const result = spawnSync('sh', ['-n', path.join(ROOT, file)], { encoding: 'utf8' })
      expect(result.status, `${file} : ${result.stderr}`).toBe(0)
    }
  })
})
