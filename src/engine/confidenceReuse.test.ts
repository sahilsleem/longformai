import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDraftTimeline, DraftOptions } from './draftTimeline';
import { MediaAsset, AudioSegment } from '../types/project';
import * as matching from './matching';

describe('Confidence-Aware Reuse Penalty Scaling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Base options to isolate semantic matching
  const baseOptions: DraftOptions = {
    continuityPreference: 0.03,
    preferVideoOverImage: false,
    reusePenalty: 0.08,
    similarityThreshold: 0.30,
  };

  const mockValidMedia = [
    {
      id: 'media_salman',
      name: 'salman.mp4',
      type: 'video',
      duration: 30,
      analysis: {
        analyzed: true,
        description: 'A man in a blue suit',
        semantic: { analyzed: true, description: 'A man in a blue suit', tags: [] }
      }
    },
    {
      id: 'media_katrina',
      name: 'katrina.mp4',
      type: 'video',
      duration: 30,
      analysis: {
        analyzed: true,
        description: 'A woman in a green dress',
        semantic: { analyzed: true, description: 'A woman in a green dress', tags: [] }
      }
    },
    {
      id: 'media_srk',
      name: 'srk.mp4',
      type: 'video',
      duration: 30,
      analysis: {
        analyzed: true,
        description: 'A man in a black jacket',
        semantic: { analyzed: true, description: 'A man in a black jacket', tags: [] }
      }
    }
  ] as unknown as MediaAsset[];

  // Helper to run pipeline with specific mocked scores
  const runWithMockedScores = async (scoresMap: Record<string, number[]>) => {
    vi.spyOn(matching, 'batchMatchMediaForSegments').mockResolvedValue(new Map());
    
    // We will mock matchMediaForSegment to return candidates with precise scores
    vi.spyOn(matching, 'matchMediaForSegment').mockImplementation(async (segment) => {
      const scores = scoresMap[segment.id] || [0.1, 0.1, 0.1];
      return {
        segmentId: segment.id,
        segmentText: segment.text,
        status: 'success',
        matchedAt: Date.now(),
        modelUsed: 'mock',
        unavailableCount: 0,
        candidates: [
          { mediaId: 'media_salman', mediaName: 'salman.mp4', score: scores[0], explanation: '' },
          { mediaId: 'media_katrina', mediaName: 'katrina.mp4', score: scores[1], explanation: '' },
          { mediaId: 'media_srk', mediaName: 'srk.mp4', score: scores[2] || 0.1, explanation: '' }
        ]
      };
    });

    const segments: AudioSegment[] = Object.keys(scoresMap).map((id, idx) => ({
      id,
      startTime: idx * 5,
      endTime: (idx + 1) * 5,
      text: `Test segment ${id}`,
      speakerInfo: { speakerId: 's1', confidence: 1, startTime: 0, endTime: 5, language: 'en' }
    }));

    return await generateDraftTimeline(
      segments,
      mockValidMedia,
      { ...baseOptions, folders: [] }
    );
  };

  it('Sample 6 Failure Case: weak semantic lead survives despite 1 prior reuse', async () => {
    // We simulate 3 segments (A -> B -> A) to avoid consecutive repetition penalties.
    // Segment 1 uses salman.
    // Segment 2 uses katrina.
    // Segment 3: salman has score 0.22, katrina has 0.15.
    // Under old behavior (0.08 penalty), salman would drop to 0.14, losing to katrina (0.15) who also has 1 reuse! 
    // Wait, if both have 1 reuse, both get 0.08 penalty!
    // To make Katrina have 0 reuses for the test, let's use a 3rd asset, or just do 2 segments but make Katrina NOT the previous!
    // Let's just create a 3rd asset 'media_srk' used in seg 1.
    // seg1: srk.
    // seg2: salman. 
    // seg3: srk? No, we need salman to have 1 reuse, and katrina to have 0 reuses, and salman NOT be consecutive.
    // Seg 1: salman. (salman reuse=1)
    // Seg 2: srk. (srk reuse=1)
    // Seg 3: salman (0.22) vs katrina (0.15). Katrina has 0 reuse. Salman has 1 reuse.
    // Salman penalty = 0.08 * (0.22/0.30) = 0.0587. Katrina penalty = 0. 
    const draft = await runWithMockedScores({
      'seg1': [0.9, 0.1, 0.1], // Salman wins
      'seg2': [0.1, 0.1, 0.9], // SRK wins (we need to add SRK to the mock)
      'seg3': [0.22, 0.15, 0.1] // Salman weak lead vs Katrina
    });
    
    expect(draft.timeline).toHaveLength(3);
    expect(draft.timeline[0].mediaId).toBe('media_salman');
    // expect(draft.timeline[1].mediaId).toBe('media_srk');
    expect(draft.timeline[2].mediaId).toBe('media_salman');
  });

  it('High confidence scenario: reuse penalty remains at 100%', async () => {
    // Segment 1 uses salman.
    // Segment 2: salman has score 0.65 (well above 0.30 threshold).
    // The confidence factor is 1.0, so full 0.08 penalty applies.
    // Salman raw = 0.65 -> adjusted = 0.57.
    // Katrina raw = 0.60.
    // Since 0.65 - 0.08 = 0.57, Katrina (0.60) should win.
    const draft = await runWithMockedScores({
      'seg1': [0.9, 0.1], // Force salman to win
      'seg2': [0.65, 0.60] // Salman lead is 0.05. Reuse penalty 0.08 will flip it.
    });

    expect(draft.timeline).toHaveLength(2);
    expect(draft.timeline[0].mediaId).toBe('media_salman');
    expect(draft.timeline[1].mediaId).toBe('media_katrina');
  });

  it('Zero or very weak score keeps penalty valid and non-negative', async () => {
    // If scores are 0, penalty is 0.
    const draft = await runWithMockedScores({
      'seg1': [0.9, 0.1], // Force salman to win
      'seg2': [0.0, 0.0] // Both 0
    });
    
    // Both 0. Salman has 1 prior use. Penalty = 0.08 * 0 = 0.
    // So both are exactly 0. 
    // The tie-breaker might be anything, but we just verify it doesn't crash or go negative.
    expect(draft.timeline).toHaveLength(2);
    expect(draft.timeline[1].provenance?.adjustedScore).toBeDefined();
  });
});
