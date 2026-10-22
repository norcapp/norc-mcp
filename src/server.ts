#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildServer, extractApiKey, handleMcp } from './handler.js'

export { extractApiKey }

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
    if (req.url !== '/mcp') {
      res.writeHead(404).end()
      return
    }
    await handleMcp(req, res)
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
