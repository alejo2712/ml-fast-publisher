import { Suspense } from 'react';
import { ProductionReadiness } from '@/components/ProductionReadiness';

export default function ProductionReadinessPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-8 text-center">Verificando estado de producción...</div>}>
      <ProductionReadiness />
    </Suspense>
  );
}
