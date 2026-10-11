import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { computeDiff, registerGitopsTools } from './gitops.js'

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
  async function run(apply: boolean | undefined) {
    const post = vi.fn().mockResolvedValue({ results: [] })
    const get = vi.fn((p: string) => Promise.resolve(p.endsWith('machines') ? machines : [job('9', 'old')]))
    const server = new McpServer({ name: 't', version: '0' })
    const spy = vi.spyOn(server, 'registerTool')
    registerGitopsTools(server, { get, post } as never)
    const handler = spy.mock.calls[0]![2] as (a: unknown) => Promise<{ content: { text: string }[] }>
    const out = await handler({ jobs: [{ machine: 'web', name: 'n', schedule: '0 * * * *', command: 'echo' }], apply })
    return { post, out }
  }

  it('dry run does not POST', async () => {
    const { post, out } = await run(undefined)
    expect(post).not.toHaveBeenCalled()
    expect(out.content[0]!.text).toContain('"applied": false')
  })

  it('apply POSTs the diff to /api/v1/jobs/sync', async () => {
    const { post } = await run(true)
    expect(post).toHaveBeenCalledWith('/api/v1/jobs/sync', expect.objectContaining({ deletes: [{ key: 'web/old', id: '9' }] }))
  })
})
