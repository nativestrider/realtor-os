/**
 * Resolve DISPLAY / XAUTHORITY for headful Playwright on Linux when the daemon
 * or agent shell was started without a graphical session (TTY, SSH, IDE terminal).
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function displaySocketExists(display) {
  const match = /^:(\d+)$/u.exec(display?.trim() ?? '');
  if (!match) return false;
  return existsSync(join('/tmp/.X11-unix', `X${match[1]}`));
}

function resolveXauthority() {
  const fromEnv = process.env.XAUTHORITY?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const candidates = [
    join(homedir(), '.Xauthority'),
    uid != null ? `/run/user/${uid}/gdm/Xauthority` : null,
    uid != null ? join(homedir(), '.cache', 'gdm', 'Xauthority') : null,
  ].filter(Boolean);

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

function displayFromWho() {
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

function displayFromX11UnixDir() {
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

/**
 * @returns {Record<string, string>} env vars to merge (may be empty on macOS/Windows)
 */
export function resolveDisplayEnv() {
  if (process.platform !== 'linux') return {};

  const manual = process.env.REALTOR_DISPLAY?.trim();
  if (manual && displaySocketExists(manual)) {
    const env = { DISPLAY: manual };
    const xauth = resolveXauthority();
    if (xauth) env.XAUTHORITY = xauth;
    return env;
  }

  const current = process.env.DISPLAY?.trim();
  if (current && displaySocketExists(current)) {
    const env = { DISPLAY: current };
    const xauth = resolveXauthority();
    if (xauth && !process.env.XAUTHORITY?.trim()) env.XAUTHORITY = xauth;
    return env;
  }

  const detected = displayFromWho() ?? displayFromX11UnixDir();
  if (!detected) return {};

  const env = { DISPLAY: detected };
  const xauth = resolveXauthority();
  if (xauth) env.XAUTHORITY = xauth;
  return env;
}

/**
 * Apply resolved display env to process.env (mutates in place).
 * @returns {Record<string, string>} vars that were applied
 */
export function applyDisplayEnv() {
  const resolved = resolveDisplayEnv();
  for (const [key, value] of Object.entries(resolved)) {
    process.env[key] = value;
  }
  return resolved;
}

export function formatMissingDisplayHelp() {
  return [
    'No X11 display found for visible Chromium.',
    '',
    'Supervised Zillow import needs a graphical session on Linux:',
    '  • Start RealtorOS from a desktop terminal (not SSH without X forwarding), or',
    '  • Set REALTOR_DISPLAY=:1 (or your active display from `who`) before `pnpm dev`, or',
    '  • Log in to the desktop session on this machine so /tmp/.X11-unix/X* exists.',
    '',
    'Do not use headless/Xvfb for CAPTCHA — the user must see the browser window.',
  ].join('\n');
}
