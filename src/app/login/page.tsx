'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError('Email o contraseña incorrectos.');
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl border border-red-200">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className={cn('w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200',
            'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50')}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={cn('w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200',
            'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50')}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
      >
        {loading ? <><Loader2 size={15} className="animate-spin" /> Ingresando...</> : 'Ingresar'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Iniciar sesión</h1>
          <p className="text-sm text-gray-500">FastPublisher para Mercado Libre</p>
        </div>

        <Suspense fallback={<div className="h-48 bg-white rounded-2xl border border-gray-100 animate-pulse" />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-sm text-gray-500">
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="text-indigo-600 font-medium hover:underline">Registrarse</Link>
        </p>
      </div>
    </div>
  );
}
