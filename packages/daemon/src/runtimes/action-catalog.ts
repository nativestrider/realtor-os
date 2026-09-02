import type { AgentId } from '@realtor-os/contracts';
import {
  actionAllowsAgent,
  AGENT_DISPLAY_NAMES,
  bindingForAction,
} from '@realtor-os/contracts';
import { agentHasCapability, profileForAgent } from './capabilities.js';

export function agentCanRunAction(agentId: AgentId, skillId: string): boolean {
  const binding = bindingForAction(skillId);
  if (!binding) return true;
  if (!actionAllowsAgent(skillId, agentId)) return false;
  return binding.requiredCapabilities.every((capability) =>
    agentHasCapability(agentId, capability),
  );
}

export function pickAgentForAction(skillId: string, requested?: AgentId): AgentId {
  if (requested && agentCanRunAction(requested, skillId)) return requested;
  const binding = bindingForAction(skillId);
  return binding?.allowedAgents[0] ?? requested ?? 'claude';
}

export function actionRefusalMessage(agentId: AgentId, skillId: string): string {
  const binding = bindingForAction(skillId);
  if (!binding) return `${agentId} cannot run ${skillId}.`;
  const names = binding.allowedAgents.map((id) => AGENT_DISPLAY_NAMES[id]).join(' or ');
  const image = binding.imageModel ? ` (${binding.imageModel})` : '';
  return (
    `${AGENT_DISPLAY_NAMES[agentId]} cannot run ${binding.skillId}. ` +
    `Switch the Agent picker to ${names}${image} and try again.`
  );
}

export function formatActionRuntimeForPrompt(agentId: AgentId, skillId: string): string | null {
  const binding = bindingForAction(skillId);
  if (!binding) return null;

  const scripts = binding.scripts.length
    ? `\nHelper scripts (repo-relative):\n${binding.scripts.map((s) => `- \`${s}\``).join('\n')}`
    : '';
  const imageId = binding.requiredCapabilities.includes('imageGeneration')
    ? (profileForAgent(agentId).imageModel ?? binding.imageModel)
    : binding.imageModel;
  const image = imageId ? `\nImage model: \`${imageId}\`.` : '';

  if (!agentCanRunAction(agentId, skillId)) {
    return (
      `## Action runtime\n\nSTOP. Do not continue this skill.\n\n` +
      actionRefusalMessage(agentId, skillId)
    );
  }

  return (
    `## Action runtime\n\n` +
    `Bound skill: \`${binding.skillPath}\`.${scripts}${image}\n` +
    `${binding.notes}`
  );
}
