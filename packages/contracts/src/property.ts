import type { BuiltinListingStatus } from './listing.js';

/** Built-in values are draft | active | sold; custom statuses from Settings are also allowed. */
export type PropertyStatus = BuiltinListingStatus | (string & {});

export type PropertyAssetKind = 'photo' | 'staged';

export interface Property {
  id: string;
  title: string;
  address: string;
  status: PropertyStatus;
  zillowUrl?: string;
  zpid?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  description?: string;
  coverImage?: string;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
}

/** Property row for list/dashboard views. */
export interface PropertySummary extends Property {
  photoCount?: number;
  compCount?: number;
  hasImport?: boolean;
}

export interface PropertyAsset {
  id: string;
  propertyId: string;
  kind: PropertyAssetKind;
  filename: string;
  url?: string;
  metadata?: string;
  createdAt: string;
}

export interface CreatePropertyRequest {
  title?: string;
  address?: string;
  status?: PropertyStatus;
}

export interface UpdatePropertyRequest {
  title?: string;
  address?: string;
  status?: PropertyStatus;
  zillowUrl?: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  description?: string;
}

export interface ImportZillowRequest {
  url: string;
  mode?: 'default' | 'duplicate' | 'refresh';
  agentId?: import('./index.js').AgentId;
  model?: string;
}

export interface ImportZillowResponse {
  property: Property;
  existing?: boolean;
}

export interface ImportFolderResponse {
  property: Property;
  filesWritten: number;
}

export interface PropertyActionRequest {
  agentId?: import('./index.js').AgentId;
  model?: string;
  message?: string;
}

export interface PropertyFileEntry {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  examplePrompt?: string;
  category?: string;
  featured?: boolean;
  skillPath?: string;
  scripts?: string[];
  requiredCapabilities?: import('./index.js').AgentCapability[];
  allowedAgents?: import('./index.js').AgentId[];
  imageModel?: string;
}
