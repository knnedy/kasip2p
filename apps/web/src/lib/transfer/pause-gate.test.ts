import { describe, expect, it, vi } from "vitest";
import { createPauseGate } from "./pause-gate";

describe("pause gate", () => {
  it("is open until either side pauses, and closed until that side resumes", async () => {
    const gate = createPauseGate();
    await expect(gate.wait()).resolves.toBeUndefined();
    gate.pause("remote");
    const passed = vi.fn();
    void gate.wait().then(passed);
    gate.resume("local"); // not ours to lift
    await Promise.resolve();
    expect(passed).not.toHaveBeenCalled();
    gate.resume("remote");
    await vi.waitFor(() => expect(passed).toHaveBeenCalled());
  });

  it("stays closed while the other side still has it paused", async () => {
    const gate = createPauseGate();
    gate.pause("local");
    gate.pause("remote");
    gate.resume("local");
    expect(gate.state()).toEqual({ local: false, remote: true });
    const passed = vi.fn();
    void gate.wait().then(passed);
    await Promise.resolve();
    expect(passed).not.toHaveBeenCalled();
  });
});
