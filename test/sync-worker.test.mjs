import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { PosTerminal } from "../src/pos-terminal.mjs";
import { drainOfflineQueue } from "../src/sync-worker.mjs";

test("drainOfflineQueue syncs pending transactions over real HTTP socket with idempotency", async () => {
  const receivedRequests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      receivedRequests.push({
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: JSON.parse(body || "{}")
      });
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, status: "paid" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}`;

  const pos = new PosTerminal("pos-term-nyc-real", "omni-flagship-nyc");
  try {
    pos.recordOfflineSale({ orderId: "ord-real-sync-1", totalCents: 2999, sku: "SKU-A" });
    pos.recordOfflineSale({ orderId: "ord-real-sync-2", totalCents: 5999, sku: "SKU-B" });

    const results = await drainOfflineQueue({
      posTerminal: pos,
      cloudEndpoint: endpoint
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].status, "replicated");
    assert.equal(results[1].status, "replicated");
    assert.equal(pos.getPendingTransactions().length, 0);

    // Verify real network requests arrived with correct idempotency headers
    assert.equal(receivedRequests.length, 2);
    assert.ok(receivedRequests[0].headers["x-idempotency-key"]);
    assert.equal(receivedRequests[0].body.sku, "SKU-A");
    assert.equal(receivedRequests[1].body.sku, "SKU-B");
  } finally {
    pos.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
