/**
 * Server-side proxy to frm-api. API key never reaches the browser.
 */

function apiBaseUrl(): string {
  const base = process.env.FRM_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('FRM_API_BASE_URL is not configured');
  }
  return base;
}

function apiHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const key = process.env.FRM_COMMERCIAL_VIEWER_API_KEY?.trim();
  if (key) h.set('Authorization', `Bearer ${key}`);
  return h;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = apiHeaders(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, {
    ...init,
    headers,
    cache: 'no-store'
  });
}
