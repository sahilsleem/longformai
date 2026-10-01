import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRenderWorkerHealth } from './render';
import * as androidMedia from '../platform/androidMedia';

// Mock the androidMedia module
vi.mock('../platform/androidMedia', () => ({
  isNativeAndroid: vi.fn(),
}));

describe('checkRenderWorkerHealth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('Android: checkRenderWorkerHealth() -> ffmpegAvailable === true without fetch', async () => {
    // Mock as Android
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(true);

    const health = await checkRenderWorkerHealth();

    expect(health).toEqual({
      status: 'ok',
      service: 'android-native-renderer',
      engine: 'ffmpegkit',
      ffmpegAvailable: true,
    });
  });

  it('Desktop/browser: existing Python worker health behavior remains unchanged', async () => {
    // Mock as Desktop/Browser
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(false);

    // Mock global fetch to simulate Python worker response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        service: 'python-render-worker',
        engine: 'ffmpeg',
        ffmpegAvailable: true,
      }),
    });

    const health = await checkRenderWorkerHealth('http://127.0.0.1:8765');

    expect(health).toEqual({
      status: 'ok',
      service: 'python-render-worker',
      engine: 'ffmpeg',
      ffmpegAvailable: true,
    });
    
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:8765/health', { method: 'GET' });
  });

  it('Desktop/browser: handles offline Python worker correctly', async () => {
    // Mock as Desktop/Browser
    vi.mocked(androidMedia.isNativeAndroid).mockReturnValue(false);

    // Mock global fetch to simulate offline
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const health = await checkRenderWorkerHealth('http://127.0.0.1:8765');

    expect(health).toBeNull();
  });
});
