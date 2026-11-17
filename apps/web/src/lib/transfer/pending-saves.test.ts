import { describe, expect, it, vi } from "vitest";
import { createPendingSaves } from "./pending-saves";

describe("pending saves", () => {
  it("lists blocked downloads until they start", () => {
    const saves = createPendingSaves();
    const save = vi.fn();
    saves.add("t1", "a.pdf", save);
    expect(saves.snapshot()).toEqual([{ transferId: "t1", name: "a.pdf", save }]);
    saves.remove("t1");
    expect(saves.snapshot()).toEqual([]);
  });

  it("replaces an entry for the same transfer instead of duplicating it", () => {
    const saves = createPendingSaves();
    saves.add("t1", "a.pdf", vi.fn());
    saves.add("t1", "a.pdf", vi.fn());
    expect(saves.snapshot()).toHaveLength(1);
  });

  it("gives a new snapshot and notifies only on change", () => {
    const saves = createPendingSaves();
    const listener = vi.fn();
    saves.subscribe(listener);
    const before = saves.snapshot();
    saves.remove("missing");
    expect(listener).not.toHaveBeenCalled();
    saves.add("t1", "a.pdf", vi.fn());
    expect(listener).toHaveBeenCalledOnce();
    expect(saves.snapshot()).not.toBe(before);
  });
});
