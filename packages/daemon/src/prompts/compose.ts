import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentId } from '@realtor-os/contracts';
import {
  getRepoRoot,
  listCompsSummary,
  listImageIndex,
  readPropertyJsonSummary,
} from '../property-workspace.js';
import { readStagedSkillBody } from '../skills.js';
import { formatUserSettingsForPrompt, readUserSettings } from '../user-settings.js';
import { formatMemoriesSection } from '../memory.js';
import {
  formatBrowserContextForPrompt,
  formatSupervisedBrowserInstructions,
} from '../browser-manifest.js';

const AGENT_MISSION_FILES: Record<AgentId, string> = {
  claude: 'claude.md',
  codex: 'codex.md',
  kimi: 'kimi.md',
};

function readOptional(path: string, maxChars = 8000): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').slice(0, maxChars).trim();
}

export interface ComposePromptOptions {
  agentId: AgentId;
  workspacePath: string;
  skillId?: string;
  userMessage: string;
  isPropertyScoped?: boolean;
  userProfile?: string;
  memories?: string[];
  priorMessages?: Array<{ role: string; content: string }>;
}

export function composeAgentPrompt(options: ComposePromptOptions): string {
  const {
    agentId,
    workspacePath,
    skillId,
    userMessage,
    isPropertyScoped,
    userProfile,
    memories,
    priorMessages,
  } = options;
  const repoRoot = getRepoRoot();
  const sections: string[] = [];

  const profile = userProfile ?? formatUserSettingsForPrompt(readUserSettings());
  sections.push(
    '## User profile\n\n' +
      profile +
      '\n\nFollow the user\'s communication style and pinned memories when responding.',
  );

  const memoryBlock = formatMemoriesSection(memories ?? []);
  if (memoryBlock) {
    sections.push('## Remember about this user\n\n' + memoryBlock);
  }

  if (priorMessages?.length) {
    const transcript = priorMessages
      .map((m) => `**${m.role}:** ${m.content}`)
      .join('\n\n')
      .slice(0, 12000);
    sections.push(
      '## Conversation so far\n\n' +
        'Continue this thread. The user may have switched agents — do not ask them to repeat what is already below.\n\n' +
        transcript,
    );
  }

  if (isPropertyScoped) {
    sections.push(
      '## Active property\n\n' +
        'The user is viewing **this listing** in RealtorOS. Assume every question refers to this property unless they clearly mean another. ' +
        'Do not ask them to repeat the address or explain which property they mean.\n',
    );
  }

  const rootAgents = readOptional(join(repoRoot, 'AGENTS.md'), 4000);
  if (rootAgents) {
    sections.push('## RealtorOS rules\n\n' + rootAgents);
  }

  const missionFile = AGENT_MISSION_FILES[agentId];
  const mission = readOptional(join(repoRoot, 'agents', missionFile), 4000);
  if (mission) {
    sections.push(`## ${agentId} mission\n\n` + mission);
  }

  if (skillId) {
    const skillBody =
      readStagedSkillBody(workspacePath, skillId) ??
      readOptional(join(repoRoot, 'skills', skillId, 'SKILL.md'), 6000);
    if (skillBody) {
      sections.push(`## Active skill: ${skillId}\n\n` + skillBody);
    }
    if (skillId === 'zillow-import') {
      sections.push(formatSupervisedBrowserInstructions());
      sections.push(
        '## Import report reminder\n\n' +
          'When the import finishes, write `import-report.md` and present the same report in chat: ' +
          'what was done, fields captured, proposed image classifications (`images/.meta/*.json`), ' +
          'potential issues (missing data, implausible values, bot challenges), ' +
          'and recommended next steps. Flag Zillow quirks faithfully copied from source.',
      );
      const browserCtx = formatBrowserContextForPrompt();
      if (browserCtx) {
        sections.push('## Browser setup\n\n' + browserCtx);
      }
    }
  }

  const propertySummary = readPropertyJsonSummary(workspacePath);
  const imageIndex = listImageIndex(workspacePath);
  const compsSummary = listCompsSummary(workspacePath);
  if (isPropertyScoped) {
    sections.push(
      '## Property context\n\n' +
        propertySummary +
        '\n\n### Images\n\n' +
        imageIndex +
        '\n\n### Comparables (competing listings)\n\n' +
        compsSummary +
        '\n\nWorking directory (cwd): ' +
        workspacePath,
    );
  }

  sections.push('## User request\n\n' + userMessage.trim());

  return sections.join('\n\n---\n\n');
}
