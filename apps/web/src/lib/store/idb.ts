import { set, get, del, entries, clear, createStore, type UseStore } from "idb-keyval";
import type { TransferRecord } from "@kasip2p/shared";
import { stripStoredBlobs } from "./strip-blobs";

// History is metadata only; received files live in the user's Downloads.
export async function saveTransfer(record: TransferRecord) {
  await set(record.id, { record });
}

export async function getTransfers(): Promise<{ record: TransferRecord }[]> {
  const all = await entries<string, { record: TransferRecord }>();
  return all
    .map(([, value]) => ({ record: value.record }))
    .sort((a, b) => b.record.completedAt - a.record.completedAt);
}

// One-off cleanup of file copies stored by older versions.
export async function dropStoredFileCopies() {
  return stripStoredBlobs({ entries: () => entries(), set: (k, v) => set(k, v) });
}

export async function deleteTransfer(id: string) {
  await del(id);
}

export async function clearTransfers() {
  await clear();
}

// Manifests for files still being received, so a dropped transfer can resume.
export interface PartialRecord {
  transferId: string;
  name: string;
  size: number;
}

let partials: UseStore | null = null;
const partialStore = () => (partials ??= createStore("kasip2p-partials", "partials"));

export async function savePartial(record: PartialRecord) {
  await set(record.transferId, record, partialStore());
}

export async function getPartial(transferId: string) {
  return get<PartialRecord>(transferId, partialStore());
}

export async function deletePartial(transferId: string) {
  await del(transferId, partialStore());
}

export async function clearPartials() {
  await clear(partialStore());
}
