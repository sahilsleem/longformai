/**
 * Step 48: Candidate Confidence & Selection Margin Intelligence
 *
 * Tests for:
 *  1. calculateCandidateConfidence helper (pure / deterministic)
 *  2. DraftProvenance confidence fields populated by generateDraftTimeline
 *  3. DraftStats confidence counters populated by generateDraftTimeline
 *  4. Schema round-trip (export → parse) for all Step 48 provenance fields
 *  5. Backward compatibility with pre-Step-48 serialised projects
 */

import { describe, it, expect } from 'vitest';
import { calculateCandidateConfidence, generateDraftTimeline } from './draftTimeline';
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
      description: 'A beautiful mountain landscape with green valleys and blue sky',
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

function makeProject(timeline: LongFormProject['timeline'], media: MediaAsset[]): LongFormProject {
  return {
    version: '1.0',
    id: 'proj-step48-test',
    name: 'Step 48 Round-Trip Test',
    resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
    fps: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    media,
    timeline,
  } as LongFormProject;
}

// ---------------------------------------------------------------------------
// 1. calculateCandidateConfidence – unit tests
// ---------------------------------------------------------------------------

describe('Step 48: calculateCandidateConfidence helper', () => {
  it('1a. returns HIGH confidence when selectionMargin >= 0.050', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.90, adjustedScore: 0.85 },
      { rawScore: 0.70, adjustedScore: 0.75 }
    );
    expect(result.selectionMargin).toBeCloseTo(0.1, 3);
    expect(result.candidateConfidenceLevel).toBe('HIGH');
    expect(result.candidateConfidenceScore).toBe(1);
  });

  it('1b. returns MODERATE confidence when selectionMargin in [0.020, 0.050)', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.700 },
      { rawScore: 0.76, adjustedScore: 0.665 }
    );
    expect(result.selectionMargin).toBeCloseTo(0.035, 3);
    expect(result.candidateConfidenceLevel).toBe('MODERATE');
    expect(result.candidateConfidenceScore).toBeGreaterThan(0);
    expect(result.candidateConfidenceScore).toBeLessThan(1);
  });

  it('1c. returns LOW confidence when selectionMargin < 0.020', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.75, adjustedScore: 0.600 },
      { rawScore: 0.74, adjustedScore: 0.595 }
    );
    expect(result.selectionMargin).toBeCloseTo(0.005, 3);
    expect(result.candidateConfidenceLevel).toBe('LOW');
    expect(result.candidateConfidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.candidateConfidenceScore).toBeLessThan(0.5);
  });

  it('1d. margin exactly 0.050 → HIGH', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.70 },
      { rawScore: 0.75, adjustedScore: 0.65 }
    );
    expect(result.selectionMargin).toBeCloseTo(0.05, 3);
    expect(result.candidateConfidenceLevel).toBe('HIGH');
  });

  it('1e. margin exactly 0.020 → MODERATE', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.70 },
      { rawScore: 0.78, adjustedScore: 0.68 }
    );
    expect(result.selectionMargin).toBeCloseTo(0.02, 3);
    expect(result.candidateConfidenceLevel).toBe('MODERATE');
  });

  it('1f. single candidate – margin equals selectedScore', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.85, adjustedScore: 0.82 }
    );
    expect(result.selectionMargin).toBeCloseTo(0.82, 3);
    expect(result.candidateConfidenceLevel).toBe('HIGH');
    expect(result.candidateConfidenceScore).toBe(1);
  });

  it('1g. semanticSeparation CLEAR when rawScore gap >= 0.100', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.90, adjustedScore: 0.80 },
      { rawScore: 0.75, adjustedScore: 0.70 }
    );
    expect(result.semanticMargin).toBeCloseTo(0.15, 3);
    expect(result.semanticSeparation).toBe('CLEAR');
  });

  it('1h. semanticSeparation CLOSE when 0 < rawScore gap < 0.100', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.78 },
      { rawScore: 0.75, adjustedScore: 0.73 }
    );
    expect(result.semanticMargin).toBeCloseTo(0.05, 3);
    expect(result.semanticSeparation).toBe('CLOSE');
  });

  it('1i. semanticSeparation NONE when rawScore gap <= 0', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.70, adjustedScore: 0.75 },
      { rawScore: 0.72, adjustedScore: 0.70 }
    );
    expect(result.semanticMargin).toBeLessThanOrEqual(0);
    expect(result.semanticSeparation).toBe('NONE');
  });

  it('1j. semanticSeparation CLEAR when rawScore gap exactly 0.100', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.90, adjustedScore: 0.80 },
      { rawScore: 0.80, adjustedScore: 0.75 }
    );
    expect(result.semanticMargin).toBeCloseTo(0.1, 3);
    expect(result.semanticSeparation).toBe('CLEAR');
  });

  it('1k. visualInfluence NEUTRAL when boundedVisualIntelligence === 0', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.75, boundedVisualIntelligence: 0 }
    );
    expect(result.visualInfluence).toBe('NEUTRAL');
  });

  it('1l. visualInfluence SUPPORTING when boundedVisualIntelligence > 0', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.75, boundedVisualIntelligence: 0.03 }
    );
    expect(result.visualInfluence).toBe('SUPPORTING');
  });

  it('1m. visualInfluence OPPOSING when boundedVisualIntelligence < 0', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.75, boundedVisualIntelligence: -0.04 }
    );
    expect(result.visualInfluence).toBe('OPPOSING');
  });

  it('1n. visualInfluence defaults to NEUTRAL when field absent', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.80, adjustedScore: 0.75 }
    );
    expect(result.visualInfluence).toBe('NEUTRAL');
  });

  it('1o. confidenceScore clamped to 1 for very large margins', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.99, adjustedScore: 0.95 },
      { rawScore: 0.10, adjustedScore: 0.10 }
    );
    expect(result.candidateConfidenceScore).toBe(1);
  });

  it('1p. confidenceScore at least 0 for zero margin (tie)', () => {
    const result = calculateCandidateConfidence(
      { rawScore: 0.70, adjustedScore: 0.65 },
      { rawScore: 0.70, adjustedScore: 0.65 }
    );
    expect(result.candidateConfidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.selectionMargin).toBe(0);
    expect(result.candidateConfidenceLevel).toBe('LOW');
  });

  it('1q. deterministic repeatability – identical outputs on repeated calls', () => {
    const selected = { rawScore: 0.82, adjustedScore: 0.77, boundedVisualIntelligence: 0.02 };
    const runner   = { rawScore: 0.74, adjustedScore: 0.72 };
    const first    = calculateCandidateConfidence(selected, runner);
    const second   = calculateCandidateConfidence(selected, runner);
    expect(first).toEqual(second);
  });

  it('1r. negative selectionMargin handled gracefully (confidenceScore >= 0)', () => {
    // When runner-up has higher adjustedScore (e.g. scores very close, rounding edge)
    const result = calculateCandidateConfidence(
      { rawScore: 0.60, adjustedScore: 0.600 },
      { rawScore: 0.65, adjustedScore: 0.650 }
    );
    expect(result.candidateConfidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.candidateConfidenceLevel).toBe('LOW');
  });
});

// ---------------------------------------------------------------------------
// 2 & 3. Integration with generateDraftTimeline
// ---------------------------------------------------------------------------

describe('Step 48: DraftTimeline Integration & DraftStats', () => {
  it('populates Step 48 provenance fields and stats in generateDraftTimeline', async () => {
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
      similarityThreshold: 0.20,
    });

    expect(result.timeline.length).toBeGreaterThan(0);

    // Every assigned item has the six Step 48 provenance fields
    for (const item of result.timeline) {
      const p = item.provenance!;
      expect(typeof p.candidateConfidenceScore).toBe('number');
      expect(p.candidateConfidenceScore).toBeGreaterThanOrEqual(0);
      expect(p.candidateConfidenceScore).toBeLessThanOrEqual(1);
      expect(['HIGH', 'MODERATE', 'LOW']).toContain(p.candidateConfidenceLevel);
      expect(typeof p.selectionMargin).toBe('number');
      expect(typeof p.semanticMargin).toBe('number');
      expect(['CLEAR', 'CLOSE', 'NONE']).toContain(p.semanticSeparation);
      expect(['NEUTRAL', 'SUPPORTING', 'OPPOSING']).toContain(p.visualInfluence);
    }

    // Confidence counters sum equals timeline length
    const stats = result.stats;
    const confTotal =
      (stats.highConfidenceSelections ?? 0) +
      (stats.moderateConfidenceSelections ?? 0) +
      (stats.lowConfidenceSelections ?? 0);
    expect(confTotal).toBe(result.timeline.length);

    // averageSelectionMargin is a non-negative number
    expect(typeof stats.averageSelectionMargin).toBe('number');
    expect(stats.averageSelectionMargin!).toBeGreaterThanOrEqual(0);

    // Step 48 must NOT modify existing scoring fields
    for (const item of result.timeline) {
      expect(typeof item.provenance!.adjustedScore).toBe('number');
      expect(typeof item.provenance!.originalScore).toBe('number');
    }
  }, 60000);
});

// ---------------------------------------------------------------------------
// 4. Schema round-trip
// ---------------------------------------------------------------------------

describe('Step 48: Schema export/parse round-trip', () => {
  it('preserves all Step 48 provenance fields through export → parse cycle', () => {
    const media: MediaAsset[] = [makeMedia({ id: 'media-1' })];

    const project = makeProject(
      [
        {
          id: 'clip-step48-1',
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
            explanation: 'High semantic match',
            reuseCount: 0,
            rawVisualIntelligence: 0.02,
            boundedVisualIntelligence: 0.02,
            visualIntelligenceBudget: 0.05,
            candidateConfidenceScore: 0.850,
            candidateConfidenceLevel: 'HIGH' as const,
            selectionMargin: 0.085,
            semanticMargin: 0.12,
            semanticSeparation: 'CLEAR' as const,
            visualInfluence: 'SUPPORTING' as const,
          },
        },
      ],
      media
    );

    const jsonStr = exportProjectToPortableJSON(project);
    expect(jsonStr).toContain('candidateConfidenceScore');
    expect(jsonStr).toContain('candidateConfidenceLevel');
    expect(jsonStr).toContain('selectionMargin');
    expect(jsonStr).toContain('semanticMargin');
    expect(jsonStr).toContain('semanticSeparation');
    expect(jsonStr).toContain('visualInfluence');

    const parsed = validateAndParseProjectJSON(jsonStr);
    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();

    const p = parsed.project!.timeline[0].provenance!;
    expect(p.candidateConfidenceScore).toBe(0.850);
    expect(p.candidateConfidenceLevel).toBe('HIGH');
    expect(p.selectionMargin).toBe(0.085);
    expect(p.semanticMargin).toBe(0.12);
    expect(p.semanticSeparation).toBe('CLEAR');
    expect(p.visualInfluence).toBe('SUPPORTING');
  });
});

// ---------------------------------------------------------------------------
// 5. Backward compatibility
// ---------------------------------------------------------------------------

describe('Step 48: Backward compatibility', () => {
  it('5a. parses pre-Step-48 provenance without new fields (defaults to undefined)', () => {
    const legacyJson = JSON.stringify({
      version: '1.0',
      id: 'proj-legacy',
      name: 'Legacy Project',
      resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
      fps: 30,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      media: [
        {
          id: 'asset-old',
          name: 'old_video.mp4',
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
          mediaId: 'asset-old',
          trackIndex: 0,
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceDuration: 10,
          transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
          provenance: {
            sourceSegmentId: 'seg-old',
            originalScore: 0.75,
            adjustedScore: 0.74,
            explanation: 'Legacy match',
            reuseCount: 0,
            isManuallyEdited: false,
            // NO Step 48 fields
          },
        },
      ],
    });

    const parsed = validateAndParseProjectJSON(legacyJson);
    expect(parsed.isValid).toBe(true);
    if (!parsed.project) return;

    const p = parsed.project.timeline[0].provenance!;
    expect(p.originalScore).toBe(0.75);
    expect(p.adjustedScore).toBe(0.74);
    expect(p.candidateConfidenceScore).toBeUndefined();
    expect(p.candidateConfidenceLevel).toBeUndefined();
    expect(p.selectionMargin).toBeUndefined();
    expect(p.semanticMargin).toBeUndefined();
    expect(p.semanticSeparation).toBeUndefined();
    expect(p.visualInfluence).toBeUndefined();
  });

  it('5b. invalid enum values for Step 48 fields fall back to undefined', () => {
    const badJson = JSON.stringify({
      version: '1.0',
      id: 'proj-bad',
      name: 'Bad Enums',
      resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
      fps: 30,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      media: [
        {
          id: 'asset-old',
          name: 'old_video.mp4',
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
          mediaId: 'asset-old',
          trackIndex: 0,
          startTime: 0,
          duration: 5,
          sourceStart: 0,
          sourceDuration: 10,
          transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
          provenance: {
            sourceSegmentId: 'seg-old',
            originalScore: 0.75,
            adjustedScore: 0.74,
            explanation: 'Test',
            reuseCount: 0,
            candidateConfidenceLevel: 'VERY_HIGH', // invalid
            semanticSeparation: 'FUZZY',           // invalid
            visualInfluence: 'MIXED',              // invalid
          },
        },
      ],
    });

    const parsed = validateAndParseProjectJSON(badJson);
    expect(parsed.isValid).toBe(true);
    if (!parsed.project) return;

    const p = parsed.project.timeline[0].provenance!;
    expect(p.candidateConfidenceLevel).toBeUndefined();
    expect(p.semanticSeparation).toBeUndefined();
    expect(p.visualInfluence).toBeUndefined();
  });
});
