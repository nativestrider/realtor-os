export type CompListingStatus = 'active' | 'pending' | 'sold';

/** A competing listing tracked against a subject property. */
export interface PropertyComparable {
  id: string;
  propertyId: string;
  address: string;
  title?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  listingStatus?: CompListingStatus;
  soldDate?: string;
  distanceMiles?: number;
  zillowUrl?: string;
  zpid?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateComparableRequest {
  address: string;
  title?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  listingStatus?: CompListingStatus;
  soldDate?: string;
  distanceMiles?: number;
  zillowUrl?: string;
  zpid?: string;
  notes?: string;
}

export interface UpdateComparableRequest extends Partial<CreateComparableRequest> {}
