import { describe, expect, it, vi } from "vitest";
import { sendWithRetry, TransferCancelled } from "./retry";

describe("sendWithRetry", () => {
  it("retries on a reopened channel until the send succeeds", async () => {
    const open = vi.fn(async () => "dc");
    const send = vi
      .fn<(sink: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("data channel closed"))
      .mockResolvedValueOnce(undefined);
    await sendWithRetry(open, send, 3);
    expect(open).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("counts a channel that never reopens as a failed attempt", async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("peer did not reconnect"))
      .mockResolvedValue("dc");
    const send = vi.fn(async () => {});
    await sendWithRetry(open, send, 1);
    expect(send).toHaveBeenCalledOnce();
  });

  it("gives up with the last error after maxRetries", async () => {
    const send = vi.fn(async () => {
      throw new Error("still closed");
    });
    await expect(sendWithRetry(async () => "dc", send, 2)).rejects.toThrow("still closed");
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("never retries a cancellation", async () => {
    const send = vi.fn(async () => {
      throw new TransferCancelled("cancelled by receiver");
    });
    await expect(sendWithRetry(async () => "dc", send, 3)).rejects.toThrow("cancelled by receiver");
    expect(send).toHaveBeenCalledOnce();
  });
});
