import type { ChartConfig } from '@/components/ui/chart';

/**
 * Commercial-report series palette.
 * These are role-based theme tokens; status colors remain separate so red only
 * means a threshold breach, never merely an increase.
 */
export const commercialSeriesColors = {
  recordedInput: 'var(--commercial-feed)',
  preDryerMoisture: 'var(--commercial-pre-moisture)',
  postDryerMoisture: 'var(--commercial-post-moisture)',
  chlorine: 'var(--commercial-quality)',
  pvc: 'var(--commercial-quality)'
} as const;

export const qualityChartConfig = {
  chlorine: { label: 'Chlorine', color: 'var(--primary)' },
  pvc: { label: 'Input PVC', color: 'var(--primary)' },
  tonnage: { label: 'Input tonnage', color: 'var(--primary)' },
  dryer: { label: 'Dryer', color: 'var(--primary)' }
} satisfies ChartConfig;

export const throughputChartConfig = {
  feed: { label: 'Recorded input', color: commercialSeriesColors.recordedInput }
} satisfies ChartConfig;

export const moistureChartConfig = {
  input: { label: 'Input moisture', color: commercialSeriesColors.preDryerMoisture },
  output: { label: 'Output moisture', color: commercialSeriesColors.postDryerMoisture }
} satisfies ChartConfig;

export const feedstockChartConfig = {
  plastics: { label: 'Plastics', color: 'var(--commercial-mix-plastics)' },
  organic: { label: 'Organic', color: 'var(--commercial-mix-organic)' },
  pvc: { label: 'PVC', color: 'var(--commercial-mix-pvc)' },
  beverage: { label: 'Beverage Cartons', color: 'var(--commercial-mix-beverage)' },
  others: { label: 'Others', color: 'var(--commercial-mix-others)' }
} satisfies ChartConfig;

/** Multi-series line charts — theme chart tokens. */
export const dryerSeriesColors = [
  'var(--commercial-output)',
  'var(--commercial-feed)',
  'var(--commercial-quality)',
  'var(--commercial-pre-moisture)',
  'var(--commercial-mix-organic)',
  'var(--primary)'
] as const;
