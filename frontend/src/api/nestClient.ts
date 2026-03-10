import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';

/**
 * Pre-configured Axios instance for all backend API calls.
 *
 * Base URL is read from the VITE_API_URL environment variable
 * which must be defined in infra/.env (and exposed to the frontend
 * via Vite's import.meta.env).
 *
 * Every React Query hook should import this client instead of
 * calling bare axios.get / axios.post.
 */
const baseURL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:4000';

const nestClient: AxiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 10_000,
});

/* ── Response-error interceptor ───────────────────────────────── */
nestClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // TODO: Add global error handling (e.g. toast notifications, auth redirect on 401)
    console.error(
      `[nestClient] ${error.config?.method?.toUpperCase()} ${error.config?.url} → ${String(error.response?.status ?? 'NETWORK_ERROR')}`,
    );
    return Promise.reject(error);
  },
);

export { nestClient };
