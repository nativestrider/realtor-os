import type { ModelOption } from '@realtor-os/contracts';
import type { RuntimeAgentDef } from './types.js';

export const DEFAULT_MODEL_OPTION: ModelOption = {
  id: 'default',
  label: 'Default',
};

export function detectModelsFromStdout(stdout: string, fallback: ModelOption[]): ModelOption[] {
  const lines = stdout.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
  const models: ModelOption[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>(['default']);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { models?: Array<{ id?: string; slug?: string; name?: string }> };
      if (!Array.isArray(parsed.models)) continue;
      for (const m of parsed.models) {
        const id = (m.slug ?? m.id ?? '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        models.push({ id, label: m.name?.trim() || id });
      }
    } catch {
      // ignore non-json lines
    }
  }
  return models.length > 1 ? models : fallback;
}

export function clampCodexReasoning(_model: string | undefined, reasoning: string): string {
  if (reasoning === 'default') return 'medium';
  return reasoning;
}

export function codexNeedsDangerFullAccessSandbox(): boolean {
  if (process.env.REALTOR_CODEX_SANDBOX?.trim() === 'danger-full-access') return true;
  if (process.platform === 'win32') return true;
  return Boolean(process.env.WSL_DISTRO_NAME?.trim());
}

export function buildClaudeArgs(
  _prompt: string,
  options: { model?: string } = {},
  runtimeContext: { resumeSessionId?: string | null; newSessionId?: string | null } = {},
): string[] {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'bypassPermissions',
  ];
  if (options.model && options.model !== 'default') {
    args.push('--model', options.model);
  }
  if (runtimeContext.resumeSessionId) {
    args.push('--resume', runtimeContext.resumeSessionId);
  } else if (runtimeContext.newSessionId) {
    args.push('--session-id', runtimeContext.newSessionId);
  }
  return args;
}

export function buildCodexArgs(
  _prompt: string,
  options: { model?: string; reasoning?: string } = {},
  runtimeContext: { cwd?: string; resumeSessionId?: string | null } = {},
): string[] {
  const needsDanger = codexNeedsDangerFullAccessSandbox();
  const resumeSessionId =
    typeof runtimeContext.resumeSessionId === 'string' && runtimeContext.resumeSessionId.length > 0
      ? runtimeContext.resumeSessionId
      : null;
  const sandboxArgs = needsDanger
    ? resumeSessionId
      ? ['-c', 'sandbox_mode="danger-full-access"']
      : ['--sandbox', 'danger-full-access']
    : resumeSessionId
      ? ['-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.network_access=true']
      : ['--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true'];

  const args = resumeSessionId
    ? ['exec', 'resume', '--json', '--skip-git-repo-check', ...sandboxArgs]
    : ['exec', '--json', '--skip-git-repo-check', ...sandboxArgs];

  if (!resumeSessionId && runtimeContext.cwd) {
    args.push('-C', runtimeContext.cwd);
  }
  if (options.model && options.model !== 'default') {
    args.push('--model', options.model);
  }
  if (options.reasoning && options.reasoning !== 'default') {
    args.push('-c', `model_reasoning_effort="${clampCodexReasoning(options.model, options.reasoning)}"`);
  }
  if (resumeSessionId) {
    args.push(resumeSessionId);
  }
  return args;
}

export const claudeAgentDef = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  fallbackBins: ['openclaude'],
  versionArgs: ['--version'],
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'opus', label: 'Opus' },
    { id: 'haiku', label: 'Haiku' },
  ],
  buildArgs: (prompt, options, runtimeContext) =>
    buildClaudeArgs(prompt, options, runtimeContext ?? {}),
  promptViaStdin: true,
  promptInputFormat: 'stream-json',
  streamFormat: 'claude-stream-json',
  resumesSessionViaCli: true,
} satisfies RuntimeAgentDef;

export const codexAgentDef = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  versionArgs: ['--version'],
  fallbackModels: [
    { id: 'gpt-5.4', label: 'GPT-5.4 (ChatGPT)' },
    DEFAULT_MODEL_OPTION,
    { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex (API)' },
    { id: 'o4-mini', label: 'o4-mini (API)' },
  ],
  buildArgs: (prompt, options, runtimeContext) =>
    buildCodexArgs(prompt, options, runtimeContext ?? {}),
  promptViaStdin: true,
  streamFormat: 'json-event-stream',
  eventParser: 'codex',
  resumesSessionViaCli: true,
  capturesSessionIdFromStream: true,
} satisfies RuntimeAgentDef;

export const kimiAgentDef = {
  id: 'kimi',
  name: 'Kimi CLI',
  bin: 'kimi',
  versionArgs: ['--version'],
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
    { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
  ],
  buildArgs: () => ['acp'],
  streamFormat: 'acp',
} satisfies RuntimeAgentDef;
