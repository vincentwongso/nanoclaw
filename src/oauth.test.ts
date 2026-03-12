import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock fs before importing module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      existsSync: vi.fn(() => true),
    },
  };
});

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const CREDENTIALS_PATH = path.join(
  process.env.HOME || '/root',
  '.claude',
  '.credentials.json',
);

function makeCredentials(
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }> = {},
) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: overrides.accessToken ?? 'sk-ant-oat01-valid-token',
      refreshToken: overrides.refreshToken ?? 'sk-ant-ort01-refresh-token',
      expiresAt: overrides.expiresAt ?? Date.now() + 3_600_000, // 1 hour from now
      scopes: ['user:inference'],
      subscriptionType: 'max',
      rateLimitTier: 'default',
    },
    mcpOAuth: {},
  });
}

describe('oauth', () => {
  let oauth: typeof import('./oauth.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Fresh import to reset module-level cache
    oauth = await import('./oauth.js');
  });

  describe('getAccessToken', () => {
    it('returns current token when not near expiry', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(makeCredentials());

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-valid-token');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses in-memory cache on second call (no file read)', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(makeCredentials());

      await oauth.getAccessToken();
      vi.mocked(fs.readFileSync).mockClear();

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-valid-token');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('returns undefined when credentials file does not exist', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const token = await oauth.getAccessToken();
      expect(token).toBeUndefined();
    });

    it('returns undefined when claudeAiOauth is missing', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ mcpOAuth: {} }),
      );

      const token = await oauth.getAccessToken();
      expect(token).toBeUndefined();
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes token when near expiry and writes back to file', async () => {
      const nearExpiry = makeCredentials({ expiresAt: Date.now() + 60_000 }); // 1 min
      vi.mocked(fs.readFileSync).mockReturnValue(nearExpiry);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'sk-ant-oat01-new-token',
          refresh_token: 'sk-ant-ort01-new-refresh',
          expires_in: 7200,
        }),
      });

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-new-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://console.anthropic.com/v1/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"grant_type":"refresh_token"'),
        }),
      );
      // Should write back to file (via temp + rename)
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();

      // Verify written content preserves mcpOAuth and other fields
      const writtenJson = JSON.parse(
        vi.mocked(fs.writeFileSync).mock.calls[0][1] as string,
      );
      expect(writtenJson.mcpOAuth).toEqual({});
      expect(writtenJson.claudeAiOauth.accessToken).toBe(
        'sk-ant-oat01-new-token',
      );
      expect(writtenJson.claudeAiOauth.refreshToken).toBe(
        'sk-ant-ort01-new-refresh',
      );
      expect(writtenJson.claudeAiOauth.scopes).toEqual(['user:inference']);
    });

    it('handles 404 by re-reading credentials file', async () => {
      // First read: near-expiry token
      const nearExpiry = makeCredentials({ expiresAt: Date.now() + 60_000 });
      // Second read (after 404): fresh token from another process
      const freshCreds = makeCredentials({
        accessToken: 'sk-ant-oat01-from-cli',
        expiresAt: Date.now() + 3_600_000,
      });

      let readCount = 0;
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        readCount++;
        return readCount <= 1 ? nearExpiry : freshCreds;
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const token = await oauth.getAccessToken();
      expect(token).toBe('sk-ant-oat01-from-cli');
    });

    it('throws when 404 and re-read token is also expired', async () => {
      const nearExpiry = makeCredentials({ expiresAt: Date.now() - 1000 });
      vi.mocked(fs.readFileSync).mockReturnValue(nearExpiry);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(oauth.getAccessToken()).rejects.toThrow(
        /OAuth refresh failed/,
      );
    });

    it('throws on non-404 HTTP error', async () => {
      const nearExpiry = makeCredentials({ expiresAt: Date.now() + 60_000 });
      vi.mocked(fs.readFileSync).mockReturnValue(nearExpiry);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(oauth.getAccessToken()).rejects.toThrow(
        /OAuth refresh failed/,
      );
    });
  });
});
