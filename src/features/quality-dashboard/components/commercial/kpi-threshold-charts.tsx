'use client';

import type { CommercialReportPayload } from '@/features/quality-dashboard/api/types';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { getTrendBarData, getDailyTrendBarData } from '@/features/quality-dashboard/lib/executive-copy';
import {
  COMPOSITION_SHARES_NOTE,
  type CompositionAreaPoint,
  type DualMetricBarPoint,
  FEEDSTOCK_STACK_KEYS,
  getThisWeekDailyBarData,
} from '@/features/quality-dashboard/lib/weekly-context';
import {
  barFillForZones,
  CARD_TONE_STYLES,
  CHART_THEME,
  COMMERCIAL_INPUT_MOISTURE_ZONES,
  COMMERCIAL_OUTPUT_MOISTURE_ZONES,
  diffToneClass,
  kpiThresholdChartConfig,
  KPI_THRESHOLD_COLORS,
  STATUS_BADGE_STYLES,
  THEME_SEMANTIC,
  type ThresholdZones,
  ZONE_DOT_CLASS,
  ZONE_TEXT_CLASS
} from '@/features/quality-dashboard/lib/kpi-threshold-colors';
import type { ThresholdDistribution } from '@/features/quality-dashboard/lib/weekly-context';
import {
  feedstockChartConfig,
  moistureChartConfig,
  throughputChartConfig
} from '@/features/quality-dashboard/lib/theme';
import { cn } from '@/lib/utils';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  Rectangle,
  XAxis,
  YAxis
} from 'recharts';

const EMPTY_SHIFT_BAR_HEIGHT = 6;

type ShiftBarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number;
  radius?: number | [number, number, number, number];
  payload?: Record<string, unknown>;
};

function shiftSeriesHasData(payload: Record<string, unknown> | undefined, key?: 'primary' | 'secondary') {
  if (!payload) return true;
  if (key === 'primary') return payload.primaryHasData !== false;
  if (key === 'secondary') return payload.secondaryHasData !== false;
  return payload.hasData !== false;
}

function renderShiftBarShape(props: ShiftBarShapeProps, seriesKey?: 'primary' | 'secondary') {
  const { x = 0, y = 0, width = 0, height = 0, fill, fillOpacity, radius, payload } = props;
  if (!shiftSeriesHasData(payload, seriesKey)) {
    return (
      <rect
        x={x}
        y={y - EMPTY_SHIFT_BAR_HEIGHT}
        width={width}
        height={EMPTY_SHIFT_BAR_HEIGHT}
        fill='var(--muted-foreground)'
        fillOpacity={0.12}
        stroke='var(--border)'
        strokeDasharray='3 2'
        rx={2}
      />
    );
  }
  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      fillOpacity={fillOpacity}
      radius={radius}
    />
  );
}

function formatShiftTooltipValue(
  value: number,
  payload: Record<string, unknown> | undefined,
  seriesKey: 'primary' | 'secondary' | 'single',
  formatValue: (value: number) => string
) {
  const hasData =
    seriesKey === 'primary'
      ? shiftSeriesHasData(payload, 'primary')
      : seriesKey === 'secondary'
        ? shiftSeriesHasData(payload, 'secondary')
        : shiftSeriesHasData(payload);
  if (!hasData) {
    return (
      <div className='flex flex-1 justify-between gap-4 w-full'>
        <span className='text-muted-foreground'>Value</span>
        <span className='font-medium text-muted-foreground'>No data</span>
      </div>
    );
  }
  return (
    <div className='flex flex-1 justify-between gap-4 w-full'>
      <span className='text-muted-foreground'>Value</span>
      <span className='font-mono font-medium text-foreground'>{formatValue(value)}</span>
    </div>
  );
}

function MissingShiftOverlay({
  data,
  bottomOffset = 0,
  leftPad = CHART_Y_AXIS_WIDTH,
  rightPad = 4
}: {
  data: Array<{ idx?: number; hasData?: boolean }>;
  bottomOffset?: number;
  leftPad?: number;
  rightPad?: number;
}) {
  if (!data.length || !data.some((row) => row.hasData === false)) return null;

  return (
    <>
      {data.map((row, index) => {
        if (row.hasData !== false) return null;
        return (
          <div
            key={row.idx ?? index}
            aria-hidden='true'
            className='pointer-events-none absolute top-0 z-[1] border border-dashed border-muted-foreground/25 bg-muted/10'
            style={{
              bottom: bottomOffset,
              left: `calc(${leftPad}px + (100% - ${leftPad + rightPad}px) * ${index / data.length})`,
              width: `calc((100% - ${leftPad + rightPad}px) * ${1 / data.length})`
            }}
          />
        );
      })}
    </>
  );
}

type RefLine = { value: number; stroke: string; dash?: string };
export type SummaryStatRow = {
  key: string;
  label: string;
  value: string;
  toneClass?: string;
  delta?: string | null;
  deltaToneClass?: string;
};

type TrendDatum = { isSelectedWeek?: boolean };
type DualChartRow = {
  idx?: number;
  label?: string;
  weekLabel?: string;
  timeLabel?: string;
} & Record<string, string | number | boolean | undefined> & TrendDatum;

function trendOpacity(row: TrendDatum, barWindow: 'trend' | 'week' | 'daily-trend') {
  void row;
  void barWindow;
  return 1;
}

function selectedWeekOverlayMetrics(
  data: Array<{ idx?: number; isSelectedWeek?: boolean }>,
  barWindow: 'trend' | 'week' | 'daily-trend'
) {
  if (barWindow === 'week') return null;
  const selectedStart = data.findIndex((d) => d.isSelectedWeek === true);
  if (selectedStart < 0 || !data.length) return null;
  let selectedEnd = selectedStart;
  for (let i = selectedStart + 1; i < data.length; i += 1) {
    if (data[i].isSelectedWeek !== true) break;
    selectedEnd = i;
  }

  return {
    left: selectedStart / data.length,
    width: (selectedEnd - selectedStart + 1) / data.length
  };
}

function SelectedWeekOverlay({
  metrics,
  bottomOffset = 0,
  leftPad = CHART_Y_AXIS_WIDTH,
  rightPad = 4
}: {
  metrics: { left: number; width: number } | null;
  bottomOffset?: number;
  leftPad?: number;
  rightPad?: number;
}) {
  if (!metrics) return null;
  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute top-0 z-10 border-l border-dashed border-muted-foreground/30 bg-muted/20 dark:bg-muted/10'
      style={{
        bottom: bottomOffset,
        left: `calc(${leftPad}px + (100% - ${leftPad + rightPad}px) * ${metrics.left})`,
        width: `calc((100% - ${leftPad + rightPad}px) * ${metrics.width})`
      }}
    />
  );
}

function rollingAverageValues<T extends Record<string, unknown>>(
  data: readonly T[],
  sourceKey: string,
  windowSize = 7
): Array<number | null> {
  return data.map((row, idx) => {
    const start = Math.max(0, idx - windowSize + 1);
    const values = data
      .slice(start, idx + 1)
      .map((item) => Number(item[sourceKey]))
      .filter((value) => Number.isFinite(value));
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  });
}

function RollingAverageOverlay<T extends Record<string, unknown>>({
  data,
  valueKey,
  yMax,
  bottomOffset = 18,
  leftPad = CHART_Y_AXIS_WIDTH,
  rightPad = 4
}: {
  data: readonly T[];
  valueKey: string;
  yMax: number;
  bottomOffset?: number;
  leftPad?: number;
  rightPad?: number;
}) {
  if (data.length < 2 || yMax <= 0) return null;
  const values = rollingAverageValues(data, valueKey);
  const points = values
    .map((value, idx) => {
      if (value == null || !Number.isFinite(value)) return null;
      const x = ((idx + 0.5) / data.length) * 1000;
      const y = Math.max(0, Math.min(1000, (1 - value / yMax) * 1000));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((point): point is string => point != null)
    .join(' ');

  if (!points) return null;

  return (
    <svg
      aria-hidden='true'
      className='pointer-events-none absolute top-0 z-20 overflow-hidden'
      preserveAspectRatio='none'
      viewBox='0 0 1000 1000'
      style={{
        left: leftPad,
        width: `calc(100% - ${leftPad + rightPad}px)`,
        height: `calc(100% - ${bottomOffset}px)`
      }}
    >
      <polyline
        points={points}
        fill='none'
        stroke='var(--foreground)'
        strokeOpacity={0.36}
        strokeWidth={1.5}
        strokeDasharray='4 3'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

/** Shared bar sizing — keeps KPI + dual charts visually consistent. */
function getBarDensity(
  barCount: number,
  barWindow?: 'trend' | 'week' | 'daily-trend'
) {
  if (barWindow === 'week') {
    return {
      barCategoryGap: '12%',
      maxBarSize: 10,
      radius: 2,
      tickFontSize: 9
    } as const;
  }

  if (barWindow === 'daily-trend') {
    return {
      barCategoryGap: '8%',
      maxBarSize: 8,
      radius: 2,
      tickFontSize: 9
    } as const;
  }

  if (barWindow === 'trend') {
    return {
      barCategoryGap: '12%',
      maxBarSize: 10,
      radius: 2,
      tickFontSize: 9
    } as const;
  }

  return {
    barCategoryGap: barCount > 60 ? '8%' : barCount > 20 ? '12%' : '15%',
    maxBarSize: barCount > 60 ? 8 : barCount > 20 ? 10 : 18,
    radius: barCount > 20 ? 2 : 4,
    tickFontSize: barCount > 20 ? 9 : 11
  } as const;
}

const CHART_AXIS_MARGIN = { top: 2, right: 4, bottom: 16, left: 0 } as const;
const CHART_AXIS_MARGIN_OVERLAP = { top: 2, right: 4, bottom: 0, left: 0 } as const;
const CHART_Y_AXIS_WIDTH = 34;

function weekLabelAtTick(
  data: Array<{ idx?: number; weekLabel?: string }>,
  value: unknown
) {
  const n = Number(value);
  const byIdx = data.find((d) => d.idx === n);
  if (byIdx?.weekLabel) return String(byIdx.weekLabel);
  if (Number.isInteger(n) && n >= 0 && n < data.length && data[n]?.weekLabel) {
    return String(data[n].weekLabel);
  }
  return '';
}

function chartXAxisTicks(
  data: Array<{ idx?: number; weekLabel?: string }>,
  barWindow: 'trend' | 'week' | 'daily-trend'
) {
  if (barWindow === 'week' && data.length > 1) {
    return [data[0].idx ?? 0, data[data.length - 1].idx ?? data.length - 1];
  }
  const weekTicks = data
    .map((d, i) => (d.weekLabel ? (d.idx ?? i) : null))
    .filter((v): v is number => v != null);
  return weekTicks.length ? weekTicks : undefined;
}

function chartXAxisProps(
  data: Array<{ idx?: number; weekLabel?: string }>,
  barWindow: 'trend' | 'week' | 'daily-trend',
  density: ReturnType<typeof getBarDensity>,
  xAxisId?: string
) {
  return {
    ...(xAxisId ? { xAxisId } : {}),
    dataKey: 'idx' as const,
    tickLine: false as const,
    axisLine: false as const,
    tickMargin: 6,
    height: 24,
    minTickGap: 0,
    tick: { fontSize: density.tickFontSize },
    ticks: chartXAxisTicks(data, barWindow),
    interval: 0 as const,
    tickFormatter: (value: unknown) => weekLabelAtTick(data, value)
  };
}

function chartBottomLabelItems(
  data: Array<{ idx?: number; weekLabel?: string }>,
  barWindow: 'trend' | 'week' | 'daily-trend'
) {
  if (barWindow === 'week' && data.length > 1) {
    const first = data[0]?.weekLabel ?? '';
    const last = data[data.length - 1]?.weekLabel ?? '';
    const out: { at: number; text: string }[] = [];
    if (first) out.push({ at: 0, text: first });
    if (last && data.length > 1) out.push({ at: data.length - 1, text: last });
    return out;
  }
  return data
    .map((d, i) => (d.weekLabel ? { at: d.idx ?? i, text: String(d.weekLabel) } : null))
    .filter((v): v is { at: number; text: string } => v != null);
}

function ChartBottomLabels({
  data,
  barWindow,
  tickFontSize
}: {
  data: Array<{ idx?: number; weekLabel?: string }>;
  barWindow: 'trend' | 'week' | 'daily-trend';
  tickFontSize: number;
}) {
  const items = chartBottomLabelItems(data, barWindow);
  if (!items.length || data.length < 2) return null;

  const maxIdx = Math.max(
    ...data.map((d, i) => d.idx ?? i),
    data.length - 1
  );

  return (
    <div
      className='relative mt-0.5 h-4 shrink-0 w-full text-muted-foreground'
      style={{
        paddingLeft: CHART_Y_AXIS_WIDTH,
        paddingRight: 4,
        fontSize: tickFontSize
      }}
    >
      {items.map((item) => {
        const pct = maxIdx > 0 ? item.at / maxIdx : 0;
        return (
          <span
            key={`${item.at}-${item.text}`}
            className='absolute bottom-0 -translate-x-1/2 whitespace-nowrap'
            style={{ left: `calc(${CHART_Y_AXIS_WIDTH}px + (100% - ${CHART_Y_AXIS_WIDTH + 4}px) * ${pct})` }}
          >
            {item.text}
          </span>
        );
      })}
    </div>
  );
}

/** Scale-only axis — week labels rendered via ChartBottomLabels. */
function overlapBaseXAxis(xDataKey: string) {
  return {
    xAxisId: 'overlap-base' as const,
    dataKey: xDataKey,
    tick: false as const,
    tickLine: false as const,
    axisLine: false as const,
    height: 1
  };
}

function chartYMax(values: number[], refMax: number) {
  const finite = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (!finite.length) {
    return Math.max(refMax, 0.001) * 1.06;
  }

  const sorted = [...finite].sort((a, b) => a - b);
  const rawMax = Math.max(...finite, refMax);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Index] ?? rawMax;

  // One bad sensor day (e.g. weekly total in a daily bucket) must not flatten the chart.
  const effectiveMax = rawMax > p95 * 2.5 ? Math.max(p95 * 1.15, refMax) : rawMax;
  return Math.max(effectiveMax, refMax, 0.001) * 1.06;
}

function chartYTicks(yMax: number) {
  return [0, yMax / 2, yMax];
}

const trendChartConfig = {
  value: { label: 'Value', color: 'var(--primary)' }
} satisfies ChartConfig;

function exposureDiffTone(
  ppDiff: number,
  zone: 'above' | 'near' | 'within'
): string {
  if (ppDiff === 0) return THEME_SEMANTIC.neutral.text;
  const worse = zone === 'within' ? ppDiff < 0 : ppDiff > 0;
  return worse ? THEME_SEMANTIC.negative.text : THEME_SEMANTIC.positive.text;
}

export function ThresholdDonutChart({ dist }: { dist: ThresholdDistribution }) {
  const segments = [
    { key: 'within', label: 'Within', value: dist.withinPct },
    { key: 'near', label: 'Near', value: dist.nearPct },
    { key: 'above', label: 'Above', value: dist.abovePct }
  ].filter((s) => s.value > 0);
  const pieData =
    segments.length > 0
      ? segments
      : [{ key: 'within', label: 'Within', value: 100 }];

  return (
    <div className='relative mx-auto h-[72px] w-[72px] shrink-0'>
      <ChartContainer
        config={kpiThresholdChartConfig}
        className='aspect-square h-full w-full [&_.recharts-pie-label-text]:fill-foreground'
      >
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel nameKey='label' />} />
          <Pie
            data={pieData}
            dataKey='value'
            nameKey='label'
            innerRadius={20}
            outerRadius={32}
            strokeWidth={2}
            stroke='var(--background)'
          >
            {pieData.map((entry) => (
              <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
        <span
          className={cn('text-[14px] font-bold leading-none tabular-nums', ZONE_TEXT_CLASS.above)}
        >
          {dist.abovePct}%
        </span>
        <span className='mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
          Above
        </span>
      </div>
    </div>
  );
}

export function ReadingDistributionSummary({
  dist,
  hasNearZone = true,
  baselineDist,
  title = 'Threshold exposure',
  summaryRows
}: {
  dist: ThresholdDistribution;
  hasNearZone?: boolean;
  baselineDist?: ThresholdDistribution | null;
  title?: string;
  summaryRows?: SummaryStatRow[];
}) {
  const rows: {
    key: 'above' | 'near' | 'within';
    label: string;
    pct: number;
    tone: 'above' | 'near' | 'within';
    baselinePct?: number;
  }[] = [
    {
      key: 'above',
      label: 'Above threshold',
      pct: dist.abovePct,
      tone: 'above',
      baselinePct: baselineDist?.abovePct
    },
    ...(hasNearZone
      ? [
          {
            key: 'near' as const,
            label: 'Near threshold',
            pct: dist.nearPct,
            tone: 'near' as const,
            baselinePct: baselineDist?.nearPct
          }
        ]
      : []),
    {
      key: 'within',
      label: 'Within threshold',
      pct: dist.withinPct,
      tone: 'within',
      baselinePct: baselineDist?.withinPct
    }
  ];

  const toneClass = ZONE_TEXT_CLASS;
  if (summaryRows?.length) {
    return (
      <div className='flex w-[15rem] shrink-0 self-start flex-col border-l border-border/40 py-1 pl-3'>
        <div className='mb-2'>
          <p className='text-xs font-bold uppercase tracking-wide text-muted-foreground'>{title}</p>
        </div>
        <ul className='grid flex-1 grid-cols-2'>
          {summaryRows.map((row, index) => (
            <li
              key={row.key}
              className={cn(
                'min-w-0',
                index % 2 === 0 ? 'pr-3' : 'border-l border-border/40 pl-3',
                index < 2 ? 'pb-2' : 'border-t border-border/40 pt-2'
              )}
            >
              <p className='truncate text-[10px] leading-none text-muted-foreground'>{row.label}</p>
              <p className={cn('mt-1 whitespace-nowrap font-mono text-[17px] font-bold tabular-nums leading-none tracking-tight', row.toneClass ?? 'text-foreground')}>
                {row.value}
              </p>
              <p className={cn('mt-1 min-h-5 whitespace-nowrap text-right font-mono text-[10px] font-semibold tabular-nums', row.deltaToneClass ?? 'text-muted-foreground')}>
                {row.delta ?? null}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className='flex w-[15rem] shrink-0 self-start flex-col border-l border-border/40 py-1 pl-3'>
      <div className='mb-2'>
        <p className='text-xs font-bold uppercase tracking-wide text-muted-foreground'>{title}</p>
      </div>
      <ul className='grid flex-1 grid-cols-2'>
        {rows.map((row, index) => {
          const ppDiff = row.baselinePct == null ? null : row.pct - row.baselinePct;
          return (
            <li
              key={row.key}
              className={cn(
                'min-w-0',
                index % 2 === 0 ? 'pr-3' : 'border-l border-border/40 pl-3',
                index < 2 ? 'pb-2' : 'border-t border-border/40 pt-2'
              )}
            >
              <p className='truncate text-[10px] leading-none text-muted-foreground'>{row.label}</p>
              <p className={cn('mt-1 whitespace-nowrap font-mono text-[17px] font-bold tabular-nums leading-none tracking-tight', toneClass[row.tone])}>
                {row.pct}%
              </p>
              <div className='mt-1 flex min-h-5 items-start justify-end gap-1'>
                {ppDiff != null ? (
                  <p className={cn('whitespace-nowrap font-mono text-[9px] font-semibold tabular-nums', exposureDiffTone(ppDiff, row.tone))}>
                    {ppDiff > 0 ? '+' : ''}{ppDiff} pp
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function KpiCardFooter({
  dist,
  legend,
  showPct = true
}: {
  dist?: ThresholdDistribution;
  legend?: { limit?: string; near?: string; within?: string; above?: string };
  showPct?: boolean;
}) {
  if (!dist && !legend) return null;

  type ZoneKey = 'within' | 'near' | 'above';
  const zones: { key: ZoneKey; threshold?: string; pct: number }[] = [];

  if (legend?.within && dist && dist.withinPct > 0) {
    zones.push({ key: 'within', threshold: legend.within, pct: dist.withinPct });
  }
  if (legend?.near && dist && dist.nearPct > 0) {
    zones.push({ key: 'near', threshold: legend.near, pct: dist.nearPct });
  }
  const aboveThreshold =
    legend?.above ??
    (legend?.limit ? (legend.near ? `>${legend.limit}` : `≥${legend.limit}`) : undefined);
  if (aboveThreshold && dist && dist.abovePct > 0) {
    zones.push({ key: 'above', threshold: aboveThreshold, pct: dist.abovePct });
  }

  const zoneLabels: Record<ZoneKey, string> = {
    within: 'Within',
    near: 'Near',
    above: 'Above'
  };

  if (!zones.length) return null;

  return (
    <div className='flex flex-nowrap items-center justify-start gap-x-1.5 overflow-hidden text-[10px] leading-none'>
      {zones.map((z, i) => (
        <span key={z.key} className='inline-flex shrink-0 items-center gap-1 whitespace-nowrap'>
          {i > 0 ? <span className='text-muted-foreground/35'>·</span> : null}
          <span
            className={cn('size-1.5 shrink-0 rounded-full', ZONE_DOT_CLASS[z.key])}
          />
          <span className='text-muted-foreground'>
            {zoneLabels[z.key]}
            {z.threshold ? ` ${z.threshold}` : ''}
            {showPct ? (
              <>
                {': '}
                <span className={cn('font-bold tabular-nums', ZONE_TEXT_CLASS[z.key])}>
                  {z.pct}%
                </span>
              </>
            ) : null}
          </span>
        </span>
      ))}
    </div>
  );
}

export function DistributionHistogramChart({
  data,
  refLines = [],
  height = 132,
  fillHeight = false
}: {
  data: { x: number; label: string; timeLabel?: string; pct: number; fill: string }[];
  refLines?: { x: number; stroke: string; label: string }[];
  height?: number;
  fillHeight?: boolean;
}) {
  const emptyClass = fillHeight
    ? 'flex h-full min-h-[72px] items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground'
    : 'flex items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground';

  if (!data.length) {
    return (
      <div className={emptyClass} style={fillHeight ? undefined : { height }}>
        No data
      </div>
    );
  }

  const xMax = Math.max(...data.map((d) => d.x));

  return (
    <ChartContainer
      config={kpiThresholdChartConfig}
      className={cn(
        'aspect-auto w-full [&_.recharts-cartesian-grid_line]:stroke-border/40',
        fillHeight && 'h-full min-h-[72px]'
      )}
      style={fillHeight ? undefined : { height }}
    >
      <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: -18 }} barCategoryGap='10%'>
        <CartesianGrid strokeDasharray='2 2' vertical={false} stroke='var(--border)' />
        <XAxis
          dataKey='x'
          type='number'
          domain={[-0.5, xMax + 0.5]}
          ticks={data.map((d) => d.x)}
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          tickFormatter={(x: number) => data.find((d) => d.x === x)?.label ?? ''}
        />
        <YAxis
          width={26}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          unit='%'
          allowDecimals={false}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as (typeof data)[number] | undefined;
            if (!row) return null;
            return (
              <div className='border-border/50 bg-background rounded-lg border px-2 py-1 text-xs shadow-xl'>
                <p className='text-muted-foreground mb-0.5'>{row.timeLabel || row.label}</p>
                <p className='font-mono font-medium tabular-nums'>{row.pct}%</p>
              </div>
            );
          }}
        />
        {refLines.map((line) => (
          <ReferenceLine
            key={`${line.x}-${line.label}`}
            x={line.x}
            stroke={line.stroke}
            strokeDasharray='4 4'
            strokeWidth={1.5}
            label={{
              value: line.label,
              position: 'top',
              fontSize: 11,
              fill: line.stroke
            }}
          />
        ))}
        <Bar dataKey='pct' radius={[2, 2, 0, 0]} maxBarSize={40} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.label} fill={row.fill} />
          ))}
          <LabelList
            dataKey='pct'
            position='top'
            formatter={(v: any) => (v > 0 ? `${v}%` : '')}
            style={{ fontSize: 11, fontWeight: 600, fill: 'var(--foreground)' }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function KpiTrendChart({
  report,
  metricId,
  refLines = [],
  thresholdZones,
  decimals = 2,
  height = 76,
  fillHeight = false,
  window: barWindow = 'trend'
}: {
  report: CommercialReportPayload;
  metricId: string;
  refLines?: RefLine[];
  thresholdZones?: ThresholdZones;
  decimals?: number;
  height?: number;
  fillHeight?: boolean;
  window?: 'trend' | 'week' | 'daily-trend';
}) {
  const data = barWindow === 'daily-trend'
    ? getDailyTrendBarData(report, metricId)
    : barWindow === 'week'
    ? getThisWeekDailyBarData(report, metricId)
    : getTrendBarData(report, metricId);
  const emptyClass = fillHeight
    ? 'flex h-full min-h-[72px] items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground'
    : 'flex items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground';

  if (!data.length) {
    return (
      <div className={emptyClass} style={fillHeight ? undefined : { height }}>
        No data
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const refMax = refLines.length ? Math.max(...refLines.map((l) => l.value)) : 0;
  const yMax = chartYMax(values, refMax);
  const useThresholdColors = Boolean(thresholdZones);
  const chartConfig = useThresholdColors ? kpiThresholdChartConfig : trendChartConfig;
  const density = getBarDensity(data.length, barWindow);
  const useBottomLabels =
    fillHeight && (barWindow === 'daily-trend' || barWindow === 'week');
  const labelData = data.map((d) => ({ idx: d.idx, weekLabel: d.weekLabel }));
  const selectedOverlay = selectedWeekOverlayMetrics(data, barWindow);
  const showRollingAverage = barWindow === 'daily-trend' && metricId !== 'feed_volume';

  return (
    <div
      className={cn(
        'relative flex w-full flex-col',
        fillHeight && 'h-full min-h-[72px]'
      )}
      style={fillHeight ? undefined : { height }}
    >
      <ChartContainer
        config={chartConfig}
        className={cn(
          'aspect-auto w-full [&_.recharts-cartesian-grid_line]:stroke-border/40',
          fillHeight && 'min-h-0 flex-1'
        )}
        style={fillHeight ? undefined : { height }}
      >
      <BarChart
        accessibilityLayer
        data={data}
        margin={useBottomLabels ? CHART_AXIS_MARGIN_OVERLAP : CHART_AXIS_MARGIN}
        barCategoryGap={density.barCategoryGap}
        barGap={0}
      >
        {useBottomLabels ? (
          <>
            <XAxis {...overlapBaseXAxis('idx')} />
            <CartesianGrid vertical={false} />
          </>
        ) : (
          <>
            <CartesianGrid vertical={false} />
            <XAxis {...chartXAxisProps(data, barWindow, density)} />
          </>
        )}
        <YAxis
          width={CHART_Y_AXIS_WIDTH}
          domain={[0, yMax]}
          ticks={chartYTicks(yMax)}
          allowDecimals
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => Number(v).toFixed(decimals > 2 ? 2 : decimals)}
        />
        <ChartTooltip
          cursor={useThresholdColors ? false : { fill: 'var(--primary)', opacity: 0.1 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload;
                return point?.timeLabel || point?.weekLabel || '';
              }}
                formatter={(value, name, item) => {
                  const payload = item?.payload as Record<string, unknown> | undefined;
                  if (barWindow === 'week') {
                    return formatShiftTooltipValue(Number(value), payload, 'single', (v) => {
                      const unit = metricId === 'feed_volume' ? ' t' : '%';
                      return `${v.toFixed(decimals)}${unit}`;
                    });
                  }
                  const unit = metricId === 'feed_volume' ? ' t' : '%';
                  return (
                    <div className='flex flex-1 justify-between gap-4 w-full'>
                      <span className='text-muted-foreground'>Value</span>
                      <span className='font-mono font-medium text-foreground'>
                        {Number(value).toFixed(decimals)}{unit}
                      </span>
                    </div>
                  );
                }}
            />
          }
        />
        {refLines.map((line, i) => (
          <ReferenceLine
            key={i}
            {...(useBottomLabels ? { xAxisId: 'overlap-base' as const } : {})}
            y={line.value}
            stroke={line.stroke}
            strokeDasharray={line.dash ?? '5 4'}
            strokeWidth={1.5}
          />
        ))}
        {useThresholdColors ? (
          <Bar
            {...(useBottomLabels ? { xAxisId: 'overlap-base' as const } : {})}
            dataKey='value'
            barSize={density.maxBarSize}
            radius={density.radius}
            isAnimationActive={false}
            shape={barWindow === 'week' ? (props) => renderShiftBarShape(props) : undefined}
          >
            {data.map((d) => (
              <Cell
                key={d.idx}
                fill={barFillForZones(d.value, thresholdZones)}
                fillOpacity={trendOpacity(d, barWindow)}
              />
            ))}
          </Bar>
        ) : (
          <Bar
            {...(useBottomLabels ? { xAxisId: 'overlap-base' as const } : {})}
            dataKey='value'
            barSize={density.maxBarSize}
            radius={density.radius}
            isAnimationActive={false}
            shape={barWindow === 'week' ? (props) => renderShiftBarShape(props) : undefined}
          >
            {data.map((d) => (
              <Cell
                key={d.idx}
                fill='var(--color-value)'
                fillOpacity={trendOpacity(d, barWindow)}
              />
            ))}
          </Bar>
        )}
      </BarChart>
    </ChartContainer>
      <SelectedWeekOverlay
        metrics={selectedOverlay}
        bottomOffset={barWindow === 'trend' || barWindow === 'daily-trend' ? 18 : 0}
      />
      {showRollingAverage ? (
        <RollingAverageOverlay data={data} valueKey='value' yMax={yMax} />
      ) : null}
      {useBottomLabels ? (
        <ChartBottomLabels
          data={labelData}
          barWindow={barWindow}
          tickFontSize={density.tickFontSize}
        />
      ) : null}
    </div>
  );
}
const THROUGHPUT_CHART_CONFIG = throughputChartConfig;
const MOISTURE_CHART_CONFIG = moistureChartConfig;

export type ThroughputBarPoint = {
  idx?: number;
  label: string;
  weekLabel?: string;
  timeLabel?: string;
  isSelectedWeek?: boolean;
  feed: number;
  hasData?: boolean;
};

type DualBarMode = 'grouped' | 'stacked' | 'overlap';

function GroupedDualBarChart({
  data,
  config,
  primaryKey,
  secondaryKey,
  window: barWindow,
  height = 132,
  fillHeight = false,
  dualMode = 'grouped',
  emptyLabel = 'No data',
  refLines = [],
  refLineAxis = 'secondary',
  yDecimals,
  dualYAxis = false,
  primaryZones,
  secondaryZones,
  primaryOpacity = 0.4,
  secondaryFill,
  showPrimary = true
}: {
  data: DualChartRow[];
  config: ChartConfig;
  primaryKey: string;
  secondaryKey?: string;
  window: 'trend' | 'week' | 'daily-trend';
  height?: number;
  fillHeight?: boolean;
  dualMode?: DualBarMode;
  emptyLabel?: string;
  refLines?: RefLine[];
  refLineAxis?: 'primary' | 'secondary';
  yDecimals?: number;
  dualYAxis?: boolean;
  primaryZones?: ThresholdZones;
  secondaryZones?: ThresholdZones;
  primaryOpacity?: number;
  secondaryFill?: string;
  showPrimary?: boolean;
}) {
  const emptyClass = fillHeight
    ? 'flex h-full min-h-[72px] items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground'
    : 'flex items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground';

  if (!data.length) {
    return (
      <div className={emptyClass} style={fillHeight ? undefined : { height }}>
        {emptyLabel}
      </div>
    );
  }

  const refMax = refLines.length ? Math.max(...refLines.map((l) => l.value)) : 0;
  const stacked = dualMode === 'stacked';
  const overlap = dualMode === 'overlap';
  const primaryValues = showPrimary ? data.map((d) => Number(d[primaryKey] ?? 0)) : [];
  const hasSecondary = Boolean(secondaryKey);
  const hasAnySeries = showPrimary || hasSecondary;
  const useDualOverlap = overlap && showPrimary && hasSecondary;
  const useSingleOverlap = overlap && hasAnySeries && !useDualOverlap;
  const useOverlapLayout = useDualOverlap || useSingleOverlap;
  const secondaryValues = hasSecondary ? data.map((d) => Number(d[secondaryKey as string] ?? 0)) : [];
  const stackTotals = data.map((v, i) => (primaryValues[i] ?? 0) + (secondaryValues[i] ?? 0));
  const primaryMax = Math.max(...primaryValues, 1) * 1.1;
  const secondaryMax = Math.max(...secondaryValues, refMax, 1) * 1.1;
  const yMax = stacked
    ? Math.max(...stackTotals, refMax, 1) * 1.06
    : dualYAxis
      ? primaryMax
      : chartYMax(
          hasSecondary ? [...primaryValues, ...secondaryValues] : primaryValues,
          refMax
        );
  const secondaryDomainMax = dualYAxis ? secondaryMax : yMax;
  const isTrend = barWindow === 'trend' || barWindow === 'daily-trend';
  const isShiftWeek = barWindow === 'week';
  const useIdxAxis = isTrend || isShiftWeek;
  const density = getBarDensity(data.length, barWindow);
  const barSize = density.maxBarSize;
  const formatYTick = (v: number) =>
    yDecimals != null ? v.toFixed(yDecimals) : String(Math.round(v));

  const xDataKey = useIdxAxis ? 'idx' : 'label';
  const showBottomLabels = useOverlapLayout && useIdxAxis;
  const selectedOverlay = useIdxAxis ? selectedWeekOverlayMetrics(data, barWindow) : null;
  const showRollingAverage =
    barWindow === 'daily-trend' && primaryKey === 'input' && showPrimary;

  return (
    <div className={cn('relative flex w-full flex-col', fillHeight && 'h-full min-h-[72px]')}>
      <ChartContainer
        config={config}
        className={cn(
          'aspect-auto w-full [&_.recharts-cartesian-grid_line]:stroke-border/40',
          fillHeight && 'min-h-0 flex-1'
        )}
        style={fillHeight ? undefined : { height }}
      >
        <BarChart
          accessibilityLayer
          data={data}
          margin={showBottomLabels ? CHART_AXIS_MARGIN_OVERLAP : CHART_AXIS_MARGIN}
          barCategoryGap={density.barCategoryGap}
          barGap={useDualOverlap ? 0 : dualMode === 'grouped' ? 2 : 0}
        >
          {useDualOverlap ? (
            <>
              <XAxis {...overlapBaseXAxis(xDataKey)} />
              <XAxis xAxisId='overlap-overlay' dataKey={xDataKey} hide />
              <CartesianGrid vertical={false} />
            </>
          ) : useSingleOverlap ? (
            <>
              <XAxis {...overlapBaseXAxis(xDataKey)} />
              <CartesianGrid vertical={false} />
            </>
          ) : (
            <CartesianGrid vertical={false} />
          )}
          {!useOverlapLayout && useIdxAxis ? (
            <XAxis {...chartXAxisProps(data, barWindow, density)} />
          ) : null}
          {!useOverlapLayout && !useIdxAxis ? (
            <XAxis
              dataKey={xDataKey}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              height={24}
              minTickGap={0}
              tick={{ fontSize: density.tickFontSize }}
              interval={0}
            />
          ) : null}
          <YAxis
            {...(dualYAxis ? { yAxisId: 'primary' as const } : {})}
            width={CHART_Y_AXIS_WIDTH}
            domain={[0, yMax]}
            ticks={chartYTicks(yMax)}
            allowDecimals
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={formatYTick}
          />
          {dualYAxis ? (
            <YAxis
              yAxisId='secondary'
              orientation='right'
              width={CHART_Y_AXIS_WIDTH}
              domain={[0, secondaryDomainMax]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickCount={3}
              tickFormatter={(v: number) =>
                yDecimals != null ? v.toFixed(yDecimals) : String(Math.round(v))
              }
            />
          ) : null}
          <ChartTooltip
            cursor={useOverlapLayout ? false : { fill: 'var(--primary)', opacity: 0.1 }}
            content={
              <ChartTooltipContent
                hideLabel={false}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload;
                  return point ? (point.timeLabel || point.label || '') : '';
                }}
                indicator={useOverlapLayout ? 'line' : 'dashed'}
                formatter={(value, name, item) => {
                  const label =
                    config[name as keyof typeof config]?.label ?? String(name);
                  const payload = item?.payload as Record<string, unknown> | undefined;
                  const seriesKey =
                    name === primaryKey ? 'primary' : name === secondaryKey ? 'secondary' : 'single';
                  if (
                    barWindow === 'week' &&
                    !shiftSeriesHasData(payload, seriesKey === 'single' ? undefined : seriesKey)
                  ) {
                    return (
                      <div className='flex flex-1 justify-between gap-4 w-full'>
                        <span className='text-muted-foreground'>{label}</span>
                        <span className='font-medium text-muted-foreground'>No data</span>
                      </div>
                    );
                  }
                  const formatted =
                    yDecimals != null
                      ? `${Number(value).toFixed(yDecimals)}%`
                      : String(Math.round(Number(value)));
                  return (
                    <div className='flex flex-1 justify-between gap-4 w-full'>
                      <span className='text-muted-foreground'>{label}</span>
                      <span className='font-mono font-medium text-foreground'>{formatted}</span>
                    </div>
                  );
                }}
              />
            }
          />
          {!stacked &&
            refLines.map((line, i) => (
              <ReferenceLine
                key={i}
                {...(useOverlapLayout ? { xAxisId: 'overlap-base' as const } : {})}
                {...(dualYAxis ? { yAxisId: refLineAxis } : {})}
                y={line.value}
                stroke={line.stroke}
                strokeDasharray={line.dash ?? '5 4'}
                strokeWidth={1.5}
              />
            ))}
          {showPrimary ? (
            <Bar
              xAxisId={useOverlapLayout ? 'overlap-base' : undefined}
              {...(dualYAxis ? { yAxisId: 'primary' as const } : {})}
              dataKey={primaryKey}
              stackId={stacked ? 'dual' : undefined}
              radius={density.radius}
              barSize={barSize}
              isAnimationActive={false}
              shape={
                isShiftWeek ? (props) => renderShiftBarShape(props, 'primary') : undefined
              }
            >
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    primaryZones
                      ? barFillForZones(Number(d[primaryKey] ?? 0), primaryZones)
                      : `var(--color-${primaryKey})`
                  }
                  fillOpacity={trendOpacity(d, barWindow) * (useOverlapLayout ? primaryOpacity : 1)}
                />
              ))}
            </Bar>
          ) : null}
          {hasSecondary ? (
            <Bar
              xAxisId={
                useDualOverlap
                  ? 'overlap-overlay'
                  : useSingleOverlap
                    ? 'overlap-base'
                    : undefined
              }
              {...(dualYAxis ? { yAxisId: 'secondary' as const } : {})}
              dataKey={secondaryKey as string}
              stackId={stacked ? 'dual' : undefined}
              radius={density.radius}
              barSize={barSize}
              isAnimationActive={false}
              shape={
                isShiftWeek ? (props) => renderShiftBarShape(props, 'secondary') : undefined
              }
            >
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    secondaryZones
                      ? barFillForZones(Number(d[secondaryKey as string] ?? 0), secondaryZones)
                      : secondaryFill ?? `var(--color-${secondaryKey})`
                  }
                  fillOpacity={trendOpacity(d, barWindow)}
                />
              ))}
            </Bar>
          ) : null}
        </BarChart>
      </ChartContainer>
      <SelectedWeekOverlay
        metrics={selectedOverlay}
        bottomOffset={barWindow === 'trend' || barWindow === 'daily-trend' ? 18 : 0}
      />
      {showRollingAverage ? (
        <RollingAverageOverlay data={data} valueKey={primaryKey} yMax={yMax} />
      ) : null}
      {showBottomLabels ? (
        <ChartBottomLabels
          data={data}
          barWindow={barWindow}
          tickFontSize={density.tickFontSize}
        />
      ) : null}
    </div>
  );
}

export function ThroughputGroupedBarChart({
  data,
  height = 132,
  fillHeight = false,
  window: barWindow = 'trend',
  emptyLabel = 'No data',
  refLines = []
}: {
  data: ThroughputBarPoint[];
  height?: number;
  fillHeight?: boolean;
  window?: 'trend' | 'week' | 'daily-trend';
  emptyLabel?: string;
  refLines?: RefLine[];
}) {
  return (
    <GroupedDualBarChart
      data={data}
      config={THROUGHPUT_CHART_CONFIG}
      primaryKey='feed'
      window={barWindow}
      height={height}
      fillHeight={fillHeight}
      dualMode='overlap'
      primaryOpacity={1}
      emptyLabel={emptyLabel}
      refLines={refLines}
    />
  );
}

const MOISTURE_INPUT_REF_LINES: RefLine[] = [
  { value: COMMERCIAL_INPUT_MOISTURE_ZONES.warnMax, stroke: KPI_THRESHOLD_COLORS.above, dash: '5 4' }
];

const MOISTURE_OUTPUT_REF_LINES: RefLine[] = [
  { value: COMMERCIAL_OUTPUT_MOISTURE_ZONES.okMax, stroke: KPI_THRESHOLD_COLORS.near, dash: '5 4' },
  { value: COMMERCIAL_OUTPUT_MOISTURE_ZONES.warnMax, stroke: KPI_THRESHOLD_COLORS.above, dash: '5 4' }
];

export function MoistureGroupedBarChart({
  data,
  height = 132,
  fillHeight = false,
  window: barWindow = 'trend',
  showInput = true,
  showOutput = true
}: {
  data: DualMetricBarPoint[];
  height?: number;
  fillHeight?: boolean;
  window?: 'trend' | 'week' | 'daily-trend';
  showInput?: boolean;
  showOutput?: boolean;
}) {
  const refLines = [
    ...(showInput ? MOISTURE_INPUT_REF_LINES : []),
    ...(showOutput ? MOISTURE_OUTPUT_REF_LINES : [])
  ];

  const mapped = data.map((d, i) => ({
    idx: d.idx ?? i,
    label: d.label,
    weekLabel: d.weekLabel,
    timeLabel: d.timeLabel,
    isSelectedWeek: d.isSelectedWeek,
    input: d.primary,
    output: d.secondary,
    hasData: d.hasData,
    primaryHasData: d.primaryHasData,
    secondaryHasData: d.secondaryHasData
  }));

  return (
    <GroupedDualBarChart
      data={mapped}
      config={MOISTURE_CHART_CONFIG}
      primaryKey='input'
      secondaryKey={showOutput ? 'output' : undefined}
      window={barWindow}
      height={height}
      fillHeight={fillHeight}
      dualMode='overlap'
      primaryZones={showInput ? COMMERCIAL_INPUT_MOISTURE_ZONES : undefined}
      secondaryZones={showOutput ? COMMERCIAL_OUTPUT_MOISTURE_ZONES : undefined}
      refLines={refLines}
      primaryOpacity={0.48}
      showPrimary={showInput}
      emptyLabel='No moisture data'
      yDecimals={1}
    />
  );
}

function CompositionTooltipContent({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload?: CompositionAreaPoint; dataKey?: string; value?: number }>;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const label = row.timeLabel || row.label || '';
  if (row.hasData === false) {
    return (
      <div className='grid min-w-[8.5rem] gap-1 rounded-md border border-border/50 bg-background px-2 py-1.5 text-[10px] shadow-md'>
        {label ? <p className='text-[11px] font-semibold leading-none'>{label}</p> : null}
        <p className='text-muted-foreground'>No data</p>
      </div>
    );
  }

  const hasFeed = row.classifiedRawTotal > 0;

  return (
    <div className='grid min-w-[8.5rem] gap-1 rounded-md border border-border/50 bg-background px-2 py-1.5 text-[10px] shadow-md'>
      {label ? <p className='text-[11px] font-semibold leading-none'>{label}</p> : null}
      {hasFeed ? (
        <div className='grid gap-0.5'>
          {FEEDSTOCK_STACK_KEYS.map((key) => {
            const pct = row[key] ?? 0;
            const categoryLabel =
              feedstockChartConfig[key as keyof typeof feedstockChartConfig]?.label ?? key;
            return (
              <div key={key} className='flex justify-between gap-3'>
                <span className='truncate text-muted-foreground'>{categoryLabel}</span>
                <span className='font-mono font-semibold tabular-nums text-foreground'>
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className='text-muted-foreground'>No classified feed at this time</p>
      )}
    </div>
  );
}

export function FeedstockStackedAreaChart({
  data,
  height = 132,
  fillHeight = false,
  window: chartWindow = 'trend',
  emptyLabel = 'No composition data'
}: {
  data: CompositionAreaPoint[];
  height?: number;
  fillHeight?: boolean;
  window?: 'trend' | 'week' | 'daily-trend';
  emptyLabel?: string;
}) {
  const emptyClass = fillHeight
    ? 'flex h-full min-h-[72px] items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground'
    : 'flex items-center justify-center rounded-sm border border-dashed border-border/50 text-[10px] text-muted-foreground';

  if (!data.length) {
    return (
      <div className={emptyClass} style={fillHeight ? undefined : { height }}>
        {emptyLabel}
      </div>
    );
  }

  const isTrend = chartWindow === 'trend' || chartWindow === 'daily-trend';
  const isShiftWeek = chartWindow === 'week';
  const useIdxAxis = isTrend || isShiftWeek;
  const density = getBarDensity(data.length, chartWindow);
  const selectedOverlay = useIdxAxis ? selectedWeekOverlayMetrics(data, chartWindow) : null;

  return (
    <div
      className={cn(
        'relative flex w-full flex-col',
        fillHeight && 'h-full min-h-[72px]'
      )}
      style={fillHeight ? undefined : { height }}
    >
      <ChartContainer
        config={feedstockChartConfig}
        className={cn(
          'aspect-auto w-full [&_.recharts-cartesian-grid_line]:stroke-border/40',
          fillHeight && 'min-h-0 flex-1'
        )}
        style={fillHeight ? undefined : { height }}
      >
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ top: 4, right: 4, bottom: 4, left: -18 }}
      >
        <CartesianGrid vertical={false} />
        <YAxis hide domain={[0, 100]} />
        <XAxis
          {...(useIdxAxis
            ? chartXAxisProps(data, chartWindow, density)
            : {
                dataKey: 'label' as const,
                tickLine: false as const,
                axisLine: false as const,
                tickMargin: 6,
                height: 24,
                minTickGap: 0,
                tick: { fontSize: density.tickFontSize },
                interval: 0 as const
              })}
        />
        <ChartTooltip cursor={false} content={<CompositionTooltipContent />} />
        {FEEDSTOCK_STACK_KEYS.map((key) => (
          <Area
            key={key}
            dataKey={key}
            type='monotone'
            stackId='feedstock'
            fill={`var(--color-${key})`}
            stroke={`var(--color-${key})`}
            strokeWidth={1}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartContainer>
      <SelectedWeekOverlay
        metrics={selectedOverlay}
        leftPad={0}
        rightPad={4}
        bottomOffset={chartWindow === 'trend' || chartWindow === 'daily-trend' ? 18 : 0}
      />
      {isShiftWeek ? <MissingShiftOverlay data={data} leftPad={0} rightPad={4} /> : null}
    </div>
  );
}
