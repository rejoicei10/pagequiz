import { getAuthToken } from 'deepspace'

export type ActionResponse<T> = { success: true; data: T } | { success: false; error: string; code?: string }

/** Calls a server action from src/actions/. Never throws; network errors come back as failures. */
export async function callAction<T = unknown>(
  name: string,
  params: Record<string, unknown>,
): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'Please sign in first.', code: 'signed_out' }
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    if (res.status === 401) return { success: false, error: 'Your session expired. Sign in again.', code: 'signed_out' }
    const body = (await res.json()) as ActionResponse<T>
    if (!body || typeof body !== 'object') return { success: false, error: 'Unexpected server reply.' }
    return body
  } catch {
    return { success: false, error: "Couldn't reach the server. Check your connection.", code: 'network' }
  }
}
