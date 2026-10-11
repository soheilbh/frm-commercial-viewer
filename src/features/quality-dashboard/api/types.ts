export type SeriesPoint = {
  time: string;
  value: number;
};

export type MetricSeries = {
  id: string;
  label: string;
  unit: string;
  points: SeriesPoint[];
  average: number | null;
  now: number | null;
};

export type SortingProgramState = {
  id: string;
  label: string;
  program: string | null;
};

export type QualityPerformanceSection = {
  title: string;
  metrics: MetricSeries[];
  sorting_programs: SortingProgramState[];
};

export type DryerSetting = {
  id: string;
  label: string;
  unit: string;
  value: number | string | null;
  decimals: number;
};

export type DryerTrendSeries = {
  id: string;
  label: string;
  unit: string;
  axis?: string;
  points: SeriesPoint[];
};

export type PelletizerState = {
  id: string;
  capacity_avg: number | null;
  capacity_now: number | null;
  left_status: 'broken' | 'on' | 'unknown';
  right_status: 'broken' | 'on' | 'unknown';
  availability: { time: string; running: boolean }[];
};

export type PelletizersDryerSection = {
  title: string;
  dryer_trends: DryerTrendSeries[];
  dryer_settings: DryerSetting[];
  pelletizers: PelletizerState[];
};

export type InputTonnagesSection = {
  title: string;
  points: SeriesPoint[];
  average_t: number | null;
  now_t: number | null;
  max_t: number | null;
  total_t: number | null;
};

export type CbmAlert = {
  motor: string;
  anomaly: number;
};

export type CbmAlertsSection = {
  title: string;
  alerts: CbmAlert[];
};

export type QualityDashboardReport = {
  title: string;
  generated_at: string;
  time_range: { start: string; end: string };
  quality_performance: QualityPerformanceSection;
  pelletizers_dryer: PelletizersDryerSection;
  input_tonnages: InputTonnagesSection;
  cbm_alerts: CbmAlertsSection;
};

export type QualityDashboardConfig = {
  title: string;
  default_range_hours: number;
  timezone: string;
  sections: { id: string; title: string }[];
};

export type RangePreset = '6h' | '24h' | '7d';

export type CommercialMetricComparison = {
  id: string;
  label: string;
  unit: string;
  three_month_avg: number | null;
  last_week_avg: number | null;
  difference: number | null;
  difference_pct: number | null;
};

export type CommercialCompositionPoint = {
  time: string;
  values: Record<string, number>;
};

export type CommercialTimeSeriesPoint = {
  time: string;
  value: number | null;
};

export type CommercialTimeSeries = {
  id: string;
  label: string;
  unit: string;
  points: CommercialTimeSeriesPoint[];
};

export type CommercialThroughputDay = {
  day_label: string;
  day_start: string;
  feed_t?: number | null;
};

export type CommercialThresholdExposure = {
  id: string;
  within_pct: number;
  near_pct: number;
  above_pct: number;
  within_count: number;
  near_count: number;
  above_count: number;
  total_readings: number;
};

export type CommercialReportPayload = {
  title: string;
  generated_at: string;
  calculation_config?: Partial<CommercialReportCalculationConfig>;
  comparisons: CommercialMetricComparison[];
  composition_points: CommercialCompositionPoint[];
  input_moisture: CommercialTimeSeries;
  output_moisture: CommercialTimeSeries;
  chlorine: CommercialTimeSeries;
  ejected_pvc?: CommercialTimeSeries;
  week_number?: number;
  year?: number;
  /** ISO week anchor for scoped dashboard views, e.g. "2026-W26". */
  selected_week_key?: string;
  last_week_input_tonnage?: number;
  feed_volume_3m_avg?: number;
  throughput_daily?: CommercialThroughputDay[];
  threshold_exposure?: CommercialThresholdExposure[];
  composition_weekly_points?: CommercialCompositionPoint[];
  scorecard?: CommercialScorecard;
  executive_narrative?: CommercialExecutiveNarrative;
  weekly_series?: CommercialWeeklySeries[];
  compliance?: CommercialComplianceBreakdown[];
  stability?: CommercialStabilityMetric[];
  correlations?: CommercialCorrelation[];
  change_highlights?: CommercialChangeHighlight[];
  conclusions?: CommercialConclusions;
};

export type CommercialWeeklyPoint = {
  week_label: string;
  week_start: string;
  value: number | null;
};

export type CommercialWeeklySeries = {
  id: string;
  label: string;
  unit: string;
  points: CommercialWeeklyPoint[];
  baseline: number | null;
  annotations: string[];
};

export type CommercialComplianceBreakdown = {
  id: string;
  label: string;
  within_spec_pct: number;
  near_limit_pct: number;
  out_of_spec_pct: number;
};

export type CommercialStabilityMetric = {
  id: string;
  label: string;
  unit: string;
  current_week_values: number[];
  baseline_values: number[];
  current_std: number | null;
  baseline_std: number | null;
  stability_score: number;
};

export type CommercialCorrelationPoint = { x: number; y: number };

export type CommercialCorrelation = {
  id: string;
  x_label: string;
  y_label: string;
  points: CommercialCorrelationPoint[];
  correlation: number;
  strength: string;
  direction: string;
  conclusion: string;
};

export type CommercialScorecard = {
  quality_health_score: number;
  compliance_score: number;
  stability_score: number;
  commercial_risk: string;
};

export type CommercialExecutiveNarrative = {
  summary: string;
  key_finding: string;
  main_risk: string;
  positive_development: string;
  recommended_focus: string;
};

export type CommercialChangeHighlight = {
  id: string;
  label: string;
  metric: string;
  value: string;
  change: string;
};

export type CommercialConclusions = {
  key_findings: string[];
  risks: string[];
  recommended_monitoring: string[];
};

export type CommercialReportCalculationConfig = {
  version: number;
  sample_resolution: string;
  chart_bucket: string;
  chart_bucket_start_hour: number;
  daily_bucket_start_hour?: number;
  baseline_weeks: number;
  timezone: string;
  job_chunk_days: number;
  job_chunk_hours: number;
  job_query_concurrency: number;
  counter_reset_spike_limit_t_per_hour: number;
  pvc_material_min_area_m2: number;
  pvc_active_material_min_area_m2: number;
  pvc_active_material_min_count: number;
  pvc_min_valid_samples_per_bucket: number;
  input_pvc_threshold_pct: number;
  chlorine_within_threshold_pct: number;
  chlorine_above_threshold_pct: number;
  input_moisture_threshold_pct: number;
  input_moisture_min_feed_tph: number;
  output_moisture_threshold_pct: number;
  output_moisture_min_avg_fan_hz: number;
  notes: string[];
};

export type CommercialReportConfigResponse = {
  active: CommercialReportCalculationConfig;
  defaults: CommercialReportCalculationConfig;
  path: string;
};

export type CommercialReportJob = {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | string;
  year?: number | null;
  week?: number | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  logs: string[];
  config: CommercialReportCalculationConfig;
  has_result: boolean;
  result?: CommercialReportPayload;
};
