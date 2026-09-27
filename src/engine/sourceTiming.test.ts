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
});
