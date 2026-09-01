'use client';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { RangePreset } from '@/features/quality-dashboard/api/types';
import { IconRefresh } from '@tabler/icons-react';

export function RangePresetControl({
  preset,
  onChange,
  disabled
}: {
  preset: RangePreset;
  onChange: (value: RangePreset) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type='single'
      value={preset}
      onValueChange={(value) => value && onChange(value as RangePreset)}
      disabled={disabled}
      className='justify-start'
    >
      <ToggleGroupItem value='6h' aria-label='Last 6 hours'>
        6h
      </ToggleGroupItem>
      <ToggleGroupItem value='24h' aria-label='Last 24 hours'>
        24h
      </ToggleGroupItem>
      <ToggleGroupItem value='7d' aria-label='Last 7 days'>
        7d
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function RefreshButton({
  onClick,
  loading
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <Button variant='outline' size='sm' onClick={onClick} disabled={loading}>
      <IconRefresh className={loading ? 'animate-spin' : ''} />
      Refresh
    </Button>
  );
}
