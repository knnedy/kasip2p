import { describe, expect, it, vi } from "vitest";
import { createSendQueue } from "./send-queue";

const file = (name: string) => new File(["x"], name);

function deferredSend() {
  const calls: { name: string; peerId: string; finish(ok?: boolean): void }[] = [];
  const send = vi.fn(
    (peerId: string, f: File) =>
      new Promise<void>((resolve, reject) =>
        calls.push({ name: f.name, peerId, finish: (ok = true) => (ok ? resolve() : reject(new Error("x"))) }),
      ),
  );
  return { send, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("send queue", () => {
  it("sends one file at a time per device, in order", async () => {
    const { send, calls } = deferredSend();
    const queue = createSendQueue(send);
    queue.add("bob", [file("a"), file("b")]);
    await tick();
    expect(calls.map((c) => c.name)).toEqual(["a"]);
    expect(queue.snapshot("bob").map((i) => [i.file.name, i.status])).toEqual([
      ["a", "sending"],
      ["b", "queued"],
    ]);
    calls[0]!.finish();
    await tick();
    expect(calls.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("runs different devices independently", async () => {
    const { send, calls } = deferredSend();
    const queue = createSendQueue(send);
    queue.add("bob", [file("a")]);
    queue.add("carol", [file("c")]);
    await tick();
    expect(calls.map((c) => c.peerId)).toEqual(["bob", "carol"]);
  });

  it("keeps going after a failed file", async () => {
    const { send, calls } = deferredSend();
    const queue = createSendQueue(send);
    queue.add("bob", [file("a"), file("b")]);
    await tick();
    calls[0]!.finish(false);
    await tick();
    expect(calls.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("removes and reorders only files still waiting", async () => {
    const { send, calls } = deferredSend();
    const queue = createSendQueue(send);
    queue.add("bob", [file("a"), file("b"), file("c"), file("d")]);
    await tick();
    const [sending, b, , d] = queue.snapshot("bob");
    queue.remove(sending!.id); // in flight: cancel via transfer controls, not here
    queue.remove(b!.id);
    queue.move(d!.id, -1);
    expect(queue.snapshot("bob").map((i) => i.file.name)).toEqual(["a", "d", "c"]);
    calls[0]!.finish();
    await tick();
    expect(calls.map((c) => c.name)).toEqual(["a", "d"]);
  });

  it("drops finished files and notifies on every change", async () => {
    const { send, calls } = deferredSend();
    const queue = createSendQueue(send);
    const listener = vi.fn();
    queue.subscribe(listener);
    queue.add("bob", [file("a")]);
    await tick();
    calls[0]!.finish();
    await tick();
    expect(queue.snapshot("bob")).toEqual([]);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3); // added, sending, done
  });
});
