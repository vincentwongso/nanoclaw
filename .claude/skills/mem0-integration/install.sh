#!/bin/bash

# Mem0 Integration Installation Script for NanoClaw

set -e

echo "=== Mem0 Integration Installer ==="
echo ""

# Check if we're in the right directory
if [ ! -f "container/Dockerfile" ]; then
    echo "Error: Please run this script from your NanoClaw project root"
    exit 1
fi

# Check if mem0-integration exists
if [ ! -d ".claude/skills/mem0-integration" ]; then
    echo "Error: mem0-integration skill not found in .claude/skills/"
    echo "Please copy the skill to .claude/skills/ first"
    exit 1
fi

echo "✓ Found NanoClaw project"
echo "✓ Found mem0-integration skill"
echo ""

# Check if mem0 is running
if ! curl -s http://localhost:8765/docs > /dev/null 2>&1; then
    echo "⚠ Warning: Mem0 doesn't appear to be running at http://localhost:8765"
    echo ""
    echo "Would you like to install mem0 now? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        if [ -z "$OPENAI_API_KEY" ]; then
            echo "Please enter your OpenAI API key:"
            read -r OPENAI_API_KEY
            export OPENAI_API_KEY
        fi

        echo "Installing mem0..."
        curl -sL https://raw.githubusercontent.com/mem0ai/mem0/main/openmemory/run.sh | bash

        echo "Waiting for mem0 to start..."
        sleep 5
    fi
fi

# Run configuration
echo ""
echo "Configuring mem0 integration..."
npx tsx .claude/skills/mem0-integration/scripts/setup.ts

echo ""
echo "✓ Configuration complete"
echo ""

# Ask if user wants to auto-patch files
echo "Would you like to automatically patch NanoClaw files? (y/n)"
echo "(This will modify src/ipc.ts, container/agent-runner/src/ipc-mcp.ts, and container/Dockerfile)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "Patching files..."

    # Backup files first
    cp src/ipc.ts src/ipc.ts.backup
    cp container/agent-runner/src/ipc-mcp.ts container/agent-runner/src/ipc-mcp.ts.backup
    cp container/Dockerfile container/Dockerfile.backup

    echo "✓ Created backups (.backup files)"

    # Patch src/ipc.ts
    if ! grep -q "handleMem0Ipc" src/ipc.ts; then
        # Add import
        sed -i.tmp "/import.*handleXIpc/a\\
import { handleMem0Ipc } from '../.claude/skills/mem0-integration/host.js';
" src/ipc.ts

        # Add handler
        sed -i.tmp "s/const handled = await handleXIpc/let handled = await handleXIpc/g" src/ipc.ts
        sed -i.tmp "/let handled = await handleXIpc/a\\
if (!handled) {\\
    handled = await handleMem0Ipc(data, sourceGroup, isMain, DATA_DIR);\\
}
" src/ipc.ts

        rm src/ipc.ts.tmp
        echo "✓ Patched src/ipc.ts"
    else
        echo "✓ src/ipc.ts already patched"
    fi

    # Patch container/agent-runner/src/ipc-mcp.ts
    if ! grep -q "createMem0Tools" container/agent-runner/src/ipc-mcp.ts; then
        # Add import
        sed -i.tmp "/import.*createXTools/a\\
// @ts-ignore\\
import { createMem0Tools } from './skills/mem0-integration/agent.js';
" container/agent-runner/src/ipc-mcp.ts

        # Add tools
        sed -i.tmp "/...createXTools/a\\
    ...createMem0Tools({ groupFolder, isMain })
" container/agent-runner/src/ipc-mcp.ts

        rm container/agent-runner/src/ipc-mcp.ts.tmp
        echo "✓ Patched container/agent-runner/src/ipc-mcp.ts"
    else
        echo "✓ container/agent-runner/src/ipc-mcp.ts already patched"
    fi

    # Patch Dockerfile
    if ! grep -q "mem0-integration" container/Dockerfile; then
        sed -i.tmp "/COPY.*x-integration/a\\
COPY .claude/skills/mem0-integration/agent.ts ./src/skills/mem0-integration/\\
COPY .claude/skills/mem0-integration/lib/ ./src/skills/mem0-integration/lib/
" container/Dockerfile

        rm container/Dockerfile.tmp
        echo "✓ Patched container/Dockerfile"
    else
        echo "✓ container/Dockerfile already patched"
    fi

    echo ""
    echo "✓ All files patched successfully"
else
    echo ""
    echo "Skipping automatic patching. You'll need to manually integrate:"
    echo "1. Add handleMem0Ipc to src/ipc.ts"
    echo "2. Add createMem0Tools to container/agent-runner/src/ipc-mcp.ts"
    echo "3. Add COPY commands to container/Dockerfile"
    echo ""
    echo "See SKILL.md for detailed instructions."
fi

echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Rebuild container:"
echo "   ./container/build.sh"
echo ""
echo "2. Rebuild host:"
echo "   npm run build"
echo ""
echo "3. Restart service:"
echo "   macOS: launchctl kickstart -k gui/\$(id -u)/com.nanoclaw"
echo "   Linux: systemctl --user restart nanoclaw"
echo ""
echo "Then try: @Nano remember that I like spicy food"
echo ""
