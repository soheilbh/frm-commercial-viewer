import type {
  CommercialMetricComparison,
  CommercialReportPayload,
  CommercialWeeklySeries
} from '@/features/quality-dashboard/api/types';
import { enrichCommercialReportClient } from '@/features/quality-dashboard/lib/commercial-analytics';
import {
  formatWeekLabel,
  isoWeekKey,
  parseWeekKey,
  sortWeekKeys,
  weekKeyLte
} from '@/features/quality-dashboard/lib/weekly-context';

export type CommercialWeekOption = {
  key: string;
  label: string;
  weekNumber: number;
};

const MIN_SELECT_YEAR = 2026;

function collectWeekKeys(report: CommercialReportPayload): string[] {
  const keys = new Set<string>();
  for (const p of report.chlorine.points) keys.add(isoWeekKey(p.time));
  for (const p of report.input_moisture.points) keys.add(isoWeekKey(p.time));
  for (const p of report.output_moisture.points) keys.add(isoWeekKey(p.time));
  for (const p of report.composition_points) keys.add(isoWeekKey(p.time));
  for (const d of report.throughput_daily ?? []) keys.add(isoWeekKey(d.day_start));
  for (const s of report.weekly_series ?? []) {
    for (const p of s.points) {
      if (p.week_start) keys.add(isoWeekKey(p.week_start));
    }
  }
  return sortWeekKeys(Array.from(keys)).filter((k) => parseWeekKey(k).year >= MIN_SELECT_YEAR);
}

export function listAvailableWeeks(report: CommercialReportPayload): CommercialWeekOption[] {
  return collectWeekKeys(report)
    .map((key) => ({
      key,
      label: formatWeekLabel(key),
      weekNumber: parseWeekKey(key).week
    }))
    .reverse();
}

export function defaultWeekKey(report: CommercialReportPayload): string {
  const keys = collectWeekKeys(report);
  if (!keys.length) return isoWeekKey(new Date().toISOString());
  if (report.week_number != null) {
    const match = keys.find((k) => parseWeekKey(k).week === report.week_number);
    if (match) return match;
  }
  return keys[keys.length - 1];
}

type WeeklyPoint = { week_label: string; week_start: string; value: number };

function weeklyPointsFromDaily(
  points: { time: string; value: number | null }[]
): WeeklyPoint[] {
  const byWeek = new Map<string, { week_label: string; week_start: string; sum: number; count: number }>();

  for (const p of points) {
    if (p.value == null) continue;
    const key = isoWeekKey(p.time);
    const row = byWeek.get(key) ?? {
      week_label: formatWeekLabel(key),
      week_start: p.time,
      sum: 0,
      count: 0
    };
    row.sum += p.value;
    row.count += 1;
    if (p.time < row.week_start) row.week_start = p.time;
    byWeek.set(key, row);
  }

  return Array.from(byWeek.values())
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((row) => ({
      week_label: row.week_label,
      week_start: row.week_start,
      value: row.sum / row.count
    }));
}

function weeklyPointsForMetric(
  report: CommercialReportPayload,
  metricId: string
): WeeklyPoint[] {
  const fromSeries = (report.weekly_series?.find((s) => s.id === metricId)?.points ?? [])
    .filter((p): p is { week_label: string; week_start: string; value: number } => p.value != null)
    .map((p) => ({
      week_label: p.week_label,
      week_start: p.week_start,
      value: p.value
    }));

  let fromDaily: WeeklyPoint[] = [];
  if (metricId === 'chlorine') fromDaily = weeklyPointsFromDaily(report.chlorine.points);
  else if (metricId === 'pvc') {
    fromDaily = weeklyPointsFromDaily(
      report.composition_points.map((p) => ({ time: p.time, value: p.values['PVC'] ?? null }))
    );
  } else if (metricId === 'input_moisture') fromDaily = weeklyPointsFromDaily(report.input_moisture.points);
  else if (metricId === 'output_moisture') fromDaily = weeklyPointsFromDaily(report.output_moisture.points);
  else if (metricId === 'feed_volume') {
    const byWeek = new Map<string, { week_start: string; sum: number }>();
    for (const d of report.throughput_daily ?? []) {
      const val = d.feed_t;
      if (val == null) continue;
      const key = isoWeekKey(d.day_start);
      const row = byWeek.get(key) ?? { week_start: d.day_start, sum: 0 };
      row.sum += val;
      if (d.day_start < row.week_start) row.week_start = d.day_start;
      byWeek.set(key, row);
    }
    fromDaily = sortWeekKeys(Array.from(byWeek.keys())).map((key) => {
      const row = byWeek.get(key)!;
      return {
        week_label: formatWeekLabel(key),
        week_start: row.week_start,
        value: row.sum
      };
    });
  }

  const byWeek = new Map<string, WeeklyPoint>();
  for (const p of fromDaily) byWeek.set(isoWeekKey(p.week_start), p);
  for (const p of fromSeries) byWeek.set(isoWeekKey(p.week_start), p);

  return Array.from(byWeek.values()).sort((a, b) => a.week_start.localeCompare(b.week_start));
}

function weeklyWindow(points: WeeklyPoint[], anchorKey: string, count = 12): WeeklyPoint[] {
  return points.filter((p) => weekKeyLte(isoWeekKey(p.week_start), anchorKey)).slice(-count);
}

function avgWeekly12w(points: WeeklyPoint[], anchorKey: string): number | null {
  const window = weeklyWindow(points, anchorKey, 12);
  if (!window.length) return null;
  return window.reduce((s, p) => s + p.value, 0) / window.length;
}

function valueAtWeek(points: WeeklyPoint[], anchorKey: string): number | null {
  const hit = points.find((p) => isoWeekKey(p.week_start) === anchorKey);
  return hit?.value ?? null;
}

function compositionSharesByWeek(
  report: CommercialReportPayload
): Map<string, Record<string, number>> {
  const byWeek = new Map<string, Record<string, number[]>>();

  for (const p of report.composition_points) {
    const key = isoWeekKey(p.time);
    const row = byWeek.get(key) ?? {};
    for (const [mat, val] of Object.entries(p.values)) {
      (row[mat] ??= []).push(val);
    }
    byWeek.set(key, row);
  }

  const out = new Map<string, Record<string, number>>();
  for (const [key, mats] of Array.from(byWeek.entries())) {
    const totals: Record<string, number> = {};
    let sum = 0;
    for (const [mat, vals] of Object.entries(mats)) {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      totals[mat] = avg;
      sum += avg;
    }
    const shares: Record<string, number> = {};
    for (const [mat, val] of Object.entries(totals)) {
      shares[mat] = sum > 0 ? (val / sum) * 100 : 0;
    }
    out.set(key, shares);
  }
  return out;
}

function makeComparison(
  id: string,
  label: string,
  unit: string,
  lastWeek: number | null,
  baseline: number | null
): CommercialMetricComparison | null {
  if (lastWeek == null || baseline == null) return null;
  const diff = lastWeek - baseline;
  return {
    id,
    label,
    unit,
    three_month_avg: round(baseline, unit === ' t' ? 1 : unit === '%' ? 2 : 4),
    last_week_avg: round(lastWeek, unit === ' t' ? 1 : unit === '%' ? 2 : 4),
    difference: round(diff, unit === ' t' ? 1 : unit === '%' ? 2 : 4),
    difference_pct: baseline !== 0 ? round((diff / baseline) * 100, 1) : 0
  };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function recomputeComparisons(
  base: CommercialReportPayload,
  weekKey: string
): CommercialMetricComparison[] {
  const comparisons: CommercialMetricComparison[] = [];
  const compositionByWeek = compositionSharesByWeek(base);
  const weekKeys = sortWeekKeys(Array.from(compositionByWeek.keys())).filter((k) =>
    weekKeyLte(k, weekKey)
  );
  const compositionWindow = weekKeys.slice(-12);

  const materialIds = new Set<string>();
  for (const shares of Array.from(compositionByWeek.values())) {
    for (const mat of Object.keys(shares)) materialIds.add(mat);
  }

  for (const mat of Array.from(materialIds)) {
    const label = mat.replace(/_/g, ' ');
    const currentShares = compositionByWeek.get(weekKey);
    const lastWeek = currentShares?.[mat] ?? null;
    const baselineVals = compositionWindow
      .map((k) => compositionByWeek.get(k)?.[mat])
      .filter((v): v is number => v != null);
    const baseline =
      baselineVals.length > 0
        ? baselineVals.reduce((s, v) => s + v, 0) / baselineVals.length
        : null;
    const row = makeComparison(mat.toLowerCase(), label, '%', lastWeek, baseline);
    if (row) comparisons.push(row);
  }

  const qualityMetrics: Array<{ id: string; label: string; unit: string }> = [
    { id: 'chlorine', label: 'Chlorine', unit: '%' },
    { id: 'input_moisture', label: 'Input Moisture', unit: '%' },
    { id: 'output_moisture', label: 'Output Moisture', unit: '%' },
    { id: 'pvc', label: 'Input PVC', unit: '%' }
  ];

  for (const m of qualityMetrics) {
    const points = weeklyPointsForMetric(base, m.id);
    const lastWeek = valueAtWeek(points, weekKey);
    const baseline = avgWeekly12w(points, weekKey);
    const row = makeComparison(m.id, m.label, m.unit, lastWeek, baseline);
    if (row) comparisons.push(row);
  }

  const feedPoints = weeklyPointsForMetric(base, 'feed_volume');
  const feedWeek = valueAtWeek(feedPoints, weekKey);
  const feedAvg = avgWeekly12w(feedPoints, weekKey);

  const feedRow = makeComparison('feed_volume', 'Feed Input', ' t', feedWeek, feedAvg);
  if (feedRow) comparisons.push(feedRow);

  return comparisons;
}

function preserveWeeklySeries(
  existing: CommercialWeeklySeries[] | undefined,
  updates: CommercialWeeklySeries[]
): CommercialWeeklySeries[] {
  const byId = new Map((existing ?? []).map((s) => [s.id, s]));

  const score = (s: CommercialWeeklySeries) => {
    const start = s.points[0]?.week_start ?? '';
    const hasIsoDate = start.includes('T') || /^\d{4}-\d{2}/.test(start);
    return (hasIsoDate ? 1000 : 0) + s.points.length;
  };

  for (const s of updates) {
    const prev = byId.get(s.id);
    if (!prev || score(s) > score(prev)) {
      byId.set(s.id, s);
    }
  }

  return Array.from(byId.values());
}

export function buildScopedCommercialReport(
  base: CommercialReportPayload,
  weekKey: string
): CommercialReportPayload {
  const comparisons = recomputeComparisons(base, weekKey);
  const feedPoints = weeklyPointsForMetric(base, 'feed_volume');
  const feedWeek = valueAtWeek(feedPoints, weekKey);
  const feedAvg = avgWeekly12w(feedPoints, weekKey);
  const { week } = parseWeekKey(weekKey);
  const isNativePayloadWeek = base.week_number === week;

  const stripped: CommercialReportPayload = {
    ...base,
    selected_week_key: weekKey,
    week_number: week,
    comparisons,
    last_week_input_tonnage: feedWeek ?? undefined,
    feed_volume_3m_avg: feedAvg ?? undefined,
    scorecard: undefined,
    executive_narrative: undefined,
    threshold_exposure: isNativePayloadWeek ? base.threshold_exposure : undefined,
    compliance: undefined,
    stability: undefined,
    correlations: undefined,
    change_highlights: undefined,
    conclusions: undefined
  };

  const enriched = enrichCommercialReportClient(stripped);
  return {
    ...enriched,
    weekly_series: preserveWeeklySeries(base.weekly_series, enriched.weekly_series ?? [])
  };
}
