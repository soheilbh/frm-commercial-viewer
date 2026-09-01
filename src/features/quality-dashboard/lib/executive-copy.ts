import type { CommercialReportPayload } from '@/features/quality-dashboard/api/types';
import { buildCompositionCategories, buildMetricContext } from './weekly-context';

export type ExecutiveInsightCard = {
  id: string;
  title: string;
  body: string;
  tone: 'risk' | 'watch' | 'positive' | 'neutral';
  icon: 'chlorine' | 'moisture' | 'pvc' | 'overall';
};

export function buildExecutiveInsightCards(report: CommercialReportPayload): ExecutiveInsightCard[] {
  const cl = buildMetricContext(report, 'chlorine');
  const pvc = buildMetricContext(report, 'pvc');
  const moIn = buildMetricContext(report, 'input_moisture');
  const moOut = buildMetricContext(report, 'output_moisture');
  const narrative = report.executive_narrative;

  const clVs12 =
    cl.currentWeek !== null && cl.avg12Week !== null
      ? cl.currentWeek - cl.avg12Week
      : null;

  const cards: ExecutiveInsightCard[] = [
    {
      id: 'chlorine',
      title: cl.status !== 'OK' ? 'Chlorine above normal' : 'Chlorine stable',
      body:
        cl.currentWeek !== null && cl.avg12Week !== null
          ? `Chlorine averaged ${cl.currentWeek.toFixed(3)}% vs 12-week avg of ${cl.avg12Week.toFixed(3)}%${clVs12 && clVs12 > 0 ? ` (+${clVs12.toFixed(3)} pp).` : '.'}`
          : 'Chlorine tracking within recent range.',
      tone: cl.status === 'Alert' ? 'risk' : cl.status === 'Watch' ? 'watch' : 'positive',
      icon: 'chlorine'
    },
    {
      id: 'moisture',
      title:
        moIn.currentWeek !== null && (moIn.currentWeek ?? 0) > (moIn.avg12Week ?? 0)
          ? 'Wetter incoming feed'
          : 'Moisture in range',
      body:
        moIn.currentWeek !== null && moOut.currentWeek !== null
          ? `Pre-belt dryer moisture ${moIn.currentWeek.toFixed(1)}% vs 12W ${moIn.avg12Week?.toFixed(1) ?? '—'}%; output ${moOut.currentWeek.toFixed(1)}%.`
          : 'Moisture readings available for the week.',
      tone:
        (moIn.currentWeek ?? 0) > (moIn.avg12Week ?? 0) + 1
          ? 'risk'
          : moOut.status === 'OK'
            ? 'positive'
            : 'watch',
      icon: 'moisture'
    },
    {
      id: 'pvc',
      title: pvc.status === 'OK' ? 'PVC in line' : 'PVC elevated',
      body:
        pvc.currentWeek !== null && pvc.avg12Week !== null
          ? `PVC at ${pvc.currentWeek.toFixed(2)}% vs 12W avg ${pvc.avg12Week.toFixed(2)}%. ${pvc.rankLabel}.`
          : 'PVC mix within normal operating range.',
      tone: pvc.status !== 'OK' ? 'watch' : 'positive',
      icon: 'pvc'
    },
    {
      id: 'overall',
      title: 'Overall',
      body: narrative?.summary ?? buildExecutiveVerdict(report),
      tone: cl.status !== 'OK' ? 'watch' : 'neutral',
      icon: 'overall'
    }
  ];

  return cards;
}

export function buildExecutiveBullets(report: CommercialReportPayload): string[] {
  const cl = buildMetricContext(report, 'chlorine');
  const pvc = buildMetricContext(report, 'pvc');
  const moIn = buildMetricContext(report, 'input_moisture');
  const moOut = buildMetricContext(report, 'output_moisture');

  const bullets: string[] = [];

  if (cl.currentWeek !== null) {
    const vs12 = cl.avg12Week
      ? cl.currentWeek > cl.avg12Week
        ? 'above'
        : cl.currentWeek < cl.avg12Week
          ? 'below'
          : 'in line with'
      : 'at';
    bullets.push(
      `Chlorine ${vs12} the 12-week average (${cl.currentWeek.toFixed(3)}% vs ${cl.avg12Week?.toFixed(3) ?? '—'}%).`
    );
  }
  if (moIn.currentWeek !== null && moIn.lastWeek !== null && moIn.currentWeek > moIn.lastWeek + 0.2) {
    bullets.push(
      `Pre-belt dryer moisture increased vs last week (${moIn.lastWeek.toFixed(1)}% → ${moIn.currentWeek.toFixed(1)}%).`
    );
  }
  if (
    moIn.currentWeek !== null &&
    moOut.currentWeek !== null &&
    moIn.currentWeek > (moIn.avg12Week ?? 0) &&
    moOut.currentWeek <= (moOut.avg12Week ?? 999)
  ) {
    bullets.push('Output moisture remained stable despite wetter incoming feed.');
  }
  if (pvc.currentWeek !== null && pvc.avg12Week !== null) {
    const dir =
      pvc.currentWeek > pvc.avg12Week + 0.1
        ? 'above'
        : pvc.currentWeek < pvc.avg12Week - 0.1
          ? 'below'
          : 'in line with';
    bullets.push(`PVC remained ${dir} the 12-week average (${pvc.currentWeek.toFixed(2)}%).`);
  }

  return bullets.slice(0, 4);
}

export function buildExecutiveVerdict(report: CommercialReportPayload): string {
  const cl = buildMetricContext(report, 'chlorine');
  if (cl.status === 'Alert') {
    return 'Quality requires attention — chlorine exceeded commercial limits this week.';
  }
  if (cl.status === 'Watch') {
    return 'Overall quality remained manageable, although chlorine should continue to be monitored.';
  }
  return 'Overall quality remained stable relative to the last 12 weeks.';
}

export function metricEvidenceHeadline(metricId: string, report: CommercialReportPayload): string {
  if (metricId === 'chlorine') {
    const cl = buildMetricContext(report, 'chlorine');
    if (cl.status === 'Alert') return 'Chlorine remained above normal operating conditions.';
    if (cl.status === 'Watch') return 'Chlorine is elevated vs the 12-week average.';
    return 'Chlorine is within normal operating range.';
  }
  if (metricId === 'pvc') {
    const pvc = buildMetricContext(report, 'pvc');
    if (pvc.status !== 'OK') return 'PVC share moved above the normal feed range.';
    return 'PVC remains within the normal operating mix.';
  }
  if (metricId === 'moisture') {
    const moIn = buildMetricContext(report, 'input_moisture');
    const moOut = buildMetricContext(report, 'output_moisture');
    if (
      (moIn.currentWeek ?? 0) > (moIn.avg12Week ?? 0) &&
      (moOut.currentWeek ?? 0) <= (moOut.avg12Week ?? 999)
    ) {
      return 'Wetter feed entered the plant, but output moisture remained controlled.';
    }
    return 'Moisture performance is consistent with the 12-week pattern.';
  }
  if (metricId === 'feed_volume') {
    const feed = buildMetricContext(report, 'feed_volume');
    if ((feed.currentWeek ?? 0) > (feed.avg12Week ?? 0)) return 'Feed volume ran above the 12-week average.';
    if ((feed.currentWeek ?? 0) < (feed.avg12Week ?? 0)) return 'Feed volume ran below the 12-week average.';
    return 'Feed volume aligned with the 12-week average.';
  }
  return 'Metric tracking within recent range.';
}

export function getWeeklySeries(report: CommercialReportPayload, id: string) {
  return report.weekly_series?.find((s) => s.id === id);
}

export {
  buildWeeklyChangeCards,
  buildWeeklyContextRows,
  buildCompositionCategories,
  buildCompositionAreaData,
  buildCompositionDailyTrendData,
  COMPOSITION_SHARES_NOTE,
  buildMetricContext,
  buildThresholdDistribution,
  buildExposureZoneDiffs,
  buildThresholdHistogram,
  buildThresholdSummary,
  buildTornadoItems,
  type TornadoItem,
  type ThresholdSummaryRow,
  buildValueHistogram,
  feedTonnes,
  formatWeeklyContextPosition,
  getWeeklyBarData,
  getDailyBarData,
  getDailyTrendBarData,
  getTrendBarData,
  getThisWeekDailyValues,
  getAnchorWeekKey,
  isoWeekKey,
  weekKeyLte,
  buildMoistureDailyData,
  buildMoistureDailyTrendData,
  buildThroughputBarData,
  buildThroughputDailyTrendData,
  TREND_WEEKS,
  THIS_WEEK_DAYS,
  getThresholdDailyValues,
  type ExposureZoneDiffs,
  metricRankPosition,
  percentileLabel
} from './weekly-context';
