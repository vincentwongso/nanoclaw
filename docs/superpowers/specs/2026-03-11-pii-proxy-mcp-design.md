# PII-Proxy MCP Server — Design Spec

**Date:** 2026-03-11
**Status:** Approved
**Notion task:** https://www.notion.so/320cf700da3081ababf2c7a1a42a5d79

---

## Overview

A PII-masking MCP server that gives Nano (Claude agent) full access to the FXBO Client API while ensuring no personally identifiable information ever reaches the agent's context. All API responses are masked on the fly before being returned as tool results. Write/mutate operations are always gated behind a Slack Block Kit approval flow — Nano cannot execute any write without explicit user approval.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Container (Nano / Claude Agent)                 │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  MCP client  (stdio)                     │   │
│  │  ~65 read tools  +  1 request_write tool │   │
│  └──────────────────┬───────────────────────┘   │
└─────────────────────┼───────────────────────────┘
                      │ stdio (MCP protocol)
┌─────────────────────▼───────────────────────────┐
│  Host: pii-proxy MCP server                      │
│                                                  │
│  ┌──────────────┐  ┌────────────┐  ┌──────────┐ │
│  │tool-generator│  │ pii-engine │  │api-client│ │
│  │ (reads spec) │  │(mask/hash) │  │(FXBO API)│ │
│  └──────────────┘  └────────────┘  └──────────┘ │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ write-queue  │  │ HTTP server (:3099)        │ │
│  │  (SQLite)    │  │ POST /approve/:id          │ │
│  └──────────────┘  │ POST /deny/:id             │ │
│                    └──────────┬─────────────────┘ │
└───────────────────────────────┼─────────────────┘
                                │ HTTP callback
┌───────────────────────────────▼─────────────────┐
│  Host: NanoClaw (src/channels/slack.ts)           │
│  Receives Slack interactive callbacks             │
│  → calls /approve or /deny on MCP server         │
└───────────────────────────────┬─────────────────┘
                                │ Slack Block Kit
                            ┌───▼───┐
                            │  You  │
                            └───────┘
```

---

## File Layout

```
mcp-servers/pii-proxy/
  src/
    server.ts           # MCP stdio + HTTP approval server (port 3099)
    tool-generator.ts   # Parses OpenAPI spec → generates ~65 read tools at startup
    api-client.ts       # HTTP client for FXBO API (auth, retries, error mapping)
    pii-engine.ts       # Mask/unmask, deterministic HMAC hashing, content scanner
    write-queue.ts      # SQLite-backed pending write queue with TTL cleanup
    slack-notify.ts     # Sends Slack Block Kit approval messages
  docs/
    client-api.json     # OpenAPI spec (source of truth, moved from data/ipc/)
  data/
    pii-proxy.db        # SQLite: PII hash map + write queue
  package.json
  tsconfig.json
  .env.example          # API_BASE_URL, API_TOKEN, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID,
                        # PII_HMAC_SECRET, APPROVAL_HTTP_PORT=3099

docs/api/
  client-api-summary.md   # Auto-generated from spec (humans & Claude Code reference)

container/skills/client-api/
  SKILL.md                # Nano's reference: available MCP tools + how to use request_write

scripts/
  generate-api-summary.ts # Generates docs/api/client-api-summary.md from spec
```

---

## Component Details

### 1. Tool Generator (`tool-generator.ts`)

Runs at MCP server startup. Reads `docs/client-api.json` and generates one MCP tool per read endpoint (~65 tools). "Read" = GET methods + POST methods used for listing/querying (identified by operationId containing `list`, `search`, `history`, `get`).

Tool naming: strip `fxbo_cabinet_api_` prefix from operationId, prefix with `client_api_`:
- `get_fxbo_cabinet_api_account_types` → `client_api_accounts_types`
- `post_fxbo_cabinet_api_accounts_trading_history` → `client_api_accounts_trading_history`

Each tool's description, input schema, and required params are taken directly from the OpenAPI spec — no manual writing needed.

### 2. API Client (`api-client.ts`)

- Authenticates with FXBO API using token from `.env` (POST /client-api/login or Bearer token)
- Handles token refresh if needed
- All responses pass through PII engine before being returned
- Error responses mapped to MCP error format

### 3. PII Engine (`pii-engine.ts`)

Two detection layers:

**Layer 1 — Schema-aware field masking** (primary)

| Field names | Masking strategy |
|-------------|-----------------|
| `firstName`, `lastName`, `middleName`, `fullName`, `name` (person context) | Deterministic adjective+noun: `"John Smith"` → `"Coral Falcon"` |
| `email` | `masked-{hash8}@masked.example` |
| `phone`, `mobilePhone` | `+00-{hash8}` |
| `address`, `city`, `state`, `zipCode` | `{hash8} Masked St`, `Masked City`, etc. |
| `birthDate` | Shifted by deterministic ±0–180 days (preserves age bracket) |
| `tin`, `lei`, `nationalId` | `MASKED-{hash8}` |
| `clientIp` | `0.0.0.0` |
| `password`, `investorPassword` | `[REDACTED]` (no hash, never reversible) |
| `token`, `refreshToken` | `[REDACTED]` |

**Layer 2 — Content scanning** (fallback for freetext like ticket comments, custom fields)

Regex patterns detect emails, phone numbers, and card-like numbers in unstructured text.

**Consistency mechanism:**
`mask = base64url(HMAC-SHA256(PII_HMAC_SECRET, real_value)).slice(0,8)`

Same input always produces the same mask, across sessions. Secret key in `.env` on host only.

**Not masked:** `country` (ISO code), `currency`, `language`, numeric IDs, `balance`/`equity`/`margin` (support needs financials; add config flag `MASK_FINANCIALS=true` to enable).

**Reversibility:**
SQLite table `pii_map(masked TEXT, real TEXT, field_type TEXT, created_at INTEGER)`. Admin CLI: `node dist/server.js unmask <masked_value>`.

### 4. Write Queue (`write-queue.ts`)

SQLite table `write_queue`:
```sql
CREATE TABLE write_queue (
  id        TEXT PRIMARY KEY,   -- wq_<nanoid>
  endpoint  TEXT NOT NULL,
  method    TEXT NOT NULL,
  params    TEXT NOT NULL,       -- JSON, PII already masked
  reason    TEXT NOT NULL,
  status    TEXT DEFAULT 'pending',  -- pending | approved | denied | expired | executed
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL    -- created_at + 600000ms (10 min)
);
```

Background job runs every 5 minutes to mark expired pending requests and post expiry notice to Slack thread.

### 5. Slack Notifier (`slack-notify.ts`)

Posts Block Kit message when a write is queued:

```
⚠️ Write approval requested

Operation:  POST /client-api/transfers
Reason:     "User asked to transfer $500 from account X to Y"
Params:     { from: "ACT-a1b2c3", to: "ACT-d4e5f6",
              amount: 500, currency: "USD" }
Expires:    10 minutes

[✅ Approve]    [❌ Deny]
```

Button `action_id` values: `pii_proxy_approve_{request_id}` / `pii_proxy_deny_{request_id}`.

### 6. HTTP Approval Server

Binds to `localhost:3099` only. Two endpoints:

- `POST /approve/:id` — executes the buffered API call, masks response, posts result to Slack thread
- `POST /deny/:id` — marks denied, posts denial to Slack thread

### 7. The `request_write` Tool

Single MCP tool available to Nano for all 96 write operations:

```typescript
request_write({
  endpoint: string,   // e.g. "/client-api/transfers"
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  params: object,     // body/path/query params
  reason: string      // required: why Nano is requesting this write
}) → {
  status: "pending_approval",
  request_id: string,
  message: string     // "Approval requested. Check Slack."
}
```

`reason` is required and shown prominently in the Slack approval message.

---

## NanoClaw Integration

### `src/container-runner.ts`

Add pii-proxy to the MCP server config passed to the agent container:

```json
{
  "mcpServers": {
    "pii-proxy": {
      "command": "node",
      "args": ["<abs-path>/mcp-servers/pii-proxy/dist/server.js"],
      "env": { "ENV_FILE": "<abs-path>/mcp-servers/pii-proxy/.env" }
    }
  }
}
```

### `src/channels/slack.ts`

Add `block_actions` handler for `pii_proxy_approve_*` and `pii_proxy_deny_*` action IDs. On receipt, call `localhost:3099/approve/:id` or `/deny/:id`. NanoClaw already uses Socket Mode so no new Slack app config is needed beyond ensuring the Interactivity feature is enabled in the Slack app settings.

---

## API Documentation Strategy

| Artifact | Location | Purpose |
|----------|----------|---------|
| Raw OpenAPI spec | `mcp-servers/pii-proxy/docs/client-api.json` | Source of truth; loaded by MCP server at startup |
| Generated summary | `docs/api/client-api-summary.md` | Human & Claude Code quick reference; regenerated via `scripts/generate-api-summary.ts` |
| Nano skill | `container/skills/client-api/SKILL.md` | Tells Nano what MCP tools are available and how to use `request_write` |

---

## Security Notes

- `PII_HMAC_SECRET` and `API_TOKEN` live in `.env` on host only — never mounted into container
- HTTP approval server binds to `localhost` only
- Passwords are `[REDACTED]` and never stored in `pii_map`
- `pii-proxy.db` lives outside the container mount path — Nano cannot access it

---

## Out of Scope

- Multi-user approval (single approver: Vincent)
- Approval delegation / time-based auto-approval
- Rate limiting on the FXBO API calls
- Caching of read responses
