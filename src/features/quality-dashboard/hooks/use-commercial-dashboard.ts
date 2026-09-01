'use client';

import { fetchCommercialSavedDashboardReport } from '@/features/quality-dashboard/api/client';
import type { CommercialReportPayload } from '@/features/quality-dashboard/api/types';
import {
  getCompletedWeekKey,
  parseWeekKey
} from '@/features/quality-dashboard/lib/weekly-context';
import { useCallback, useEffect, useState } from 'react';

export function useCommercialDashboard() {
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(() => getCompletedWeekKey());
  const [baseReport, setBaseReport] = useState<CommercialReportPayload | null>(null);
  const [savedGeneratedAt, setSavedGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { year, week } = parseWeekKey(selectedWeekKey);
      const saved = await fetchCommercialSavedDashboardReport(year, week);
      setBaseReport({ ...saved.payload, selected_week_key: selectedWeekKey });
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
  }, [selectedWeekKey]);

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
