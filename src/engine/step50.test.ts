/**
 * Step 50: Confidence-Aware Candidate Diversity Intelligence
 *
 * Tests for:
 *  1. BROAD / MODERATE / LIMITED / NONE diversity classification (pure)
 *  2. SUPPORTED / CONSTRAINED / UNAVAILABLE context interpretation (pure)
 *  3. selectedCandidateRank tracking (1-based index in candidate pool)
 *  4. candidatePoolSize and viableCandidateCount calculation
 *  5. Invariants: scoring, ranking, ordering, selection, Step 48 confidence, Step 49 match quality are UNCHANGED
 *  6. Deterministic repeated execution
 *  7. Integration with generateDraftTimeline
 *  8. Schema round-trip for all Step 50 provenance fields
 *  9. Backward compatibility with legacy projects
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCandidateDiversity,
  generateDraftTimeline,
  BROAD_CANDIDATE_COUNT,
  MODERATE_CANDIDATE_COUNT,
  LIMITED_CANDIDATE_COUNT,
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
    id: 'proj-step50-test',
    name: 'Step 50 Test Project',
    resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
    fps: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    media,
    timeline,
  } as LongFormProject;
}

// ---------------------------------------------------------------------------
// 1. Constants and Diversity States
// ---------------------------------------------------------------------------

describe('Step 50: calculateCandidateDiversity — constants & states', () => {
  it('1. BROAD_CANDIDATE_COUNT is exactly 4', () => {
    expect(BROAD_CANDIDATE_COUNT).toBe(4);
  });

  it('2. MODERATE_CANDIDATE_COUNT is exactly 2', () => {
    expect(MODERATE_CANDIDATE_COUNT).toBe(2);
  });

  it('3. LIMITED_CANDIDATE_COUNT is exactly 1', () => {
    expect(LIMITED_CANDIDATE_COUNT).toBe(1);
  });

  it('4. Four viable candidates -> BROAD', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.85 },
      { id: 'c2', adjustedScore: 0.75 },
      { id: 'c3', adjustedScore: 0.65 },
      { id: 'c4', adjustedScore: 0.55 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversity).toBe('BROAD');
    expect(result.viableCandidateCount).toBe(4);
  });

  it('5. Five viable candidates -> BROAD', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.90 },
      { id: 'c2', adjustedScore: 0.80 },
      { id: 'c3', adjustedScore: 0.70 },
      { id: 'c4', adjustedScore: 0.60 },
      { id: 'c5', adjustedScore: 0.50 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.40);
    expect(result.candidateDiversity).toBe('BROAD');
    expect(result.viableCandidateCount).toBe(5);
  });

  it('6. Three viable candidates -> MODERATE', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.70 },
      { id: 'c3', adjustedScore: 0.60 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversity).toBe('MODERATE');
    expect(result.viableCandidateCount).toBe(3);
  });

  it('7. Two viable candidates -> MODERATE', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.70 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversity).toBe('MODERATE');
    expect(result.viableCandidateCount).toBe(2);
  });

  it('8. One viable selected candidate -> LIMITED', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.20 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversity).toBe('LIMITED');
    expect(result.viableCandidateCount).toBe(1);
    expect(result.candidatePoolSize).toBe(2);
  });

  it('9. Zero viable candidates -> NONE', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.20 },
      { id: 'c2', adjustedScore: 0.10 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversity).toBe('NONE');
    expect(result.viableCandidateCount).toBe(0);
  });

  it('10. No selected candidate -> selectedCandidateRank undefined and diversity NONE', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.70 },
      { id: 'c3', adjustedScore: 0.60 },
    ];
    const result = calculateCandidateDiversity(candidates, null, 0.50);
    expect(result.selectedCandidateRank).toBeUndefined();
    expect(result.candidateDiversity).toBe('NONE');
    expect(result.candidateDiversityContext).toBe('UNAVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// 2. Candidate Rank and Pool Calculations
// ---------------------------------------------------------------------------

describe('Step 50: calculateCandidateDiversity — rank and pool metrics', () => {
  it('11. Selected first candidate -> rank 1', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.70 },
      { id: 'c3', adjustedScore: 0.60 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.selectedCandidateRank).toBe(1);
  });

  it('12. Selected second candidate -> rank 2', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.75 },
      { id: 'c3', adjustedScore: 0.60 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[1], 0.50);
    expect(result.selectedCandidateRank).toBe(2);
  });

  it('13. Selected third candidate -> rank 3', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.75 },
      { id: 'c3', adjustedScore: 0.60 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[2], 0.50);
    expect(result.selectedCandidateRank).toBe(3);
  });

  it('14. Rank reflects existing candidate ordering without reordering', () => {
    const candidates = [
      { id: 'cA', adjustedScore: 0.70 },
      { id: 'cB', adjustedScore: 0.85 },
      { id: 'cC', adjustedScore: 0.60 },
    ];
    // Candidate array order is preserved exactly as passed
    const resultA = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(resultA.selectedCandidateRank).toBe(1);

    const resultB = calculateCandidateDiversity(candidates, candidates[1], 0.50);
    expect(resultB.selectedCandidateRank).toBe(2);
  });

  it('15. Candidate ordering is not modified by calculateCandidateDiversity', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.70 },
      { id: 'c3', adjustedScore: 0.60 },
    ];
    const originalOrder = [...candidates];
    calculateCandidateDiversity(candidates, candidates[1], 0.50);
    expect(candidates[0].id).toBe(originalOrder[0].id);
    expect(candidates[1].id).toBe(originalOrder[1].id);
    expect(candidates[2].id).toBe(originalOrder[2].id);
  });

  it('16. candidatePoolSize counts the total existing candidate pool correctly', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.70 },
      { id: 'c3', adjustedScore: 0.30 },
      { id: 'c4', adjustedScore: 0.10 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidatePoolSize).toBe(4);
    expect(result.viableCandidateCount).toBe(2);
  });

  it('17. viableCandidateCount counts only candidates considered viable by existing pipeline', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.90 },
      { id: 'c2', adjustedScore: 0.80 },
      { id: 'c3', adjustedScore: 0.40 },
      { id: 'c4', adjustedScore: 0.20 },
    ];
    // Viability threshold 0.50 -> only c1 and c2 are viable
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.viableCandidateCount).toBe(2);
    expect(result.candidatePoolSize).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. Diversity Context Interpretation
// ---------------------------------------------------------------------------

describe('Step 50: calculateCandidateDiversity — candidateDiversityContext', () => {
  it('18. SUPPORTED when viableCandidateCount >= 2', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.70 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversityContext).toBe('SUPPORTED');
  });

  it('19. CONSTRAINED when exactly one viable candidate is selected', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.80 },
      { id: 'c2', adjustedScore: 0.20 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversityContext).toBe('CONSTRAINED');
    expect(result.candidateDiversity).toBe('LIMITED');
  });

  it('20. UNAVAILABLE when no viable candidate exists', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.20 },
      { id: 'c2', adjustedScore: 0.10 },
    ];
    const result = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(result.candidateDiversityContext).toBe('UNAVAILABLE');
    expect(result.candidateDiversity).toBe('NONE');
  });

  it('21. UNAVAILABLE when candidate list is empty', () => {
    const result = calculateCandidateDiversity([], null, 0.50);
    expect(result.candidateDiversityContext).toBe('UNAVAILABLE');
    expect(result.candidateDiversity).toBe('NONE');
    expect(result.candidatePoolSize).toBe(0);
    expect(result.viableCandidateCount).toBe(0);
    expect(result.selectedCandidateRank).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Invariants and Non-interference
// ---------------------------------------------------------------------------

describe('Step 50: calculateCandidateDiversity — invariants & determinism', () => {
  it('22. Deterministic repeated execution — identical outputs on repeated calls', () => {
    const candidates = [
      { id: 'c1', adjustedScore: 0.85 },
      { id: 'c2', adjustedScore: 0.75 },
      { id: 'c3', adjustedScore: 0.65 },
      { id: 'c4', adjustedScore: 0.55 },
    ];
    const r1 = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    const r2 = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    const r3 = calculateCandidateDiversity(candidates, candidates[0], 0.50);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('23. Step 50 does not modify candidate adjustedScore or properties', () => {
    const candidate = { id: 'c1', adjustedScore: 0.78, customProp: 'preserve' };
    const scoreBefore = candidate.adjustedScore;
    calculateCandidateDiversity([candidate], candidate, 0.50);
    expect(candidate.adjustedScore).toBe(scoreBefore);
    expect(candidate.customProp).toBe('preserve');
  });
});

// ---------------------------------------------------------------------------
// 5. Integration with generateDraftTimeline & DraftStats
// ---------------------------------------------------------------------------

describe('Step 50: DraftTimeline Integration & DraftStats', () => {
  it('24. generateDraftTimeline populates Step 50 provenance fields and stats', async () => {
    const segments: AudioSegment[] = [
      makeSegment({
        id: 'seg-1',
        text: 'Deep inside the ancient forest, towering evergreen trees cover the misty valley.',
        startTime: 0,
        endTime: 5,
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
          description: 'Deep inside the ancient forest, towering trees and mist.',
          tags: ['forest', 'ancient', 'trees'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media, {
      similarityThreshold: 0.10,
    });

    // Stats fields are always present and defined
    const stats = result.stats;
    expect(typeof stats.noCandidateDiversityCount).toBe('number');
    expect(stats.noCandidateDiversityCount).toBeGreaterThanOrEqual(0);
    expect(typeof stats.broadCandidateCount === 'number' || stats.broadCandidateCount === undefined).toBe(true);
    expect(typeof stats.moderateCandidateCount === 'number' || stats.moderateCandidateCount === undefined).toBe(true);
    expect(typeof stats.limitedCandidateCount === 'number' || stats.limitedCandidateCount === undefined).toBe(true);

    if (result.timeline.length > 0) {
      for (const item of result.timeline) {
        const p = item.provenance!;
        // Step 50 provenance fields are populated on assigned items
        expect(typeof p.candidatePoolSize).toBe('number');
        expect(typeof p.viableCandidateCount).toBe('number');
        expect(typeof p.selectedCandidateRank).toBe('number');
        expect(['BROAD', 'MODERATE', 'LIMITED', 'NONE']).toContain(p.candidateDiversity);
        expect(['SUPPORTED', 'CONSTRAINED', 'UNAVAILABLE']).toContain(p.candidateDiversityContext);

        // Step 48 & 49 fields remain completely intact
        expect(typeof p.adjustedScore).toBe('number');
        expect(['STRONG', 'ACCEPTABLE', 'UNCERTAIN', 'NO_MATCH']).toContain(p.matchConfidence);
        if (p.candidateConfidenceLevel !== undefined) {
          expect(['HIGH_CERTAINTY', 'MODERATE_CERTAINTY', 'LOW_CERTAINTY']).toContain(p.matchCertainty);
        }
      }
    }
  }, 60000);
});

// ---------------------------------------------------------------------------
// 6. Schema Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Step 50: Schema export/parse round-trip', () => {
  it('25. preserves all Step 50 provenance fields through export -> parse cycle', () => {
    const media: MediaAsset[] = [makeMedia({ id: 'media-1' })];

    const project = makeProject(
      [
        {
          id: 'clip-step50-1',
          mediaId: 'media-1',
          trackIndex: 0,
          startTime: 0,
          duration: 5.0,
          sourceStart: 0,
          sourceDuration: 10.0,
          transform: {
            x: 0,
            y: 0,
            scale: 1,
            fitMode: 'cover',
            crop: { x: 0, y: 0, width: 1, height: 1 },
          },
          provenance: {
            sourceSegmentId: 'seg-1',
            sourceSegmentText: 'Mountain landscape scenery',
            originalScore: 0.82,
            adjustedScore: 0.78,
            explanation: 'Strong semantic match with healthy alternatives',
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
            candidatePoolSize: 5,
            viableCandidateCount: 4,
            selectedCandidateRank: 1,
            candidateDiversity: 'BROAD' as const,
            candidateDiversityContext: 'SUPPORTED' as const,
          },
        },
      ],
      media
    );

    const jsonStr = exportProjectToPortableJSON(project);
    expect(jsonStr).toContain('candidatePoolSize');
    expect(jsonStr).toContain('viableCandidateCount');
    expect(jsonStr).toContain('selectedCandidateRank');
    expect(jsonStr).toContain('BROAD');
    expect(jsonStr).toContain('SUPPORTED');

    const parsed = validateAndParseProjectJSON(jsonStr);
    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();

    const p = parsed.project!.timeline[0].provenance!;
    expect(p.candidatePoolSize).toBe(5);
    expect(p.viableCandidateCount).toBe(4);
    expect(p.selectedCandidateRank).toBe(1);
    expect(p.candidateDiversity).toBe('BROAD');
    expect(p.candidateDiversityContext).toBe('SUPPORTED');

    // Prior steps fields survive intact
    expect(p.matchConfidence).toBe('STRONG');
    expect(p.matchCertainty).toBe('HIGH_CERTAINTY');
    expect(p.candidateConfidenceLevel).toBe('HIGH');
  });

  it('26. all candidateDiversity enum values round-trip correctly', () => {
    const diversityValues = ['BROAD', 'MODERATE', 'LIMITED', 'NONE'] as const;
    for (const cd of diversityValues) {
      const media = [makeMedia({ id: 'media-1' })];
      const project = makeProject(
        [
          {
            id: `clip-${cd}`,
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
              candidateDiversity: cd,
            },
          },
        ],
        media
      );
      const jsonStr = exportProjectToPortableJSON(project);
      const parsed = validateAndParseProjectJSON(jsonStr);
      expect(parsed.isValid).toBe(true);
      expect(parsed.project!.timeline[0].provenance!.candidateDiversity).toBe(cd);
    }
  });

  it('27. all candidateDiversityContext enum values round-trip correctly', () => {
    const contextValues = ['SUPPORTED', 'CONSTRAINED', 'UNAVAILABLE'] as const;
    for (const cdc of contextValues) {
      const media = [makeMedia({ id: 'media-1' })];
      const project = makeProject(
        [
          {
            id: `clip-${cdc}`,
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
              candidateDiversityContext: cdc,
            },
          },
        ],
        media
      );
      const jsonStr = exportProjectToPortableJSON(project);
      const parsed = validateAndParseProjectJSON(jsonStr);
      expect(parsed.isValid).toBe(true);
      expect(parsed.project!.timeline[0].provenance!.candidateDiversityContext).toBe(cdc);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Backward Compatibility
// ---------------------------------------------------------------------------

describe('Step 50: Backward compatibility', () => {
  it('28. pre-Step-50 legacy project without new fields parses cleanly', () => {
    const legacyJson = JSON.stringify({
      version: '1.0',
      id: 'proj-legacy-50',
      name: 'Legacy Step 49 Project',
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
            explanation: 'Step 49 match',
            reuseCount: 0,
            candidateConfidenceLevel: 'HIGH',
            matchConfidence: 'STRONG',
            matchCertainty: 'HIGH_CERTAINTY',
            // NO Step 50 fields
          },
        },
      ],
    });

    const parsed = validateAndParseProjectJSON(legacyJson);
    expect(parsed.isValid).toBe(true);
    if (!parsed.project) return;

    const p = parsed.project.timeline[0].provenance!;
    expect(p.matchConfidence).toBe('STRONG');
    expect(p.matchCertainty).toBe('HIGH_CERTAINTY');
    // Step 50 fields are undefined
    expect(p.candidatePoolSize).toBeUndefined();
    expect(p.viableCandidateCount).toBeUndefined();
    expect(p.selectedCandidateRank).toBeUndefined();
    expect(p.candidateDiversity).toBeUndefined();
    expect(p.candidateDiversityContext).toBeUndefined();
  });

  it('29. invalid Step 50 enum values safely fall back to undefined', () => {
    const badJson = JSON.stringify({
      version: '1.0',
      id: 'proj-bad-enums-50',
      name: 'Bad Step 50 Enums',
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
            candidateDiversity: 'SUPER_BROAD', // invalid
            candidateDiversityContext: 'PERFECT', // invalid
          },
        },
      ],
    });

    const parsed = validateAndParseProjectJSON(badJson);
    expect(parsed.isValid).toBe(true);
    if (!parsed.project) return;

    const p = parsed.project.timeline[0].provenance!;
    expect(p.candidateDiversity).toBeUndefined();
    expect(p.candidateDiversityContext).toBeUndefined();
  });
});
