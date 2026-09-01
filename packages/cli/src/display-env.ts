import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function displaySocketExists(display: string): boolean {
  const match = /^:(\d+)$/u.exec(display.trim());
  if (!match) return false;
  return existsSync(join('/tmp/.X11-unix', `X${match[1]}`));
}

function resolveXauthority(): string | undefined {
  const fromEnv = process.env.XAUTHORITY?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const candidates = [
    join(homedir(), '.Xauthority'),
    uid != null ? `/run/user/${uid}/gdm/Xauthority` : null,
    uid != null ? join(homedir(), '.cache', 'gdm', 'Xauthority') : null,
  ].filter((path): path is string => Boolean(path));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

function displayFromWho(): string | undefined {
  try {
    const who = execSync('who', { encoding: 'utf8', timeout: 2000 });
    for (const line of who.trim().split('\n')) {
      const match = /\((:[0-9]+)\)\s*$/u.exec(line);
      if (match && displaySocketExists(match[1])) return match[1];
    }
  } catch {
    // ignore
  }
  return undefined;
}

function displayFromX11UnixDir(): string | undefined {
  const xdir = '/tmp/.X11-unix';
  if (!existsSync(xdir)) return undefined;

  const numbers = readdirSync(xdir)
    .filter((name) => name.startsWith('X'))
    .map((name) => Number(name.slice(1)))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => b - a);

  for (const n of numbers) {
    const display = `:${n}`;
    if (displaySocketExists(display)) return display;
  }
  return undefined;
}

/** Linux X11 env for headful Playwright when the launcher has no DISPLAY. */
export function resolveDisplayEnv(): Record<string, string> {
  if (process.platform !== 'linux') return {};

  const manual = process.env.REALTOR_DISPLAY?.trim();
  if (manual && displaySocketExists(manual)) {
    const env: Record<string, string> = { DISPLAY: manual };
    const xauth = resolveXauthority();
    if (xauth) env.XAUTHORITY = xauth;
    return env;
  }

  const current = process.env.DISPLAY?.trim();
  if (current && displaySocketExists(current)) {
    const env: Record<string, string> = { DISPLAY: current };
    const xauth = resolveXauthority();
    if (xauth && !process.env.XAUTHORITY?.trim()) env.XAUTHORITY = xauth;
    return env;
  }

  const detected = displayFromWho() ?? displayFromX11UnixDir();
  if (!detected) return {};

  const env: Record<string, string> = { DISPLAY: detected };
  const xauth = resolveXauthority();
  if (xauth) env.XAUTHORITY = xauth;
  return env;
}
