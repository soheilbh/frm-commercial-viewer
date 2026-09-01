import type {
  CommercialComplianceBreakdown,
  CommercialConclusions,
  CommercialCorrelation,
  CommercialExecutiveNarrative,
  CommercialMetricComparison,
  CommercialReportPayload,
  CommercialScorecard,
  CommercialStabilityMetric,
  CommercialWeeklySeries
} from '@/features/quality-dashboard/api/types';
import { isoWeekKey, formatWeekLabel, weekKeyLte, sortWeekKeys } from './weekly-context';

function getComparison(
  comparisons: CommercialMetricComparison[],
  id: string
): CommercialMetricComparison | undefined {
  return comparisons.find((c) => c.id === id);
}

function valuesFromSeries(points: { value: number | null }[]): number[] {
  return points.map((p) => p.value).filter((v): v is number => v !== null);
}

function std(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

function complianceBreakdown(
  id: string,
  label: string,
  values: number[],
  okMax: number,
  warnMax: number
): CommercialComplianceBreakdown {
  if (!values.length) {
    return { id, label, within_spec_pct: 100, near_limit_pct: 0, out_of_spec_pct: 0 };
  }
  const within = values.filter((v) => v <= okMax).length;
  const near = values.filter((v) => v > okMax && v <= warnMax).length;
  const out = values.filter((v) => v > warnMax).length;
  const n = values.length;
  return {
    id,
    label,
    within_spec_pct: Math.round((within / n) * 1000) / 10,
    near_limit_pct: Math.round((near / n) * 1000) / 10,
    out_of_spec_pct: Math.round((out / n) * 1000) / 10
  };
}

function aggregateWeeklyFromDaily(
  points: { time: string; value: number | null }[],
  label: string,
  id: string,
  unit: string,
  baseline: number | null
): CommercialWeeklySeries {
  const byWeek = new Map<
    string,
    { week_label: string; week_start: string; vals: number[] }
  >();
  points.forEach((p) => {
    if (p.value === null) return;
    const key = isoWeekKey(p.time);
    const row = byWeek.get(key) ?? {
      week_label: formatWeekLabel(key),
      week_start: p.time,
      vals: []
    };
    row.vals.push(p.value);
    if (p.time < row.week_start) row.week_start = p.time;
    byWeek.set(key, row);
  });
  const weeklyPoints = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => ({
      week_label: row.week_label,
      week_start: row.week_start,
      value: row.vals.reduce((a, b) => a + b, 0) / row.vals.length
    }));
  return {
    id,
    label,
    unit,
    points: weeklyPoints.slice(-12),
    baseline,
    annotations: []
  };
}

function mergeWeeklySeries(
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
    if (!prev || score(s) > score(prev)) byId.set(s.id, s);
  }
  return Array.from(byId.values());
}

function getAnchorWeekKey(report: CommercialReportPayload): string {
  if (report.selected_week_key) return report.selected_week_key;
  const keys = sortWeekKeys(report.chlorine.points.map((p) => isoWeekKey(p.time)));
  return keys[keys.length - 1] ?? isoWeekKey(new Date().toISOString());
}

function currentWeekValues(
  report: CommercialReportPayload,
  points: { time: string; value: number | null }[]
): number[] {
  const anchor = getAnchorWeekKey(report);
  const valid = points
    .filter((p): p is { time: string; value: number } => p.value !== null)
    .filter((p) => weekKeyLte(isoWeekKey(p.time), anchor))
    .sort((a, b) => a.time.localeCompare(b.time));
  if (!valid.length) return [];
  const inWeek = valid.filter((p) => isoWeekKey(p.time) === anchor);
  const lastTime = (inWeek.length ? inWeek[inWeek.length - 1] : valid[valid.length - 1]).time;
  const endIdx = valid.findIndex((p) => p.time === lastTime);
  return valid.slice(Math.max(0, endIdx - 6), endIdx + 1).map((p) => p.value);
}

function currentWeekCompositionValues(report: CommercialReportPayload, mat: string): number[] {
  const anchor = getAnchorWeekKey(report);
  const valid = report.composition_points
    .filter((p) => weekKeyLte(isoWeekKey(p.time), anchor))
    .sort((a, b) => a.time.localeCompare(b.time));
  if (!valid.length) return [];
  const inWeek = valid.filter((p) => isoWeekKey(p.time) === anchor);
  const lastTime = (inWeek.length ? inWeek[inWeek.length - 1] : valid[valid.length - 1]).time;
  const endIdx = valid.findIndex((p) => p.time === lastTime);
  return valid.slice(Math.max(0, endIdx - 6), endIdx + 1).map((p) => p.values[mat] ?? 0);
}

/** Client-side enrichment when backend analytics fields are absent. */
export function enrichCommercialReportClient(
  report: CommercialReportPayload
): CommercialReportPayload {
  if (report.scorecard) return report;

  const cl = getComparison(report.comparisons, 'chlorine');
  const pvc = getComparison(report.comparisons, 'pvc');
  const moIn = getComparison(report.comparisons, 'input_moisture');
  const moOut = getComparison(report.comparisons, 'output_moisture');

  const clVals = valuesFromSeries(report.chlorine.points);
  const pvcVals = report.composition_points.map((p) => p.values['PVC'] ?? 0);
  const moOutVals = valuesFromSeries(report.output_moisture.points);
  const moInVals = valuesFromSeries(report.input_moisture.points);

  const clWeek = currentWeekValues(report, report.chlorine.points);
  const pvcWeek = currentWeekCompositionValues(report, 'PVC');
  const moOutWeek = currentWeekValues(report, report.output_moisture.points);
  const moInWeek = currentWeekValues(report, report.input_moisture.points);

  const compliance = [
    complianceBreakdown('chlorine', 'Chlorine', clWeek, 0.8, 1.2),
    complianceBreakdown('pvc', 'PVC', pvcWeek, 2.0, 2.0),
    complianceBreakdown('output_moisture', 'Output Moisture', moOutWeek, 8.0, 10.0)
  ];
  const avgCompliance =
    compliance.reduce((s, c) => s + c.within_spec_pct, 0) / compliance.length;

  const stability: CommercialStabilityMetric[] = [
    {
      id: 'chlorine',
      label: 'Chlorine',
      unit: '%',
      current_week_values: clWeek,
      baseline_values: clVals,
      current_std: std(clWeek),
      baseline_std: std(clVals),
      stability_score: 75
    },
    {
      id: 'pvc',
      label: 'PVC',
      unit: '%',
      current_week_values: pvcWeek,
      baseline_values: pvcVals,
      current_std: std(pvcWeek),
      baseline_std: std(pvcVals),
      stability_score: 75
    },
    {
      id: 'output_moisture',
      label: 'Output Moisture',
      unit: '%',
      current_week_values: moOutWeek,
      baseline_values: moOutVals,
      current_std: std(moOutWeek),
      baseline_std: std(moOutVals),
      stability_score: 75
    }
  ].map((s) => {
    const ratio =
      s.current_std && s.baseline_std && s.baseline_std > 0
        ? s.current_std / s.baseline_std
        : 1;
    return { ...s, stability_score: Math.round(Math.max(0, Math.min(100, 100 - (ratio - 1) * 40))) };
  });

  const avgStability =
    stability.reduce((s, m) => s + m.stability_score, 0) / stability.length;

  const qhs = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        ((cl?.last_week_avg ?? 0) <= 1.2 ? 80 : 50) +
          ((pvc?.last_week_avg ?? 0) <= 2 ? 80 : 50) +
          (moOut?.last_week_avg ?? 0) / 2
      ) / 3
    )
  );

  let riskPoints = 0;
  if ((cl?.difference ?? 0) > 0.1) riskPoints += 2;
  if ((pvc?.difference ?? 0) > 0.5) riskPoints += 2;
  if (avgCompliance < 90) riskPoints += 1;
  const commercial_risk = riskPoints >= 4 ? 'High' : riskPoints >= 2 ? 'Medium' : 'Low';

  const scorecard: CommercialScorecard = {
    quality_health_score: qhs,
    compliance_score: Math.round(avgCompliance * 10) / 10,
    stability_score: Math.round(avgStability * 10) / 10,
    commercial_risk
  };

  const narrative: CommercialExecutiveNarrative = {
    summary: `Week ${report.week_number ?? ''}: quality performance compared with the three-month baseline. ${
      (cl?.difference ?? 0) > 0.05
        ? 'Chlorine moved above normal levels.'
        : (pvc?.difference ?? 0) > 0.3
          ? 'Incoming material composition shifted, notably in PVC.'
          : 'Operating conditions remained broadly in line with recent history.'
    }`,
    key_finding:
      (cl?.difference ?? 0) > 0.05
        ? `Chlorine finished ${(cl?.difference ?? 0).toFixed(3)}% above baseline — the week's most notable quality move.`
        : 'No single quality metric moved materially away from baseline.',
    main_risk:
      commercial_risk === 'Low'
        ? 'No immediate commercial risks identified.'
        : `Attention warranted: ${commercial_risk.toLowerCase()} deviation from normal operating conditions.`,
    positive_development:
      (moOut?.difference ?? 0) <= 0 && (moIn?.difference ?? 0) > 0
        ? 'Despite wetter feedstock, output moisture stayed controlled.'
        : (cl?.difference ?? 0) <= 0
          ? 'Chlorine remained within the normal operating band.'
          : 'Feed volume and throughput held steady through the week.',
    recommended_focus:
      (cl?.difference ?? 0) > 0 || (pvc?.difference ?? 0) > 0
        ? 'Monitor chlorine and PVC levels in incoming material next week.'
        : 'Continue standard weekly review — no corrective action indicated.'
  };

  const n = Math.min(clVals.length, pvcVals.length, moInVals.length, moOutVals.length);
  const correlations: CommercialCorrelation[] = [
    {
      id: 'pvc_chlorine',
      x_label: 'PVC %',
      y_label: 'Chlorine %',
      points: Array.from({ length: n }, (_, i) => ({
        x: pvcVals[pvcVals.length - n + i],
        y: clVals[clVals.length - n + i]
      })),
      correlation: pearson(pvcVals.slice(-n), clVals.slice(-n)) ?? 0,
      strength: 'moderate',
      direction: 'positive',
      conclusion: 'PVC remains a key predictor of chlorine concentration.'
    },
    {
      id: 'moisture_transfer',
      x_label: 'Input Moisture %',
      y_label: 'Output Moisture %',
      points: Array.from({ length: n }, (_, i) => ({
        x: moInVals[moInVals.length - n + i],
        y: moOutVals[moOutVals.length - n + i]
      })),
      correlation: pearson(moInVals.slice(-n), moOutVals.slice(-n)) ?? 0,
      strength: 'moderate',
      direction: 'positive',
      conclusion: 'Input moisture relationship with output moisture reflects dryer performance.'
    }
  ];

  const conclusions: CommercialConclusions = {
    key_findings: [narrative.key_finding, narrative.positive_development],
    risks: [narrative.main_risk],
    recommended_monitoring: [narrative.recommended_focus]
  };

  const comparisons = [...report.comparisons];
  if (report.last_week_input_tonnage && report.feed_volume_3m_avg) {
    const diff = report.last_week_input_tonnage - report.feed_volume_3m_avg;
    comparisons.push({
      id: 'feed_volume',
      label: 'Feed Input',
      unit: ' t',
      three_month_avg: report.feed_volume_3m_avg,
      last_week_avg: report.last_week_input_tonnage,
      difference: diff,
      difference_pct: report.feed_volume_3m_avg
        ? (diff / report.feed_volume_3m_avg) * 100
        : 0
    });
  }

  const clientWeekly = [
    aggregateWeeklyFromDaily(report.chlorine.points, 'Chlorine', 'chlorine', '%', cl?.three_month_avg ?? null),
    aggregateWeeklyFromDaily(
      report.composition_points.map((p) => ({ time: p.time, value: p.values['PVC'] ?? 0 })),
      'PVC',
      'pvc',
      '%',
      pvc?.three_month_avg ?? null
    ),
    aggregateWeeklyFromDaily(
      report.output_moisture.points,
      'Output Moisture',
      'output_moisture',
      '%',
      moOut?.three_month_avg ?? null
    )
  ];

  return {
    ...report,
    comparisons,
    scorecard,
    executive_narrative: narrative,
    weekly_series: mergeWeeklySeries(report.weekly_series, clientWeekly),
    compliance,
    stability,
    correlations,
    change_highlights: [],
    conclusions
  };
}
