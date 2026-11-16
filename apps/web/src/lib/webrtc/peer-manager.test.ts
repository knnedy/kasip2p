import { describe, expect, it } from "vitest";
import { isInitiator } from "./peer-manager";

describe("isInitiator", () => {
  it("picks exactly one side of every pair", () => {
    const ids = ["3f2b-aa", "9c01-bb", "0000-cc", "ffff-dd"];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        expect(isInitiator(a, b)).not.toBe(isInitiator(b, a));
      }
    }
  });
});
