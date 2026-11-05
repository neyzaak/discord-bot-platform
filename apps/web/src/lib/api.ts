export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: Array<{ message: string }> };
    const details = Array.isArray(body.details) ? `: ${body.details.map((d) => d.message).join(', ')}` : '';
    throw new ApiError(`${body.error ?? `HTTP ${res.status}`}${details}`, res.status);
  }
  return res.json() as Promise<T>;
}
