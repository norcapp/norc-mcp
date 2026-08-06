import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerMachineTools } from './machines.js'

describe('registerMachineTools', () => {
  it('registers list_machines, rename_machine, delete_machine', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const registerSpy = vi.spyOn(server, 'registerTool')
    registerMachineTools(server, { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as never)
    const names = registerSpy.mock.calls.map((c) => c[0])
    expect(names).toEqual(expect.arrayContaining(['list_machines', 'rename_machine', 'delete_machine']))
  })
})
