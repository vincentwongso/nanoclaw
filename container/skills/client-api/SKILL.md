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
