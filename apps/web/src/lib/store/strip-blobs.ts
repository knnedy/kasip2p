import type { TransferRecord } from "@kasip2p/shared";

type Stored = { record: TransferRecord; blob?: Blob };

export interface HistoryKv {
  entries(): Promise<[string, Stored][]>;
  set(key: string, value: Stored): Promise<void>;
}

// Older versions kept received files inside history; files now go to Downloads.
// Returns how many records were cleaned.
export async function stripStoredBlobs(kv: HistoryKv): Promise<number> {
  let cleaned = 0;
  for (const [key, value] of await kv.entries()) {
    if (!value.blob) continue;
    await kv.set(key, { record: value.record });
    cleaned += 1;
  }
  return cleaned;
}
