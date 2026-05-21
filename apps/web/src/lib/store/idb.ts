import { get, set, del, entries } from "idb-keyval";
import type { TransferRecord } from "@kasip2p/shared";

export async function saveTransfer(record: TransferRecord) {
  await set(record.id, record);
}

export async function getTransfers(): Promise<TransferRecord[]> {
  const all = await entries<string, TransferRecord>();
  return all
    .map(([, value]) => value)
    .sort((a, b) => b.completedAt - a.completedAt);
}

export async function deleteTransfer(id: string) {
  await del(id);
}

export async function clearTransfers() {
  const all = await entries<string, TransferRecord>();
  await Promise.all(all.map(([key]) => del(key)));
}
