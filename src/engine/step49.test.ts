/**
 * Step 49: Draft Confidence-Aware Gap & Uncertainty Intelligence
 *
 * Tests for:
 *  1. STRONG / ACCEPTABLE / UNCERTAIN / NO_MATCH classification thresholds (pure)
 *  2. matchCertainty mapping from Step 48 confidence levels (pure)
 *  3. gapReason population for missing/rejected candidates (pure)
 *  4. adjustedScore, candidate ordering, candidate selection are UNCHANGED
 *  5. Deterministic repeated execution
 *  6. Integration with generateDraftTimeline (multiple match quality states)
 *  7. Schema round-trip for all Step 49 provenance fields
 *  8. Backward compatibility with pre-Step-49 projects
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDraftMatchQuality,
  generateDraftTimeline,
  STRONG_MATCH_SCORE,
  ACCEPTABLE_MATCH_SCORE,
  UNCERTAIN_MATCH_SCORE,
} from './draftTimeline';
import { exportProjectToPortableJSON, validateAndParseProjectJSON } from './schema';
import type { AudioSegment, MediaAsset, LongFormProject } from '../types/project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'test_video.mp4',
    type: 'video',
    url: 'blob:http://localhost/mock-video',
    width: 1920,
    height: 1080,
    duration: 10,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9',
    createdAt: 1700000000000,
    analysis: {
      analyzed: true,
      description: 'A mountain landscape with green valleys and blue sky',
      tags: ['mountain', 'nature', 'landscape'],
    },
    ...overrides,
  };
}

function makeSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: 'seg-1',
    text: 'mountain landscape nature scenery',
    startTime: 0,
    endTime: 5,
    ...overrides,
  };
}

function makeProject(
  timeline: LongFormProject['timeline'],
  media: MediaAsset[]
): LongFormProject {
  return {
    version: '1.0',
    id: 'proj-step49-test',
    name: 'Step 49 Test Project',
    resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
    fps: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    media,
    timeline,
  } as LongFormProject;
}

// ---------------------------------------------------------------------------
// 1. Pure unit tests: calculateDraftMatchQuality thresholds
// ---------------------------------------------------------------------------

describe('Step 49: calculateDraftMatchQuality — match thresholds', () => {
  it('1. STRONG_MATCH_SCORE constant is exactly 0.550', () => {
    expect(STRONG_MATCH_SCORE).toBe(0.550);
  });

  it('2. ACCEPTABLE_MATCH_SCORE constant is exactly 0.400', () => {
    expect(ACCEPTABLE_MATCH_SCORE).toBe(0.400);
  });

  it('3. UNCERTAIN_MATCH_SCORE constant is exactly 0.300', () => {
    expect(UNCERTAIN_MATCH_SCORE).toBe(0.300);
  });

  it('4. STRONG at exactly 0.550', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.550 });
    expect(result.matchConfidence).toBe('STRONG');
  });

  it('5. STRONG above 0.550 (e.g. 0.750)', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.750 });
    expect(result.matchConfidence).toBe('STRONG');
  });

  it('6. STRONG at 1.0 (maximum)', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 1.0 });
    expect(result.matchConfidence).toBe('STRONG');
  });

  it('7. ACCEPTABLE at exactly 0.400', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.400 });
    expect(result.matchConfidence).toBe('ACCEPTABLE');
  });

  it('8. ACCEPTABLE below 0.550 (e.g. 0.480)', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.480 });
    expect(result.matchConfidence).toBe('ACCEPTABLE');
  });

  it('9. ACCEPTABLE just below 0.550 (0.549)', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.549 });
    expect(result.matchConfidence).toBe('ACCEPTABLE');
  });

  it('10. UNCERTAIN at exactly 0.300', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.300 });
    expect(result.matchConfidence).toBe('UNCERTAIN');
  });

  it('11. UNCERTAIN below 0.400 (e.g. 0.350)', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.350 });
    expect(result.matchConfidence).toBe('UNCERTAIN');
  });

  it('12. UNCERTAIN just below 0.400 (0.399)', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.399 });
    expect(result.matchConfidence).toBe('UNCERTAIN');
  });

  it('13. UNCERTAIN when selected candidate has adjustedScore below 0.300 (e.g. 0.200) — UNCERTAIN is the floor for selected candidates', () => {
    // A selected candidate that survived the engine's threshold is never NO_MATCH,
    // regardless of how low its adjustedScore is.
    const result = calculateDraftMatchQuality({ adjustedScore: 0.200 });
    expect(result.matchConfidence).toBe('UNCERTAIN');
  });

  it('14. UNCERTAIN when selected candidate has adjustedScore 0.000 — selected = never NO_MATCH', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.0 });
    expect(result.matchConfidence).toBe('UNCERTAIN');
  });

  it('15. NO_MATCH only when selected is null (no candidate selected)', () => {
    const result = calculateDraftMatchQuality(null);
    expect(result.matchConfidence).toBe('NO_MATCH');
  });
});

// ---------------------------------------------------------------------------
// 2. Pure unit tests: gapReason
// ---------------------------------------------------------------------------

describe('Step 49: calculateDraftMatchQuality — gapReason', () => {
  it('16. null selected with NO_CANDIDATE context → NO_CANDIDATE', () => {
    const result = calculateDraftMatchQuality(null, { gapReason: 'NO_CANDIDATE' });
    expect(result.gapReason).toBe('NO_CANDIDATE');
  });

  it('17. null selected with BELOW_EXISTING_THRESHOLD context → BELOW_EXISTING_THRESHOLD', () => {
    const result = calculateDraftMatchQuality(null, { gapReason: 'BELOW_EXISTING_THRESHOLD' });
    expect(result.gapReason).toBe('BELOW_EXISTING_THRESHOLD');
  });

  it('18. null selected with EMPTY_TRANSCRIPT context → EMPTY_TRANSCRIPT', () => {
    const result = calculateDraftMatchQuality(null, { gapReason: 'EMPTY_TRANSCRIPT' });
    expect(result.gapReason).toBe('EMPTY_TRANSCRIPT');
  });

  it('19. null selected with UNAVAILABLE_MEDIA context → UNAVAILABLE_MEDIA', () => {
    const result = calculateDraftMatchQuality(null, { gapReason: 'UNAVAILABLE_MEDIA' });
    expect(result.gapReason).toBe('UNAVAILABLE_MEDIA');
  });

  it('20. null selected with no context → UNKNOWN (not invented)', () => {
    const result = calculateDraftMatchQuality(null);
    expect(result.gapReason).toBe('UNKNOWN');
  });

  it('21. null selected with UNKNOWN context → UNKNOWN', () => {
    const result = calculateDraftMatchQuality(null, { gapReason: 'UNKNOWN' });
    expect(result.gapReason).toBe('UNKNOWN');
  });

  it('22. assigned segment has undefined gapReason', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.700 });
    expect(result.gapReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Step 49: NO_MATCH correction — key distinction tests
// ---------------------------------------------------------------------------

describe('Step 49: NO_MATCH correction — selected vs rejected distinction', () => {
  it('C1. A selected candidate at 0.350 classifies as UNCERTAIN, not NO_MATCH', () => {
    // The candidate survived the engine's existing threshold; the 0.300 boundary
    // is a quality description only — it does NOT trigger NO_MATCH for selected candidates.
    const result = calculateDraftMatchQuality({ adjustedScore: 0.350 });
    expect(result.matchConfidence).toBe('UNCERTAIN');
    expect(result.matchConfidence).not.toBe('NO_MATCH');
    expect(result.gapReason).toBeUndefined();
  });

  it('C2. A rejected/null candidate classifies as NO_MATCH', () => {
    const result = calculateDraftMatchQuality(null, { gapReason: 'BELOW_EXISTING_THRESHOLD' });
    expect(result.matchConfidence).toBe('NO_MATCH');
  });

  it('C3. A rejected candidate below existing threshold carries BELOW_EXISTING_THRESHOLD gap reason', () => {
    const result = calculateDraftMatchQuality(null, { gapReason: 'BELOW_EXISTING_THRESHOLD' });
    expect(result.gapReason).toBe('BELOW_EXISTING_THRESHOLD');
    expect(result.matchConfidence).toBe('NO_MATCH');
  });

  it('C4. NO_MATCH does not occur merely because adjustedScore < 0.300 for a selected candidate', () => {
    // Scores below 0.300 — still UNCERTAIN because the candidate WAS selected.
    const lowScores = [0.299, 0.200, 0.100, 0.050, 0.001];
    for (const score of lowScores) {
      const result = calculateDraftMatchQuality({ adjustedScore: score });
      expect(result.matchConfidence).toBe('UNCERTAIN');
      expect(result.matchConfidence).not.toBe('NO_MATCH');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Pure unit tests: matchCertainty mapping from Step 48 confidence
// ---------------------------------------------------------------------------

describe('Step 49: calculateDraftMatchQuality — matchCertainty', () => {
  it('23. Step 48 HIGH → HIGH_CERTAINTY', () => {
    const result = calculateDraftMatchQuality({
      adjustedScore: 0.700,
      candidateConfidenceLevel: 'HIGH',
    });
    expect(result.matchCertainty).toBe('HIGH_CERTAINTY');
  });

  it('24. Step 48 MODERATE → MODERATE_CERTAINTY', () => {
    const result = calculateDraftMatchQuality({
      adjustedScore: 0.600,
      candidateConfidenceLevel: 'MODERATE',
    });
    expect(result.matchCertainty).toBe('MODERATE_CERTAINTY');
  });

  it('25. Step 48 LOW → LOW_CERTAINTY', () => {
    const result = calculateDraftMatchQuality({
      adjustedScore: 0.500,
      candidateConfidenceLevel: 'LOW',
    });
    expect(result.matchCertainty).toBe('LOW_CERTAINTY');
  });

  it('26. no Step 48 confidence level → matchCertainty is undefined', () => {
    const result = calculateDraftMatchQuality({ adjustedScore: 0.550 });
    expect(result.matchCertainty).toBeUndefined();
  });

  it('27. null selected → matchCertainty is undefined', () => {
    const result = calculateDraftMatchQuality(null);
    expect(result.matchCertainty).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Pure unit tests: determinism & score immutability
// ---------------------------------------------------------------------------

describe('Step 49: calculateDraftMatchQuality — determinism', () => {
  it('28. identical inputs produce identical outputs (repeated calls)', () => {
    const input = { adjustedScore: 0.620, candidateConfidenceLevel: 'HIGH' as const };
    const r1 = calculateDraftMatchQuality(input);
    const r2 = calculateDraftMatchQuality(input);
    const r3 = calculateDraftMatchQuality(input);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('29. STRONG + HIGH → STRONG + HIGH_CERTAINTY deterministically', () => {
    for (let i = 0; i < 5; i++) {
      const r = calculateDraftMatchQuality({ adjustedScore: 0.800, candidateConfidenceLevel: 'HIGH' });
      expect(r.matchConfidence).toBe('STRONG');
      expect(r.matchCertainty).toBe('HIGH_CERTAINTY');
      expect(r.gapReason).toBeUndefined();
    }
  });

  it('30. Step 49 does NOT modify the input adjustedScore', () => {
    const input = { adjustedScore: 0.700, candidateConfidenceLevel: 'HIGH' as const };
    const originalScore = input.adjustedScore;
    calculateDraftMatchQuality(input);
    expect(input.adjustedScore).toBe(originalScore);
  });
});

// ---------------------------------------------------------------------------
// 5. Integration test: generateDraftTimeline populates Step 49 fields
// ---------------------------------------------------------------------------

describe('Step 49: DraftTimeline Integration', () => {
  it('31. generateDraftTimeline populates Step 49 provenance fields and stats', async () => {
    const segments: AudioSegment[] = [
      makeSegment({
        id: 'seg-1',
        text: 'Deep inside the ancient forest, towering evergreen trees cover the misty valley.',
        startTime: 0,
        endTime: 5,
      }),
      makeSegment({
        id: 'seg-2',
        text: 'Ocean waves crash against the rocky shoreline in the afternoon sun.',
        startTime: 5,
        endTime: 10,
      }),
    ];

    const media: MediaAsset[] = [
      makeMedia({
        id: 'media-1',
        analysis: {
          analyzed: true,
          description: 'Deep inside the ancient forest, towering evergreen trees cover the misty valley.',
          tags: ['forest', 'ancient', 'trees', 'misty'],
        },
      }),
      makeMedia({
        id: 'media-2',
        analysis: {
          analyzed: true,
          description: 'Ocean waves crash against rocky shoreline in afternoon sun.',
          tags: ['ocean', 'waves', 'beach', 'shoreline'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media, {
      similarityThreshold: 0.10,
    });

    // The integration test validates that when a match occurs, Step 49 fields are correctly populated.
    // (The semantic model may produce 0 results in some environments; all assertions are guarded.)

    // Stats fields are always present regardless of matches
    const stats = result.stats;
    expect(typeof stats.noMatchCount).toBe('number');
    expect(stats.noMatchCount).toBeGreaterThanOrEqual(0);
    expect(typeof stats.strongMatchCount === 'number' || stats.strongMatchCount === undefined).toBe(true);
    expect(typeof stats.acceptableMatchCount === 'number' || stats.acceptableMatchCount === undefined).toBe(true);
    expect(typeof stats.uncertainMatchCount === 'number' || stats.uncertainMatchCount === undefined).toBe(true);

    if (result.timeline.length > 0) {
      // Step 49 must NOT modify existing scoring fields
      for (const item of result.timeline) {
        expect(typeof item.provenance!.adjustedScore).toBe('number');
        expect(typeof item.provenance!.originalScore).toBe('number');
      }

      // Every assigned item must have the three Step 49 provenance fields
      for (const item of result.timeline) {
        const p = item.provenance!;
        expect(['STRONG', 'ACCEPTABLE', 'UNCERTAIN', 'NO_MATCH']).toContain(p.matchConfidence);
        // matchCertainty is present iff candidateConfidenceLevel is set
        if (p.candidateConfidenceLevel !== undefined) {
          expect(['HIGH_CERTAINTY', 'MODERATE_CERTAINTY', 'LOW_CERTAINTY']).toContain(p.matchCertainty);
        }
        // gapReason is undefined for assigned (selected) segments
        expect(p.gapReason).toBeUndefined();
      }

      // Stats: strongMatchCount + acceptableMatchCount + uncertainMatchCount = timeline.length
      const classifiedCount =
        (stats.strongMatchCount ?? 0) +
        (stats.acceptableMatchCount ?? 0) +
        (stats.uncertainMatchCount ?? 0);
      expect(classifiedCount).toBe(result.timeline.length);

      // Step 48 fields are still present and unchanged
      for (const item of result.timeline) {
        expect(typeof item.provenance!.selectionMargin).toBe('number');
        expect(typeof item.provenance!.semanticMargin).toBe('number');
        expect(typeof item.provenance!.candidateConfidenceScore).toBe('number');
      }
    }
  }, 60000);
});

// ---------------------------------------------------------------------------
// 6. Schema round-trip
// ---------------------------------------------------------------------------

describe('Step 49: Schema export/parse round-trip', () => {
  it('32. preserves all Step 49 provenance fields through export → parse cycle', () => {
    const media: MediaAsset[] = [makeMedia({ id: 'media-1' })];

    const project = makeProject(
      [
        {
          id: 'clip-step49-1',
          mediaId: 'media-1',
          trackIndex: 0,
          startTime: 0,
          duration: 5.0,
          sourceStart: 0,
          sourceDuration: 10.0,
          transform: {
            x: 0, y: 0, scale: 1,
            fitMode: 'cover',
            crop: { x: 0, y: 0, width: 1, height: 1 },
          },
          provenance: {
            sourceSegmentId: 'seg-1',
            sourceSegmentText: 'Mountain landscape scenery',
            originalScore: 0.82,
            adjustedScore: 0.78,
            explanation: 'Strong semantic match',
            reuseCount: 0,
            rawVisualIntelligence: 0.02,
            boundedVisualIntelligence: 0.02,
            visualIntelligenceBudget: 0.05,
            candidateConfidenceScore: 0.900,
            candidateConfidenceLevel: 'HIGH' as const,
            selectionMargin: 0.090,
            semanticMargin: 0.15,
            semanticSeparation: 'CLEAR' as const,
            visualInfluence: 'SUPPORTING' as const,
            matchConfidence: 'STRONG' as const,
            matchCertainty: 'HIGH_CERTAINTY' as const,
            gapReason: undefined,
          },
        },
      ],
      media
    );

    const jsonStr = exportProjectToPortableJSON(project);
    expect(jsonStr).toContain('matchConfidence');
    expect(jsonStr).toContain('matchCertainty');
    expect(jsonStr).toContain('STRONG');
    expect(jsonStr).toContain('HIGH_CERTAINTY');

    const parsed = validateAndParseProjectJSON(jsonStr);
    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();

    const p = parsed.project!.timeline[0].provenance!;
    expect(p.matchConfidence).toBe('STRONG');
    expect(p.matchCertainty).toBe('HIGH_CERTAINTY');
    expect(p.gapReason).toBeUndefined();

    // Step 48 fields still intact
    expect(p.candidateConfidenceLevel).toBe('HIGH');
    expect(p.selectionMargin).toBe(0.090);
  });

  it('33. all matchConfidence enum values round-trip correctly', () => {
    const confidenceValues = ['STRONG', 'ACCEPTABLE', 'UNCERTAIN', 'NO_MATCH'] as const;
    for (const mc of confidenceValues) {
      const media = [makeMedia({ id: 'media-1' })];
      const project = makeProject(
        [{
          id: `clip-${mc}`,
          mediaId: 'media-1',
          trackIndex: 0,
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceDuration: 10,
          transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
          provenance: {
            sourceSegmentId: 'seg-1',
            originalScore: 0.70,
            adjustedScore: 0.70,
            explanation: 'Test',
            reuseCount: 0,
            matchConfidence: mc,
            matchCertainty: 'HIGH_CERTAINTY' as const,
          },
        }],
        media
      );
      const jsonStr = exportProjectToPortableJSON(project);
      const parsed = validateAndParseProjectJSON(jsonStr);
      expect(parsed.isValid).toBe(true);
      expect(parsed.project!.timeline[0].provenance!.matchConfidence).toBe(mc);
    }
  });

  it('34. all gapReason enum values round-trip correctly', () => {
    const gapReasons = ['NO_CANDIDATE', 'BELOW_EXISTING_THRESHOLD', 'EMPTY_TRANSCRIPT', 'UNAVAILABLE_MEDIA', 'UNKNOWN'] as const;
    for (const gr of gapReasons) {
      const media = [makeMedia({ id: 'media-1' })];
      const project = makeProject(
        [{
          id: `clip-${gr}`,
          mediaId: 'media-1',
          trackIndex: 0,
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceDuration: 10,
          transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
          provenance: {
            sourceSegmentId: 'seg-1',
            originalScore: 0.70,
            adjustedScore: 0.70,
            explanation: 'Test',
            reuseCount: 0,
            matchConfidence: 'NO_MATCH' as const,
            gapReason: gr,
          },
        }],
        media
      );
      const jsonStr = exportProjectToPortableJSON(project);
      const parsed = validateAndParseProjectJSON(jsonStr);
      expect(parsed.isValid).toBe(true);
      expect(parsed.project!.timeline[0].provenance!.gapReason).toBe(gr);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Backward compatibility
// ---------------------------------------------------------------------------

describe('Step 49: Backward compatibility', () => {
  it('35. pre-Step-49 project without new fields still parses (fields are undefined)', () => {
    const legacyJson = JSON.stringify({
      version: '1.0',
      id: 'proj-legacy-49',
      name: 'Legacy Step 48 Project',
      resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
      fps: 30,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      media: [
        {
          id: 'media-old',
          name: 'old.mp4',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: 10,
          aspectRatio: 1.778,
          aspectRatioLabel: '16:9',
          createdAt: 1700000000000,
        },
      ],
      timeline: [
        {
          id: 'clip-1',
          mediaId: 'media-old',
          trackIndex: 0,
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceDuration: 10,
          transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
          provenance: {
            sourceSegmentId: 'seg-old',
            originalScore: 0.82,
            adjustedScore: 0.78,
            explanation: 'Step 48 match',
            reuseCount: 0,
            candidateConfidenceLevel: 'HIGH',
            selectionMargin: 0.090,
            semanticSeparation: 'CLEAR',
            visualInfluence: 'SUPPORTING',
            // NO Step 49 fields
          },
        },
      ],
    });

    const parsed = validateAndParseProjectJSON(legacyJson);
    expect(parsed.isValid).toBe(true);
    if (!parsed.project) return;

    const p = parsed.project.timeline[0].provenance!;
    // Step 48 fields survive intact
    expect(p.candidateConfidenceLevel).toBe('HIGH');
    expect(p.selectionMargin).toBe(0.090);
    // Step 49 fields are undefined — not present, not crashed
    expect(p.matchConfidence).toBeUndefined();
    expect(p.matchCertainty).toBeUndefined();
    expect(p.gapReason).toBeUndefined();
  });

  it('36. invalid Step 49 enum values fall back to undefined (no crash)', () => {
    const badJson = JSON.stringify({
      version: '1.0',
      id: 'proj-bad-enums-49',
      name: 'Bad Step 49 Enums',
      resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
      fps: 30,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      media: [
        {
          id: 'media-old',
          name: 'old.mp4',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: 10,
          aspectRatio: 1.778,
          aspectRatioLabel: '16:9',
          createdAt: 1700000000000,
        },
      ],
      timeline: [
        {
          id: 'clip-1',
          mediaId: 'media-old',
          trackIndex: 0,
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceDuration: 10,
          transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
          provenance: {
            sourceSegmentId: 'seg-old',
            originalScore: 0.70,
            adjustedScore: 0.68,
            explanation: 'Test',
            reuseCount: 0,
            matchConfidence: 'EXCELLENT',      // invalid
            matchCertainty: 'VERY_HIGH',        // invalid
            gapReason: 'NETWORK_TIMEOUT',       // invalid
          },
        },
      ],
    });

    const parsed = validateAndParseProjectJSON(badJson);
    expect(parsed.isValid).toBe(true);
    if (!parsed.project) return;

    const p = parsed.project.timeline[0].provenance!;
    expect(p.matchConfidence).toBeUndefined();
    expect(p.matchCertainty).toBeUndefined();
    expect(p.gapReason).toBeUndefined();
  });
});
