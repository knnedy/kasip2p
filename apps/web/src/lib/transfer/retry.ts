export const MAX_SEND_RETRIES = 3;

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
      if (attempt >= maxRetries) throw err;
    }
  }
}
