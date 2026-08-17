import assert from "node:assert/strict";
import { test } from "node:test";
import { PosTerminal } from "../src/pos-terminal.mjs";
import { drainOfflineQueue } from "../src/sync-worker.mjs";

test("drainOfflineQueue syncs pending transactions with cloud endpoint idempotently", async () => {
  const pos = new PosTerminal("pos-term-nyc-03", "omni-flagship-nyc");
  try {
    pos.recordOfflineSale({ orderId: "ord-sync-1", totalCents: 2999, sku: "SKU-A" });
    pos.recordOfflineSale({ orderId: "ord-sync-2", totalCents: 5999, sku: "SKU-B" });

    const requests = [];
    const mockHttpClient = async (url, options) => {
      requests.push({ url, options });
      return { status: 201, json: async () => ({ success: true }) };
    };

    const results = await drainOfflineQueue({
      posTerminal: pos,
      cloudEndpoint: "https://cloud.omnicommerce.internal",
      httpClient: mockHttpClient
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].status, "replicated");
    assert.equal(results[1].status, "replicated");
    assert.equal(pos.getPendingTransactions().length, 0);

    // Verify idempotency header was passed
    assert.ok(requests[0].options.headers["X-Idempotency-Key"]);
  } finally {
    pos.close();
  }
});
