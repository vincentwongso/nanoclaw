import { describe, it, expect } from 'vitest';
import { generateReadTools, isReadOperation } from '../src/tool-generator.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(path.join(__dirname, '../docs/client-api.json'), 'utf-8'));

describe('isReadOperation', () => {
  it('treats GET as read', () => {
    expect(isReadOperation('get', 'get_fxbo_cabinet_api_get_account')).toBe(true);
  });

  it('treats POST with history in operationId as read', () => {
    expect(isReadOperation('post', 'post_fxbo_cabinet_api_accounts_trading_history')).toBe(true);
  });

  it('treats POST deposit as write', () => {
    expect(isReadOperation('post', 'post_fxbo_cabinet_api_deposit')).toBe(false);
  });

  it('treats DELETE as write', () => {
    expect(isReadOperation('delete', 'delete_fxbo_cabinet_api_delete')).toBe(false);
  });
});

describe('generateReadTools', () => {
  it('generates tools from spec', () => {
    const tools = generateReadTools(spec);
    expect(tools.length).toBeGreaterThan(30);
    expect(tools.length).toBeLessThan(100);
  });

  it('each tool has name, description, inputSchema, endpoint, method', () => {
    const tools = generateReadTools(spec);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^client_api_/);
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool._endpoint).toBeTruthy();
      expect(tool._method).toBeTruthy();
    }
  });
});
