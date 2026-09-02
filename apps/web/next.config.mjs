/** @type {import('next').NextConfig} */
const daemonUrl = process.env.REALTOR_DAEMON_URL ?? 'http://127.0.0.1:7457';

const nextConfig = {
  // CLI opens http://127.0.0.1; Next only allows "localhost" by default.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '[::1]'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${daemonUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
