import assert from "node:assert/strict";
import { test } from "node:test";
import { PosTerminal } from "../src/pos-terminal.mjs";

test("PosTerminal records offline transactions in SQLite and drains queue on sync", () => {
  const pos = new PosTerminal("pos-term-nyc-01", "omni-flagship-nyc");
  try {
    const tx = pos.recordOfflineSale({
      orderId: "ord-offline-101",
      totalCents: 4999,
      sku: "SKU-OMNI-HEADPHONES"
    });

    assert.equal(tx.status, "queued_for_replication");
    assert.equal(pos.getPendingTransactions().length, 1);

    const pending = pos.getPendingTransactions();
    assert.equal(pending[0].orderId, "ord-offline-101");
    assert.equal(pending[0].sku, "SKU-OMNI-HEADPHONES");
    assert.equal(pending[0].totalCents, 4999);

    const synced = pos.syncToCloud();
    assert.equal(synced.length, 1);
    assert.equal(synced[0].status, "replicated");
    assert.equal(pos.getPendingTransactions().length, 0);
  } finally {
    pos.close();
  }
});

test("PosTerminal enforces unique order_id constraint on offline_sync_queue", () => {
  const pos = new PosTerminal("pos-term-nyc-02", "omni-flagship-nyc");
  try {
    pos.recordOfflineSale({
      orderId: "ord-dup-101",
      totalCents: 1999,
      sku: "SKU-OMNI-MOUSE"
    });

    assert.throws(
      () => pos.recordOfflineSale({
        orderId: "ord-dup-101",
        totalCents: 1999,
        sku: "SKU-OMNI-MOUSE"
      }),
      /UNIQUE constraint failed/
    );
  } finally {
    pos.close();
  }
});
