# Banc de deploy/oracle/env_definir.py avec le vrai « docker compose config » (sans démon Docker).
#   python tests/oracle/env-definir.bench.py        (depuis la racine du dépôt ; Windows : PYTHONUTF8=1)
# Simulés : root et droits du fichier (Windows n'en a pas). Valeurs factices uniquement.
import contextlib, io, json, os, shutil, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCRIPT = os.path.join(ROOT, 'deploy', 'oracle', 'env_definir.py')
COMPOSE = os.path.join(ROOT, 'deploy', 'oracle', 'compose.next.yml')
SOURCE = open(SCRIPT, encoding='utf-8').read()
real_stat, real_run = os.stat, subprocess.run
PASS = FAIL = 0

# Lignes écrites par « next.sh env » (apostrophes) et par env-definir (guillemets doubles)
ORIGINAL = ("# Généré par deploy/oracle/next.sh env depuis le conteneur blog-api. Jamais dans Git.\n"
            "FRONTEND_URL='https://www.exemple.test'\n"
            "MONGODB_URI='mongodb+srv://u:p$w\"d@h.mongodb.net/base?retryWrites=true'\n"
            "CLOUDINARY_API_SECRET='ab\\cd#ef gh'\n"
            "JWT_SECRET=\"it's \\\"q\\\" \\$x\"\n"
            "AI_ENABLED='false'\n").encode()


def check(cond, label):
    global PASS, FAIL
    if cond:
        PASS += 1; print('  ✔ ' + label)
    else:
        FAIL += 1; print('  ✗ ' + label)


def parse(path):
    env = dict(os.environ, NEXT_TAG='t', NEXT_ENV_FILE=path)
    r = real_run(['docker', 'compose', '-p', 'portfolio-next', '-f', COMPOSE, 'config', '--format', 'json'],
                 env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    return json.loads(r.stdout)['services']['blog-api-next']['environment']


def run(name, value, original=ORIGINAL):
    d = tempfile.mkdtemp(prefix='env-definir-')
    f = os.path.join(d, 'api.env')
    open(f, 'wb').write(original)

    class Stat:
        st_uid, st_mode = 0, 0o100600
    os.stat = lambda p, *a, **k: Stat() if os.path.abspath(p) == os.path.abspath(f) else real_stat(p, *a, **k)
    os.geteuid = lambda: 0
    os.environ.update(NEXT_ENV_FILE=f, NEXT_COMPOSE_FILE=COMPOSE)
    sys.argv = ['env_definir.py', name]
    stdin, sys.stdin = sys.stdin, io.TextIOWrapper(io.BytesIO(value.encode('utf-8')))
    out, code = io.StringIO(), 0
    try:
        with contextlib.redirect_stdout(out):
            exec(compile(SOURCE, SCRIPT, 'exec'), {'__name__': '__main__'})
    except SystemExit as e:
        code = e.code or 0
    finally:
        os.stat, sys.stdin = real_stat, stdin
    return f, d, code, out.getvalue()


def same_value(got, value):
    return got in (value, value.replace('$', '$$'))   # « compose config » peut afficher $ en $$


print('\n▶ Ajout d’une valeur piégée')
V = "it's \"$HOME\" ${X} $$ \\n \\' fin\\ #x `id` %s é"
f, d, code, out = run('AI_LOG_HMAC_SECRET', V)
data = open(f, 'rb').read()
check(code == 0 and 'ajoutée' in out, 'ajout accepté')
check(V not in out and V.replace('$', '$$') not in out, 'valeur jamais affichée')
check(data.startswith(ORIGINAL) and data.count(b'\n') == ORIGINAL.count(b'\n') + 1, 'lignes existantes intactes, une ligne ajoutée')
avant = os.path.join(d, 'avant.env')
open(avant, 'wb').write(ORIGINAL)
env, before = parse(f), parse(avant)
check(same_value(env['AI_LOG_HMAC_SECRET'], V), 'Compose relit la valeur exacte')
check({k: v for k, v in env.items() if k != 'AI_LOG_HMAC_SECRET'} == before, 'autres variables relues inchangées')
check(sorted(os.listdir(d)) == ['api.env', 'avant.env'], 'aucun fichier temporaire laissé')
shutil.rmtree(d)

print('\n▶ Remplacement d’une variable existante')
f, d, code, out = run('AI_ENABLED', 'true')
data = open(f, 'rb').read().decode()
check(code == 0 and 'remplacée' in out, 'remplacement accepté')
check(data.count('AI_ENABLED=') == 1 and data.endswith('AI_ENABLED="true"\n'), 'une seule ligne AI_ENABLED, la nouvelle')
check(parse(f)['AI_ENABLED'] == 'true' and same_value(parse(f)['JWT_SECRET'], 'it\'s "q" $x'), 'nouvelle valeur lue, les autres gardées')
shutil.rmtree(d)

print('\n▶ Refus, fichier intact')
for label, name, value, original in [
    ('variable fixée par compose.next.yml', 'AI_DATABASE_CA_FILE', '/autre', ORIGINAL),
    ('valeur sur deux lignes', 'X_TEST', 'a\nb', ORIGINAL),
    ('valeur vide', 'X_TEST', '', ORIGINAL),
    ('nom invalide', 'x-test', 'v', ORIGINAL),
    ('fichier sans saut de ligne final', 'X_TEST', 'v', ORIGINAL.rstrip(b'\n')),
]:
    f, d, code, out = run(name, value, original)
    check(code == 1 and open(f, 'rb').read() == original and os.listdir(d) == ['api.env'] and 'ARRÊT' in out,
          '%s : %s' % (label, out.strip()[:110]))
    shutil.rmtree(d)

print('\nRÉSULTAT : %d réussis, %d échoués' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
