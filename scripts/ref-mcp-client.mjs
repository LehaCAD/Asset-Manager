#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'];

function printUsage() {
  console.error([
    'Usage:',
    '  node scripts/ref-mcp-client.mjs tools',
    '  node scripts/ref-mcp-client.mjs search "query"',
    '  node scripts/ref-mcp-client.mjs read "https://..."',
    '  node scripts/ref-mcp-client.mjs call <toolName> <jsonArgs>',
    '',
    'Config resolution order:',
    '  1. REF_MCP_URL / REF_MCP_API_KEY env vars',
    '  2. ~/.cursor/mcp.json -> mcpServers.Ref.url',
  ].join('\n'));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function withApiKey(rawUrl, apiKey) {
  const url = new URL(rawUrl);
  if (apiKey) {
    url.searchParams.set('apiKey', apiKey);
  }
  return url.toString();
}

async function resolveRefConfig() {
  const explicitUrl = process.env.REF_MCP_URL?.trim();
  const explicitApiKey = process.env.REF_MCP_API_KEY?.trim();

  if (explicitUrl) {
    return {
      url: withApiKey(explicitUrl, explicitApiKey),
      hasApiKey: Boolean(explicitApiKey || new URL(explicitUrl).searchParams.get('apiKey')),
      source: 'env',
    };
  }

  const cursorMcpPath = path.join(os.homedir(), '.cursor', 'mcp.json');
  const cursorConfig = await readJson(cursorMcpPath);
  const refServer = cursorConfig?.mcpServers?.Ref;

  if (!refServer?.url) {
    throw new Error(`Ref server config not found in ${cursorMcpPath}`);
  }

  return {
    url: withApiKey(refServer.url, explicitApiKey),
    hasApiKey: Boolean(explicitApiKey || new URL(refServer.url).searchParams.get('apiKey')),
    source: cursorMcpPath,
  };
}

async function decodeResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (!text) {
    return null;
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }

  if (contentType.includes('text/event-stream')) {
    const chunks = text
      .split(/\r?\n\r?\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    for (const chunk of chunks.reverse()) {
      const dataLines = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

      if (!dataLines) {
        continue;
      }

      try {
        return JSON.parse(dataLines);
      } catch {
        // Ignore non-JSON events and keep scanning backwards.
      }
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function postJson(url, body, { sessionId } = {}) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const payload = await decodeResponse(response);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }

  return {
    payload,
    sessionId: response.headers.get('mcp-session-id') ?? sessionId ?? null,
    contentType: response.headers.get('content-type') ?? '',
  };
}

async function initializeSession(config) {
  let lastError = null;

  for (const protocolVersion of DEFAULT_PROTOCOL_VERSIONS) {
    try {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: {
            name: 'codex-ref-client',
            version: '0.1.0',
          },
        },
      };

      const initResponse = await postJson(config.url, initRequest, config);
      const negotiatedVersion = initResponse.payload?.result?.protocolVersion ?? protocolVersion;

      await postJson(
        config.url,
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { sessionId: initResponse.sessionId },
      );

      return {
        ...config,
        sessionId: initResponse.sessionId,
        protocolVersion: negotiatedVersion,
        serverInfo: initResponse.payload?.result?.serverInfo ?? null,
        capabilities: initResponse.payload?.result?.capabilities ?? {},
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('MCP initialize failed');
}

async function listTools(session) {
  const response = await postJson(
    session.url,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    session,
  );

  return response.payload?.result?.tools ?? [];
}

async function callTool(session, name, args) {
  const response = await postJson(
    session.url,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    },
    session,
  );

  return response.payload?.result ?? response.payload;
}

function safeLogConfig(config) {
  return {
    source: config.source,
    url: config.url.replace(/([?&]apiKey=)[^&]+/, '$1***'),
    apiKeyConfigured: config.hasApiKey,
  };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const config = await resolveRefConfig();
  const session = await initializeSession(config);

  if (command === 'tools') {
    const tools = await listTools(session);
    console.log(JSON.stringify({ config: safeLogConfig(config), serverInfo: session.serverInfo, tools }, null, 2));
    return;
  }

  if (command === 'search') {
    const query = rest.join(' ').trim();
    if (!query) {
      throw new Error('Missing query for search command');
    }

    const result = await callTool(session, 'ref_search_documentation', { query });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'read') {
    const url = rest[0]?.trim();
    if (!url) {
      throw new Error('Missing URL for read command');
    }

    const result = await callTool(session, 'ref_read_url', { url });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'call') {
    const toolName = rest[0]?.trim();
    const rawArgs = rest[1]?.trim();

    if (!toolName || !rawArgs) {
      throw new Error('Usage: node scripts/ref-mcp-client.mjs call <toolName> <jsonArgs>');
    }

    const parsedArgs = JSON.parse(rawArgs);
    const result = await callTool(session, toolName, parsedArgs);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
