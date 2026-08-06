import { describe, it, expect } from 'vitest'
import { VaultClient } from './vault-client.js'

// Opt-in only — needs a real staging API key. Run with:
//   NORC_SMOKE_API_KEY=norc_sk_... pnpm test -- smoke
const apiKey = process.env.NORC_SMOKE_API_KEY
describe.skipIf(!apiKey)('smoke: real vault API', () => {
  it('lists jobs without error', async () => {
    const client = new VaultClient(apiKey!, process.env.NORC_VAULT_URL ?? 'https://vault.norc.app')
    const jobs = await client.get('/api/v1/jobs')
    expect(Array.isArray(jobs)).toBe(true)
  })
})
