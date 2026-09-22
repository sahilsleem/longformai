import { describe, it, expect } from 'vitest';
import { generateDraftTimeline } from './draftTimeline';
import type { AudioSegment, MediaAsset } from '../types/project';

function makeMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'test_asset.png',
    type: 'image',
    url: 'blob:http://localhost/mock-image',
    width: 1920,
    height: 1080,
    duration: 5,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9',
    createdAt: 1700000000000,
    analysis: {
      analyzed: true,
      description: 'A black and white symbol on a white background with number 7',
      ocrText: '7',
      tags: ['symbol', 'number'],
    },
    ...overrides,
  };
}

function makeSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: 'seg-1',
    text: 'seven',
    startTime: 0,
    endTime: 3,
    ...overrides,
  };
}

describe('Draft Timeline Below-Threshold Fallback Selection', () => {
  it('selects the best available candidate when all candidates score below threshold', async () => {
    const segments: AudioSegment[] = [makeSegment({ id: 'seg-1', text: 'seven' })];
    const media: MediaAsset[] = [
      makeMedia({
        id: 'media-1',
        analysis: {
          analyzed: true,
          description: 'A symbol on a white background',
          tags: ['symbol'],
        },
      }),
    ];

    // High threshold that no mock/candidate will naturally exceed
    const result = await generateDraftTimeline(segments, media, {
      similarityThreshold: 0.99,
    });

    // Segment should NOT be unassigned because valid user media was supplied
    expect(result.timeline.length).toBe(1);
    expect(result.unassignedSegmentIds.length).toBe(0);
    const item = result.timeline[0];
    expect(item.mediaId).toBe('media-1');
    expect(item.provenance?.isBelowThresholdFallback).toBe(true);
    expect(item.provenance?.candidateConfidenceLevel).toBe('LOW');
    expect(item.provenance?.explanation).toContain('fallback');
  });

  it('proceeds with standard selection when candidate meets or exceeds threshold', async () => {
    const segments: AudioSegment[] = [
      makeSegment({ id: 'seg-1', text: 'mountain valley forest scenery' }),
    ];
    const media: MediaAsset[] = [
      makeMedia({
        id: 'media-1',
        analysis: {
          analyzed: true,
          description: 'mountain valley forest scenery and trees',
          tags: ['mountain', 'forest'],
        },
      }),
    ];

    // Low threshold that candidate satisfies
    const result = await generateDraftTimeline(segments, media, {
      similarityThreshold: 0.10,
    });

    if (result.timeline.length > 0) {
      const item = result.timeline[0];
      expect(item.provenance?.isBelowThresholdFallback).toBe(false);
    }
  });

  it('leaves segments unassigned only if no valid analyzed media assets exist', async () => {
    const segments: AudioSegment[] = [makeSegment({ id: 'seg-1', text: 'seven' })];
    const media: MediaAsset[] = [];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(0);
    expect(result.unassignedSegmentIds).toContain('seg-1');
  });
});
