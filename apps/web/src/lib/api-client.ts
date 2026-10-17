import type { ApiError, ApiErrorDetail, ErrorCode, PaginationMeta } from '@bookleaf/contracts';

/**
 * Typed fetch wrapper for the Express API.
 * - Sends the session cookie (credentials: 'include').
 * - Adds the CSRF token to every mutation.
 * - Unwraps the `{ success, data }` envelope and throws `ApiClientError` otherwise.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);
const API_BASE = `${API_URL}/api/v1`;

let csrfToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Registered by the auth provider to redirect to /login when a session expires. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    public readonly details: ApiErrorDetail[] = [],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length) url.searchParams.set(key, value.join(','));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: { query?: Query; body?: unknown } = {},
): Promise<{ data: T; meta?: PaginationMeta }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'include',
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
    });
  } catch {
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the BookLeaf server. Check your connection and try again.',
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || (payload as { success?: boolean }).success !== true) {
    const err = (payload as ApiError | null)?.error;
    const code = err?.code ?? 'INTERNAL_ERROR';
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthenticated?.();
    throw new ApiClientError(
      response.status,
      code,
      err?.message ?? `Request failed (${response.status})`,
      err?.details ?? [],
      err?.requestId,
    );
  }
  const body = payload as { data: T; meta?: PaginationMeta };
  return { data: body.data, meta: body.meta };
}

export interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

export const api = {
  get: async <T>(path: string, query?: Query) => (await request<T>('GET', path, { query })).data,
  getPage: async <T>(path: string, query?: Query): Promise<Page<T>> => {
    const res = await request<T[]>('GET', path, { query });
    return {
      items: res.data,
      meta: res.meta ?? {
        page: 1,
        pageSize: res.data.length,
        total: res.data.length,
        totalPages: 1,
      },
    };
  },
  post: async <T>(path: string, body?: unknown) => (await request<T>('POST', path, { body })).data,
  patch: async <T>(path: string, body?: unknown) =>
    (await request<T>('PATCH', path, { body })).data,
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
