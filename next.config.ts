import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose VERCEL_ENV to server-side code via runtime env detection
  // (VERCEL_ENV is automatically injected by Vercel at build time)

  // Image domains: allow ML static CDN for product images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'http2.mlstatic.com',
      },
      {
        protocol: 'https',
        hostname: '*.mlstatic.com',
      },
    ],
  },

  // Vercel notes:
  // - public/uploads/ is ephemeral on Vercel serverless
  // - For production, migrate uploads to S3/R2/Cloudinary
  // - IMAGE_PUBLIC_BASE_URL must be set for real ML publishing with local images
};

export default nextConfig;
