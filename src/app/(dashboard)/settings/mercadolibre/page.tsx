import { Suspense } from 'react';
import { MLConnectionSettings } from '@/components/MLConnectionSettings';

export default function MercadoLibreSettingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-8 text-center">Cargando...</div>}>
      <MLConnectionSettings />
    </Suspense>
  );
}
