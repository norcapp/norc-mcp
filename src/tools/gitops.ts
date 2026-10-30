import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VaultClient } from '../vault-client.js'

interface Machine { id: string; name: string }
// command is null when the vault cannot decrypt the job; it never equals a desired command, so sync re-sets it.
interface Job { id: string; machine_id: string; name: string; schedule: string; command: string | null; enabled: boolean }
interface Desired { machine: string; name: string; schedule: string; command: string; enabled: boolean }

// JSON key, not "a/b": names may contain "/" and would collide.
const key = (machine: string, name: string) => JSON.stringify([machine, name])

export function computeDiff(desired: Desired[], machines: Machine[], jobs: Job[]) {
  const machineName = new Map(machines.map((m) => [m.id, m.name]))
  const machineId = new Map(machines.map((m) => [m.name, m.id]))
  const live = new Map(jobs.map((j) => [key(machineName.get(j.machine_id) ?? '', j.name), j]))
  const want = new Set(desired.map((d) => key(d.machine, d.name)))

  const errors: string[] = []
  const creates: { key: string; machineId: string; name: string; schedule: string; command: string; enabled: boolean }[] = []
  const updates: { key: string; id: string; patch: { schedule: string; command: string; enabled: boolean } }[] = []
  for (const d of desired) {
    const k = `${d.machine}/${d.name}`
    const mid = machineId.get(d.machine)
    if (!mid) { errors.push(`${k}: unknown machine "${d.machine}"`); continue }
    const existing = live.get(key(d.machine, d.name))
    if (!existing) creates.push({ key: k, machineId: mid, name: d.name, schedule: d.schedule, command: d.command, enabled: d.enabled })
    else if (existing.schedule !== d.schedule || existing.command !== d.command || existing.enabled !== d.enabled) {
      updates.push({ key: k, id: existing.id, patch: { schedule: d.schedule, command: d.command, enabled: d.enabled } })
    }
  }
  const deletes = jobs
    .filter((j) => !want.has(key(machineName.get(j.machine_id) ?? '', j.name)))
    .map((j) => ({ key: `${machineName.get(j.machine_id) ?? j.machine_id}/${j.name}`, id: j.id }))
  return { creates, updates, deletes, errors }
}

export function registerGitopsTools(server: McpServer, client: VaultClient): void {
  server.registerTool(
    'sync_jobs',
    {
      description:
        "Make the account's jobs match a declared set (declarative, like `norc gitops`). Jobs not listed are DELETED. " +
        'Defaults to a dry run that only returns the diff; set apply=true to execute it. Always show the user the dry-run diff, ' +
        'especially the deletes, and get their confirmation before applying. Requires the gitops sync feature on the account.',
      inputSchema: {
        jobs: z
          .array(
            z.object({
              machine: z.string().describe('Machine name (not id)'),
              name: z.string(),
              schedule: z.string().describe('Cron expression, e.g. "0 * * * *"'),
              command: z.string(),
              enabled: z.boolean().optional().describe('Defaults to true'),
            }),
          )
          .describe('The complete desired job set across all machines'),
        apply: z.boolean().optional().describe('Execute the diff. Default false (dry run).'),
      },
    },
    async ({ jobs, apply }) => {
      const desired = jobs.map((j) => ({ ...j, enabled: j.enabled ?? true }))
      const [machines, live] = await Promise.all([client.get<Machine[]>('/api/v1/machines'), client.get<Job[]>('/api/v1/jobs')])
      const { errors, ...diff } = computeDiff(desired, machines, live)
      if (errors.length > 0) {
        return { isError: true, content: [{ type: 'text', text: `Not applied. ${errors.join('; ')}` }] }
      }
      if (!apply) {
        return { content: [{ type: 'text', text: JSON.stringify({ applied: false, diff }, null, 2) }] }
      }
      const result = await client.post('/api/v1/jobs/sync', diff)
      return { content: [{ type: 'text', text: JSON.stringify({ applied: true, ...(result as object) }, null, 2) }] }
    },
  )
}
