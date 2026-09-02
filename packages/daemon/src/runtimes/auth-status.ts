import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AgentId } from '@realtor-os/contracts';

const execFileAsync = promisify(execFile);

export interface AgentAuthProbe {
  signedIn: boolean;
  accountLabel?: string;
}

function expiredUnix(expiresAt: number): boolean {
  const ms = expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  return Number.isFinite(ms) && ms < Date.now();
}

async function probeClaude(bin: string): Promise<AgentAuthProbe> {
  try {
    const { stdout } = await execFileAsync(bin, ['auth', 'status'], { timeout: 8000 });
    const parsed = JSON.parse(stdout) as { loggedIn?: boolean; email?: string };
    return {
      signedIn: parsed.loggedIn === true,
      accountLabel: parsed.email?.trim() || undefined,
    };
  } catch {
    return { signedIn: false };
  }
}

async function probeCodex(bin: string): Promise<AgentAuthProbe> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, ['login', 'status'], { timeout: 8000 });
    const text = `${stdout}\n${stderr}`;
    const signedIn = /logged in/i.test(text);
    const via = text.match(/logged in using\s+(.+)/i)?.[1]?.trim();
    return {
      signedIn,
      accountLabel: signedIn ? via || 'ChatGPT' : undefined,
    };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    return { signedIn: /logged in/i.test(text) };
  }
}

async function probeKimi(): Promise<AgentAuthProbe> {
  const dir = join(homedir(), '.kimi-code', 'credentials');
  try {
    const names = await readdir(dir);
    for (const name of names) {
      try {
        const raw = await readFile(join(dir, name), 'utf8');
        const parsed = JSON.parse(raw) as {
          expires_at?: number;
          access_token?: string;
          refresh_token?: string;
        };
        if (!parsed.access_token && !parsed.refresh_token) continue;
        if (
          !parsed.refresh_token &&
          typeof parsed.expires_at === 'number' &&
          expiredUnix(parsed.expires_at)
        ) {
          return { signedIn: false, accountLabel: 'session expired' };
        }
        return { signedIn: true, accountLabel: 'Kimi Code' };
      } catch {
        // try next credential file
      }
    }
    if (names.length > 0) return { signedIn: true, accountLabel: 'Kimi Code' };
  } catch {
    // missing credentials dir
  }
  return { signedIn: false };
}

async function probeGrok(): Promise<AgentAuthProbe> {
  try {
    const raw = await readFile(join(homedir(), '.grok', 'auth.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const signedIn = Boolean(parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0);
    return { signedIn, accountLabel: signedIn ? 'xAI' : undefined };
  } catch {
    return { signedIn: false };
  }
}

export async function probeAgentAuth(agentId: AgentId, bin: string): Promise<AgentAuthProbe> {
  switch (agentId) {
    case 'claude':
      return probeClaude(bin);
    case 'codex':
      return probeCodex(bin);
    case 'kimi':
      return probeKimi();
    case 'grok':
      return probeGrok();
  }
}
