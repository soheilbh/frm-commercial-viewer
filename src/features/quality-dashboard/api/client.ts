import type { CommercialReportPayload } from './types';

export async function fetchCommercialSavedDashboardReport(
  year: number,
  week: number
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
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Saved commercial report request failed (${res.status})`);
  }
  return res.json();
}
