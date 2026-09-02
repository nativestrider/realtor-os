import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelOption } from '@realtor-os/contracts';
import type { RuntimeAgentDef } from './types.js';
import { DEFAULT_MODEL_OPTION, modelsForAgent } from './capabilities.js';

export { DEFAULT_MODEL_OPTION } from './capabilities.js';

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
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'bypassPermissions',
  ];
  if (options.model && options.model !== 'default') {
    args.push('--model', options.model);
  }
  // Never --resume in print mode. A native session that already contains
  // assistant turns is replayed as stream-json and Claude exits with
  // "Expected message role 'user', got 'assistant'". Prior chat is inlined
  // in the composed prompt instead.
  if (!runtimeContext.resumeSessionId && runtimeContext.newSessionId) {
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

export function buildGrokArgs(
  _prompt: string,
  options: { model?: string } = {},
): string[] {
  const args = ['agent', '--always-approve', '--no-leader'];
  if (options.model && options.model !== 'default') {
    args.push('--model', options.model);
  }
  args.push('stdio');
  return args;
}

export const claudeAgentDef = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  fallbackBins: ['openclaude', join(homedir(), '.local', 'bin', 'claude')],
  versionArgs: ['--version'],
  fallbackModels: modelsForAgent('claude'),
  buildArgs: (prompt, options, runtimeContext) =>
    buildClaudeArgs(prompt, options, runtimeContext ?? {}),
  promptViaStdin: true,
  promptInputFormat: 'text',
  streamFormat: 'claude-stream-json',
  resumesSessionViaCli: false,
  authLoginHint: 'claude auth login',
  installHint: 'bash scripts/install-agent-cli.sh claude',
} satisfies RuntimeAgentDef;

export const codexAgentDef = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  fallbackBins: [join(homedir(), '.local', 'bin', 'codex')],
  versionArgs: ['--version'],
  fallbackModels: modelsForAgent('codex'),
  buildArgs: (prompt, options, runtimeContext) =>
    buildCodexArgs(prompt, options, runtimeContext ?? {}),
  promptViaStdin: true,
  streamFormat: 'json-event-stream',
  eventParser: 'codex',
  resumesSessionViaCli: true,
  capturesSessionIdFromStream: true,
  authLoginHint: 'codex login',
  installHint: 'bash scripts/install-agent-cli.sh codex',
} satisfies RuntimeAgentDef;

export const kimiAgentDef = {
  id: 'kimi',
  name: 'Kimi CLI',
  bin: 'kimi',
  fallbackBins: [join(homedir(), '.kimi-code', 'bin', 'kimi')],
  versionArgs: ['--version'],
  fallbackModels: modelsForAgent('kimi'),
  buildArgs: () => ['acp'],
  streamFormat: 'acp',
  authLoginHint: 'kimi login',
  installHint: 'bash scripts/install-agent-cli.sh kimi',
} satisfies RuntimeAgentDef;

export const grokAgentDef = {
  id: 'grok',
  name: 'Grok Build',
  bin: 'grok',
  fallbackBins: [join(homedir(), '.grok', 'bin', 'grok')],
  versionArgs: ['--version'],
  fallbackModels: modelsForAgent('grok'),
  buildArgs: (prompt, options) => buildGrokArgs(prompt, options ?? {}),
  streamFormat: 'acp',
  resumesSessionViaCli: true,
  authLoginHint: 'grok login',
  installHint: 'bash scripts/install-agent-cli.sh grok',
} satisfies RuntimeAgentDef;
