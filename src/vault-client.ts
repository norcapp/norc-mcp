export class VaultApiError extends Error {
  status: number
  requestId?: string
  constructor(message: string, status: number, requestId?: string) {
    super(requestId ? `${message} (request id: ${requestId})` : message)
    this.status = status
    this.requestId = requestId
  }
}

// Stable messages only: upstream error text is never forwarded to the model.
function stableMessage(status: number): string {
  if (status === 400) return 'Norc rejected the request as invalid'
  if (status === 401) return 'Norc rejected the API key (invalid, revoked or expired)'
  if (status === 403) return 'Norc refused the request: the API key may be read-only, or the feature is unavailable for this account'
  if (status === 404) return 'Not found'
  if (status === 409) return 'A matching request is already in progress'
  if (status === 429) return 'Rate limited by Norc; try again shortly'
  return 'Norc service error'
}

export const DEFAULT_TIMEOUT_MS = 15_000

// Thin HTTP client: every call forwards the end user's own API key as a Bearer token.
// No retries, so a write is sent at most once per tool call.
export class VaultClient {
  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://vault.norc.app',
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  private async send(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ data: unknown; headers: Headers }> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...extra },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      throw new VaultApiError(timedOut ? 'Norc did not respond in time' : 'Could not reach Norc', 0)
    }
    if (res.status === 204) return { data: undefined, headers: res.headers }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const rid = (data as { request_id?: unknown }).request_id
      throw new VaultApiError(stableMessage(res.status), res.status, typeof rid === 'string' && /^[\w-]{1,64}$/.test(rid) ? rid : undefined)
    }
    return { data, headers: res.headers }
  }

  async get<T>(path: string): Promise<T> {
    return (await this.send('GET', path)).data as T
  }
  // List endpoints return the next page cursor in the x-next-cursor header.
  async getPage<T>(path: string): Promise<{ data: T; nextCursor: string | null }> {
    const { data, headers } = await this.send('GET', path)
    const next = headers.get('x-next-cursor')
    return { data: data as T, nextCursor: next && /^[\w-]{1,255}$/.test(next) ? next : null }
  }
  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return (await this.send('POST', path, body, headers)).data as T
  }
  async patch<T>(path: string, body: unknown): Promise<T> {
    return (await this.send('PATCH', path, body)).data as T
  }
  async delete(path: string): Promise<void> {
    await this.send('DELETE', path)
  }
}
