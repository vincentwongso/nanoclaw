#!/usr/bin/env node
/**
 * Update a memory in mem0
 */

import { readFileSync } from 'fs';
import { Mem0Client } from '../lib/client.js';
import { loadMem0Config } from '../lib/config.js';

async function main() {
  try {
    const input = readFileSync(0, 'utf-8');
    const args = JSON.parse(input);

    if (!args.memory_id) {
      throw new Error('memory_id is required');
    }

    const groupFolder = process.env.DATA_DIR || '/workspace/group';
    const config = loadMem0Config(groupFolder);
    const client = new Mem0Client(config);

    const result = await client.update(args.memory_id, args.data);

    console.log(JSON.stringify({
      success: true,
      data: result
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
