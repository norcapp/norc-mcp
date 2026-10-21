#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { VaultClient } from './vault-client.js'
import { registerJobTools } from './tools/jobs.js'
import { registerGitopsTools } from './tools/gitops.js'
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
  const server = new McpServer({ name: 'norc-mcp', version: '0.2.2' })
  const client = new VaultClient(apiKey, VAULT_BASE_URL)
  registerJobTools(server, client)
  registerMachineTools(server, client)
  registerRunTools(server, client)
  registerGitopsTools(server, client)
  return server
}

// stdio mode (a local MCP client spawns us, key comes from the environment) when
// NORC_API_KEY is set or --stdio is passed; otherwise the HTTP listener (Docker, self-hosting).
export function wantsStdio(env: NodeJS.ProcessEnv, argv: string[]): boolean {
  return argv.includes('--stdio') || Boolean(env.NORC_API_KEY)
}

async function runStdio(): Promise<void> {
  const apiKey = process.env.NORC_API_KEY ?? ''
  if (!apiKey.startsWith('norc_sk_')) {
    // stdout carries the protocol, so diagnostics go to stderr
    console.error('norc-mcp: set NORC_API_KEY to a norc API key (norc_sk_...)')
    process.exit(1)
  }
  await buildServer(apiKey).connect(new StdioServerTransport())
}

function runHttp(): void {
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

// Only start when executed directly, so tests can import extractApiKey/buildServer without
// binding a port. realpath: an npm bin is a symlink, so argv[1] differs from import.meta.url.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (wantsStdio(process.env, process.argv)) await runStdio()
  else runHttp()
}
