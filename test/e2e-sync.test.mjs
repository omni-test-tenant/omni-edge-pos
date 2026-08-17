import assert from "node:assert/strict";
import { test } from "node:test";
import { PosTerminal } from "../src/pos-terminal.mjs";
import { drainOfflineQueue } from "../src/sync-worker.mjs";

test("Live E2E: POS offline sale syncs to live microservice", async (t) => {
  if (!process.env.OMNI_E2E_LIVE) {
    t.skip("OMNI_E2E_LIVE not set - skipping live E2E network test");
    return;
  }

  const endpoint = process.env.OMNI_COMMERCE_ENDPOINT || "http://127.0.0.1:3000";
  const pos = new PosTerminal("pos-term-e2e-01", "omni-flagship-nyc");
  try {
    const tx = pos.recordOfflineSale({
      orderId: `ord-e2e-${Date.now()}`,
      totalCents: 14999,
      sku: "SKU-OMNI-4K-TV"
    });

    const results = await drainOfflineQueue({
      posTerminal: pos,
      cloudEndpoint: endpoint
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "replicated");
  } finally {
    pos.close();
  }
});
