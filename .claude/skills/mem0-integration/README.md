# Mem0 Integration for NanoClaw

Self-hosted memory layer that gives NanoClaw long-term memory across conversations.

## What This Does

Gives your AI assistant the ability to remember things:
- User preferences ("I like spicy food")
- Past conversations ("We talked about your project last week")
- Important facts ("My birthday is March 15")
- Work patterns ("I work from home on Mondays")

## Quick Install

### 1. Install Mem0 (Self-Hosted)

```bash
# One-line install (requires Docker + OpenAI API key)
export OPENAI_API_KEY=your_key_here
curl -sL https://raw.githubusercontent.com/mem0ai/mem0/main/openmemory/run.sh | bash

# Verify it's running
curl http://localhost:8765/docs
```

### 2. Install This Skill

```bash
# Copy skill to your NanoClaw project
cp -r /workspace/group/mem0-integration /path/to/nanoclaw/.claude/skills/

# Configure the skill
cd /path/to/nanoclaw
npx tsx .claude/skills/mem0-integration/scripts/setup.ts
# Enter: API URL (http://localhost:8765), your username, leave API key blank
```

### 3. Integrate into NanoClaw

Edit these files in your nanoclaw project:

**src/ipc.ts** - Add mem0 handler:
```typescript
import { handleMem0Ipc } from '../.claude/skills/mem0-integration/host.js';

// In processTaskIpc default case:
default:
let handled = await handleXIpc(data, sourceGroup, isMain, DATA_DIR);
if (!handled) {
    handled = await handleMem0Ipc(data, sourceGroup, isMain, DATA_DIR);
}
if (!handled) {
    logger.warn({ type: data.type }, 'Unknown IPC task type');
}
```

**container/agent-runner/src/ipc-mcp.ts** - Add tools:
```typescript
// @ts-ignore
import { createMem0Tools } from './skills/mem0-integration/agent.js';

// In tools array:
...createMem0Tools({ groupFolder, isMain })
```

**container/Dockerfile** - Copy skill files:
```dockerfile
# After X integration copy:
COPY .claude/skills/mem0-integration/agent.ts ./src/skills/mem0-integration/
COPY .claude/skills/mem0-integration/lib/ ./src/skills/mem0-integration/lib/
```

### 4. Rebuild and Restart

```bash
# Rebuild container
./container/build.sh

# Rebuild host
npm run build

# Restart service (macOS)
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Restart service (Linux)
systemctl --user restart nanoclaw
```

## Usage

Talk to your assistant naturally:

```
@Nano remember that I'm allergic to peanuts
@Nano what do you remember about me?
@Nano recall my food preferences
```

The assistant will automatically:
- Store important information from conversations
- Search memories before responding
- Build up knowledge about you over time

## Tools Available

| Tool | Purpose |
|------|---------|
| `mem0_add` | Store new memories |
| `mem0_search` | Find relevant memories |
| `mem0_get_all` | Retrieve all memories |
| `mem0_update` | Modify existing memories |
| `mem0_delete` | Remove specific memories |
| `mem0_delete_all` | Clear all memories |

## Configuration

Config stored at `/workspace/group/mem0-config.json`:

```json
{
  "apiUrl": "http://localhost:8765",
  "userId": "your_username"
}
```

## Testing

```bash
# Test adding a memory
echo '{"messages":[{"role":"user","content":"I love pizza"}]}' | \
  npx tsx .claude/skills/mem0-integration/scripts/add.ts

# Test searching
echo '{"query":"food preferences","limit":5}' | \
  npx tsx .claude/skills/mem0-integration/scripts/search.ts
```

## Troubleshooting

**Mem0 not running?**
```bash
docker ps | grep mem0
cd mem0/openmemory && make up
```

**Config missing?**
```bash
npx tsx .claude/skills/mem0-integration/scripts/setup.ts
```

**Check logs:**
```bash
grep -i "mem0" logs/nanoclaw.log | tail -20
```

## Architecture

This skill uses the same IPC pattern as the X integration:
1. Container calls `mem0_*` tool
2. Tool writes IPC request to `/workspace/ipc/tasks/`
3. Host picks up request and executes script
4. Script calls mem0 API via HTTP
5. Response written back via IPC
6. Container returns result

## Documentation

See `SKILL.md` for complete documentation including:
- Advanced configuration
- Using different LLM providers
- Custom vector stores
- Multi-user support
- Security considerations

## Resources

- [Mem0 Docs](https://docs.mem0.ai/)
- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Self-Host Guide](https://mem0.ai/blog/self-host-mem0-docker)
