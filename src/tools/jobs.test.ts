import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerJobTools } from './jobs'

function fakeClient(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), ...overrides } as never
}

describe('registerJobTools', () => {
  it('registers list_jobs, create_job, update_job, delete_job', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const registerSpy = vi.spyOn(server, 'registerTool')
    registerJobTools(server, fakeClient())
    const names = registerSpy.mock.calls.map((c) => c[0])
    expect(names).toEqual(expect.arrayContaining(['list_jobs', 'create_job', 'update_job', 'delete_job']))
  })
})
