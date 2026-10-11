import type {
  CommercialReportPayload,
  CommercialThroughputDay,
  CommercialWeeklySeries
} from '@/features/quality-dashboard/api/types';
import {
  COMMERCIAL_CHLORINE_ZONES,
  COMMERCIAL_INPUT_MOISTURE_ZONES,
  COMMERCIAL_PVC_ZONES,
  KPI_THRESHOLD_COLORS
} from '@/features/quality-dashboard/lib/kpi-threshold-colors';

export type MetricWeeklyContext = {
  currentWeek: number | null;
  lastWeek: number | null;
  avg12Week: number | null;
  best12Week: number | null;
  trend: 'up' | 'down' | 'flat';
  status: 'OK' | 'Watch' | 'Alert';
  rankLabel: string;
  sparkline12: number[];
};

export type ThresholdDistribution = {
  withinPct: number;
  nearPct: number;
  abovePct: number;
  withinCount: number;
  nearCount: number;
  aboveCount: number;
  totalReadings: number;
  buckets: { label: string; count: number; fill: string }[];
  /** @deprecated Threshold readings are not mass-weighted. */
  impactTonnes: number | null;
  impactLabel: string;
};

export type CompositionCategory = {
  label: string;
  currentPct: number;
  normalPct: number;
  delta: number;
  color: string;
};

export const FEEDSTOCK_STACK_KEYS = [
  'plastics',
  'organic',
  'pvc',
  'beverage',
  'others'
] as const;

export type FeedstockStackKey = (typeof FEEDSTOCK_STACK_KEYS)[number];

export type CompositionAreaPoint = {
  idx: number;
  label: string;
  weekLabel: string;
  timeLabel?: string;
  isSelectedWeek?: boolean;
  hasData?: boolean;
  /** Sum of grouped category shares from the API before re-normalization to 100%. */
  classifiedRawTotal: number;
} & Record<FeedstockStackKey, number>;

/** How classified material shares are derived (optical background excluded upstream). */
export const COMPOSITION_SHARES_NOTE =
  'Percent of classified incoming feed only. Optical background is excluded before shares are calculated.';

const MATERIAL_CATEGORIES: Array<{
  key: FeedstockStackKey;
  label: string;
  ids: string[];
  color: string;
}> = [
  { key: 'plastics', label: 'Plastics', ids: ['polymers', 'pc_ps_abs_eps', 'dark_polymers'], color: 'var(--commercial-mix-plastics)' },
  { key: 'organic', label: 'Organic', ids: ['organic', 'paper', 'foam'], color: 'var(--commercial-mix-organic)' },
  { key: 'pvc', label: 'PVC', ids: ['pvc'], color: 'var(--commercial-mix-pvc)' },
  { key: 'beverage', label: 'Beverage Cartons', ids: ['po_alu'], color: 'var(--commercial-mix-beverage)' },
  { key: 'others', label: 'Others', ids: ['ceramics', 'metal', 'fkn', 'textile'], color: 'var(--commercial-mix-others)' }
];

/** ISO week anchor — selected week or latest week in the dataset. */
export function getAnchorWeekKey(report: CommercialReportPayload): string {
  if (report.selected_week_key) return report.selected_week_key;
  const keys = collectWeekKeysFromReport(report);
  return keys[keys.length - 1] ?? isoWeekKey(new Date().toISOString());
}

function collectWeekKeysFromReport(report: CommercialReportPayload): string[] {
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
  return sortWeekKeys(Array.from(keys));
}

function weeklyPointsUpToAnchor(
  report: CommercialReportPayload,
  metricId: string
): WeeklyPoint[] {
  const anchor = getAnchorWeekKey(report);
  return weeklyPointsForMetric(report, metricId).filter((p) =>
    weekKeyLte(isoWeekKey(p.week_start), anchor)
  );
}

/** Up to 7 daily points ending on the last day of the selected week. */
function dailyPointsForSelectedWeek(
  report: CommercialReportPayload,
  points: { time: string; value: number | null }[]
): { time: string; value: number }[] {
  const anchor = getAnchorWeekKey(report);
  const valid = points
    .filter((p): p is { time: string; value: number } => p.value != null)
    .filter((p) => weekKeyLte(isoWeekKey(p.time), anchor))
    .sort((a, b) => a.time.localeCompare(b.time));

  if (!valid.length) return [];

  const inWeek = valid.filter((p) => isoWeekKey(p.time) === anchor);
  if (inWeek.length) return inWeek;

  const lastTime = valid[valid.length - 1].time;
  const endIdx = valid.findIndex((p) => p.time === lastTime);
  const startIdx = Math.max(0, endIdx - (THIS_WEEK_DAYS - 1));
  return valid.slice(startIdx, endIdx + 1);
}

function dailyPointsInAnchorWeek(
  report: CommercialReportPayload,
  metricId: string
): { time: string; value: number }[] {
  return dailyPointsForSelectedWeek(report, getRawDailyPoints(report, metricId));
}

function getComparison(report: CommercialReportPayload, id: string) {
  return report.comparisons.find((c) => c.id === id);
}

const REPORT_TIME_ZONE = 'Europe/Amsterdam';

const amsDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function amsterdamParts(time: string | Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const date = typeof time === 'string' ? new Date(time) : time;
  const parts = Object.fromEntries(
    amsDateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function amsterdamDayKey(time: string): string {
  const p = amsterdamParts(time);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function amsterdamOffsetMs(date: Date): number {
  const p = amsterdamParts(date);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return localAsUtc - date.getTime();
}

function amsterdamLocalToUtcIso(dayKey: string, hour: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    utcMs = Date.UTC(year, month - 1, day, hour, 0, 0) - amsterdamOffsetMs(new Date(utcMs));
  }
  return new Date(utcMs).toISOString();
}

export function isoWeekKey(time: string): string {
  const p = amsterdamParts(time);
  const th = new Date(Date.UTC(p.year, p.month - 1, p.day));
  th.setUTCDate(th.getUTCDate() + 4 - (th.getUTCDay() || 7));
  const ys = new Date(Date.UTC(th.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((th.getTime() - ys.getTime()) / 86400000 + 1) / 7);
  return `${th.getUTCFullYear()}-W${w}`;
}

export function parseWeekKey(key: string): { year: number; week: number } {
  const [yearPart, weekPart] = key.split('-W');
  return { year: Number(yearPart), week: Number(weekPart) };
}

export function formatWeekLabel(key: string): string {
  const { week } = parseWeekKey(key);
  return `W${String(week).padStart(2, '0')}`;
}

/** Numeric ISO week ordering — avoids "W9" > "W26" string bugs. */
export function compareWeekKeys(a: string, b: string): number {
  const pa = parseWeekKey(a);
  const pb = parseWeekKey(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.week - pb.week;
}

export function weekKeyLte(a: string, b: string): boolean {
  return compareWeekKeys(a, b) <= 0;
}

export function sortWeekKeys(keys: string[]): string[] {
  return [...keys].sort(compareWeekKeys);
}

function weeklyAvgsFromDaily(
  points: { time: string; value: number | null }[]
): { key: string; avg: number }[] {
  const byWeek = new Map<string, number[]>();
  points.forEach((p) => {
    if (p.value === null) return;
    const k = isoWeekKey(p.time);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k)!.push(p.value);
  });
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => ({ key, avg: vals.reduce((s, v) => s + v, 0) / vals.length }));
}

function contextFromWeeklyValues(
  values: number[],
  lowerIsBetter: boolean,
  statusFn: (v: number) => 'OK' | 'Watch' | 'Alert'
): Omit<MetricWeeklyContext, 'sparkline12'> {
  if (!values.length) {
    return {
      currentWeek: null,
      lastWeek: null,
      avg12Week: null,
      best12Week: null,
      trend: 'flat',
      status: 'OK',
      rankLabel: 'Insufficient weekly history'
    };
  }

  const slice = values.slice(-12);
  const currentWeek = slice[slice.length - 1] ?? null;
  const lastWeek = slice.length >= 2 ? slice[slice.length - 2] : null;
  const avg12Week = slice.reduce((s, v) => s + v, 0) / slice.length;
  const best12Week = lowerIsBetter ? Math.min(...slice) : Math.max(...slice);

  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (currentWeek !== null && lastWeek !== null) {
    const d = currentWeek - lastWeek;
    if (Math.abs(d) > 0.01) trend = d > 0 ? 'up' : 'down';
  }

  const status = currentWeek !== null ? statusFn(currentWeek) : 'OK';

  return {
    currentWeek,
    lastWeek,
    avg12Week,
    best12Week,
    trend,
    status,
    rankLabel: 'Tracking within recent range'
  };
}

export type WeeklyContextTone = 'good' | 'watch' | 'bad' | 'neutral';
export type MetricImportance = 'high' | 'medium' | 'low';

export type WeeklyContextRow = {
  id: string;
  label: string;
  rankPosition: number;
  rankTotal: number;
  percentile: number;
  lowerIsBetter: boolean;
};

export function percentileLabel(n: number): string {
  return ordinal(Math.round(n));
}

function ordinal(n: number): string {
  const v = Math.abs(Math.round(n));
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

function weekRank(
  values: number[],
  current: number
): { rankLow: number; rankHigh: number; total: number; percentile: number } {
  const total = values.length;
  if (!total) return { rankLow: 0, rankHigh: 0, total: 0, percentile: 50 };
  const below = values.filter((v) => v < current).length;
  const rankLow = Math.min(Math.max(below + 1, 1), total);
  const rankHigh = Math.max(total - below, 1);
  const percentile = total > 1 ? Math.round(((rankLow - 1) / (total - 1)) * 100) : 50;
  return { rankLow, rankHigh, total, percentile };
}

/** Rank this week's value against the last N weekly values (inclusive). */
export function computeWeeklyRank(
  values: number[],
  currentWeek: number | null
): { rankPosition: number; rankTotal: number; percentile: number } {
  const pool = values.slice(-12);
  if (!pool.length || currentWeek === null) {
    return { rankPosition: 0, rankTotal: 0, percentile: 50 };
  }
  const { rankLow, total, percentile } = weekRank(pool, currentWeek);
  return { rankPosition: rankLow, rankTotal: total, percentile };
}

function metricWords(metricId: string): { high: string; low: string } {
  if (metricId.includes('moisture')) return { high: 'wettest', low: 'driest' };
  if (metricId === 'pvc' || metricId === 'ejected_pvc') {
    return { high: 'highest PVC', low: 'lowest PVC' };
  }
  if (metricId === 'feed_volume') return { high: 'highest feed', low: 'lowest feed' };
  return { high: 'highest', low: 'lowest' };
}

function weeklyContextTone(
  rankLow: number,
  total: number,
  lowerIsBetter: boolean
): WeeklyContextTone {
  if (total < 3) return 'neutral';
  if (lowerIsBetter) {
    if (rankLow >= total - 1) return 'bad';
    if (rankLow <= 2) return 'good';
    if (rankLow > total / 2) return 'watch';
    return 'neutral';
  }
  if (rankLow <= 2) return 'bad';
  if (rankLow >= total - 1) return 'good';
  if (rankLow <= total / 2) return 'watch';
  return 'neutral';
}

export function formatWeeklyContextPosition(
  metricId: string,
  ctx: MetricWeeklyContext,
  lowerIsBetter: boolean
): {
  rankPosition: number;
  rankTotal: number;
  position: string;
  note: string | null;
  tone: WeeklyContextTone;
} {
  const vals = ctx.sparkline12;
  if (!vals.length || ctx.currentWeek === null || vals.length < 3) {
    return {
      rankPosition: 0,
      rankTotal: 0,
      position: 'Insufficient weekly history',
      note: null,
      tone: 'neutral'
    };
  }

  const { rankLow, rankHigh, total } = weekRank(vals, ctx.currentWeek);
  const rankPosition = rankLow;
  const { high, low } = metricWords(metricId);
  const window = `of last ${total} week${total === 1 ? '' : 's'}`;

  let position: string;
  if (lowerIsBetter) {
    if (rankLow === total) {
      position = `${high.charAt(0).toUpperCase() + high.slice(1)} week ${window}`;
    } else if (rankLow === 1) {
      position = `${low.charAt(0).toUpperCase() + low.slice(1)} week ${window}`;
    } else if (rankLow > total / 2) {
      position = `${ordinal(rankLow)} ${high} week ${window}`;
    } else {
      position = `${ordinal(rankLow)} ${low} week ${window}`;
    }
  } else if (rankHigh === total) {
    position = `${high.charAt(0).toUpperCase() + high.slice(1)} week ${window}`;
  } else if (rankHigh === 1) {
    position = `${low.charAt(0).toUpperCase() + low.slice(1)} week ${window}`;
  } else if (rankHigh > total / 2) {
    position = `${ordinal(rankHigh)} ${high} week ${window}`;
  } else {
    position = `${ordinal(rankHigh)} ${low} week ${window}`;
  }

  let note: string | null = null;
  if (ctx.avg12Week !== null) {
    const delta = ctx.currentWeek - ctx.avg12Week;
    const threshold = Math.max(Math.abs(ctx.avg12Week) * 0.03, 0.02);
    if (Math.abs(delta) > threshold) {
      note = delta > 0 ? '↑ Above historical average' : '↓ Below historical average';
    }
  }

  return {
    rankPosition,
    rankTotal: total,
    position,
    note,
    tone: weeklyContextTone(rankLow, total, lowerIsBetter)
  };
}

const WEEKLY_CONTEXT_METRICS = [
  { id: 'feed_volume', label: 'Input Volume', lowerIsBetter: false },
  { id: 'pvc', label: 'Input PVC', lowerIsBetter: true },
  { id: 'chlorine', label: 'Chlorine', lowerIsBetter: true },
  { id: 'input_moisture', label: 'Input Moisture', lowerIsBetter: true },
  { id: 'output_moisture', label: 'Output Moisture', lowerIsBetter: true }
] as const;

export function buildWeeklyContextRows(report: CommercialReportPayload): WeeklyContextRow[] {
  return WEEKLY_CONTEXT_METRICS.map(({ id, label, lowerIsBetter }) => {
    const ctx = buildMetricContext(report, id);
    const { rankPosition, rankTotal, percentile } = computeWeeklyRank(ctx.sparkline12, ctx.currentWeek);
    return { id, label, rankPosition, rankTotal, percentile, lowerIsBetter };
  });
}

function chlorineStatus(v: number): 'OK' | 'Watch' | 'Alert' {
  if (v >= 1.2) return 'Alert';
  if (v >= 0.8) return 'Watch';
  return 'OK';
}

function pvcStatus(v: number): 'OK' | 'Watch' | 'Alert' {
  if (v >= 2.0) return 'Alert';
  if (v >= 1.8) return 'Watch';
  return 'OK';
}

function moistureStatus(v: number): 'OK' | 'Watch' | 'Alert' {
  if (v >= 10) return 'Alert';
  if (v >= 8) return 'Watch';
  return 'OK';
}

function inputMoistureStatus(v: number): 'OK' | 'Watch' | 'Alert' {
  return v >= COMMERCIAL_INPUT_MOISTURE_ZONES.warnMax ? 'Alert' : 'OK';
}

function feedStatus(): 'OK' | 'Watch' | 'Alert' {
  return 'OK';
}

function seriesValues(series: CommercialWeeklySeries | undefined): number[] {
  return (series?.points ?? []).map((p) => p.value).filter((v): v is number => v !== null);
}

function seriesValuesUpToAnchor(
  series: CommercialWeeklySeries | undefined,
  anchor: string
): number[] {
  return (series?.points ?? [])
    .filter((p) => p.value != null && weekKeyLte(isoWeekKey(p.week_start), anchor))
    .map((p) => p.value as number);
}

export function buildMetricContext(
  report: CommercialReportPayload,
  metricId: string
): MetricWeeklyContext {
  let values: number[] = [];
  let lowerIsBetter = true;
  let statusFn: (v: number) => 'OK' | 'Watch' | 'Alert' = chlorineStatus;
  const anchor = getAnchorWeekKey(report);

  if (metricId === 'chlorine') {
    const series = report.weekly_series?.find((s) => s.id === 'chlorine');
    values = seriesValuesUpToAnchor(series, anchor);
    if (values.length < 2) {
      values = weeklyAvgsFromDaily(report.chlorine.points)
        .filter((w) => weekKeyLte(w.key, anchor))
        .map((w) => w.avg);
    }
    statusFn = chlorineStatus;
  } else if (metricId === 'pvc') {
    const series = report.weekly_series?.find((s) => s.id === 'pvc');
    values = seriesValuesUpToAnchor(series, anchor);
    if (values.length < 2) {
      values = weeklyAvgsFromDaily(
        report.composition_points.map((p) => ({ time: p.time, value: p.values['PVC'] ?? 0 }))
      )
        .filter((w) => weekKeyLte(w.key, anchor))
        .map((w) => w.avg);
    }
    statusFn = pvcStatus;
  } else if (metricId === 'ejected_pvc') {
    // Reject-stream purity: higher PVC share is favourable (no threshold bands yet).
    lowerIsBetter = false;
    const series = report.weekly_series?.find((s) => s.id === 'ejected_pvc');
    values = seriesValuesUpToAnchor(series, anchor);
    if (values.length < 2) {
      values = weeklyAvgsFromDaily(report.ejected_pvc?.points ?? [])
        .filter((w) => weekKeyLte(w.key, anchor))
        .map((w) => w.avg);
    }
    statusFn = () => 'OK';
  } else if (metricId === 'input_moisture') {
    values = weeklyPointsUpToAnchor(report, 'input_moisture').map((p) => p.value);
    statusFn = inputMoistureStatus;
  } else if (metricId === 'output_moisture') {
    const series = report.weekly_series?.find((s) => s.id === 'output_moisture');
    values = seriesValuesUpToAnchor(series, anchor);
    if (values.length < 2) {
      values = weeklyAvgsFromDaily(report.output_moisture.points)
        .filter((w) => weekKeyLte(w.key, anchor))
        .map((w) => w.avg);
    }
    statusFn = moistureStatus;
  } else if (metricId === 'feed_volume') {
    lowerIsBetter = false;
    statusFn = feedStatus;
    values = weeklyPointsUpToAnchor(report, 'feed_volume').map((p) => p.value);
    if (values.length < 2) {
      const feed = getComparison(report, 'feed_volume');
      const cur = feed?.last_week_avg ?? report.last_week_input_tonnage;
      const avg = feed?.three_month_avg ?? report.feed_volume_3m_avg;
      if (cur != null && avg != null) {
        values = [avg * 0.95, avg, cur];
      }
    }
  }

  const ctx = contextFromWeeklyValues(values, lowerIsBetter, statusFn);
  const c = getComparison(report, metricId);
  let sparkline12 = values.slice(-12);
  if (c?.three_month_avg != null) {
    // The comparison baseline is the 12 complete weeks before the selected week.
    // The plotted series includes the selected week, so averaging it here would
    // mix the current result into its own baseline.
    ctx.avg12Week = c.three_month_avg;
  }
  if (c?.last_week_avg != null) {
    ctx.currentWeek = c.last_week_avg;
    if (sparkline12.length) {
      sparkline12 = [...sparkline12];
      sparkline12[sparkline12.length - 1] = c.last_week_avg;
    }
  }

  const { position } = formatWeeklyContextPosition(metricId, { ...ctx, sparkline12 }, lowerIsBetter);

  return { ...ctx, sparkline12, rankLabel: position };
}

export function metricRankPosition(
  ctx: MetricWeeklyContext,
  lowerIsBetter = true
): { rankHigh: number; total: number; percentile: number } {
  void lowerIsBetter;
  const { rankPosition, rankTotal, percentile } = computeWeeklyRank(ctx.sparkline12, ctx.currentWeek);
  return { rankHigh: rankPosition, total: rankTotal, percentile };
}

export type ThresholdSummaryRow = {
  label: string;
  metricId: string;
  hasNearZone: boolean;
  diffVs12W: number | null;
  diffDisplay: string | null;
  abovePct: number;
  nearPct: number;
  withinPct: number;
  aboveCount: number;
  nearCount: number;
  withinCount: number;
};

function formatComparisonDiff(
  metricId: string,
  diff: number | null | undefined,
  unit: string | undefined
): string | null {
  if (diff === null || diff === undefined) return null;
  const dec =
    metricId === 'chlorine' ? 2 : metricId === 'feed_volume' ? 2 : metricId.includes('moisture') ? 1 : 2;
  const u = (unit ?? '%').trim();
  const suffix = u === '%' ? 'pp' : u;
  return `${diff > 0 ? '+' : ''}${diff.toFixed(dec)} ${suffix}`;
}

export function buildThresholdSummary(report: CommercialReportPayload): ThresholdSummaryRow[] {
  const clDaily = getThisWeekDailyValues(report, 'chlorine');
  const pvcDaily = getThisWeekDailyValues(report, 'pvc');
  const moDaily = getThisWeekDailyValues(report, 'input_moisture');

  const specs = [
    {
      label: 'Input PVC',
      metricId: 'pvc',
      hasNearZone: false,
      dist: buildThresholdDistribution(
        pvcDaily,
        COMMERCIAL_PVC_ZONES.okMax,
        COMMERCIAL_PVC_ZONES.warnMax,
        0,
        'input PVC'
      )
    },
    {
      label: 'Chlorine',
      metricId: 'chlorine',
      hasNearZone: true,
      dist: buildThresholdDistribution(
        clDaily,
        COMMERCIAL_CHLORINE_ZONES.okMax,
        COMMERCIAL_CHLORINE_ZONES.warnMax,
        0,
        'chlorine'
      )
    },
    {
      label: 'Input Moisture',
      metricId: 'input_moisture',
      hasNearZone: false,
      dist: buildThresholdDistribution(
        moDaily,
        COMMERCIAL_INPUT_MOISTURE_ZONES.okMax,
        COMMERCIAL_INPUT_MOISTURE_ZONES.warnMax,
        0,
        'input moisture'
      )
    }
  ] as const;

  return specs.map(({ label, metricId, hasNearZone, dist }) => {
    const c = getComparison(report, metricId);
    return {
      label,
      metricId,
      hasNearZone,
      diffVs12W: c?.difference ?? null,
      diffDisplay: formatComparisonDiff(metricId, c?.difference, c?.unit),
      abovePct: dist.abovePct,
      nearPct: dist.nearPct,
      withinPct: dist.withinPct,
      aboveCount: dist.aboveCount,
      nearCount: dist.nearCount,
      withinCount: dist.withinCount
    };
  });
}

export type TornadoItem = {
  label: string;
  /** Relative % change vs 12W avg — used for bar length. */
  value: number;
  display: string;
  absDisplay: string | null;
  fill: string;
};

function tornadoPctChange(c: ReturnType<typeof getComparison>): number {
  if (!c) return 0;
  if (c.difference_pct != null) return c.difference_pct;
  if (c.difference != null && c.three_month_avg) {
    return (c.difference / c.three_month_avg) * 100;
  }
  return 0;
}

export function buildTornadoItems(report: CommercialReportPayload): TornadoItem[] {
  const ids = [
    { id: 'feed_volume', label: 'Input Volume' },
    { id: 'pvc', label: 'Input PVC' },
    { id: 'chlorine', label: 'Chlorine' },
    { id: 'input_moisture', label: 'Input Moisture' },
    { id: 'output_moisture', label: 'Output Moisture' }
  ] as const;
  return ids
    .map(({ id, label }) => {
      const c = getComparison(report, id);
      const pct = tornadoPctChange(c);
      const absDisplay = formatComparisonDiff(id, c?.difference, c?.unit);
      const dec = Math.abs(pct) >= 10 ? 0 : 1;
      return {
        label,
        value: pct,
        display: `${pct > 0 ? '+' : ''}${pct.toFixed(dec)}%`,
        absDisplay,
        fill:
          id === 'feed_volume'
            ? pct >= 0
              ? 'var(--primary)'
              : 'var(--destructive)'
            : pct > 0
              ? 'var(--destructive)'
              : 'var(--primary)'
      };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

export function getWeeklyBarData(
  report: CommercialReportPayload,
  metricId: string
): { week: string; value: number }[] {
  const ctx = buildMetricContext(report, metricId);
  const series = report.weekly_series?.find((s) => s.id === metricId);
  if (series?.points.length) {
    return series.points
      .filter((p) => p.value !== null)
      .map((p) => ({ week: p.week_label, value: p.value as number }));
  }
  return ctx.sparkline12.map((v, i) => ({ week: `W${i + 1}`, value: v }));
}

export type DailyBarPoint = {
  idx: number;
  value: number;
  weekLabel: string;
  isLast: boolean;
  timeLabel?: string;
  isSelectedWeek?: boolean;
  hasData?: boolean;
  /** Shift timestamp, used to align sorter Q on the this-week chart. */
  time?: string;
  /** Operational day key, used to align a second series such as sorter Q. */
  dayKey?: string;
};

/** 12-week trend charts — one bar per calendar week. */
export const TREND_WEEKS = 12;
/** Shift-level readings per week (3 shifts × 7 days). */
export const THIS_WEEK_SHIFTS = 21;
const SHIFTS_PER_DAY = 3;
const LEGACY_SHIFT_HOURS = [0, 8, 16] as const;
const PLANT_SHIFT_HOURS = [7, 15, 23] as const;

export function getChartBucketStartHour(
  report?: CommercialReportPayload | { calculation_config?: Partial<{ chart_bucket_start_hour?: number }> } | null
): number {
  const hour = report?.calculation_config?.chart_bucket_start_hour;
  if (hour === undefined || hour === null) return 0;
  return Number(hour);
}

export function shiftHoursForStartHour(startHour: number): readonly number[] {
  return startHour === 0 ? LEGACY_SHIFT_HOURS : PLANT_SHIFT_HOURS;
}

export function formatChartShiftLabel(startHour: number): string {
  const hours = shiftHoursForStartHour(startHour)
    .map((h) => `${String(h).padStart(2, '0')}:00`)
    .join(', ');
  return startHour === 0 ? `shifts at ${hours}` : `plant shifts at ${hours}`;
}

export function getDailyBucketStartHour(
  report?: CommercialReportPayload | { calculation_config?: Partial<{ chart_bucket_start_hour?: number; daily_bucket_start_hour?: number }> } | null
): number {
  const dailyHour = report?.calculation_config?.daily_bucket_start_hour;
  if (dailyHour !== undefined && dailyHour !== null) return Number(dailyHour);
  return getChartBucketStartHour(report) === 0 ? 0 : 23;
}

export function formatDailyBucketLabel(dailyStartHour: number): string {
  if (dailyStartHour === 0) return 'calendar days from 00:00';
  return `operational days from ${String(dailyStartHour).padStart(2, '0')}:00 to ${String(dailyStartHour).padStart(2, '0')}:00 (3 plant shifts)`;
}

export function formatWeekBoundaryLabel(startHour: number): string {
  if (startHour === 0) return 'week runs Mon 00:00–Mon 00:00 Amsterdam time';
  return 'week runs Sun 23:00–Sun 23:00 Amsterdam time';
}

function utcDayKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Plant week for ISO anchor: Sun 23:00 before Monday → Sun 23:00 on ISO Sunday (exclusive end). */
export function plantWeekBounds(anchorWeekKey: string): { start: string; end: string } {
  const { year, week } = parseWeekKey(anchorWeekKey);
  const mondayUtc = getMondayOfISOWeek(year, week);
  const sundayBefore = new Date(mondayUtc);
  sundayBefore.setUTCDate(mondayUtc.getUTCDate() - 1);
  const isoSunday = new Date(mondayUtc);
  isoSunday.setUTCDate(mondayUtc.getUTCDate() + 6);
  return {
    start: shiftTimeForDay(utcDayKeyFromDate(sundayBefore), 23),
    end: shiftTimeForDay(utcDayKeyFromDate(isoSunday), 23)
  };
}

export function isInPlantWeek(time: string, anchorWeekKey: string, startHour: number): boolean {
  if (startHour === 0) return isoWeekKey(time) === anchorWeekKey;
  const { start, end } = plantWeekBounds(anchorWeekKey);
  return time >= start && time < end;
}

function operationalDayKey(time: string, dailyStartHour: number): string {
  if (dailyStartHour === 0) return amsterdamDayKey(time);
  const dayKey = amsterdamDayKey(time);
  if (amsterdamParts(time).hour < dailyStartHour) return previousAmsterdamDayKey(dayKey);
  return dayKey;
}

/**
 * Calendar date operators associate with an operational day.
 * Plant mode (23:00 start): bucket 26@23→27@23 is labeled 27, not 26.
 */
function operationalDayDisplayKey(time: string, dailyStartHour: number): string {
  if (dailyStartHour === 0) return amsterdamDayKey(time);
  return nextAmsterdamDayKey(operationalDayKey(time, dailyStartHour));
}

/** ISO week key for plant reporting: uses the display day so Sun 23:00 maps into the coming ISO week. */
function plantReportingWeekKey(time: string, startHour: number): string {
  if (startHour === 0) return isoWeekKey(time);
  const displayKey = operationalDayDisplayKey(time, startHour);
  return isoWeekKey(amsterdamLocalToUtcIso(displayKey, 12));
}

function previousAmsterdamDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const prev = new Date(Date.UTC(year, month - 1, day));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
}

function nextAmsterdamDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function amsterdamShiftHour(time: string, startHour: number): number {
  const hour = amsterdamParts(time).hour;
  if (startHour === 0) {
    if (hour < 8) return 0;
    if (hour < 16) return 8;
    return 16;
  }
  if (hour >= 23 || hour < 7) return 23;
  if (hour < 15) return 7;
  return 15;
}

function shiftDayKeyForSlot(time: string, startHour: number): string {
  const dayKey = amsterdamDayKey(time);
  if (startHour !== 0 && amsterdamParts(time).hour < 7) {
    return previousAmsterdamDayKey(dayKey);
  }
  return dayKey;
}

function shiftSlotKey(time: string, startHour: number): string {
  return `${shiftDayKeyForSlot(time, startHour)}-${amsterdamShiftHour(time, startHour)}`;
}

/** Canonical 21 shift timestamps for the plant week (Sun 23 → Sun 23). */
function anchorWeekShiftTimes(anchorWeekKey: string, startHour: number): string[] {
  if (startHour === 0) {
    const { year, week } = parseWeekKey(anchorWeekKey);
    const mondayUtc = getMondayOfISOWeek(year, week);
    const times: string[] = [];
    for (let dayOffset = 0; dayOffset < THIS_WEEK_DAYS; dayOffset += 1) {
      const day = new Date(mondayUtc);
      day.setUTCDate(mondayUtc.getUTCDate() + dayOffset);
      const dayKey = utcDayKeyFromDate(day);
      for (const hour of LEGACY_SHIFT_HOURS) {
        times.push(shiftTimeForDay(dayKey, hour));
      }
    }
    return times;
  }

  const { year, week } = parseWeekKey(anchorWeekKey);
  const mondayUtc = getMondayOfISOWeek(year, week);
  const sundayBefore = new Date(mondayUtc);
  sundayBefore.setUTCDate(mondayUtc.getUTCDate() - 1);
  const isoSunday = new Date(mondayUtc);
  isoSunday.setUTCDate(mondayUtc.getUTCDate() + 6);

  const times: string[] = [shiftTimeForDay(utcDayKeyFromDate(sundayBefore), 23)];

  for (let dayOffset = 0; dayOffset < 6; dayOffset += 1) {
    const day = new Date(mondayUtc);
    day.setUTCDate(mondayUtc.getUTCDate() + dayOffset);
    const dayKey = utcDayKeyFromDate(day);
    for (const hour of [7, 15, 23] as const) {
      times.push(shiftTimeForDay(dayKey, hour));
    }
  }

  times.push(shiftTimeForDay(utcDayKeyFromDate(isoSunday), 7));
  times.push(shiftTimeForDay(utcDayKeyFromDate(isoSunday), 15));

  return times;
}

function emptyCompositionShares(): Record<FeedstockStackKey, number> {
  return FEEDSTOCK_STACK_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<FeedstockStackKey, number>
  );
}

function fillAnchorWeekScalarShifts(
  anchorWeekKey: string,
  points: { time: string; value: number }[],
  startHour: number
): { time: string; value: number; hasData: boolean }[] {
  const bySlot = new Map<string, { time: string; value: number }>();
  for (const point of points) {
    bySlot.set(shiftSlotKey(point.time, startHour), point);
  }

  return anchorWeekShiftTimes(anchorWeekKey, startHour).map((time) => {
    const hit = bySlot.get(shiftSlotKey(time, startHour));
    if (hit) {
      return { time, value: hit.value, hasData: true };
    }
    return { time, value: 0, hasData: false };
  });
}

function fillAnchorWeekThroughputShifts(
  anchorWeekKey: string,
  shifts: CommercialThroughputDay[],
  startHour: number
): Array<CommercialThroughputDay & { hasData: boolean }> {
  const bySlot = new Map<string, CommercialThroughputDay>();
  for (const shift of shifts) {
    bySlot.set(shiftSlotKey(shift.day_start, startHour), shift);
  }

  return anchorWeekShiftTimes(anchorWeekKey, startHour).map((time) => {
    const hit = bySlot.get(shiftSlotKey(time, startHour));
    if (hit) {
      return { ...hit, day_start: time, hasData: true };
    }
    return {
      day_label: dayLabelFromOperationalTime(time, startHour),
      day_start: time,
      feed_t: 0,
      hasData: false
    };
  });
}

function fillAnchorWeekCompositionShifts(
  anchorWeekKey: string,
  points: { time: string; values: Record<string, number> }[],
  startHour: number
): CompositionAreaPoint[] {
  const bySlot = new Map<string, { time: string; values: Record<string, number> }>();
  for (const point of points) {
    bySlot.set(shiftSlotKey(point.time, startHour), point);
  }

  const times = anchorWeekShiftTimes(anchorWeekKey, startHour);
  return times.map((time, idx, arr) => {
    const hit = bySlot.get(shiftSlotKey(time, startHour));
    const edgeTimes = arr.map((slotTime) => ({ time: slotTime }));
    if (hit) {
      return {
        idx,
        label: weekEdgeDayLabel(idx, edgeTimes, startHour),
        weekLabel: weekEdgeDayLabel(idx, edgeTimes, startHour),
        timeLabel: formatHoverShift(time),
        hasData: true,
        ...categorySharesFromComposition(hit.values)
      };
    }
    return {
      idx,
      label: weekEdgeDayLabel(idx, edgeTimes, startHour),
      weekLabel: weekEdgeDayLabel(idx, edgeTimes, startHour),
      timeLabel: formatHoverShift(time),
      hasData: false,
      classifiedRawTotal: 0,
      ...emptyCompositionShares()
    };
  });
}

export const THIS_WEEK_DAYS = 7;
/** Display window: prior 12 complete weeks plus the selected/report week. */
export const TREND_DISPLAY_WEEKS = TREND_WEEKS + 1;
const TREND_DISPLAY_DAYS = TREND_DISPLAY_WEEKS * THIS_WEEK_DAYS;
/** Daily fetch window for this-week panels (7d + buffer). */
export const COMMERCIAL_DAILY_DAYS = 35;

export type DualMetricBarPoint = {
  idx: number;
  label: string;
  weekLabel: string;
  timeLabel?: string;
  primary: number;
  secondary: number;
  isSelectedWeek?: boolean;
  hasData?: boolean;
  primaryHasData?: boolean;
  secondaryHasData?: boolean;
};

function weekLabelFromTime(time: string): string {
  return formatWeekLabel(isoWeekKey(time));
}

function dayLabelFromDayKey(dayKey: string): string {
  const [, month, day] = dayKey.split('-');
  return `${day}/${month}`;
}

function dayLabelFromTime(time: string): string {
  return dayLabelFromDayKey(amsterdamDayKey(time));
}

function dayLabelFromOperationalTime(time: string, dailyStartHour: number): string {
  return dayLabelFromDayKey(operationalDayDisplayKey(time, dailyStartHour));
}

function formatHoverDateOnly(timeStr: string, dailyStartHour = 0): string {
  return dayLabelFromOperationalTime(timeStr, dailyStartHour);
}

function formatHoverShift(timeStr: string): string {
  const p = amsterdamParts(timeStr);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** First and last bar of the week only — one label per edge (avoids 3× shift overlap). */
function weekEdgeDayLabel<T extends { time: string }>(
  idx: number,
  arr: T[],
  dailyStartHour = 0
): string {
  if (!arr.length) return '';
  if (idx === 0) return dayLabelFromOperationalTime(arr[0].time, dailyStartHour);
  if (idx === arr.length - 1) {
    return dayLabelFromOperationalTime(arr[arr.length - 1].time, dailyStartHour);
  }
  return '';
}

function isDailyOnlyTimeSeries<T extends { time: string }>(points: T[]): boolean {
  const perDay = new Map<string, number>();
  for (const p of points) {
    const day = amsterdamDayKey(p.time);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return Math.max(...Array.from(perDay.values()), 0) <= 1;
}

function shiftTimeForDay(day: string, hour: number): string {
  return amsterdamLocalToUtcIso(day, hour);
}

/** When only one reading exists per day, expand to 3 shift slots (matches chlorine layout). */
function expandDailyScalarsToShifts<T extends { time: string }>(
  points: T[],
  clone: (point: T, time: string) => T,
  startHour: number
): T[] {
  const byDay = new Map<string, T[]>();
  for (const p of points) {
    const day = amsterdamDayKey(p.time);
    const list = byDay.get(day) ?? [];
    list.push(p);
    byDay.set(day, list);
  }

  const out: T[] = [];
  for (const day of Array.from(byDay.keys()).sort()) {
    const dayPts = byDay.get(day)!.sort((a, b) => a.time.localeCompare(b.time));
    if (dayPts.length >= 2) {
      out.push(...dayPts);
      continue;
    }
    if (dayPts.length === 1) {
      for (const hour of shiftHoursForStartHour(startHour)) {
        out.push(clone(dayPts[0], shiftTimeForDay(day, hour)));
      }
    }
  }
  return out;
}

function expandDailyThroughputToShifts(days: CommercialThroughputDay[], startHour: number): CommercialThroughputDay[] {
  const byDay = new Map<string, CommercialThroughputDay[]>();
  for (const d of days) {
    const day = amsterdamDayKey(d.day_start);
    const list = byDay.get(day) ?? [];
    list.push(d);
    byDay.set(day, list);
  }

  const out: CommercialThroughputDay[] = [];
  for (const day of Array.from(byDay.keys()).sort()) {
    const dayPts = byDay.get(day)!.sort((a, b) => a.day_start.localeCompare(b.day_start));
    if (dayPts.length >= 2) {
      out.push(...dayPts);
      continue;
    }
    if (dayPts.length === 1) {
      const base = dayPts[0];
      for (const hour of shiftHoursForStartHour(startHour)) {
        out.push({
          day_label: base.day_label,
          day_start: shiftTimeForDay(day, hour),
          feed_t: (base.feed_t ?? 0) / SHIFTS_PER_DAY
        });
      }
    }
  }
  return out;
}

function normalizeScalarWeekShifts(
  report: CommercialReportPayload,
  points: { time: string; value: number | null }[]
): { time: string; value: number; hasData: boolean }[] {
  const anchor = getAnchorWeekKey(report);
  const startHour = getChartBucketStartHour(report);
  const all = points
    .filter((p): p is { time: string; value: number } => p.value != null)
    .filter((p) => weekKeyLte(isoWeekKey(p.time), anchor))
    .sort((a, b) => a.time.localeCompare(b.time));

  if (!all.length) {
    return fillAnchorWeekScalarShifts(anchor, [], startHour);
  }

  const inWeek = all.filter((p) => isInPlantWeek(p.time, anchor, startHour));
  let pool: { time: string; value: number }[];
  if (inWeek.length > 0) {
    pool = isDailyOnlyTimeSeries(inWeek)
      ? expandDailyScalarsToShifts(inWeek, (p, time) => ({ time, value: p.value }), startHour)
      : inWeek;
  } else {
    pool = all.slice(-THIS_WEEK_SHIFTS);
  }

  return fillAnchorWeekScalarShifts(anchor, pool, startHour);
}

/** Up to 21 shift readings for the selected ISO week. */
function shiftPointsForSelectedWeek(
  report: CommercialReportPayload,
  points: { time: string; value: number | null }[]
): { time: string; value: number; hasData: boolean }[] {
  return normalizeScalarWeekShifts(report, points);
}

function shiftPointsInAnchorWeek(
  report: CommercialReportPayload,
  metricId: string
): { time: string; value: number; hasData: boolean }[] {
  return shiftPointsForSelectedWeek(report, getRawDailyPoints(report, metricId));
}

function metricUsesShiftAveraging(metricId: string): boolean {
  return (
    metricId === 'chlorine' ||
    metricId === 'pvc' ||
    metricId === 'ejected_pvc' ||
    metricId === 'input_moisture' ||
    metricId === 'output_moisture'
  );
}

/** Collapse shift-level readings to one daily average (calendar or operational day). */
function averagePointsByDay(
  points: { time: string; value: number }[],
  dailyStartHour = 0
): { time: string; value: number }[] {
  const byDay = new Map<string, { sum: number; count: number; time: string }>();
  for (const p of points) {
    const dayKey = operationalDayKey(p.time, dailyStartHour);
    const row = byDay.get(dayKey) ?? { sum: 0, count: 0, time: p.time };
    row.sum += p.value;
    row.count += 1;
    if (p.time < row.time) row.time = p.time;
    byDay.set(dayKey, row);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => ({ time: row.time, value: row.sum / row.count }));
}

function dualDailyTrendFromDays(
  days: Array<{ time: string; primary: number; secondary: number; label: string }>,
  selectedWeekKey?: string,
  startHour = 0
): DualMetricBarPoint[] {
  const seenWeeks = new Set<string>();
  return days.map((d, idx) => {
    const weekKey = plantReportingWeekKey(d.time, startHour);
    let weekLabel = '';
    if (!seenWeeks.has(weekKey)) {
      seenWeeks.add(weekKey);
      weekLabel = formatWeekLabel(weekKey);
    }
    return {
      idx,
      label: d.label,
      weekLabel,
      timeLabel: d.label,
      primary: d.primary,
      secondary: d.secondary,
      isSelectedWeek: selectedWeekKey
        ? isInPlantWeek(d.time, selectedWeekKey, startHour)
        : undefined
    };
  });
}

function getWeeklySeries(report: CommercialReportPayload, metricId: string) {
  return report.weekly_series?.find((s) => s.id === metricId);
}

type WeeklyPoint = { week_label: string; week_start: string; value: number };

function weeklyPointsFromDaily(
  report: CommercialReportPayload,
  metricId: string
): WeeklyPoint[] {
  const byWeek = new Map<
    string,
    { week_label: string; week_start: string; sum: number; count: number }
  >();

  for (const p of getRawDailyPoints(report, metricId)) {
    if (p.value == null) continue;
    const key = isoWeekKey(p.time);
    const row = byWeek.get(key) ?? {
      week_label: weekLabelFromTime(p.time),
      week_start: p.time,
      sum: 0,
      count: 0
    };
    row.sum += p.value;
    row.count += 1;
    if (p.time < row.week_start) row.week_start = p.time;
    byWeek.set(key, row);
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => ({
      week_label: row.week_label,
      week_start: row.week_start,
      value: row.sum / row.count
    }));
}

/** Merge backend weekly + daily→weekly so gaps are filled (e.g. input moisture). */
function weeklyPointsForMetric(
  report: CommercialReportPayload,
  metricId: string
): WeeklyPoint[] {
  const fromSeries = (getWeeklySeries(report, metricId)?.points ?? [])
    .filter((p): p is { week_label: string; week_start: string; value: number } => p.value != null)
    .map((p) => ({
      week_label: p.week_label,
      week_start: p.week_start,
      value: p.value
    }));

  const fromDaily = weeklyPointsFromDaily(report, metricId);
  const byWeek = new Map<string, WeeklyPoint>();

  for (const p of fromDaily) {
    byWeek.set(isoWeekKey(p.week_start), p);
  }
  for (const p of fromSeries) {
    byWeek.set(isoWeekKey(p.week_start), p);
  }

  return Array.from(byWeek.values()).sort((a, b) => a.week_start.localeCompare(b.week_start));
}

function mergeWeeklyDualSeries(
  report: CommercialReportPayload,
  primaryId: string,
  secondaryId: string
): DualMetricBarPoint[] {
  const byWeek = new Map<string, { weekLabel: string; primary: number; secondary: number }>();

  for (const p of weeklyPointsForMetric(report, primaryId)) {
    const key = isoWeekKey(p.week_start);
    if (!weekKeyLte(key, getAnchorWeekKey(report))) continue;
    byWeek.set(key, {
      weekLabel: p.week_label,
      primary: p.value,
      secondary: byWeek.get(key)?.secondary ?? 0
    });
  }
  for (const p of weeklyPointsForMetric(report, secondaryId)) {
    const key = isoWeekKey(p.week_start);
    if (!weekKeyLte(key, getAnchorWeekKey(report))) continue;
    const row = byWeek.get(key) ?? {
      weekLabel: p.week_label,
      primary: 0,
      secondary: 0
    };
    row.secondary = p.value;
    row.weekLabel = p.week_label;
    byWeek.set(key, row);
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => compareWeekKeys(a, b))
    .slice(-TREND_DISPLAY_WEEKS)
    .map(([weekKey, row], idx) => ({
      idx,
      label: row.weekLabel,
      weekLabel: row.weekLabel,
      timeLabel: row.weekLabel,
      primary: row.primary,
      secondary: row.secondary,
      isSelectedWeek: weekKey === getAnchorWeekKey(report)
    }));
}

function getRawDailyPoints(
  report: CommercialReportPayload,
  metricId: string
): { time: string; value: number | null }[] {
  if (metricId === 'chlorine') return report.chlorine.points;
  if (metricId === 'pvc') {
    return report.composition_points.map((p) => ({
      time: p.time,
      value: p.values['PVC'] ?? null
    }));
  }
  if (metricId === 'ejected_pvc') return report.ejected_pvc?.points ?? [];
  if (metricId === 'input_moisture') return report.input_moisture.points;
  if (metricId === 'output_moisture') return report.output_moisture.points;
  return [];
}

function toDailyBarPoints(
  points: { time: string; value: number }[],
  selectedWeekKey?: string
): DailyBarPoint[] {
  return points.map((p, idx) => ({
    idx,
    value: p.value,
    weekLabel: weekLabelFromTime(p.time),
    timeLabel: formatHoverDateOnly(p.time),
    isLast: idx === points.length - 1,
    isSelectedWeek: selectedWeekKey ? isoWeekKey(p.time) === selectedWeekKey : undefined
  }));
}

/** Prior 12 complete weeks plus selected week — one bar per calendar week. */
export function getTrendBarData(
  report: CommercialReportPayload,
  metricId: string
): DailyBarPoint[] {
  const anchor = getAnchorWeekKey(report);
  if (metricId === 'feed_volume') {
    const points = weeklyPointsUpToAnchor(report, metricId);
    return points.slice(-TREND_DISPLAY_WEEKS).map((p, idx, arr) => ({
      idx,
      value: p.value,
      weekLabel: p.week_label,
      timeLabel: p.week_label,
      isLast: idx === arr.length - 1,
      isSelectedWeek: isoWeekKey(p.week_start) === anchor
    }));
  }

  const points = weeklyPointsUpToAnchor(report, metricId);
  if (points.length) {
    return points.slice(-TREND_DISPLAY_WEEKS).map((p, idx, arr) => ({
      idx,
      value: p.value,
      weekLabel: p.week_label,
      timeLabel: p.week_label,
      isLast: idx === arr.length - 1,
      isSelectedWeek: isoWeekKey(p.week_start) === anchor
    }));
  }

  const valid = getRawDailyPoints(report, metricId).filter(
    (p): p is { time: string; value: number } => p.value !== null
  );
  return toDailyBarPoints(valid.slice(-TREND_DISPLAY_WEEKS), anchor);
}

/** Prior 12 complete weeks plus selected week, daily points with week-start labels. */
export function getDailyTrendBarData(
  report: CommercialReportPayload,
  metricId: string
): DailyBarPoint[] {
  const dailyPoints = getRawDailyPoints(report, metricId).filter(
    (p): p is { time: string; value: number } => p.value !== null
  );

  const anchor = getAnchorWeekKey(report);
  const dailyStartHour = getDailyBucketStartHour(report);
  const startHourForFilter = getChartBucketStartHour(report);
  const valid = dailyPoints
    .filter((p) => weekKeyLte(plantReportingWeekKey(p.time, startHourForFilter), anchor))
    .sort((a, b) => a.time.localeCompare(b.time));

  const processedPoints = metricUsesShiftAveraging(metricId)
    ? averagePointsByDay(valid, dailyStartHour)
    : valid;

  const sliced = processedPoints.slice(-TREND_DISPLAY_DAYS);
  const seenWeeks = new Set<string>();
  const startHour = getChartBucketStartHour(report);

  return sliced.map((p, idx) => {
    const weekKey = plantReportingWeekKey(p.time, startHour);
    let label = '';
    if (!seenWeeks.has(weekKey)) {
      seenWeeks.add(weekKey);
      label = formatWeekLabel(weekKey);
    }
    return {
      idx,
      value: p.value,
      weekLabel: label,
      timeLabel: dayLabelFromOperationalTime(p.time, dailyStartHour),
      dayKey: operationalDayKey(p.time, dailyStartHour),
      isLast: idx === sliced.length - 1,
      isSelectedWeek: isInPlantWeek(p.time, anchor, startHour)
    };
  });
}

/** Daily sorter Q (ejected PVC % / input PVC %) keyed by operational day. */
export function sorterQByOperationalDay(report: CommercialReportPayload): Map<string, number> {
  const dailyStartHour = getDailyBucketStartHour(report);
  const startHourForFilter = getChartBucketStartHour(report);
  const anchor = getAnchorWeekKey(report);
  const dailyMeans = (metricId: string) => {
    const points = getRawDailyPoints(report, metricId).filter(
      (p): p is { time: string; value: number } => p.value != null && p.value > 0
    );
    return averagePointsByDay(
      points.filter((p) => weekKeyLte(plantReportingWeekKey(p.time, startHourForFilter), anchor)),
      dailyStartHour
    );
  };
  const input = new Map(
    dailyMeans('pvc').map((p) => [operationalDayKey(p.time, dailyStartHour), p.value])
  );
  const out = new Map<string, number>();
  for (const point of dailyMeans('ejected_pvc')) {
    const key = operationalDayKey(point.time, dailyStartHour);
    const feed = input.get(key);
    if (feed != null && feed > 0) out.set(key, point.value / feed);
  }
  return out;
}

/** This-week sorter Q on shifts where both feed and eject shares exist. */
function pairedSorterQShifts(report: CommercialReportPayload): { time: string; value: number }[] {
  const feed = new Map(
    shiftPointsInAnchorWeek(report, 'pvc')
      .filter((p) => p.hasData && p.value > 0)
      .map((p) => [p.time, p.value])
  );
  const values: { time: string; value: number }[] = [];
  for (const point of shiftPointsInAnchorWeek(report, 'ejected_pvc')) {
    const input = feed.get(point.time);
    if (!point.hasData || input == null || input <= 0) continue;
    values.push({ time: point.time, value: point.value / input });
  }
  return values;
}

export function sorterQByShiftTime(report: CommercialReportPayload): Map<string, number> {
  return new Map(pairedSorterQShifts(report).map((point) => [point.time, point.value]));
}

export function getThisWeekSorterQValues(report: CommercialReportPayload): number[] {
  return pairedSorterQShifts(report).map((point) => point.value);
}

/** Last daily values for the selected ISO week. */
export function getThisWeekDailyValues(
  report: CommercialReportPayload,
  metricId: string
): number[] {
  return shiftPointsInAnchorWeek(report, metricId)
    .filter((p) => p.hasData)
    .map((p) => p.value);
}

/** Selected-week shift bars (≈21) — labels on first/last day of week only. */
export function getThisWeekDailyBarData(
  report: CommercialReportPayload,
  metricId: string
): DailyBarPoint[] {
  const points = shiftPointsInAnchorWeek(report, metricId);

  const startHour = getChartBucketStartHour(report);
  return points.map((p, idx, arr) => ({
    idx,
    value: p.value,
    weekLabel: weekEdgeDayLabel(idx, arr, startHour),
    timeLabel: formatHoverShift(p.time),
    time: p.time,
    hasData: p.hasData,
    isLast: idx === arr.length - 1
  }));
}

/** Input + output moisture — prior 12 complete weeks + selected week daily trend. */
export function buildMoistureDailyTrendData(report: CommercialReportPayload): DualMetricBarPoint[] {
  const anchor = getAnchorWeekKey(report);
  const dailyStartHour = getDailyBucketStartHour(report);
  const startHourForFilter = getChartBucketStartHour(report);
  const inputDaily = averagePointsByDay(
    getRawDailyPoints(report, 'input_moisture').filter(
      (p): p is { time: string; value: number } =>
        p.value != null &&
        weekKeyLte(plantReportingWeekKey(p.time, startHourForFilter), anchor)
    ),
    dailyStartHour
  );
  const outputDaily = averagePointsByDay(
    getRawDailyPoints(report, 'output_moisture').filter(
      (p): p is { time: string; value: number } =>
        p.value != null &&
        weekKeyLte(plantReportingWeekKey(p.time, startHourForFilter), anchor)
    ),
    dailyStartHour
  );
  const byDay = new Map<string, { time: string; label: string; primary: number; secondary: number }>();

  for (const point of inputDaily) {
    const key = operationalDayKey(point.time, dailyStartHour);
    byDay.set(key, {
      time: point.time,
      label: dayLabelFromOperationalTime(point.time, dailyStartHour),
      primary: point.value,
      secondary: byDay.get(key)?.secondary ?? 0
    });
  }
  for (const point of outputDaily) {
    const key = operationalDayKey(point.time, dailyStartHour);
    const row = byDay.get(key) ?? {
      time: point.time,
      label: dayLabelFromOperationalTime(point.time, dailyStartHour),
      primary: 0,
      secondary: 0
    };
    row.secondary = point.value;
    byDay.set(key, row);
  }

  const days = Array.from(byDay.values())
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(-TREND_DISPLAY_DAYS);

  return dualDailyTrendFromDays(days, anchor, startHourForFilter);
}

/** Feed tonnage — prior 12 complete weeks + selected week daily trend. */
export function buildThroughputDailyTrendData(
  report: CommercialReportPayload
): { idx: number; label: string; weekLabel: string; timeLabel?: string; feed: number; isSelectedWeek?: boolean }[] {
  const anchor = getAnchorWeekKey(report);
  const dailyStartHour = getDailyBucketStartHour(report);
  const byDay = new Map<string, { time: string; label: string; primary: number; secondary: number }>();

  const startHour = getChartBucketStartHour(report);
  for (const d of report.throughput_daily ?? []) {
    if (!weekKeyLte(plantReportingWeekKey(d.day_start, startHour), anchor)) continue;
    const key = operationalDayKey(d.day_start, dailyStartHour);
    const row = byDay.get(key) ?? {
      time: d.day_start,
      label: dayLabelFromOperationalTime(d.day_start, dailyStartHour),
      primary: 0,
      secondary: 0
    };
    row.primary += d.feed_t ?? 0;
    byDay.set(key, row);
  }

  const days = Array.from(byDay.values())
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(-TREND_DISPLAY_DAYS);

  return dualDailyTrendFromDays(days, anchor, startHour).map((row) => ({
    idx: row.idx,
    label: row.label,
    weekLabel: row.weekLabel,
    timeLabel: row.timeLabel,
    isSelectedWeek: row.isSelectedWeek,
    feed: row.primary
  }));
}

/** Input + output moisture merged into 12 weekly bar pairs. */
export function buildMoistureTrendData(report: CommercialReportPayload): DualMetricBarPoint[] {
  return mergeWeeklyDualSeries(report, 'input_moisture', 'output_moisture');
}

/** Input + output moisture paired by shift for the selected week (≈21 bars). */
export function buildMoistureDailyData(report: CommercialReportPayload): DualMetricBarPoint[] {
  const inputShifts = shiftPointsInAnchorWeek(report, 'input_moisture');
  const outputShifts = shiftPointsInAnchorWeek(report, 'output_moisture');

  const startHour = getChartBucketStartHour(report);
  return inputShifts.map((point, idx, arr) => ({
    idx,
    label: weekEdgeDayLabel(idx, arr, startHour),
    weekLabel: weekEdgeDayLabel(idx, arr, startHour),
    timeLabel: formatHoverShift(point.time),
    primary: point.value,
    secondary: outputShifts[idx]?.value ?? 0,
    primaryHasData: point.hasData,
    secondaryHasData: outputShifts[idx]?.hasData ?? false
  }));
}

/** Feed tonnage — trend (12 weekly) or this week (≈21 shifts). */
export function buildThroughputBarData(
  report: CommercialReportPayload,
  window: 'trend' | 'week'
): { idx: number; label: string; weekLabel: string; timeLabel?: string; isSelectedWeek?: boolean; feed: number; hasData?: boolean }[] {
  if (window === 'trend') {
    const anchor = getAnchorWeekKey(report);
    return weeklyPointsUpToAnchor(report, 'feed_volume').slice(-TREND_DISPLAY_WEEKS).map((point, idx) => ({
      idx,
      label: point.week_label,
      weekLabel: point.week_label,
      timeLabel: point.week_label,
      isSelectedWeek: isoWeekKey(point.week_start) === anchor,
      feed: point.value
    }));
  }

  const anchor = getAnchorWeekKey(report);
  const startHour = getChartBucketStartHour(report);
  const allShifts = (report.throughput_daily ?? [])
    .filter((d) => weekKeyLte(isoWeekKey(d.day_start), anchor))
    .sort((a, b) => a.day_start.localeCompare(b.day_start));

  const inWeek = allShifts.filter((d) => isInPlantWeek(d.day_start, anchor, startHour));
  let pool: CommercialThroughputDay[];
  if (inWeek.length > 0) {
    pool = isDailyOnlyTimeSeries(inWeek.map((d) => ({ time: d.day_start })))
      ? expandDailyThroughputToShifts(inWeek, startHour)
      : inWeek;
  } else if (allShifts.length > 0) {
    pool = allShifts.slice(-THIS_WEEK_SHIFTS);
  } else {
    pool = [];
  }

  const shifts = fillAnchorWeekThroughputShifts(anchor, pool, startHour);

  return shifts.map((d, idx, arr) => ({
    idx,
    label: weekEdgeDayLabel(
      idx,
      arr.map((s) => ({ time: s.day_start })),
      startHour
    ),
    weekLabel: weekEdgeDayLabel(
      idx,
      arr.map((s) => ({ time: s.day_start })),
      startHour
    ),
    timeLabel: formatHoverShift(d.day_start),
    feed: d.feed_t ?? 0,
    hasData: d.hasData
  }));
}

/** Last N calendar days of readings — legacy; prefer getTrendBarData for charts. */
export function getDailyBarData(
  report: CommercialReportPayload,
  metricId: string,
  _maxDays = COMMERCIAL_DAILY_DAYS
): DailyBarPoint[] {
  if (metricId !== 'feed_volume') {
    return getTrendBarData(report, metricId);
  }

  const series = report.weekly_series?.find((s) => s.id === metricId);
    if (series?.points.length) {
    const pts = series.points.filter((p) => p.value !== null);
    return pts.map((p, idx) => ({
      idx,
      value: p.value as number,
      weekLabel: p.week_label,
      isLast: idx === pts.length - 1
    }));
  }
  return getWeeklyBarData(report, metricId).map((p, idx, arr) => ({
    idx,
    value: p.value,
    weekLabel: p.week,
    isLast: idx === arr.length - 1
  }));
}

/** Daily readings for threshold exposure baseline — keeps ~12 weeks for Δ calc. */
export function getThresholdDailyValues(
  report: CommercialReportPayload,
  metricId: 'chlorine' | 'pvc' | 'input_moisture' | 'output_moisture',
  maxPoints = TREND_WEEKS * THIS_WEEK_SHIFTS
): number[] {
  let points: { time: string; value: number | null }[] = [];
  if (metricId === 'chlorine') points = report.chlorine.points;
  else if (metricId === 'pvc') {
    points = report.composition_points.map((p) => ({
      time: p.time,
      value: p.values['PVC'] ?? null
    }));
  } else if (metricId === 'output_moisture') points = report.output_moisture.points;
  else if (metricId === 'input_moisture') points = report.input_moisture.points;

  const anchor = getAnchorWeekKey(report);
  const allWeeks = Array.from(
    new Set(
      points
        .filter((p): p is { time: string; value: number } => p.value !== null)
        .map((p) => isoWeekKey(p.time))
    )
  ).sort();
  const anchorIdx = allWeeks.indexOf(anchor);
  const baselineEnd = anchorIdx >= 0 ? anchorIdx : allWeeks.length;
  const windowWeeks = new Set(
    allWeeks.slice(Math.max(0, baselineEnd - TREND_WEEKS), baselineEnd)
  );

  return points
    .filter((p): p is { time: string; value: number } => p.value !== null && windowWeeks.has(isoWeekKey(p.time)))
    .slice(-maxPoints)
    .map((p) => p.value);
}

export type ExposureZoneDiff = { tonnesDiff: number; ppDiff: number };

export type ExposureZoneDiffs = {
  above: ExposureZoneDiff;
  near?: ExposureZoneDiff;
  within: ExposureZoneDiff;
};

/** Zone exposure this week vs share of readings over the last ~12 weeks. */
export function buildExposureZoneDiffs(
  currentDist: ThresholdDistribution,
  dailyValues12w: number[],
  okMax: number,
  warnMax: number,
  totalTonnes: number
): ExposureZoneDiffs | null {
  if (!dailyValues12w.length || totalTonnes <= 0) return null;

  const baseline = buildThresholdDistribution(dailyValues12w, okMax, warnMax, totalTonnes, '');
  const tonnes = (pct: number) => Math.round((totalTonnes * pct) / 100);
  const diff = (curPct: number, basePct: number): ExposureZoneDiff => ({
    tonnesDiff: tonnes(curPct) - tonnes(basePct),
    ppDiff: curPct - basePct
  });

  const hasNear = warnMax > okMax;
  return {
    above: diff(currentDist.abovePct, baseline.abovePct),
    ...(hasNear ? { near: diff(currentDist.nearPct, baseline.nearPct) } : {}),
    within: diff(currentDist.withinPct, baseline.withinPct)
  };
}

export function buildValueHistogram(
  values: number[],
  bins: { label: string; min: number; max: number }[]
): { label: string; count: number }[] {
  return bins.map((b) => ({
    label: b.label,
    count: values.filter((v) => v >= b.min && v < b.max).length
  }));
}

export type ThresholdHistBar = {
  x: number;
  label: string;
  count: number;
  zone: 'within' | 'near' | 'above';
};

type HistSubBin = {
  label: string;
  zone: 'within' | 'near' | 'above';
  match: (v: number) => boolean;
};

function fmtBound(n: number, decimals: number): string {
  return Number(n.toFixed(decimals)).toString();
}

function buildSubBins(zones: { okMax: number; warnMax: number }): HistSubBin[] {
  const { okMax, warnMax } = zones;
  const hasNear = warnMax > okMax;
  const dec = okMax < 1 ? 1 : okMax < 5 ? 1 : 0;

  if (!hasNear) {
    const mid = warnMax / 2;
    const aboveSplit = warnMax + 1;
    return [
      {
        label: `0–${fmtBound(mid, dec)}`,
        zone: 'within',
        match: (v) => v <= mid
      },
      {
        label: `${fmtBound(mid, dec)}–${fmtBound(warnMax, dec)}`,
        zone: 'within',
        match: (v) => v > mid && v <= warnMax
      },
      {
        label: `${fmtBound(warnMax, dec)}–${fmtBound(aboveSplit, dec)}`,
        zone: 'above',
        match: (v) => v > warnMax && v <= aboveSplit
      },
      {
        label: `>${fmtBound(aboveSplit, dec)}`,
        zone: 'above',
        match: (v) => v > aboveSplit
      }
    ];
  }

  const okMid = okMax / 2;
  const nearMid = (okMax + warnMax) / 2;
  const aboveSplit = warnMax + (warnMax - okMax) / 2;

  return [
    {
      label: `0–${fmtBound(okMid, dec)}`,
      zone: 'within',
      match: (v) => v <= okMid
    },
    {
      label: `${fmtBound(okMid, dec)}–${fmtBound(okMax, dec)}`,
      zone: 'within',
      match: (v) => v > okMid && v <= okMax
    },
    {
      label: `${fmtBound(okMax, dec)}–${fmtBound(nearMid, dec)}`,
      zone: 'near',
      match: (v) => v > okMax && v <= nearMid
    },
    {
      label: `${fmtBound(nearMid, dec)}–${fmtBound(warnMax, dec)}`,
      zone: 'near',
      match: (v) => v > nearMid && v <= warnMax
    },
    {
      label: `${fmtBound(warnMax, dec)}–${fmtBound(aboveSplit, dec)}`,
      zone: 'above',
      match: (v) => v > warnMax && v <= aboveSplit
    },
    {
      label: `>${fmtBound(aboveSplit, dec)}`,
      zone: 'above',
      match: (v) => v > aboveSplit
    }
  ];
}

/** Two sub-bins per threshold zone; counts match buildThresholdDistribution. */
export function buildThresholdHistogram(
  values: number[],
  zones: { okMax: number; warnMax: number }
): ThresholdHistBar[] {
  const subBins = buildSubBins(zones);
  return subBins.map((bin, x) => ({
    x,
    label: bin.label,
    count: values.filter(bin.match).length,
    zone: bin.zone
  }));
}

/** Aggregate sub-bin counts → within/near/above % (must match buildThresholdDistribution). */
export function thresholdHistogramZonePct(
  bars: ThresholdHistBar[],
  zones: { okMax: number; warnMax: number }
): { within: number; near: number; above: number } {
  const total = bars.reduce((s, b) => s + b.count, 0) || 1;
  const sum = (zone: ThresholdHistBar['zone']) =>
    bars.filter((b) => b.zone === zone).reduce((s, b) => s + b.count, 0);
  return {
    within: Math.round((sum('within') / total) * 100),
    near: Math.round((sum('near') / total) * 100),
    above: Math.round((sum('above') / total) * 100)
  };
}

export function feedTonnes(report: CommercialReportPayload): number {
  const feed = getComparison(report, 'feed_volume');
  return feed?.last_week_avg ?? report.last_week_input_tonnage ?? 0;
}

export function buildThresholdDistribution(
  dailyValues: number[],
  okMax: number,
  warnMax: number,
  _feedT: number,
  metricLabel: string
): ThresholdDistribution {
  if (!dailyValues.length) {
    return {
      withinPct: 100,
      nearPct: 0,
      abovePct: 0,
      withinCount: 0,
      nearCount: 0,
      aboveCount: 0,
      totalReadings: 0,
      buckets: [],
      impactTonnes: null,
      impactLabel: 'No valid readings this week'
    };
  }

  const within = dailyValues.filter((v) => v <= okMax).length;
  const near = dailyValues.filter((v) => v > okMax && v <= warnMax).length;
  const above = dailyValues.filter((v) => v > warnMax).length;
  const n = dailyValues.length;

  const withinPct = Math.round((within / n) * 100);
  const nearPct = Math.round((near / n) * 100);
  const abovePct = Math.round((above / n) * 100);

  const buckets = [
    { label: `Within (≤${okMax})`, count: within, fill: KPI_THRESHOLD_COLORS.within },
    { label: `Near (${okMax}–${warnMax})`, count: near, fill: KPI_THRESHOLD_COLORS.near },
    { label: `Above (>${warnMax})`, count: above, fill: KPI_THRESHOLD_COLORS.above }
  ].filter((b) => b.count > 0);

  const impactLabel = `${withinPct}% of ${metricLabel} readings were within target this week`;

  return {
    withinPct,
    nearPct,
    abovePct,
    withinCount: within,
    nearCount: near,
    aboveCount: above,
    totalReadings: n,
    buckets,
    impactTonnes: null,
    impactLabel
  };
}

export function buildCompositionCategories(report: CommercialReportPayload): CompositionCategory[] {
  return MATERIAL_CATEGORIES.map((cat) => {
    let current = 0;
    let normal = 0;
    cat.ids.forEach((id) => {
      const c = getComparison(report, id);
      if (c) {
        current += c.last_week_avg ?? 0;
        normal += c.three_month_avg ?? 0;
      }
    });
    return {
      label: cat.label,
      currentPct: current,
      normalPct: normal,
      delta: current - normal,
      color: cat.color
    };
  });
}

function categorySharesFromComposition(
  values: Record<string, number>
): Pick<CompositionAreaPoint, FeedstockStackKey | 'classifiedRawTotal'> {
  const shares = Object.fromEntries(
    FEEDSTOCK_STACK_KEYS.map((key) => [key, 0])
  ) as Record<FeedstockStackKey, number>;

  for (const [matKey, pct] of Object.entries(values)) {
    const id = matKey.toLowerCase();
    const cat = MATERIAL_CATEGORIES.find((c) => c.ids.includes(id));
    if (cat) shares[cat.key] += pct;
  }

  const classifiedRawTotal = FEEDSTOCK_STACK_KEYS.reduce((sum, key) => sum + shares[key], 0);

  if (classifiedRawTotal <= 0) {
    return { ...shares, classifiedRawTotal: 0 };
  }

  const scale = 100 / classifiedRawTotal;
  const normalized = Object.fromEntries(
    FEEDSTOCK_STACK_KEYS.map((key) => [key, shares[key] * scale])
  ) as Record<FeedstockStackKey, number>;

  return { ...normalized, classifiedRawTotal };
}

export function sumCompositionShares(
  point: Pick<CompositionAreaPoint, FeedstockStackKey>
): number {
  return FEEDSTOCK_STACK_KEYS.reduce((sum, key) => sum + (point[key] ?? 0), 0);
}

function weeklyCompositionFromDaily(
  report: CommercialReportPayload
): { time: string; values: Record<string, number> }[] {
  const byWeek = new Map<string, { time: string; mats: Record<string, number[]> }>();

  for (const p of report.composition_points ?? []) {
    const key = isoWeekKey(p.time);
    const row = byWeek.get(key) ?? { time: p.time, mats: {} };
    for (const [mat, val] of Object.entries(p.values)) {
      (row.mats[mat] ??= []).push(val);
    }
    if (p.time < row.time) row.time = p.time;
    byWeek.set(key, row);
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => {
      const values: Record<string, number> = {};
      for (const [mat, vals] of Object.entries(row.mats)) {
        values[mat] = vals.reduce((s, v) => s + v, 0) / vals.length;
      }
      return { time: row.time, values };
    });
}

function compositionWeeklyPoints(
  report: CommercialReportPayload
): { time: string; values: Record<string, number> }[] {
  const fromDaily = weeklyCompositionFromDaily(report);
  const fromApi = report.composition_weekly_points ?? [];
  const byWeek = new Map<string, { time: string; values: Record<string, number> }>();

  for (const p of fromDaily) {
    byWeek.set(isoWeekKey(p.time), p);
  }
  for (const p of fromApi) {
    byWeek.set(isoWeekKey(p.time), p);
  }

  return Array.from(byWeek.values())
    .sort((a, b) => a.time.localeCompare(b.time))
    .filter((p) => weekKeyLte(isoWeekKey(p.time), getAnchorWeekKey(report)))
    .slice(-TREND_DISPLAY_WEEKS);
}

function averageCompositionByDay(
  points: Array<{ time: string; values: Record<string, number> }>,
  dailyStartHour = 0
): Array<{ time: string; values: Record<string, number> }> {
  const byDay = new Map<string, { time: string; mats: Record<string, number[]> }>();

  for (const p of points) {
    const key = operationalDayKey(p.time, dailyStartHour);
    const row = byDay.get(key) ?? { time: p.time, mats: {} };
    for (const [mat, val] of Object.entries(p.values)) {
      (row.mats[mat] ??= []).push(val);
    }
    if (p.time < row.time) row.time = p.time;
    byDay.set(key, row);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => {
      const values: Record<string, number> = {};
      for (const [mat, vals] of Object.entries(row.mats)) {
        values[mat] = vals.reduce((s, v) => s + v, 0) / vals.length;
      }
      return { time: row.time, values };
    });
}

/** Feedstock mix — prior 12 complete weeks + selected week daily trend. */
export function buildCompositionDailyTrendData(
  report: CommercialReportPayload
): CompositionAreaPoint[] {
  const anchor = getAnchorWeekKey(report);
  const dailyStartHour = getDailyBucketStartHour(report);
  const startHour = getChartBucketStartHour(report);
  const daily = averageCompositionByDay(
    (report.composition_points ?? []).filter((p) =>
      weekKeyLte(plantReportingWeekKey(p.time, startHour), anchor)
    ),
    dailyStartHour
  ).slice(-TREND_DISPLAY_DAYS);

  const seenWeeks = new Set<string>();
  return daily.map((point, idx) => {
    const weekKey = plantReportingWeekKey(point.time, startHour);
    let weekLabel = '';
    if (!seenWeeks.has(weekKey)) {
      seenWeeks.add(weekKey);
      weekLabel = formatWeekLabel(weekKey);
    }
    return {
      idx,
      label: dayLabelFromOperationalTime(point.time, dailyStartHour),
      weekLabel,
      timeLabel: dayLabelFromOperationalTime(point.time, dailyStartHour),
      isSelectedWeek: isInPlantWeek(point.time, anchor, startHour),
      ...categorySharesFromComposition(point.values)
    };
  });
}

/** Feedstock mix — trend (12 weekly), daily trend, or this week (≈21 shifts). */
export function buildCompositionAreaData(
  report: CommercialReportPayload,
  window: 'trend' | 'week' | 'daily-trend'
): CompositionAreaPoint[] {
  if (window === 'daily-trend') {
    return buildCompositionDailyTrendData(report);
  }

  if (window === 'trend') {
    const weeks = compositionWeeklyPoints(report);
    const anchor = getAnchorWeekKey(report);
    return weeks.map((point, idx) => {
      const wk = weekLabelFromTime(point.time);
      return {
        idx,
        label: wk,
        weekLabel: wk,
        timeLabel: wk,
        isSelectedWeek: isoWeekKey(point.time) === anchor,
        ...categorySharesFromComposition(point.values)
      };
    });
  }

  const anchor = getAnchorWeekKey(report);
  const startHour = getChartBucketStartHour(report);
  const allComp = (report.composition_points ?? [])
    .filter((p) => weekKeyLte(isoWeekKey(p.time), anchor))
    .sort((a, b) => a.time.localeCompare(b.time));

  if (!allComp.length) return fillAnchorWeekCompositionShifts(anchor, [], startHour);

  const inWeek = allComp.filter((p) => isInPlantWeek(p.time, anchor, startHour));
  let pool: typeof allComp;
  if (inWeek.length > 0) {
    pool = isDailyOnlyTimeSeries(inWeek)
      ? expandDailyScalarsToShifts(inWeek, (p, time) => ({ time, values: p.values }), startHour)
      : inWeek;
  } else if (allComp.length > 0) {
    pool = allComp.slice(-THIS_WEEK_SHIFTS);
  } else {
    pool = [];
  }

  return fillAnchorWeekCompositionShifts(anchor, pool, startHour);
}

export type WeeklyChangeCard = {
  id: string;
  label: string;
  title: string;
  detail: string;
  sparkline: number[];
  tone: 'positive' | 'negative' | 'risk' | 'neutral';
};

export function buildWeeklyChangeCards(report: CommercialReportPayload): WeeklyChangeCard[] {
  const ids = ['chlorine', 'pvc', 'input_moisture', 'output_moisture'] as const;
  const items = ids.map((id) => {
    const ctx = buildMetricContext(report, id);
    const c = getComparison(report, id);
    const diff = c?.difference ?? 0;
    const dec = id === 'chlorine' ? 2 : id === 'input_moisture' || id === 'output_moisture' ? 1 : 2;
    const score = -diff;
    return {
      id,
      label: c?.label ?? id,
      diff,
      score,
      ctx,
      dec,
      unit: c?.unit ?? '%'
    };
  });

  const sorted = [...items].sort((a, b) => b.score - a.score);
  const positive = sorted[0];
  const negative = sorted[sorted.length - 1];
  const stable = [...items].sort(
    (a, b) => Math.abs(a.diff) - Math.abs(b.diff)
  )[0];
  const risk = [...items].sort((a, b) => {
    const riskScore = (x: typeof a) => {
      if (x.id === 'chlorine' && (x.ctx.currentWeek ?? 0) >= 0.8) return 10;
      if (x.id === 'pvc' && (x.ctx.currentWeek ?? 0) >= 1.8) return 8;
      return Math.abs(x.diff);
    };
    return riskScore(b) - riskScore(a);
  })[0];

  const fmt = (x: typeof positive) =>
    `${x.diff > 0 ? '+' : ''}${x.diff.toFixed(x.dec)}${x.unit} vs 12W avg`;

  return [
    {
      id: 'positive',
      label: 'Largest Improvement',
      title: positive.label,
      detail: fmt(positive),
      sparkline: positive.ctx.sparkline12,
      tone: 'positive'
    },
    {
      id: 'negative',
      label: 'Largest Decline',
      title: negative.label,
      detail: fmt(negative),
      sparkline: negative.ctx.sparkline12,
      tone: 'negative'
    },
    {
      id: 'risk',
      label: 'Largest Risk',
      title: risk.label,
      detail: `${risk.ctx.status} — ${risk.ctx.rankLabel}`,
      sparkline: risk.ctx.sparkline12,
      tone: 'risk'
    },
    {
      id: 'stable',
      label: 'Most Stable',
      title: stable.label,
      detail: `±${Math.abs(stable.diff).toFixed(stable.dec)}${stable.unit} vs 12W avg`,
      sparkline: stable.ctx.sparkline12,
      tone: 'neutral'
    }
  ];
}

export function getMondayOfISOWeek(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 4));
  const day = simple.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const firstMonday = new Date(simple);
  firstMonday.setUTCDate(simple.getUTCDate() - daysSinceMonday);
  
  const targetMonday = new Date(firstMonday);
  targetMonday.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
  return targetMonday;
}

export function getCompletedWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - daysSinceMonday);
  const reportingMonday = new Date(lastMonday);
  reportingMonday.setDate(lastMonday.getDate() - 7);
  return isoWeekKey(reportingMonday.toISOString());
}

function formatDateDDMM(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function getSelectableWeeks2026(): { key: string; label: string; weekNumber: number }[] {
  const endKey = getCompletedWeekKey();
  const list: { key: string; label: string; weekNumber: number }[] = [];
  
  let currentYear = 2026;
  let currentWeek = 1;

  while (true) {
    const key = `${currentYear}-W${currentWeek}`;
    const monday = getMondayOfISOWeek(currentYear, currentWeek);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 7);
    
    list.push({
      key,
      label: `Week ${currentWeek} (${formatDateDDMM(monday)} – ${formatDateDDMM(sunday)})`,
      weekNumber: currentWeek
    });

    if (key === endKey) {
      break;
    }

    currentWeek++;
    const nextMonday = getMondayOfISOWeek(currentYear, currentWeek);
    const nextISOKey = isoWeekKey(nextMonday.toISOString());
    const nextParts = parseWeekKey(nextISOKey);
    if (nextParts.year > currentYear) {
      currentYear = nextParts.year;
      currentWeek = nextParts.week;
    }
    
    if (currentYear > 2030) {
      break;
    }
  }

  return list.reverse();
}
