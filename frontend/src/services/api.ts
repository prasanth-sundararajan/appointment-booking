import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from '@/lib/env';
import type { ApiError, ApiErrorBody, TokenResponse } from '@/types';

// ---------------------------------------------------------------------------
// Access token lives in memory only. The refresh token is an httpOnly cookie
// set by the backend, so it is sent automatically with `withCredentials`.
// ---------------------------------------------------------------------------

let accessToken: string | null = null;
type TokenListener = (token: string | null) => void;
const tokenListeners = new Set<TokenListener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  tokenListeners.forEach((listener) => listener(token));
}

/** Subscribe to token changes (e.g. AuthContext logs the user out when refresh fails). */
export function onAccessTokenChange(listener: TokenListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

export const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    config.headers = headers;
  }
  return config;
});

// ---------- Refresh handling ----------

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let refreshPromise: Promise<string | null> | null = null;

/** POST /auth/refresh once; concurrent callers share the same in-flight request. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<TokenResponse>(`${env.apiUrl}/auth/refresh`, null, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.access_token);
        return data.access_token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(toApiError(error));
    }
    const config = error.config as RetryableConfig;
    const url = config.url ?? '';
    const shouldRefresh =
      error.response?.status === 401 &&
      !config._retry &&
      !NO_REFRESH_PATHS.some((path) => url.includes(path));

    if (shouldRefresh) {
      config._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        return api(config);
      }
    }
    return Promise.reject(toApiError(error));
  },
);

// ---------- Error normalisation ----------

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'message' in value &&
    'fieldErrors' in value
  );
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;

  if (error instanceof AxiosError) {
    const status = error.response?.status ?? 0;
    const body = error.response?.data as ApiErrorBody | undefined;
    const fieldErrors: Record<string, string> = {};
    let message = status === 0 ? 'Network error. Please check your connection.' : error.message;
    let code: string | null = body?.code ?? null;

    const detail = body?.detail;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      detail.forEach((item) => {
        const field = item.loc.filter((part) => part !== 'body').join('.');
        fieldErrors[field || 'non_field'] = item.msg;
      });
      message = detail[0]?.msg ?? 'Validation error';
    } else if (detail && typeof detail === 'object') {
      code = detail.code ?? code;
      message = detail.message ?? message;
    } else if (body?.message) {
      message = body.message;
    }

    return { status, code, message, fieldErrors };
  }

  return {
    status: 0,
    code: null,
    message: error instanceof Error ? error.message : 'Unexpected error',
    fieldErrors: {},
  };
}

// ---------- Typed helpers ----------

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.get<T>(url, config);
  return data;
}

export async function post<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.post<T>(url, body, config);
  return data;
}

export async function put<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.put<T>(url, body, config);
  return data;
}

export async function patch<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.patch<T>(url, body, config);
  return data;
}

export async function del<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.delete<T>(url, config);
  return data;
}

export default api;
