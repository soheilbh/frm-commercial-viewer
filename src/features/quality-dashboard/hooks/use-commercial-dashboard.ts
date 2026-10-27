'use client';

import {
  fetchCommercialSavedDashboardReport,
  type CommercialPlantId
} from '@/features/quality-dashboard/api/client';
import type { CommercialReportPayload } from '@/features/quality-dashboard/api/types';
import {
  getCompletedWeekKey,
  parseWeekKey
} from '@/features/quality-dashboard/lib/weekly-context';
import { useCallback, useEffect, useState } from 'react';

function getInitialWeekKey(): string {
  if (typeof window === 'undefined') return getCompletedWeekKey();
  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');
  const week = params.get('week');
  if (year && week) {
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  return getCompletedWeekKey();
}

export function useCommercialDashboard(plant: CommercialPlantId = 'frm') {
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(() => getInitialWeekKey());
  const [baseReport, setBaseReport] = useState<CommercialReportPayload | null>(null);
  const [savedGeneratedAt, setSavedGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { year, week } = parseWeekKey(selectedWeekKey);
      const saved = await fetchCommercialSavedDashboardReport(year, week, plant);
      setBaseReport({ ...saved.payload, plant: saved.payload.plant ?? plant, selected_week_key: selectedWeekKey });
      setSavedGeneratedAt(saved.generated_at ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load commercial dashboard';
      if (message.includes('404') || message.includes('No saved commercial report')) {
        setError(null);
      } else {
        setError(message);
      }
      setBaseReport(null);
      setSavedGeneratedAt(null);
    } finally {
      setLoading(false);
    }
  }, [selectedWeekKey, plant]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    baseReport,
    loading,
    error,
    savedGeneratedAt,
    selectedWeekKey,
    setSelectedWeekKey,
    reload: load
  };
}
