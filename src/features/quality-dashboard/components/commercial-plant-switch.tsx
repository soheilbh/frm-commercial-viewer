'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  COMMERCIAL_PLANTS,
  type CommercialPlantId
} from '@/features/quality-dashboard/lib/commercial-plant';
import { cn } from '@/lib/utils';

/** FRM / TSP switch for the weekly commercial review. */
export function CommercialPlantSwitch({
  value,
  onChange,
  className
}: {
  value: CommercialPlantId;
  onChange: (plant: CommercialPlantId) => void;
  className?: string;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next !== value) onChange(next as CommercialPlantId);
      }}
      className={cn('no-print w-fit', className)}
    >
      <TabsList className='h-8'>
        {Object.values(COMMERCIAL_PLANTS).map((plant) => (
          <TabsTrigger key={plant.id} value={plant.id} className='px-3 text-xs font-semibold'>
            {plant.code}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
