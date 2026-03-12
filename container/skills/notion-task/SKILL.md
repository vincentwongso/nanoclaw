---
name: notion-task
description: Manage tasks on the NanoClaw Notion task board — list, get, create, and update tasks including status and agent status fields.
allowed-tools: Bash(notion-task:*)
---

# Notion Task Management

Use `notion-task` to interact with the NanoClaw task board (database ID: 320cf700-da30-80b0-89bc-000b8f9e2e0e).

## Commands

```bash
notion-task list                                          # List all tasks
notion-task get <page-id>                                 # Fetch task details + content
notion-task update <page-id> --status "In progress"      # Update task status
notion-task update <page-id> --agent-status "Working on phase 2"  # Update agent status
notion-task update <page-id> --blocked true               # Mark as blocked
notion-task update <page-id> --blocked false              # Unblock
notion-task create --name "Task name" --status "Not started"  # Create new task
```

## Status values

- `Not started`
- `In progress`
- `Done`

## Page IDs

IDs can be:
- Full UUID: `320cf700-da30-80b0-89bc-000b8f9e2e0e`
- Compact: `320cf700da3080b1a763d2fdfb50085a`
- Notion URL: `https://www.notion.so/320cf700da3081ababf2c7a1a42a5d79` (script extracts ID automatically)

## Example workflow

```bash
# Check what tasks are pending
notion-task list

# Get details on a specific task
notion-task get 320cf700-da30-81ab-abf2-c7a1a42a5d79

# Update task when starting work
notion-task update 320cf700-da30-81ab-abf2-c7a1a42a5d79 --status "In progress" --agent-status "Investigating the issue"

# Mark done when complete
notion-task update 320cf700-da30-81ab-abf2-c7a1a42a5d79 --status "Done" --agent-status "Completed successfully"

# Mark blocked when waiting on input
notion-task update 320cf700-da30-81ab-abf2-c7a1a42a5d79 --blocked true --agent-status "Waiting for OpenAPI spec from Vincent"
```
