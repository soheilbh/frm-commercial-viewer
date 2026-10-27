import type { CommercialReportPayload } from './types';

export type CommercialPlantId = 'frm' | 'tsp';

/** `?plant=tsp` selects Teesside; anything else is FRM. */
export function plantFromParam(value: string | null | undefined): CommercialPlantId {
  return value === 'tsp' ? 'tsp' : 'frm';
}

export async function fetchCommercialSavedDashboardReport(
  year: number,
  week: number,
  plant: CommercialPlantId = 'frm'
): Promise<{
  year: number;
  week: number;
  payload: CommercialReportPayload;
  job_id?: string | null;
  generated_at?: string;
}> {
  const url = new URL('/api/commercial-report/saved', window.location.origin);
  url.searchParams.set('year', String(year));
  url.searchParams.set('week', String(week));
  url.searchParams.set('plant', plant);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Saved commercial report request failed (${res.status})`);
  }
  return res.json();
}

