import { claudeAgentDef, codexAgentDef, kimiAgentDef } from './defs.js';
import type { RuntimeAgentDef } from './types.js';

export const AGENT_DEFS: RuntimeAgentDef[] = [claudeAgentDef, codexAgentDef, kimiAgentDef];

export function getAgentDef(id: string): RuntimeAgentDef | undefined {
  return AGENT_DEFS.find((def) => def.id === id);
}
