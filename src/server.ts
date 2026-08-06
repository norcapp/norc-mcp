import { createServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { VaultClient } from './vault-client.js'
import { registerJobTools } from './tools/jobs.js'
import { registerMachineTools } from './tools/machines.js'
import { registerRunTools } from './tools/runs.js'

const VAULT_BASE_URL = process.env.NORC_VAULT_URL ?? 'https://vault.norc.app'

export function extractApiKey(headers: Headers): string | null {
  const auth = headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const raw = auth.slice('Bearer '.length).trim()
  return raw.startsWith('norc_sk_') ? raw : null
}

function buildServer(apiKey: string): McpServer {
  const server = new McpServer({ name: 'norc-mcp', version: '0.1.0' })
  const client = new VaultClient(apiKey, VAULT_BASE_URL)
  registerJobTools(server, client)
  registerMachineTools(server, client)
  registerRunTools(server, client)
  return server
}

// Only run the HTTP listener when executed directly, so tests can import
// extractApiKey/buildServer without binding a port.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000)
  createServer(async (req, res) => {
    if (req.url !== '/mcp' || req.method !== 'POST') {
      res.writeHead(404).end()
      return
    }
    const headers = new Headers(req.headers as Record<string, string>)
    const apiKey = extractApiKey(headers)
    if (!apiKey) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'missing or malformed norc API key' }))
      return
    }
    const server = buildServer(apiKey)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
  }).listen(port, () => {
    console.log(`norc-mcp listening on :${port}`)
  })
}
