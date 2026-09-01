'use client';

import { CommercialDashboardView } from '@/features/quality-dashboard/components/commercial-dashboard-view';
import { Suspense } from 'react';

export default function HomePage() {
  return (
    <Suspense fallback={<div className='p-8 text-sm text-muted-foreground'>Loading report…</div>}>
      <CommercialDashboardView />
    </Suspense>
  );
}
