// src/components/admin/AdminGate.tsx
// Garde d'interface des pages d'administration (/admin, /admin/knowledge) :
// connexion → appartenance à admin_users → double authentification TOTP (aal2).
//
// ⚠️ Confort d'affichage uniquement : les données restent protégées côté serveur
// (RLS Supabase + blog-api) même si ce composant est contourné.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ShieldCheck, ShieldAlert, KeyRound, LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  evaluateAdminAccess,
  startTotpEnrollment,
  verifyTotpCode,
  type AdminAccess,
} from '../../lib/adminAuth'
import AdminLogin from '../AdminLogin'

const BUTTON = 'px-6 py-3 bg-gradient-to-r from-primary to-secondary rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed'
const SECONDARY = 'px-4 py-2 glass-effect rounded-lg text-gray-300 hover:text-white transition-colors flex items-center gap-2'

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-24">
      <div className="glass-effect rounded-2xl p-8 w-full max-w-md text-gray-200">
        <div className="flex items-center gap-3 mb-6">
          {icon}
          <h1 className="text-2xl font-bold gradient-text">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  )
}

function SignOutButton() {
  return (
    <button type="button" onClick={() => supabase.auth.signOut()} className={SECONDARY}>
      <LogOut size={16} /> Se déconnecter
    </button>
  )
}

function TotpForm({ factorId, onVerified, submitLabel }: { factorId: string; onVerified: () => void; submitLabel: string }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await verifyTotpCode(factorId, code)
      setCode('')
      onVerified()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-gray-400" htmlFor="admin-totp-code">
        Code à 6 chiffres de votre application d’authentification
      </label>
      <input
        id="admin-totp-code"
        value={code}
        onChange={e => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        className="w-full px-4 py-3 glass-effect rounded-lg text-white tracking-[0.4em] text-center text-xl"
      />
      {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={loading} className={`${BUTTON} w-full`}>
        {loading ? 'Vérification…' : submitLabel}
      </button>
    </form>
  )
}

function TotpEnrollment({ onVerified }: { onVerified: () => void }) {
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    startTotpEnrollment()
      .then(setEnrollment)
      .catch(err => setError((err as Error).message))
  }, [])

  if (error) return <p role="alert" className="text-red-400 text-sm">{error}</p>
  if (!enrollment) return <p className="text-gray-400">Préparation du QR code…</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        La double authentification est obligatoire pour administrer le portfolio.
        Scannez ce QR code avec une application d’authentification (Google Authenticator,
        Microsoft Authenticator, 1Password…), puis saisissez le code affiché.
      </p>
      <div className="bg-white rounded-lg p-3 w-fit mx-auto">
        <img src={enrollment.qrCode} alt="QR code d’enrôlement MFA" width={180} height={180} />
      </div>
      <details className="text-xs text-gray-400">
        <summary className="cursor-pointer">Saisie manuelle de la clé</summary>
        <code className="block mt-2 break-all select-all">{enrollment.secret}</code>
      </details>
      <TotpForm factorId={enrollment.factorId} onVerified={onVerified} submitLabel="Activer la double authentification" />
    </div>
  )
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<AdminAccess | null>(null)
  const [denied, setDenied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setAccess(await evaluateAdminAccess())
    } catch {
      setAccess({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    void refresh()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'USER_UPDATED') {
        void refresh()
      }
    })
    return () => subscription.unsubscribe()
  }, [refresh])

  // Un compte non administrateur ne garde pas de session ouverte sur l'administration
  useEffect(() => {
    if (access?.status !== 'not_admin') return
    setDenied(true)
    void supabase.auth.signOut({ scope: 'local' })
  }, [access?.status])

  if (!access) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Vérification de l'authentification...</p>
        </div>
      </div>
    )
  }

  if (denied && (access.status === 'not_admin' || access.status === 'signed_out')) {
    return (
      <Panel icon={<ShieldAlert className="text-red-400" />} title="Accès refusé">
        <p className="text-gray-400 mb-6">Ce compte n’a pas les droits d’administration. La session a été fermée.</p>
        <button type="button" onClick={() => setDenied(false)} className={SECONDARY}>
          Changer de compte
        </button>
      </Panel>
    )
  }

  switch (access.status) {
    case 'ready':
      return <>{children}</>

    case 'signed_out':
    case 'not_admin':
      return <AdminLogin onLoginSuccess={refresh} />

    case 'mfa_enroll':
      return (
        <Panel icon={<KeyRound className="text-primary" />} title="Activer la double authentification">
          <TotpEnrollment onVerified={refresh} />
          <div className="mt-6"><SignOutButton /></div>
        </Panel>
      )

    case 'mfa_challenge':
      return (
        <Panel icon={<ShieldCheck className="text-primary" />} title="Double authentification">
          <TotpForm factorId={access.factorId!} onVerified={refresh} submitLabel="Valider" />
          <div className="mt-6"><SignOutButton /></div>
        </Panel>
      )

    default:
      return (
        <Panel icon={<ShieldAlert className="text-yellow-400" />} title="Vérification impossible">
          <p className="text-gray-400 mb-6">
            Les droits d’administration n’ont pas pu être vérifiés. Réessayez dans quelques instants.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => void refresh()} className={BUTTON}>Réessayer</button>
            <SignOutButton />
          </div>
        </Panel>
      )
  }
}
