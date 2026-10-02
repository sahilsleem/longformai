import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as androidMedia from '../platform/androidMedia';
import { NativeBlip } from './NativeBlip';
import {
  checkVisionWorkerHealth,
  analyzeKeyframesSemantics,
  extractTagsFromText,
  aggregateTemporalTags,
  buildTemporalSummary,
} from './vision';
import { MediaKeyframe } from '../types/project';

vi.mock('./NativeBlip', () => {
  const mockPlugin = {
    isReady: vi.fn(),
    initialize: vi.fn(),
    generateCaption: vi.fn(),
  };
  return {
    NativeBlip: mockPlugin,
    default: mockPlugin,
  };
});


describe('Vision Engine & Android Native BLIP Routing', () => {
  const sampleKeyframes: MediaKeyframe[] = [
    {
      time: 0.0,
      imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      isKeyMoment: true,
    },
    {
      time: 2.5,
      imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      isKeyMoment: false,
    },
  ];

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Tag & Summary Logic', () => {
    it('extracts semantic tags filtering stopwords', () => {
      const tags = extractTagsFromText('A cat and a dog sitting on the brown grass.');
      expect(tags).toEqual(['cat', 'dog', 'sitting', 'brown', 'grass']);
      expect(tags).not.toContain('and');
      expect(tags).not.toContain('the');
      expect(tags).not.toContain('on');
    });

    it('aggregates temporal tags across frames', () => {
      const allTags = [
        ['cat', 'grass', 'outdoor'],
        ['cat', 'running', 'outdoor'],
        ['dog', 'outdoor'],
      ];
      const aggregated = aggregateTemporalTags(allTags);
      expect(aggregated[0]).toBe('outdoor'); // Frequency 3
      expect(aggregated[1]).toBe('cat');     // Frequency 2
      expect(aggregated.length).toBeLessThanOrEqual(10);
    });

    it('builds a coherent temporal summary for video', () => {
      const summary = buildTemporalSummary([
        { description: 'A cat sitting on the grass' },
        { description: 'A cat running towards the camera' },
        { description: 'A cat lying down' },
      ]);
      expect(summary).toBe(
        'Video sequence showing a cat sitting on the grass; later a cat running towards the camera; later a cat lying down.'
      );
    });
  });

  describe('Android Routing & Verification', () => {
    it('1 & 2. Android Media Intelligence uses NativeBlip and never calls localhost:8766', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as any;

      vi.mocked(NativeBlip.isReady).mockResolvedValue({ ready: true, state: 'ready' });
      vi.mocked(NativeBlip.generateCaption)
        .mockResolvedValueOnce({
          status: 'success',
          caption: 'A cat sitting in the garden',
          encoderDurationMs: 200,
          decoderDurationMs: 400,
          totalDurationMs: 600,
          tokenCount: 7,
        })
        .mockResolvedValueOnce({
          status: 'success',
          caption: 'A cat playing with a toy',
          encoderDurationMs: 200,
          decoderDurationMs: 400,
          totalDurationMs: 600,
          tokenCount: 7,
        });

      const result = await analyzeKeyframesSemantics(sampleKeyframes, true, 5.0);

      // Verify fetch was NEVER called
      expect(fetchSpy).not.toHaveBeenCalled();

      // Verify NativeBlip was called for each keyframe
      expect(NativeBlip.generateCaption).toHaveBeenCalledTimes(2);
      expect(NativeBlip.generateCaption).toHaveBeenCalledWith({ imageData: sampleKeyframes[0].imageData! });
      expect(NativeBlip.generateCaption).toHaveBeenCalledWith({ imageData: sampleKeyframes[1].imageData! });

      // Verify result
      expect(result.analyzed).toBe(true);
      expect(result.modelUsed).toContain('Native Android');
    });

    it('3. Browser/desktop still uses the Python worker on 127.0.0.1:8766', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(false);
      const mockResponse = {
        status: 'success',
        description: 'Desktop vision caption',
        tags: ['desktop', 'vision'],
        ocrText: 'Sample OCR',
        ocrConfidence: 0.95,
        keyframeDescriptions: [
          { time: 0.0, description: 'Frame 1', tags: ['desktop'], isKeyMoment: true },
        ],
        temporalSummary: 'Desktop summary',
        hasVisualChange: false,
        visualChanges: [],
        modelUsed: 'Salesforce/blip-image-captioning-base',
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      globalThis.fetch = fetchSpy as any;

      const result = await analyzeKeyframesSemantics([sampleKeyframes[0]], false, 0);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl] = fetchSpy.mock.calls[0];
      expect(calledUrl).toContain(':8766/analyze-media');
      expect(result.description).toBe('Desktop vision caption');
    });

    it('4 & 5. Native captions become keyframe descriptions with correct timestamps and valid shape', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);
      vi.mocked(NativeBlip.isReady).mockResolvedValue({ ready: true, state: 'ready' });
      vi.mocked(NativeBlip.generateCaption)
        .mockResolvedValueOnce({
          status: 'success',
          caption: 'A dog jumping over a fence',
          encoderDurationMs: 150,
          decoderDurationMs: 300,
          totalDurationMs: 450,
          tokenCount: 7,
        })
        .mockResolvedValueOnce({
          status: 'success',
          caption: 'A dog landing on the grass',
          encoderDurationMs: 150,
          decoderDurationMs: 300,
          totalDurationMs: 450,
          tokenCount: 7,
        });

      const result = await analyzeKeyframesSemantics(sampleKeyframes, true, 5.0);

      // Verify shape
      expect(result.analyzed).toBe(true);
      expect(result.keyframeDescriptions).toHaveLength(2);
      expect(result.keyframeDescriptions![0].time).toBe(0.0);
      expect(result.keyframeDescriptions![0].description).toBe('A dog jumping over a fence');
      expect(result.keyframeDescriptions![1].time).toBe(2.5);
      expect(result.keyframeDescriptions![1].description).toBe('A dog landing on the grass');
      expect(result.temporalSummary).toBe(
        'Video sequence showing a dog jumping over a fence; later a dog landing on the grass.'
      );
      expect(result.tags).toContain('dog');
      expect(result.tags).toContain('fence');
      expect(result.tags).toContain('landing');
    });

    it('6. Missing Android OCR remains optional (undefined)', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);
      vi.mocked(NativeBlip.isReady).mockResolvedValue({ ready: true, state: 'ready' });
      vi.mocked(NativeBlip.generateCaption).mockResolvedValue({
        status: 'success',
        caption: 'A sunny day in the park',
        encoderDurationMs: 100,
        decoderDurationMs: 200,
        totalDurationMs: 300,
        tokenCount: 6,
      });

      const result = await analyzeKeyframesSemantics([sampleKeyframes[0]], false, 0);

      expect(result.ocrText).toBeUndefined();
      expect(result.ocrConfidence).toBeUndefined();
      expect(result.keyframeDescriptions![0].ocrText).toBeUndefined();
      expect(result.keyframeDescriptions![0].ocrConfidence).toBeUndefined();
    });

    it('7. A native BLIP failure surfaces as an error and does not fall back to Python', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as any;

      vi.mocked(NativeBlip.isReady).mockResolvedValue({ ready: false, state: 'uninitialized' });
      vi.mocked(NativeBlip.initialize).mockResolvedValue({
        ready: false,
        state: 'error',
        error: 'Out of memory loading ONNX model',
      });

      await expect(
        analyzeKeyframesSemantics(sampleKeyframes, true, 5.0)
      ).rejects.toThrow('Native Android BLIP initialization failed: Out of memory loading ONNX model');

      // Verify no network fallback happened
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('8. checkVisionWorkerHealth returns native BLIP status without network call on Android', async () => {
      vi.spyOn(androidMedia, 'isNativeAndroid').mockReturnValue(true);
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as any;

      vi.mocked(NativeBlip.isReady).mockResolvedValue({ ready: true, state: 'ready' });

      const status = await checkVisionWorkerHealth();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(status.online).toBe(true);
      expect(status.engine).toBe('onnxruntime-android-blip');
      expect(status.modelLoaded).toBe(true);
      expect(status.state).toBe('ready');
    });
  });
});
