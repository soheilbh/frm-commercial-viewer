'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { CommercialWeekOption } from '@/features/quality-dashboard/lib/commercial-week-scope';
import { CalendarDays } from 'lucide-react';

export function CommercialWeekSelector({
  weeks,
  value,
  onChange,
  className
}: {
  weeks: CommercialWeekOption[];
  value: string;
  onChange: (weekKey: string) => void;
  className?: string;
}) {
  if (!weeks.length) return null;

  return (
    <div className={className}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size='sm' className='h-8 min-w-[7.5rem] font-mono text-xs'>
          <CalendarDays className='size-3.5 text-muted-foreground' />
          <SelectValue placeholder='Select week' />
        </SelectTrigger>
        <SelectContent align='end'>
          {weeks.map((w) => (
            <SelectItem key={w.key} value={w.key} className='font-mono text-xs'>
              {w.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
