import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { openDb } from './db.js';
import { PiiEngine } from './pii-engine.js';
import { WriteQueue } from './write-queue.js';
import { SlackNotifier } from './slack-notify.js';
import { ApiClient } from './api-client.js';
import { generateReadTools } from './tool-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const config = {
  apiBaseUrl: requireEnv('API_BASE_URL'),
  apiToken: requireEnv('API_TOKEN'),
  piiHmacSecret: requireEnv('PII_HMAC_SECRET'),
  slackBotToken: requireEnv('SLACK_BOT_TOKEN'),
  slackChannelId: requireEnv('SLACK_APPROVAL_CHANNEL_ID'),
  mcpPort: parseInt(process.env.MCP_SSE_PORT ?? '3098'),
  approvalPort: parseInt(process.env.APPROVAL_HTTP_PORT ?? '3099'),
  maskFinancials: process.env.MASK_FINANCIALS === 'true',
};

const db = openDb();
const piiEngine = new PiiEngine({ db, hmacSecret: config.piiHmacSecret, maskFinancials: config.maskFinancials });
const writeQueue = new WriteQueue(db);
const slackNotifier = new SlackNotifier(config.slackBotToken);
const apiClient = new ApiClient({ baseUrl: config.apiBaseUrl, token: config.apiToken });

const spec = JSON.parse(readFileSync(path.join(__dirname, '..', 'docs', 'client-api.json'), 'utf-8'));
const readTools = generateReadTools(spec);

// Build a lookup map: tool name → tool metadata
const toolMap = new Map(readTools.map(t => [t.name, t]));

// Low-level MCP Server — accepts raw JSON Schema inputSchema per tool
const server = new Server(
  { name: 'pii-proxy', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// Tool list handler — each read tool exposes its real OpenAPI-derived schema
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...readTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    {
      name: 'request_write',
      description: 'Request a write/mutation on the FXBO API. Always requires Slack approval before executing. Returns immediately with pending_approval status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          endpoint: { type: 'string', description: 'API endpoint path, e.g. /client-api/transfers' },
          method: { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
          params: { type: 'object', description: 'Request body or path/query parameters' },
          reason: { type: 'string', description: 'Required: why this write is needed (shown in approval message)' },
        },
        required: ['endpoint', 'method', 'params', 'reason'],
      },
    },
  ],
}));

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  // Handle request_write
  if (name === 'request_write') {
    const { endpoint, method, params, reason } = a as {
      endpoint: string; method: string; params: Record<string, unknown>; reason: string;
    };
    const maskedParams = piiEngine.maskObject(params);
    const requestId = writeQueue.enqueue(endpoint, method, maskedParams, reason);
    try {
      const result = await slackNotifier.sendApprovalRequest({
        requestId, endpoint, method, params: maskedParams, reason,
        expiresInMinutes: 10, channelId: config.slackChannelId,
      });
      writeQueue.setSlackMeta(requestId, result.ts, result.channelId);
    } catch (err) {
      console.error('Failed to send Slack approval:', err);
    }
    return { content: [{ type: 'text', text: JSON.stringify({
      status: 'pending_approval', request_id: requestId,
      message: 'Approval requested. Check Slack to approve or deny.',
    }) }] };
  }

  // Handle read tools
  const tool = toolMap.get(name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }

  let resolvedEndpoint = tool._endpoint;
  const queryParams = { ...(a ?? {}) };
  for (const match of tool._endpoint.matchAll(/\{(\w+)\}/g)) {
    const key = match[1];
    if (queryParams[key]) {
      resolvedEndpoint = resolvedEndpoint.replace(`{${key}}`, String(queryParams[key]));
      delete queryParams[key];
    }
  }

  const response = await apiClient.request(
    tool._method, resolvedEndpoint,
    tool._method === 'GET' ? queryParams : (queryParams.body ?? queryParams),
  );
  if (!response.ok) {
    return { content: [{ type: 'text', text: `API error ${response.status}: ${JSON.stringify(response.data)}` }], isError: true };
  }
  const masked = piiEngine.maskObject(response.data);
  return { content: [{ type: 'text', text: JSON.stringify(masked, null, 2) }] };
});

// MCP SSE server
const transports = new Map<string, SSEServerTransport>();

const mcpHttpServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/sse') {
    const transport = new SSEServerTransport('/message', res);
    transports.set(transport.sessionId, transport);
    res.on('close', () => transports.delete(transport.sessionId));
    await server.connect(transport);
  } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
    const sessionId = new URL(req.url, 'http://localhost').searchParams.get('sessionId');
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) { res.writeHead(404); res.end(); return; }
    await transport.handlePostMessage(req, res);
  } else {
    res.writeHead(404); res.end();
  }
});

mcpHttpServer.listen(config.mcpPort, '127.0.0.1', () =>
  console.log(`pii-proxy MCP server: http://127.0.0.1:${config.mcpPort}/sse`)
);

// Approval HTTP server
const approvalServer = http.createServer(async (req, res) => {
  const match = req.url?.match(/^\/(approve|deny)\/([^/]+)$/);
  if (!match || req.method !== 'POST') { res.writeHead(404); res.end('Not found'); return; }

  const [, action, requestId] = match;
  const wr = writeQueue.get(requestId);

  if (!wr) { res.writeHead(404); res.end(JSON.stringify({ error: 'Unknown request_id' })); return; }
  if (wr.status !== 'pending') { res.writeHead(409); res.end(JSON.stringify({ error: `Already ${wr.status}` })); return; }

  if (action === 'deny') {
    writeQueue.deny(requestId);
    if (wr.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.updateApprovalMessage(wr.slackChannelId, wr.slackMessageTs, 'denied');
    }
    res.writeHead(200); res.end(JSON.stringify({ status: 'denied' }));
    return;
  }

  writeQueue.approve(requestId);
  try {
    const response = await apiClient.request(wr.method, wr.endpoint, wr.params);
    writeQueue.markExecuted(requestId);
    const masked = piiEngine.maskObject(response.data);
    const resultText = response.ok
      ? `Executed: ${wr.method} ${wr.endpoint}\n\`\`\`${JSON.stringify(masked, null, 2).slice(0, 800)}\`\`\``
      : `API error ${response.status}: ${JSON.stringify(response.data).slice(0, 300)}`;
    if (wr.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.updateApprovalMessage(wr.slackChannelId, wr.slackMessageTs, 'approved');
      await slackNotifier.postThreadReply(wr.slackChannelId, wr.slackMessageTs, resultText);
    }
    res.writeHead(200); res.end(JSON.stringify({ status: 'executed', response: masked }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (wr.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.postThreadReply(wr.slackChannelId, wr.slackMessageTs, `Execution failed: ${msg}`);
    }
    res.writeHead(500); res.end(JSON.stringify({ error: msg }));
  }
});

approvalServer.listen(config.approvalPort, '127.0.0.1', () =>
  console.log(`pii-proxy approval server: http://127.0.0.1:${config.approvalPort}`)
);

// TTL cleanup every 5 minutes
setInterval(async () => {
  const expired = writeQueue.expireStale();
  for (const id of expired) {
    const wr = writeQueue.get(id);
    if (wr?.slackMessageTs && wr.slackChannelId) {
      await slackNotifier.updateApprovalMessage(wr.slackChannelId, wr.slackMessageTs, 'expired');
    }
  }
}, 5 * 60 * 1000);

console.log(`pii-proxy started. ${readTools.length} read tools registered.`);
