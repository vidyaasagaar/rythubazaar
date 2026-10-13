/** Thin fetch wrapper: same-origin cookies, CSRF header, consistent error objects. */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
  }
  /** Field-path → server message, for highlighting invalid inputs. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as { path?: string; message?: string }[]) {
      if (d.path && !out[d.path]) out[d.path] = d.message ?? 'Invalid';
    }
    return out;
  }
}

let csrfToken: string | null = null;

async function fetchCsrf(): Promise<string> {
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!res.ok) throw await toError(res);
  csrfToken = ((await res.json()) as { data: { csrfToken: string } }).data.csrfToken;
  return csrfToken;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code: string; message: string; details?: unknown; requestId?: string };
    };
    if (body.error)
      return new ApiError(
        res.status,
        body.error.code,
        body.error.message,
        body.error.details,
        body.error.requestId,
      );
  } catch {
    /* non-JSON */
  }
  return new ApiError(res.status, res.status >= 500 ? 'INTERNAL_ERROR' : 'NOT_FOUND', res.statusText);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  keepalive?: boolean;
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
  retried = false,
): Promise<{ data: T; meta?: PageMeta }> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken ?? (await fetchCsrf());
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
      keepalive: opts.keepalive,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Network request failed');
  }
  if (!res.ok) {
    const error = await toError(res);
    if (error.code === 'CSRF_FAILED' && !retried) {
      await fetchCsrf();
      return request<T>(path, opts, true);
    }
    throw error;
  }
  return (await res.json()) as { data: T; meta?: PageMeta };
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }).then((r) => r.data),
  page: <T>(path: string, signal?: AbortSignal) =>
    request<T[]>(path, { signal }) as Promise<{ data: T[]; meta: PageMeta }>,
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: body ?? {}, headers }).then((r) => r.data),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }).then((r) => r.data),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }).then((r) => r.data),
  /** Called after login/logout because the server rotates the CSRF cookie. */
  refreshCsrf: () => fetchCsrf(),
};

/** Download an export with cookies, then hand the file to the browser. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw await toError(res);
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
