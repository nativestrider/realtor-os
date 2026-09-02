import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const logoPath = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/realtor-logo.art');

export function printRealtorLogo(): void {
  if (!process.stdout.isTTY) return;
  try {
    const art = readFileSync(logoPath, 'utf8');
    console.log(`\n\x1b[1m\x1b[34m${art}\x1b[0m`);
  } catch {
    console.log('\n  Realtor OS\n');
  }
}
