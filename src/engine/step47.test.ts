import { describe, it, expect } from 'vitest';
import {
  VISUAL_RANKING_SEMANTIC_SAFETY_BAND,
  compareCandidatesWithSemanticProtection,
  applySemanticRankingProtection,
  generateDraftTimeline,
} from './draftTimeline';
import {
  AudioSegment,
  MediaAsset,
  LongFormProject,
} from '../types/project';
import { exportProjectToPortableJSON, validateAndParseProjectJSON } from './schema';

interface TestCandidate {
  id: string;
  rawScore: number;
  adjustedScore: number;
  boundedVisualIntelligence: number;
  semanticRankingProtectionApplied?: boolean;
  semanticRankingProtectionReason?: string;
}

function createTestMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: overrides.id || 'media_1',
    name: overrides.name || 'test_video.mp4',
    type: overrides.type || 'video',
    url: overrides.url || 'blob:http://localhost/mock-video',
    width: overrides.width || 1920,
    height: overrides.height || 1080,
    duration: overrides.duration !== undefined ? overrides.duration : 10.0,
    aspectRatio: overrides.aspectRatio || 16 / 9,
    aspectRatioLabel: overrides.aspectRatioLabel || '16:9',
    createdAt: overrides.createdAt || 1700000000000,
    analysis: overrides.analysis || {
      analyzed: true,
      description: 'Default test video description',
      tags: ['test', 'sample'],
    },
  };
}

describe('Step 47: Visual Intelligence Calibration & Ranking Protection', () => {
  // ---------------------------------------------------------------------------
  // 1. Constant Verification
  // ---------------------------------------------------------------------------
  describe('1. Safety Band Constant', () => {
    it('VISUAL_RANKING_SEMANTIC_SAFETY_BAND is exactly 0.100', () => {
      expect(VISUAL_RANKING_SEMANTIC_SAFETY_BAND).toBe(0.100);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Identical Semantic Scores
  // ---------------------------------------------------------------------------
  describe('2. Identical Semantic Scores', () => {
    it('candidates with identical raw scores are ranked by adjustedScore', () => {
      const candA = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.83,
        boundedVisualIntelligence: 0.03,
      };
      const candB = {
        id: 'B',
        rawScore: 0.80,
        adjustedScore: 0.85,
        boundedVisualIntelligence: 0.05,
      };

      const result = applySemanticRankingProtection([candA, candB]);
      expect(result[0].id).toBe('B');
      expect(result[1].id).toBe('A');
    });

    it('candidates with identical raw and adjusted scores use rawScore tie-breaker deterministically', () => {
      const candA = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.80,
        boundedVisualIntelligence: 0.00,
      };
      const candB = {
        id: 'B',
        rawScore: 0.80,
        adjustedScore: 0.80,
        boundedVisualIntelligence: 0.00,
      };

      const cmp = compareCandidatesWithSemanticProtection(candA, candB);
      expect(cmp).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Close Candidates (delta < 0.100): Visual Intelligence Is Fully Active
  // ---------------------------------------------------------------------------
  describe('3. Close Candidates (Delta Semantic < 0.100)', () => {
    it('allows a lower semantic candidate (+0.050 visual bonus) to outrank a higher candidate when delta = 0.050', () => {
      const candA: TestCandidate = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.75,
        boundedVisualIntelligence: -0.050,
      };
      const candB: TestCandidate = {
        id: 'B',
        rawScore: 0.75,
        adjustedScore: 0.80,
        boundedVisualIntelligence: 0.050,
      };

      const result = applySemanticRankingProtection([candA, candB]);
      expect(result[0].id).toBe('B');
      expect(result[1].id).toBe('A');
      expect(result[0].semanticRankingProtectionApplied).toBeFalsy();
    });

    it('preserves higher candidate when visual intelligence differences do not overcome the semantic gap', () => {
      const candA = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.81,
        boundedVisualIntelligence: 0.010,
      };
      const candB = {
        id: 'B',
        rawScore: 0.75,
        adjustedScore: 0.78,
        boundedVisualIntelligence: 0.030,
      };

      const result = applySemanticRankingProtection([candA, candB]);
      expect(result[0].id).toBe('A');
      expect(result[1].id).toBe('B');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Exact Boundary (delta = 0.100): Protection Invariant Strictly Enforced
  // ---------------------------------------------------------------------------
  describe('4. Exact Boundary (Delta Semantic = 0.100)', () => {
    it('strictly prevents Candidate B (0.70) with max visual bonus from outranking Candidate A (0.80) with max visual penalty', () => {
      const candA = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.75,
        boundedVisualIntelligence: -0.050,
      };
      const candB = {
        id: 'B',
        rawScore: 0.70,
        adjustedScore: 0.75,
        boundedVisualIntelligence: 0.050,
      };

      const cmp = compareCandidatesWithSemanticProtection(candA, candB);
      expect(cmp).toBeLessThan(0);

      const result = applySemanticRankingProtection([candB, candA]);
      expect(result[0].id).toBe('A');
      expect(result[1].id).toBe('B');
    });

    it('strictly protects Candidate A when A has adjustedScore 0.76 and B has adjustedScore 0.77 with delta = 0.100', () => {
      const candA: TestCandidate = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.760,
        boundedVisualIntelligence: -0.040,
      };
      const candB: TestCandidate = {
        id: 'B',
        rawScore: 0.70,
        adjustedScore: 0.770,
        boundedVisualIntelligence: 0.050,
      };

      const result = applySemanticRankingProtection([candB, candA]);
      expect(result[0].id).toBe('A');
      expect(result[1].id).toBe('B');
      expect(result[0].semanticRankingProtectionApplied).toBe(true);
      expect(result[0].semanticRankingProtectionReason).toContain('Semantic ranking protection preserved top candidate');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Large Semantic Gaps (delta > 0.100): Strict Hierarchy Preservation
  // ---------------------------------------------------------------------------
  describe('5. Large Semantic Gaps (Delta Semantic > 0.100)', () => {
    it('protects Candidate A (0.80) against Candidate B (0.68) with delta = 0.120', () => {
      const candA = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.750,
        boundedVisualIntelligence: -0.050,
      };
      const candB = {
        id: 'B',
        rawScore: 0.68,
        adjustedScore: 0.730,
        boundedVisualIntelligence: 0.050,
      };

      const result = applySemanticRankingProtection([candB, candA]);
      expect(result[0].id).toBe('A');
      expect(result[1].id).toBe('B');
    });

    it('protects Candidate A (0.90) against Candidate B (0.60) with delta = 0.300', () => {
      const candA = {
        id: 'A',
        rawScore: 0.90,
        adjustedScore: 0.850,
        boundedVisualIntelligence: -0.050,
      };
      const candB = {
        id: 'B',
        rawScore: 0.60,
        adjustedScore: 0.650,
        boundedVisualIntelligence: 0.050,
      };

      const result = applySemanticRankingProtection([candB, candA]);
      expect(result[0].id).toBe('A');
      expect(result[1].id).toBe('B');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Negative Visual Intelligence Symmetry
  // ---------------------------------------------------------------------------
  describe('6. Symmetry and Inverse Ordering', () => {
    it('protects higher semantic candidate regardless of input array order', () => {
      const candA = {
        id: 'A',
        rawScore: 0.80,
        adjustedScore: 0.750,
        boundedVisualIntelligence: -0.050,
      };
      const candB = {
        id: 'B',
        rawScore: 0.70,
        adjustedScore: 0.750,
        boundedVisualIntelligence: 0.050,
      };

      const res1 = applySemanticRankingProtection([candA, candB]);
      const res2 = applySemanticRankingProtection([candB, candA]);

      expect(res1[0].id).toBe('A');
      expect(res2[0].id).toBe('A');
    });

    it('symmetrically handles comparison when candidate B has higher raw semantic score', () => {
      const candLow = {
        id: 'Low',
        rawScore: 0.70,
        adjustedScore: 0.750,
        boundedVisualIntelligence: 0.050,
      };
      const candHigh = {
        id: 'High',
        rawScore: 0.80,
        adjustedScore: 0.750,
        boundedVisualIntelligence: -0.050,
      };

      const cmp = compareCandidatesWithSemanticProtection(candLow, candHigh);
      expect(cmp).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Multi-Candidate Ranking Stability
  // ---------------------------------------------------------------------------
  describe('7. Multi-Candidate Ranking Stability', () => {
    it('correctly ranks a complex list of 5 candidates respecting safety bands and visual bonuses', () => {
      const candidates = [
        { id: 'C1', rawScore: 0.50, adjustedScore: 0.55, boundedVisualIntelligence: 0.050 },
        { id: 'C2', rawScore: 0.62, adjustedScore: 0.60, boundedVisualIntelligence: -0.020 },
        { id: 'C3', rawScore: 0.71, adjustedScore: 0.76, boundedVisualIntelligence: 0.050 },
        { id: 'C4', rawScore: 0.82, adjustedScore: 0.77, boundedVisualIntelligence: -0.050 },
        { id: 'C5', rawScore: 0.85, adjustedScore: 0.88, boundedVisualIntelligence: 0.030 },
      ];

      const ranked = applySemanticRankingProtection(candidates);
      const rankedIds = ranked.map((c) => c.id);

      expect(rankedIds).toEqual(['C5', 'C4', 'C3', 'C2', 'C1']);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Determinism & Stability
  // ---------------------------------------------------------------------------
  describe('8. Determinism', () => {
    it('produces identical output over repeated invocations', () => {
      const candidates = [
        { id: 'A', rawScore: 0.80, adjustedScore: 0.75, boundedVisualIntelligence: -0.050 },
        { id: 'B', rawScore: 0.70, adjustedScore: 0.75, boundedVisualIntelligence: 0.050 },
      ];

      const run1 = applySemanticRankingProtection(candidates);
      const run2 = applySemanticRankingProtection(candidates);

      expect(run1[0].id).toBe(run2[0].id);
      expect(run1[0].adjustedScore).toBe(run2[0].adjustedScore);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. DraftTimeline Integration & DraftStats
  // ---------------------------------------------------------------------------
  describe('9. DraftTimeline Integration & DraftStats', () => {
    it('generateDraftTimeline incorporates semantic ranking safety band in stats', async () => {
      const segments: AudioSegment[] = [
        {
          id: 'seg_1',
          startTime: 0,
          endTime: 4,
          text: 'Deep inside the ancient forest, towering evergreen trees cover the misty valley.',
        },
      ];

      const mediaLibrary: MediaAsset[] = [
        createTestMediaAsset({
          id: 'media_forest_high',
          name: 'ancient_forest.mp4',
          analysis: {
            analyzed: true,
            description: 'Deep inside the ancient forest, towering evergreen trees cover the misty valley.',
            tags: ['forest', 'ancient', 'trees', 'misty'],
          },
        }),
      ];

      const result = await generateDraftTimeline(segments, mediaLibrary, {
        similarityThreshold: 0.20,
      });

      expect(result.timeline.length).toBe(1);
      expect(result.stats.semanticRankingSafetyBandUsed).toBe(0.100);
      expect(typeof result.stats.semanticProtectionAdjustments).toBe('number');
      expect(result.timeline[0].provenance?.rawVisualIntelligence).toBeDefined();
      expect(result.timeline[0].provenance?.boundedVisualIntelligence).toBeDefined();
      expect(result.timeline[0].provenance?.visualIntelligenceBudget).toBe(0.050);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Portable Schema Round-Trip Serialization
  // ---------------------------------------------------------------------------
  describe('10. Portable Schema Round-Trip Serialization', () => {
    it('exports and validates semanticRankingProtectionApplied and semanticRankingProtectionReason', () => {
      const project: LongFormProject = {
        version: '1.0',
        id: 'proj_step47_test',
        name: 'Step 47 Protection Project',
        resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
        fps: 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        media: [
          createTestMediaAsset({
            id: 'm1',
            name: 'epic_shot.mp4',
            analysis: {
              analyzed: true,
              description: 'Epic shot',
              tags: ['wide', 'sunset'],
            },
          }),
        ],
        timeline: [
          {
            id: 'clip_step47_1',
            mediaId: 'm1',
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
              sourceSegmentId: 'seg_1',
              sourceSegmentText: 'Expansive vista',
              originalScore: 0.85,
              adjustedScore: 0.80,
              explanation: 'Strong semantic match',
              reuseCount: 0,
              rawVisualIntelligence: -0.060,
              boundedVisualIntelligence: -0.050,
              visualIntelligenceBudget: 0.050,
              semanticRankingProtectionApplied: true,
              semanticRankingProtectionReason: 'Semantic ranking protection preserved top candidate (raw score: 0.85) ahead of candidate with lower semantic match (raw score: 0.72) across >= 0.10 safety band.',
            },
          },
        ],
      };

      const jsonStr = exportProjectToPortableJSON(project);
      expect(jsonStr).toContain('semanticRankingProtectionApplied');
      expect(jsonStr).toContain('semanticRankingProtectionReason');

      const parseResult = validateAndParseProjectJSON(jsonStr);
      expect(parseResult.isValid).toBe(true);
      expect(parseResult.project).toBeDefined();
      const prov = parseResult.project?.timeline[0]?.provenance;
      expect(prov?.semanticRankingProtectionApplied).toBe(true);
      expect(prov?.semanticRankingProtectionReason).toContain('Semantic ranking protection preserved top candidate');
      expect(prov?.rawVisualIntelligence).toBe(-0.060);
      expect(prov?.boundedVisualIntelligence).toBe(-0.050);
      expect(prov?.visualIntelligenceBudget).toBe(0.050);
    });

    it('maintains full backward compatibility for legacy projects without Step 47 fields', () => {
      const legacyJson = JSON.stringify({
        version: '1.0',
        id: 'legacy_proj',
        name: 'Legacy Project',
        resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
        fps: 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        media: [createTestMediaAsset({ id: 'm1' })],
        timeline: [
          {
            id: 'item_legacy',
            mediaId: 'm1',
            trackIndex: 0,
            startTime: 0,
            duration: 5,
            sourceStart: 0,
            sourceDuration: 5,
            transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
            provenance: {
              originalScore: 0.75,
              adjustedScore: 0.78,
            },
          },
        ],
      });

      const parsed = validateAndParseProjectJSON(legacyJson);
      expect(parsed.isValid).toBe(true);
      expect(parsed.project!.timeline[0].provenance?.semanticRankingProtectionApplied).toBeUndefined();
      expect(parsed.project!.timeline[0].provenance?.semanticRankingProtectionReason).toBeUndefined();
      expect(parsed.project!.timeline[0].provenance?.boundedVisualIntelligence).toBeUndefined();
    });
  });
});
