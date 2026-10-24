import { ApiError, ApiResponse } from '../types';

/** true = run on the in-memory mock data (no backend needed). Set VITE_USE_MOCK_API=true in .env.local. */
export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';

const API_BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/v1`;

const ACCESS_KEY = 'dentassist.accessToken';
const REFRESH_KEY = 'dentassist.refreshToken';

/** Fired when the session can no longer be refreshed; AuthContext listens and signs the user out. */
export const SESSION_EXPIRED_EVENT = 'dentassist:session-expired';

// ---------- Token storage (browser storage can be unavailable, e.g. private mode) ----------

let memoryTokens: { access: string | null; refresh: string | null } = { access: null, refresh: null };

function storage(remember: boolean): Storage | null {
  try {
    return remember ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get access(): string | null {
    return memoryTokens.access ?? readKey(ACCESS_KEY);
  },
  get refresh(): string | null {
    return memoryTokens.refresh ?? readKey(REFRESH_KEY);
  },
  set(access: string, refresh: string, remember = true) {
    memoryTokens = { access, refresh };
    tokenStore.clearStorage();
    const s = storage(remember);
    try {
      s?.setItem(ACCESS_KEY, access);
      s?.setItem(REFRESH_KEY, refresh);
    } catch {
      /* keep tokens in memory only */
    }
  },
  /** Keep the same storage location (local vs session) when tokens are refreshed. */
  update(access: string, refresh: string) {
    memoryTokens = { access, refresh };
    for (const s of [storage(true), storage(false)]) {
      try {
        if (s?.getItem(REFRESH_KEY)) {
          s.setItem(ACCESS_KEY, access);
          s.setItem(REFRESH_KEY, refresh);
        }
      } catch {
        /* ignore */
      }
    }
  },
  clear() {
    memoryTokens = { access: null, refresh: null };
    tokenStore.clearStorage();
  },
  clearStorage() {
    for (const s of [storage(true), storage(false)]) {
      try {
        s?.removeItem(ACCESS_KEY);
        s?.removeItem(REFRESH_KEY);
      } catch {
        /* ignore */
      }
    }
  },
};

function readKey(key: string): string | null {
  for (const s of [storage(true), storage(false)]) {
    try {
      const v = s?.getItem(key);
      if (v) return v;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ---------- Requests ----------

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Skip the Authorization header (login / refresh). */
  anonymous?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = tokenStore.refresh;
  if (!refresh) return false;
  // Several requests may fail at once; share one refresh call.
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      tokenStore.update(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshInFlight = null), 0);
    }
  })();
  return refreshInFlight;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.access;
  if (!opts.anonymous && token) headers.Authorization = `Bearer ${token}`;
  return fetch(buildUrl(path, opts.query), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string') {
      return { message: body.message, code: body.code || `HTTP_${res.status}`, fieldErrors: body.fieldErrors };
    }
  } catch {
    /* non-JSON error */
  }
  return { message: `Request failed (${res.status})`, code: `HTTP_${res.status}` };
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  try {
    let res = await send(method, path, opts);

    if (res.status === 401 && !opts.anonymous) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        res = await send(method, path, opts);
      } else {
        tokenStore.clear();
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }

    if (!res.ok) {
      return { data: null, error: await toError(res), loading: false };
    }
    const data = res.status === 204 ? (true as unknown as T) : ((await res.json()) as T);
    return { data, error: null, loading: false };
  } catch {
    return {
      data: null,
      error: {
        message: 'Cannot reach the DentAssist server. Check that the backend is running.',
        code: 'NETWORK_ERROR',
      },
      loading: false,
    };
  }
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, { body: body ?? {}, query }),
  patch: <T>(path: string, body?: unknown, query?: Query) => request<T>('PATCH', path, { body: body ?? {}, query }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string, query?: Query) => request<T>('DELETE', path, { query }),
  anonymousPost: <T>(path: string, body: unknown) => request<T>('POST', path, { body, anonymous: true }),
};
