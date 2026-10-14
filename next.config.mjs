/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  basePath: basePath || undefined,
  trailingSlash: true,
  devIndicators: false,
};

export default nextConfig;
