import { NextRequest, NextResponse } from 'next/server';

import { apiFetch } from '@/lib/api-proxy';

export async function GET(request: NextRequest) {
  const year = request.nextUrl.searchParams.get('year');
  const week = request.nextUrl.searchParams.get('week');
  if (!year || !week) {
    return NextResponse.json({ detail: 'year and week are required' }, { status: 400 });
  }

  try {
    const path = `/quality-dashboard/commercial-report/viewer/saved?year=${encodeURIComponent(year)}&week=${encodeURIComponent(week)}`;
    const res = await apiFetch(path);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
