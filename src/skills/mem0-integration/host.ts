/**
 * Mem0 Integration - Host-side IPC Handler
 *
 * Calls the mem0 API directly (no subprocess) for efficiency.
 */

import { writeFile } from 'fs/promises';
import path from 'path';

import { Mem0Client } from './lib/client.js';
import { loadMem0Config } from './lib/config.js';

interface IpcData {
  type: string;
  taskId: string;
  args: any;
  groupFolder: string;
  timestamp: string;
  [key: string]: unknown;
}

export async function handleMem0Ipc(
  data: IpcData,
  sourceGroup: string,
  isMain: boolean,
  dataDir: string,
): Promise<boolean> {
  if (!data.type.startsWith('mem0_')) {
    return false;
  }

  if (!isMain) {
    await writeIpcResponse(data.taskId, {
      success: false,
      message: 'mem0 operations are only available in the main group',
    }, dataDir, sourceGroup);
    return true;
  }

  try {
    // Derive groups dir from dataDir (both under project root)
    const groupsDir = path.join(dataDir, '..', 'groups');
    const config = loadMem0Config(path.join(groupsDir, sourceGroup));
    const client = new Mem0Client(config);
    const result = await executeMem0Op(client, data.type, data.args);
    await writeIpcResponse(data.taskId, { success: true, data: result }, dataDir, sourceGroup);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'mem0 operation failed';
    await writeIpcResponse(data.taskId, { success: false, message }, dataDir, sourceGroup);
  }

  return true;
}

async function executeMem0Op(client: Mem0Client, type: string, args: any): Promise<any> {
  switch (type) {
    case 'mem0_add':
      return client.add(args);
    case 'mem0_search':
      return client.search(args);
    case 'mem0_get_all':
      return client.getAll(args);
    case 'mem0_update':
      return client.update(args.memory_id, args.data);
    case 'mem0_delete':
      return client.delete(args.memory_id);
    case 'mem0_delete_all':
      if (!args.confirm) throw new Error('Must pass confirm: true to delete all memories');
      return client.deleteAll(args.user_id);
    default:
      throw new Error(`Unknown mem0 operation: ${type}`);
  }
}

async function writeIpcResponse(
  taskId: string,
  response: unknown,
  dataDir: string,
  sourceGroup: string,
): Promise<void> {
  const responsePath = path.join(dataDir, 'ipc', sourceGroup, 'tasks', `${taskId}.response.json`);
  await writeFile(responsePath, JSON.stringify(response, null, 2));
}
