const DEFAULT_API_URL = 'http://localhost:8000';

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function deriveWsUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws');
}

const apiUrl = stripTrailingSlash(import.meta.env.VITE_API_URL || DEFAULT_API_URL);
const wsUrl = stripTrailingSlash(import.meta.env.VITE_WS_URL || deriveWsUrl(apiUrl));

export const env = {
  apiUrl,
  wsUrl,
  isProd: import.meta.env.PROD,
} as const;
