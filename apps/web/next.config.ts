import type { NextConfig } from "next";

// comma-separated LAN hosts allowed to load the dev server, e.g. "192.168.0.101"
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // shared ships TypeScript source; Next compiles it with the app
  transpilePackages: ["@kasip2p/shared"],
  allowedDevOrigins,
};

export default nextConfig;
