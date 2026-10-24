import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VaultClient } from '../vault-client.js'
import { approvalNotice, clean, fail, framed, text } from '../output.js'
import * as v from '../validation.js'

interface Job { id: string; name: string }

const RUNS_ON_MACHINE =
  "The command is a shell command that runs as the user on their machine on the given schedule, but only after the account owner approves the job in the Norc app. Until then it has approval_status 'pending' and does not run."

export function registerJobTools(server: McpServer, client: VaultClient): void {
  server.registerTool(
    'list_jobs',
    {
      description:
        "List the user's cron jobs, optionally filtered by machine. Names and commands are returned inside a data block and long commands are truncated; use get_job for the full command. Paginated: pass the returned next_cursor as cursor.",
      inputSchema: { machine_id: v.id.optional(), cursor: v.cursor.optional(), limit: z.number().int().min(1).max(500).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ machine_id, cursor, limit }) => {
      const params = new URLSearchParams()
      if (machine_id) params.set('machine_id', machine_id)
      if (cursor) params.set('cursor', cursor)
      if (limit) params.set('limit', String(limit))
      const qs = params.toString()
      const { data, nextCursor } = await client.getPage(`/api/v1/jobs${qs ? `?${qs}` : ''}`)
      return text(framed({ jobs: data, next_cursor: nextCursor }))
    },
  )

  server.registerTool(
    'get_job',
    {
      description: 'Get one job including its full command (returned inside a data block).',
      inputSchema: { id: v.id },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => text(framed(await client.get(`/api/v1/jobs/${encodeURIComponent(id)}`), { full: true })),
  )

  server.registerTool(
    'create_job',
    {
      description: `Create a cron job on a machine. ${RUNS_ON_MACHINE} Show the user the exact command, schedule and machine before calling, and tell them afterwards that they must approve it in the Norc app.`,
      inputSchema: {
        machine_id: v.id,
        name: v.name,
        schedule: v.schedule.describe('Cron expression, e.g. "0 * * * *"'),
        command: v.command,
        enabled: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      const job = await client.post('/api/v1/jobs', input)
      return text(approvalNotice(job), framed(job, { full: true }))
    },
  )

  server.registerTool(
    'update_job',
    {
      description: `Update a job (name, schedule, command or enabled state). ${RUNS_ON_MACHINE} Changing the command, schedule or enabling a job requires the owner to approve again. Show the user the exact new command before calling.`,
      inputSchema: {
        id: v.id,
        name: v.name.optional(),
        schedule: v.schedule.optional(),
        command: v.command.optional(),
        enabled: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, ...patch }) => {
      const job = await client.patch(`/api/v1/jobs/${encodeURIComponent(id)}`, patch)
      return text(approvalNotice(job), framed(job, { full: true }))
    },
  )

  server.registerTool(
    'delete_job',
    {
      description:
        'Delete a job. The job is archived, not erased: the owner can undo from the Norc app for about 10 minutes, after which it is removed permanently. Requires confirm=true and the exact job name.',
      inputSchema: { id: v.id, name: z.string().describe('The exact name of the job being deleted'), confirm: z.literal(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, name }) => {
      const path = `/api/v1/jobs/${encodeURIComponent(id)}`
      const job = await client.get<Job>(path)
      if (job.name !== name) return fail(`Not deleted: the name given does not match job ${id} ("${clean(job.name, 80)}"). Check with the user and retry with the exact name.`)
      await client.delete(path)
      return text(`Job ${id} ("${clean(job.name, 80)}") was archived. The owner can undo this in the Norc app for about 10 minutes.`)
    },
  )
}
