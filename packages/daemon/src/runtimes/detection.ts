import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { DetectedAgent, ModelOption } from '@realtor-os/contracts';
import { AGENT_DEFS, getAgentDef } from './registry.js';
import { DEFAULT_MODEL_OPTION } from './defs.js';
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

async function detectOne(def: RuntimeAgentDef): Promise<DetectedAgent> {
  const bin = await resolveBin(def);
  if (!bin) {
    return {
      id: def.id,
      name: def.name,
      available: false,
      models: def.fallbackModels,
    };
  }

  const version = await probeVersion(bin, def.versionArgs);
  let models: ModelOption[] = def.fallbackModels;
  if (def.fetchModels) {
    try {
      const discovered = await def.fetchModels(bin);
      if (discovered && discovered.length > 0) models = discovered;
    } catch {
      // keep fallback
    }
  }

  return {
    id: def.id,
    name: def.name,
    available: true,
    version,
    models: models.length > 0 ? models : [DEFAULT_MODEL_OPTION],
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
