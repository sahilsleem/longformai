/**
 * LongFormAI - Centralized Worker Configuration
 * Resolves worker host dynamically via VITE_WORKER_HOST environment variable,
 * defaulting to 127.0.0.1 for local/desktop execution.
 */

declare const process: any;

export const WORKER_PORTS = {
  TRANSCRIPTION: 8765,
  VISION: 8766,
  MATCHING: 8767,
  RENDERING: 8768,
} as const;

export const DEFAULT_HOST = '127.0.0.1';

/**
 * Returns the configured worker host.
 * Priority: customHost override > import.meta.env.VITE_WORKER_HOST > window.location.hostname > '127.0.0.1'
 */
export function getWorkerHost(customHost?: string): string {
  if (customHost && customHost.trim()) {
    return customHost.trim();
  }

  // 1. Vite browser / bundling environment
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WORKER_HOST) {
      const viteHost = String(import.meta.env.VITE_WORKER_HOST).trim();
      if (viteHost) return viteHost;
    }
  } catch {
    // Ignore context where import.meta is unavailable
  }

  // 2. Node.js / test environment
  try {
    if (typeof process !== 'undefined' && process.env && process.env.VITE_WORKER_HOST) {
      const nodeHost = String(process.env.VITE_WORKER_HOST).trim();
      if (nodeHost) return nodeHost;
    }
  } catch {
    // Ignore context where process.env is unavailable
  }

  // 3. Browser window location hostname
  try {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const browserHost = window.location.hostname.trim();
      if (browserHost) return browserHost;
    }
  } catch {
    // Ignore context where window is unavailable
  }

  return DEFAULT_HOST;
}

/**
 * Constructs a full worker base URL for a given port.
 */
export function getWorkerUrl(port: number, customHost?: string): string {
  const host = getWorkerHost(customHost);
  return `http://${host}:${port}`;
}

export function getTranscriptionWorkerUrl(customHost?: string): string {
  return getWorkerUrl(WORKER_PORTS.TRANSCRIPTION, customHost);
}

export function getVisionWorkerUrl(customHost?: string): string {
  return getWorkerUrl(WORKER_PORTS.VISION, customHost);
}

export function getMatchingWorkerUrl(customHost?: string): string {
  return getWorkerUrl(WORKER_PORTS.MATCHING, customHost);
}

export function getRenderWorkerUrl(customHost?: string): string {
  return getWorkerUrl(WORKER_PORTS.RENDERING, customHost);
}

export const DEFAULT_WORKER_HOST = getWorkerHost();
export const DEFAULT_TRANSCRIPTION_WORKER_URL = getTranscriptionWorkerUrl();
export const DEFAULT_VISION_WORKER_URL = getVisionWorkerUrl();
export const DEFAULT_MATCHING_WORKER_URL = getMatchingWorkerUrl();
export const DEFAULT_RENDER_WORKER_URL = getRenderWorkerUrl();
