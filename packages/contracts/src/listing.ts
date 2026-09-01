export const BUILTIN_LISTING_STATUSES = [
  { id: 'draft', label: 'Draft', hint: 'Preparing — not on market yet' },
  { id: 'active', label: 'Active', hint: 'Listed and actively selling' },
  { id: 'sold', label: 'Sold', hint: 'Closed or off market' },
] as const;

export type BuiltinListingStatus = (typeof BUILTIN_LISTING_STATUSES)[number]['id'];

export interface ListingStatusOption {
  id: string;
  label: string;
  hint?: string;
}

export interface ListingSettings {
  /** Custom statuses merged with built-in defaults for pickers and filters. */
  customStatuses: string[];
}

export const DEFAULT_LISTING_SETTINGS: ListingSettings = {
  customStatuses: [],
};

export function normalizeListingStatusId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function formatListingStatusLabel(status: string): string {
  const builtin = BUILTIN_LISTING_STATUSES.find((s) => s.id === status);
  if (builtin) return builtin.label;
  return status
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function getListingStatusHint(status: string): string | undefined {
  return BUILTIN_LISTING_STATUSES.find((s) => s.id === status)?.hint;
}

export function getListingStatusOptions(settings?: ListingSettings): ListingStatusOption[] {
  const seen = new Set<string>();
  const options: ListingStatusOption[] = [];

  for (const builtin of BUILTIN_LISTING_STATUSES) {
    seen.add(builtin.id);
    options.push({ id: builtin.id, label: builtin.label, hint: builtin.hint });
  }

  for (const raw of settings?.customStatuses ?? []) {
    const id = normalizeListingStatusId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label: formatListingStatusLabel(id) });
  }

  return options;
}

/** Include statuses present on properties but not in configured taxonomy (e.g. legacy values). */
export function mergeListingStatusOptions(
  configured: ListingStatusOption[],
  propertyStatuses: string[],
): ListingStatusOption[] {
  const seen = new Set(configured.map((o) => o.id));
  const extras: ListingStatusOption[] = [];
  for (const status of propertyStatuses) {
    if (!status || seen.has(status)) continue;
    seen.add(status);
    extras.push({
      id: status,
      label: formatListingStatusLabel(status),
      hint: getListingStatusHint(status),
    });
  }
  return [...configured, ...extras];
}
