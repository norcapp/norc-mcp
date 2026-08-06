import { describe, it, expect } from 'vitest'
import { extractApiKey } from './server.js'

describe('extractApiKey', () => {
  it('extracts a norc_sk_ key from a Bearer header', () => {
    const headers = new Headers({ authorization: 'Bearer norc_sk_abc123' })
    expect(extractApiKey(headers)).toBe('norc_sk_abc123')
  })

  it('returns null when missing or malformed', () => {
    expect(extractApiKey(new Headers())).toBeNull()
    expect(extractApiKey(new Headers({ authorization: 'Bearer not-a-key' }))).toBeNull()
  })
})
