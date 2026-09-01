import { readFileSync } from 'node:fs';

const LOW_INOTIFY_THRESHOLD = 256_000;

export function getInotifyWatchLimit(): number | null {
  try {
    return Number(readFileSync('/proc/sys/fs/inotify/max_user_watches', 'utf8').trim());
  } catch {
    return null;
  }
}

/** Use polling when the system watcher limit is low or REALTOR_WEB_POLLING=1. */
export function applyWebDevWatchEnv(env: NodeJS.ProcessEnv): boolean {
  if (env.WATCHPACK_POLLING === 'true') return true;
  if (process.env.REALTOR_WEB_POLLING === '1') {
    env.WATCHPACK_POLLING = 'true';
    return true;
  }
  const limit = getInotifyWatchLimit();
  if (limit !== null && limit < LOW_INOTIFY_THRESHOLD) {
    env.WATCHPACK_POLLING = 'true';
    return true;
  }
  return false;
}

export function printFileWatcherNote(usedPolling: boolean): void {
  if (!usedPolling) return;
  const limit = getInotifyWatchLimit();
  console.log('');
  if (limit !== null) {
    console.log(`  Note: your file-watcher limit is ${limit} — too low for normal dev mode.`);
  } else {
    console.log('  Note: using polling for the web UI.');
  }
  console.log('  Polling keeps RealtorOS reliable; hot reload may be a little slower.');
  console.log('  To fix permanently (Linux), run:');
  console.log('    sudo sysctl -w fs.inotify.max_user_watches=524288');
  console.log('');
}
