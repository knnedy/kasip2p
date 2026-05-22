import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SIGNAL_URL:
      process.env.NEXT_PUBLIC_SIGNAL_URL ?? "ws://localhost:3001",
  },
  allowedDevOrigins: ["192.168.0.102"],
};

export default nextConfig;
