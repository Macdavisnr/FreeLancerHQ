/*
 * The one place the frontend talks to the backend.
 * Every service file calls api(...) instead of using fetch directly, so
 * the base URL, JSON handling, auth header and error handling live here only.
 */

const TOKEN_KEY = 'freelancehq.token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Send a request with the auth header; throws ApiError for anything that isn't a 2xx. */
async function request(path: string, options: { method?: string; body?: unknown } = {}): Promise<Response> {
  const token = tokenStore.get()
  // A FormData body (file upload) is sent as-is: the browser writes the multipart
  // Content-Type itself, including the "boundary" that separates the parts.
  const isForm = options.body instanceof FormData

  // In dev, Vite forwards /api/* to the Express server (see vite.config.ts).
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: isForm ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }).catch(() => {
    throw new ApiError(0, 'Cannot reach the server. Is it running?')
  })

  // 502/503/504 come from the dev proxy (or a host) when the API itself is down or unreachable.
  if ([502, 503, 504].includes(response.status)) {
    throw new ApiError(
      response.status,
      'Cannot reach the server. Make sure the API is running (yarn dev:server).',
    )
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new ApiError(response.status, data.error ?? 'Something went wrong.')
  }
  return response
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await request(path, options)
  return (await response.json().catch(() => ({}))) as T
}

/**
 * Fetch a file (not JSON). A plain <a href> can't send our Authorization header,
 * so downloads go through fetch and come back as a Blob.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const response = await request(path)
  return response.blob()
}
