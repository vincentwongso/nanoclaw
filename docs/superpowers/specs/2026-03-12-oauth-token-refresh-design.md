# OAuth Token Auto-Refresh

## Problem

The `CLAUDE_CODE_OAUTH_TOKEN` in `.env` expires periodically, causing 401 errors that break all agent invocations. Currently requires manual intervention: copy fresh token from `~/.claude/.credentials.json` into `.env` and restart.

## Decision

Read tokens directly from `~/.claude/.credentials.json` (single source of truth) and auto-refresh via Anthropic's OAuth endpoint when near expiry. Eliminates the manual `.env` copy step entirely.

## Design

### New module: `src/oauth.ts`

Two exported functions:

**`getAccessToken(): Promise<string>`**
- Reads `~/.claude/.credentials.json`, parses the `claudeAiOauth` object
- Caches the parsed token in memory; only re-reads from disk when cached token is near expiry
- If `expiresAt` is more than 10 minutes (600,000 ms) away, returns current `accessToken`
- If within 10 minutes of expiry (or already expired), calls `refreshAccessToken()`
- Note: `expiresAt` is a Unix timestamp in **milliseconds** (e.g., `1773334077775`). Compare with `Date.now()`.
- Returns a valid access token
- If `~/.claude/.credentials.json` does not exist or has no `claudeAiOauth`, returns `undefined` — caller falls back to `ANTHROPIC_API_KEY` from `.env`

**`refreshAccessToken(): Promise<string>`**
- POST to `https://console.anthropic.com/v1/oauth/token` with:
  - `grant_type: "refresh_token"`
  - `refresh_token`: from credentials file
  - `client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e"` (Claude Code's public OAuth client ID)
- On success: writes new `accessToken`, `refreshToken`, `expiresAt` back to `~/.claude/.credentials.json` using write-to-temp-then-rename for atomicity. **Must preserve all other fields** in the file (`mcpOAuth`, `scopes`, `subscriptionType`, `rateLimitTier`, etc.) — read-modify-write the full JSON object.
- On 404 (single-use refresh token already consumed by another process): re-reads credentials.json and checks `expiresAt`. If the re-read token is valid, return it. If the re-read token is also expired, throw the unrecoverable error.
- On other errors: throws with clear message ("OAuth refresh failed — manual /login may be needed")

**Credentials file TypeScript interface:**
```typescript
interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;       // Unix timestamp in milliseconds
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
  mcpOAuth?: Record<string, unknown>;
  // Preserve any other top-level keys
  [key: string]: unknown;
}
```

### Changes to existing files

**`src/container-runner.ts`** — modify `readSecrets()`
- `readSecrets()` becomes `async` (returns `Promise<Secrets>`)
- Call `getAccessToken()` from the new oauth module for the OAuth token
- If `getAccessToken()` returns `undefined` (no credentials file), fall back to `CLAUDE_CODE_OAUTH_TOKEN` from `.env` (supports `ANTHROPIC_API_KEY` users)
- Call site at ~line 443 (`input.secrets = readSecrets()`) must be awaited — `runContainerAgent()` is already async, so this is safe
- The secret is still passed to the container under the key `CLAUDE_CODE_OAUTH_TOKEN` — the key name does not change, only the source
- All other secrets (Slack, Telegram, Notion, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`) still come from `.env`

**`src/env.ts`**
- Remove `CLAUDE_CODE_OAUTH_TOKEN` from env var parsing

**`.env`**
- Remove the `CLAUDE_CODE_OAUTH_TOKEN=` line

**`container/agent-runner/src/index.ts`** — no changes needed. It receives the token via stdin under the same `CLAUDE_CODE_OAUTH_TOKEN` key, and continues to use it in `SECRET_ENV_VARS` and for the Notion MCP server header.

**Documentation updates (follow-up):**
- `docs/SECURITY.md` — update credential source description
- `docs/SPEC.md` — update token extraction instructions
- `setup/verify.ts` — check credentials.json instead of `.env` for OAuth token
- `.claude/skills/setup/SKILL.md`, `.claude/skills/debug/SKILL.md` — remove instructions to add `CLAUDE_CODE_OAUTH_TOKEN` to `.env`

### Error handling

- Log on startup: `"OAuth token expires at <datetime>"` for observability
- Log info on successful refresh: `"OAuth token refreshed, expires at <datetime>"`
- Log info on 404 recovery: `"OAuth refresh token already used, re-reading credentials from disk"`
- Throw on unrecoverable failure — bubbles up to message handler, user sees: "Agent authentication failed — manual /login may be needed"
- No retry loops or backoff — fail fast, next message retries naturally

### Race condition mitigation

OAuth refresh tokens are single-use. If Claude Code CLI refreshes the token at the same moment as NanoClaw:
1. One process succeeds and writes new tokens to credentials.json
2. The other gets a 404 from the token endpoint
3. On 404, re-read credentials.json from disk — the winner already wrote fresh tokens
4. Check `expiresAt` on the re-read token. If valid, use it. If also expired, throw unrecoverable error (avoids infinite retry between two processes).

### Testing

Unit tests for `src/oauth.ts` with mocked HTTP and filesystem:
- Token still valid — returns cached token, no HTTP call, no file read
- Token near expiry — calls refresh endpoint, writes back to file (preserving other fields)
- 404 on refresh → re-reads file → token valid — returns updated token
- 404 on refresh → re-reads file → token also expired — throws
- No credentials file — returns undefined
- Unrecoverable HTTP error — throws

### Constants

| Name | Value |
|------|-------|
| Token endpoint | `https://console.anthropic.com/v1/oauth/token` |
| Client ID | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` |
| Refresh buffer | 10 minutes (600,000 ms) before expiry |
| Credentials path | `~/.claude/.credentials.json` |
| `expiresAt` format | Unix timestamp in milliseconds |
