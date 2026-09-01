import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BrowserManifest {
  chromiumExecutable: string;
  platform: string;
  arch: string;
  installedAt: string;
  playwrightVersion?: string;
}

export function getRealtorDataDir(): string {
  return process.env.REALTOR_DATA_DIR ?? join(homedir(), '.realtor-os');
}

export function getBrowserManifestPath(dataDir = getRealtorDataDir()): string {
  return join(dataDir, 'browser.json');
}

export function readBrowserManifest(dataDir = getRealtorDataDir()): BrowserManifest | null {
  const path = getBrowserManifestPath(dataDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BrowserManifest;
  } catch {
    return null;
  }
}

export function isChromiumInstalled(dataDir = getRealtorDataDir()): boolean {
  const manifest = readBrowserManifest(dataDir);
  if (!manifest?.chromiumExecutable) return false;
  return existsSync(manifest.chromiumExecutable);
}

export function formatSupervisedBrowserInstructions(): string {
  return [
    '## Supervised browser (human-in-the-loop)',
    '',
    '**RealtorOS chat agents do NOT have Cursor IDE browser MCP.** Do not call MCP browser tools — they are unavailable from Codex/Claude spawned by the daemon.',
    '',
    'Use **Playwright Chromium** bundled with RealtorOS instead:',
    '',
    '1. Run `pnpm run setup:browsers` once (if `~/.realtor-os/browser.json` is missing).',
    '2. From the property `cwd`, snapshot the listing:',
    '   ```bash',
    '   node "$REALTOR_REPO_ROOT/scripts/zillow-browser-snapshot.mjs" "<zillow url>" .',
    '   ```',
    '   This opens a **visible** browser window, saves `zillow-snapshot.png` and `zillow-snapshot.txt` in cwd.',
    '3. Read those files to compare fields — do not scrape via headless workarounds.',
    '',
    'When browser automation hits login, CAPTCHA, “Press & Hold”, or “prove you are human”:',
    '1. Stop automated navigation/extraction.',
    '2. Tell the user exactly what you see and what to click.',
    '3. Wait for the user to reply (e.g. "done", "ok", "ready") before continuing.',
    '4. Re-run the snapshot script or take a fresh snapshot after they confirm.',
    '5. Never bypass these checks with headless tricks or alternate scrape paths.',
    '',
    '**Linux DISPLAY:** The snapshot script needs a visible X11 session. RealtorOS auto-detects `DISPLAY` from `who` or `/tmp/.X11-unix/`. If launch fails with “Missing X server”, set `REALTOR_DISPLAY=:1` (check with `who`) and restart `realtor web`. Do not use Xvfb/headless for CAPTCHA.',
  ].join('\n');
}

export function formatBrowserContextForPrompt(dataDir = getRealtorDataDir()): string | null {
  const manifest = readBrowserManifest(dataDir);
  if (!manifest?.chromiumExecutable) {
    return [
      'Playwright Chromium is not installed.',
      'Run: pnpm run setup:browsers',
      'On Linux if launch fails: pnpm run setup:browsers:deps',
    ].join('\n');
  }
  if (!existsSync(manifest.chromiumExecutable)) {
    return `Chromium path missing on disk (${manifest.chromiumExecutable}). Run: pnpm run setup:browsers`;
  }
  return [
    'Use RealtorOS bundled Playwright Chromium — **not** Cursor MCP browser tools.',
    `REALTOR_CHROMIUM_EXECUTABLE=${manifest.chromiumExecutable}`,
    `REALTOR_REPO_ROOT is set in the agent environment (RealtorOS repo root).`,
    process.env.DISPLAY ? `DISPLAY=${process.env.DISPLAY} (inherited from daemon)` : 'DISPLAY: auto-resolved by snapshot script on Linux if missing',
    'Snapshot Zillow from property cwd:',
    '  node "$REALTOR_REPO_ROOT/scripts/zillow-browser-snapshot.mjs" "<url>" .',
    'Outputs: zillow-snapshot.png, zillow-snapshot.txt in cwd.',
    'Zillow may show a bot challenge — ask the user to complete it in the visible browser window, then re-run the snapshot.',
  ].join('\n');
}
