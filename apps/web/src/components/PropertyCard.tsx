'use client';

import Link from 'next/link';
import type { PropertySummary } from '@realtor-os/contracts';
import { formatListingStatusLabel } from '@realtor-os/contracts';
import { formatPrice, propertyFileUrl } from '@/lib/api';

interface PropertyCardProps {
  property: PropertySummary;
}

export function PropertyCard({ property }: PropertyCardProps) {
  const coverSrc = property.coverImage
    ? propertyFileUrl(property.id, property.coverImage)
    : null;

  const hasImport =
    property.hasImport ??
    (property.price != null ||
      (property.photoCount ?? 0) > 0 ||
      Boolean(property.coverImage));

  return (
    <Link href={`/properties/${property.id}`} className="property-card">
      <div className="property-card-cover">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt={property.address} />
        ) : (
          <div className="property-card-placeholder">No photo yet</div>
        )}
      </div>
      <div className="property-card-body">
        <div className="property-card-header">
          <h3>{property.title}</h3>
          <span className={`status-badge status-${property.status}`}>
            {formatListingStatusLabel(property.status)}
          </span>
        </div>
        <p className="property-card-address">{property.address}</p>
        <div className="property-card-meta">
          <span>{formatPrice(property.price)}</span>
          {property.beds != null && <span>{property.beds} bd</span>}
          {property.baths != null && <span>{property.baths} ba</span>}
          {property.sqft != null && <span>{property.sqft.toLocaleString()} sqft</span>}
          {property.photoCount != null && property.photoCount > 0 ? (
            <span className="property-card-photos">{property.photoCount} photos</span>
          ) : null}
          {property.compCount != null && property.compCount > 0 ? (
            <span className="property-card-comps">{property.compCount} comps</span>
          ) : null}
        </div>
        {!hasImport ? <span className="property-card-draft-hint">Needs import</span> : null}
      </div>
    </Link>
  );
}
