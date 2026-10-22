import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it, expect } from 'vitest'
import { handleMcp } from './handler.js'

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
