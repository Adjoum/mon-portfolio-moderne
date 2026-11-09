// blog-api/src/lib/trustProxy.ts
// Adresse réelle du visiteur derrière nginx (limiteurs, quotas IA journaliers, journal d'audit).
//
// Chaîne en production : visiteur → nginx (hôte ; $remote_addr) → 127.0.0.1:5001 → docker-proxy
// → conteneur. Le pair TCP vu par Express est la passerelle du réseau Docker (adresse privée).
//
// Express ne fait confiance qu'à ce pair direct (rang 0), et seulement s'il est local : boucle
// locale ou réseau privé (passerelle Docker, conteneur nginx en développement). req.ip est alors
// la DERNIÈRE adresse de X-Forwarded-For, celle que nginx ajoute ($proxy_add_x_forwarded_for) ;
// tout ce que le visiteur a écrit à gauche est ignoré. Un pair public (port publié par erreur,
// accès direct) n'est jamais cru : req.ip est son adresse, X-Forwarded-For est ignoré.
// X-Real-IP n'est jamais lu.
//
// Condition côté nginx : chaque location qui transmet à l'API fixe X-Forwarded-For
// ($proxy_add_x_forwarded_for ou $remote_addr). Sinon l'en-tête du visiteur passe tel quel.

import { BlockList, isIP } from 'node:net';

const LOCAL = new BlockList();
LOCAL.addSubnet('127.0.0.0', 8, 'ipv4');
LOCAL.addSubnet('10.0.0.0', 8, 'ipv4');
LOCAL.addSubnet('172.16.0.0', 12, 'ipv4');
LOCAL.addSubnet('192.168.0.0', 16, 'ipv4');
LOCAL.addAddress('::1', 'ipv6');
LOCAL.addSubnet('fc00::', 7, 'ipv6');

/** Boucle locale ou réseau privé (IPv4, IPv6, IPv4 encapsulée « ::ffff:a.b.c.d ») */
export function isLocalAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const ip = addr.replace(/^::ffff:(?=\d{1,3}(\.\d{1,3}){3}$)/i, '');
  const family = isIP(ip);
  if (family === 0) return false;
  return LOCAL.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** Réglage « trust proxy » d'Express : un seul saut, et seulement si ce saut est local */
export function trustLocalProxy(addr: string, hop: number): boolean {
  return hop === 0 && isLocalAddress(addr);
}
