import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { matchMediaForSegment } from './matching';
import { AudioSegment, MediaAsset } from '../types/project';

describe('Matching Response Deserialization', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('preserves bestKeyframeTime from API response during mapping', async () => {
    const mockSegment: AudioSegment = {
      id: 'seg1',
      startTime: 0,
      endTime: 5,
      text: 'This is a test beat',
      words: []
    };

    const mockAsset: MediaAsset = {
      id: 'vid1',
      name: 'test.mp4',
      type: 'video',
      url: 'test.mp4',
      width: 1920,
      height: 1080,
      aspectRatio: 1.77,
      aspectRatioLabel: '16:9 Native',
      duration: 50.0,
      createdAt: Date.now()
    };

    // Mock fetch for both health check and matching request
    globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      const urlString = url.toString();
      if (urlString.endsWith('/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'ready', state: 'ready' })
        } as Response;
      }
      if (urlString.endsWith('/match')) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            candidates: [
              {
                mediaId: 'vid1',
                mediaName: 'test.mp4',
                score: 0.85,
                explanation: 'Test explanation',
                matchedSnippet: 'Test snippet',
                bestKeyframeTime: 13.18
              }
            ]
          })
        } as Response;
      }
      return { ok: false } as Response;
    });

    const result = await matchMediaForSegment(mockSegment, [mockAsset], { forceRefresh: true });

    expect(result.status).toBe('success');
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].mediaId).toBe('vid1');
    expect(result.candidates[0].score).toBe(0.85);
    // CRITICAL: The bestKeyframeTime must survive deserialization
    expect(result.candidates[0].bestKeyframeTime).toBe(13.18);
  });
});
