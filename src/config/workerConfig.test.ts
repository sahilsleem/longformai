import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WORKER_PORTS,
  DEFAULT_HOST,
  getWorkerHost,
  getTranscriptionWorkerUrl,
  getVisionWorkerUrl,
  getMatchingWorkerUrl,
  getRenderWorkerUrl,
} from './workerConfig';

declare const process: any;

describe('Worker Centralized Configuration', () => {
  const originalEnv = process.env.VITE_WORKER_HOST;

  beforeEach(() => {
    delete process.env.VITE_WORKER_HOST;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VITE_WORKER_HOST = originalEnv;
    } else {
      delete process.env.VITE_WORKER_HOST;
    }
  });

  it('proves default host is 127.0.0.1 when no environment variable or override is provided', () => {
    expect(DEFAULT_HOST).toBe('127.0.0.1');
    expect(getWorkerHost()).toBe('127.0.0.1');
  });

  it('proves ports remain exactly 8765, 8766, 8767, and 8768', () => {
    expect(WORKER_PORTS.TRANSCRIPTION).toBe(8765);
    expect(WORKER_PORTS.VISION).toBe(8766);
    expect(WORKER_PORTS.MATCHING).toBe(8767);
    expect(WORKER_PORTS.RENDERING).toBe(8768);
  });

  it('proves default URLs for all four workers use 127.0.0.1 and exact ports', () => {
    expect(getTranscriptionWorkerUrl()).toBe('http://127.0.0.1:8765');
    expect(getVisionWorkerUrl()).toBe('http://127.0.0.1:8766');
    expect(getMatchingWorkerUrl()).toBe('http://127.0.0.1:8767');
    expect(getRenderWorkerUrl()).toBe('http://127.0.0.1:8768');
  });

  it('proves configured host 192.168.1.82 via VITE_WORKER_HOST updates all four worker URLs', () => {
    process.env.VITE_WORKER_HOST = '192.168.1.82';

    expect(getWorkerHost()).toBe('192.168.1.82');
    expect(getTranscriptionWorkerUrl()).toBe('http://192.168.1.82:8765');
    expect(getVisionWorkerUrl()).toBe('http://192.168.1.82:8766');
    expect(getMatchingWorkerUrl()).toBe('http://192.168.1.82:8767');
    expect(getRenderWorkerUrl()).toBe('http://192.168.1.82:8768');
  });

  it('proves custom override host parameter takes precedence over environment variable', () => {
    process.env.VITE_WORKER_HOST = '192.168.1.82';

    expect(getWorkerHost('10.0.0.50')).toBe('10.0.0.50');
    expect(getTranscriptionWorkerUrl('10.0.0.50')).toBe('http://10.0.0.50:8765');
    expect(getVisionWorkerUrl('10.0.0.50')).toBe('http://10.0.0.50:8766');
    expect(getMatchingWorkerUrl('10.0.0.50')).toBe('http://10.0.0.50:8767');
    expect(getRenderWorkerUrl('10.0.0.50')).toBe('http://10.0.0.50:8768');
  });

  it('proves window.location.hostname is used when no VITE_WORKER_HOST is set', () => {
    (globalThis as any).window = {
      location: {
        hostname: '100.91.141.9',
      },
    };

    try {
      expect(getWorkerHost()).toBe('100.91.141.9');
      expect(getVisionWorkerUrl()).toBe('http://100.91.141.9:8766');
    } finally {
      delete (globalThis as any).window;
    }
  });
});
