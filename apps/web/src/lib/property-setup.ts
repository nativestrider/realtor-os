import type { Property } from '@realtor-os/contracts';

/** True when the property has no imported listing data yet. */
export function propertyNeedsSetup(property: Property, photoCount: number): boolean {
  const hasFacts =
    property.price != null ||
    Boolean(property.description?.trim()) ||
    property.beds != null ||
    photoCount > 0;
  return !hasFacts;
}

export function isValidZillowUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname.includes('zillow.com') && parsed.pathname.includes('/homedetails/');
  } catch {
    return false;
  }
}
