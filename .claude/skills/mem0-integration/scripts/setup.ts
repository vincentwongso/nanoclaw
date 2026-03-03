#!/usr/bin/env node
/**
 * Setup mem0 configuration
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n=== Mem0 Self-Hosted Setup ===\n');

  const apiUrl = await question(
    'Mem0 API URL (default: http://localhost:8765): '
  ) || 'http://localhost:8765';

  const userId = await question(
    'Default User ID (e.g., your username): '
  );

  if (!userId) {
    console.error('Error: User ID is required');
    process.exit(1);
  }

  const apiKey = await question(
    'API Key (leave blank for self-hosted without auth): '
  );

  const config = {
    apiUrl: apiUrl.trim(),
    userId: userId.trim(),
    ...(apiKey && { apiKey: apiKey.trim() })
  };

  const dataDir = process.env.DATA_DIR || '/workspace/group';
  const configPath = join(dataDir, 'mem0-config.json');

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`\n✓ Configuration saved to ${configPath}`);
  console.log('\nNext steps:');
  console.log('1. Rebuild container: ./container/build.sh');
  console.log('2. Rebuild host: npm run build');
  console.log('3. Restart service: launchctl kickstart -k gui/$(id -u)/com.nanoclaw');
  console.log('\n');

  rl.close();
}

main().catch((error) => {
  console.error('Setup failed:', error.message);
  process.exit(1);
});
