// Restauration locale d'une sauvegarde backup.sh dans un Postgres Supabase jetable.
//
// backup.sh tourne avec le client postgres:17-alpine : l'archive public.dump (format 1.16) n'est
// lisible que par pg_restore ≥ 17, même si le serveur source est en 15. Elle est donc convertie
// en SQL par ce même client, sans réseau, puis rejouée par psql dans la base jetable, quelle que
// soit sa version. En production, une restauration passe de même par le client 17.

import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const CLIENT = 'postgres:17-alpine';
/** Images Supabase sur lesquelles les bancs ont été exécutés, par version majeure du serveur */
export const IMAGES = { 15: 'public.ecr.aws/supabase/postgres:15.14.1.159', 17: 'public.ecr.aws/supabase/postgres:17.6.1.167' };
const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
const BUFFER = 1024 * 1024 * 1024;

/** Paramètre de session émis par pg_dump 17, inconnu des serveurs plus anciens */
export function adaptSql(sql, major) {
  return major < 17 ? sql.replace(/^SET transaction_timeout = 0;$/gm, '') : sql;
}

/** public.dump → SQL, par le client 17 (aucun réseau, dossier monté en lecture seule) */
export function dumpToSql(dir, { noOwner = false } = {}) {
  const r = spawnSync('docker', ['run', '--rm', '--network', 'none', '-v', `${path.resolve(dir)}:/backup:ro`, CLIENT,
    'pg_restore', ...(noOwner ? ['--no-owner'] : []), '--file=-', '/backup/public.dump'], { encoding: 'utf8', env, maxBuffer: BUFFER });
  if (r.status !== 0) throw new Error(`pg_restore (${CLIENT}) : ${r.stderr.slice(-400)}`);
  return r.stdout;
}

/** Rejoue un script SQL en superutilisateur, déclencheurs suspendus (base jetable) ; renvoie les erreurs */
export function replay(container, sql) {
  const r = spawnSync('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c session_replication_role=replica', container,
    'psql', '-X', '-q', '-U', 'supabase_admin', '-d', 'postgres'], { input: sql, encoding: 'utf8', env, maxBuffer: BUFFER });
  return (r.stderr.match(/ERROR: .*$/gm) ?? []).filter(e => !/schema "public" already exists/.test(e));
}
