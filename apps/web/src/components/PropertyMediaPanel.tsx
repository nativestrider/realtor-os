'use client';

import { useState } from 'react';
import type { Property, PropertyAsset, PropertyComparable } from '@realtor-os/contracts';
import { ComparablesPanel } from '@/components/ComparablesPanel';
import { PhotoGallery } from '@/components/PhotoGallery';
import { PropertyActions } from '@/components/PropertyActions';
import { PropertySetupPanel } from '@/components/PropertySetupPanel';
import { formatPrice } from '@/lib/api';
import { propertyNeedsSetup } from '@/lib/property-setup';
import type { SkillAdmissibility } from '@/lib/property-actions';

type Tab = 'overview' | 'photos' | 'comps' | 'actions';

interface PropertyMediaPanelProps {
  property: Property;
  assets: PropertyAsset[];
  comparables: PropertyComparable[];
  photoTab: 'original' | 'staged';
  onPhotoTabChange: (tab: 'original' | 'staged') => void;
  onComparablesChange: () => void;
  actions: SkillAdmissibility[];
  actionsRunning: boolean;
  onRunAction: (action: SkillAdmissibility) => void;
  onPropertyUpdated: () => void;
  onZillowImport: (url: string) => void;
  onCompZillowImport?: (url: string) => void;
  onAssetChange?: (asset: PropertyAsset) => void;
}

export function PropertyMediaPanel({
  property,
  assets,
  comparables,
  photoTab,
  onPhotoTabChange,
  onComparablesChange,
  actions,
  actionsRunning,
  onRunAction,
  onPropertyUpdated,
  onZillowImport,
  onCompZillowImport,
  onAssetChange,
}: PropertyMediaPanelProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [descExpanded, setDescExpanded] = useState(false);

  const photoCount = assets.filter((a) => a.kind === 'photo').length;
  const readyActionCount = actions.filter((a) => a.availability === 'ready').length;
  const needsSetup = propertyNeedsSetup(property, photoCount);
  const desc = property.description ?? '';
  const descLong = desc.length > 320;

  return (
    <div className="property-media-panel">
      <div className="property-tabs" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['photos', `Photos (${photoCount})`],
            ['comps', `Comps (${comparables.length})`],
            ['actions', readyActionCount > 0 ? `Actions (${readyActionCount})` : 'Actions'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="property-overview" role="tabpanel">
          {needsSetup ? (
            <PropertySetupPanel
              property={property}
              onUpdated={onPropertyUpdated}
              onZillowImport={onZillowImport}
            />
          ) : null}
          <dl className="property-facts-grid">
            <div>
              <dt>Price</dt>
              <dd>{formatPrice(property.price)}</dd>
            </div>
            {property.beds != null ? (
              <div>
                <dt>Beds</dt>
                <dd>{property.beds}</dd>
              </div>
            ) : null}
            {property.baths != null ? (
              <div>
                <dt>Baths</dt>
                <dd>{property.baths}</dd>
              </div>
            ) : null}
            {property.sqft != null ? (
              <div>
                <dt>Sqft</dt>
                <dd>{property.sqft.toLocaleString()}</dd>
              </div>
            ) : null}
            {property.zpid ? (
              <div>
                <dt>ZPID</dt>
                <dd>{property.zpid}</dd>
              </div>
            ) : null}
          </dl>
          {property.zillowUrl ? (
            <a href={property.zillowUrl} target="_blank" rel="noopener noreferrer" className="property-zillow-link">
              View on Zillow
            </a>
          ) : null}
          {desc ? (
            <div className="property-overview-description">
              <h3>Description</h3>
              <p className={descExpanded ? '' : 'clamped'}>{desc}</p>
              {descLong ? (
                <button type="button" className="text-btn" onClick={() => setDescExpanded((v) => !v)}>
                  {descExpanded ? 'Show less' : 'Show more'}
                </button>
              ) : null}
            </div>
          ) : needsSetup ? null : (
            <p className="property-overview-empty">No description yet.</p>
          )}
        </div>
      ) : null}

      {tab === 'photos' ? (
        <div role="tabpanel">
          <PhotoGallery
            assets={assets}
            propertyId={property.id}
            tab={photoTab}
            onTabChange={onPhotoTabChange}
            embedded
            onAssetChange={onAssetChange}
          />
        </div>
      ) : null}

      {tab === 'comps' ? (
        <div role="tabpanel">
          <ComparablesPanel
            propertyId={property.id}
            comparables={comparables}
            onChange={onComparablesChange}
            onImportFromZillow={onCompZillowImport}
            importingFromZillow={actionsRunning}
            embedded
          />
        </div>
      ) : null}

      {tab === 'actions' ? (
        <div role="tabpanel">
          <PropertyActions
            actions={actions}
            running={actionsRunning}
            onRun={onRunAction}
            embedded
          />
        </div>
      ) : null}
    </div>
  );
}
