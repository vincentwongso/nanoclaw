import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import type { WriteRequest } from './types.js';

const TTL_MS = 10 * 60 * 1000;

export class WriteQueue {
  constructor(private db: InstanceType<typeof Database>) {}

  enqueue(endpoint: string, method: string, params: unknown, reason: string, ttlMs = TTL_MS): string {
    const id = `wq_${randomBytes(8).toString('hex')}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO write_queue (id, endpoint, method, params, reason, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, endpoint, method, JSON.stringify(params), reason, now, now + ttlMs);
    return id;
  }

  get(id: string): WriteRequest | null {
    const row = this.db.prepare('SELECT * FROM write_queue WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      endpoint: row.endpoint as string,
      method: row.method as string,
      params: JSON.parse(row.params as string),
      reason: row.reason as string,
      status: row.status as WriteRequest['status'],
      createdAt: row.created_at as number,
      expiresAt: row.expires_at as number,
      slackMessageTs: row.slack_msg_ts as string | undefined,
      slackChannelId: row.slack_channel_id as string | undefined,
    };
  }

  approve(id: string): boolean {
    return this.db.prepare(
      "UPDATE write_queue SET status = 'approved' WHERE id = ? AND status = 'pending'"
    ).run(id).changes > 0;
  }

  deny(id: string): boolean {
    return this.db.prepare(
      "UPDATE write_queue SET status = 'denied' WHERE id = ? AND status = 'pending'"
    ).run(id).changes > 0;
  }

  markExecuted(id: string): void {
    this.db.prepare("UPDATE write_queue SET status = 'executed' WHERE id = ?").run(id);
  }

  setSlackMeta(id: string, ts: string, channelId: string): void {
    this.db.prepare(
      'UPDATE write_queue SET slack_msg_ts = ?, slack_channel_id = ? WHERE id = ?'
    ).run(ts, channelId, id);
  }

  expireStale(): string[] {
    const stale = this.db.prepare(
      "SELECT id FROM write_queue WHERE status = 'pending' AND expires_at <= ?"
    ).all(Date.now()) as { id: string }[];
    if (!stale.length) return [];
    const ids = stale.map(r => r.id);
    this.db.prepare(
      `UPDATE write_queue SET status = 'expired' WHERE id IN (${ids.map(() => '?').join(',')})`
    ).run(...ids);
    return ids;
  }
}
