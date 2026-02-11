/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['ai-production-asset-managemer.s3.timeweb.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.timeweb.com',
      },
    ],
  },
};

export default nextConfig;
