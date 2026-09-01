'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropertySummary } from '@realtor-os/contracts';
import { mergeListingStatusOptions } from '@realtor-os/contracts';
import { AddPropertyMenu } from '@/components/AddPropertyMenu';
import { AppShell } from '@/components/AppShell';
import { PropertyCard } from '@/components/PropertyCard';
import { useListingSettings } from '@/hooks/useListingSettings';
import { fetchProperties, getApiToken } from '@/lib/api';

type SortKey = 'updated' | 'price' | 'title';

export default function HomePage() {
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const { options: listingStatusOptions } = useListingSettings();

  const loadProperties = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && !getApiToken()) {
        setConnectionError(
          'Missing login token. Open the full link from your terminal — it ends with #token=...',
        );
        return;
      }
      const list = await fetchProperties();
      setProperties(list);
      setConnectionError(null);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  const statusOptions = useMemo(
    () => mergeListingStatusOptions(listingStatusOptions, properties.map((p) => p.status)),
    [listingStatusOptions, properties],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = properties;
    if (statusFilter) {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          (p.zpid?.includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => {
      if (sort === 'price') return (b.price ?? 0) - (a.price ?? 0);
      if (sort === 'title') return a.title.localeCompare(b.title);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [properties, search, sort, statusFilter]);

  const hasFilters = Boolean(search.trim() || statusFilter);

  return (
    <AppShell addPropertySlot={<AddPropertyMenu onCreated={() => void loadProperties()} />}>
      {connectionError ? <div className="connection-banner">{connectionError}</div> : null}

      <div className="dashboard-toolbar">
        <input
          type="search"
          className="dashboard-search"
          placeholder="Search by address or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="dashboard-sort">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dashboard-sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updated">Recently updated</option>
            <option value="price">Price</option>
            <option value="title">Title</option>
          </select>
        </label>
        <button type="button" className="secondary-btn btn-sm" onClick={() => void loadProperties()}>
          Refresh
        </button>
      </div>

      <div className="property-list">
        {loading ? (
          <div className="empty-state">Loading properties…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state dashboard-empty">
            <p>{hasFilters ? 'No properties match your filters.' : 'No properties yet.'}</p>
            {!hasFilters ? <p className="empty-hint">Use <strong>+ Add property</strong> above to get started.</p> : null}
          </div>
        ) : (
          filtered.map((property) => <PropertyCard key={property.id} property={property} />)
        )}
      </div>
    </AppShell>
  );
}
