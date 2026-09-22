/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
