import { describe, expect, it } from "vitest";
import { generatePin, PIN_LENGTH } from "./pin";

function sequence(...values: number[]) {
  return (a: Uint32Array) => {
    a[0] = values.shift()!;
    return a;
  };
}

describe("generatePin", () => {
  it("returns six digits, zero-padded", () => {
    expect(generatePin(sequence(42))).toBe("000042");
    expect(generatePin()).toMatch(new RegExp(`^\\d{${PIN_LENGTH}}$`));
  });

  it("rejects values in the biased tail and draws again", () => {
    expect(generatePin(sequence(2 ** 32 - 1, 7))).toBe("000007");
  });
});
