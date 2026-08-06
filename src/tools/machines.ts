import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VaultClient } from '../vault-client.js'

export function registerMachineTools(server: McpServer, client: VaultClient): void {
  server.registerTool(
    'list_machines',
    { description: "List the user's paired machines.", inputSchema: {} },
    async () => {
      const machines = await client.get('/api/v1/machines')
      return { content: [{ type: 'text', text: JSON.stringify(machines, null, 2) }] }
    },
  )

  server.registerTool(
    'rename_machine',
    { description: 'Rename a machine.', inputSchema: { id: z.string(), name: z.string() } },
    async ({ id, name }) => {
      const machine = await client.patch(`/api/v1/machines/${encodeURIComponent(id)}`, { name })
      return { content: [{ type: 'text', text: JSON.stringify(machine, null, 2) }] }
    },
  )

  server.registerTool(
    'delete_machine',
    { description: 'Unpair (delete) a machine.', inputSchema: { id: z.string() } },
    async ({ id }) => {
      await client.delete(`/api/v1/machines/${encodeURIComponent(id)}`)
      return { content: [{ type: 'text', text: `Unpaired machine ${id}.` }] }
    },
  )
}
