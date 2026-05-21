import { set, del, entries, clear } from "idb-keyval";
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
