import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { VaultClient } from './vault-client.js'
import { registerJobTools } from './tools/jobs.js'
import { registerGitopsTools } from './tools/gitops.js'
import { registerMachineTools } from './tools/machines.js'
import { registerRunTools } from './tools/runs.js'

const VAULT_BASE_URL = process.env.NORC_VAULT_URL ?? 'https://vault.norc.app'

// DNS-rebinding / cross-site guard. Requests without an Origin header (server-to-server MCP
// clients, curl) pass the Origin check; requests with one must come from an allowed origin.
// The Host header must always be an allowed host.
const list = (v: string | undefined, fallback: string[]) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : fallback)
const DEFAULT_HOSTS = ['mcp.norc.app', 'localhost', '127.0.0.1', '[::1]']
const DEFAULT_ORIGINS = ['https://claude.ai', 'https://claude.com']

export function isAllowedRequest(
  headers: { host?: string; origin?: string },
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; reason: 'host' | 'origin' } {
  const hosts = list(env.NORC_MCP_ALLOWED_HOSTS, DEFAULT_HOSTS)
  const host = (headers.host ?? '').toLowerCase().replace(/:\d+$/, '')
  if (!hosts.includes(host)) return { ok: false, reason: 'host' }
  if (headers.origin !== undefined && !list(env.NORC_MCP_ALLOWED_ORIGINS, DEFAULT_ORIGINS).includes(headers.origin.toLowerCase())) {
    return { ok: false, reason: 'origin' }
  }
  return { ok: true }
}

export function extractApiKey(headers: Headers): string | null {
  const auth = headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const raw = auth.slice('Bearer '.length).trim()
  return raw.startsWith('norc_sk_') ? raw : null
}

export function buildServer(apiKey: string): McpServer {
  const server = new McpServer({ name: 'norc-mcp', version: '0.4.0' })
  const client = new VaultClient(apiKey, VAULT_BASE_URL)
  registerJobTools(server, client)
  registerMachineTools(server, client)
  registerRunTools(server, client)
  registerGitopsTools(server, client, apiKey)
  return server
}

// One stateless MCP exchange per request. Shared by the standalone listener (server.ts) and
// the Vercel function (api/mcp.js), which have different routing but identical behaviour.
export async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' }).end()
    return
  }
  const allowed = isAllowedRequest({ host: req.headers.host, origin: req.headers.origin })
  if (!allowed.ok) {
    res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: `${allowed.reason} not allowed` }))
    return
  }
  const headers = new Headers(req.headers as Record<string, string>)
  const apiKey = extractApiKey(headers)
  if (!apiKey) {
    res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'missing or malformed norc API key' }))
    return
  }
  // Vercel parses lazily on first access and throws on malformed JSON.
  let body: unknown
  try {
    body = (req as IncomingMessage & { body?: unknown }).body
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid JSON body' }))
    return
  }
  const server = buildServer(apiKey)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  // Vercel pre-parses the body onto req.body; the standalone listener leaves the stream unread.
  await transport.handleRequest(req, res, body)
}
