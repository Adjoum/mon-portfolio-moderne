// Fournisseurs et clés API : enregistrement (vérifié par le fournisseur), remplacement,
// test de connexion, activation, suppression. La clé saisie n'est jamais relue ni conservée.
import { useState } from 'react'
import { KeyRound, PlugZap, Power, Trash2 } from 'lucide-react'
import { aiAdmin, type Overview, type ProviderId, type ProviderState } from '../api'
import { KEY_STATUS, formatDate } from '../format'
import { Badge, Button, Card, NoticeBanner } from '../ui'
import { inputClass } from '../styles'
import { useServerAction } from '../useServerAction'

function ProviderCard({ provider, reload, onOpenCatalog }: { provider: ProviderState; reload: () => Promise<unknown>; onOpenCatalog: (id: ProviderId) => void }) {
  const [key, setKey] = useState('')
  const { busy, notice, setNotice, run } = useServerAction(reload)
  const configured = provider.keyStatus !== 'not_configured'
  const inputId = `ai-key-${provider.id}`

  const saveKey = async () => {
    const value = key.trim()
    setKey('')   // jamais conservée dans la page, même en cas d'échec
    if (value.length < 8) return setNotice({ type: 'error', text: 'Clé trop courte.' })
    await run('key', () => aiAdmin.setKey(provider.id, value), r => `Clé vérifiée par ${provider.displayName} puis enregistrée de façon chiffrée (empreinte ${r.fingerprint}).`)
  }

  const statusTone = provider.keyStatus === 'invalid' ? 'red' : !configured ? 'gray' : provider.enabled ? 'green' : 'amber'
  const statusText = configured && provider.keyStatus === 'valid' && !provider.enabled ? 'Désactivé' : KEY_STATUS[provider.keyStatus]

  return (
    <Card
      title={<span className="flex items-center gap-2">{provider.displayName} <Badge tone={statusTone}>{statusText}</Badge></span>}
      actions={<Button onClick={() => onOpenCatalog(provider.id)}>Modèles ({provider.modelCount})</Button>}
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-400">Empreinte de la clé</dt><dd className="text-gray-200 font-mono">{provider.keyFingerprint ?? '—'}</dd>
        <dt className="text-gray-400">Clé mise à jour</dt><dd className="text-gray-200">{formatDate(provider.keyUpdatedAt)}</dd>
        <dt className="text-gray-400">Dernier test</dt>
        <dd className="text-gray-200">
          {formatDate(provider.lastCheckAt)}{provider.lastCheckOk === false && <span className="text-red-300"> · échec ({provider.lastCheckCode})</span>}
        </dd>
        <dt className="text-gray-400">Fonctionnalités actives</dt><dd className="text-gray-200">{provider.assignedCount}</dd>
      </dl>

      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />

      <form className="flex flex-col sm:flex-row gap-2" onSubmit={e => { e.preventDefault(); void saveKey() }}>
        <label htmlFor={inputId} className="sr-only">Clé API {provider.displayName}</label>
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder={configured ? 'Nouvelle clé (remplace l’actuelle)' : 'Clé API'}
          className={inputClass}
        />
        <Button type="submit" variant="primary" busy={busy === 'key'} disabled={!key.trim() || !!busy}>
          <KeyRound size={16} /> {configured ? 'Remplacer' : 'Enregistrer'}
        </Button>
      </form>
      <p className="text-xs text-gray-500">La clé est vérifiée auprès du fournisseur, chiffrée dans Supabase Vault et n’est plus jamais affichée.</p>

      {configured && (
        <div className="flex flex-wrap gap-2">
          <Button busy={busy === 'test'} disabled={!!busy}
            onClick={() => run('test', () => aiAdmin.testProvider(provider.id), r => r.ok
              ? `Connexion réussie : ${r.modelCount} modèle(s) accessibles (${r.latencyMs} ms), sans génération facturée.`
              : `Connexion refusée par le fournisseur (${r.code}).`)}>
            <PlugZap size={16} /> Tester la connexion
          </Button>
          {provider.keyStatus === 'valid' && (
            <Button busy={busy === 'toggle'} disabled={!!busy}
              onClick={() => run('toggle', () => aiAdmin.setProviderEnabled(provider.id, !provider.enabled),
                provider.enabled ? 'Fournisseur désactivé : ses fonctionnalités sont suspendues.' : 'Fournisseur activé.')}>
              <Power size={16} /> {provider.enabled ? 'Désactiver' : 'Activer'}
            </Button>
          )}
          <Button variant="danger" busy={busy === 'delete'} disabled={!!busy}
            onClick={() => {
              if (!confirm(`Supprimer la clé ${provider.displayName} ? Les fonctionnalités qui l’utilisent seront suspendues.`)) return
              void run('delete', () => aiAdmin.deleteKey(provider.id), 'Clé supprimée du stockage sécurisé.')
            }}>
            <Trash2 size={16} /> Supprimer la clé
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function ProvidersSection({ overview, reload, onOpenCatalog }: { overview: Overview; reload: () => Promise<unknown>; onOpenCatalog: (id: ProviderId) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {overview.providers.map(p => <ProviderCard key={p.id} provider={p} reload={reload} onOpenCatalog={onOpenCatalog} />)}
    </div>
  )
}
