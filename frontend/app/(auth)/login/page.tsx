'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Sprout } from 'lucide-react';

import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Wasn't in the files you shared — (app)/layout.tsx imports ProtectedRoute
 * which redirects here on logout/expiry, but no /login page existed yet.
 * This is a new page; adjust styling to match whatever your real one had
 * if you already have a design for it.
 */
export default function LoginPage() {
  const { login, enterGuestMode } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      // Land on the post-login gate, not the dashboard: the user consciously
      // confirms their farm or chooses a location before seeing recommendations.
      router.push('/start');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleGuest() {
    enterGuestMode();
    router.push('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Sprout className="h-6 w-6 text-emerald-700" />
          <span className="font-[var(--font-display)] text-xl text-[var(--forest-900)]">YieldAI</span>
        </div>

        <h1 className="mb-1 text-lg font-semibold text-stone-900">Sign in</h1>
        <p className="mb-6 text-sm text-stone-500">Welcome back.</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-stone-200" />
          <span className="text-xs text-stone-400">or</span>
          <div className="h-px flex-1 bg-stone-200" />
        </div>

        <button
          onClick={handleGuest}
          className="w-full rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Continue as guest
        </button>
        <p className="mt-1.5 text-center text-[11px] text-stone-400">Read-only preview, no account needed.</p>

        <p className="mt-6 text-center text-sm text-stone-500">
          New here?{' '}
          <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
