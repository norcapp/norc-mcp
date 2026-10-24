import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { computeDiff, listAllJobs, MAX_JOB_PAGES, registerGitopsTools, signDiff, verifyToken } from './gitops.js'

const machines = [{ id: 'm1', name: 'web' }]
const job = (id: string, name: string, schedule = '0 * * * *') => ({ id, machine_id: 'm1', name, schedule, command: 'echo', enabled: true })
const want = (name: string, schedule = '0 * * * *') => ({ machine: 'web', name, schedule, command: 'echo', enabled: true })

describe('computeDiff', () => {
  it('creates, updates, deletes and leaves unchanged alone', () => {
    const d = computeDiff([want('new'), want('chg', '5 * * * *'), want('same')], machines, [job('1', 'chg'), job('2', 'same'), job('3', 'gone')])
    expect(d.creates.map((c) => c.name)).toEqual(['new'])
    expect(d.updates.map((u) => u.id)).toEqual(['1'])
    expect(d.deletes.map((x) => x.id)).toEqual(['3'])
    expect(d.errors).toEqual([])
  })

  it('reports unknown machine and does not delete-by-collision on "/" names', () => {
    expect(computeDiff([{ ...want('x'), machine: 'nope' }], machines, []).errors).toHaveLength(1)
    const two = [{ id: 'm1', name: 'a' }, { id: 'm2', name: 'a/b' }]
    const d = computeDiff([{ ...want('b/c'), machine: 'a' }], two, [{ ...job('1', 'c'), machine_id: 'm2' }])
    expect(d.creates).toHaveLength(1)
    expect(d.deletes.map((x) => x.id)).toEqual(['1'])
  })
})

describe('sync_jobs tool', () => {
  const KEY = 'norc_sk_test'
  function setupSync() {
    const post = vi.fn().mockResolvedValue({ results: [{ key: 'web/n', op: 'create', ok: true }] })
    const get = vi.fn(() => Promise.resolve(machines))
    const getPage = vi.fn(() => Promise.resolve({ data: [job('9', 'old')], nextCursor: null }))
    const server = new McpServer({ name: 't', version: '0' })
    const spy = vi.spyOn(server, 'registerTool')
    registerGitopsTools(server, { get, getPage, post } as never, KEY)
    const handler = spy.mock.calls[0]![2] as unknown as (a: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }>
    return { post, handler }
  }
  const jobs = [{ machine: 'web', name: 'n', schedule: '0 * * * *', command: 'echo' }]
  const tokenOf = (t: string) => /"confirmation_token": "([^"]+)"/.exec(t)![1]!

  it('dry run does not POST and issues a token', async () => {
    const { post, handler } = setupSync()
    const out = await handler({ jobs })
    expect(post).not.toHaveBeenCalled()
    expect(out.content[0]!.text).toContain('"applied": false')
    expect(tokenOf(out.content[0]!.text)).toMatch(/^v1\./)
  })

  it('apply needs a valid token and the delete count, then POSTs with an idempotency key', async () => {
    const { post, handler } = setupSync()
    const token = tokenOf((await handler({ jobs })).content[0]!.text)
    expect((await handler({ jobs, confirmation_token: 'v1.1.bad' })).isError).toBe(true)
    expect((await handler({ jobs, confirmation_token: token })).isError).toBe(true) // missing delete count
    const out = await handler({ jobs, confirmation_token: token, confirm_delete_count: 1 })
    expect(post).toHaveBeenCalledWith('/api/v1/jobs/sync', expect.objectContaining({ deletes: [{ key: 'web/old', id: '9' }] }), { 'Idempotency-Key': expect.any(String) })
    expect(out.content[0]!.text).toContain('will NOT run')
  })

  it('a token for one diff does not apply a different one', async () => {
    const { post, handler } = setupSync()
    const token = tokenOf((await handler({ jobs })).content[0]!.text)
    const other = [{ ...jobs[0]!, command: 'curl x' }]
    expect((await handler({ jobs: other, confirmation_token: token, confirm_delete_count: 1 })).isError).toBe(true)
    expect(post).not.toHaveBeenCalled()
  })

  it('reads every page of jobs, so a job beyond page one is not deleted or re-created', async () => {
    const post = vi.fn().mockResolvedValue({ results: [] })
    const get = vi.fn(() => Promise.resolve(machines))
    const getPage = vi.fn()
      .mockResolvedValueOnce({ data: [job('1', 'a')], nextCursor: 'cur_1' })
      .mockResolvedValueOnce({ data: [job('2', 'n')], nextCursor: null })
    const server = new McpServer({ name: 't', version: '0' })
    const spy = vi.spyOn(server, 'registerTool')
    registerGitopsTools(server, { get, getPage, post } as never, KEY)
    const handler = spy.mock.calls[0]![2] as unknown as (a: unknown) => Promise<{ content: { text: string }[] }>
    const out = await handler({ jobs: [...jobs, { machine: 'web', name: 'a', schedule: '0 * * * *', command: 'echo' }] })
    expect(getPage).toHaveBeenCalledTimes(2)
    expect(getPage.mock.calls[1]![0]).toContain('cursor=cur_1')
    expect(out.content[0]!.text).toContain('"deletes": []')
    expect(out.content[0]!.text).toContain('"creates": []')
  })

  it('verifyToken rejects expired tokens and other keys', () => {
    const d = computeDiff([], machines, [job('1', 'a')])
    const { errors: _e, ...diff } = d
    const t = signDiff(KEY, diff, 1000)
    expect(verifyToken(KEY, diff, t, 500)).toBe(true)
    expect(verifyToken(KEY, diff, t, 2000)).toBe(false)
    expect(verifyToken('norc_sk_other', diff, t, 500)).toBe(false)
  })
})

describe('listAllJobs', () => {
  it('concatenates pages in order', async () => {
    const getPage = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: '1' }], nextCursor: 'c1' })
      .mockResolvedValueOnce({ data: [{ id: '2' }], nextCursor: null })
    expect((await listAllJobs({ getPage } as never)).map((j) => j.id)).toEqual(['1', '2'])
  })
  it('errors clearly beyond the page cap instead of returning a partial list', async () => {
    let n = 0
    const getPage = vi.fn(() => Promise.resolve({ data: [], nextCursor: `c${n++}` }))
    await expect(listAllJobs({ getPage } as never)).rejects.toThrow(/more than/)
    expect(getPage).toHaveBeenCalledTimes(MAX_JOB_PAGES)
  })
  it('errors when the cursor does not advance', async () => {
    const getPage = vi.fn(() => Promise.resolve({ data: [], nextCursor: 'same' }))
    await expect(listAllJobs({ getPage } as never)).rejects.toThrow(/did not advance/)
  })
})
