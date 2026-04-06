import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10gb',
    },
  },
  serverExternalPackages: ['twelvelabs-js', '@databricks/sql'],
};

export default nextConfig;
