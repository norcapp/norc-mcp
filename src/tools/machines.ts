import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VaultClient } from '../vault-client.js'
import { clean, fail, framed, text } from '../output.js'
import * as v from '../validation.js'

export function registerMachineTools(server: McpServer, client: VaultClient): void {
  server.registerTool(
    'list_machines',
    {
      description: "List the user's paired machines. Names and hostnames are returned inside a data block.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => text(framed(await client.get('/api/v1/machines'))),
  )

  server.registerTool(
    'rename_machine',
    {
      description: 'Rename a machine.',
      inputSchema: { id: v.id, name: v.name },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, name }) => text(framed(await client.patch(`/api/v1/machines/${encodeURIComponent(id)}`, { name }))),
  )

  server.registerTool(
    'delete_machine',
    {
      description:
        'Unpair a machine. The machine and its jobs are archived, not erased: the owner can undo from the Norc app for about 10 minutes, after which they are removed permanently. Requires confirm=true and the exact machine name.',
      inputSchema: { id: v.id, name: z.string().describe('The exact name of the machine being unpaired'), confirm: z.literal(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, name }) => {
      const path = `/api/v1/machines/${encodeURIComponent(id)}`
      const machine = await client.get<{ name: string }>(path)
      if (machine.name !== name) return fail(`Not deleted: the name given does not match machine ${id} ("${clean(machine.name, 80)}"). Check with the user and retry with the exact name.`)
      await client.delete(path)
      return text(`Machine ${id} ("${clean(machine.name, 80)}") and its jobs were archived. The owner can undo this in the Norc app for about 10 minutes.`)
    },
  )
}
