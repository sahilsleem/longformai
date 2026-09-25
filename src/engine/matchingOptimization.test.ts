import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkMatchingWorkerHealth,
  matchMediaForSegment,
  batchMatchMediaForSegments,
  clearMatchingCache,
} from './matching';
import { AudioSegment, MediaAsset } from '../types/project';
import { generateDraftTimeline } from './draftTimeline';

describe('Generate Draft Performance & Matching Optimization', () => {
  beforeEach(() => {
    clearMatchingCache();
    vi.restoreAllMocks();
  });

  const sampleMedia: MediaAsset[] = [
    {
      id: 'm-beach',
      name: 'beach_sunset.mp4',
      type: 'video',
      url: 'blob:http://localhost/beach',
      width: 1920,
      height: 1080,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      size: 1000000,
      duration: 10,
      createdAt: Date.now(),
      analysis: {
        analyzed: true,
        semantic: {
          analyzed: true,
          description: 'A person walking along a sandy beach under a golden sunset',
          tags: ['beach', 'sunset', 'ocean', 'sand'],
        },
      },
    },
    {
      id: 'm-city',
      name: 'city_traffic.mp4',
      type: 'video',
      url: 'blob:http://localhost/city',
      width: 1920,
      height: 1080,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      size: 1000000,
      duration: 10,
      createdAt: Date.now(),
      analysis: {
        analyzed: true,
        semantic: {
          analyzed: true,
          description: 'Busy downtown city street with rush hour cars and skyscrapers',
          tags: ['city', 'traffic', 'buildings'],
        },
      },
    },
  ];

  const sampleSegments: AudioSegment[] = [
    {
      id: 'seg-1',
      startTime: 0,
      endTime: 5,
      text: 'She took a quiet walk along the sunny beach during sunset.',
    },
    {
      id: 'seg-2',
      startTime: 5,
      endTime: 10,
      text: 'Afterwards, she drove through the busy city center in heavy traffic.',
    },
    {
      id: 'seg-3',
      startTime: 10,
      endTime: 15,
      text: 'She took a quiet walk along the sunny beach during sunset.', // Identical text to seg-1
    },
  ];

  it('1. checkMatchingWorkerHealth caches health status and avoids repeated /health network calls', async () => {
    let healthFetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/health')) {
        healthFetchCount++;
        return new Response(JSON.stringify({ status: 'ok', engine: 'onnx', model_loaded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    });

    const status1 = await checkMatchingWorkerHealth('http://127.0.0.1:8767');
    const status2 = await checkMatchingWorkerHealth('http://127.0.0.1:8767');
    const status3 = await checkMatchingWorkerHealth('http://127.0.0.1:8767');

    expect(status1.online).toBe(true);
    expect(status2.online).toBe(true);
    expect(status3.online).toBe(true);
    expect(healthFetchCount).toBe(1); // Cached across consecutive calls within TTL
  });

  it('2. matchMediaForSegment caches results in MATCH_CACHE on repeated identical calls', async () => {
    let matchCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return new Response(JSON.stringify({ status: 'ok', engine: 'onnx', model_loaded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/match')) {
        matchCalls++;
        return new Response(
          JSON.stringify({
            status: 'success',
            candidates: [{ mediaId: 'm-beach', mediaName: 'beach_sunset.mp4', score: 0.85, explanation: 'Match' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    const seg = sampleSegments[0];
    const res1 = await matchMediaForSegment(seg, sampleMedia);
    const res2 = await matchMediaForSegment(seg, sampleMedia);
    const res3 = await matchMediaForSegment(seg, sampleMedia);

    expect(res1.status).toBe('success');
    expect(res2.status).toBe('success');
    expect(res3.status).toBe('success');
    expect(matchCalls).toBe(1); // Only 1 network request made, 2 served from cache
  });

  it('3. batchMatchMediaForSegments batches multiple segments in a single network request', async () => {
    let batchCalls = 0;
    let singleCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return new Response(JSON.stringify({ status: 'ok', engine: 'onnx', model_loaded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/match/batch')) {
        batchCalls++;
        const body = JSON.parse(opts.body);
        return new Response(
          JSON.stringify({
            status: 'success',
            results: body.segments.map((s: any) => ({
              segmentId: s.id,
              segmentText: s.text,
              candidates: [
                { mediaId: 'm-beach', mediaName: 'beach_sunset.mp4', score: 0.80, explanation: 'Batch match' },
              ],
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/match')) {
        singleCalls++;
        return new Response(JSON.stringify({ status: 'success', candidates: [] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const results = await batchMatchMediaForSegments(sampleSegments, sampleMedia);

    expect(results.size).toBe(3);
    expect(batchCalls).toBe(1); // All 3 segments processed in 1 batch network request
    expect(singleCalls).toBe(0);

    // Subsequent individual matchMediaForSegment calls for these segments hit cache with 0 network calls
    const resSeg1 = await matchMediaForSegment(sampleSegments[0], sampleMedia);
    expect(resSeg1.candidates[0].score).toBe(0.80);
    expect(batchCalls).toBe(1);
    expect(singleCalls).toBe(0);
  });

  it('4. generateDraftTimeline runs efficiently and completes full pipeline with pre-matched caching', async () => {
    let batchPostCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return new Response(JSON.stringify({ status: 'ok', engine: 'onnx', model_loaded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/match/batch')) {
        batchPostCount++;
        const body = JSON.parse(opts.body);
        return new Response(
          JSON.stringify({
            status: 'success',
            results: body.segments.map((s: any) => ({
              segmentId: s.id,
              segmentText: s.text,
              candidates: [
                {
                  mediaId: s.text.includes('city') ? 'm-city' : 'm-beach',
                  mediaName: s.text.includes('city') ? 'city_traffic.mp4' : 'beach_sunset.mp4',
                  score: 0.75,
                  explanation: 'Strong semantic match',
                },
              ],
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    const result = await generateDraftTimeline(sampleSegments, sampleMedia);

    expect(result.timeline.length).toBeGreaterThan(0);
    expect(result.stats.assignedSegments).toBeGreaterThan(0);
    expect(batchPostCount).toBe(1); // Exactly 1 batch match call was made for the entire timeline draft
  });
});
