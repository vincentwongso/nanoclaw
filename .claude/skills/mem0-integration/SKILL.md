---
name: mem0-integration
description: Self-hosted mem0 memory layer for NanoClaw. Add, search, retrieve, update, and delete memories. Use for giving the assistant long-term memory across conversations. Triggers on "remember", "memory", "mem0", "recall".
---

# Mem0 Integration

Long-term memory system for NanoClaw using self-hosted mem0.

> **Compatibility:** NanoClaw v1.0.0. Uses IPC pattern similar to X integration.

## Features

| Action | Tool | Description |
|--------|------|-------------|
| Add | `mem0_add` | Store new memories from conversations |
| Search | `mem0_search` | Semantic search for relevant memories |
| Get All | `mem0_get_all` | Retrieve all memories for a user |
| Update | `mem0_update` | Modify existing memories |
| Delete | `mem0_delete` | Remove specific memories |
| Delete All | `mem0_delete_all` | Clear all memories for a user |

## What is Mem0?

Mem0 is a memory layer that enables AI assistants to remember information across conversations. Instead of forgetting everything between sessions, the assistant can:

- Remember user preferences (favorite foods, work schedule, etc.)
- Recall past conversations and context
- Build up knowledge about users over time
- Provide personalized responses based on history

## Prerequisites

Before using this skill, ensure:

1. **Mem0 is running** - Self-hosted instance accessible
2. **Dependencies installed**:
   ```bash
   # Check if tsx is available
   npx tsx --version || npm install -g tsx
   ```

## Quick Start

```bash
# 1. Setup mem0 (install Docker if needed)
export OPENAI_API_KEY=your_api_key
curl -sL https://raw.githubusercontent.com/mem0ai/mem0/main/openmemory/run.sh | bash

# Verify mem0 is running:
curl http://localhost:8765/docs  # Should return API docs

# 2. Configure NanoClaw integration
npx tsx /workspace/group/mem0-integration/scripts/setup.ts
# Enter:
# - API URL: http://localhost:8765 (or your mem0 URL)
# - User ID: your_username (e.g., "JC")
# - API Key: (leave blank for self-hosted)

# 3. Copy skill to project
cp -r /workspace/group/mem0-integration /path/to/nanoclaw/.claude/skills/

# 4. Rebuild container
cd /path/to/nanoclaw
./container/build.sh

# 5. Rebuild host and restart
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Configuration

### Environment Variables

None required for basic setup. The configuration is stored in `mem0-config.json`.

### Configuration File

Located at `/workspace/group/mem0-config.json`:

```json
{
  "apiUrl": "http://localhost:8765",
  "userId": "your_username",
  "apiKey": "optional_api_key"
}
```

Fields:
- **apiUrl**: URL of your mem0 instance
- **userId**: Default user identifier for memories
- **apiKey**: Optional authentication token (not needed for basic self-hosted setup)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Container (Linux VM)                                       │
│  └── agent.ts → MCP tool definitions (mem0_add, etc.)     │
│      └── Writes IPC request to /workspace/ipc/tasks/       │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (file system)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Host (macOS/Linux)                                         │
│  └── src/ipc.ts → processTaskIpc()                         │
│      └── host.ts → handleMem0Ipc()                         │
│          └── spawn subprocess → scripts/*.ts               │
│              └── HTTP → Mem0 API → OpenMemory             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design?

- **Self-hosted privacy** - All memory data stays on your infrastructure
- **No cloud dependencies** - Works completely offline with local LLMs
- **Flexible storage** - Uses PostgreSQL with pgvector for semantic search
- **Standard API** - HTTP REST API compatible with any client

### File Structure

```
.claude/skills/mem0-integration/
├── SKILL.md              # This documentation
├── host.ts               # Host-side IPC handler
├── agent.ts              # Container-side MCP tool definitions
├── lib/
│   ├── config.ts         # Configuration management
│   └── client.ts         # Mem0 HTTP client
└── scripts/
    ├── setup.ts          # Interactive configuration
    ├── add.ts            # Add memories
    ├── search.ts         # Search memories
    ├── get-all.ts        # Get all memories
    ├── update.ts         # Update memory
    ├── delete.ts         # Delete memory
    └── delete-all.ts     # Delete all memories
```

### Integration Points

To integrate this skill into NanoClaw, make the following modifications:

---

**1. Host side: `src/ipc.ts`**

Add import after other local imports:
```typescript
import { handleMem0Ipc } from '../.claude/skills/mem0-integration/host.js';
```

Modify `processTaskIpc` function's switch statement default case:
```typescript
// Find:
default:
const handled = await handleXIpc(data, sourceGroup, isMain, DATA_DIR);
if (!handled) {
    logger.warn({ type: data.type }, 'Unknown IPC task type');
}

// Replace with:
default:
let handled = await handleXIpc(data, sourceGroup, isMain, DATA_DIR);
if (!handled) {
    handled = await handleMem0Ipc(data, sourceGroup, isMain, DATA_DIR);
}
if (!handled) {
    logger.warn({ type: data.type }, 'Unknown IPC task type');
}
```

---

**2. Container side: `container/agent-runner/src/ipc-mcp.ts`**

Add import after X integration import:
```typescript
// @ts-ignore - Copied during Docker build from .claude/skills/mem0-integration/
import { createMem0Tools } from './skills/mem0-integration/agent.js';
```

Add to the end of tools array (before the closing `]`):
```typescript
    ...createMem0Tools({ groupFolder, isMain })
```

---

**3. Dockerfile: `container/Dockerfile`**

Add COPY line after X integration copy:
```dockerfile
# Copy mem0 skill MCP tools
COPY .claude/skills/mem0-integration/agent.ts ./src/skills/mem0-integration/
COPY .claude/skills/mem0-integration/lib/ ./src/skills/mem0-integration/lib/
```

---

## Setup

All paths below are relative to project root (`NANOCLAW_ROOT`).

### 1. Install Mem0 (Self-Hosted)

```bash
# Quick install (requires Docker and OpenAI API key)
export OPENAI_API_KEY=your_key_here
curl -sL https://raw.githubusercontent.com/mem0ai/mem0/main/openmemory/run.sh | bash

# Verify it's running
curl http://localhost:8765/docs
```

**Alternative: Manual Installation**

```bash
git clone https://github.com/mem0ai/mem0.git
cd mem0/openmemory

# Create .env files in /api and /ui directories
echo "OPENAI_API_KEY=your_key" > api/.env
echo "USER=your_username" >> api/.env

# Build and run
make build
make up

# Access at:
# API: http://localhost:8765
# UI: http://localhost:3000
```

### 2. Configure NanoClaw

```bash
npx tsx .claude/skills/mem0-integration/scripts/setup.ts
```

This will prompt for:
- API URL (default: http://localhost:8765)
- User ID (your username)
- API Key (optional, leave blank for self-hosted)

**Verify configuration:**
```bash
cat /workspace/group/mem0-config.json
```

### 3. Rebuild Container

```bash
./container/build.sh
```

**Verify success:**
```bash
docker run nanoclaw-agent ls -la /app/src/skills/mem0-integration/
```

### 4. Restart Service

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

**Verify success:**
```bash
launchctl list | grep nanoclaw  # macOS
# Linux: systemctl --user status nanoclaw
```

## Usage via WhatsApp

Replace `@Nano` with your configured trigger name:

```
@Nano remember that I like spicy food

@Nano what do you remember about my food preferences?

@Nano store this memory: I work from home on Mondays

@Nano recall what you know about my work schedule
```

**Note:** Only the main group can use mem0 tools. Other groups will receive an error.

## Memory Patterns

### Auto-Capture (Recommended)

The assistant automatically extracts and stores important information:

```
User: I'm allergic to peanuts
Assistant: *stores memory* Got it, I'll remember your peanut allergy.

User: What can I eat?
Assistant: *searches memories* Let me suggest options that avoid peanuts...
```

### Explicit Storage

User explicitly asks to remember something:

```
User: @Nano remember my birthday is March 15
Assistant: *uses mem0_add* Stored! I'll remember your birthday is March 15.
```

### Retrieval Before Response

Assistant searches memories before answering:

```
User: What should I make for dinner?
Assistant: *searches with query "food preferences"*
          *finds: likes spicy food, allergic to peanuts*
          How about spicy Thai curry with chicken? No peanuts.
```

## Testing

### Test Memory Operations Directly

```bash
# Test add
echo '{"messages":[{"role":"user","content":"I love pizza"}]}' | \
  npx tsx .claude/skills/mem0-integration/scripts/add.ts

# Test search
echo '{"query":"food preferences","limit":5}' | \
  npx tsx .claude/skills/mem0-integration/scripts/search.ts

# Test get all
echo '{"limit":10}' | \
  npx tsx .claude/skills/mem0-integration/scripts/get-all.ts
```

### Check Mem0 Status

```bash
# Check if mem0 is running
curl http://localhost:8765/docs

# View memories in UI
open http://localhost:3000
```

## Troubleshooting

### Mem0 Not Running

```bash
# Check Docker containers
docker ps | grep mem0

# Restart mem0
cd mem0/openmemory
make down
make up
```

### Configuration Missing

```bash
# Verify config exists
cat /workspace/group/mem0-config.json

# Re-run setup if missing
npx tsx .claude/skills/mem0-integration/scripts/setup.ts
```

### Connection Errors

```bash
# Test mem0 API directly
curl -X POST http://localhost:8765/v1/memories/ \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}],"user_id":"test"}'

# Check if port is accessible
netstat -an | grep 8765
```

### Script Timeout

Default timeout is 30 seconds. Increase in `host.ts`:

```typescript
const timer = setTimeout(() => {
  proc.kill('SIGTERM');
  reject(new Error('Script timed out (30s)'));
}, 30000);  // ← Increase this value
```

### Check Logs

```bash
# Host logs (relative to project root)
grep -i "mem0\|memory" logs/nanoclaw.log | tail -20

# Script errors
grep -i "error\|failed" logs/nanoclaw.log | tail -20
```

## Advanced Configuration

### Using Different LLM Providers

Mem0 supports multiple LLM providers. Edit `mem0/openmemory/api/.env`:

```bash
# Use Anthropic Claude
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key

# Use Ollama (fully local)
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Use OpenAI (default)
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
```

### Custom Vector Store

By default uses PostgreSQL with pgvector. Can configure Qdrant:

```bash
# Install Qdrant
docker run -p 6333:6333 qdrant/qdrant

# Update mem0 config to use Qdrant
# Edit mem0/openmemory/api/config.py
```

### Multi-User Support

Each user gets their own memory space:

```json
{
  "apiUrl": "http://localhost:8765",
  "userId": "jc"  // Different per user
}
```

## Security

- `mem0-config.json` - Contains API credentials (add to `.gitignore`)
- Only main group can use mem0 tools (enforced in `agent.ts` and `host.ts`)
- Self-hosted = your data never leaves your infrastructure
- Optional API key authentication for production deployments

## Resources

- [Mem0 Documentation](https://docs.mem0.ai/)
- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [OpenMemory Quickstart](https://docs.mem0.ai/openmemory/quickstart)
- [Self-Host Guide](https://mem0.ai/blog/self-host-mem0-docker)

**Sources:**
- [Quickstart - Mem0](https://docs.mem0.ai/openmemory/quickstart)
- [How to Self-Host Mem0 on Docker](https://mem0.ai/blog/self-host-mem0-docker)
- [GitHub - mem0ai/mem0](https://github.com/mem0ai/mem0)
