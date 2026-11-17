export interface QueueItem {
  id: string;
  peerId: string;
  file: File;
  status: "queued" | "sending";
}

let nextId = 0;

// Per-device FIFO: one file in flight per device, devices run independently.
// send() owns success/failure reporting; the queue only sequences.
type Send = (peerId: string, file: File) => Promise<void>;

export function createSendQueue(initialSend?: Send) {
  let send: Send = initialSend ?? (async () => Promise.reject(new Error("send queue not bound")));
  let items: readonly QueueItem[] = [];
  const snapshots = new Map<string, readonly QueueItem[]>();
  const listeners = new Set<() => void>();

  function commit(next: readonly QueueItem[]) {
    items = next;
    snapshots.clear();
    listeners.forEach((l) => l());
  }

  function pump(peerId: string) {
    const mine = items.filter((i) => i.peerId === peerId);
    if (mine.some((i) => i.status === "sending")) return;
    const head = mine[0];
    if (!head) return;
    commit(items.map((i) => (i === head ? { ...i, status: "sending" } : i)));
    void send(peerId, head.file)
      .catch(() => {}) // already reported by send(); keep the queue moving
      .finally(() => {
        commit(items.filter((i) => i.id !== head.id));
        pump(peerId);
      });
  }

  return {
    // Late binding for React: the hook re-binds its latest send each render.
    bind(next: Send) {
      send = next;
    },
    add(peerId: string, files: File[]) {
      const added = files.map(
        (file): QueueItem => ({ id: `q${++nextId}`, peerId, file, status: "queued" }),
      );
      commit([...items, ...added]);
      pump(peerId);
    },
    remove(id: string) {
      if (items.some((i) => i.id === id && i.status === "queued")) {
        commit(items.filter((i) => i.id !== id));
      }
    },
    // Moves a waiting file within its device's queue; never ahead of the one in flight.
    move(id: string, delta: number) {
      const item = items.find((i) => i.id === id && i.status === "queued");
      if (!item) return;
      const waiting = items.filter((i) => i.peerId === item.peerId && i.status === "queued");
      const from = waiting.indexOf(item);
      const to = Math.max(0, Math.min(waiting.length - 1, from + delta));
      if (to === from) return;
      waiting.splice(from, 1);
      waiting.splice(to, 0, item);
      const others = items.filter((i) => i.peerId !== item.peerId || i.status !== "queued");
      commit([...others, ...waiting]);
    },
    // Stable per peer between changes, for useSyncExternalStore.
    snapshot(peerId: string): readonly QueueItem[] {
      let snap = snapshots.get(peerId);
      if (!snap) {
        snap = items.filter((i) => i.peerId === peerId);
        snapshots.set(peerId, snap);
      }
      return snap;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
