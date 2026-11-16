import { describe, expect, it } from "vitest";
import { isOriginAllowed, parseAllowedOrigins } from "./config.ts";

describe("parseAllowedOrigins", () => {
  it("splits, trims and drops trailing slashes", () => {
    expect(parseAllowedOrigins(" https://a.app/, http://b:3000 ,,")).toEqual([
      "https://a.app",
      "http://b:3000",
    ]);
  });

  it("is empty when unset", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe("isOriginAllowed", () => {
  const allowed = ["https://kasip2p.vercel.app"];

  it("allows anything when no list is configured", () => {
    expect(isOriginAllowed(undefined, [])).toBe(true);
    expect(isOriginAllowed("https://evil.example", [])).toBe(true);
  });

  it("allows only listed origins when configured", () => {
    expect(isOriginAllowed("https://kasip2p.vercel.app", allowed)).toBe(true);
    expect(isOriginAllowed("https://evil.example", allowed)).toBe(false);
  });

  it("rejects a missing origin when a list is configured", () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
  });
});
