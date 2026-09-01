'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ListingStatusOption } from '@realtor-os/contracts';
import { getListingStatusOptions } from '@realtor-os/contracts';
import { fetchSettings } from '@/lib/api';

export function useListingSettings() {
  const [options, setOptions] = useState<ListingStatusOption[]>(() => getListingStatusOptions());

  const load = useCallback(async () => {
    const data = await fetchSettings();
    setOptions(getListingStatusOptions(data.settings.listingSettings));
  }, []);

  useEffect(() => {
    void load().catch(() => {
      setOptions(getListingStatusOptions());
    });
  }, [load]);

  return { options, reload: load };
}
