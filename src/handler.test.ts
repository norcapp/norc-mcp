import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it, expect } from 'vitest'
import { handleMcp, isAllowedRequest } from './handler.js'

async function post(prepare: (req: object) => void, headers: Record<string, string>): Promise<number> {
  const server = createServer((req, res) => {
    prepare(req)
    void handleMcp(req, res)
  })
  await new Promise<void>((r) => server.listen(0, r))
  try {
    const { port } = server.address() as AddressInfo
    const res = await fetch(`http://localhost:${port}/mcp`, { method: 'POST', headers, body: '{}' })
    return res.status
  } finally {
    server.close()
  }
}

describe('handleMcp', () => {
  it('405s a non-POST', async () => {
    const server = createServer((req, res) => void handleMcp(req, res))
    await new Promise<void>((r) => server.listen(0, r))
    const { port } = server.address() as AddressInfo
    const res = await fetch(`http://localhost:${port}/mcp`)
    server.close()
    expect(res.status).toBe(405)
  })

  it('401s without a norc key', async () => {
    expect(await post(() => {}, {})).toBe(401)
  })

  it('400s when reading req.body throws (Vercel + malformed JSON)', async () => {
    const throwing = (req: object) =>
      Object.defineProperty(req, 'body', {
        get() {
          throw new Error('Invalid JSON')
        },
      })
    expect(await post(throwing, { authorization: 'Bearer norc_sk_test' })).toBe(400)
  })
})

describe('isAllowedRequest', () => {
  it('allows loopback and hosted hosts, rejects others', () => {
    expect(isAllowedRequest({ host: 'localhost:3000' }).ok).toBe(true)
    expect(isAllowedRequest({ host: 'mcp.norc.app' }).ok).toBe(true)
    expect(isAllowedRequest({ host: 'evil.example' })).toEqual({ ok: false, reason: 'host' })
  })
  it('requires an allow-listed Origin when one is sent', () => {
    expect(isAllowedRequest({ host: 'localhost', origin: 'https://claude.ai' }).ok).toBe(true)
    expect(isAllowedRequest({ host: 'localhost', origin: 'https://evil.example' })).toEqual({ ok: false, reason: 'origin' })
  })
  it('honours env overrides', () => {
    const env = { NORC_MCP_ALLOWED_HOSTS: 'mcp.internal', NORC_MCP_ALLOWED_ORIGINS: 'https://app.internal' }
    expect(isAllowedRequest({ host: 'mcp.internal', origin: 'https://app.internal' }, env).ok).toBe(true)
    expect(isAllowedRequest({ host: 'localhost' }, env).ok).toBe(false)
  })
})
