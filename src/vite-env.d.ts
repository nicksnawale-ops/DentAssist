/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API. Leave empty to use the Vite dev proxy (/api -> localhost:8000). */
  readonly VITE_API_URL?: string;
  /** "true" runs the app on the built-in mock data with no backend. */
  readonly VITE_USE_MOCK_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
