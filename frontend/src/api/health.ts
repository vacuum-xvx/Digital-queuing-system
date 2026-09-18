export async function checkHealth(signal: AbortSignal): Promise<void> {
  const baseURL = import.meta.env.VITE_API_BASE_URL;
  const response = await fetch(`${(baseURL || '').replace(/\/$/, '')}/health`, { signal });
  if (!response.ok) throw new Error('Backend unavailable');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'ok') {
    throw new Error('Unexpected health response');
  }
}
