export type ImageRole =
  | 'unclassified'
  | 'exterior'
  | 'interior'
  | 'kitchen'
  | 'bathroom'
  | 'bedroom'
  | 'blueprint'
  | 'floor_plan'
  | 'other';

export const DEFAULT_IMAGE_ROLES: ImageRole[] = [
  'unclassified',
  'exterior',
  'interior',
  'kitchen',
  'bathroom',
  'bedroom',
  'blueprint',
  'floor_plan',
  'other',
];

export const IMAGE_ROLE_LABELS: Record<ImageRole, string> = {
  unclassified: 'Unclassified',
  exterior: 'Exterior',
  interior: 'Interior',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  bedroom: 'Bedroom',
  blueprint: 'Blueprint',
  floor_plan: 'Floor plan',
  other: 'Other',
};

export interface AssetMetadata {
  role?: ImageRole;
  room?: string;
  notes?: string;
}

export interface UpdatePropertyAssetRequest {
  metadata: AssetMetadata;
}

export interface MediaSettings {
  /** Custom roles shown in per-image picker (merged with built-in defaults). */
  customImageRoles: string[];
  /** Future: auto-classify on import via agent. */
  autoClassifyOnImport?: boolean;
}

export function parseAssetMetadata(raw?: string | null): AssetMetadata {
  if (!raw?.trim()) return {};
  try {
    const data = JSON.parse(raw) as AssetMetadata;
    return {
      role: data.role,
      room: data.room?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

export function formatImageRoleLabel(role: string): string {
  if (role in IMAGE_ROLE_LABELS) {
    return IMAGE_ROLE_LABELS[role as ImageRole];
  }
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
