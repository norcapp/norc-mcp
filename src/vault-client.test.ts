import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VaultClient, VaultApiError } from './vault-client.js'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })

describe('VaultClient', () => {
  it('sends the API key as a Bearer header', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    const client = new VaultClient('norc_sk_test', 'https://vault.norc.app')
    await client.get('/api/v1/jobs')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer norc_sk_test')
  })

  it('maps failures to a stable message plus the request id, never upstream text', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'relation "jobs" violates NJL01', request_id: 'abc-123' }), { status: 500 }))
    const client = new VaultClient('norc_sk_test', 'https://vault.norc.app')
    const err = (await client.get("/api/v1/jobs/x").catch((e: unknown) => e)) as VaultApiError
    expect(err).toMatchObject({ status: 500, requestId: 'abc-123' })
    expect(err.message).toBe('Norc service error (request id: abc-123)')
    expect(err.message).not.toContain('NJL01')
  })

  it('sets a fetch timeout signal and does not retry', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('x'), { name: 'TimeoutError' }))
    const client = new VaultClient('norc_sk_test', 'https://vault.norc.app')
    await expect(client.post('/api/v1/jobs', {})).rejects.toMatchObject({ message: 'Norc did not respond in time' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })

  it('getPage returns the next cursor header', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200, headers: { 'x-next-cursor': 'cur_1' } }))
    const client = new VaultClient('norc_sk_test', 'https://vault.norc.app')
    await expect(client.getPage('/api/v1/jobs')).resolves.toEqual({ data: [], nextCursor: 'cur_1' })
  })

  it('post sends a JSON body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'j1' }), { status: 201 }))
    const client = new VaultClient('norc_sk_test', 'https://vault.norc.app')
    const result = await client.post('/api/v1/jobs', { name: 'x' })
    expect(result).toEqual({ id: 'j1' })
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ name: 'x' })
  })

  it('delete resolves with no body on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const client = new VaultClient('norc_sk_test', 'https://vault.norc.app')
    await expect(client.delete('/api/v1/jobs/j1')).resolves.toBeUndefined()
  })
})
