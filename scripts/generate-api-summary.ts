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
