'use client';

import { useCallback, useState } from 'react';
import type { CompListingStatus, CreateComparableRequest, PropertyComparable } from '@realtor-os/contracts';
import { createComparable, deleteComparable, formatPrice } from '@/lib/api';

const LISTING_STATUSES: CompListingStatus[] = ['active', 'pending', 'sold'];

type ComparablesPanelProps = {
  propertyId: string;
  comparables: PropertyComparable[];
  onChange: () => void;
  embedded?: boolean;
};

const emptyForm = (): CreateComparableRequest => ({
  address: '',
  listingStatus: 'active',
});

export function ComparablesPanel({ propertyId, comparables, onChange, embedded }: ComparablesPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateComparableRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setForm(emptyForm());
    setShowForm(false);
    setError(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.address?.trim() && !form.zillowUrl?.trim()) {
      setError('Address or Zillow URL is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createComparable(propertyId, {
        ...form,
        address: form.address?.trim() ?? '',
        price: form.price ? Number(form.price) : undefined,
        beds: form.beds ? Number(form.beds) : undefined,
        baths: form.baths ? Number(form.baths) : undefined,
        sqft: form.sqft ? Number(form.sqft) : undefined,
        distanceMiles: form.distanceMiles ? Number(form.distanceMiles) : undefined,
      });
      resetForm();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (compId: string) => {
    if (!confirm('Remove this comparable?')) return;
    try {
      await deleteComparable(propertyId, compId);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className={`comparables-panel${embedded ? ' comparables-panel-embedded' : ''}`}>
      {!embedded ? (
        <>
          <div className="comparables-header">
            <h2>Comparables</h2>
            <button type="button" className="secondary-btn btn-sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancel' : '+ Add comp'}
            </button>
          </div>
          <p className="comparables-hint">Track competing listings for pricing and positioning.</p>
        </>
      ) : (
        <div className="comparables-header">
          <button type="button" className="secondary-btn btn-sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add comp'}
          </button>
        </div>
      )}

      {error ? <div className="comps-error">{error}</div> : null}

      {showForm ? (
        <form className="comp-form" onSubmit={(e) => void handleSubmit(e)}>
          <label>
            Address
            <input
              value={form.address ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="123 Main St, Brooklyn NY"
            />
          </label>
          <label>
            Zillow URL
            <input
              value={form.zillowUrl ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, zillowUrl: e.target.value }))}
              placeholder="https://www.zillow.com/homedetails/..."
            />
          </label>
          <div className="comp-form-row">
            <label>
              Price
              <input
                type="number"
                value={form.price ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </label>
            <label>
              Status
              <select
                value={form.listingStatus ?? 'active'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, listingStatus: e.target.value as CompListingStatus }))
                }
              >
                {LISTING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="comp-form-row">
            <label>
              Beds
              <input
                type="number"
                value={form.beds ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </label>
            <label>
              Baths
              <input
                type="number"
                step="0.5"
                value={form.baths ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </label>
            <label>
              Sqft
              <input
                type="number"
                value={form.sqft ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, sqft: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </label>
          </div>
          <div className="comp-form-row">
            <label>
              Distance (mi)
              <input
                type="number"
                step="0.1"
                value={form.distanceMiles ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, distanceMiles: e.target.value ? Number(e.target.value) : undefined }))
                }
              />
            </label>
            <label>
              Sold date
              <input
                type="date"
                value={form.soldDate ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, soldDate: e.target.value || undefined }))}
              />
            </label>
          </div>
          <label>
            Notes
            <textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Why this comp matters…"
            />
          </label>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save comparable'}
          </button>
        </form>
      ) : null}

      {comparables.length === 0 && !showForm ? (
        <p className="comps-empty">No comparables yet. Add competing listings to compare price and features.</p>
      ) : (
        <ul className="comp-list">
          {comparables.map((comp) => (
            <li key={comp.id} className="comp-card">
              <div className="comp-card-main">
                <div className="comp-card-title">
                  <strong>{comp.address}</strong>
                  {comp.listingStatus ? (
                    <span className={`comp-status comp-status-${comp.listingStatus}`}>{comp.listingStatus}</span>
                  ) : null}
                </div>
                <div className="comp-facts">
                  <span>{formatPrice(comp.price)}</span>
                  {comp.beds != null && <span>{comp.beds} bd</span>}
                  {comp.baths != null && <span>{comp.baths} ba</span>}
                  {comp.sqft != null && <span>{comp.sqft.toLocaleString()} sqft</span>}
                  {comp.distanceMiles != null && <span>{comp.distanceMiles} mi</span>}
                </div>
                {comp.notes ? <p className="comp-notes">{comp.notes}</p> : null}
                {comp.zillowUrl ? (
                  <a href={comp.zillowUrl} target="_blank" rel="noopener noreferrer" className="comp-link">
                    View on Zillow
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                className="comp-delete"
                onClick={() => void handleDelete(comp.id)}
                aria-label="Remove comparable"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
