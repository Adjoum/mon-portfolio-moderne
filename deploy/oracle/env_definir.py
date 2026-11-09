# deploy/oracle/env_definir.py — appelé par « next.sh env-definir NOM » (root), valeur sur l'entrée standard.
# Ajoute ou remplace NOM dans le fichier d'environnement de blog-api-next sans jamais afficher la
# valeur : écrite entre guillemets doubles (\ " $ échappés), fichier remplacé d'un coup seulement
# après relecture par Compose (« docker compose config ») : valeur identique, autres variables
# inchangées. Les erreurs de Compose ne sont jamais affichées : elles peuvent citer une ligne.
import json, os, re, subprocess, sys

F = os.environ.get('NEXT_ENV_FILE', '/etc/portfolio-next/api.env')
COMPOSE = os.environ.get('NEXT_COMPOSE_FILE', 'deploy/oracle/compose.next.yml')
TMP, ETALON = F + '.nouveau', F + '.etalon'
created = set()


def stop(msg):
    for p in created:
        if os.path.exists(p):
            os.remove(p)
    print("ARRÊT : %s. Rien n'a été modifié." % msg)
    sys.exit(1)


def write_new(path, data):
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        stop(path + ' existe déjà (essai interrompu) : le supprimer')
    created.add(path)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())


def compose_env(path):
    env = dict(os.environ, NEXT_TAG='verification', NEXT_ENV_FILE=path)
    env.setdefault('NEXT_SUPABASE_CA', '/etc/portfolio-next/supabase-ca.crt')
    r = subprocess.run(['docker', 'compose', '-p', 'portfolio-next', '-f', COMPOSE, 'config', '--format', 'json'],
                       env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout)['services']['blog-api-next'].get('environment') or {}


def encode(value):
    # Entre guillemets doubles, Compose lit \\ \" \$ comme \ " $ ; l'apostrophe n'y joue aucun rôle
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$') + '"'


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r'[A-Z][A-Z0-9_]*', sys.argv[1]):
        stop('nom de variable attendu en majuscules')
    key = sys.argv[1]
    if os.geteuid() != 0:
        stop('lancer avec sudo')
    if not os.path.isfile(COMPOSE):
        stop('compose.next.yml introuvable : lancer depuis la copie du commit')
    st = os.stat(F)
    if st.st_uid != 0 or st.st_mode & 0o777 != 0o600:
        stop(F + ' doit appartenir à root, droits 600')
    try:
        value = sys.stdin.buffer.read().decode('utf-8')
    except UnicodeDecodeError:
        stop('valeur illisible (UTF-8 attendu)')
    if not value:
        stop('valeur vide')
    if any(c in value for c in '\n\r\0'):
        stop('saut de ligne ou caractère nul dans la valeur')

    with open(F, 'rb') as f:
        old = f.read()
    if old and not old.endswith(b'\n'):
        stop(F + ' ne finit pas par un saut de ligne')
    lines = old.decode('utf-8').splitlines(keepends=True)
    statement = re.compile(r'^\s*(export\s+)?' + key + r'\s*[=:]')
    kept = [l for l in lines if not statement.match(l)]
    replaced = len(kept) != len(lines)

    before = compose_env(F)
    if before is None:
        stop('Compose ne relit pas le fichier actuel')
    # Selon la version, « compose config » affiche un $ de valeur sous la forme $$ : étalonnage
    write_new(ETALON, b'ETALON="a\\$b"\n')
    shown = (compose_env(ETALON) or {}).get('ETALON')
    os.remove(ETALON)
    created.discard(ETALON)
    if shown not in ('a$b', 'a$$b'):
        stop('étalonnage de Compose illisible')
    expected = value.replace('$', '$$') if shown == 'a$$b' else value

    write_new(TMP, (''.join(kept) + '%s=%s\n' % (key, encode(value))).encode('utf-8'))
    after = compose_env(TMP)
    if after is None:
        stop('Compose ne relit pas le nouveau fichier')
    if after.get(key) != expected:
        stop('valeur relue par Compose différente de la saisie (variable fixée par compose.next.yml ?)')
    others = lambda env: {k: v for k, v in env.items() if k != key}
    if others(after) != others(before):
        stop('une autre variable relue par Compose a changé')
    os.replace(TMP, F)
    created.discard(TMP)
    print('%s %s dans %s (root, 600) : valeur relue par Compose identique à la saisie ; '
          '%d autres variables inchangées. Prise en compte au prochain « demarrer ».'
          % (key, 'remplacée' if replaced else 'ajoutée', F, len(others(before))))


try:
    main()
except SystemExit:
    raise
except Exception as e:
    stop('erreur inattendue (%s)' % type(e).__name__)
