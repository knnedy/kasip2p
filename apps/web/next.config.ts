import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // shared ships TypeScript source; Next compiles it with the app
  transpilePackages: ["@kasip2p/shared"],
  env: {
    NEXT_PUBLIC_SIGNAL_URL:
      process.env.NEXT_PUBLIC_SIGNAL_URL ?? "ws://localhost:3001",
  },
  allowedDevOrigins: ["192.168.0.102"],
};

export default nextConfig;
