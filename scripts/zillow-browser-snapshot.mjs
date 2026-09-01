#!/usr/bin/env node
/**
 * Open Zillow in visible Playwright Chromium and save snapshot files to cwd.
 * Usage: node zillow-browser-snapshot.mjs <zillow-url> [output-dir]
 *
 * Requires: pnpm run setup:browsers (sets ~/.realtor-os/browser.json)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDisplayEnv, formatMissingDisplayHelp } from './lib/resolve-display.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2];
const outDir = resolve(process.argv[3] ?? process.cwd());

if (!url?.includes('zillow.com')) {
  console.error('Usage: node zillow-browser-snapshot.mjs <zillow-homedetails-url> [output-dir]');
  process.exit(1);
}

function readChromiumPath() {
  if (process.env.REALTOR_CHROMIUM_EXECUTABLE) return process.env.REALTOR_CHROMIUM_EXECUTABLE;
  const manifestPath = join(process.env.REALTOR_DATA_DIR ?? join(homedir(), '.realtor-os'), 'browser.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return data.chromiumExecutable ?? null;
  } catch {
    return null;
  }
}

const chromiumExecutable = readChromiumPath();
if (!chromiumExecutable || !existsSync(chromiumExecutable)) {
  console.error('Playwright Chromium not installed. Run: pnpm run setup:browsers');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const displayEnv = applyDisplayEnv();
if (process.platform === 'linux' && !process.env.DISPLAY?.trim()) {
  console.error(formatMissingDisplayHelp());
  process.exit(1);
}
if (displayEnv.DISPLAY) {
  console.error(`[realtor-os] Using DISPLAY=${displayEnv.DISPLAY}`);
}

const { chromium } = await import(join(repoRoot, 'node_modules/playwright/index.mjs'));

const browser = await chromium.launch({
  executablePath: chromiumExecutable,
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
});

try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 50_000) ?? '');
  const screenshotPath = join(outDir, 'zillow-snapshot.png');
  const textPath = join(outDir, 'zillow-snapshot.txt');

  await page.screenshot({ path: screenshotPath, fullPage: false });
  writeFileSync(
    textPath,
    `URL: ${url}\nTitle: ${title}\nCaptured: ${new Date().toISOString()}\n\n${text}`,
    'utf8',
  );

  console.log(JSON.stringify({ screenshotPath, textPath, title }, null, 2));
} finally {
  await browser.close();
}
