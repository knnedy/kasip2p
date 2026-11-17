import type { Outgoing } from "./folders";

export interface QueueItem extends Outgoing {
  id: string;
  peerId: string;
  status: "queued" | "sending";
}

let nextId = 0;

// Per-device FIFO: one file in flight per device, devices run independently.
// send() owns success/failure reporting; the queue only sequences.
type Send = (peerId: string, item: Outgoing) => Promise<void>;

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
    void send(peerId, { file: head.file, folder: head.folder })
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
    add(peerId: string, outgoing: Outgoing[]) {
      const added = outgoing.map(
        (o): QueueItem => ({ ...o, id: `q${++nextId}`, peerId, status: "queued" }),
      );
      commit([...items, ...added]);
      pump(peerId);
    },
    // A folder file takes the rest of its folder with it: the receiver needs them all in order.
    remove(id: string) {
      const item = items.find((i) => i.id === id && i.status === "queued");
      if (!item) return;
      const folderId = item.folder?.id;
      commit(
        items.filter(
          (i) => i.id !== id && !(folderId && i.status === "queued" && i.folder?.id === folderId),
        ),
      );
    },
    removeFolder(folderId: string) {
      const next = items.filter((i) => i.status !== "queued" || i.folder?.id !== folderId);
      if (next.length !== items.length) commit(next);
    },
    // Moves a waiting loose file among loose files; folder files keep their order.
    move(id: string, delta: number) {
      const item = items.find((i) => i.id === id && i.status === "queued" && !i.folder);
      if (!item) return;
      const movable = (i: QueueItem) =>
        i.peerId === item.peerId && i.status === "queued" && !i.folder;
      const waiting = items.filter(movable);
      const from = waiting.indexOf(item);
      const to = Math.max(0, Math.min(waiting.length - 1, from + delta));
      if (to === from) return;
      waiting.splice(from, 1);
      waiting.splice(to, 0, item);
      let next = 0;
      commit(items.map((i) => (movable(i) ? waiting[next++]! : i)));
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
