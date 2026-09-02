import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentRuntimeStatus, DetectedAgent, ModelOption } from '@realtor-os/contracts';
import { probeAgentAuth } from './auth-status.js';
import { AGENT_DEFS, getAgentDef } from './registry.js';
import { DEFAULT_MODEL_OPTION } from './defs.js';
import { applyCatalogCapabilities, profileForAgent } from './capabilities.js';
import type { ResolvedAgentLaunch, RuntimeAgentDef } from './types.js';

const execFileAsync = promisify(execFile);

async function probeVersion(bin: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 5000 });
    const line = stdout.trim().split(/\r?\n/u)[0]?.trim();
    return line || undefined;
  } catch {
    return undefined;
  }
}

async function resolveBin(def: RuntimeAgentDef): Promise<string | null> {
  const candidates = [def.bin, ...(def.fallbackBins ?? [])];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, def.versionArgs, { timeout: 5000 });
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

function runtimeStatus(available: boolean, signedIn: boolean): AgentRuntimeStatus {
  if (!available) return 'not_installed';
  if (!signedIn) return 'needs_login';
  return 'ready';
}

async function detectOne(def: RuntimeAgentDef): Promise<DetectedAgent> {
  const profile = profileForAgent(def.id);
  const bin = await resolveBin(def);
  const catalog = {
    models: applyCatalogCapabilities(def.id, def.fallbackModels),
    capabilities: profile.capabilities,
    imageModel: profile.imageModel,
    loginHint: def.authLoginHint,
    installHint: def.installHint,
  };
  if (!bin) {
    return {
      id: def.id,
      name: def.name,
      available: false,
      signedIn: false,
      status: runtimeStatus(false, false),
      ...catalog,
    };
  }

  const [version, auth] = await Promise.all([
    probeVersion(bin, def.versionArgs),
    probeAgentAuth(def.id, bin),
  ]);
  let models: ModelOption[] = def.fallbackModels;
  if (def.fetchModels) {
    try {
      const discovered = await def.fetchModels(bin);
      if (discovered && discovered.length > 0) models = discovered;
    } catch {
      // keep fallback
    }
  }

  const resolved = models.length > 0 ? models : [DEFAULT_MODEL_OPTION];
  return {
    id: def.id,
    name: def.name,
    available: true,
    version,
    models: applyCatalogCapabilities(def.id, resolved),
    capabilities: profile.capabilities,
    imageModel: profile.imageModel,
    signedIn: auth.signedIn,
    status: runtimeStatus(true, auth.signedIn),
    accountLabel: auth.accountLabel,
    loginHint: def.authLoginHint,
    installHint: def.installHint,
  };
}

export async function detectAgents(): Promise<DetectedAgent[]> {
  return Promise.all(AGENT_DEFS.map((def) => detectOne(def)));
}

export async function resolveAgentLaunch(agentId: string): Promise<ResolvedAgentLaunch | null> {
  const def = getAgentDef(agentId);
  if (!def) return null;
  const bin = await resolveBin(def);
  if (!bin) return null;
  return { def, bin };
}

export function spawnAgent(
  launch: ResolvedAgentLaunch,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) {
  return spawn(launch.bin, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
