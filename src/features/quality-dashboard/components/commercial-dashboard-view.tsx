'use client';

import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshButton } from '@/features/quality-dashboard/components/dashboard-toolbar-controls';
import {
  CommercialReportGrid,
  DEFAULT_COMMERCIAL_KPI_VISIBILITY,
  type CommercialKpiVisibility
} from '@/features/quality-dashboard/components/commercial/commercial-report-grid';
import { ReportHeaderLogo } from '@/features/quality-dashboard/components/report-header-logo';
import { CommercialWeekSelector } from '@/features/quality-dashboard/components/commercial-week-selector';
import { useCommercialDashboard } from '@/features/quality-dashboard/hooks/use-commercial-dashboard';
import { getSelectableWeeks2026 } from '@/features/quality-dashboard/lib/weekly-context';
import {
  exportReportElement,
  reportFilename
} from '@/features/quality-dashboard/lib/export-report';
import type { CommercialReportPayload } from '@/features/quality-dashboard/api/types';
import { plantFromParam } from '@/features/quality-dashboard/api/client';
import { getCommercialPlant, type CommercialPlantId } from '@/features/quality-dashboard/lib/commercial-plant';
import { CommercialPlantSwitch } from '@/features/quality-dashboard/components/commercial-plant-switch';
import { format } from 'date-fns';
import { ChevronDown, Eye, FileImage, Loader2, Printer, FileText } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/utils';
import { toast, Toaster } from 'sonner';

const A4_REPORT_WIDTH = 1123;

const KPI_VISIBILITY_OPTIONS: Array<{
  key: keyof CommercialKpiVisibility;
  label: string;
}> = [
  { key: 'inputVolume', label: 'Input volume' },
  { key: 'chlorine', label: 'Chlorine' },
  { key: 'pvc', label: 'PVC' },
  { key: 'inputMoisture', label: 'Input moisture' },
  { key: 'outputMoisture', label: 'Output moisture' },
  { key: 'composition', label: 'Composition' }
];

function loadKpiVisibility(storageKey: string): CommercialKpiVisibility {
  if (typeof window === 'undefined') return DEFAULT_COMMERCIAL_KPI_VISIBILITY;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_COMMERCIAL_KPI_VISIBILITY;
    return { ...DEFAULT_COMMERCIAL_KPI_VISIBILITY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_COMMERCIAL_KPI_VISIBILITY;
  }
}

function isoWeekStartUtc(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return start;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(date.getUTCDate() + days);
  return next;
}

function formatReportDateRange(start: Date, end: Date): string {
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    if (start.getUTCMonth() === end.getUTCMonth()) {
      return `${format(start, 'd')}–${format(end, 'd MMM yyyy')}`;
    }
    return `${format(start, 'd MMM')}–${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd MMM yyyy')}–${format(end, 'd MMM yyyy')}`;
}

function reportComparisonPeriodLabel(report: CommercialReportPayload): string {
  const year = report.year;
  const week = report.week_number;
  if (!year || !week) return 'Selected week vs prior 12W average';
  const weekStart = isoWeekStartUtc(year, week);
  const weekEnd = addUtcDays(weekStart, 6);
  const baselineStart = addUtcDays(weekStart, -84);
  const baselineEnd = addUtcDays(weekStart, -1);
  return `Week ${week} (${formatReportDateRange(weekStart, weekEnd)}) vs prior 12W avg (${formatReportDateRange(baselineStart, baselineEnd)})`;
}

export function CommercialDashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plantId = plantFromParam(searchParams.get('plant'));
  const plant = getCommercialPlant(plantId);
  const switchPlant = (next: CommercialPlantId) => {
    const params = new URLSearchParams(window.location.search);
    // FRM is the default, so its URL carries no plant parameter.
    if (next === 'tsp') params.set('plant', 'tsp');
    else params.delete('plant');
    router.replace(`/?${params.toString()}`, { scroll: false });
  };
  const {
    baseReport,
    loading,
    error,
    savedGeneratedAt,
    selectedWeekKey,
    setSelectedWeekKey,
    reload
  } = useCommercialDashboard(plantId);
  const [exporting, setExporting] = useState(false);
  const [isPrintView, setIsPrintView] = useState(true);
  const [a4Scale, setA4Scale] = useState(1);
  const [kpiVisibility, setKpiVisibility] = useState<CommercialKpiVisibility>(
    DEFAULT_COMMERCIAL_KPI_VISIBILITY
  );
  const [kpiVisibilityLoaded, setKpiVisibilityLoaded] = useState(false);
  const reportWrapperRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const weekOptions = useMemo(() => getSelectableWeeks2026(), []);
  const report = baseReport;

  useEffect(() => {
    const year = searchParams.get('year');
    const week = searchParams.get('week');
    if (year && week) {
      setSelectedWeekKey(`${year}-W${String(week).padStart(2, '0')}`);
    }
  }, [searchParams, setSelectedWeekKey]);

  useEffect(() => {
    if (!selectedWeekKey) return;
    const [year, weekPart] = selectedWeekKey.split('-W');
    const week = weekPart?.replace(/^W/, '');
    const params = new URLSearchParams(window.location.search);
    if (params.get('year') === year && params.get('week') === String(Number(week))) return;
    params.set('year', year);
    params.set('week', String(Number(week)));
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [selectedWeekKey, router]);

  useEffect(() => {
    document.title = plant.reportTitle;
  }, [plant.reportTitle]);

  useEffect(() => {
    setKpiVisibility(loadKpiVisibility(plant.kpiVisibilityStorageKey));
    setKpiVisibilityLoaded(true);
  }, [plant.kpiVisibilityStorageKey]);

  useEffect(() => {
    if (!kpiVisibilityLoaded) return;
    window.localStorage.setItem(plant.kpiVisibilityStorageKey, JSON.stringify(kpiVisibility));
  }, [kpiVisibility, kpiVisibilityLoaded, plant.kpiVisibilityStorageKey]);

  useEffect(() => {
    if (!isPrintView || exporting) {
      setA4Scale(1);
      return;
    }
    const wrapper = reportWrapperRef.current;
    if (!wrapper) return;
    const fitReportToWrapper = () => {
      const newScale = Math.min(1, wrapper.clientWidth / A4_REPORT_WIDTH);
      setA4Scale((current) => (Math.abs(current - newScale) < 0.005 ? current : newScale));
    };
    fitReportToWrapper();
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(fitReportToWrapper);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [exporting, isPrintView]);

  const handleExport = async (formatType: 'png' | 'pdf') => {
    if (!report || !reportRef.current) return;
    const wasPrintView = isPrintView;
    flushSync(() => {
      setExporting(true);
      setIsPrintView(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      const filename = reportFilename(plant.filenamePrefix, report.generated_at, {
        weekNumber: report.week_number,
        exportedAt: new Date()
      });
      if (formatType === 'pdf') {
        await exportReportElement(reportRef.current, formatType, filename);
        toast.success('Print dialog opened — choose Save as PDF');
      } else {
        const id = toast.loading('Generating PNG...');
        await exportReportElement(reportRef.current, formatType, filename);
        toast.success('PNG downloaded', { id });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsPrintView(wasPrintView);
      setExporting(false);
    }
  };

  const visibleKpiCount = useMemo(
    () => KPI_VISIBILITY_OPTIONS.filter((option) => kpiVisibility[option.key]).length,
    [kpiVisibility]
  );

  if (loading) {
    return (
      <PageContainer>
        <div className='flex flex-col gap-3'>
          <Skeleton className='h-8 w-64' />
          <Skeleton className='h-24 rounded-xl' />
          <div className='grid grid-cols-5 gap-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-24 rounded-xl' />
            ))}
          </div>
          <Skeleton className='h-48 rounded-xl' />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className='flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-destructive/20 bg-destructive/5 p-8 text-center'>
          <p className='text-sm font-semibold text-destructive'>{error || 'Failed to load report'}</p>
          <Button onClick={reload} variant='outline' className='mt-4'>
            Retry
          </Button>
        </div>
      </PageContainer>
    );
  }

  const comparisonPeriodLabel = report
    ? reportComparisonPeriodLabel(report)
    : 'Selected week vs prior 12W average';

  return (
    <>
      <Toaster richColors position='top-center' />
      <PageContainer>
        <div className='no-print mb-3 flex flex-wrap items-center justify-end gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <CommercialPlantSwitch value={plantId} onChange={switchPlant} />
            {weekOptions.length > 0 ? (
              <CommercialWeekSelector
                weeks={weekOptions}
                value={selectedWeekKey}
                onChange={setSelectedWeekKey}
              />
            ) : null}
            {savedGeneratedAt ? <Badge variant='secondary'>Saved run</Badge> : null}
            <RefreshButton onClick={reload} loading={loading} />
            <Button
              variant={isPrintView ? 'secondary' : 'outline'}
              size='sm'
              className={cn(
                'h-8 gap-1 text-xs transition-all',
                isPrintView && 'bg-primary text-primary-foreground hover:bg-primary/95'
              )}
              onClick={() => setIsPrintView(!isPrintView)}
            >
              <FileText className='size-3.5' />
              A4 Layout: {isPrintView ? 'ON' : 'OFF'}
            </Button>
            <Button
              variant='outline'
              size='sm'
              className='h-8 gap-1 text-xs'
              disabled={exporting || !report}
              onClick={() => handleExport('png')}
            >
              {exporting ? <Loader2 className='size-3.5 animate-spin' /> : <FileImage className='size-3.5' />}
              PNG
            </Button>
            <Button
              variant='outline'
              size='sm'
              className='h-8 gap-1 text-xs'
              disabled={exporting || !report}
              onClick={() => handleExport('pdf')}
            >
              <Printer className='size-3.5' />
              PDF / Print
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-8 gap-1.5 border-dashed px-2.5 text-xs font-medium'
                >
                  <Eye className='size-3.5 text-muted-foreground' />
                  KPI visibility
                  <Badge variant='secondary' className='h-5 px-1.5 font-mono text-[10px]'>
                    {visibleKpiCount}/{KPI_VISIBILITY_OPTIONS.length}
                  </Badge>
                  <ChevronDown className='size-3.5 text-muted-foreground' />
                </Button>
              </PopoverTrigger>
              <PopoverContent align='end' className='w-64 p-3'>
                <div className='space-y-2'>
                  {KPI_VISIBILITY_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className='flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[11px] font-medium'
                    >
                      <Checkbox
                        checked={kpiVisibility[option.key]}
                        onCheckedChange={(checked) => {
                          setKpiVisibility((current) => ({
                            ...current,
                            [option.key]: checked === true
                          }));
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {!report ? (
          <div className='rounded-xl border border-dashed bg-card p-8 text-center'>
            <h2 className='text-base font-semibold'>No saved commercial report for this week</h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              Select another week, or ask the {plant.code} team to run the calculation for this period.
            </p>
          </div>
        ) : (
          <div
            ref={reportWrapperRef}
            id='commercial-dashboard-report-wrapper'
            className={cn(
              'w-full',
              isPrintView && 'overflow-x-hidden rounded-xl border border-border bg-muted/20 py-4'
            )}
          >
            <div
              ref={reportRef}
              id='commercial-dashboard-report'
              data-a4-layout={isPrintView ? 'true' : undefined}
              style={isPrintView && !exporting ? { zoom: a4Scale } : undefined}
              className={cn(
                'flex flex-col gap-2 transition-all duration-300',
                isPrintView
                  ? 'mx-auto w-[1123px] min-w-[1123px] rounded-lg border border-border bg-card p-6 shadow-none'
                  : 'w-full p-0.5'
              )}
            >
              <div className='report-header flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-2'>
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h2 className='text-base font-bold tracking-tight'>{plant.reportTitle}</h2>
                    {report.week_number ? (
                      <Badge variant='secondary' className='font-mono text-[10px]'>
                        W{report.week_number}
                      </Badge>
                    ) : null}
                  </div>
                  <p className='text-muted-foreground mt-0.5 text-[10px]'>{comparisonPeriodLabel}</p>
                </div>
                <ReportHeaderLogo showOnScreen />
              </div>
              <CommercialReportGrid report={report} visibility={kpiVisibility} plant={plantId} />
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
