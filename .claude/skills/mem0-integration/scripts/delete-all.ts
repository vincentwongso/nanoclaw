#!/usr/bin/env node
/**
 * Delete all memories for a user
 */

import { readFileSync } from 'fs';
import { Mem0Client } from '../lib/client.js';
import { loadMem0Config } from '../lib/config.js';

async function main() {
  try {
    const input = readFileSync(0, 'utf-8');
    const args = JSON.parse(input);

    if (!args.confirm) {
      throw new Error('Must confirm deletion by setting confirm: true');
    }

    const groupFolder = process.env.DATA_DIR || '/workspace/group';
    const config = loadMem0Config(groupFolder);
    const client = new Mem0Client(config);

    await client.deleteAll(args.user_id);

    console.log(JSON.stringify({
      success: true,
      data: { deleted: true, user_id: args.user_id || config.userId }
    }));
  } catch (error: any) {
    console.log(JSON.stringify({
      success: false,
      message: error.message
    }));
    process.exit(1);
  }
}

main();
