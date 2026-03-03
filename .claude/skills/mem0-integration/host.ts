/**
 * Mem0 Integration - Host-side IPC Handler
 *
 * Handles mem0 operations on the host (outside container)
 */

import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface IpcData {
  type: string;
  taskId: string;
  args: any;
  groupFolder: string;
  timestamp: string;
}

export async function handleMem0Ipc(
  data: IpcData,
  sourceGroup: string,
  isMain: boolean,
  dataDir: string
): Promise<boolean> {
  // Check if this is a mem0 operation
  if (!data.type.startsWith('mem0_')) {
    return false;
  }

  // Only allow main group
  if (!isMain) {
    await writeIpcResponse(data.taskId, {
      success: false,
      message: 'mem0 operations are only available in the main group'
    });
    return true;
  }

  // Extract operation
  const operation = data.type.replace('mem0_', '');
  const scriptMap: Record<string, string> = {
    add: 'add.ts',
    search: 'search.ts',
    get_all: 'get-all.ts',
    update: 'update.ts',
    delete: 'delete.ts',
    delete_all: 'delete-all.ts'
  };

  const scriptName = scriptMap[operation];
  if (!scriptName) {
    await writeIpcResponse(data.taskId, {
      success: false,
      message: `Unknown mem0 operation: ${operation}`
    });
    return true;
  }

  const scriptPath = join(__dirname, 'scripts', scriptName);

  // Execute script
  try {
    const result = await executeScript(scriptPath, data.args, dataDir);
    await writeIpcResponse(data.taskId, result);
  } catch (error: any) {
    await writeIpcResponse(data.taskId, {
      success: false,
      message: error.message || 'Script execution failed'
    });
  }

  return true;
}

/**
 * Execute TypeScript script with arguments
 */
function executeScript(
  scriptPath: string,
  args: any,
  dataDir: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NANOCLAW_ROOT: process.cwd(),
        DATA_DIR: dataDir
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    // Send arguments via stdin
    proc.stdin?.write(JSON.stringify(args));
    proc.stdin?.end();

    // Timeout after 30 seconds
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Script timed out (30s)'));
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`Script failed: ${stderr || stdout}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse script output: ${stdout}`));
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Write IPC response file
 */
async function writeIpcResponse(taskId: string, response: any): Promise<void> {
  const ipcPath = '/workspace/ipc/tasks'; // Adjust based on your setup
  const responsePath = join(ipcPath, `${taskId}.response.json`);

  await writeFile(responsePath, JSON.stringify(response, null, 2));
}
