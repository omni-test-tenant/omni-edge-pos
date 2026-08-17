export class PosTerminal {
  constructor(terminalId, storeId) {
    this.terminalId = terminalId;
    this.storeId = storeId;
    this.offlineQueue = [];
  }

  recordOfflineSale({ orderId, totalCents, sku }) {
    const tx = {
      id: `sync-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      terminalId: this.terminalId,
      orderId,
      totalCents,
      sku,
      status: "queued_for_replication",
      createdAt: new Date().toISOString()
    };
    this.offlineQueue.push(tx);
    return tx;
  }

  syncToCloud(cloudAdapter) {
    const synced = [];
    while (this.offlineQueue.length > 0) {
      const tx = this.offlineQueue.shift();
      tx.status = "replicated";
      synced.push(tx);
    }
    return synced;
  }
}
