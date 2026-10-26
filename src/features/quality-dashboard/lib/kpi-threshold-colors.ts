/** Threshold zone colors — dedicated tokens (mono theme uses light/dark grey steps). */
export const KPI_THRESHOLD_COLORS = {
  within: 'var(--threshold-within)',
  near: 'var(--threshold-near)',
  above: 'var(--threshold-above)'
} as const;

/** Semantic status colors mapped to theme tokens (follow active theme + light/dark). */
export const THEME_SEMANTIC = {
  positive: {
    dot: 'bg-commercial-good',
    text: 'text-commercial-good',
    badge: 'text-commercial-good border-commercial-good/40'
  },
  warning: {
    dot: 'bg-chart-4',
    text: 'text-chart-4',
    badge: 'text-chart-4 border-chart-4/50'
  },
  negative: {
    dot: 'bg-commercial-bad',
    text: 'text-commercial-bad',
    badge: 'text-commercial-bad border-commercial-bad/40'
  },
  neutral: {
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    badge: 'text-muted-foreground border-border/40'
  },
  accent: {
    text: 'text-primary'
  }
} as const;

/** Recharts / SVG stroke tokens */
export const CHART_THEME = {
  grid: 'var(--border)',
  foreground: 'var(--foreground)',
  primary: 'var(--primary)',
  secondary: 'var(--chart-2)',
  muted: 'var(--muted-foreground)'
} as const;

export const STATUS_BADGE_STYLES = {
  OK: 'border bg-commercial-good/10 text-commercial-good border-commercial-good/30',
  Watch: 'border bg-chart-4/10 text-chart-4 border-chart-4/30',
  Alert: 'border bg-commercial-bad/10 text-commercial-bad border-commercial-bad/30'
} as const;

export const CARD_TONE_STYLES = {
  positive: 'border-commercial-good/30 bg-commercial-good/5',
  negative: 'border-commercial-bad/30 bg-commercial-bad/5',
  risk: 'border-chart-4/30 bg-chart-4/5',
  neutral: 'border-border/60 bg-card/50'
} as const;

export const ZONE_DOT_CLASS = {
  within: 'bg-threshold-within',
  near: 'bg-threshold-near',
  above: 'bg-threshold-above'
} as const;

export const ZONE_TEXT_CLASS = {
  within: 'text-threshold-within',
  near: 'text-threshold-near',
  above: 'text-threshold-above'
} as const;

export type ZoneKey = keyof typeof ZONE_DOT_CLASS;

/** Resolve a CSS variable (e.g. var(--background)) to computed rgb for canvas export. */
export function resolveThemeColor(cssVar: string): string {
  if (typeof document === 'undefined') return '';
  const probe = document.createElement('span');
  probe.style.color = cssVar;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return resolved;
}

export function themeBackgroundColor(): string {
  return resolveThemeColor('var(--background)') || 'white';
}

export function diffToneClass(
  value: number | null | undefined,
  opts?: { invert?: boolean; neutralWhenZero?: boolean }
): string {
  if (value == null || (opts?.neutralWhenZero !== false && value === 0)) {
    return THEME_SEMANTIC.neutral.text;
  }
  const positive = value > 0;
  const good = opts?.invert ? !positive : positive;
  return good ? THEME_SEMANTIC.positive.text : THEME_SEMANTIC.negative.text;
}

export type ThresholdZones = { okMax: number; warnMax: number };

export const COMMERCIAL_CHLORINE_ZONES: ThresholdZones = { okMax: 0.8, warnMax: 1.2 };
export const COMMERCIAL_PVC_ZONES: ThresholdZones = { okMax: 2.0, warnMax: 2.0 };
export const COMMERCIAL_INPUT_MOISTURE_ZONES: ThresholdZones = { okMax: 25.0, warnMax: 25.0 };
export const COMMERCIAL_OUTPUT_MOISTURE_ZONES: ThresholdZones = { okMax: 8, warnMax: 10 };
/** Sorter Q = ejected PVC % / input PVC %. At or above this is the calibrated regime. */
export const SORTER_Q_THRESHOLD = 4;

export type CommercialZones = {
  chlorine: ThresholdZones;
  pvc: ThresholdZones;
  inputMoisture: ThresholdZones;
  outputMoisture: ThresholdZones;
};

type ZoneConfigSource = {
  calculation_config?: {
    input_pvc_threshold_pct?: number;
    chlorine_within_threshold_pct?: number;
    chlorine_above_threshold_pct?: number;
    input_moisture_threshold_pct?: number;
    output_moisture_threshold_pct?: number;
  } | null;
} | null | undefined;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Threshold zones for one report. Plants carry their own limits in the saved
 * calculation config (FRM: PVC 2 %, moisture 25 %; TSP: PVC 5 %, moisture 20 %);
 * the FRM constants remain the fallback for reports without a config.
 */
export function getCommercialZones(report: ZoneConfigSource): CommercialZones {
  const cfg = report?.calculation_config ?? undefined;
  const pvcMax = finiteOr(cfg?.input_pvc_threshold_pct, COMMERCIAL_PVC_ZONES.warnMax);
  const clOk = finiteOr(cfg?.chlorine_within_threshold_pct, COMMERCIAL_CHLORINE_ZONES.okMax);
  const clWarn = finiteOr(cfg?.chlorine_above_threshold_pct, COMMERCIAL_CHLORINE_ZONES.warnMax);
  const moInMax = finiteOr(cfg?.input_moisture_threshold_pct, COMMERCIAL_INPUT_MOISTURE_ZONES.warnMax);
  const moOutOk = finiteOr(cfg?.output_moisture_threshold_pct, COMMERCIAL_OUTPUT_MOISTURE_ZONES.okMax);
  const moOutWarn = Math.max(moOutOk, COMMERCIAL_OUTPUT_MOISTURE_ZONES.warnMax);
  return {
    chlorine: { okMax: clOk, warnMax: Math.max(clOk, clWarn) },
    pvc: { okMax: pvcMax, warnMax: pvcMax },
    inputMoisture: { okMax: moInMax, warnMax: moInMax },
    outputMoisture: { okMax: moOutOk, warnMax: moOutWarn }
  };
}

/** Compact "2%" / "1.2%" label for legends and basis text. */
export function formatZoneLimit(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

export function barFillForZones(value: number, zones?: ThresholdZones): string {
  if (!zones) {
    return 'var(--primary)';
  }
  const atOrAboveLimit =
    value > zones.warnMax || (zones.warnMax === zones.okMax && value >= zones.warnMax);
  if (atOrAboveLimit) return KPI_THRESHOLD_COLORS.above;
  if (value > zones.okMax) return KPI_THRESHOLD_COLORS.near;
  return KPI_THRESHOLD_COLORS.within;
}

export function barFillForBin(
  bin: { min: number; max: number },
  zones: ThresholdZones
): string {
  if (bin.min >= zones.warnMax) return KPI_THRESHOLD_COLORS.above;
  if (bin.max <= zones.okMax) return KPI_THRESHOLD_COLORS.within;
  return KPI_THRESHOLD_COLORS.near;
}

export type ThresholdRefLine = { x: number; stroke: string; label: string };

/** Vertical reference lines between zone groups (2 sub-bins per zone). */
export function thresholdRefLines(zones: ThresholdZones): ThresholdRefLine[] {
  const { okMax, warnMax } = zones;
  if (warnMax <= okMax) {
    return [{ x: 1.5, stroke: KPI_THRESHOLD_COLORS.above, label: `${warnMax}%` }];
  }
  return [
    { x: 1.5, stroke: KPI_THRESHOLD_COLORS.near, label: `${okMax}%` },
    { x: 3.5, stroke: KPI_THRESHOLD_COLORS.above, label: `${warnMax}%` }
  ];
}

export const kpiThresholdChartConfig = {
  within: { label: 'Within', color: KPI_THRESHOLD_COLORS.within },
  near: { label: 'Near', color: KPI_THRESHOLD_COLORS.near },
  above: { label: 'Above', color: KPI_THRESHOLD_COLORS.above }
};
