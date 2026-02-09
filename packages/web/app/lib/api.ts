const API_BASE = typeof window === 'undefined'
  ? 'http://localhost:3000'
  : ''

export async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
    },
  })
  return res.json()
}
