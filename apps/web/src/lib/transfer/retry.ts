export const MAX_SEND_RETRIES = 3;

// Deliberate stop by either side: never retried.
export class TransferCancelled extends Error {
  override name = "TransferCancelled";
}

// Re-runs send on a freshly opened channel; file-accept makes each retry resume.
export async function sendWithRetry<S>(
  open: () => Promise<S>,
  send: (sink: S) => Promise<void>,
  maxRetries = MAX_SEND_RETRIES,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await send(await open());
      return;
    } catch (err) {
      if (err instanceof TransferCancelled || attempt >= maxRetries) throw err;
    }
  }
}
