#!/usr/bin/env node
/**
 * Search memories in mem0
 */

import { readFileSync } from 'fs';
import { Mem0Client } from '../lib/client.js';
import { loadMem0Config } from '../lib/config.js';

async function main() {
  try {
    const input = readFileSync(0, 'utf-8');
    const args = JSON.parse(input);

    const groupFolder = process.env.DATA_DIR || '/workspace/group';
    const config = loadMem0Config(groupFolder);
    const client = new Mem0Client(config);

    const results = await client.search({
      query: args.query,
      user_id: args.user_id,
      limit: args.limit,
      metadata: args.metadata
    });

    console.log(JSON.stringify({
      success: true,
      data: results
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
