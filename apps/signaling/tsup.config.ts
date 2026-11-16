import { defineConfig } from "tsup";

// shared ships TypeScript source, so bundle it in instead of resolving at runtime
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  noExternal: ["@kasip2p/shared"],
});
