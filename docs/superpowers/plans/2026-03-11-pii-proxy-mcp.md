# PII-Proxy MCP Server Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PII-masking MCP server that gives Nano full read access to the FXBO Client API with all PII masked, and routes all write operations through a Slack Block Kit approval flow.

**Architecture:** HTTP/SSE MCP transport — server runs persistently on the host (port 3098), agent connects from inside the container via `host.containers.internal`. A second HTTP handler on port 3099 receives Slack approval callbacks from NanoClaw. All API responses pass through the PII engine before reaching Nano.

**Tech Stack:** Node.js/TypeScript (ESM, matches NanoClaw), `@modelcontextprotocol/sdk`, `better-sqlite3`, `@slack/web-api`, `zod`, `vitest`

---

## Important Notes

- **Networking:** From inside the container, the host is reachable as `host.containers.internal` (Apple Container) or `host.docker.internal` (Docker). Check `docs/APPLE-CONTAINER-NETWORKING.md` for the active runtime. Use env var `PII_PROXY_HOST` so it's configurable.
- **Spec location after move:** `mcp-servers/pii-proxy/docs/client-api.json` (moved from `data/ipc/slack/client-api-doc.json/client-api-doc.json`).
- **settings.json guard:** `src/container-runner.ts` only writes `settings.json` if it doesn't exist. The MCP integration task must merge into existing files too — use a read-merge-write strategy.
- **MCP transport — SSE (not stdio):** The server runs persistently on host port 3098. The design spec diagram label "stdio" is stale; SSE is the correct choice here because the server needs to persist across agent sessions to maintain the SQLite PII map and write queue.
- **Zod version:** Use `"zod": "^3.22.0"` — NOT v4. The `@modelcontextprotocol/sdk` peer-depends on Zod v3.
- **MCP SDK approach:** Use the low-level `Server` class (not `McpServer`) to register tools with raw JSON Schema `inputSchema` from the OpenAPI spec. This preserves per-tool parameter documentation.
- **Two separate approval port env vars:** `APPROVAL_HTTP_PORT` is the pii-proxy-side setting (in `mcp-servers/pii-proxy/.env`). `PII_PROXY_APPROVAL_PORT` is the NanoClaw-side setting (in NanoClaw's `.env`). Both default to `3099` — they must match.
- **pnpm workspace:** No `pnpm-workspace.yaml` exists yet. Task 1 must create it so the pii-proxy package is part of the workspace.

---

## File Map

### New files (mcp-servers/pii-proxy/)
| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies, build scripts |
| `tsconfig.json` | TypeScript config (ESM, NodeNext) |
| `.env.example` | Required env vars documentation |
| `src/types.ts` | Shared TypeScript types |
| `src/server.ts` | Entry point: starts MCP SSE server (3098) + approval HTTP server (3099) |
| `src/tool-generator.ts` | Parses OpenAPI spec → generates ~65 MCP read tools at runtime |
| `src/api-client.ts` | Authenticated HTTP client for FXBO API |
| `src/pii-engine.ts` | Mask/unmask, HMAC hashing, content scanning, SQLite persistence |
| `src/write-queue.ts` | SQLite write queue CRUD + TTL expiry cleanup |
| `src/slack-notify.ts` | Block Kit approval message builder + Slack API sender |
| `src/db.ts` | Opens/initialises SQLite, runs migrations |
| `docs/client-api.json` | OpenAPI spec (copied here as source of truth) |
| `data/.gitkeep` | Placeholder for runtime SQLite DB |
| `tests/db.test.ts` | DB schema tests |
| `tests/pii-engine.test.ts` | PII engine unit tests |
| `tests/write-queue.test.ts` | Write queue unit tests |
| `tests/tool-generator.test.ts` | Tool generation unit tests |

### New files (project root)
| File | Responsibility |
|------|---------------|
| `docs/api/client-api-summary.md` | Generated endpoint reference for humans/Claude Code |
| `scripts/generate-api-summary.ts` | Generates the summary from the spec |
| `container/skills/client-api/SKILL.md` | Nano's reference for using the MCP tools |

### Modified files (NanoClaw)
| File | Change |
|------|--------|
| `src/container-runner.ts` | Add `mcpServers` to settings.json + merge helper for existing files |
| `src/channels/slack.ts` | Add `block_actions` handler for `pii_proxy_approve_*` / `pii_proxy_deny_*` |

---

## Chunk 1: Project Scaffold & API Client

### Task 1: Create mcp-servers/pii-proxy package

**Files:**
- Create: `mcp-servers/pii-proxy/package.json`
- Create: `mcp-servers/pii-proxy/tsconfig.json`
- Create: `mcp-servers/pii-proxy/.env.example`
- Create: `mcp-servers/pii-proxy/src/types.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p mcp-servers/pii-proxy/src
mkdir -p mcp-servers/pii-proxy/tests
mkdir -p mcp-servers/pii-proxy/docs
mkdir -p mcp-servers/pii-proxy/data
touch mcp-servers/pii-proxy/data/.gitkeep
```

- [ ] **Step 2: Write package.json**

```json
{
  "name": "pii-proxy-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@slack/web-api": "^7.0.0",
    "better-sqlite3": "^11.8.1",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^4.0.18"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Write .env.example**

```bash
# FXBO Client API
API_BASE_URL=https://your-broker.example.com
API_TOKEN=your-bearer-token-here

# PII masking secret (generate with: openssl rand -hex 32)
PII_HMAC_SECRET=change-me-generate-with-openssl-rand-hex-32

# Slack (reuse NanoClaw's bot token + the channel ID where approvals go)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APPROVAL_CHANNEL_ID=C0123456789

# Server ports (host-only, not exposed externally)
MCP_SSE_PORT=3098
APPROVAL_HTTP_PORT=3099

# Optional: mask financial figures too (default: false)
MASK_FINANCIALS=false
```

- [ ] **Step 5: Write src/types.ts**

```typescript
export interface WriteRequest {
  id: string;
  endpoint: string;
  method: string;
  params: unknown;        // PII already masked
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'executed';
  createdAt: number;
  expiresAt: number;
  slackMessageTs?: string;
  slackChannelId?: string;
}

export interface PiiMapping {
  masked: string;
  real: string;
  fieldType: string;
  createdAt: number;
}
```

- [ ] **Step 6: Create pnpm-workspace.yaml at project root** (if it doesn't exist)

```yaml
packages:
  - .
  - mcp-servers/*
```

If it already exists, add `  - mcp-servers/*` to the `packages` list.

- [ ] **Step 7: Write vitest.config.ts for pii-proxy**

```typescript
// mcp-servers/pii-proxy/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

Vitest needs this to correctly resolve `.js` imports in NodeNext ESM mode via the `tsx` loader.

- [ ] **Step 8: Install dependencies**

```bash
cd mcp-servers/pii-proxy && pnpm install
```

Expected: dependencies installed, no errors.

- [ ] **Step 9: Commit**

```bash
git add pnpm-workspace.yaml mcp-servers/pii-proxy/
git commit -m "feat(pii-proxy): scaffold package structure"
```

---

### Task 2: Database initialisation

**Files:**
- Create: `mcp-servers/pii-proxy/src/db.ts`
- Create: `mcp-servers/pii-proxy/tests/db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/db.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/db.test.ts
```

Expected: FAIL — `openDb` not defined.

- [ ] **Step 3: Write src/db.ts**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/db.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add mcp-servers/pii-proxy/src/db.ts mcp-servers/pii-proxy/tests/db.test.ts
git commit -m "feat(pii-proxy): add SQLite schema"
```

---

### Task 3: FXBO API client

**Files:**
- Create: `mcp-servers/pii-proxy/src/api-client.ts`

- [ ] **Step 1: Write src/api-client.ts**

```typescript
export interface ClientConfig {
  baseUrl: string;
  token: string;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export class ApiClient {
  constructor(private config: ClientConfig) {}

  async request<T = unknown>(
    method: string,
    endpoint: string,
    params?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = new URL(endpoint, this.config.baseUrl);

    const isRead = method === 'GET';
    if (isRead && params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params as Record<string, string>)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: !isRead && params ? JSON.stringify(params) : undefined,
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data: data as T };
  }
}
```

- [ ] **Step 2: Build to verify TypeScript compiles**

```bash
cd mcp-servers/pii-proxy && pnpm build
```

Expected: `dist/api-client.js` created, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add mcp-servers/pii-proxy/src/api-client.ts
git commit -m "feat(pii-proxy): add FXBO API client"
```

---

## Chunk 2: PII Engine

### Task 4: PII engine — field masking

**Files:**
- Create: `mcp-servers/pii-proxy/src/pii-engine.ts`
- Create: `mcp-servers/pii-proxy/tests/pii-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/pii-engine.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/pii-engine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write src/pii-engine.ts**

```typescript
import crypto from 'crypto';
import type Database from 'better-sqlite3';

const NAME_FIELDS = new Set(['firstName', 'lastName', 'middleName', 'fullName']);
const EMAIL_FIELDS = new Set(['email']);
const PHONE_FIELDS = new Set(['phone', 'mobilePhone']);
const ADDRESS_FIELDS = new Set(['address']);
const CITY_FIELDS = new Set(['city']);
const STATE_FIELDS = new Set(['state']);
const ZIP_FIELDS = new Set(['zipCode', 'zip']);
const DATE_FIELDS = new Set(['birthDate', 'dateOfBirth']);
const ID_FIELDS = new Set(['tin', 'lei', 'nationalId', 'taxResidency']);
const IP_FIELDS = new Set(['clientIp', 'ip']);
const REDACT_FIELDS = new Set([
  'password', 'investorPassword', 'token', 'refreshToken', 'accessToken',
]);
const FINANCIAL_FIELDS = new Set(['balance', 'equity', 'margin', 'credit', 'marginFree']);

const ADJECTIVES = ['Amber','Azure','Coral','Crimson','Cyan','Fern','Gold',
  'Indigo','Ivory','Jade','Lapis','Lime','Mauve','Mist','Olive','Onyx',
  'Pearl','Pine','Rose','Ruby','Sage','Sand','Silver','Slate','Steel',
  'Teal','Terra','Topaz','Umber','Violet'];
const NOUNS = ['Arrow','Bear','Brook','Cedar','Cliff','Crane','Creek','Crow',
  'Dune','Eagle','Fawn','Finch','Flint','Frost','Grove','Hawk','Heath',
  'Heron','Hill','Iris','Kite','Lake','Lark','Leaf','Lynx','Mare','Marsh',
  'Moor','Moss','Peak','Pine','Reed','Ridge','River','Robin','Rock','Shore',
  'Skye','Spruce','Stone','Swan','Tern','Vale','Wren'];

interface PiiEngineOptions {
  db: InstanceType<typeof Database>;
  hmacSecret: string;
  maskFinancials: boolean;
}

export class PiiEngine {
  private db: InstanceType<typeof Database>;
  private secret: string;
  private maskFinancials: boolean;

  constructor(opts: PiiEngineOptions) {
    this.db = opts.db;
    this.secret = opts.hmacSecret;
    this.maskFinancials = opts.maskFinancials;
  }

  private hash(value: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(value)
      .digest('base64url')
      .slice(0, 8);
  }

  private store(masked: string, real: string, fieldType: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO pii_map (masked, real, field_type, created_at)
      VALUES (?, ?, ?, ?)
    `).run(masked, real, fieldType, Date.now());
  }

  maskField(value: string | null | undefined, fieldName: string): string {
    if (value === null || value === undefined || value === '') return value ?? '';
    if (REDACT_FIELDS.has(fieldName)) return '[REDACTED]';
    if (this.maskFinancials && FINANCIAL_FIELDS.has(fieldName)) return '[MASKED]';

    const h = this.hash(value);

    if (NAME_FIELDS.has(fieldName)) {
      const adj = ADJECTIVES[parseInt(h.slice(0, 2), 36) % ADJECTIVES.length];
      const noun = NOUNS[parseInt(h.slice(2, 4), 36) % NOUNS.length];
      const masked = `${adj} ${noun}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (EMAIL_FIELDS.has(fieldName)) {
      const masked = `masked-${h}@masked.example`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (PHONE_FIELDS.has(fieldName)) {
      const masked = `+00-${h}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (ADDRESS_FIELDS.has(fieldName)) {
      const masked = `${h} Masked St`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (CITY_FIELDS.has(fieldName)) {
      const masked = `Masked City ${h.slice(0, 4)}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (STATE_FIELDS.has(fieldName) || ZIP_FIELDS.has(fieldName)) {
      const masked = STATE_FIELDS.has(fieldName) ? 'MS' : '00000';
      this.store(masked, value, fieldName);
      return masked;
    }
    if (DATE_FIELDS.has(fieldName)) {
      const shift = (parseInt(h.slice(0, 4), 16) % 180) - 90;
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + shift);
        const masked = d.toISOString().split('T')[0];
        this.store(masked, value, fieldName);
        return masked;
      }
    }
    if (ID_FIELDS.has(fieldName)) {
      const masked = `MASKED-${h}`;
      this.store(masked, value, fieldName);
      return masked;
    }
    if (IP_FIELDS.has(fieldName)) return '0.0.0.0';

    return value;
  }

  maskObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(item => this.maskObject(item));
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = typeof val === 'string' ? this.maskField(val, key) : this.maskObject(val);
      }
      return result;
    }
    return obj;
  }

  scanFreetext(text: string): string {
    // Mask emails
    let result = text.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      match => {
        const masked = `masked-${this.hash(match)}@masked.example`;
        this.store(masked, match, 'email_freetext');
        return masked;
      },
    );
    // Mask phone numbers (international and local formats)
    result = result.replace(
      /\b(\+?[\d][\d\s\-().]{7,}\d)\b/g,
      match => {
        const masked = `+00-${this.hash(match)}`;
        this.store(masked, match, 'phone_freetext');
        return masked;
      },
    );
    // Mask card-like numbers (16 digits, optionally space/dash separated)
    result = result.replace(
      /\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b/g,
      match => {
        this.store('MASKED-CARD', match, 'card_freetext');
        return 'MASKED-CARD';
      },
    );
    return result;
  }

  unmask(masked: string): string | null {
    const row = this.db.prepare(
      'SELECT real FROM pii_map WHERE masked = ? LIMIT 1'
    ).get(masked) as { real: string } | undefined;
    return row?.real ?? null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/pii-engine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-servers/pii-proxy/src/pii-engine.ts mcp-servers/pii-proxy/tests/pii-engine.test.ts
git commit -m "feat(pii-proxy): add PII masking engine with HMAC hashing"
```

---

## Chunk 3: Write Queue & Slack Notifier

### Task 5: Write queue

**Files:**
- Create: `mcp-servers/pii-proxy/src/write-queue.ts`
- Create: `mcp-servers/pii-proxy/tests/write-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/write-queue.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/write-queue.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write src/write-queue.ts**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/write-queue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-servers/pii-proxy/src/write-queue.ts mcp-servers/pii-proxy/tests/write-queue.test.ts
git commit -m "feat(pii-proxy): add write queue with TTL expiry"
```

---

### Task 6: Slack Block Kit notifier

**Files:**
- Create: `mcp-servers/pii-proxy/src/slack-notify.ts`

- [ ] **Step 1: Write src/slack-notify.ts**

```typescript
import { WebClient } from '@slack/web-api';

export interface ApprovalMessageOptions {
  requestId: string;
  endpoint: string;
  method: string;
  params: unknown;
  reason: string;
  expiresInMinutes: number;
  channelId: string;
}

export interface ApprovalResult {
  ts: string;
  channelId: string;
}

export class SlackNotifier {
  private client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  async sendApprovalRequest(opts: ApprovalMessageOptions): Promise<ApprovalResult> {
    const paramsPreview = JSON.stringify(opts.params, null, 2).slice(0, 500);

    const result = await this.client.chat.postMessage({
      channel: opts.channelId,
      text: `Write approval requested: ${opts.method} ${opts.endpoint}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Write Approval Requested' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Operation:*\n\`${opts.method} ${opts.endpoint}\`` },
            { type: 'mrkdwn', text: `*Expires:*\n${opts.expiresInMinutes} minutes` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Reason:*\n${opts.reason}` },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Params (PII masked):*\n\`\`\`${paramsPreview}\`\`\``,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve' },
              style: 'primary',
              action_id: `pii_proxy_approve_${opts.requestId}`,
              value: opts.requestId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Deny' },
              style: 'danger',
              action_id: `pii_proxy_deny_${opts.requestId}`,
              value: opts.requestId,
            },
          ],
        },
      ],
    });

    if (!result.ok || !result.ts) {
      throw new Error(`Slack postMessage failed: ${result.error}`);
    }

    return { ts: result.ts, channelId: opts.channelId };
  }

  async postThreadReply(channelId: string, threadTs: string, text: string): Promise<void> {
    await this.client.chat.postMessage({ channel: channelId, thread_ts: threadTs, text });
  }

  async updateApprovalMessage(
    channelId: string,
    ts: string,
    status: 'approved' | 'denied' | 'expired',
    detail?: string,
  ): Promise<void> {
    const label = status === 'approved' ? 'Approved' : status === 'denied' ? 'Denied' : 'Expired';
    await this.client.chat.update({
      channel: channelId,
      ts,
      text: `${label}${detail ? `: ${detail}` : ''}`,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `*${label}*${detail ? `\n${detail}` : ''}` },
      }],
    });
  }
}
```

- [ ] **Step 2: Build to verify no TS errors**

```bash
cd mcp-servers/pii-proxy && pnpm build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add mcp-servers/pii-proxy/src/slack-notify.ts
git commit -m "feat(pii-proxy): add Slack Block Kit approval notifier"
```

---

## Chunk 4: Tool Generator & MCP Server

### Task 7: Tool generator

**Files:**
- Create: `mcp-servers/pii-proxy/src/tool-generator.ts`
- Create: `mcp-servers/pii-proxy/tests/tool-generator.test.ts`

- [ ] **Step 1: Copy OpenAPI spec**

```bash
cp data/ipc/slack/client-api-doc.json/client-api-doc.json mcp-servers/pii-proxy/docs/client-api.json
```

- [ ] **Step 2: Write failing tests**

```typescript
// tests/tool-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateReadTools, isReadOperation } from '../src/tool-generator.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(path.join(__dirname, '../docs/client-api.json'), 'utf-8'));

describe('isReadOperation', () => {
  it('treats GET as read', () => {
    expect(isReadOperation('get', 'get_fxbo_cabinet_api_get_account')).toBe(true);
  });

  it('treats POST with history in operationId as read', () => {
    expect(isReadOperation('post', 'post_fxbo_cabinet_api_accounts_trading_history')).toBe(true);
  });

  it('treats POST deposit as write', () => {
    expect(isReadOperation('post', 'post_fxbo_cabinet_api_deposit')).toBe(false);
  });

  it('treats DELETE as write', () => {
    expect(isReadOperation('delete', 'delete_fxbo_cabinet_api_delete')).toBe(false);
  });
});

describe('generateReadTools', () => {
  it('generates tools from spec', () => {
    const tools = generateReadTools(spec);
    expect(tools.length).toBeGreaterThan(30);
    expect(tools.length).toBeLessThan(100);
  });

  it('each tool has name, description, inputSchema, endpoint, method', () => {
    const tools = generateReadTools(spec);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^client_api_/);
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool._endpoint).toBeTruthy();
      expect(tool._method).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/tool-generator.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write src/tool-generator.ts**

```typescript
const READ_POST_PATTERNS = [
  /list/, /history/, /search/, /breakdown/, /tree/, /referral/,
  /commission/, /transaction/, /cashback/, /report/, /accounts$/,
  /applications$/, /transfers$/, /messages$/, /tokens$/, /fees$/,
];

const WRITE_PATTERNS = [
  /create/, /new$/, /upload/, /deposit/, /withdraw/, /transfer(?!s$)/,
  /change/, /update/, /delete/, /remove/, /send/, /restore/, /reset/,
  /enable/, /disable/, /accept/, /redeem/, /connect/, /register/,
  /verify/, /confirm/, /check.*pin/, /forgot/,
];

export function isReadOperation(method: string, operationId: string): boolean {
  if (method === 'get') return true;
  if (method === 'delete' || method === 'put' || method === 'patch') return false;
  const id = operationId.toLowerCase();
  if (WRITE_PATTERNS.some(p => p.test(id))) return false;
  if (READ_POST_PATTERNS.some(p => p.test(id))) return true;
  return false;
}

export interface GeneratedTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  _endpoint: string;
  _method: string;
}

function operationIdToToolName(operationId: string): string {
  return 'client_api_' + operationId.replace(/^(get|post|put|patch|delete)_fxbo_cabinet_api_/, '');
}

function buildInputSchema(
  operation: Record<string, unknown>,
  pathParams: string[],
): GeneratedTool['inputSchema'] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of pathParams) {
    properties[param] = { type: 'string', description: `Path parameter: ${param}` };
  }

  const params = (operation.parameters as Array<Record<string, unknown>> | undefined) ?? [];
  for (const param of params) {
    if (param.$ref) continue;
    const name = param.name as string;
    if (!name) continue;
    const schema = (param.schema as Record<string, unknown>) ?? { type: 'string' };
    properties[name] = { ...schema, description: param.description ?? name };
    if (param.required) required.push(name);
  }

  const reqBody = operation.requestBody as Record<string, unknown> | undefined;
  if (reqBody) {
    const bodySchema = (
      (reqBody.content as Record<string, unknown> | undefined)?.['application/json'] as
      Record<string, unknown> | undefined
    )?.schema as Record<string, unknown> | undefined;
    if (bodySchema) {
      properties['body'] = { ...bodySchema, description: 'Request body' };
      if (reqBody.required) required.push('body');
    }
  }

  return { type: 'object', properties, required: required.length ? required : undefined };
}

export function generateReadTools(spec: Record<string, unknown>): GeneratedTool[] {
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  const tools: GeneratedTool[] = [];

  for (const [pathPattern, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const op = operation as Record<string, unknown>;
      const operationId = op.operationId as string | undefined;
      if (!operationId || !isReadOperation(method, operationId)) continue;

      const pathParams = [...pathPattern.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      const tags = (op.tags as string[]) ?? [];
      const summary = (op.summary as string) ?? '';
      const description = [`[${tags.join(', ')}]`, summary || `${method.toUpperCase()} ${pathPattern}`]
        .filter(Boolean).join(' — ');

      tools.push({
        name: operationIdToToolName(operationId),
        description,
        inputSchema: buildInputSchema(op, pathParams),
        _endpoint: pathPattern,
        _method: method.toUpperCase(),
      });
    }
  }

  return tools;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd mcp-servers/pii-proxy && pnpm test -- tests/tool-generator.test.ts
```

Expected: PASS. Note the actual tool count.

- [ ] **Step 6: Commit**

```bash
git add mcp-servers/pii-proxy/src/tool-generator.ts mcp-servers/pii-proxy/tests/tool-generator.test.ts mcp-servers/pii-proxy/docs/client-api.json
git commit -m "feat(pii-proxy): add OpenAPI-driven read tool generator"
```

---

### Task 8: MCP server + approval HTTP server

**Files:**
- Create: `mcp-servers/pii-proxy/src/server.ts`

- [ ] **Step 1: Write src/server.ts**

Using the low-level `Server` class (not `McpServer`) so each read tool gets its exact JSON Schema `inputSchema` from the OpenAPI spec, giving Claude accurate per-tool parameter documentation.

```typescript
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { openDb } from './db.js';
import { PiiEngine } from './pii-engine.js';
import { WriteQueue } from './write-queue.js';
import { SlackNotifier } from './slack-notify.js';
import { ApiClient } from './api-client.js';
import { generateReadTools } from './tool-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const config = {
  apiBaseUrl: requireEnv('API_BASE_URL'),
  apiToken: requireEnv('API_TOKEN'),
  piiHmacSecret: requireEnv('PII_HMAC_SECRET'),
  slackBotToken: requireEnv('SLACK_BOT_TOKEN'),
  slackChannelId: requireEnv('SLACK_APPROVAL_CHANNEL_ID'),
  mcpPort: parseInt(process.env.MCP_SSE_PORT ?? '3098'),
  approvalPort: parseInt(process.env.APPROVAL_HTTP_PORT ?? '3099'),
  maskFinancials: process.env.MASK_FINANCIALS === 'true',
};

const db = openDb();
const piiEngine = new PiiEngine({ db, hmacSecret: config.piiHmacSecret, maskFinancials: config.maskFinancials });
const writeQueue = new WriteQueue(db);
const slackNotifier = new SlackNotifier(config.slackBotToken);
const apiClient = new ApiClient({ baseUrl: config.apiBaseUrl, token: config.apiToken });

const spec = JSON.parse(readFileSync(path.join(__dirname, '..', 'docs', 'client-api.json'), 'utf-8'));
const readTools = generateReadTools(spec);

// Build a lookup map: tool name → tool metadata
const toolMap = new Map(readTools.map(t => [t.name, t]));

// Low-level MCP Server — accepts raw JSON Schema inputSchema per tool
const server = new Server(
  { name: 'pii-proxy', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// Tool list handler — each read tool exposes its real OpenAPI-derived schema
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...readTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    {
      name: 'request_write',
      description: 'Request a write/mutation on the FXBO API. Always requires Slack approval before executing. Returns immediately with pending_approval status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          endpoint: { type: 'string', description: 'API endpoint path, e.g. /client-api/transfers' },
          method: { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
          params: { type: 'object', description: 'Request body or path/query parameters' },
          reason: { type: 'string', description: 'Required: why this write is needed (shown in approval message)' },
        },
        required: ['endpoint', 'method', 'params', 'reason'],
      },
    },
  ],
}));

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  // Handle request_write
  if (name === 'request_write') {
    const { endpoint, method, params, reason } = a as {
      endpoint: string; method: string; params: Record<string, unknown>; reason: string;
    };
    const maskedParams = piiEngine.maskObject(params);
    const requestId = writeQueue.enqueue(endpoint, method, maskedParams, reason);
    try {
      const result = await slackNotifier.sendApprovalRequest({
        requestId, endpoint, method, params: maskedParams, reason,
        expiresInMinutes: 10, channelId: config.slackChannelId,
      });
      writeQueue.setSlackMeta(requestId, result.ts, result.channelId);
    } catch (err) {
      console.error('Failed to send Slack approval:', err);
    }
    return { content: [{ type: 'text', text: JSON.stringify({
      status: 'pending_approval', request_id: requestId,
      message: 'Approval requested. Check Slack to approve or deny.',
    }) }] };
  }

  // Handle read tools
  const tool = toolMap.get(name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }

  let resolvedEndpoint = tool._endpoint;
  const queryParams = { ...(a ?? {}) };
  for (const match of tool._endpoint.matchAll(/\{(\w+)\}/g)) {
    const key = match[1];
    if (queryParams[key]) {
      resolvedEndpoint = resolvedEndpoint.replace(`{${key}}`, String(queryParams[key]));
      delete queryParams[key];
    }
  }

  const response = await apiClient.request(
    tool._method, resolvedEndpoint,
    tool._method === 'GET' ? queryParams : (queryParams.body ?? queryParams),
  );
  if (!response.ok) {
    return { content: [{ type: 'text', text: `API error ${response.status}: ${JSON.stringify(response.data)}` }], isError: true };
  }
  const masked = piiEngine.maskObject(response.data);
  return { content: [{ type: 'text', text: JSON.stringify(masked, null, 2) }] };
});

// MCP SSE server
const transports = new Map<string, SSEServerTransport>();

const mcpHttpServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/sse') {
    const transport = new SSEServerTransport('/message', res);
    transports.set(transport.sessionId, transport);
    res.on('close', () => transports.delete(transport.sessionId));
    await server.connect(transport);
  } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
    const sessionId = new URL(req.url, 'http://localhost').searchParams.get('sessionId');
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) { res.writeHead(404); res.end(); return; }
    await transport.handlePostMessage(req, res);
  } else {
    res.writeHead(404); res.end();
  }
});

mcpHttpServer.listen(config.mcpPort, '127.0.0.1', () =>
  console.log(`pii-proxy MCP server: http://127.0.0.1:${config.mcpPort}/sse`)
);

// Approval HTTP server
const approvalServer = http.createServer(async (req, res) => {
  const match = req.url?.match(/^\/(approve|deny)\/([^/]+)$/);
  if (!match || req.method !== 'POST') { res.writeHead(404); res.end('Not found'); return; }

  const [, action, requestId] = match;
  const wr = writeQueue.get(requestId);

  if (!wr) { res.writeHead(404); res.end(JSON.stringify({ error: 'Unknown request_id' })); return; }
  if (wr.status !== 'pending') { res.writeHead(409); res.end(JSON.stringify({ error: `Already ${wr.status}` })); return; }

  if (action === 'deny') {
    writeQueue.deny(requestId);
    if (wr.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.updateApprovalMessage(wr.slackChannelId, wr.slackMessageTs, 'denied');
    }
    res.writeHead(200); res.end(JSON.stringify({ status: 'denied' }));
    return;
  }

  writeQueue.approve(requestId);
  try {
    const response = await apiClient.request(wr.method, wr.endpoint, wr.params);
    writeQueue.markExecuted(requestId);
    const masked = piiEngine.maskObject(response.data);
    const resultText = response.ok
      ? `Executed: ${wr.method} ${wr.endpoint}\n\`\`\`${JSON.stringify(masked, null, 2).slice(0, 800)}\`\`\``
      : `API error ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`;
    if (wr.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.updateApprovalMessage(wr.slackChannelId, wr.slackMessageTs, 'approved');
      await slackNotifier.postThreadReply(wr.slackChannelId, wr.slackMessageTs, resultText);
    }
    res.writeHead(200); res.end(JSON.stringify({ status: 'executed', response: masked }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (wr.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.postThreadReply(wr.slackChannelId, wr.slackMessageTs, `Execution failed: ${msg}`);
    }
    res.writeHead(500); res.end(JSON.stringify({ error: msg }));
  }
});

approvalServer.listen(config.approvalPort, '127.0.0.1', () =>
  console.log(`pii-proxy approval server: http://127.0.0.1:${config.approvalPort}`)
);

// TTL cleanup every 5 minutes
setInterval(async () => {
  const expired = writeQueue.expireStale();
  for (const id of expired) {
    const wr = writeQueue.get(id);
    if (wr?.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.updateApprovalMessage(wr.slackChannelId, wr.slackMessageTs, 'expired');
    }
  }
}, 5 * 60 * 1000);

console.log(`pii-proxy started. ${readTools.length} read tools registered.`);
```

- [ ] **Step 2: Build to verify no TS errors**

```bash
cd mcp-servers/pii-proxy && pnpm build
```

Expected: `dist/server.js` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add mcp-servers/pii-proxy/src/server.ts
git commit -m "feat(pii-proxy): add MCP SSE server and HTTP approval handler"
```

---

## Chunk 5: NanoClaw Integration

### Task 9: container-runner.ts — inject MCP config

**Files:**
- Modify: `src/container-runner.ts`

- [ ] **Step 1: Read the settings.json creation block in container-runner.ts**

Read `src/container-runner.ts` around line 123 to see the current settings.json block before editing.

- [ ] **Step 2: Replace the settings.json block with a merge-aware version**

Find the block starting with `const settingsFile = path.join(groupSessionsDir, 'settings.json');` and ending at the closing `}` of the `if (!fs.existsSync(settingsFile))` block.

Replace with this pattern (preserving all existing env vars and plugins):

```typescript
  const settingsFile = path.join(groupSessionsDir, 'settings.json');

  const piiProxyHost = process.env.PII_PROXY_HOST ?? 'host.containers.internal';
  const piiProxyMcpPort = process.env.PII_PROXY_MCP_PORT ?? '3098';

  const mcpServers = {
    'pii-proxy': {
      type: 'sse',
      url: `http://${piiProxyHost}:${piiProxyMcpPort}/sse`,
    },
  };

  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          env: {
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
            CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
          },
          enabledPlugins: {
            'Notion@claude-plugins-official': true,
          },
          mcpServers,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    // Merge mcpServers into existing settings (safe for re-runs)
    const existing = JSON.parse(fs.readFileSync(settingsFile, 'utf-8')) as Record<string, unknown>;
    existing.mcpServers = {
      ...(existing.mcpServers as Record<string, unknown> ?? {}),
      ...mcpServers,
    };
    fs.writeFileSync(settingsFile, JSON.stringify(existing, null, 2) + '\n');
  }
```

- [ ] **Step 3: Build NanoClaw**

```bash
pnpm build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/container-runner.ts
git commit -m "feat(nanoclaw): inject pii-proxy MCP server into agent settings"
```

---

### Task 10: slack.ts — add block_actions handler

**Files:**
- Modify: `src/channels/slack.ts`

- [ ] **Step 1: Read setupEventHandlers in slack.ts**

Read `src/channels/slack.ts` — find the `setupEventHandlers()` method (starts around line 96).

- [ ] **Step 2: Add the block_actions handler**

Inside `setupEventHandlers()`, after the existing `this.app.event('message', ...)` handler, add:

```typescript
    // PII proxy write approval buttons
    // Note: PII_PROXY_APPROVAL_PORT in NanoClaw's .env must match
    //       APPROVAL_HTTP_PORT in mcp-servers/pii-proxy/.env (both default to 3099)
    this.app.action(
      /^pii_proxy_(approve|deny)_(.+)$/,
      async ({ action, ack, respond }) => {
        await ack();

        const actionId = (action as { action_id: string }).action_id;
        const match = actionId.match(/^pii_proxy_(approve|deny)_(.+)$/);
        if (!match) return;

        const [, decision, requestId] = match;

        // Ephemeral feedback so the user knows the button press was received
        await respond({
          response_type: 'ephemeral',
          text: decision === 'approve' ? 'Processing approval...' : 'Denying request...',
        });

        const approvalPort = process.env.PII_PROXY_APPROVAL_PORT ?? '3099';
        const url = `http://127.0.0.1:${approvalPort}/${decision}/${requestId}`;

        try {
          const res = await fetch(url, { method: 'POST' });
          if (!res.ok) {
            logger.error({ requestId, decision }, `pii-proxy approval callback failed: ${await res.text()}`);
          }
        } catch (err) {
          logger.error({ requestId, decision, err }, 'pii-proxy approval HTTP request failed');
        }
      }
    );
```

- [ ] **Step 3: Enable Interactivity in Slack app settings**

In the Slack app at api.slack.com → **Interactivity & Shortcuts**: ensure it is enabled. Socket Mode handles delivery, so the Request URL field can be left as-is.

- [ ] **Step 4: Build NanoClaw**

```bash
pnpm build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/channels/slack.ts
git commit -m "feat(nanoclaw): add Slack block_actions handler for pii-proxy approvals"
```

---

## Chunk 6: Documentation & Nano Skill

### Task 11: API summary generator and Nano skill

**Files:**
- Create: `scripts/generate-api-summary.ts`
- Create: `container/skills/client-api/SKILL.md`

- [ ] **Step 1: Write scripts/generate-api-summary.ts**

```typescript
#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.join(__dirname, '../mcp-servers/pii-proxy/docs/client-api.json');
const spec = JSON.parse(readFileSync(specPath, 'utf-8'));

type OpEntry = { method: string; path: string; operationId: string };
const paths = spec.paths as Record<string, Record<string, { tags?: string[]; operationId?: string }>>;
const byTag = new Map<string, OpEntry[]>();

for (const [pathPattern, methods] of Object.entries(paths)) {
  for (const [method, op] of Object.entries(methods)) {
    for (const tag of op.tags ?? ['Untagged']) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push({ method: method.toUpperCase(), path: pathPattern, operationId: op.operationId ?? '' });
    }
  }
}

const total = Object.values(paths).reduce((s, m) => s + Object.keys(m).length, 0);
let md = `# FXBO Client API — Endpoint Summary\n\n> Auto-generated. Regenerate: \`npx tsx scripts/generate-api-summary.ts\`\n\n**Total:** ${total} endpoints\n\n---\n\n`;

for (const [tag, ops] of [...byTag.entries()].sort()) {
  md += `## ${tag}\n\n| Method | Path | Operation ID |\n|--------|------|-------------|\n`;
  for (const op of ops) md += `| \`${op.method}\` | \`${op.path}\` | \`${op.operationId}\` |\n`;
  md += '\n';
}

mkdirSync(path.join(__dirname, '../docs/api'), { recursive: true });
const out = path.join(__dirname, '../docs/api/client-api-summary.md');
writeFileSync(out, md);
console.log(`Written: ${out}`);
```

- [ ] **Step 2: Run the generator**

```bash
npx tsx scripts/generate-api-summary.ts
```

Expected: `docs/api/client-api-summary.md` created.

- [ ] **Step 3: Write container/skills/client-api/SKILL.md**

```markdown
# Client API Skill

You have access to the FXBO Client API via the `pii-proxy` MCP server.

## All PII is masked

Every response you receive has PII automatically replaced:
- Names are replaced with pseudonyms (e.g. "Coral Falcon")
- Emails become `masked-xxxxxxxx@masked.example`
- Phones become `+00-xxxxxxxx`
- Passwords and tokens are `[REDACTED]`

Treat masked values as opaque identifiers. Do not attempt to deduce real values.

## Read Tools (prefix: client_api_)

All read tools are available. Examples:
- `client_api_accounts_types` — list account types
- `client_api_account_get` — get account by loginSid
- `client_api_accounts_list` — list accounts with filters
- `client_api_accounts_trading_history` — trading history
- `client_api_documents` — KYC documents
- `client_api_transactions_list` — transactions

Pass params as documented. Responses come back pre-masked.

## Writes / Mutations — always use request_write

For ANY create/update/delete operation, use:

    request_write({
      endpoint: "/client-api/transfers",
      method: "POST",
      params: { ... },
      reason: "User requested transfer of X to Y"
    })

`reason` is required and shown to the user in Slack.
You get back `{ status: "pending_approval", request_id: "wq_..." }`.

Tell the user: "I've submitted this for your approval in Slack."

Do NOT retry request_write for the same operation — it is already queued.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-api-summary.ts docs/api/client-api-summary.md container/skills/client-api/SKILL.md
git commit -m "feat(pii-proxy): add API summary generator and Nano client-api skill"
```

---

## Chunk 7: End-to-End Smoke Test

### Task 12: Manual smoke test

- [ ] **Step 1: Create .env and fill real values**

```bash
cp mcp-servers/pii-proxy/.env.example mcp-servers/pii-proxy/.env
# Fill: API_BASE_URL, API_TOKEN, PII_HMAC_SECRET (openssl rand -hex 32),
#       SLACK_BOT_TOKEN, SLACK_APPROVAL_CHANNEL_ID
```

- [ ] **Step 2: Start pii-proxy**

```bash
cd mcp-servers/pii-proxy && source .env && pnpm dev
```

Expected:
```
pii-proxy MCP server: http://127.0.0.1:3098/sse
pii-proxy approval server: http://127.0.0.1:3099
pii-proxy started. XX read tools registered.
```

- [ ] **Step 3: Test approval endpoint responds**

```bash
curl -s -X POST http://127.0.0.1:3099/approve/wq_test
```

Expected: `{"error":"Unknown request_id"}` — proves the approval server is live.

- [ ] **Step 4: Run full test suite**

```bash
cd mcp-servers/pii-proxy && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Integration test with NanoClaw**

Start NanoClaw (`pnpm run dev`), message Nano in Slack to read an account. Verify:
- Response comes back with masked names/emails
- Asking Nano to do a write sends an approval card to Slack with Approve/Deny buttons
- Clicking Approve executes the operation and posts the (masked) result in the thread
- Clicking Deny posts a denial notice

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(pii-proxy): complete PII-masking MCP with Slack write approval"
```

---

## Environment Variables Summary

### `mcp-servers/pii-proxy/.env`
| Variable | Required | Notes |
|----------|----------|-------|
| `API_BASE_URL` | Yes | Base URL of FXBO API |
| `API_TOKEN` | Yes | Bearer token |
| `PII_HMAC_SECRET` | Yes | `openssl rand -hex 32` |
| `SLACK_BOT_TOKEN` | Yes | Reuse NanoClaw's `xoxb-` token |
| `SLACK_APPROVAL_CHANNEL_ID` | Yes | Channel where approvals are posted |
| `MCP_SSE_PORT` | No | Default `3098` |
| `APPROVAL_HTTP_PORT` | No | Default `3099` |
| `MASK_FINANCIALS` | No | Default `false` |

### NanoClaw host `.env` additions
| Variable | Required | Notes |
|----------|----------|-------|
| `PII_PROXY_HOST` | No | Default `host.containers.internal`. Use `host.docker.internal` for Docker |
| `PII_PROXY_MCP_PORT` | No | Default `3098`. Must match `MCP_SSE_PORT` in pii-proxy `.env` |
| `PII_PROXY_APPROVAL_PORT` | No | Default `3099`. Must match `APPROVAL_HTTP_PORT` in pii-proxy `.env` |
