export async function checkHealth(signal: AbortSignal): Promise<void> {
  let baseURL = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_BASE_URL : '';

  if (typeof window !== 'undefined' && window.location) {
    const isLocalhostHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (baseURL && typeof baseURL === 'string') {
      const isEnvLocalhost = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
      if (isEnvLocalhost && !isLocalhostHost) {
        baseURL = '';
      }
    }
  }

  let healthUrl = '/health';
  if (baseURL && typeof baseURL === 'string') {
    const clean = baseURL.trim().replace(/\/+$/, '');
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      try {
        const u = new URL(clean);
        healthUrl = `${u.origin}/health`;
      } catch {
        healthUrl = '/health';
      }
    }
  }

  const response = await fetch(healthUrl, { signal });
  if (!response.ok) throw new Error('Backend unavailable');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'ok') {
    throw new Error('Unexpected health response');
  }
}
