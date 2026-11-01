// src/components/AdminLogin.tsx
import { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

const FIELD = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40';

export default function AdminLogin({ onLoginSuccess, notice }: { onLoginSuccess: () => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Message générique : ne pas indiquer si l'e-mail existe
      setError(error.status === 400 ? 'Identifiants incorrects' : 'Connexion impossible pour le moment');
      setLoading(false);
      return;
    }

    // Ne jamais journaliser la session (elle contient les jetons d'accès)
    onLoginSuccess();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-28">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-7 shadow-2xl shadow-indigo-950/50 backdrop-blur-xl sm:p-9">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white">
            <LockKeyhole size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-white">Administration</h1>
            <p className="text-sm text-slate-400">Connexion, puis double authentification</p>
          </div>
        </div>

        {notice && (
          <p role="status" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </p>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium text-slate-300">E-mail</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
              required
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-slate-300">Mot de passe</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
              required
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-secondary font-semibold text-white transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:opacity-60"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
          Session protégée : double authentification obligatoire et verrouillage automatique après
          10 minutes sans activité.
        </p>
      </div>
    </div>
  );
}
