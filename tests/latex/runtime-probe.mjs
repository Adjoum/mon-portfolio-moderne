// tests/latex/runtime-probe.mjs
// Sonde exécutée DANS le conteneur latex-runner (docker exec -i … node --input-type=module -),
// jamais copiée dans l'image : privilèges, système de fichiers, réseau et environnement réels
// du processus, tels qu'un document malveillant les trouverait s'il échappait à TeX.

import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns/promises';
import { spawnSync } from 'node:child_process';
import { texEnvironment } from '/app/src/compile.mjs';

const out = {};
const status = fs.readFileSync('/proc/self/status', 'utf8');
const field = name => new RegExp(`^${name}:\\s+(\\S+)`, 'm').exec(status)?.[1];
out.uid = process.getuid();
out.capEff = field('CapEff');
out.capBnd = field('CapBnd');
out.noNewPrivs = field('NoNewPrivs');
out.seccomp = field('Seccomp');

const tryWrite = file => { try { fs.writeFileSync(file, 'x'); fs.rmSync(file); return 'écrit'; } catch (e) { return e.code; } };
out.writeApp = tryWrite('/app/sonde');
out.writeEtc = tryWrite('/etc/sonde');
out.writeWork = tryWrite('/work/sonde');

// /work accepte des fichiers mais n'exécute rien (noexec)
try {
  fs.copyFileSync('/bin/true', '/work/sonde-exec');
  fs.chmodSync('/work/sonde-exec', 0o755);
  const r = spawnSync('/work/sonde-exec');
  out.execWork = r.error?.code ?? `code ${r.status}`;
} catch (e) {
  out.execWork = e.code;
} finally {
  fs.rmSync('/work/sonde-exec', { force: true });
}

const tcp = (host, port) => new Promise(resolve => {
  const socket = net.connect({ host, port, timeout: 3000 });
  socket.on('connect', () => { socket.destroy(); resolve('connecté'); });
  socket.on('timeout', () => { socket.destroy(); resolve('délai dépassé'); });
  socket.on('error', e => resolve(e.code));
});
const myIp = Object.values((await import('node:os')).networkInterfaces()).flat().find(i => i?.family === 'IPv4' && !i.internal)?.address ?? '';
const gateway = myIp.replace(/\.\d+$/, '.1');
out.internetTcp = await tcp('1.1.1.1', 443);
out.dnsExterne = await dns.lookup('example.com').then(() => 'résolu', e => e.code);
out.hostDockerInternal = await tcp('host.docker.internal', 5000);
out.passerelleReseau = `${gateway}:5000 → ${await tcp(gateway, 5000)}`;
out.api = await tcp('api', 5000);

// Variables d'environnement lisibles dans /proc par le même utilisateur (serveur, init, sonde)
out.envNames = [...new Set(fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).flatMap(p => {
  try { return fs.readFileSync(`/proc/${p}/environ`, 'utf8').split('\0').filter(Boolean).map(e => e.split('=')[0]); } catch { return []; }
}))].sort();

// Politique TeX effective dans l'environnement d'une compilation
for (const name of ['shell_escape', 'openin_any', 'openout_any']) {
  out[`kpse_${name}`] = spawnSync('kpsewhich', [`-var-value=${name}`], { env: texEnvironment(), encoding: 'utf8' }).stdout.trim();
}
out.workEntries = fs.readdirSync('/work');
out.processes = fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).length;
console.log(JSON.stringify(out));
