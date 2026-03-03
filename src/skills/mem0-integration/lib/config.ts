import { readFileSync } from 'fs';
import { join } from 'path';

export interface Mem0Config {
  apiUrl: string;
  userId: string;
  apiKey?: string; // Optional for self-hosted without auth
}

/**
 * Load mem0 configuration from the group's config file
 */
export function loadMem0Config(groupFolder: string): Mem0Config {
  const configPath = join(groupFolder, 'mem0-config.json');

  try {
    const configData = readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(
      `Mem0 not configured. Please run setup script first. Missing: ${configPath}`,
    );
  }
}

/**
 * Default configuration values
 */
export const defaultConfig = {
  apiUrl: 'http://localhost:8765',
  timeouts: {
    search: 10000, // 10 seconds
    add: 15000, // 15 seconds
    update: 10000, // 10 seconds
    delete: 5000, // 5 seconds
  },
};
