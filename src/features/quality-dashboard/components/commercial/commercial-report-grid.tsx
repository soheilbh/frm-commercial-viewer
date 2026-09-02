'use client';

import type { CommercialReportPayload } from '@/features/quality-dashboard/api/types';
import {
  buildCompositionCategories,
  buildCompositionAreaData,
  buildCompositionDailyTrendData,
  COMPOSITION_SHARES_NOTE,
  buildMetricContext,
  buildThresholdDistribution,
  buildThresholdSummary,
  buildTornadoItems,
  buildWeeklyContextRows,
  getThresholdDailyValues,
  buildMoistureDailyData,
  buildMoistureDailyTrendData,
  buildThroughputBarData,
  buildThroughputDailyTrendData,
  getThisWeekDailyValues,
  getAnchorWeekKey,
  isoWeekKey,
  weekKeyLte,
  TREND_WEEKS,
  THIS_WEEK_DAYS,
  percentileLabel
} from '@/features/quality-dashboard/lib/executive-copy';
import {
  ReadingDistributionSummary,
  type SummaryStatRow,
  FeedstockStackedAreaChart,
  KpiCardFooter,
  KpiTrendChart,
  MoistureGroupedBarChart,
  ThroughputGroupedBarChart,
  ThresholdDonutChart
} from '@/features/quality-dashboard/components/commercial/kpi-threshold-charts';
import {
  COMMERCIAL_CHLORINE_ZONES,
  COMMERCIAL_INPUT_MOISTURE_ZONES,
  COMMERCIAL_OUTPUT_MOISTURE_ZONES,
  COMMERCIAL_PVC_ZONES,
  KPI_THRESHOLD_COLORS,
  THEME_SEMANTIC,
  ZONE_TEXT_CLASS,
  diffToneClass,
  type ThresholdZones
} from '@/features/quality-dashboard/lib/kpi-threshold-colors';
import {
  formatChartShiftLabel,
  formatDailyBucketLabel,
  formatWeekBoundaryLabel,
  getChartBucketStartHour,
  getDailyBucketStartHour,
  THIS_WEEK_SHIFTS
} from '@/features/quality-dashboard/lib/weekly-context';
import { cn } from '@/lib/utils';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowDown,
  ArrowUp,
  Minus
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const tornadoChartConfig = {
  increase: { label: 'Increase', color: 'var(--destructive)' },
  decrease: { label: 'Decrease', color: 'var(--primary)' }
} satisfies ChartConfig;

type RefLine = { value: number; stroke: string; dash?: string };

export type CommercialKpiVisibility = {
  inputVolume: boolean;
  chlorine: boolean;
  pvc: boolean;
  inputMoisture: boolean;
  outputMoisture: boolean;
  composition: boolean;
};

export const DEFAULT_COMMERCIAL_KPI_VISIBILITY: CommercialKpiVisibility = {
  inputVolume: true,
  chlorine: true,
  pvc: true,
  inputMoisture: true,
  outputMoisture: true,
  composition: true
};

const HIDDEN_VALUE = '--';

const LABEL_THIS_WEEK = 'This week';
const LABEL_12W_DAILY_TREND = 'prior 12W + this week';
const LABEL_12W_WEEKLY_TREND = `${TREND_WEEKS}W baseline + this week`;
const LABEL_METRIC_STATS_COL = 'Statistics';

function thresholdDistributionFromExposure(
  report: CommercialReportPayload,
  metricId: string,
  fallback: ReturnType<typeof buildThresholdDistribution>
): ReturnType<typeof buildThresholdDistribution> {
  const exposure = report.threshold_exposure?.find((item) => item.id === metricId);
  if (!exposure) return fallback;

  const within = exposure.within_count ?? 0;
  const near = exposure.near_count ?? 0;
  const above = exposure.above_count ?? 0;
  const total = exposure.total_readings ?? within + near + above;

  return {
    withinPct: exposure.within_pct,
    nearPct: exposure.near_pct,
    abovePct: exposure.above_pct,
    withinCount: within,
    nearCount: near,
    aboveCount: above,
    totalReadings: total,
    buckets: [
      { label: 'Within', count: within, fill: KPI_THRESHOLD_COLORS.within },
      { label: 'Near', count: near, fill: KPI_THRESHOLD_COLORS.near },
      { label: 'Above', count: above, fill: KPI_THRESHOLD_COLORS.above }
    ].filter((bucket) => bucket.count > 0),
    impactTonnes: null,
    impactLabel: `${exposure.within_pct}% of validated ${metricId} samples were within target this week`
  };
}

/** Shared metric-card layout — keep chart columns aligned with Chlorine/PVC. */
const METRIC_ROW_CLASS = 'metric-row col-span-12 flex min-h-0 items-stretch gap-1';
const METRIC_CARD_CLASS =
  'metric-card flex min-h-[8.5rem] min-w-0 flex-1 flex-col rounded-lg border border-border/60 bg-card px-2 pb-1.5 pt-2 shadow-none';
const METRIC_BODY_ROW = 'flex min-h-0 flex-1 items-stretch gap-2';
const METRIC_CHART_MAIN = 'flex min-h-0 min-w-0 flex-1 flex-col';
const METRIC_CHART_GRID = 'grid min-h-0 flex-1 grid-cols-[0.75fr_0.25fr] items-stretch divide-x divide-border/30';
const METRIC_TREND_COL = 'flex min-h-0 min-w-0 flex-col pr-2.5';
const METRIC_WEEK_COL = 'flex min-h-0 min-w-0 flex-col pl-2.5';
const METRIC_CHART_SLOT = 'flex min-h-0 flex-1 flex-col';
const METRIC_FOOTER_ROW = 'mt-2 flex min-h-4 shrink-0 items-center border-t border-border/40 pt-1';
const METRIC_SIDEBAR_CLASS = 'w-[15rem] shrink-0 self-start';
const METRIC_LABEL_SPACER_CLASS = 'w-9 shrink-0 sm:w-10';
/** Shared spine strip — vertical row titles + horizontal column header. */
const METRIC_SPINE_CARD_CLASS = 'rounded-md border border-border/60 bg-muted/25';
const METRIC_COL_HEADER_CLASS =
  'text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-muted-foreground sm:text-[10px]';

function MetricChartMetricsRow({ children }: { children?: ReactNode }) {
  return (
    <div className='mb-1 flex h-5 shrink-0 items-center justify-end gap-2'>
      {children}
    </div>
  );
}

function DisabledChartPlaceholder({ label = 'KPI hidden' }: { label?: string }) {
  return (
    <div className='flex h-full min-h-[72px] items-center justify-center rounded-sm border border-dashed border-border/50 bg-muted/10 text-[10px] font-medium text-muted-foreground'>
      {label}
    </div>
  );
}

/** One shared column header between context row and metric rows. */
function MetricColumnHeaderRow() {
  return (
    <div className={cn(METRIC_ROW_CLASS, 'metric-column-header-row')}>
      <div className={METRIC_LABEL_SPACER_CLASS} aria-hidden />
      <div
        className={cn(
          METRIC_SPINE_CARD_CLASS,
          'flex min-h-0 min-w-0 flex-1 items-center px-2 py-1.5'
        )}
      >
        <div className={cn(METRIC_BODY_ROW, 'items-center')}>
          <div className={METRIC_CHART_MAIN}>
            <div className={cn(METRIC_CHART_GRID, 'min-h-0')}>
              <div className={METRIC_TREND_COL}>
                <p className={METRIC_COL_HEADER_CLASS}>{LABEL_12W_DAILY_TREND}</p>
              </div>
              <div className={METRIC_WEEK_COL}>
                <p className={METRIC_COL_HEADER_CLASS}>{LABEL_THIS_WEEK}</p>
              </div>
            </div>
          </div>
          <div className={cn(METRIC_SIDEBAR_CLASS, 'self-center')}>
            <p className={METRIC_COL_HEADER_CLASS}>{LABEL_METRIC_STATS_COL}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'OK' | 'Watch' | 'Alert' }) {
  const styles = {
    OK: THEME_SEMANTIC.positive.badge,
    Watch: THEME_SEMANTIC.warning.badge,
    Alert: THEME_SEMANTIC.negative.badge
  };
  return (
    <span className={cn('rounded border bg-transparent px-1.5 py-0.5 text-[10px] font-bold', styles[status])}>
      {status}
    </span>
  );
}

function ComparisonLine({
  label,
  value,
  decimals,
  unit
}: {
  label: string;
  value: number | null;
  decimals: number;
  unit: string;
}) {
  return (
    <p className='text-xs leading-relaxed text-muted-foreground'>
      {label}{' '}
      <span className='font-mono font-semibold text-foreground'>
        {value !== null ? `${value.toFixed(decimals)}${unit}` : '—'}
      </span>
    </p>
  );
}

function PpDelta({
  delta,
  decimals,
  invert,
  unit
}: {
  delta: number | null;
  decimals: number;
  invert?: boolean;
  unit: string;
}) {
  if (delta === null) return null;
  const bad = invert ? delta > 0 : false;
  const good = invert ? delta < 0 : delta > 0;
  const color = bad
    ? THEME_SEMANTIC.warning.text
    : good
      ? THEME_SEMANTIC.positive.text
      : THEME_SEMANTIC.neutral.text;
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const suffix = unit === '%' ? 'pp' : unit.trim();

  return (
    <p className={cn('mt-0.5 flex items-center gap-0.5 text-[12px] font-bold', color)}>
      <Icon className='size-3' strokeWidth={2.5} />
      <span className='font-mono'>
        {delta > 0 ? '+' : ''}
        {delta.toFixed(decimals)} {suffix}
      </span>
    </p>
  );
}

function KpiCard({
  label,
  ctx,
  unit,
  decimals,
  report,
  metricId,
  thresholdDist,
  refLines,
  thresholdZones,
  legend,
  invertDelta
}: {
  label: string;
  ctx: ReturnType<typeof buildMetricContext>;
  unit: string;
  decimals: number;
  report: CommercialReportPayload;
  metricId: string;
  thresholdDist?: ReturnType<typeof buildThresholdDistribution>;
  refLines?: RefLine[];
  thresholdZones?: ThresholdZones;
  legend?: { limit?: string; near?: string; within?: string; above?: string };
  invertDelta?: boolean;
}) {
  const vs12 =
    ctx.currentWeek !== null && ctx.avg12Week !== null ? ctx.currentWeek - ctx.avg12Week : null;

  return (
    <div className='flex flex-col rounded-lg border border-border/60 bg-card px-2.5 pb-2 pt-2 shadow-none'>
      <div className='flex items-start justify-between gap-1'>
        <span className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>{label}</span>
        <StatusBadge status={ctx.status} />
      </div>

      <div className='mt-1.5 flex items-start justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          <p className='text-[26px] font-bold leading-none tabular-nums tracking-tight'>
            {ctx.currentWeek !== null ? ctx.currentWeek.toFixed(decimals) : '—'}
            <span className='ml-0.5 text-xs font-semibold text-muted-foreground'>{unit}</span>
          </p>
          <div className='mt-2 space-y-1'>
            <ComparisonLine label='vs last week' value={ctx.lastWeek} decimals={decimals} unit={unit} />
            <ComparisonLine label='vs 12W avg' value={ctx.avg12Week} decimals={decimals} unit={unit} />
          </div>
          <PpDelta delta={vs12} decimals={decimals} invert={invertDelta} unit={unit} />
        </div>
        {thresholdDist ? (
          <ThresholdDonutChart dist={thresholdDist} />
        ) : (
          <div className='w-[72px] shrink-0' />
        )}
      </div>

      <div className='mt-2 flex flex-col gap-1 border-t border-border/40 pt-1.5'>
        <KpiTrendChart
          report={report}
          metricId={metricId}
          refLines={refLines}
          thresholdZones={thresholdZones}
          decimals={decimals}
        />
        <KpiCardFooter dist={thresholdDist} legend={legend} />
      </div>
    </div>
  );
}

function Panel({
  title,
  sub,
  children,
  className
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border/60 bg-card px-2 pb-1.5 pt-2', className)}>
      <div className='mb-1 flex items-baseline justify-between gap-1'>
        <h3 className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>{title}</h3>
        {sub ? <span className='text-[11px] text-muted-foreground'>{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Thin vertical spine label — rotated 90°, left of the main metric card. */
function VerticalMetricLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className={cn('metric-row-label flex shrink-0 self-stretch', METRIC_LABEL_SPACER_CLASS)} aria-label={title}>
      <div className={cn('flex flex-1 flex-row items-center justify-center gap-0.5', METRIC_SPINE_CARD_CLASS, 'px-0.5 py-2')}>
        <span
          className='whitespace-nowrap text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-muted-foreground sm:text-[10px]'
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {title}
        </span>
        {sub ? (
          <span
            className='whitespace-nowrap text-[8px] font-medium leading-none text-muted-foreground/70'
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MetricRow({
  title,
  sub,
  children,
  className
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(METRIC_ROW_CLASS, className)}>
      <VerticalMetricLabel title={title} sub={sub} />
      <div className={METRIC_CARD_CLASS}>{children}</div>
    </div>
  );
}

function contextPercentileVisual(
  percentile: number,
  lowerIsBetter: boolean
): { dot: string; text: string } {
  if (lowerIsBetter) {
    if (percentile >= 95) return THEME_SEMANTIC.negative;
    if (percentile >= 70) return THEME_SEMANTIC.warning;
    return THEME_SEMANTIC.positive;
  }
  if (percentile >= 40 && percentile <= 60) {
    return { dot: THEME_SEMANTIC.warning.dot, text: THEME_SEMANTIC.positive.text };
  }
  if (percentile >= 80 || percentile <= 20) {
    return THEME_SEMANTIC.warning;
  }
  return THEME_SEMANTIC.positive;
}

function ContextPanel({
  report,
  weekLabel,
  className
}: {
  report: CommercialReportPayload;
  weekLabel: string;
  className?: string;
}) {
  const rows = buildWeeklyContextRows(report);

  return (
    <div className={cn('flex h-full flex-col rounded-lg border border-border/60 bg-card px-2.5 py-2', className)}>
      <h3 className='mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground'>
        {weekLabel} Context <span className='font-bold'>(Percentile Rank)</span>
      </h3>
      <ul className='flex flex-1 flex-col justify-between gap-2.5'>
        {rows.map((row) => {
          const visual = contextPercentileVisual(row.percentile, row.lowerIsBetter);
          const hasRank = row.rankTotal > 0;
          return (
            <li key={row.id} className='flex items-center gap-2'>
              <span className='w-[6rem] shrink-0 text-xs font-semibold leading-tight text-foreground'>
                {row.label}
              </span>
              <span className={cn('w-[3.25rem] shrink-0 whitespace-nowrap text-right font-mono text-[13px] font-bold tabular-nums leading-none', THEME_SEMANTIC.accent.text)}>
                {hasRank ? `${row.rankPosition} / ${row.rankTotal}` : '—'}
              </span>
              <div className='relative h-1 min-w-0 flex-1 rounded-full bg-muted/80'>
                {hasRank ? (
                  <div
                    className={cn(
                      'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                      visual.dot
                    )}
                    style={{ left: `${row.percentile}%` }}
                  />
                ) : null}
              </div>
              <span
                className={cn(
                  'w-[2.25rem] shrink-0 whitespace-nowrap text-right font-mono text-xs font-semibold tabular-nums',
                  visual.text
                )}
              >
                {hasRank ? percentileLabel(row.percentile) : '—'}
              </span>
            </li>
          );
        })}
      </ul>
      <div className='mt-3 flex items-end gap-2'>
        <div className='w-[6rem] shrink-0' />
        <div className='w-[3.25rem] shrink-0' />
        <div className='flex min-w-0 flex-1 justify-between border-t border-border/40 pt-1 text-[10px] text-muted-foreground'>
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
        <div className='w-[2.25rem] shrink-0' />
      </div>
      <p className='mt-1.5 text-center text-[10px] leading-snug text-muted-foreground'>
        Percentile (low is best for quality metrics)
      </p>
    </div>
  );
}

function ThroughputChartLegend() {
  return (
    <div className='flex flex-nowrap items-center gap-3 text-[10px] leading-none text-muted-foreground'>
      <span className='inline-flex shrink-0 items-center gap-1 whitespace-nowrap'>
        <span className='size-1.5 shrink-0 rounded-full bg-commercial-feed opacity-70' />
        Recorded input feed
      </span>
    </div>
  );
}

function FooterRangeText({
  label,
  value
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <p className='whitespace-nowrap text-[10px] leading-none text-muted-foreground'>
      {label}{' '}
      <span className='font-mono font-semibold tabular-nums text-foreground'>{value}</span>
    </p>
  );
}

function formatTonnes(value: number): string {
  return `${Math.round(value)} t`;
}

function formatTonnesSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value)} t`;
}

function formatTonnesRange(min: number, max: number): string {
  return `${Math.round(min)}–${Math.round(max)} t`;
}

/** PVC share increase is undesirable — positive pp renders as negative tone. */
function compositionDeltaTone(label: string, delta: number): string {
  if (label === 'PVC') return diffToneClass(delta, { invert: true });
  return diffToneClass(delta);
}

function numberRange(values: number[], decimals: number, suffix: string): string | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return `${min.toFixed(decimals)}–${max.toFixed(decimals)}${suffix}`;
}

function tonneRange(values: number[]): string | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return formatTonnesRange(min, max);
}

function qualityStatsRows({
  current,
  average,
  dist,
  baselineDist,
  decimals,
  lowerIsBetter,
  hasNearZone
}: {
  current: number | null;
  average: number | null;
  dist: ReturnType<typeof buildThresholdDistribution>;
  baselineDist: ReturnType<typeof buildThresholdDistribution> | null;
  decimals: number;
  lowerIsBetter: boolean;
  hasNearZone: boolean;
}): SummaryStatRow[] {
  const diff = current != null && average != null ? current - average : null;
  const exposureRow = (
    key: 'above' | 'near' | 'within',
    label: string,
    pct: number,
    baselinePct: number | undefined,
    higherIsBetter: boolean
  ): SummaryStatRow => {
    const delta = baselinePct == null ? null : pct - baselinePct;
    return {
      key,
      label,
      value: `${pct}%`,
      toneClass: ZONE_TEXT_CLASS[key],
      delta: delta != null ? signedValue(delta, 0, ' pp') : null,
      deltaToneClass: exposureChangeTone(delta, higherIsBetter)
    };
  };

  const rows: SummaryStatRow[] = [
    exposureRow('above', 'Above threshold', dist.abovePct, baselineDist?.abovePct, false)
  ];

  if (hasNearZone) {
    rows.push(exposureRow('near', 'Near threshold', dist.nearPct, baselineDist?.nearPct, false));
  }

  rows.push(
    exposureRow(
      'within',
      hasNearZone ? 'Within threshold' : 'Under threshold',
      dist.withinPct,
      baselineDist?.withinPct,
      true
    )
  );
  rows.push(
    {
      key: 'this-week',
      label: 'This week avg',
      value: current != null ? `${current.toFixed(decimals)}%` : '—',
      toneClass: 'text-foreground',
      delta: diff != null ? signedValue(diff, decimals, ' pp') : null,
      deltaToneClass: qualityDeltaTone(diff, lowerIsBetter)
    }
  );

  return rows;
}

function exposureChangeTone(delta: number | null, higherIsBetter: boolean): string {
  if (delta == null || delta === 0) return THEME_SEMANTIC.neutral.text;
  const good = higherIsBetter ? delta > 0 : delta < 0;
  return good ? THEME_SEMANTIC.positive.text : THEME_SEMANTIC.negative.text;
}

function QualityDistributionCard({
  title,
  sub,
  report,
  metricId,
  ctx,
  thresholdZones,
  dist,
  legend,
  hasNearZone = true,
  refLines,
  decimals,
  trendWindow = 'trend',
  className,
  visible = true
}: {
  title: string;
  sub?: string;
  report: CommercialReportPayload;
  metricId: string;
  ctx: ReturnType<typeof buildMetricContext>;
  thresholdZones: ThresholdZones;
  dist: ReturnType<typeof buildThresholdDistribution>;
  legend: { limit?: string; near?: string; within?: string; above?: string };
  hasNearZone?: boolean;
  refLines: RefLine[];
  decimals: number;
  trendWindow?: 'trend' | 'daily-trend';
  className?: string;
  visible?: boolean;
}) {
  const baselineDist = buildThresholdDistribution(
    getThresholdDailyValues(report, metricId as 'chlorine' | 'pvc' | 'input_moisture' | 'output_moisture'),
    thresholdZones.okMax,
    thresholdZones.warnMax,
    0,
    title
  );
  const weekRange = numberRange(getThisWeekDailyValues(report, metricId), decimals, '%');
  const summaryRows = visible ? qualityStatsRows({
    current: ctx.currentWeek,
    average: ctx.avg12Week,
    dist,
    baselineDist,
    decimals,
    lowerIsBetter: true,
    hasNearZone
  }) : qualityStatsRows({
    current: null,
    average: null,
    dist: { ...dist, withinPct: 0, nearPct: 0, abovePct: 0, withinCount: 0, nearCount: 0, aboveCount: 0, totalReadings: 0, buckets: [], impactTonnes: null, impactLabel: '' },
    baselineDist: null,
    decimals,
    lowerIsBetter: true,
    hasNearZone
  }).map((row) => ({ ...row, value: HIDDEN_VALUE, delta: null }));

  return (
    <MetricRow title={title} sub={sub} className={className}>
      <div className={METRIC_BODY_ROW}>
        <div className={METRIC_CHART_MAIN}>
          <div className={METRIC_CHART_GRID}>
            <div className={METRIC_TREND_COL}>
              <MetricChartMetricsRow />
              <div className={METRIC_CHART_SLOT}>
                {visible ? (
                  <KpiTrendChart
                    report={report}
                    metricId={metricId}
                    refLines={refLines}
                    thresholdZones={thresholdZones}
                    decimals={decimals}
                    fillHeight
                    window={trendWindow}
                  />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
            <div className={METRIC_WEEK_COL}>
              <MetricChartMetricsRow />
              <div className={METRIC_CHART_SLOT}>
                {visible ? (
                  <KpiTrendChart
                    report={report}
                    metricId={metricId}
                    refLines={refLines}
                    thresholdZones={thresholdZones}
                    decimals={decimals}
                    fillHeight
                    window='week'
                  />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
          </div>
          <div className={cn(METRIC_FOOTER_ROW, 'items-center gap-3')}>
            {visible ? <KpiCardFooter dist={dist} legend={legend} showPct={false} /> : null}
            <div className='ml-auto'>
              <FooterRangeText label='This week range' value={visible ? weekRange : HIDDEN_VALUE} />
            </div>
          </div>
        </div>
        <ReadingDistributionSummary
          dist={dist}
          hasNearZone={hasNearZone}
          baselineDist={baselineDist}
          title='This week stats'
          summaryRows={summaryRows}
        />
      </div>
    </MetricRow>
  );
}

function MoistureDistributionCard({
  report,
  moInDist,
  moOutDist,
  showInput,
  showOutput
}: {
  report: CommercialReportPayload;
  moInDist: ReturnType<typeof buildThresholdDistribution>;
  moOutDist: ReturnType<typeof buildThresholdDistribution>;
  showInput: boolean;
  showOutput: boolean;
}) {
  const moIn = buildMetricContext(report, 'input_moisture');
  const moOut = buildMetricContext(report, 'output_moisture');
  const trendData = buildMoistureDailyTrendData(report);
  const weekData = buildMoistureDailyData(report);

  const moInBaselineDist = buildThresholdDistribution(
    getThresholdDailyValues(report, 'input_moisture'),
    COMMERCIAL_INPUT_MOISTURE_ZONES.okMax,
    COMMERCIAL_INPUT_MOISTURE_ZONES.warnMax,
    0,
    'input moisture'
  );
  const inputCurrent = moIn.currentWeek ?? 0;
  const outputCurrent = moOut.currentWeek ?? 0;
  const inputAvg = moIn.avg12Week;
  const outputAvg = moOut.avg12Week;
  const reductionCurrent = inputCurrent - outputCurrent;
  const reductionAvg = inputAvg != null && outputAvg != null ? inputAvg - outputAvg : null;
  const summaryRows: VolumeSidebarRow[] = [
    {
      label: 'Input moisture',
      display: 'pct',
      decimals: 1,
      value: inputCurrent,
      visible: showInput,
      diffPp: inputAvg != null ? inputCurrent - inputAvg : null,
      diffPreference: 'lower-better'
    },
    {
      label: 'Output moisture',
      display: 'pct',
      decimals: 1,
      value: outputCurrent,
      visible: showOutput,
      diffPp: outputAvg != null ? outputCurrent - outputAvg : null,
      diffPreference: 'lower-better'
    },
    {
      label: 'Measured reduction',
      display: 'pp',
      decimals: 1,
      value: reductionCurrent,
      visible: showInput && showOutput,
      diffPp: reductionAvg != null ? reductionCurrent - reductionAvg : null,
      diffPreference: 'higher-better'
    },
    {
      label: 'Input within threshold',
      display: 'pct',
      value: moInDist.withinPct,
      visible: showInput,
      diffPp: moInDist.withinPct - moInBaselineDist.withinPct,
      diffPreference: 'higher-better'
    }
  ];
  const anyVisible = showInput || showOutput;

  return (
    <MetricRow title='Moisture' sub='Drying performance'>
      <div className={METRIC_BODY_ROW}>
        <div className={METRIC_CHART_MAIN}>
          <div className={METRIC_CHART_GRID}>
            <div className={METRIC_TREND_COL}>
              <MetricChartMetricsRow>
                <div className='flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums'>
                  <span className='font-sans font-medium text-muted-foreground'>Avg</span>
                  <span className='text-commercial-pre-moisture'>{showInput && inputAvg != null ? `${inputAvg.toFixed(1)}% pre` : HIDDEN_VALUE}</span>
                  <span className='text-muted-foreground/35'>·</span>
                  <span className='text-threshold-within'>{showOutput && outputAvg != null ? `${outputAvg.toFixed(1)}% post` : HIDDEN_VALUE}</span>
                </div>
              </MetricChartMetricsRow>
              <div className={METRIC_CHART_SLOT}>
                {anyVisible ? (
                  <MoistureGroupedBarChart
                    data={trendData}
                    fillHeight
                    window='daily-trend'
                    showInput={showInput}
                    showOutput={showOutput}
                  />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
            <div className={METRIC_WEEK_COL}>
              <MetricChartMetricsRow>
                <div className='flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums'>
                  <span className='font-sans font-medium text-muted-foreground'>Current</span>
                  <span className='text-commercial-pre-moisture'>{showInput ? `${inputCurrent.toFixed(1)}% pre` : HIDDEN_VALUE}</span>
                  <span className='text-muted-foreground/35'>·</span>
                  <span className='text-threshold-within'>{showOutput ? `${outputCurrent.toFixed(1)}% post` : HIDDEN_VALUE}</span>
                </div>
              </MetricChartMetricsRow>
              <div className={METRIC_CHART_SLOT}>
                {anyVisible ? (
                  <MoistureGroupedBarChart
                    data={weekData}
                    fillHeight
                    window='week'
                    showInput={showInput}
                    showOutput={showOutput}
                  />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
          </div>
          <div className={cn(METRIC_FOOTER_ROW, 'justify-between gap-3')}>
            <div className='flex items-center gap-3 text-[10px] leading-none text-muted-foreground'>
              {showInput ? <span className='inline-flex items-center gap-1 whitespace-nowrap'>
                <span className='size-1.5 rounded-full bg-commercial-pre-moisture' /> Input moisture
              </span> : null}
              {showOutput ? <span className='inline-flex items-center gap-1 whitespace-nowrap'>
                <span className='size-1.5 rounded-full bg-threshold-within' /> Output moisture
              </span> : null}
            </div>
            {showOutput ? <KpiCardFooter
              dist={moOutDist}
              legend={{ near: '8–10%', within: '≤8%', above: '>10%' }}
            /> : null}
          </div>
        </div>
        <VolumeSidebar
          title='Drying performance'
          rows={summaryRows}
          className={METRIC_SIDEBAR_CLASS}
          visible={anyVisible}
        />
      </div>
    </MetricRow>
  );
}


function lastWeeklyTonnage(report: CommercialReportPayload, metricId: string): number | null {
  const series = report.weekly_series?.find((s) => s.id === metricId);
  const pts = series?.points.filter((p) => p.value != null) ?? [];
  return pts.length ? (pts[pts.length - 1].value as number) : null;
}

function volumeWeekTonnage(report: CommercialReportPayload, metricId: 'feed_volume'): number | null {
  return report.last_week_input_tonnage ?? lastWeeklyTonnage(report, metricId);
}

type VolumeStats12w = {
  avg: number | null;
  min: number | null;
  max: number | null;
};

function volumeStats12w(
  report: CommercialReportPayload,
  metricId: 'feed_volume'
): VolumeStats12w {
  const apiAvg = report.feed_volume_3m_avg ?? null;
  const anchor = getAnchorWeekKey(report);
  const series = report.weekly_series?.find((s) => s.id === metricId);
  const values =
    series?.points
      .filter((p) => p.value != null && weekKeyLte(isoWeekKey(p.week_start), anchor))
      .map((p) => p.value as number)
      .slice(-12) ?? [];

  if (!values.length) {
    return { avg: apiAvg, min: null, max: null };
  }

  const computedAvg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    avg: apiAvg ?? computedAvg,
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function volumeAvg12w(report: CommercialReportPayload, metricId: 'feed_volume'): number | null {
  return report.feed_volume_3m_avg ?? volumeStats12w(report, metricId).avg;
}

type VolumeSidebarRow = {
  label: string;
  display: 'tonnes' | 'pct' | 'pp';
  value: number;
  visible?: boolean;
  valueText?: string;
  valueTone?: string;
  decimals?: number;
  diffTonnes?: number | null;
  diffPp?: number | null;
  diffText?: string | null;
  diffPreference?: 'neutral' | 'higher-better' | 'lower-better';
};

function VolumeSidebar({
  title,
  rows,
  className,
  visible = true
}: {
  title: string;
  rows: VolumeSidebarRow[];
  className?: string;
  visible?: boolean;
}) {
  return (
    <div className={cn('flex flex-col border-l border-border/40 py-1 pl-3', className ?? 'w-[15rem] shrink-0')}>
      <div className='mb-2'>
        <p className='text-xs font-bold uppercase tracking-wide text-muted-foreground'>{title}</p>
      </div>
      <ul className={cn('grid flex-1', rows.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {rows.map((row, index) => {
          const rowVisible = visible && row.visible !== false;
          const diffVal = row.display === 'tonnes' ? row.diffTonnes : row.diffPp;
          const diffTone =
            diffVal == null || diffVal === 0
              ? THEME_SEMANTIC.neutral.text
              : row.diffPreference === 'neutral'
                ? THEME_SEMANTIC.neutral.text
                : row.diffPreference === 'lower-better'
                  ? diffVal < 0
                    ? THEME_SEMANTIC.positive.text
                    : THEME_SEMANTIC.negative.text
                  : row.diffPreference === 'higher-better'
                    ? diffVal > 0
                      ? THEME_SEMANTIC.positive.text
                      : THEME_SEMANTIC.negative.text
                    : diffToneClass(diffVal);

          return (
            <li
              key={row.label}
              className={cn(
                'min-w-0',
                index % 2 === 0 ? 'pr-3' : 'border-l border-border/40 pl-3',
                index < 2 ? 'pb-2' : 'border-t border-border/40 pt-2'
              )}
            >
              <p className='truncate text-[10px] leading-none text-muted-foreground'>{row.label}</p>
              <p className={cn('mt-1 whitespace-nowrap font-mono text-[17px] font-bold tabular-nums leading-none tracking-tight', row.valueTone ?? 'text-foreground')}>
                {rowVisible
                  ? (row.valueText ??
                    (row.display === 'tonnes'
                      ? formatTonnes(row.value)
                      : row.display === 'pct'
                        ? `${row.value.toFixed(row.decimals ?? 0)}%`
                        : `${row.value.toFixed(row.decimals ?? 1)} pp`))
                  : HIDDEN_VALUE}
              </p>
              <p className={cn('mt-1 min-h-5 whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums', diffTone)}>
                {rowVisible ? (row.diffText ?? (diffVal != null ? (
                  <>
                    {diffVal > 0 ? '+' : ''}
                    {row.display === 'tonnes' ? formatTonnesSigned(diffVal) : `${diffVal.toFixed(1)} pp`}
                  </>
                ) : null)) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function buildVolumeSidebarRows(report: CommercialReportPayload): VolumeSidebarRow[] {
  const feedWeek = volumeWeekTonnage(report, 'feed_volume');
  const feedStats = volumeStats12w(report, 'feed_volume');
  const feedDiff = feedWeek != null && feedStats.avg != null ? feedWeek - feedStats.avg : null;

  return [
    {
      label: 'This week',
      display: 'tonnes',
      value: feedWeek ?? 0
    },
    {
      label: '12W average',
      display: 'tonnes',
      value: feedStats.avg ?? 0,
      diffText: 'baseline',
      diffPreference: 'neutral'
    },
    {
      label: 'Difference',
      display: 'tonnes',
      value: feedDiff ?? 0,
      valueText: feedDiff != null ? formatTonnesSigned(Math.round(feedDiff)) : '—',
      valueTone: qualityDeltaTone(feedDiff, false),
      diffText: 'vs 12W avg',
      diffPreference: 'higher-better'
    }
  ];
}

function VolumeThroughputCard({ report, visible }: { report: CommercialReportPayload; visible: boolean }) {
  const trendData = buildThroughputDailyTrendData(report);
  const weekData = buildThroughputBarData(report, 'week');
  const sidebarRows = buildVolumeSidebarRows(report);
  const feedStats = volumeStats12w(report, 'feed_volume');
  const trendAvgLine = feedStats.avg != null
    ? [{ value: feedStats.avg / THIS_WEEK_DAYS, stroke: KPI_THRESHOLD_COLORS.near, dash: '5 4' }]
    : [];
  const weekAvgLine = feedStats.avg != null
    ? [{ value: feedStats.avg / THIS_WEEK_SHIFTS, stroke: KPI_THRESHOLD_COLORS.near, dash: '5 4' }]
    : [];
  const weekRange = tonneRange(weekData.filter((d) => d.hasData !== false).map((d) => d.feed));
  const twelveWeekRange =
    feedStats.min != null && feedStats.max != null
      ? formatTonnesRange(feedStats.min, feedStats.max)
      : null;

  return (
    <MetricRow title='Input Volume' sub='Recorded incoming feed'>
      <div className={METRIC_BODY_ROW}>
        <div className={METRIC_CHART_MAIN}>
          <div className={METRIC_CHART_GRID}>
            <div className={METRIC_TREND_COL}>
              <MetricChartMetricsRow />
              <div className={METRIC_CHART_SLOT}>
                {visible ? (
                  <ThroughputGroupedBarChart
                    data={trendData}
                    fillHeight
                    window='daily-trend'
                    refLines={trendAvgLine}
                  />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
            <div className={METRIC_WEEK_COL}>
              <MetricChartMetricsRow />
              <div className={METRIC_CHART_SLOT}>
                {visible ? (
                  <ThroughputGroupedBarChart
                    data={weekData}
                    fillHeight
                    window='week'
                    emptyLabel='No daily throughput data'
                    refLines={weekAvgLine}
                  />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
          </div>
          <div className={cn(METRIC_FOOTER_ROW, 'gap-3')}>
            {visible ? <ThroughputChartLegend /> : null}
            <div className='ml-auto flex items-center gap-3'>
              <FooterRangeText label='12W range' value={visible ? twelveWeekRange : HIDDEN_VALUE} />
              <FooterRangeText label='This week range' value={visible ? weekRange : HIDDEN_VALUE} />
            </div>
          </div>
        </div>
        <VolumeSidebar title='Input volume' rows={sidebarRows} className={METRIC_SIDEBAR_CLASS} visible={visible} />
      </div>
    </MetricRow>
  );
}

function categorySharePct(
  categories: ReturnType<typeof buildCompositionCategories>,
  field: 'normalPct' | 'currentPct',
  label: string
): number {
  const total = categories.reduce((s, c) => s + c[field], 0) || 1;
  const cat = categories.find((c) => c.label === label);
  return cat ? Math.round((cat[field] / total) * 100) : 0;
}

function FeedstockShiftSummary({
  categories,
  visible = true
}: {
  categories: ReturnType<typeof buildCompositionCategories>;
  visible?: boolean;
}) {
  return (
    <div className='flex w-[15rem] shrink-0 self-start flex-col border-l border-border/40 py-1 pl-3'>
      <div className='mb-2'>
        <p className='text-xs font-bold uppercase tracking-wide text-muted-foreground'>Mix shift</p>
      </div>
      <ul className='grid flex-1 grid-cols-2'>
        {categories.map((c, index) => {
          const share = categorySharePct(categories, 'currentPct', c.label);
          const diffTone = compositionDeltaTone(c.label, c.delta);
          const dSign = c.delta > 0 ? '+' : '';

          return (
            <li
              key={c.label}
              className={cn(
                'min-w-0',
                index % 2 === 0 ? 'pr-3' : 'border-l border-border/40 pl-3',
                index < 2 ? 'pb-2' : 'border-t border-border/40 pt-2'
              )}
            >
              <p className='truncate text-[10px] leading-none text-muted-foreground'>{c.label}</p>
              <p
                className='mt-1 font-mono text-[17px] font-bold tabular-nums leading-none tracking-tight'
                style={{ color: c.color }}
              >
                {visible ? `${share}%` : HIDDEN_VALUE}
              </p>
              <div className='mt-1 flex min-h-5 items-start justify-between gap-1 text-[10px]'>
                <p className='whitespace-nowrap font-mono tabular-nums text-muted-foreground'>
                  {visible ? `12W ${categorySharePct(categories, 'normalPct', c.label)}%` : null}
                </p>
                <p className={cn('whitespace-nowrap font-mono font-semibold tabular-nums', diffTone)}>
                  {visible ? `${dSign}${c.delta.toFixed(1)} pp` : null}
                </p>
              </div>
            </li>
          );
        })}
        {categories.length % 2 !== 0 ? (
          <li aria-hidden className='border-l border-t border-border/40 pl-3 pt-2' />
        ) : null}
      </ul>
    </div>
  );
}

function FeedstockPanel({ report, visible }: { report: CommercialReportPayload; visible: boolean }) {
  const categories = buildCompositionCategories(report);
  const trendData = buildCompositionDailyTrendData(report);
  const weekData = buildCompositionAreaData(report, 'week');
  const topShift = [...categories].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

  return (
    <MetricRow title='Incoming Feed Mix' sub='Classified material shares'>
      <div className={METRIC_BODY_ROW}>
        <div className={METRIC_CHART_MAIN}>
          <div className={METRIC_CHART_GRID}>
            <div className={METRIC_TREND_COL}>
              <MetricChartMetricsRow>
                <p className='text-[10px] font-medium text-muted-foreground'>12W classified mix</p>
              </MetricChartMetricsRow>
              <div className={METRIC_CHART_SLOT}>
                {visible ? (
                  <FeedstockStackedAreaChart data={trendData} fillHeight window='daily-trend' />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
            <div className={METRIC_WEEK_COL}>
              <MetricChartMetricsRow>
                {visible && topShift ? (
                  <p className='whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums text-muted-foreground'>
                    Largest Δ <span className={compositionDeltaTone(topShift.label, topShift.delta)}>{topShift.delta > 0 ? '+' : ''}{topShift.delta.toFixed(1)} pp</span>
                  </p>
                ) : (
                  <p className='font-mono text-[10px] font-semibold tabular-nums text-muted-foreground'>{HIDDEN_VALUE}</p>
                )}
              </MetricChartMetricsRow>
              <div className={METRIC_CHART_SLOT}>
                {visible ? (
                  <FeedstockStackedAreaChart data={weekData} fillHeight window='week' />
                ) : (
                  <DisabledChartPlaceholder />
                )}
              </div>
            </div>
          </div>
          <div className={cn(METRIC_FOOTER_ROW, 'flex-col items-stretch gap-1.5')}>
            <div className='flex flex-wrap items-center gap-x-2 gap-y-0.5'>
              {visible ? categories.map((c) => (
                <span key={c.label} className='inline-flex items-center gap-1 text-[10px] text-muted-foreground'>
                  <span className='size-1.5 rounded-full' style={{ background: c.color }} />
                  {c.label}
                </span>
              )) : null}
            </div>
            {visible ? (
              <p className='text-[9px] leading-snug text-muted-foreground'>{COMPOSITION_SHARES_NOTE}</p>
            ) : null}
          </div>
        </div>
        <FeedstockShiftSummary categories={categories} visible={visible} />
      </div>
    </MetricRow>
  );
}

function TornadoPanel({ report, className }: { report: CommercialReportPayload; className?: string }) {
  const items = buildTornadoItems(report);
  const rawData = items.map((i) => ({
    label: i.label,
    value: i.value,
    display: i.display,
    absDisplay: i.absDisplay,
    fill: i.fill
  }));
  const negativeExtent = Math.min(0, ...rawData.map((d) => d.value));
  const positiveExtent = Math.max(0, ...rawData.map((d) => d.value));
  const largestExtent = Math.max(Math.abs(negativeExtent), positiveExtent, 1);
  const tickStep = 10 ** Math.floor(Math.log10(largestExtent)) / 2;
  const roundOutward = (value: number) => {
    if (value === 0) return 0;
    return Math.ceil(Math.abs(value) / tickStep) * tickStep;
  };
  const xMin = negativeExtent < 0 ? -roundOutward(negativeExtent * 1.15) : 0;
  const xMax = positiveExtent > 0 ? roundOutward(positiveExtent * 1.15) : 0;
  const renderCategoryTick = ({
    x,
    y,
    payload
  }: {
    x?: number | string;
    y?: number | string;
    payload?: { value?: string };
  }) => {
    const words = String(payload?.value ?? '').split(' ').filter(Boolean);
    const splitAt = Math.ceil(words.length / 2);
    const lines = words.length > 1
      ? [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')]
      : words;
    const tickY = Number(y ?? 0) - ((lines.length - 1) * 5);

    return (
      <text
        x={Math.min(Number(x ?? 0), 4)}
        y={tickY}
        textAnchor='start'
        fill='var(--muted-foreground)'
        fontSize={9}
        fontWeight={600}
      >
        {lines.map((line, index) => (
          <tspan key={line} x={4} dy={index === 0 ? '0.35em' : 10}>
            {line}
          </tspan>
        ))}
      </text>
    );
  };

  return (
    <div className={cn('flex h-full flex-col rounded-lg border border-border/60 bg-card px-2.5 py-2', className)}>
      <div className='mb-2'>
        <h3 className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
          What Changed This Week? <span className='font-bold'>(vs 12W avg)</span>
        </h3>
        <p className='mt-0.5 text-xs text-muted-foreground'>Ranked by % change — comparable across metrics</p>
      </div>
      <div className='min-h-[168px] flex-1'>
        <ChartContainer
          config={tornadoChartConfig}
          className='aspect-auto h-full w-full [&_.recharts-cartesian-grid_line]:stroke-border/40'
          style={{ minHeight: 168 }}
        >
          <BarChart data={rawData} layout='vertical' margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray='2 2' horizontal={false} stroke='var(--border)' />
            <XAxis
              type='number'
              domain={[xMin, xMax]}
              ticks={[xMin, 0, xMax]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${Number(v.toFixed(1))}%`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type='category'
              dataKey='label'
              tick={renderCategoryTick}
              width={92}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: '10px',
                backgroundColor: 'var(--background)',
                borderColor: 'var(--border)',
                borderRadius: '8px',
                color: 'var(--foreground)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
              }}
              itemStyle={{ color: 'var(--foreground)' }}
              labelStyle={{ color: 'var(--muted-foreground)', fontWeight: '600', marginBottom: '2px' }}
              formatter={(_v: any, _n: any, p: any) => {
                const row = (p as { payload: { display: string; absDisplay: string | null } }).payload;
                const abs = row.absDisplay ? ` (${row.absDisplay})` : '';
                return [`${row.display}${abs}`, 'Δ vs 12W'];
              }}
            />
            <ReferenceLine x={0} stroke='var(--border)' />
            <Bar dataKey='value' radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {rawData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
              <LabelList dataKey='display' position='right' fill='var(--foreground)' fontSize={10} fontWeight={600} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function ThresholdStatusRow({
  status,
  pct,
  count,
  diffDisplay,
  showDiff,
  tone
}: {
  status: string;
  pct: number;
  count: number;
  diffDisplay?: string | null;
  showDiff?: boolean;
  tone: 'above' | 'near' | 'within';
}) {
  const toneClass =
    tone === 'above'
      ? THEME_SEMANTIC.negative.text
      : tone === 'near'
        ? THEME_SEMANTIC.warning.text
        : THEME_SEMANTIC.positive.text;
  const diffTone =
    !diffDisplay || !showDiff
      ? ''
      : diffDisplay.startsWith('+')
        ? THEME_SEMANTIC.negative.text
        : diffDisplay.startsWith('-')
          ? THEME_SEMANTIC.positive.text
          : THEME_SEMANTIC.neutral.text;

  return (
    <div className='col-span-4 col-start-2 grid grid-cols-subgrid items-start py-0.5'>
      <span className='whitespace-nowrap text-[11px] text-muted-foreground'>{status}</span>
      <span className={cn('whitespace-nowrap text-right font-mono text-[11px] font-semibold tabular-nums', toneClass)}>{pct}%</span>
      <span className={cn('whitespace-nowrap text-right font-mono text-[11px] font-semibold tabular-nums', toneClass)}>
        {count}
      </span>
      <span className={cn('whitespace-nowrap text-right font-mono text-[11px] font-semibold tabular-nums', diffTone)}>
        {showDiff && diffDisplay ? diffDisplay : ''}
      </span>
    </div>
  );
}

function ThresholdTable({ report, className }: { report: CommercialReportPayload; className?: string }) {
  const rows = buildThresholdSummary(report);

  return (
    <div
      className={cn(
        'grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_max-content_max-content_max-content] grid-rows-[auto_auto_1fr] gap-x-2 rounded-lg border border-border/60 bg-card px-2.5 py-2',
        className
      )}
    >
      <h3 className='col-span-full mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground'>
        Quality Periods <span className='font-bold'>(This Week)</span>
      </h3>

      <div className='col-span-full grid grid-cols-subgrid border-b border-border/40 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
        <span />
        <span />
        <span className='text-right'>Share</span>
        <span className='text-right'>n</span>
        <span className='text-right'>Δ avg</span>
      </div>

      <div className='col-span-full grid grid-cols-subgrid content-between'>
        {rows.map((r) => {
          return (
            <div key={r.label} className='col-span-full grid grid-cols-subgrid border-t border-border/40 py-1.5 first:border-t-0 first:pt-0'>
              <span
                className={cn(
                  'col-start-1 row-start-1 text-[11px] font-semibold leading-tight text-foreground',
                  r.hasNearZone ? 'row-span-3' : 'row-span-2'
                )}
              >
                {r.label}
              </span>
              <ThresholdStatusRow
                status='Above limit'
                pct={r.abovePct}
                count={r.aboveCount}
                diffDisplay={r.diffDisplay}
                showDiff
                tone='above'
              />
              {r.hasNearZone ? (
                <ThresholdStatusRow
                  status='Near limit'
                  pct={r.nearPct}
                  count={r.nearCount}
                  tone='near'
                />
              ) : null}
              <ThresholdStatusRow
                status='Within limit'
                pct={r.withinPct}
                count={r.withinCount}
                tone='within'
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SnapshotKpi = {
  label: string;
  source: string;
  value: string;
  delta: string;
  deltaValue: number | null;
  deltaGood: boolean | null;
  avgLabel: string;
  context: string;
  contextTone?: string;
  visible?: boolean;
};

function signedValue(value: number | null, decimals: number, suffix: string): string {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}${suffix}`;
}

function qualityDeltaTone(delta: number | null, lowerIsBetter: boolean): string {
  if (delta == null || delta === 0) return THEME_SEMANTIC.neutral.text;
  const favourable = lowerIsBetter ? delta < 0 : delta > 0;
  return favourable ? THEME_SEMANTIC.positive.text : THEME_SEMANTIC.negative.text;
}

function favourableDelta(delta: number | null, lowerIsBetter: boolean): boolean | null {
  if (delta == null || delta === 0) return null;
  return lowerIsBetter ? delta < 0 : delta > 0;
}

function DeltaBadge({
  value,
  label,
  good,
  align = 'left',
  className
}: {
  value: number | null;
  label: string;
  good: boolean | null;
  align?: 'left' | 'right';
  className?: string;
}) {
  const Icon = value == null || value === 0 ? Minus : value > 0 ? ArrowUp : ArrowDown;
  const tone = good == null
    ? 'border-border/50 bg-muted text-muted-foreground'
    : good
      ? 'border-commercial-good/30 bg-commercial-good/10 text-commercial-good'
      : 'border-commercial-bad/30 bg-commercial-bad/10 text-commercial-bad';

  return (
    <Badge
      variant='outline'
      className={cn(
        'h-6 gap-1 rounded-md px-2 font-mono text-[11px] font-bold tabular-nums leading-none',
        align === 'right' && 'ml-auto',
        tone,
        className
      )}
    >
      <Icon strokeWidth={2.4} />
      <span>{label}</span>
    </Badge>
  );
}

const TRAFFIC_ZONE_CLASS = {
  within: {
    bar: 'bg-commercial-good',
    dot: 'bg-commercial-good',
    text: 'text-commercial-good'
  },
  near: {
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400'
  },
  above: {
    bar: 'bg-commercial-bad',
    dot: 'bg-commercial-bad',
    text: 'text-commercial-bad'
  }
} as const;

function SnapshotKpiCard({ item }: { item: SnapshotKpi }) {
  const visible = item.visible !== false;
  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <CardHeader className='gap-0.5 px-3 pb-2 pt-3'>
        <CardTitle className='text-[11px] font-bold uppercase tracking-wide text-muted-foreground'>
          {item.label}
        </CardTitle>
        <CardDescription className='text-[9px] leading-none'>{item.source}</CardDescription>
      </CardHeader>
      <CardContent className='px-3 pb-3'>
        <p className='font-mono text-[24px] font-bold tabular-nums leading-none tracking-tight text-foreground'>
          {visible ? item.value : HIDDEN_VALUE}
        </p>
        <div className='mt-2 grid grid-cols-2 gap-2 border-t border-border/40 pt-2'>
          <div className='min-w-0'>
            <p className='mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'>Δ vs 12W</p>
            <DeltaBadge
              value={visible ? item.deltaValue : null}
              label={visible ? item.delta : HIDDEN_VALUE}
              good={visible ? item.deltaGood : null}
              className='w-full justify-center'
            />
          </div>
          <div className='min-w-0 rounded-md border border-border/50 bg-muted/20 px-2 py-1'>
            <p className='text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'>12W avg</p>
            <p className='mt-0.5 truncate text-right font-mono text-[12px] font-bold tabular-nums text-foreground'>
              {visible ? item.avgLabel : HIDDEN_VALUE}
            </p>
          </div>
        </div>
        <p className={cn('mt-1 truncate text-[10px] font-medium', item.contextTone ?? 'text-muted-foreground')}>
          {visible ? item.context : 'Hidden from this view'}
        </p>
      </CardContent>
    </Card>
  );
}

function CommercialSnapshot({
  report,
  clDist,
  pvcDist,
  moInDist,
  visibility
}: {
  report: CommercialReportPayload;
  clDist: ReturnType<typeof buildThresholdDistribution>;
  pvcDist: ReturnType<typeof buildThresholdDistribution>;
  moInDist: ReturnType<typeof buildThresholdDistribution>;
  visibility: CommercialKpiVisibility;
}) {
  const cl = buildMetricContext(report, 'chlorine');
  const pvc = buildMetricContext(report, 'pvc');
  const moIn = buildMetricContext(report, 'input_moisture');
  const inputCurrent = volumeWeekTonnage(report, 'feed_volume');
  const inputAvg = volumeAvg12w(report, 'feed_volume');
  const inputDelta = inputCurrent != null && inputAvg != null ? inputCurrent - inputAvg : null;
  const clDelta = cl.currentWeek != null && cl.avg12Week != null ? cl.currentWeek - cl.avg12Week : null;
  const pvcDelta = pvc.currentWeek != null && pvc.avg12Week != null ? pvc.currentWeek - pvc.avg12Week : null;
  const moInDelta = moIn.currentWeek != null && moIn.avg12Week != null ? moIn.currentWeek - moIn.avg12Week : null;

  const items: SnapshotKpi[] = [
    {
      label: 'Input volume',
      source: 'Incoming feed processed',
      value: inputCurrent != null ? formatTonnes(inputCurrent) : '—',
      delta: inputDelta != null ? formatTonnesSigned(inputDelta) : '—',
      deltaValue: inputDelta,
      deltaGood: favourableDelta(inputDelta, false),
      avgLabel: inputAvg != null ? formatTonnes(inputAvg) : '—',
      context: inputDelta == null
        ? 'Recorded incoming mass flow'
        : inputDelta >= 0
          ? 'More feed processed vs prior 12W'
          : 'Less feed processed vs prior 12W',
      contextTone: qualityDeltaTone(inputDelta, false),
      visible: visibility.inputVolume
    },
    {
      label: 'Input PVC',
      source: 'Optical sorter feed mix',
      value: pvc.currentWeek != null ? `${pvc.currentWeek.toFixed(2)}%` : '—',
      delta: signedValue(pvcDelta, 2, ' pp'),
      deltaValue: pvcDelta,
      deltaGood: favourableDelta(pvcDelta, true),
      avgLabel: pvc.avg12Week != null ? `${pvc.avg12Week.toFixed(2)}%` : '—',
      context: `${pvcDist.abovePct}% above threshold 2.0%`,
      contextTone: pvcDist.abovePct > 0 ? ZONE_TEXT_CLASS.above : ZONE_TEXT_CLASS.within,
      visible: visibility.pvc
    },
    {
      label: 'Chlorine',
      source: 'Pre-pelletizer quality',
      value: cl.currentWeek != null ? `${cl.currentWeek.toFixed(2)}%` : '—',
      delta: signedValue(clDelta, 2, ' pp'),
      deltaValue: clDelta,
      deltaGood: favourableDelta(clDelta, true),
      avgLabel: cl.avg12Week != null ? `${cl.avg12Week.toFixed(2)}%` : '—',
      context: `${clDist.abovePct}% above threshold 1.2%`,
      contextTone: clDist.abovePct > 0 ? ZONE_TEXT_CLASS.above : ZONE_TEXT_CLASS.within,
      visible: visibility.chlorine
    },
    {
      label: 'Input moisture',
      source: 'Pre-dryer feed moisture',
      value: moIn.currentWeek != null ? `${moIn.currentWeek.toFixed(1)}%` : '—',
      delta: signedValue(moInDelta, 1, ' pp'),
      deltaValue: moInDelta,
      deltaGood: favourableDelta(moInDelta, true),
      avgLabel: moIn.avg12Week != null ? `${moIn.avg12Week.toFixed(1)}%` : '—',
      context: `${moInDist.abovePct}% above threshold 25%`,
      contextTone: moInDist.abovePct > 0 ? ZONE_TEXT_CLASS.above : ZONE_TEXT_CLASS.within,
      visible: visibility.inputMoisture
    }
  ];

  return (
    <section aria-labelledby='commercial-snapshot-title'>
      <div className='mb-1.5 flex items-baseline justify-between gap-3 px-0.5'>
        <h3 id='commercial-snapshot-title' className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
          Commercial snapshot
        </h3>
        <p className='text-[10px] text-muted-foreground'>This week vs prior 12 complete weeks</p>
      </div>
      <div className='commercial-snapshot-grid grid grid-cols-2 gap-2'>
        {items.map((item) => <SnapshotKpiCard key={item.label} item={item} />)}
      </div>
    </section>
  );
}

function SpecificationCoverageRow({
  label,
  basis,
  current,
  dist,
  hasNear = true,
  visible = true
}: {
  label: string;
  basis: string;
  current: string;
  dist: ReturnType<typeof buildThresholdDistribution>;
  hasNear?: boolean;
  visible?: boolean;
}) {
  const focus = dist.abovePct > 0
    ? { text: `${dist.abovePct}% above`, tone: TRAFFIC_ZONE_CLASS.above.text }
    : dist.nearPct > 0 && hasNear
      ? { text: `${dist.nearPct}% near`, tone: TRAFFIC_ZONE_CLASS.near.text }
      : { text: `${dist.withinPct}% within`, tone: TRAFFIC_ZONE_CLASS.within.text };

  return (
    <div className='grid grid-cols-[8.5rem_minmax(0,1fr)_5.5rem] items-center gap-2'>
      <div className='min-w-0'>
        <p className='truncate text-[10px] font-semibold text-foreground'>{label}</p>
        <p className='truncate text-[9px] text-muted-foreground'>{basis} · {visible ? current : HIDDEN_VALUE}</p>
      </div>
      <div className='flex h-2.5 min-w-0 overflow-hidden rounded-full bg-muted' aria-label={`${label} specification distribution`}>
        {visible && dist.withinPct > 0 ? (
          <span className={cn('h-full', TRAFFIC_ZONE_CLASS.within.bar)} style={{ width: `${dist.withinPct}%` }} />
        ) : null}
        {visible && hasNear && dist.nearPct > 0 ? (
          <span className={cn('h-full', TRAFFIC_ZONE_CLASS.near.bar)} style={{ width: `${dist.nearPct}%` }} />
        ) : null}
        {visible && dist.abovePct > 0 ? (
          <span className={cn('h-full', TRAFFIC_ZONE_CLASS.above.bar)} style={{ width: `${dist.abovePct}%` }} />
        ) : null}
      </div>
      <p className={cn('whitespace-nowrap text-right font-mono text-[10px] font-bold tabular-nums', focus.tone)}>
        {visible ? focus.text : HIDDEN_VALUE}
      </p>
    </div>
  );
}

function SpecificationCoverage({
  report,
  clDist,
  pvcDist,
  moInDist,
  visibility
}: {
  report: CommercialReportPayload;
  clDist: ReturnType<typeof buildThresholdDistribution>;
  pvcDist: ReturnType<typeof buildThresholdDistribution>;
  moInDist: ReturnType<typeof buildThresholdDistribution>;
  visibility: CommercialKpiVisibility;
}) {
  const cl = buildMetricContext(report, 'chlorine');
  const pvc = buildMetricContext(report, 'pvc');
  const moIn = buildMetricContext(report, 'input_moisture');

  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='gap-0.5 px-3 pb-2 pt-3'>
        <CardTitle className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>Specification coverage</CardTitle>
        <CardDescription className='text-[9px]'>Threshold exposure by validated sample</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-2.5 px-3 pb-3'>
        <SpecificationCoverageRow
          label='Input PVC'
          basis='Threshold 2%'
          current={pvc.currentWeek != null ? `avg ${pvc.currentWeek.toFixed(2)}%` : 'no average'}
          dist={pvcDist}
          hasNear={false}
          visible={visibility.pvc}
        />
        <SpecificationCoverageRow
          label='Chlorine'
          basis='Threshold 1.2%'
          current={cl.currentWeek != null ? `avg ${cl.currentWeek.toFixed(2)}%` : 'no average'}
          dist={clDist}
          visible={visibility.chlorine}
        />
        <SpecificationCoverageRow
          label='Input moisture'
          basis='Threshold 25%'
          current={moIn.currentWeek != null ? `avg ${moIn.currentWeek.toFixed(1)}%` : 'no average'}
          dist={moInDist}
          hasNear={false}
          visible={visibility.inputMoisture}
        />
        <div className='flex items-center gap-3 border-t border-border/40 pt-2 text-[9px] text-muted-foreground'>
          <span className='inline-flex items-center gap-1'><span className={cn('size-1.5 rounded-full', TRAFFIC_ZONE_CLASS.within.dot)} />Within</span>
          <span className='inline-flex items-center gap-1'><span className={cn('size-1.5 rounded-full', TRAFFIC_ZONE_CLASS.near.dot)} />Near</span>
          <span className='inline-flex items-center gap-1'><span className={cn('size-1.5 rounded-full', TRAFFIC_ZONE_CLASS.above.dot)} />Above</span>
        </div>
      </CardContent>
    </Card>
  );
}

function commercialMovementItems(report: CommercialReportPayload, visibility: CommercialKpiVisibility) {
  const specs = [
    {
      id: 'feed_volume',
      label: 'Input Volume',
      visible: visibility.inputVolume,
      lowerIsBetter: false,
      decimals: 0,
      unit: ' t'
    },
    {
      id: 'pvc',
      label: 'Input PVC',
      visible: visibility.pvc,
      lowerIsBetter: true,
      decimals: 2,
      unit: ' pp'
    },
    {
      id: 'chlorine',
      label: 'Chlorine',
      visible: visibility.chlorine,
      lowerIsBetter: true,
      decimals: 2,
      unit: ' pp'
    },
    {
      id: 'input_moisture',
      label: 'Input Moisture',
      visible: visibility.inputMoisture,
      lowerIsBetter: true,
      decimals: 1,
      unit: ' pp'
    }
  ] as const;

  return specs.map((spec) => {
    const comparison = report.comparisons.find((item) => item.id === spec.id);
    const pct = comparison?.difference_pct ?? 0;
    const diff = comparison?.difference;
    const formattedDiff = diff == null
      ? null
      : spec.unit.trim() === 't'
        ? formatTonnesSigned(diff)
        : `${diff > 0 ? '+' : ''}${diff.toFixed(spec.decimals)} pp`;
    const good = favourableDelta(diff ?? pct, spec.lowerIsBetter);
    return {
      label: spec.label,
      barClass: good == null
        ? 'bg-muted-foreground'
        : good
          ? 'bg-commercial-good'
          : 'bg-commercial-bad',
      toneClass: good == null
        ? THEME_SEMANTIC.neutral.text
        : good
          ? THEME_SEMANTIC.positive.text
          : THEME_SEMANTIC.negative.text,
      value: pct,
      display: `${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`,
      absDisplay: formattedDiff,
      good,
      visible: spec.visible
    };
  });
}

function KeyMovements({ report, visibility }: { report: CommercialReportPayload; visibility: CommercialKpiVisibility }) {
  const items = commercialMovementItems(report, visibility);
  const visibleItems = items.filter((item) => item.visible);
  const extent = Math.max(1, ...visibleItems.map((item) => Math.abs(item.value)));

  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='gap-0.5 px-3 pb-2 pt-3'>
        <CardTitle className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>Key movements</CardTitle>
        <CardDescription className='text-[9px]'>Commercial KPI change: this week vs prior 12W average</CardDescription>
      </CardHeader>
      <CardContent className='px-3 pb-3'>
        <div className='mb-1 grid grid-cols-[7.25rem_minmax(0,1fr)_8.25rem] items-center gap-2 text-[8px] uppercase tracking-wide text-muted-foreground'>
          <span>Metric</span>
          <span>Movement</span>
          <span className='text-right'>Δ vs 12W</span>
        </div>
        <div className='flex flex-col gap-2'>
        {items.map((item) => {
          const width = item.visible ? Math.max(2, (Math.abs(item.value) / extent) * 100) : 0;
          return (
            <div key={item.label} className='grid h-5 grid-cols-[7.25rem_minmax(0,1fr)_8.25rem] items-center gap-2'>
              <p className='truncate text-[10px] font-semibold text-foreground'>{item.label}</p>
              <div className='h-2 overflow-hidden rounded-full bg-muted/70'>
                {item.visible ? (
                  <span
                    className={cn('block h-full rounded-full', item.barClass)}
                    style={{ width: `${width}%` }}
                  />
                ) : null}
              </div>
              <div className='flex items-baseline justify-end gap-1.5 whitespace-nowrap font-mono tabular-nums'>
                <span className={cn('text-[10px] font-bold', item.toneClass)}>{item.visible ? item.display : HIDDEN_VALUE}</span>
                {item.visible && item.absDisplay ? (
                  <span className='text-[9px] text-muted-foreground'>{item.absDisplay}</span>
                ) : null}
              </div>
            </div>
          );
        })}
        </div>
        <div className='mt-2 flex items-center gap-3 border-t border-border/40 pt-1.5 text-[9px] text-muted-foreground'>
          <span className='inline-flex items-center gap-1'><span className='size-1.5 rounded-full bg-commercial-good' />Better</span>
          <span className='inline-flex items-center gap-1'><span className='size-1.5 rounded-full bg-commercial-bad' />Worse</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CommercialDecisionLayer({
  report,
  clDist,
  pvcDist,
  moInDist,
  visibility
}: {
  report: CommercialReportPayload;
  clDist: ReturnType<typeof buildThresholdDistribution>;
  pvcDist: ReturnType<typeof buildThresholdDistribution>;
  moInDist: ReturnType<typeof buildThresholdDistribution>;
  visibility: CommercialKpiVisibility;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <CommercialSnapshot report={report} clDist={clDist} pvcDist={pvcDist} moInDist={moInDist} visibility={visibility} />
      <div className='commercial-decision-split grid grid-cols-1 items-stretch gap-2'>
        <SpecificationCoverage report={report} clDist={clDist} pvcDist={pvcDist} moInDist={moInDist} visibility={visibility} />
        <KeyMovements report={report} visibility={visibility} />
      </div>
    </div>
  );
}

function ReportMethodNote({ report }: { report: CommercialReportPayload }) {
  const startHour = getChartBucketStartHour(report);
  const dailyStartHour = getDailyBucketStartHour(report);
  const note = [
    `W${report.week_number ?? '—'} is compared with the prior 12 complete weeks`,
    'trend panels show prior 12W plus this week',
    `${formatWeekBoundaryLabel(startHour)}; chart buckets use ${formatChartShiftLabel(startHour)}; daily trends use ${formatDailyBucketLabel(dailyStartHour)}`
  ].join(' · ');

  return (
    <section className='flex items-start gap-2 rounded-lg border border-dashed border-border/50 bg-muted/10 px-3 py-1.5 shadow-none'>
      <h3 className='shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground'>Method note</h3>
      <p className='min-w-0 text-[10px] leading-snug text-muted-foreground'>{note}</p>
    </section>
  );
}

function formatReportCreatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ReportCreatedFooter({ report }: { report: CommercialReportPayload }) {
  return (
    <p className='-mt-1 px-1 text-right text-[8px] leading-none text-muted-foreground/55 print:text-[7px]'>
      Created {formatReportCreatedAt(report.generated_at)} Amsterdam time
    </p>
  );
}

export function CommercialReportGrid({
  report,
  visibility = DEFAULT_COMMERCIAL_KPI_VISIBILITY
}: {
  report: CommercialReportPayload;
  visibility?: CommercialKpiVisibility;
}) {
  const clCtx = buildMetricContext(report, 'chlorine');
  const pvcCtx = buildMetricContext(report, 'pvc');
  const clDaily = getThisWeekDailyValues(report, 'chlorine');
  const clDist = thresholdDistributionFromExposure(
    report,
    'chlorine',
    buildThresholdDistribution(clDaily, COMMERCIAL_CHLORINE_ZONES.okMax, COMMERCIAL_CHLORINE_ZONES.warnMax, 0, 'chlorine')
  );
  const pvcDaily = getThisWeekDailyValues(report, 'pvc');
  const pvcDist = thresholdDistributionFromExposure(
    report,
    'pvc',
    buildThresholdDistribution(pvcDaily, COMMERCIAL_PVC_ZONES.okMax, COMMERCIAL_PVC_ZONES.warnMax, 0, 'input PVC')
  );
  const moInDaily = getThisWeekDailyValues(report, 'input_moisture');
  const moInDist = thresholdDistributionFromExposure(
    report,
    'input_moisture',
    buildThresholdDistribution(
      moInDaily,
      COMMERCIAL_INPUT_MOISTURE_ZONES.okMax,
      COMMERCIAL_INPUT_MOISTURE_ZONES.warnMax,
      0,
      'input moisture'
    )
  );
  const moOutDaily = getThisWeekDailyValues(report, 'output_moisture');
  const moOutDist = buildThresholdDistribution(
    moOutDaily,
    COMMERCIAL_OUTPUT_MOISTURE_ZONES.okMax,
    COMMERCIAL_OUTPUT_MOISTURE_ZONES.warnMax,
    0,
    'output moisture'
  );

  return (
    <div className='commercial-report-body flex w-full flex-col gap-2 bg-transparent p-1'>
      <CommercialDecisionLayer
        report={report}
        clDist={clDist}
        pvcDist={pvcDist}
        moInDist={moInDist}
        visibility={visibility}
      />

      <div className='flex items-center gap-3 px-0.5 pt-1'>
        <p className='shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground'>Detail &amp; evidence</p>
        <Separator className='flex-1' />
      </div>

      <div className='commercial-metrics-block flex flex-col gap-1'>
        <MetricColumnHeaderRow />

        <VolumeThroughputCard report={report} visible={visibility.inputVolume} />

        <QualityDistributionCard
          title='Input PVC'
          sub='Feed composition'
          report={report}
          metricId='pvc'
          ctx={pvcCtx}
          thresholdZones={COMMERCIAL_PVC_ZONES}
          dist={pvcDist}
          hasNearZone={false}
          legend={{ limit: '2.0%', within: '<2.0%' }}
          refLines={[{ value: COMMERCIAL_PVC_ZONES.warnMax, stroke: KPI_THRESHOLD_COLORS.above }]}
          decimals={2}
          trendWindow='daily-trend'
          visible={visibility.pvc}
        />

        <QualityDistributionCard
          title='Chlorine'
          sub='Pre-pelletizer quality'
          report={report}
          metricId='chlorine'
          ctx={clCtx}
          thresholdZones={COMMERCIAL_CHLORINE_ZONES}
          dist={clDist}
          legend={{ limit: '1.2%', near: '0.8–1.2%', within: '≤0.8%' }}
          refLines={[
            { value: COMMERCIAL_CHLORINE_ZONES.okMax, stroke: KPI_THRESHOLD_COLORS.near },
            { value: COMMERCIAL_CHLORINE_ZONES.warnMax, stroke: KPI_THRESHOLD_COLORS.above }
          ]}
          decimals={2}
          trendWindow='daily-trend'
          visible={visibility.chlorine}
        />

        <MoistureDistributionCard
          report={report}
          moInDist={moInDist}
          moOutDist={moOutDist}
          showInput={visibility.inputMoisture}
          showOutput={visibility.outputMoisture}
        />

        <FeedstockPanel report={report} visible={visibility.composition} />
      </div>

      <ReportMethodNote report={report} />
      <ReportCreatedFooter report={report} />
    </div>
  );
}
