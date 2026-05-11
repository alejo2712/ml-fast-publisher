import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { AppNav } from '@/components/Nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppNav userName={session.user.name ?? session.user.email} />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
