import type { MediaSettings } from './media.js';
import type { ListingSettings } from './listing.js';

export const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  customImageRoles: [],
  autoClassifyOnImport: false,
};

export { DEFAULT_LISTING_SETTINGS } from './listing.js';

export interface UserSettings {
  displayName?: string;
  role?: string;
  brokerage?: string;
  communicationStyle?: string;
  customInstructions?: string;
  /** User-pinned facts (editable in Settings). */
  memories: string[];
  /** Facts extracted from chats via "Remember from this chat". */
  learnedMemories: string[];
  mediaSettings?: MediaSettings;
  listingSettings?: ListingSettings;
}

export interface UpdateUserSettingsRequest extends Partial<Omit<UserSettings, 'memories' | 'learnedMemories'>> {
  memories?: string[];
  learnedMemories?: string[];
  /** When true, clears agent-learned memories (pinned memories are kept). */
  clearLearnedMemories?: boolean;
}

export interface UpdateConversationRequest {
  agentId?: import('./index.js').AgentId;
  model?: string;
}

export interface MemoryStatus {
  pinnedCount: number;
  learnedCount: number;
}

export interface ExtractMemoriesResponse {
  added: string[];
  memory: MemoryStatus;
}
