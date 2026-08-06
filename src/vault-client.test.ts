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

  it('throws VaultApiError with the response status and message on failure', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'job not found' }), { status: 404 }))
    const client = new VaultClient('norc_sk_test', 'https://vault.norc.app')
    await expect(client.get('/api/v1/jobs/missing')).rejects.toMatchObject({ status: 404, message: 'job not found' })
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
