import {
  formatUserSettingsForPrompt,
  getAllMemoriesForPrompt,
  readUserSettings,
} from './user-settings.js';
import { getDefaultDataDir } from './db.js';

export { extractMemoriesFromConversation } from './memory-extract.js';

export function getMemoriesForPrompt(dataDir = getDefaultDataDir()): string[] {
  const settings = readUserSettings(dataDir);
  return getAllMemoriesForPrompt(settings);
}

export function formatMemoriesSection(memories: string[]): string | null {
  if (!memories.length) return null;
  return memories.map((m) => `- ${m}`).join('\n');
}

export function getMemoryStatus(dataDir = getDefaultDataDir()) {
  const settings = readUserSettings(dataDir);
  return {
    pinnedCount: settings.memories.length,
    learnedCount: settings.learnedMemories.length,
    profilePreview: formatUserSettingsForPrompt(settings),
  };
}
