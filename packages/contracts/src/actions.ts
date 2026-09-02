import type { AgentCapability, AgentId } from './index.js';

/**
 * Living catalog: which action uses which skill, scripts, and agents.
 * Update when a provider ships image generation or a new workflow is added.
 * Last reviewed: 2026-09-02.
 */
export interface ActionBinding {
  skillId: string;
  skillPath: string;
  scripts: string[];
  requiredCapabilities: AgentCapability[];
  allowedAgents: AgentId[];
  imageModel?: string;
  notes: string;
}

export const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  kimi: 'Kimi',
  grok: 'Grok',
};

const ALL_AGENTS: AgentId[] = ['claude', 'codex', 'kimi', 'grok'];

const CHAT: AgentCapability[] = ['chat'];
const CHAT_VISION: AgentCapability[] = ['chat', 'vision'];
const IMAGE_GEN: AgentCapability[] = ['imageGeneration'];

const ZILLOW_SNAPSHOT = 'scripts/zillow-browser-snapshot.mjs';

export const ACTION_CATALOG: Record<string, ActionBinding> = {
  'zillow-import': {
    skillId: 'zillow-import',
    skillPath: 'skills/zillow-import',
    scripts: [ZILLOW_SNAPSHOT],
    requiredCapabilities: CHAT_VISION,
    allowedAgents: ALL_AGENTS,
    notes: 'Supervised Chrome plus the snapshot script. Any chat+vision agent.',
  },
  'zillow-comp': {
    skillId: 'zillow-comp',
    skillPath: 'skills/zillow-comp',
    scripts: [ZILLOW_SNAPSHOT],
    requiredCapabilities: CHAT_VISION,
    allowedAgents: ALL_AGENTS,
    notes: 'Same browser path as subject import; writes comps/{zpid}.json only.',
  },
  'listing-copy': {
    skillId: 'listing-copy',
    skillPath: 'skills/listing-copy',
    scripts: [],
    requiredCapabilities: CHAT,
    allowedAgents: ALL_AGENTS,
    notes: 'Text from property.json and photos. No image generation.',
  },
  'social-post': {
    skillId: 'social-post',
    skillPath: 'skills/social-post',
    scripts: [],
    requiredCapabilities: CHAT,
    allowedAgents: ALL_AGENTS,
    notes: 'Text from listing facts. No image generation.',
  },
  'virtual-staging': {
    skillId: 'virtual-staging',
    skillPath: 'skills/virtual-staging',
    scripts: [],
    requiredCapabilities: IMAGE_GEN,
    allowedAgents: ['codex', 'grok'],
    notes:
      'Image generation is CLI-level: Codex uses gpt-image-2; Grok Build uses grok-imagine-image-2.0. Claude and Kimi have vision input only (reviewed 2026-09-02).',
  },
};

export function bindingForAction(skillId: string): ActionBinding | undefined {
  return ACTION_CATALOG[skillId];
}

export function actionAllowsAgent(skillId: string, agentId: AgentId): boolean {
  const binding = bindingForAction(skillId);
  if (!binding) return true;
  return binding.allowedAgents.includes(agentId);
}

export function formatAllowedAgents(skillId: string): string {
  const binding = bindingForAction(skillId);
  if (!binding || binding.allowedAgents.length === ALL_AGENTS.length) return 'any agent';
  return binding.allowedAgents.map((id) => AGENT_DISPLAY_NAMES[id]).join(' or ');
}

export function actionAllowsSelection(
  skillId: string,
  agentId: AgentId,
  capabilities?: AgentCapability[],
): boolean {
  if (!actionAllowsAgent(skillId, agentId)) return false;
  const binding = bindingForAction(skillId);
  if (!binding || !capabilities?.length) return true;
  return binding.requiredCapabilities.every((capability) => capabilities.includes(capability));
}

export function applyActionBinding(skill: {
  id: string;
  name: string;
  description: string;
  examplePrompt?: string;
  category?: string;
  featured?: boolean;
}): import('./property.js').SkillSummary {
  const binding = bindingForAction(skill.id);
  if (!binding) return skill;
  return {
    ...skill,
    skillPath: binding.skillPath,
    scripts: binding.scripts,
    requiredCapabilities: binding.requiredCapabilities,
    allowedAgents: binding.allowedAgents,
    imageModel: binding.imageModel,
  };
}
