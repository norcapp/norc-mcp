import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VaultClient } from '../vault-client.js'

export function registerRunTools(server: McpServer, client: VaultClient): void {
  server.registerTool(
    'list_runs',
    {
      description: 'List job run history, optionally filtered by job, machine, or status. Paginated via cursor.',
      inputSchema: {
        job_id: z.string().optional(),
        machine_id: z.string().optional(),
        status: z.enum(['success', 'warning', 'failed', 'running', 'disabled']).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (input) => {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) params.set(k, String(v))
      }
      const qs = params.toString()
      const result = await client.get(`/api/v1/runs${qs ? `?${qs}` : ''}`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )
}
