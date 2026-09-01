'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AssetMetadata, PropertyAsset } from '@realtor-os/contracts';
import { fetchSettings, propertyFileUrl, updatePropertyAsset } from '@/lib/api';
import { getAssetRoleLabel, ImageLightbox } from '@/components/ImageLightbox';

interface PhotoGalleryProps {
  assets: PropertyAsset[];
  propertyId: string;
  tab: 'original' | 'staged';
  onTabChange: (tab: 'original' | 'staged') => void;
  embedded?: boolean;
  onAssetChange?: (asset: PropertyAsset) => void;
}

export function PhotoGallery({
  assets,
  propertyId,
  tab,
  onTabChange,
  embedded,
  onAssetChange,
}: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [customRoles, setCustomRoles] = useState<string[]>([]);

  const filtered = assets.filter((a) => (tab === 'original' ? a.kind === 'photo' : a.kind === 'staged'));

  useEffect(() => {
    void fetchSettings()
      .then((data) => setCustomRoles(data.settings.mediaSettings?.customImageRoles ?? []))
      .catch(() => setCustomRoles([]));
  }, []);

  const saveMetadata = useCallback(
    async (assetId: string, metadata: AssetMetadata) => {
      const updated = await updatePropertyAsset(propertyId, assetId, metadata);
      onAssetChange?.(updated);
      return updated;
    },
    [onAssetChange, propertyId],
  );

  return (
    <div className={`photo-gallery${embedded ? ' photo-gallery-embedded' : ''}`}>
      <div className="photo-tabs">
        <button
          type="button"
          className={tab === 'original' ? 'active' : ''}
          onClick={() => onTabChange('original')}
        >
          Original ({assets.filter((a) => a.kind === 'photo').length})
        </button>
        <button
          type="button"
          className={tab === 'staged' ? 'active' : ''}
          onClick={() => onTabChange('staged')}
        >
          Staged ({assets.filter((a) => a.kind === 'staged').length})
        </button>
      </div>
      <div className="photo-grid">
        {filtered.length === 0 ? (
          <div className="empty-state">No photos yet. Run Import from Zillow to fetch gallery images.</div>
        ) : (
          filtered.map((asset, idx) => {
            const src = propertyFileUrl(propertyId, asset.filename);
            const roleLabel = getAssetRoleLabel(asset);
            return (
              <button
                key={asset.id}
                type="button"
                className="photo-item photo-item-btn"
                onClick={() => setLightboxIndex(idx)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={asset.filename} loading="lazy" />
                {roleLabel ? <span className="photo-item-badge">{roleLabel}</span> : null}
              </button>
            );
          })
        )}
      </div>
      {lightboxIndex != null && filtered.length > 0 ? (
        <ImageLightbox
          propertyId={propertyId}
          assets={filtered}
          initialIndex={lightboxIndex}
          imageRoles={customRoles}
          onClose={() => setLightboxIndex(null)}
          onAssetUpdated={onAssetChange}
          onSaveMetadata={saveMetadata}
        />
      ) : null}
    </div>
  );
}
