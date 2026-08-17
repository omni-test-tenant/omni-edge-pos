export async function drainOfflineQueue({
  posTerminal,
  cloudEndpoint,
  httpClient = globalThis.fetch,
  timeoutMs = 5000
} = {}) {
  if (!posTerminal) throw new Error("posTerminal is required");
  if (!cloudEndpoint) throw new Error("cloudEndpoint is required");

  const pending = posTerminal.getPendingTransactions();
  const results = [];

  for (const tx of pending) {
    try {
      const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
      const response = await httpClient(`${cloudEndpoint}/api/v1/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": tx.id
        },
        body: JSON.stringify({
          userId: `pos-user-${tx.terminalId}`,
          sku: tx.sku,
          quantity: 1,
          amountCents: tx.totalCents,
          orderId: tx.orderId
        }),
        signal
      });

      // HTTP 200, 201, or 409 (idempotent duplicate) are treated as successful sync
      if ((response.status >= 200 && response.status < 300) || response.status === 409) {
        posTerminal.markTransactionSynced(tx.id);
        results.push({ id: tx.id, orderId: tx.orderId, status: "replicated", httpStatus: response.status });
      } else {
        results.push({ id: tx.id, orderId: tx.orderId, status: "failed", httpStatus: response.status });
      }
    } catch (err) {
      results.push({ id: tx.id, orderId: tx.orderId, status: "network_error", error: err.message });
    }
  }

  return results;
}
