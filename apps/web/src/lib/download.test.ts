import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, REVOKE_AFTER_MS } from "./download";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("clicks a named link, then revokes its URL", () => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const anchor = { href: "", download: "", click: vi.fn() };

    downloadBlob(new Blob(["hi"]), "a.txt", () => anchor);

    expect(anchor).toMatchObject({ href: "blob:x", download: "a.txt" });
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });

  it("revokes even if the click throws", () => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:y");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const anchor = {
      href: "",
      download: "",
      click: () => {
        throw new Error("blocked");
      },
    };
    expect(() => downloadBlob(new Blob([]), "b", () => anchor)).toThrow("blocked");
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revoke).toHaveBeenCalledWith("blob:y");
  });
});
