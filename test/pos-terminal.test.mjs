import assert from "node:assert/strict";
import { test } from "node:test";
import { PosTerminal } from "../src/pos-terminal.mjs";

test("PosTerminal records offline transactions and drains queue on sync", () => {
  const pos = new PosTerminal("pos-term-nyc-01", "omni-flagship-nyc");
  const tx = pos.recordOfflineSale({ orderId: "ord-offline-101", totalCents: 4999, sku: "SKU-OMNI-HEADPHONES" });
  assert.equal(tx.status, "queued_for_replication");
  assert.equal(pos.offlineQueue.length, 1);

  const synced = pos.syncToCloud();
  assert.equal(synced.length, 1);
  assert.equal(synced[0].status, "replicated");
  assert.equal(pos.offlineQueue.length, 0);
});
