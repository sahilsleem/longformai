import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAllWorkers } from './workers';
import * as androidMedia from '../platform/androidMedia';

describe('checkAllWorkers Android vs Desktop behavior', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('proves that on native Android, checkAllWorkers returns ready native status without any fetch calls', async () => {
    vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const results = await checkAllWorkers();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(results).toHaveLength(4);
    expect(results.every((w) => w.isOnline && w.statusText === 'Ready')).toBe(true);
    expect(results.map((w) => w.url)).toEqual([
      'native://whisper',
      'native://blip',
      'native://minilm',
      'native://ffmpeg',
    ]);
  });

  it('proves that on desktop/browser (isNativeAndroid = false), checkAllWorkers calls fetch for all four ports', async () => {
    vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(false);
    const mockFetch = vi.fn().mockImplementation((_url: string) => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', state: 'ready' }),
      });
    });
    global.fetch = mockFetch;

    const results = await checkAllWorkers();

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8765/health', expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8766/health', expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8767/health', expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8768/health', expect.any(Object));
    expect(results).toHaveLength(4);
    expect(results.every((w) => w.isOnline)).toBe(true);
  });
});
