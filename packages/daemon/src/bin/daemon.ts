import { startServer } from '../server.js';

const port = Number(process.env.REALTOR_DAEMON_PORT ?? 7457);
const host = process.env.REALTOR_BIND_HOST ?? '127.0.0.1';

const server = await startServer(port, { bindHost: host });
console.log(`RealtorOS daemon listening on http://${host}:${server.port}`);
console.log(`Token: ${server.token}`);

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
