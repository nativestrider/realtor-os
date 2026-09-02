#!/usr/bin/env node
/**
 * Install Playwright's bundled Chromium for RealtorOS (supervised browser for listing sites, imports, verify).
 * Cross-platform: macOS, Windows, Linux.
 *
 * Skip with REALTOR_SKIP_BROWSER_INSTALL=1 or PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
 * Linux system libraries (optional): node scripts/install-playwright.mjs --with-deps
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const withDeps = process.argv.includes('--with-deps');

function log(msg) {
  console.log(`[realtor-os] ${msg}`);
}

function warn(msg) {
  console.warn(`[realtor-os] ${msg}`);
}

if (
  process.env.REALTOR_SKIP_BROWSER_INSTALL === '1' ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1'
) {
  log('Skipping Playwright browser install (REALTOR_SKIP_BROWSER_INSTALL=1)');
  process.exit(0);
}

const playwrightCli = join(rootDir, 'node_modules', 'playwright', 'cli.js');
if (!existsSync(playwrightCli)) {
  warn('Playwright package not found — run pnpm install first.');
  process.exit(1);
}

function runPlaywright(args) {
  const result = spawnSync(process.execPath, [playwrightCli, ...args], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

log('Installing Playwright Chromium (built-in browser for listing-site tasks)…');
const installStatus = runPlaywright(['install', 'chromium']);
if (installStatus !== 0) {
  warn('Chromium install failed. Retry with: pnpm run setup:browsers');
  process.exit(installStatus);
}

if (withDeps && process.platform === 'linux') {
  log('Installing Linux system dependencies for Chromium (may prompt for sudo)…');
  const depsStatus = runPlaywright(['install-deps', 'chromium']);
  if (depsStatus !== 0) {
    warn(
      'System dependency install failed. On Linux you may need: sudo pnpm exec playwright install-deps chromium',
    );
  }
}

let chromiumExecutable = '';
try {
  const { chromium } = await import('playwright');
  chromiumExecutable = chromium.executablePath();
} catch (err) {
  warn(`Installed Chromium but could not resolve executable path: ${err instanceof Error ? err.message : err}`);
}

const dataDir = process.env.REALTOR_DATA_DIR ?? join(homedir(), '.realtor-os');
mkdirSync(dataDir, { recursive: true });

const manifest = {
  chromiumExecutable,
  platform: process.platform,
  arch: process.arch,
  installedAt: new Date().toISOString(),
  playwrightVersion: (await import('playwright/package.json', { with: { type: 'json' } })).default
    .version,
};

writeFileSync(join(dataDir, 'browser.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const envLines = [
  '# RealtorOS browser paths — source before agent runs or pass to Playwright MCP',
  chromiumExecutable ? `REALTOR_CHROMIUM_EXECUTABLE=${chromiumExecutable}` : '',
  chromiumExecutable ? `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=${chromiumExecutable}` : '',
  '',
  '# Use bundled Chromium, not system Chrome:',
  '# playwright MCP: set executablePath to REALTOR_CHROMIUM_EXECUTABLE',
].filter((line) => line !== undefined);

writeFileSync(join(dataDir, 'browser.env'), envLines.join('\n'), 'utf8');

log('Chromium ready.');
if (chromiumExecutable) {
  log(`Executable: ${chromiumExecutable}`);
}
log(`Manifest: ${join(dataDir, 'browser.json')}`);

if (process.platform === 'linux' && !withDeps) {
  log('On Linux, if the browser fails to start, run: pnpm run setup:browsers:deps');
}
