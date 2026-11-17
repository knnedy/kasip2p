export interface PendingSave {
  transferId: string;
  name: string;
  save(): void; // call from a click: browsers allow downloads on user gesture
}

// Downloads the browser held back; the UI offers a Save button for each.
export function createPendingSaves() {
  let items: readonly PendingSave[] = [];
  const listeners = new Set<() => void>();
  const commit = (next: readonly PendingSave[]) => {
    items = next;
    listeners.forEach((l) => l());
  };
  return {
    snapshot: () => items,
    add(transferId: string, name: string, save: () => void) {
      commit([...items.filter((i) => i.transferId !== transferId), { transferId, name, save }]);
    },
    remove(transferId: string) {
      if (items.some((i) => i.transferId === transferId)) {
        commit(items.filter((i) => i.transferId !== transferId));
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
