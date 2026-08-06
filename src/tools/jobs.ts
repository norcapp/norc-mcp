import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VaultClient } from '../vault-client.js'

export function registerJobTools(server: McpServer, client: VaultClient): void {
  server.registerTool(
    'list_jobs',
    {
      description: "List the user's cron jobs, optionally filtered by machine.",
      inputSchema: { machine_id: z.string().optional() },
    },
    async ({ machine_id }) => {
      const path = machine_id ? `/api/v1/jobs?machine_id=${encodeURIComponent(machine_id)}` : '/api/v1/jobs'
      const jobs = await client.get(path)
      return { content: [{ type: 'text', text: JSON.stringify(jobs, null, 2) }] }
    },
  )

  server.registerTool(
    'create_job',
    {
      description: 'Create a new cron job on a machine.',
      inputSchema: {
        machine_id: z.string(),
        name: z.string(),
        schedule: z.string().describe('Cron expression, e.g. "0 * * * *"'),
        command: z.string(),
        enabled: z.boolean().optional(),
      },
    },
    async (input) => {
      const job = await client.post('/api/v1/jobs', input)
      return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] }
    },
  )

  server.registerTool(
    'update_job',
    {
      description: 'Update an existing job (name, schedule, command, or enabled state).',
      inputSchema: {
        id: z.string(),
        name: z.string().optional(),
        schedule: z.string().optional(),
        command: z.string().optional(),
        enabled: z.boolean().optional(),
      },
    },
    async ({ id, ...patch }) => {
      const job = await client.patch(`/api/v1/jobs/${encodeURIComponent(id)}`, patch)
      return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] }
    },
  )

  server.registerTool(
    'delete_job',
    {
      description: 'Delete a job.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await client.delete(`/api/v1/jobs/${encodeURIComponent(id)}`)
      return { content: [{ type: 'text', text: `Deleted job ${id}.` }] }
    },
  )
}
