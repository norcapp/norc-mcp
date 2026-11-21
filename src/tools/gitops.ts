import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { VaultApiError, type VaultClient } from '../vault-client.js'
import { approvalNotice, fail, framed, text } from '../output.js'
import * as v from '../validation.js'

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

export const MAX_OPS = 100
// Every limit error points here, so a user who hits one can see all of them.
export const LIMITS_URL = 'https://norc.app/docs/mcp/#sync_jobs-limits'
// Bound on the desired set itself (omitted jobs are deletes, so a caller cannot split it); the operation cap is checked on the diff.
const MAX_JOBS = 1000
export const TOKEN_TTL_MS = 5 * 60 * 1000

type Diff = Omit<ReturnType<typeof computeDiff>, 'errors'>

// Confirmation token = expiry + HMAC over the exact diff, keyed from the caller's API key.
// Stateless (works on serverless) and only valid for the diff it was issued for, so a
// changed job set, a changed request or an expired token all fail verification.
export function signDiff(apiKey: string, diff: Diff, expires: number): string {
  const secret = createHash('sha256').update(`norc-mcp-sync:${apiKey}`).digest()
  const mac = createHmac('sha256', secret).update(`${expires}.${JSON.stringify(diff)}`).digest('hex')
  return `v1.${expires}.${mac}`
}

export function verifyToken(apiKey: string, diff: Diff, token: string, now = Date.now()): boolean {
  const [ver, exp] = token.split('.')
  const expires = Number(exp)
  if (ver !== 'v1' || !Number.isInteger(expires) || expires < now) return false
  const a = Buffer.from(signDiff(apiKey, diff, expires))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

const PAGE_SIZE = 500
export const MAX_JOB_PAGES = 40

// The vault paginates /api/v1/jobs; a diff computed from only the first page would treat jobs on later pages as
// missing (wrongly creating or deleting them), so read every page and refuse to guess beyond a sane cap.
export async function listAllJobs(client: Pick<VaultClient, 'getPage'>): Promise<Job[]> {
  const all: Job[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_JOB_PAGES; page++) {
    const qs: string = `limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const res: { data: Job[]; nextCursor: string | null } = await client.getPage<Job[]>(`/api/v1/jobs?${qs}`)
    all.push(...res.data)
    if (!res.nextCursor) return all
    if (res.nextCursor === cursor) throw new Error('Job listing did not advance; not applying anything.')
    cursor = res.nextCursor
  }
  throw new Error(`The account has more than ${MAX_JOB_PAGES * PAGE_SIZE} jobs, which is more than sync_jobs can safely compare. Nothing was changed. See ${LIMITS_URL}`)
}

export function registerGitopsTools(server: McpServer, client: VaultClient, apiKey: string): void {
  server.registerTool(
    'sync_jobs',
    {
      description:
        "Make the account's jobs match a declared set (declarative, like `norc gitops`). Jobs not listed are ARCHIVED (the owner can undo for about 10 minutes). " +
        'Two steps. Step 1: call with only `jobs` to get a dry-run diff and a short-lived confirmation_token. Show the user the whole diff, especially the deletes, ' +
        'and get their explicit confirmation. Step 2: call again with the same `jobs`, the confirmation_token, and confirm_delete_count equal to the number of deletes shown. ' +
        'Created or changed jobs hold shell commands that run as the user on their machine, and only after the owner approves them in the Norc app; they stay pending until then. ' +
        `At most ${MAX_OPS} operations per request (limits: ${LIMITS_URL}). Requires the gitops sync feature on the account.`,
      inputSchema: {
        jobs: z
          .array(
            z.object({
              machine: z.string().min(1).max(256).describe('Machine name (not id)'),
              name: v.name,
              schedule: v.schedule.describe('Cron expression, e.g. "0 * * * *"'),
              command: v.command,
              enabled: z.boolean().optional().describe('Defaults to true'),
            }),
          )
          .max(MAX_JOBS, `At most ${MAX_JOBS} jobs per sync_jobs call. See ${LIMITS_URL}`)
          .describe('The complete desired job set across all machines'),
        confirmation_token: z.string().max(200).optional().describe('Token from the dry run; applies the diff it was issued for'),
        confirm_delete_count: z.number().int().min(0).optional().describe('Number of deletes in the diff the user confirmed'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ jobs, confirmation_token, confirm_delete_count }) => {
      const desired = jobs.map((j) => ({ ...j, enabled: j.enabled ?? true }))
      let machines: Machine[], live: Job[]
      try {
        ;[machines, live] = await Promise.all([client.get<Machine[]>('/api/v1/machines'), listAllJobs(client)])
      } catch (e) {
        if (e instanceof VaultApiError) throw e
        return fail(`Not applied. ${e instanceof Error ? e.message : 'Could not read the current jobs.'}`)
      }
      const { errors, ...diff } = computeDiff(desired, machines, live)
      if (errors.length > 0) return fail('Not applied. The desired job set has errors; fix them and retry.', framed({ errors }))
      const ops = diff.creates.length + diff.updates.length + diff.deletes.length
      if (ops > MAX_OPS) return fail(`Not applied: ${ops} operations exceeds the limit of ${MAX_OPS} per request. Stage the change: each call must still list every job that should remain, but change or remove at most ${MAX_OPS}. See ${LIMITS_URL}`)

      if (!confirmation_token) {
        const token = signDiff(apiKey, diff, Date.now() + TOKEN_TTL_MS)
        return text(
          'Dry run only; nothing was changed. Show the user this diff and get explicit confirmation. ' +
            `To apply, call sync_jobs again with the same jobs, confirmation_token and confirm_delete_count=${diff.deletes.length}. ` +
            'The token expires in 5 minutes and only applies this exact diff. ' +
            'Created or changed jobs will be pending until the owner approves them in the Norc app; deletes are archived with a short undo window.',
          framed({ applied: false, diff, confirmation_token: token }, { full: true }),
        )
      }
      if (!verifyToken(apiKey, diff, confirmation_token)) {
        return fail('Not applied: the confirmation token is invalid, expired, or the account changed since the dry run. Run the dry run again and re-confirm with the user.')
      }
      if (confirm_delete_count !== diff.deletes.length) {
        return fail(`Not applied: this diff deletes ${diff.deletes.length} job(s); confirm_delete_count must equal that number after the user has confirmed.`)
      }
      if (ops === 0) return text('Nothing to change; the account already matches.')
      // Same token => same Idempotency-Key, so a repeated call cannot apply the diff twice.
      const idem = createHash('sha256').update(confirmation_token).digest('hex').slice(0, 48)
      const result = await client.post<{ results?: { op?: string; ok?: boolean; job?: unknown }[] }>('/api/v1/jobs/sync', diff, { 'Idempotency-Key': idem })
      const wrote = (result.results ?? []).some((r) => r.ok && (r.op === 'create' || r.op === 'update'))
      return text(wrote ? approvalNotice(null) : '', framed({ applied: true, ...result }, { full: true }))
    },
  )
}
