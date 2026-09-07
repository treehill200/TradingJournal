import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
