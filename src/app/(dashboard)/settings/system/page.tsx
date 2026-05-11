import { Suspense } from 'react';
import { SystemSettings } from '@/components/SystemSettings';

export default function SystemSettingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-8 text-center">Cargando diagnósticos...</div>}>
      <SystemSettings />
    </Suspense>
  );
}
