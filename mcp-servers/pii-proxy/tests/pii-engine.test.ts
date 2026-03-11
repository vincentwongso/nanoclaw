import { describe, it, expect, beforeEach } from 'vitest';
import { PiiEngine } from '../src/pii-engine.js';
import { openDb } from '../src/db.js';

let engine: PiiEngine;

beforeEach(() => {
  const db = openDb(':memory:');
  engine = new PiiEngine({ db, hmacSecret: 'test-secret', maskFinancials: false });
});

describe('maskField', () => {
  it('masks email fields', () => {
    const masked = engine.maskField('john@example.com', 'email');
    expect(masked).toMatch(/^masked-[a-z0-9]{8}@masked\.example$/);
  });

  it('produces the same mask for the same value', () => {
    const a = engine.maskField('john@example.com', 'email');
    const b = engine.maskField('john@example.com', 'email');
    expect(a).toBe(b);
  });

  it('produces different masks for different values', () => {
    const a = engine.maskField('john@example.com', 'email');
    const b = engine.maskField('jane@example.com', 'email');
    expect(a).not.toBe(b);
  });

  it('masks firstName', () => {
    const masked = engine.maskField('John', 'firstName');
    expect(masked).not.toBe('John');
    expect(masked.length).toBeGreaterThan(0);
  });

  it('redacts password without storing in pii_map', () => {
    const masked = engine.maskField('s3cr3t', 'password');
    expect(masked).toBe('[REDACTED]');
  });

  it('does not mask non-PII fields', () => {
    const masked = engine.maskField('USD', 'currency');
    expect(masked).toBe('USD');
  });
});

describe('maskObject', () => {
  it('recursively masks PII in nested objects', () => {
    const input = {
      id: 42,
      firstName: 'John',
      email: 'john@example.com',
      currency: 'USD',
      nested: { phone: '+1234567890' },
    };
    const result = engine.maskObject(input) as typeof input;
    expect(result.id).toBe(42);
    expect(result.currency).toBe('USD');
    expect(result.firstName).not.toBe('John');
    expect(result.email).toMatch(/@masked\.example/);
    expect((result.nested as Record<string, string>).phone).toMatch(/^\+00-/);
  });

  it('masks PII in arrays', () => {
    const input = [{ email: 'a@b.com' }, { email: 'c@d.com' }];
    const result = engine.maskObject(input) as typeof input;
    expect(result[0].email).toMatch(/@masked\.example/);
    expect(result[1].email).toMatch(/@masked\.example/);
  });
});

describe('scanFreetext', () => {
  it('masks email addresses in freetext', () => {
    const text = 'Please contact john@example.com for support';
    const result = engine.scanFreetext(text);
    expect(result).not.toContain('john@example.com');
    expect(result).toContain('masked-');
  });

  it('leaves text without PII unchanged', () => {
    const text = 'The account balance is $500';
    expect(engine.scanFreetext(text)).toBe(text);
  });
});

describe('unmask', () => {
  it('looks up the real value from pii_map', () => {
    const masked = engine.maskField('john@example.com', 'email');
    const real = engine.unmask(masked);
    expect(real).toBe('john@example.com');
  });

  it('returns null for unknown masked value', () => {
    expect(engine.unmask('not-in-db')).toBeNull();
  });
});
