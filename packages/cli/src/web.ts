#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { printRealtorLogo } from './logo.js';
import { applyWebDevWatchEnv, printFileWatcherNote } from './dev-env.js';
import { resolveDisplayEnv } from './display-env.js';

function getDefaultDataDir(): string {
  return process.env.REALTOR_DATA_DIR ?? join(homedir(), '.realtor-os');
}

function getServerTokenPath(dataDir = getDefaultDataDir()): string {
  return join(dataDir, 'server.token');
}

function ensureServerToken(dataDir = getDefaultDataDir()): string {
  mkdirSync(dirname(getServerTokenPath(dataDir)), { recursive: true });
  const tokenPath = getServerTokenPath(dataDir);
  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, 'utf8').trim();
    if (existing) return existing;
  }
  const token = randomUUID().replace(/-/g, '');
  writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  chmodSync(tokenPath, 0o600);
  return token;
}

function readChromiumExecutable(dataDir: string): string | undefined {
  const manifestPath = join(dataDir, 'browser.json');
  if (!existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      chromiumExecutable?: string;
    };
    const executable = manifest.chromiumExecutable?.trim();
    return executable && existsSync(executable) ? executable : undefined;
  } catch {
    return undefined;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..', '..');

interface WebOptions {
  port?: number;
  daemonPort?: number;
  noOpen?: boolean;
  host?: string;
}

function parseArgs(argv: string[]): WebOptions {
  const opts: WebOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-open') opts.noOpen = true;
    else if (arg === '--port') opts.port = Number(argv[++i]);
    else if (arg === '--daemon-port') opts.daemonPort = Number(argv[++i]);
    else if (arg === '--host') opts.host = argv[++i];
  }
  return opts;
}

const DEFAULT_WEB_PORT = 7456;
const DEFAULT_DAEMON_PORT = 7457;

async function isPortAvailable(port: number): Promise<boolean> {
  const free = await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
  return free;
}

async function findFreePort(start = DEFAULT_WEB_PORT, exclude: number[] = []): Promise<number> {
  for (let port = start; port < start + 100; port += 1) {
    if (exclude.includes(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No free port found near ${start}`);
}

interface ResolvedPort {
  port: number;
  preferred: number;
  autoPicked: boolean;
}

async function resolvePort(
  requested: number | undefined,
  preferred: number,
  exclude: number[] = [],
): Promise<ResolvedPort> {
  if (requested !== undefined) {
    if (exclude.includes(requested)) {
      throw new Error(`Port ${requested} is already assigned to another RealtorOS service.`);
    }
    if (!(await isPortAvailable(requested))) {
      throw new Error(
        `Port ${requested} is already in use. Stop the other process or pick a different port with --port / --daemon-port.`,
      );
    }
    return { port: requested, preferred, autoPicked: false };
  }

  if (!exclude.includes(preferred) && (await isPortAvailable(preferred))) {
    return { port: preferred, preferred, autoPicked: false };
  }

  const port = await findFreePort(preferred, exclude);
  return { port, preferred, autoPicked: true };
}

function printPortPlan(
  host: string,
  web: ResolvedPort,
  daemon: ResolvedPort,
): void {
  const webChanged = web.autoPicked || web.port !== DEFAULT_WEB_PORT;
  const daemonChanged = daemon.autoPicked || daemon.port !== DEFAULT_DAEMON_PORT;

  if (!webChanged && !daemonChanged) return;

  console.log('');
  if (web.autoPicked || daemon.autoPicked) {
    console.log('  Some default ports are already in use.');
    if (web.autoPicked) {
      console.log(`  • Web: port ${web.preferred} is busy → using ${web.port}`);
    }
    if (daemon.autoPicked) {
      console.log(`  • Daemon: port ${daemon.preferred} is busy → using ${daemon.port}`);
    }
  } else {
    console.log('  Using the ports you requested.');
  }
  console.log('');
  console.log('  Starting on these ports:');
  console.log(`    Web:    http://${host}:${web.port}`);
  console.log(`    Daemon: http://${host}:${daemon.port}`);
  console.log('');
}

function spawnProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  label: string,
): ReturnType<typeof spawn> {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${label}] exited via ${signal}`);
    } else if (code) {
      console.log(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

async function openBrowser(url: string) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

export async function runWeb(argv: string[]) {
  printRealtorLogo();
  const opts = parseArgs(argv);
  const host = opts.host ?? process.env.REALTOR_BIND_HOST ?? '127.0.0.1';
  const dataDir = getDefaultDataDir();
  const token = ensureServerToken(dataDir);
  const daemonPreferred =
    opts.daemonPort ?? (Number(process.env.REALTOR_DAEMON_PORT) || DEFAULT_DAEMON_PORT);
  const webPreferred = opts.port ?? (Number(process.env.REALTOR_WEB_PORT) || DEFAULT_WEB_PORT);
  const daemon = await resolvePort(opts.daemonPort, daemonPreferred);
  const web = await resolvePort(opts.port, webPreferred, [daemon.port]);

  if (web.port === daemon.port) {
    throw new Error(`Web and daemon cannot share port ${web.port}`);
  }

  printPortPlan(host, web, daemon);

  const daemonPort = daemon.port;
  const webPort = web.port;

  const children: ReturnType<typeof spawn>[] = [];

  const shutdown = () => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const chromiumExecutable = readChromiumExecutable(dataDir);
  const displayEnv = resolveDisplayEnv();

  const daemonEnv = {
    ...process.env,
    REALTOR_DAEMON_PORT: String(daemonPort),
    REALTOR_BIND_HOST: host,
    REALTOR_DATA_DIR: dataDir,
    REALTOR_REPO_ROOT: rootDir,
    ...displayEnv,
    ...(chromiumExecutable ? { REALTOR_CHROMIUM_EXECUTABLE: chromiumExecutable } : {}),
  };

  if (displayEnv.DISPLAY) {
    console.log(`  Display: ${displayEnv.DISPLAY} (for Zillow supervised browser)`);
  } else if (process.platform === 'linux') {
    console.warn(
      '  Warning: no X11 DISPLAY detected — Zillow browser verify will fail until you set REALTOR_DISPLAY or start from a desktop session.',
    );
  }

  children.push(
    spawnProcess('pnpm', ['exec', 'tsx', 'packages/daemon/src/bin/daemon.ts'], daemonEnv, 'daemon'),
  );

  await new Promise((resolve) => setTimeout(resolve, 800));

  const webEnv = {
    ...process.env,
    REALTOR_DAEMON_URL: `http://${host}:${daemonPort}`,
    REALTOR_API_TOKEN: token,
    PORT: String(webPort),
  };
  const usedPolling = applyWebDevWatchEnv(webEnv);
  printFileWatcherNote(usedPolling);

  children.push(
    spawnProcess('pnpm', ['--filter', '@realtor-os/web', 'dev'], webEnv, 'web'),
  );

  const url = `http://${host}:${webPort}/#token=${token}`;
  console.log('  Starting…');
  console.log('');
  console.log('  Open this URL to chat:');
  console.log(`    ${url}`);
  console.log('');
  if (!web.autoPicked && !daemon.autoPicked) {
    console.log(`  Web:    http://${host}:${webPort}`);
    console.log(`  Daemon: http://${host}:${daemonPort}`);
  }
  console.log(`  Token:  ${token}`);
  console.log('\n  Press Ctrl+C to stop.\n');

  if (!opts.noOpen) {
    setTimeout(() => {
      void openBrowser(url);
    }, 1500);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv[2] === 'web' ? process.argv.slice(3) : process.argv.slice(2);
  runWeb(args).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
