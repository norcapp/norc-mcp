import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerJobTools } from './jobs.js'
import { registerMachineTools } from './machines.js'
import { registerRunTools } from './runs.js'
import { registerGitopsTools } from './gitops.js'

const ID = '11111111-1111-4111-8111-111111111111'
type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>

function setup(client: Record<string, unknown>) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const spy = vi.spyOn(server, 'registerTool')
  registerJobTools(server, client as never)
  registerMachineTools(server, client as never)
  registerRunTools(server, client as never)
  registerGitopsTools(server, client as never, 'norc_sk_test')
  const tools = new Map((spy.mock.calls as unknown as unknown[][]).map((c) => [c[0] as string, { config: c[1] as { annotations?: Record<string, boolean>; description: string }, run: c[2] as unknown as Handler }]))
  return tools
}

describe('tool registration', () => {
  const tools = setup({})
  it('registers every tool with annotations', () => {
    expect([...tools.keys()].sort()).toEqual(['create_job', 'delete_job', 'delete_machine', 'get_job', 'list_jobs', 'list_machines', 'list_runs', 'rename_machine', 'sync_jobs', 'update_job'])
    for (const [, t] of tools) expect(t.config.annotations).toBeDefined()
  })
  it('marks reads read-only and deletes destructive', () => {
    for (const n of ['list_jobs', 'get_job', 'list_machines', 'list_runs']) expect(tools.get(n)!.config.annotations!.readOnlyHint).toBe(true)
    for (const n of ['delete_job', 'delete_machine', 'update_job', 'sync_jobs']) expect(tools.get(n)!.config.annotations!.destructiveHint).toBe(true)
  })
  it('says commands run on the user machine after approval', () => {
    for (const n of ['create_job', 'update_job', 'sync_jobs']) expect(tools.get(n)!.config.description).toMatch(/approv/i)
  })
})

describe('create_job', () => {
  it('surfaces pending approval and frames the job', async () => {
    const post = vi.fn().mockResolvedValue({ id: ID, name: 'n', command: 'echo', approval_status: 'pending' })
    const out = await setup({ post }).get('create_job')!.run({ machine_id: ID, name: 'n', schedule: '0 * * * *', command: 'echo' })
    expect(out.content[0]!.text).toContain('will NOT run')
    expect(out.content[0]!.text).toContain('<norc-data>')
  })
})

describe('delete_job', () => {
  it('refuses when the echoed name does not match, deletes when it does', async () => {
    const get = vi.fn().mockResolvedValue({ id: ID, name: 'backup' })
    const del = vi.fn().mockResolvedValue(undefined)
    const run = setup({ get, delete: del }).get('delete_job')!.run
    expect((await run({ id: ID, name: 'other', confirm: true })).isError).toBe(true)
    expect(del).not.toHaveBeenCalled()
    const ok = await run({ id: ID, name: 'backup', confirm: true })
    expect(del).toHaveBeenCalled()
    expect(ok.content[0]!.text).toContain('undo')
  })
})
