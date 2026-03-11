import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDb(dbPath?: string): InstanceType<typeof Database> {
  const resolved = dbPath ?? path.join(__dirname, '..', 'data', 'pii-proxy.db');
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pii_map (
      masked    TEXT NOT NULL,
      real      TEXT NOT NULL,
      field_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (masked, field_type)
    );

    CREATE TABLE IF NOT EXISTS write_queue (
      id          TEXT PRIMARY KEY,
      endpoint    TEXT NOT NULL,
      method      TEXT NOT NULL,
      params      TEXT NOT NULL,
      reason      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      slack_msg_ts      TEXT,
      slack_channel_id  TEXT
    );
  `);

  return db;
}
