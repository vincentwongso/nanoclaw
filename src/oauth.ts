import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const CREDENTIALS_PATH = path.join(
  process.env.HOME || '/root',
  '.claude',
  '.credentials.json',
);

const REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

interface ClaudeOAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes?: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

interface ClaudeCredentials {
  claudeAiOauth?: ClaudeOAuth;
  [key: string]: unknown;
}

// Module-level cache
let cachedToken: string | undefined;
let cachedExpiresAt = 0;

function readCredentials(): ClaudeCredentials | undefined {
  try {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(content) as ClaudeCredentials;
  } catch {
    return undefined;
  }
}

export async function getAccessToken(): Promise<string | undefined> {
  // Check cache first
  if (cachedToken && Date.now() < cachedExpiresAt - REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const creds = readCredentials();
  if (!creds?.claudeAiOauth) {
    return undefined;
  }

  const oauth = creds.claudeAiOauth;
  cachedToken = oauth.accessToken;
  cachedExpiresAt = oauth.expiresAt;

  if (Date.now() >= oauth.expiresAt - REFRESH_BUFFER_MS) {
    return refreshAccessToken(creds);
  }

  return oauth.accessToken;
}

async function refreshAccessToken(
  creds: ClaudeCredentials,
): Promise<string> {
  const oauth = creds.claudeAiOauth!;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!res.ok) {
    if (res.status === 404) {
      // Refresh token already used by another process — re-read from disk
      logger.info(
        'OAuth refresh token already used, re-reading credentials from disk',
      );
      const freshCreds = readCredentials();
      if (
        freshCreds?.claudeAiOauth &&
        Date.now() < freshCreds.claudeAiOauth.expiresAt - REFRESH_BUFFER_MS
      ) {
        cachedToken = freshCreds.claudeAiOauth.accessToken;
        cachedExpiresAt = freshCreds.claudeAiOauth.expiresAt;
        return freshCreds.claudeAiOauth.accessToken;
      }
      throw new Error(
        'OAuth refresh failed — refresh token consumed and re-read token is also expired. Manual /login may be needed.',
      );
    }
    throw new Error(
      `OAuth refresh failed (${res.status} ${res.statusText}) — manual /login may be needed`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Update credentials file atomically (preserve all other fields)
  const updatedCreds: ClaudeCredentials = {
    ...creds,
    claudeAiOauth: {
      ...oauth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    },
  };

  const tmpPath = CREDENTIALS_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(updatedCreds, null, 2));
  fs.renameSync(tmpPath, CREDENTIALS_PATH);

  cachedToken = data.access_token;
  cachedExpiresAt = updatedCreds.claudeAiOauth!.expiresAt;

  logger.info(
    `OAuth token refreshed, expires at ${new Date(cachedExpiresAt).toISOString()}`,
  );

  return data.access_token;
}

/**
 * Log the current OAuth token status. Call at startup for observability.
 */
export function logTokenStatus(): void {
  const creds = readCredentials();
  if (!creds?.claudeAiOauth) {
    logger.info(
      'No OAuth credentials found — using ANTHROPIC_API_KEY from .env',
    );
    return;
  }
  const expiresAt = new Date(creds.claudeAiOauth.expiresAt);
  const remaining = creds.claudeAiOauth.expiresAt - Date.now();
  if (remaining <= 0) {
    logger.warn(
      `OAuth token expired at ${expiresAt.toISOString()} — will refresh on next agent invocation`,
    );
    return;
  }
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  logger.info(
    `OAuth token expires at ${expiresAt.toISOString()} (${hours}h ${minutes}m remaining)`,
  );
}
