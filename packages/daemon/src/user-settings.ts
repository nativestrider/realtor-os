import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UserSettings } from '@realtor-os/contracts';
import { DEFAULT_LISTING_SETTINGS, DEFAULT_MEDIA_SETTINGS } from '@realtor-os/contracts';
import { normalizeListingStatusId } from '@realtor-os/contracts';
import { getDefaultDataDir } from './db.js';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  memories: [],
  learnedMemories: [],
  mediaSettings: { ...DEFAULT_MEDIA_SETTINGS },
  listingSettings: { ...DEFAULT_LISTING_SETTINGS },
};

const MAX_LEARNED_MEMORIES = 100;

function normalizeMemories(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((m) => String(m).trim()).filter(Boolean);
}

export function getUserSettingsPath(dataDir = getDefaultDataDir()): string {
  return join(dataDir, 'user-settings.json');
}

export function readUserSettings(dataDir = getDefaultDataDir()): UserSettings {
  const path = getUserSettingsPath(dataDir);
  if (!existsSync(path)) return { ...DEFAULT_USER_SETTINGS };
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<UserSettings> & {
      mem0Enabled?: boolean;
    };
    return {
      ...DEFAULT_USER_SETTINGS,
      ...data,
      memories: normalizeMemories(data.memories),
      learnedMemories: normalizeMemories(data.learnedMemories),
      mediaSettings: {
        ...DEFAULT_MEDIA_SETTINGS,
        ...data.mediaSettings,
        customImageRoles: normalizeMemories(data.mediaSettings?.customImageRoles),
      },
      listingSettings: {
        ...DEFAULT_LISTING_SETTINGS,
        ...data.listingSettings,
        customStatuses: normalizeMemories(data.listingSettings?.customStatuses).map(
          normalizeListingStatusId,
        ),
      },
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function writeUserSettings(settings: UserSettings, dataDir = getDefaultDataDir()): UserSettings {
  mkdirSync(dataDir, { recursive: true });
  const normalized: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    memories: normalizeMemories(settings.memories),
    learnedMemories: normalizeMemories(settings.learnedMemories).slice(-MAX_LEARNED_MEMORIES),
    mediaSettings: {
      ...DEFAULT_MEDIA_SETTINGS,
      ...settings.mediaSettings,
      customImageRoles: normalizeMemories(settings.mediaSettings?.customImageRoles ?? []),
    },
    listingSettings: {
      ...DEFAULT_LISTING_SETTINGS,
      ...settings.listingSettings,
      customStatuses: normalizeMemories(settings.listingSettings?.customStatuses ?? []).map(
        normalizeListingStatusId,
      ),
    },
  };
  writeFileSync(getUserSettingsPath(dataDir), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export function appendLearnedMemories(
  facts: string[],
  dataDir = getDefaultDataDir(),
): UserSettings {
  if (!facts.length) return readUserSettings(dataDir);
  const current = readUserSettings(dataDir);
  const existing = new Set(
    [...current.memories, ...current.learnedMemories].map((m) => m.toLowerCase()),
  );
  const additions: string[] = [];
  for (const fact of facts) {
    const trimmed = fact.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    additions.push(trimmed);
  }
  if (!additions.length) return current;
  return writeUserSettings(
    {
      ...current,
      learnedMemories: [...current.learnedMemories, ...additions].slice(-MAX_LEARNED_MEMORIES),
    },
    dataDir,
  );
}

export function getAllMemoriesForPrompt(settings: UserSettings): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const fact of [...settings.memories, ...settings.learnedMemories]) {
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(fact);
  }
  return results;
}

export function formatUserSettingsForPrompt(settings: UserSettings): string {
  const lines: string[] = [];
  if (settings.displayName) lines.push(`Name: ${settings.displayName}`);
  if (settings.role) lines.push(`Role: ${settings.role}`);
  if (settings.brokerage) lines.push(`Brokerage: ${settings.brokerage}`);
  if (settings.communicationStyle) {
    lines.push(`Communication style: ${settings.communicationStyle}`);
  }
  if (settings.customInstructions) {
    lines.push(`Instructions: ${settings.customInstructions}`);
  }
  return lines.length ? lines.join('\n') : 'No user profile configured yet.';
}
