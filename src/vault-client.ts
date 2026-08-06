export class VaultApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Thin HTTP client — every call forwards the end user's own API key as a
// Bearer token and passes the vault API's error message through verbatim
// (never swallowed), so a tool caller can explain the real failure.
export class VaultClient {
  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://vault.norc.app',
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.status === 204) return undefined as T
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new VaultApiError((data as { error?: string }).error ?? `request failed (${res.status})`, res.status)
    }
    return data as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }
  delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path)
  }
}
