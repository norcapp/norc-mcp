import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerRunTools } from './runs.js'

describe('registerRunTools', () => {
  it('registers list_runs', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const registerSpy = vi.spyOn(server, 'registerTool')
    registerRunTools(server, { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } as never)
    expect(registerSpy.mock.calls.map((c) => c[0])).toEqual(['list_runs'])
  })
})
