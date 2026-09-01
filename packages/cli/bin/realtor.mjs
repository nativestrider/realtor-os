#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = join(__dirname, '..');
const rootDir = join(cliDir, '..', '..');
const webEntry = join(cliDir, 'src', 'web.ts');

const sub = process.argv[2];
if (sub === 'web') {
  const child = spawn(
    'pnpm',
    ['exec', 'tsx', webEntry, ...process.argv.slice(3)],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    },
  );
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  console.log('Usage: realtor web [--port 7456] [--daemon-port 7457] [--no-open] [--host 127.0.0.1]');
  process.exit(sub ? 1 : 0);
}
