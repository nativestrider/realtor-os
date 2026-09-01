'use client';

import { useRef, useState } from 'react';
import type { Property } from '@realtor-os/contracts';
import { importFolderToProperty, updateProperty } from '@/lib/api';
import { isValidZillowUrl } from '@/lib/property-setup';

interface PropertySetupPanelProps {
  property: Property;
  onUpdated: () => void;
  onZillowImport: (url: string) => void;
}

export function PropertySetupPanel({ property, onUpdated, onZillowImport }: PropertySetupPanelProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [zillowUrl, setZillowUrl] = useState(property.zillowUrl ?? '');
  const [busy, setBusy] = useState<'folder' | 'zillow' | 'manual' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({
    title: property.title === 'New property' ? '' : property.title,
    address: property.address === 'Address TBD' ? '' : property.address,
    price: '',
    beds: '',
    baths: '',
    sqft: '',
    description: '',
  });

  async function handleFolderSelect(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy('folder');
    setError(null);
    try {
      await importFolderToProperty(property.id, files);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  }

  async function handleZillow() {
    if (!isValidZillowUrl(zillowUrl) || busy) return;
    setBusy('zillow');
    setError(null);
    try {
      await updateProperty(property.id, { zillowUrl: zillowUrl.trim() });
      onZillowImport(zillowUrl.trim());
      setBusy(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function handleManualSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy('manual');
    setError(null);
    try {
      const price = manual.price.trim() ? Number(manual.price.replace(/,/g, '')) : null;
      const beds = manual.beds.trim() ? Number(manual.beds) : null;
      const baths = manual.baths.trim() ? Number(manual.baths) : null;
      const sqft = manual.sqft.trim() ? Number(manual.sqft.replace(/,/g, '')) : null;
      await updateProperty(property.id, {
        title: manual.title.trim() || property.title,
        address: manual.address.trim() || property.address,
        price: Number.isFinite(price) ? price : null,
        beds: Number.isFinite(beds) ? beds : null,
        baths: Number.isFinite(baths) ? baths : null,
        sqft: Number.isFinite(sqft) ? sqft : null,
        description: manual.description.trim() || undefined,
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="property-setup-panel" aria-label="Add property data">
      <h2 className="property-setup-title">Add listing data</h2>
      <p className="property-setup-lead">
        This property is empty. Import from Zillow or a folder, or enter details yourself.
      </p>

      <div className="property-setup-cards">
        <div className="property-setup-card">
          <h3>Import folder</h3>
          <p>
            Choose a folder with <code>property.json</code>, <code>images/</code>, or an exported workspace.
          </p>
          <input
            ref={folderInputRef}
            type="file"
            className="folder-input"
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            directory=""
            multiple
            onChange={(e) => void handleFolderSelect(e.target.files)}
          />
          <button
            type="button"
            className="primary-btn btn-sm"
            disabled={busy != null}
            onClick={() => folderInputRef.current?.click()}
          >
            {busy === 'folder' ? 'Importing…' : 'Choose folder'}
          </button>
        </div>

        <div className="property-setup-card">
          <h3>Import from Zillow</h3>
          <p>Paste a Zillow listing URL. The agent will pull photos and facts into this property.</p>
          <input
            type="url"
            value={zillowUrl}
            onChange={(e) => setZillowUrl(e.target.value)}
            placeholder="https://www.zillow.com/homedetails/…"
            disabled={busy != null}
          />
          <button
            type="button"
            className="primary-btn btn-sm"
            disabled={!isValidZillowUrl(zillowUrl) || busy != null}
            onClick={() => void handleZillow()}
          >
            {busy === 'zillow' ? 'Starting…' : 'Import from Zillow'}
          </button>
        </div>

        <div className="property-setup-card property-setup-card-wide">
          <h3>Enter manually</h3>
          <p>Add price, beds, and description without importing.</p>
          {!showManual ? (
            <button
              type="button"
              className="secondary-btn btn-sm"
              disabled={busy != null}
              onClick={() => setShowManual(true)}
            >
              Fill in details
            </button>
          ) : (
            <form className="property-setup-form" onSubmit={(e) => void handleManualSave(e)}>
              <div className="property-setup-form-row">
                <label>
                  Title
                  <input
                    value={manual.title}
                    onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))}
                    placeholder="Listing title"
                  />
                </label>
                <label>
                  Address
                  <input
                    value={manual.address}
                    onChange={(e) => setManual((m) => ({ ...m, address: e.target.value }))}
                    placeholder="Street, city, state"
                  />
                </label>
              </div>
              <div className="property-setup-form-row">
                <label>
                  Price
                  <input
                    inputMode="numeric"
                    value={manual.price}
                    onChange={(e) => setManual((m) => ({ ...m, price: e.target.value }))}
                    placeholder="899000"
                  />
                </label>
                <label>
                  Beds
                  <input
                    inputMode="numeric"
                    value={manual.beds}
                    onChange={(e) => setManual((m) => ({ ...m, beds: e.target.value }))}
                  />
                </label>
                <label>
                  Baths
                  <input
                    inputMode="decimal"
                    value={manual.baths}
                    onChange={(e) => setManual((m) => ({ ...m, baths: e.target.value }))}
                  />
                </label>
                <label>
                  Sqft
                  <input
                    inputMode="numeric"
                    value={manual.sqft}
                    onChange={(e) => setManual((m) => ({ ...m, sqft: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                Description
                <textarea
                  rows={3}
                  value={manual.description}
                  onChange={(e) => setManual((m) => ({ ...m, description: e.target.value }))}
                  placeholder="Marketing description or notes"
                />
              </label>
              <button type="submit" className="primary-btn btn-sm" disabled={busy != null}>
                {busy === 'manual' ? 'Saving…' : 'Save details'}
              </button>
            </form>
          )}
        </div>
      </div>

      {error ? <div className="connection-banner property-setup-error">{error}</div> : null}
    </section>
  );
}
