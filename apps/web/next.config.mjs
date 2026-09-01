/** @type {import('next').NextConfig} */
const daemonUrl = process.env.REALTOR_DAEMON_URL ?? 'http://127.0.0.1:7457';

const nextConfig = {
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
