'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Zap, LayoutDashboard, FileText, BookTemplate, History, LogOut, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui';

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/drafts',     label: 'Borradores', icon: FileText },
  { href: '/templates',  label: 'Plantillas', icon: BookTemplate },
  { href: '/history',    label: 'Historial',  icon: History },
];

export function AppNav({ userName }: { userName?: string | null }) {
  const path = usePathname();

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-gray-100 bg-white min-h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">FastPublisher</span>
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon size={16} />
              {label}
              {active && <ChevronRight size={12} className="ml-auto text-indigo-400" />}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-3 border-t border-gray-100 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-xs text-indigo-600 font-medium hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <Zap size={13} />
          Nueva publicación
        </Link>
        {userName && (
          <div className="px-3 py-1 text-xs text-gray-400 truncate">{userName}</div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
