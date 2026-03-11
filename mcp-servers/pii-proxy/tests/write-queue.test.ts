import { describe, it, expect, beforeEach } from 'vitest';
import { WriteQueue } from '../src/write-queue.js';
import { openDb } from '../src/db.js';

let queue: WriteQueue;

beforeEach(() => {
  queue = new WriteQueue(openDb(':memory:'));
});

describe('enqueue', () => {
  it('returns a request_id starting with wq_', () => {
    const id = queue.enqueue('/api/test', 'POST', { foo: 'bar' }, 'test reason');
    expect(id).toMatch(/^wq_/);
  });

  it('stores the request as pending', () => {
    const id = queue.enqueue('/api/test', 'POST', {}, 'reason');
    const req = queue.get(id);
    expect(req).not.toBeNull();
    expect(req!.status).toBe('pending');
    expect(req!.endpoint).toBe('/api/test');
  });
});

describe('approve / deny', () => {
  it('approve sets status to approved', () => {
    const id = queue.enqueue('/api/test', 'POST', {}, 'reason');
    queue.approve(id);
    expect(queue.get(id)!.status).toBe('approved');
  });

  it('deny sets status to denied', () => {
    const id = queue.enqueue('/api/test', 'POST', {}, 'reason');
    queue.deny(id);
    expect(queue.get(id)!.status).toBe('denied');
  });

  it('approve returns false for unknown id', () => {
    expect(queue.approve('wq_unknown')).toBe(false);
  });
});

describe('expireStale', () => {
  it('marks expired pending requests', () => {
    const id = queue.enqueue('/api/test', 'POST', {}, 'reason', -1);
    const expired = queue.expireStale();
    expect(expired).toContain(id);
    expect(queue.get(id)!.status).toBe('expired');
  });
});
