import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb } from '../src/db.js';
import type Database from 'better-sqlite3';

let db: InstanceType<typeof Database>;

beforeEach(() => { db = openDb(':memory:'); });
afterEach(() => { db.close(); });

describe('openDb', () => {
  it('creates pii_map table', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pii_map'"
    ).get();
    expect(row).toBeDefined();
  });

  it('creates write_queue table', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='write_queue'"
    ).get();
    expect(row).toBeDefined();
  });
});
