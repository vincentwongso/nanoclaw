#!/usr/bin/env node
/**
 * Add memories to mem0
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Mem0Client } from '../lib/client.js';
import { loadMem0Config } from '../lib/config.js';

async function main() {
  try {
    // Read args from stdin
    const input = readFileSync(0, 'utf-8');
    const args = JSON.parse(input);

    const groupFolder = process.env.DATA_DIR || '/workspace/group';
    const config = loadMem0Config(groupFolder);
    const client = new Mem0Client(config);

    const result = await client.add({
      messages: args.messages,
      user_id: args.user_id,
      metadata: args.metadata,
      infer: args.infer
    });

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
