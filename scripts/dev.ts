import { runWeb } from '../packages/cli/src/web.js';

runWeb(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
