import type { CommercialPlantId } from '@/features/quality-dashboard/api/client';

export type { CommercialPlantId };

export type CommercialPlantDefinition = {
  id: CommercialPlantId;
  /** Short plant code shown in titles. */
  code: string;
  reportTitle: string;
  filenamePrefix: string;
  kpiVisibilityStorageKey: string;
  /** Plant-local time used for footer timestamps and shift labels. */
  timezone: string;
  timezoneLabel: string;
  /** Reject-stream sorter available (FRM F308). Drives Ejected PVC / sorter Q. */
  hasEjectedStream: boolean;
  /** FRM-only supplier / mono-stream pages. */
  hasSupplierSections: boolean;
  labels: {
    pvcSub: string;
    pvcSource: string;
    chlorineSub: string;
    chlorineSource: string;
    inputMoistureSource: string;
  };
  /** Short row names for per-stream PVC cards (metric id → title / sub). */
  streamRows: Record<string, { title: string; sub: string }>;
};

export const COMMERCIAL_PLANTS: Record<CommercialPlantId, CommercialPlantDefinition> = {
  frm: {
    id: 'frm',
    code: 'FRM',
    reportTitle: 'FRM Weekly Commercial Review',
    filenamePrefix: 'frm-commercial-weekly-review',
    kpiVisibilityStorageKey: 'frm-commercial-kpi-visibility',
    timezone: 'Europe/Amsterdam',
    timezoneLabel: 'Amsterdam time',
    hasEjectedStream: true,
    hasSupplierSections: true,
    labels: {
      pvcSub: 'Feed composition',
      pvcSource: 'Optical sorter feed mix',
      chlorineSub: 'Pre-pelletizer quality',
      chlorineSource: 'Pre-pelletizer quality',
      inputMoistureSource: 'Pre-dryer feed moisture'
    },
    streamRows: {}
  },
  tsp: {
    id: 'tsp',
    code: 'TSP',
    reportTitle: 'TSP Weekly Commercial Review',
    filenamePrefix: 'tsp-commercial-weekly-review',
    kpiVisibilityStorageKey: 'tsp-commercial-kpi-visibility',
    timezone: 'Europe/London',
    timezoneLabel: 'UK time',
    hasEjectedStream: false,
    hasSupplierSections: false,
    labels: {
      pvcSub: 'All sorters',
      pvcSource: 'Optical sorters, all 4',
      chlorineSub: 'Pre-dryer analyser',
      chlorineSource: 'Pre-dryer analyser',
      inputMoistureSource: 'Pre-dryer analyser'
    },
    streamRows: {
      pvc_lights: { title: 'Lights PVC', sub: 'OS1 + OS2' },
      pvc_mediums: { title: 'Mediums PVC', sub: 'OS3 + OS4' }
    }
  }
};

export function getCommercialPlant(plant?: string | null): CommercialPlantDefinition {
  return plant === 'tsp' ? COMMERCIAL_PLANTS.tsp : COMMERCIAL_PLANTS.frm;
}
