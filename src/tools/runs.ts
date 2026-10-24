import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VaultClient } from '../vault-client.js'
import { framed, text } from '../output.js'
import * as v from '../validation.js'

export function registerRunTools(server: McpServer, client: VaultClient): void {
  server.registerTool(
    'list_runs',
    {
      description: 'List job run history (status, exit code, timestamps), optionally filtered by job, machine, or status. Paginated via cursor.',
      inputSchema: {
        job_id: v.id.optional(),
        machine_id: v.id.optional(),
        status: z.enum(['success', 'warning', 'failed', 'running', 'disabled']).optional(),
        cursor: v.cursor.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      const params = new URLSearchParams()
      for (const [k, val] of Object.entries(input)) {
        if (val !== undefined) params.set(k, String(val))
      }
      const qs = params.toString()
      return text(framed(await client.get(`/api/v1/runs${qs ? `?${qs}` : ''}`)))
    },
  )
}
