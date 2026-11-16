import { set, get, del, entries, clear, createStore, type UseStore } from "idb-keyval";
import type { TransferRecord } from "@kasip2p/shared";

export async function saveTransfer(record: TransferRecord, blob?: Blob) {
  await set(record.id, { record, blob });
}

export async function getTransfers(): Promise<
  { record: TransferRecord; downloadUrl?: string }[]
> {
  const all = await entries<string, { record: TransferRecord; blob?: Blob }>();
  return all
    .map(([, value]) => ({
      record: value.record,
      downloadUrl: value.blob ? URL.createObjectURL(value.blob) : undefined,
    }))
    .sort((a, b) => b.record.completedAt - a.record.completedAt);
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
