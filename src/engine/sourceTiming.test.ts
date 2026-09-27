import { describe, it, expect } from 'vitest';
import { selectOptimalSourceStart } from './draftTimeline';
import { MediaAsset } from '../types/project';

describe('Optimal Source Timing Selection', () => {
  const baseAsset: MediaAsset = {
    id: 'vid1',
    name: 'test.mp4',
    type: 'video',
    url: 'test.mp4',
    width: 1920,
    height: 1080,
    duration: 50.0,
    aspectRatio: 1.77,
    aspectRatioLabel: '16:9 Native',
    createdAt: Date.now(),
    analysis: {
      analyzed: true,
      duration: 50.0,
      keyframes: [],
      semantic: {
        analyzed: true,
        description: 'Test video',
        tags: [],
        keyframeDescriptions: [
          { time: 0.0, description: 'Start', tags: [], isKeyMoment: true },
          { time: 12.5, description: 'Quarter', tags: [], isKeyMoment: true },
          { time: 25.0, description: 'Half', tags: [], isKeyMoment: true },
          { time: 37.5, description: 'Three quarters', tags: [], isKeyMoment: true },
          { time: 47.5, description: 'End', tags: [], isKeyMoment: true },
        ]
      }
    }
  };

  it('A. Best timestamp returned: returns exact bestKeyframeTime when valid', () => {
    const result = selectOptimalSourceStart(baseAsset, 'some text', 5.0, undefined, 25.0);
    expect(result.sourceStart).toBe(25.0);
    expect(result.selectedTimestamp).toBe(25.0);
    expect(result.isOptimized).toBe(true);
  });

  it('B. Timeline uses winning timestamp: clamps safely when plenty of duration remains', () => {
    const result = selectOptimalSourceStart(baseAsset, 'some text', 5.0, undefined, 25.0);
    // 50s total duration, segment needs 5s, max start is 45.0. 25.0 <= 45.0.
    expect(result.sourceStart).toBe(25.0);
  });

  it('C. End-of-video clamping: clamps to maxValidStart if bestKeyframeTime is too close to end', () => {
    const result = selectOptimalSourceStart(baseAsset, 'some text', 5.0, undefined, 47.5);
    // 50s total duration, segment needs 5s, max start is 45.0. 47.5 > 45.0 -> clamp to 45.0
    expect(result.sourceStart).toBe(45.0);
    expect(result.selectedTimestamp).toBe(47.5);
  });

  it('C2. End-of-video clamping: if video is shorter than segment, fallback to 0', () => {
    const shortAsset = { ...baseAsset, duration: 3.0 };
    const result = selectOptimalSourceStart(shortAsset, 'some text', 5.0, undefined, 2.0);
    // max start is 0 because 3.0 < 5.0
    expect(result.sourceStart).toBe(0.0);
  });

  it('D. Invalid timestamp: falls back to 0.0 safely when bestKeyframeTime is null', () => {
    const result = selectOptimalSourceStart(baseAsset, 'some text', 5.0, undefined, null);
    expect(result.sourceStart).toBe(0.0);
    expect(result.isOptimized).toBe(false);
  });

  it('D2. Invalid timestamp: falls back to 0.0 safely when bestKeyframeTime is undefined', () => {
    const result = selectOptimalSourceStart(baseAsset, 'some text', 5.0, undefined, undefined);
    expect(result.sourceStart).toBe(0.0);
    expect(result.isOptimized).toBe(false);
  });
describe('Source Window Tracking (Avoid Repeated Timestamp Playback)', () => {
    it('1. First use accepts bestKeyframeTime', () => {
      const result = selectOptimalSourceStart(baseAsset, 'text', 5.0, undefined, 0.0, []);
      expect(result.sourceStart).toBe(0.0);
    });

    it('2. Second use rejects an overlapping preferred window and chooses a valid alternative keyframe', () => {
      const used = [{ start: 0.0, end: 5.0 }];
      // Try to request 0.0 again
      const result = selectOptimalSourceStart(baseAsset, 'text', 5.0, undefined, 0.0, used);

      // Should reject 0.0, look at alternatives.
      // Next available is 12.5
      expect(result.sourceStart).toBe(12.5);
      expect(result.selectedTimestamp).toBe(12.5);
      expect(result.reason).toContain('adjusted from preferred');
    });

    it('3. Third use can choose another distinct keyframe/window', () => {
      const used = [
        { start: 0.0, end: 5.0 },
        { start: 12.5, end: 17.5 }
      ];
      // Try to request 0.0 again
      const result = selectOptimalSourceStart(baseAsset, 'text', 5.0, undefined, 0.0, used);

      // Should reject 0.0 and 12.5.
      // Next available is 25.0
      expect(result.sourceStart).toBe(25.0);
    });

    it('4. A keyframe near the end is rejected/clamped appropriately if the requested duration cannot fit', () => {
      const used = [
        { start: 0.0, end: 5.0 },
        { start: 12.5, end: 17.5 },
        { start: 25.0, end: 30.0 },
        { start: 37.5, end: 42.5 }
      ];
      // Try to request 0.0 again. Only alternative left is 47.5.
      // But 47.5 + 5.0 = 52.5, which exceeds 50.0.
      // So 47.5 will be clamped to 45.0.
      // We check if 45.0 overlaps. 45.0 to 50.0 does NOT overlap with 37.5 to 42.5.
      const result = selectOptimalSourceStart(baseAsset, 'text', 5.0, undefined, 0.0, used);

      expect(result.sourceStart).toBe(45.0);
      expect(result.selectedTimestamp).toBe(47.5);
    });

    it('5. When all distinct windows are exhausted, the system gracefully reuses the best available window', () => {
      // Cover the entire video
      const used = [
        { start: 0.0, end: 50.0 }
      ];
      const result = selectOptimalSourceStart(baseAsset, 'text', 5.0, undefined, 12.5, used);

      // 12.5 overlaps. No alternative works.
      // Must fallback to clamped preferred.
      expect(result.sourceStart).toBe(12.5);
      expect(result.reason).toContain('overlap tolerated');
    });

    it('7. Existing behavior remains unchanged when usedSourceWindows is empty', () => {
      const result = selectOptimalSourceStart(baseAsset, 'text', 5.0, undefined, 12.5, []);
      expect(result.sourceStart).toBe(12.5);
      expect(result.reason).not.toContain('overlap tolerated');
      expect(result.reason).not.toContain('adjusted from preferred');
    });
  });
});
