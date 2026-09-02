import type { AgentCapability, AgentId, ModelOption } from '@realtor-os/contracts';

/**
 * Living catalog of what each RealtorOS agent/model can do.
 * Update this file when a provider ships or withdraws a feature.
 * Last reviewed: 2026-09-02.
 *
 * Claude — vision input only; no native image generation
 *   https://platform.claude.com/docs/en/build-with-claude/vision
 * Kimi — K3/K2.x understand image/video; no generation API
 *   https://platform.kimi.ai/docs/guide/use-kimi-vision-model
 * Codex CLI — generates via gpt-image-2 (`$imagegen` / image_gen tool)
 * Grok Build — vision + image gen via grok-imagine-image-2.0 (`/imagine` / media_gen)
 *   https://docs.x.ai/developers/models
 */
export interface AgentCapabilityProfile {
  capabilities: AgentCapability[];
  imageModel?: string;
  notes: string;
  models: ModelOption[];
}

export const DEFAULT_MODEL_OPTION: ModelOption = {
  id: 'default',
  label: 'Default',
};

const CHAT_VISION: AgentCapability[] = ['chat', 'vision'];
const CHAT_VISION_IMAGE: AgentCapability[] = ['chat', 'vision', 'imageGeneration'];

function model(id: string, label: string, capabilities: AgentCapability[]): ModelOption {
  return { id, label, capabilities };
}

export const AGENT_CAPABILITY_PROFILES: Record<AgentId, AgentCapabilityProfile> = {
  claude: {
    capabilities: CHAT_VISION,
    notes: 'Reads listing photos. Cannot write raster images.',
    models: [
      { ...DEFAULT_MODEL_OPTION, capabilities: CHAT_VISION },
      model('sonnet', 'Sonnet', CHAT_VISION),
      model('opus', 'Opus', CHAT_VISION),
      model('haiku', 'Haiku', CHAT_VISION),
    ],
  },
  kimi: {
    capabilities: CHAT_VISION,
    notes: 'Reads listing photos (and video on K3/K2.x). Cannot write raster images.',
    models: [
      { ...DEFAULT_MODEL_OPTION, capabilities: CHAT_VISION },
      model('kimi-k2-turbo-preview', 'kimi-k2-turbo-preview', CHAT_VISION),
      model('moonshot-v1-8k', 'moonshot-v1-8k', CHAT_VISION),
    ],
  },
  codex: {
    capabilities: CHAT_VISION_IMAGE,
    imageModel: 'gpt-image-2',
    notes: 'Chat model is separate from image generation. Codex CLI writes images with gpt-image-2.',
    models: [
      model('gpt-5.4', 'GPT-5.4 (ChatGPT)', CHAT_VISION_IMAGE),
      { ...DEFAULT_MODEL_OPTION, capabilities: CHAT_VISION_IMAGE },
      model('gpt-5.3-codex', 'gpt-5.3-codex (API)', CHAT_VISION_IMAGE),
      model('o4-mini', 'o4-mini (API)', CHAT_VISION_IMAGE),
    ],
  },
  grok: {
    capabilities: CHAT_VISION_IMAGE,
    imageModel: 'grok-imagine-image-2.0',
    notes:
      'Chat model is separate from image generation. Grok Build writes images with grok-imagine-image-2.0.',
    models: [
      model('grok-4.6', 'Grok 4.6', CHAT_VISION_IMAGE),
      { ...DEFAULT_MODEL_OPTION, capabilities: CHAT_VISION_IMAGE },
      model('grok-build-0.1', 'grok-build-0.1', CHAT_VISION_IMAGE),
      model('grok-4.5', 'Grok 4.5', CHAT_VISION_IMAGE),
      model('grok-4.3', 'Grok 4.3', CHAT_VISION_IMAGE),
    ],
  },
};

export function profileForAgent(agentId: AgentId): AgentCapabilityProfile {
  return AGENT_CAPABILITY_PROFILES[agentId];
}

export function modelsForAgent(agentId: AgentId): ModelOption[] {
  return profileForAgent(agentId).models;
}

export function agentHasCapability(agentId: AgentId, capability: AgentCapability): boolean {
  return profileForAgent(agentId).capabilities.includes(capability);
}

export function applyCatalogCapabilities(agentId: AgentId, models: ModelOption[]): ModelOption[] {
  const profile = profileForAgent(agentId);
  const byId = new Map(profile.models.map((m) => [m.id, m]));
  return models.map((m) => ({
    ...m,
    capabilities: m.capabilities ?? byId.get(m.id)?.capabilities ?? profile.capabilities,
  }));
}
