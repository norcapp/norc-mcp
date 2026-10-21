import { describe, it, expect } from 'vitest'
import { extractApiKey, wantsStdio } from './server.js'

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

describe('wantsStdio', () => {
  it('is stdio when NORC_API_KEY is set or --stdio is passed', () => {
    expect(wantsStdio({ NORC_API_KEY: 'norc_sk_x' }, [])).toBe(true)
    expect(wantsStdio({}, ['--stdio'])).toBe(true)
  })
  it('is http otherwise', () => {
    expect(wantsStdio({}, [])).toBe(false)
  })
})
