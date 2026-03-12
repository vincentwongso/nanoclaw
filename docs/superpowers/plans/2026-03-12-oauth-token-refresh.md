# OAuth Token Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-refresh Claude OAuth tokens so NanoClaw never goes down due to expired credentials.

**Architecture:** New `src/oauth.ts` module reads `~/.claude/.credentials.json` directly, caches tokens in memory, and refreshes via Anthropic's OAuth endpoint when near expiry. `container-runner.ts` calls this instead of reading from `.env`. Atomic file writes prevent corruption.

**Tech Stack:** Node.js, TypeScript, native `fetch`, `fs`, vitest

**Spec:** `docs/superpowers/specs/2026-03-12-oauth-token-refresh-design.md`

---

## Chunk 1: Core OAuth Module

### Task 1: Write failing tests for `getAccessToken`

**Files:**
- Create: `src/oauth.test.ts`

- [ ] **Step 1: Create test file with mocks and first test case (token still valid)**

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock fs before importing module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      existsSync: vi.fn(() => true),
    },
  };
});

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const CREDENTIALS_PATH = path.join(process.env.HOME || '/root', '.claude', '.credentials.json');

function makeCredentials(overrides: Partial<{ accessToken: string; refreshToken: string; expiresAt: number }> = {}) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: overrides.accessToken ?? 'sk-ant-oat01-valid-token',
      refreshToken: overrides.refreshToken ?? 'sk-ant-ort01-refresh-token',
      expiresAt: overrides.expiresAt ?? Date.now() + 3_600_000, // 1 hour from now
      scopes: ['user:inference'],
      subscriptionType: 'max',
      rateLimitTier: 'default',
    },
    mcpOAuth: {},
  });
}

describe('oauth', () => {
  let oauth: typeof import('./oauth.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Fresh import to reset module-level cache
    oauth = await import('./oauth.js');
  });

  describe('getAccessToken', () => {
    it('returns current token when not near expiry', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(makeCredentials());

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-valid-token');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses in-memory cache on second call (no file read)', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(makeCredentials());

      await oauth.getAccessToken();
      vi.mocked(fs.readFileSync).mockClear();

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-valid-token');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('returns undefined when credentials file does not exist', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const token = await oauth.getAccessToken();
      expect(token).toBeUndefined();
    });

    it('returns undefined when claudeAiOauth is missing', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ mcpOAuth: {} }));

      const token = await oauth.getAccessToken();
      expect(token).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/oauth.test.ts`
Expected: FAIL — `src/oauth.ts` does not exist (4 tests fail)

- [ ] **Step 3: Create minimal `src/oauth.ts` to make tests pass**

```typescript
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const CREDENTIALS_PATH = path.join(
  process.env.HOME || '/root',
  '.claude',
  '.credentials.json',
);

const REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes

interface ClaudeOAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes?: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

interface ClaudeCredentials {
  claudeAiOauth?: ClaudeOAuth;
  [key: string]: unknown;
}

// Module-level cache
let cachedToken: string | undefined;
let cachedExpiresAt = 0;

function readCredentials(): ClaudeCredentials | undefined {
  try {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(content) as ClaudeCredentials;
  } catch {
    return undefined;
  }
}

export async function getAccessToken(): Promise<string | undefined> {
  // Check cache first
  if (cachedToken && Date.now() < cachedExpiresAt - REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const creds = readCredentials();
  if (!creds?.claudeAiOauth) {
    return undefined;
  }

  const oauth = creds.claudeAiOauth;
  cachedToken = oauth.accessToken;
  cachedExpiresAt = oauth.expiresAt;

  if (Date.now() >= oauth.expiresAt - REFRESH_BUFFER_MS) {
    return refreshAccessToken(creds);
  }

  return oauth.accessToken;
}

export async function refreshAccessToken(
  _creds: ClaudeCredentials,
): Promise<string> {
  // Placeholder — implemented in Task 2
  throw new Error('Not implemented');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/oauth.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/oauth.ts src/oauth.test.ts
git commit -m "feat(oauth): add getAccessToken with in-memory caching and tests"
```

---

### Task 2: Write failing tests for `refreshAccessToken`

**Files:**
- Modify: `src/oauth.test.ts`

- [ ] **Step 1: Add refresh tests to `src/oauth.test.ts`**

Add inside the `describe('oauth')` block, after the `getAccessToken` describe:

```typescript
  describe('refreshAccessToken', () => {
    it('refreshes token when near expiry and writes back to file', async () => {
      const nearExpiry = makeCredentials({ expiresAt: Date.now() + 60_000 }); // 1 min
      vi.mocked(fs.readFileSync).mockReturnValue(nearExpiry);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const newExpiresAt = Date.now() + 7_200_000;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'sk-ant-oat01-new-token',
          refresh_token: 'sk-ant-ort01-new-refresh',
          expires_in: 7200,
        }),
      });

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-new-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://console.anthropic.com/v1/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"grant_type":"refresh_token"'),
        }),
      );
      // Should write back to file (via temp + rename)
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();

      // Verify written content preserves mcpOAuth and other fields
      const writtenJson = JSON.parse(
        vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
      );
      expect(writtenJson.mcpOAuth).toEqual({});
      expect(writtenJson.claudeAiOauth.accessToken).toBe('sk-ant-oat01-new-token');
      expect(writtenJson.claudeAiOauth.refreshToken).toBe('sk-ant-ort01-new-refresh');
      expect(writtenJson.claudeAiOauth.scopes).toEqual(['user:inference']);
    });

    it('handles 404 by re-reading credentials file', async () => {
      // First read: near-expiry token
      const nearExpiry = makeCredentials({ expiresAt: Date.now() + 60_000 });
      // Second read (after 404): fresh token from another process
      const freshCreds = makeCredentials({
        accessToken: 'sk-ant-oat01-from-cli',
        expiresAt: Date.now() + 3_600_000,
      });

      let readCount = 0;
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        readCount++;
        return readCount <= 1 ? nearExpiry : freshCreds;
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-from-cli');
    });

    it('throws when 404 and re-read token is also expired', async () => {
      const nearExpiry = makeCredentials({ expiresAt: Date.now() - 1000 });
      vi.mocked(fs.readFileSync).mockReturnValue(nearExpiry);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(oauth.getAccessToken()).rejects.toThrow(
        /OAuth refresh failed/,
      );
    });

    it('throws on non-404 HTTP error', async () => {
      const nearExpiry = makeCredentials({ expiresAt: Date.now() + 60_000 });
      vi.mocked(fs.readFileSync).mockReturnValue(nearExpiry);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(oauth.getAccessToken()).rejects.toThrow(
        /OAuth refresh failed/,
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `pnpm vitest run src/oauth.test.ts`
Expected: The 4 new tests FAIL (refreshAccessToken throws "Not implemented")

- [ ] **Step 3: Implement `refreshAccessToken` in `src/oauth.ts`**

Replace the placeholder `refreshAccessToken` function:

```typescript
const TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

export async function refreshAccessToken(
  creds: ClaudeCredentials,
): Promise<string> {
  const oauth = creds.claudeAiOauth!;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!res.ok) {
    if (res.status === 404) {
      // Refresh token already used by another process — re-read from disk
      logger.info('OAuth refresh token already used, re-reading credentials from disk');
      const freshCreds = readCredentials();
      if (
        freshCreds?.claudeAiOauth &&
        Date.now() < freshCreds.claudeAiOauth.expiresAt - REFRESH_BUFFER_MS
      ) {
        cachedToken = freshCreds.claudeAiOauth.accessToken;
        cachedExpiresAt = freshCreds.claudeAiOauth.expiresAt;
        return freshCreds.claudeAiOauth.accessToken;
      }
      throw new Error(
        'OAuth refresh failed — refresh token consumed and re-read token is also expired. Manual /login may be needed.',
      );
    }
    throw new Error(
      `OAuth refresh failed (${res.status} ${res.statusText}) — manual /login may be needed`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Update credentials file atomically (preserve all other fields)
  const updatedCreds: ClaudeCredentials = {
    ...creds,
    claudeAiOauth: {
      ...oauth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    },
  };

  const tmpPath = CREDENTIALS_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(updatedCreds, null, 2));
  fs.renameSync(tmpPath, CREDENTIALS_PATH);

  cachedToken = data.access_token;
  cachedExpiresAt = updatedCreds.claudeAiOauth!.expiresAt;

  logger.info(
    `OAuth token refreshed, expires at ${new Date(cachedExpiresAt).toISOString()}`,
  );

  return data.access_token;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm vitest run src/oauth.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/oauth.ts src/oauth.test.ts
git commit -m "feat(oauth): implement token refresh with 404 recovery and atomic file writes"
```

---

## Chunk 2: Integration with Container Runner

### Task 3: Update `readSecrets()` to use OAuth module

**Files:**
- Modify: `src/container-runner.ts:342-351` (readSecrets function)
- Modify: `src/container-runner.ts:443` (call site)

- [ ] **Step 1: Make `readSecrets` async and integrate `getAccessToken`**

In `src/container-runner.ts`, add the import at the top (after existing imports):

```typescript
import { getAccessToken } from './oauth.js';
```

Replace the `readSecrets` function (lines 342-351):

```typescript
/**
 * Read allowed secrets from .env and credentials for passing to the container via stdin.
 * Secrets are never written to disk or mounted as files.
 * OAuth token is read directly from ~/.claude/.credentials.json (auto-refreshed).
 */
async function readSecrets(): Promise<Record<string, string>> {
  const envSecrets = readEnvFile([
    'CLAUDE_CODE_OAUTH_TOKEN', // fallback for users without credentials.json
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'NOTION_API_KEY',
    'NOTION_TASK_DB_ID',
  ]);

  // OAuth token from credentials file (auto-refreshes if near expiry).
  // Overrides .env value when credentials.json is available.
  const oauthToken = await getAccessToken();
  if (oauthToken) {
    envSecrets.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  }

  return envSecrets;
}
```

- [ ] **Step 2: Move `readSecrets()` before the Promise constructor**

The call at line 443 is inside a `new Promise()` executor, which is not async. Move the secrets read **before** the `return new Promise(...)` block, around line 430.

Before `return new Promise((resolve) => {` (around line 430), add:

```typescript
const secrets = await readSecrets();
```

Then at the original line 443 inside the Promise, change:

```typescript
input.secrets = readSecrets();
```

to:

```typescript
input.secrets = secrets;
```

- [ ] **Step 3: Run the build to verify TypeScript compiles**

Run: `pnpm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Run existing container-runner tests**

Run: `pnpm vitest run src/container-runner.test.ts`
Expected: Existing tests pass (readSecrets is mocked via fs mock, so the new async path doesn't affect them)

- [ ] **Step 5: Commit**

```bash
git add src/container-runner.ts
git commit -m "feat(oauth): integrate getAccessToken into container-runner readSecrets"
```

---

### Task 4: Add startup logging

**Files:**
- Modify: `src/oauth.ts`

- [ ] **Step 1: Add `logTokenStatus` export to `src/oauth.ts`**

Add at the end of `src/oauth.ts`:

```typescript
/**
 * Log the current OAuth token status. Call at startup for observability.
 */
export function logTokenStatus(): void {
  const creds = readCredentials();
  if (!creds?.claudeAiOauth) {
    logger.info('No OAuth credentials found — using ANTHROPIC_API_KEY from .env');
    return;
  }
  const expiresAt = new Date(creds.claudeAiOauth.expiresAt);
  const remaining = creds.claudeAiOauth.expiresAt - Date.now();
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  logger.info(
    `OAuth token expires at ${expiresAt.toISOString()} (${hours}h ${minutes}m remaining)`,
  );
}
```

- [ ] **Step 2: Call `logTokenStatus` at NanoClaw startup**

In `src/index.ts`, add import:

```typescript
import { logTokenStatus } from './oauth.js';
```

Call `logTokenStatus()` near the top of the startup sequence (after logger is initialized, before the message loop starts). Find the appropriate location — likely near other startup log lines.

- [ ] **Step 3: Run the build**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/oauth.ts src/index.ts
git commit -m "feat(oauth): add startup token status logging"
```

---

### Task 5: Remove `CLAUDE_CODE_OAUTH_TOKEN` from `.env`

**Files:**
- Modify: `.env`

- [ ] **Step 1: Remove the `CLAUDE_CODE_OAUTH_TOKEN` line from `.env`**

Open `.env` and remove the line starting with `CLAUDE_CODE_OAUTH_TOKEN=`. Keep all other entries.

- [ ] **Step 2: Verify NanoClaw builds and tests pass**

Run: `pnpm run build && pnpm vitest run`
Expected: Build succeeds, all tests pass

- [ ] **Step 3: Commit**

```bash
git add .env
git commit -m "chore: remove CLAUDE_CODE_OAUTH_TOKEN from .env (now read from credentials.json)"
```

---

### Task 6: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass

- [ ] **Step 2: Run a quick manual smoke test**

Run: `pnpm run dev` and send a test message to verify the agent still authenticates and responds. Check logs for the OAuth token expiry message at startup.

- [ ] **Step 3: Update Notion task status**

Mark the "Auto-refresh Claude OAuth token before expiry" task as Done on the Notion board with agent status summarizing the implementation.

---

## Follow-up (not blocking)

Documentation updates to remove references to adding `CLAUDE_CODE_OAUTH_TOKEN` to `.env`:
- `docs/SECURITY.md` — update credential source description
- `docs/SPEC.md` — update token extraction instructions
- `setup/verify.ts` — check credentials.json instead of `.env` for OAuth token
- `.claude/skills/setup/SKILL.md`, `.claude/skills/debug/SKILL.md` — remove `.env` OAuth instructions
