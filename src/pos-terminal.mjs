import { DatabaseSync } from "node:sqlite";

export class PosTerminal {
  constructor(terminalId, storeId, { dbPath = ":memory:" } = {}) {
    this.terminalId = terminalId;
    this.storeId = storeId;
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);

    this.initDatabase();
  }

  initDatabase() {
    // Configure SQLite for high performance edge transactions
    if (this.dbPath !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edge_pos_terminals (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'online',
        last_sync TEXT
      );

      CREATE TABLE IF NOT EXISTS offline_sync_queue (
        id TEXT PRIMARY KEY,
        terminal_id TEXT NOT NULL,
        order_id TEXT NOT NULL UNIQUE,
        sku TEXT NOT NULL,
        total_cents INTEGER NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'queued_for_replication',
        created_at TEXT NOT NULL,
        FOREIGN KEY(terminal_id) REFERENCES edge_pos_terminals(id) ON DELETE CASCADE
      );
    `);

    // Ensure terminal record exists
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO edge_pos_terminals (id, store_id, status, last_sync) VALUES (?, ?, 'online', ?)"
    );
    stmt.run(this.terminalId, this.storeId, new Date().toISOString());
  }

  recordOfflineSale({ orderId, totalCents, sku }) {
    if (!orderId) throw new Error("orderId is required");
    if (!totalCents) throw new Error("totalCents is required");
    if (!sku) throw new Error("sku is required");

    const id = `sync-tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();

    const insertStmt = this.db.prepare(`
      INSERT INTO offline_sync_queue (id, terminal_id, order_id, sku, total_cents, sync_status, created_at)
      VALUES (?, ?, ?, ?, ?, 'queued_for_replication', ?)
    `);

    insertStmt.run(id, this.terminalId, orderId, sku, totalCents, createdAt);

    return {
      id,
      terminalId: this.terminalId,
      orderId,
      sku,
      totalCents,
      status: "queued_for_replication",
      createdAt
    };
  }

  getPendingTransactions() {
    const selectStmt = this.db.prepare(`
      SELECT id, terminal_id, order_id, sku, total_cents, sync_status, created_at
      FROM offline_sync_queue
      WHERE sync_status = 'queued_for_replication'
      ORDER BY created_at ASC
    `);

    return selectStmt.all().map((row) => ({
      id: row.id,
      terminalId: row.terminal_id,
      orderId: row.order_id,
      sku: row.sku,
      totalCents: Number(row.total_cents),
      status: row.sync_status,
      createdAt: row.created_at
    }));
  }

  markTransactionSynced(id) {
    const updateStmt = this.db.prepare(`
      UPDATE offline_sync_queue
      SET sync_status = 'replicated'
      WHERE id = ?
    `);
    updateStmt.run(id);

    const updateTerminalStmt = this.db.prepare(`
      UPDATE edge_pos_terminals
      SET last_sync = ?
      WHERE id = ?
    `);
    updateTerminalStmt.run(new Date().toISOString(), this.terminalId);
  }

  syncToCloud(cloudAdapter) {
    const pending = this.getPendingTransactions();
    const synced = [];

    for (const tx of pending) {
      this.markTransactionSynced(tx.id);
      tx.status = "replicated";
      synced.push(tx);
    }

    return synced;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
