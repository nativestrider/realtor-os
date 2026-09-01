'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AssetMetadata, ImageRole, PropertyAsset } from '@realtor-os/contracts';
import {
  DEFAULT_IMAGE_ROLES,
  formatImageRoleLabel,
  parseAssetMetadata,
} from '@realtor-os/contracts';
import { propertyFileUrl } from '@/lib/api';

interface ImageLightboxProps {
  propertyId: string;
  assets: PropertyAsset[];
  initialIndex: number;
  imageRoles: string[];
  onClose: () => void;
  onAssetUpdated?: (asset: PropertyAsset) => void;
  onSaveMetadata?: (assetId: string, metadata: AssetMetadata) => Promise<PropertyAsset>;
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

export function ImageLightbox({
  propertyId,
  assets,
  initialIndex,
  imageRoles,
  onClose,
  onAssetUpdated,
  onSaveMetadata,
}: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(initialIndex);
  const [role, setRole] = useState<ImageRole | string>('unclassified');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const asset = assets[index];
  const src = asset ? propertyFileUrl(propertyId, asset.filename) : '';
  const roleOptions = [
    ...DEFAULT_IMAGE_ROLES,
    ...imageRoles.filter((r) => !DEFAULT_IMAGE_ROLES.includes(r as ImageRole)),
  ];

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : assets.length - 1));
  }, [assets.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < assets.length - 1 ? i + 1 : 0));
  }, [assets.length]);

  useEffect(() => {
    if (!asset) return;
    const meta = parseAssetMetadata(asset.metadata);
    setRole(meta.role ?? 'unclassified');
    setNotes(meta.notes ?? '');
    setSaveError(null);
  }, [asset]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    if (!asset) return;
    const preload = (offset: number) => {
      const target = assets[index + offset];
      if (!target) return;
      const img = new Image();
      img.src = propertyFileUrl(propertyId, target.filename);
    };
    if (index > 0) preload(-1);
    if (index < assets.length - 1) preload(1);
  }, [asset, assets, index, propertyId]);

  async function handleSaveMetadata() {
    if (!asset || !onSaveMetadata) return;
    setSaving(true);
    setSaveError(null);
    try {
      const metadata: AssetMetadata = {
        role: role === 'unclassified' ? undefined : (role as ImageRole),
        notes: notes.trim() || undefined,
      };
      const updated = await onSaveMetadata(asset.id, metadata);
      onAssetUpdated?.(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!asset || !mounted) return null;

  const overlay = (
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Image viewer">
      <button type="button" className="image-lightbox-backdrop" onClick={onClose} aria-label="Close" />
      <div className="image-lightbox-content">
        <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {assets.length > 1 ? (
          <>
            <button
              type="button"
              className="image-lightbox-nav image-lightbox-prev"
              onClick={goPrev}
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              className="image-lightbox-nav image-lightbox-next"
              onClick={goNext}
              aria-label="Next image"
            >
              ›
            </button>
          </>
        ) : null}
        <div className="image-lightbox-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={basename(asset.filename)} className="image-lightbox-img" />
        </div>
        <footer className="image-lightbox-footer">
          <div className="image-lightbox-caption">
            <span className="image-lightbox-counter">
              {index + 1} / {assets.length}
            </span>
            <span className="image-lightbox-filename">{basename(asset.filename)}</span>
          </div>
          {onSaveMetadata ? (
            <div className="image-lightbox-meta">
              <label className="image-lightbox-role">
                Type
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={saving}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {formatImageRoleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="image-lightbox-notes">
                Notes
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  disabled={saving}
                />
              </label>
              <button
                type="button"
                className="secondary-btn btn-sm"
                disabled={saving}
                onClick={() => void handleSaveMetadata()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : null}
          {saveError ? <p className="image-lightbox-error">{saveError}</p> : null}
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

export function getAssetRoleLabel(asset: PropertyAsset): string | null {
  const meta = parseAssetMetadata(asset.metadata);
  if (!meta.role || meta.role === 'unclassified') return null;
  return formatImageRoleLabel(meta.role);
}
