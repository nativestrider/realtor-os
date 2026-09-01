'use client';

import { useEffect, useMemo } from 'react';
import type { PropertyStatus } from '@realtor-os/contracts';
import { formatListingStatusLabel, getListingStatusHint } from '@realtor-os/contracts';
import { useListingSettings } from '@/hooks/useListingSettings';

type PropertyStatusSelectProps = {
  status: PropertyStatus;
  disabled?: boolean;
  onChange: (status: PropertyStatus) => void;
};

export function PropertyStatusSelect({ status, disabled, onChange }: PropertyStatusSelectProps) {
  const { options, reload } = useListingSettings();

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectOptions = useMemo(() => {
    if (options.some((o) => o.id === status)) return options;
    return [
      ...options,
      { id: status, label: formatListingStatusLabel(status), hint: getListingStatusHint(status) },
    ];
  }, [options, status]);

  const current = selectOptions.find((s) => s.id === status);

  return (
    <label className="property-status-select">
      <span className="property-status-label">Listing status</span>
      <select
        value={status}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as PropertyStatus)}
        title={current?.hint}
      >
        {selectOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {current?.hint ? <span className="property-status-hint">{current.hint}</span> : null}
    </label>
  );
}
