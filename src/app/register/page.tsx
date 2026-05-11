'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Error al registrarse.');
      return;
    }
    router.push('/login?registered=1');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Crear cuenta</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl border border-red-200">
              {error}
            </div>
          )}
          {['Nombre', 'Email', 'Contraseña'].map((label, i) => (
            <div key={label} className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <input
                type={i === 1 ? 'email' : i === 2 ? 'password' : 'text'}
                value={i === 0 ? name : i === 1 ? email : password}
                onChange={(e) => [setName, setEmail, setPassword][i](e.target.value)}
                required
                minLength={i === 2 ? 8 : 1}
                autoFocus={i === 0}
                className={cn('w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200',
                  'focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50')}
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Creando...</> : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-indigo-600 font-medium hover:underline">Ingresar</Link>
        </p>
      </div>
    </div>
  );
}
