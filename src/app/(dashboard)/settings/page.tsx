import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { Settings } from 'lucide-react';
import { SettingsForm } from '@/components/SettingsForm';

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const prefs = await prisma.sellerPreferences.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const initial = {
    defaultCurrency: prefs.defaultCurrency,
    defaultShipping: prefs.defaultShipping,
    defaultWarranty: prefs.defaultWarranty ?? '',
    localPickUp: prefs.localPickUp,
    defaultCondition: prefs.defaultCondition ?? '',
    defaultListingType: prefs.defaultListingType,
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
          <Settings size={18} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Preferencias</h1>
          <p className="text-sm text-gray-500 mt-0.5">Defaults aplicados a todos los productos nuevos.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <SettingsForm initial={initial} />
      </div>
    </div>
  );
}
