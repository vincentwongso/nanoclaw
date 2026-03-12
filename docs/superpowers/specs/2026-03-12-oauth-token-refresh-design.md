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
- If `expiresAt` is more than 10 minutes away, returns current `accessToken`
- If within 10 minutes of expiry (or already expired), calls `refreshAccessToken()`
- Returns a valid access token

**`refreshAccessToken(): Promise<string>`**
- POST to `https://console.anthropic.com/v1/oauth/token` with:
  - `grant_type: "refresh_token"`
  - `refresh_token`: from credentials file
  - `client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e"`
- On success: writes new `accessToken`, `refreshToken`, `expiresAt` back to `~/.claude/.credentials.json` using write-to-temp-then-rename for atomicity
- On 404 (single-use refresh token already consumed by another process): re-reads credentials.json and returns the updated access token if still valid
- On other errors: throws with clear message ("OAuth refresh failed — manual /login may be needed")

### Changes to existing files

**`src/container-runner.ts`** — modify `readSecrets()`
- Replace `.env` read of `CLAUDE_CODE_OAUTH_TOKEN` with call to `getAccessToken()`
- All other secrets (Slack, Telegram, Notion) still come from `.env`

**`src/env.ts`**
- Remove `CLAUDE_CODE_OAUTH_TOKEN` from env var parsing

**`.env`**
- Remove the `CLAUDE_CODE_OAUTH_TOKEN=` line

**No changes to `container/agent-runner/src/index.ts`** — it receives the token via stdin identically.

### Error handling

- Log info on successful refresh: `"OAuth token refreshed, expires at <datetime>"`
- Log info on 404 recovery: `"OAuth refresh token already used, re-reading credentials from disk"`
- Throw on unrecoverable failure — bubbles up to message handler, user sees: "Agent authentication failed — manual /login may be needed"
- No retry loops or backoff — fail fast, next message retries naturally

### Race condition mitigation

OAuth refresh tokens are single-use. If Claude Code CLI refreshes the token at the same moment as NanoClaw:
1. One process succeeds and writes new tokens to credentials.json
2. The other gets a 404 from the token endpoint
3. On 404, re-read credentials.json from disk — the winner already wrote fresh tokens
4. Use the freshly written access token

### Testing

Unit tests for `src/oauth.ts` with mocked HTTP and filesystem:
- Token still valid — returns current token, no HTTP call
- Token near expiry — calls refresh endpoint, writes back to file
- 404 on refresh — re-reads file, returns updated token
- Unrecoverable error — throws

### Constants

| Name | Value |
|------|-------|
| Token endpoint | `https://console.anthropic.com/v1/oauth/token` |
| Client ID | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` |
| Refresh buffer | 10 minutes before expiry |
| Credentials path | `~/.claude/.credentials.json` |
