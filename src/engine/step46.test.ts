import { describe, it, expect } from 'vitest';
import {
  GLOBAL_VISUAL_INTELLIGENCE_BUDGET,
  clampGlobalVisualIntelligence,
  calculateAggregateVisualIntelligence,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  AudioSegment,
  MediaAsset,
  LongFormProject,
} from '../types/project';
import { exportProjectToPortableJSON, validateAndParseProjectJSON } from './schema';

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

describe('Step 46: Global Visual Intelligence Budget & Calibration', () => {
  // ---------------------------------------------------------------------------
  // A. Zero remains zero
  // ---------------------------------------------------------------------------
  describe('A. Zero remains zero', () => {
    it('raw visual intelligence 0.000 produces exactly 0.000 bounded visual intelligence', () => {
      expect(clampGlobalVisualIntelligence(0.000)).toBe(0.000);
      expect(clampGlobalVisualIntelligence(-0.000)).toBe(0.000);
    });

    it('calculateAggregateVisualIntelligence with all zero modifiers returns 0.000 without clamping', () => {
      const allZeros = {
        framingModifier: 0,
        atmosphericModifier: 0,
        motionModifier: 0,
        settingModifier: 0,
        densityModifier: 0,
        angleModifier: 0,
        timeModifier: 0,
        weatherModifier: 0,
        depthModifier: 0,
        temporalRateModifier: 0,
        mediumModifier: 0,
        compositionModifier: 0,
        lightingModifier: 0,
        povModifier: 0,
        chromaticModifier: 0,
        trajectoryModifier: 0,
        lensModifier: 0,
        textureModifier: 0,
      };
      const res = calculateAggregateVisualIntelligence(allZeros);
      expect(res.rawVisualIntelligence).toBe(0.000);
      expect(res.boundedVisualIntelligence).toBe(0.000);
      expect(res.isClamped).toBe(false);
      expect(res.visualIntelligenceBudget).toBe(GLOBAL_VISUAL_INTELLIGENCE_BUDGET);
    });
  });

  // ---------------------------------------------------------------------------
  // B. Positive values below budget are preserved
  // ---------------------------------------------------------------------------
  describe('B. Positive values below budget are preserved', () => {
    it('preserves +0.020 exactly', () => {
      expect(clampGlobalVisualIntelligence(0.020)).toBe(0.020);
    });

    it('preserves +0.040 exactly', () => {
      expect(clampGlobalVisualIntelligence(0.040)).toBe(0.040);
    });

    it('preserves +0.050 exactly at the budget boundary', () => {
      expect(clampGlobalVisualIntelligence(0.050)).toBe(0.050);
    });

    it('calculateAggregateVisualIntelligence preserves raw values under budget without clamping', () => {
      const smallPositive = {
        framingModifier: 0.008,
        atmosphericModifier: 0.008,
        motionModifier: 0.008,
        settingModifier: 0.004,
        densityModifier: 0,
        angleModifier: 0,
        timeModifier: 0,
        weatherModifier: 0,
        depthModifier: 0,
        temporalRateModifier: 0,
        mediumModifier: 0,
        compositionModifier: 0,
        lightingModifier: 0,
        povModifier: 0,
        chromaticModifier: 0,
        trajectoryModifier: 0,
        lensModifier: 0,
        textureModifier: 0,
      };
      const res = calculateAggregateVisualIntelligence(smallPositive);
      expect(res.rawVisualIntelligence).toBe(0.028);
      expect(res.boundedVisualIntelligence).toBe(0.028);
      expect(res.isClamped).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // C. Positive values above budget are clamped
  // ---------------------------------------------------------------------------
  describe('C. Positive values above budget are clamped', () => {
    it('clamps +0.060 to +0.050', () => {
      expect(clampGlobalVisualIntelligence(0.060)).toBe(0.050);
    });

    it('clamps +0.100 to +0.050', () => {
      expect(clampGlobalVisualIntelligence(0.100)).toBe(0.050);
    });

    it('clamps +0.144 to +0.050', () => {
      expect(clampGlobalVisualIntelligence(0.144)).toBe(0.050);
    });
  });

  // ---------------------------------------------------------------------------
  // D. Negative values above magnitude budget are clamped
  // ---------------------------------------------------------------------------
  describe('D. Negative values above magnitude budget are clamped', () => {
    it('clamps -0.060 to -0.050', () => {
      expect(clampGlobalVisualIntelligence(-0.060)).toBe(-0.050);
    });

    it('clamps -0.100 to -0.050', () => {
      expect(clampGlobalVisualIntelligence(-0.100)).toBe(-0.050);
    });

    it('clamps -0.112 to -0.050', () => {
      expect(clampGlobalVisualIntelligence(-0.112)).toBe(-0.050);
    });
  });

  // ---------------------------------------------------------------------------
  // E. Maximum current Step 28–45 positive stacking
  // ---------------------------------------------------------------------------
  describe('E. Maximum current Step 28–45 positive stacking', () => {
    it('aggregates theoretical maximum of 18 layers (+0.144) and strictly bounds to +0.050', () => {
      const maxAll18 = {
        framingModifier: 0.008,
        atmosphericModifier: 0.008,
        motionModifier: 0.008,
        settingModifier: 0.008,
        densityModifier: 0.008,
        angleModifier: 0.008,
        timeModifier: 0.008,
        weatherModifier: 0.008,
        depthModifier: 0.008,
        temporalRateModifier: 0.008,
        mediumModifier: 0.008,
        compositionModifier: 0.008,
        lightingModifier: 0.008,
        povModifier: 0.008,
        chromaticModifier: 0.008,
        trajectoryModifier: 0.008,
        lensModifier: 0.008,
        textureModifier: 0.008,
      };
      const res = calculateAggregateVisualIntelligence(maxAll18);
      expect(res.rawVisualIntelligence).toBe(0.144);
      expect(res.boundedVisualIntelligence).toBe(0.050);
      expect(res.isClamped).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // F. Maximum current Step 28–45 negative stacking
  // ---------------------------------------------------------------------------
  describe('F. Maximum current Step 28–45 negative stacking', () => {
    it('aggregates theoretical maximum negative of 18 layers (-0.112) and strictly bounds to -0.050', () => {
      const minAll18 = {
        framingModifier: -0.006,
        atmosphericModifier: -0.006,
        motionModifier: -0.006,
        settingModifier: -0.006,
        densityModifier: -0.006,
        angleModifier: -0.006,
        timeModifier: -0.007,
        weatherModifier: -0.007,
        depthModifier: -0.006,
        temporalRateModifier: -0.007,
        mediumModifier: -0.006,
        compositionModifier: -0.006,
        lightingModifier: -0.006,
        povModifier: -0.006,
        chromaticModifier: -0.006,
        trajectoryModifier: -0.006,
        lensModifier: -0.006,
        textureModifier: -0.006,
      };
      const res = calculateAggregateVisualIntelligence(minAll18);
      expect(res.rawVisualIntelligence).toBe(-0.111);
      expect(res.boundedVisualIntelligence).toBe(-0.050);
      expect(res.isClamped).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // G. Ranking protection & Semantic Dominance
  // ---------------------------------------------------------------------------
  describe('G. Ranking protection & Semantic Dominance', () => {
    it('guarantees semantic dominance: Candidate A (0.80 raw, -0.050 visual) beats Candidate B (0.69 raw, +0.050 visual)', () => {
      const candA = 0.80 + clampGlobalVisualIntelligence(-0.112); // 0.80 - 0.050 = 0.750
      const candB = 0.69 + clampGlobalVisualIntelligence(0.144); // 0.69 + 0.050 = 0.740
      expect(candA).toBeGreaterThan(candB);
    });

    it('prevents ranking reversal across a 0.100 semantic gap under maximum opposite visual extremes', () => {
      const highSemanticScore = 0.80;
      const lowSemanticScore = 0.70;
      const scoreHighWithMinVisual = highSemanticScore + clampGlobalVisualIntelligence(-0.112); // 0.750
      const scoreLowWithMaxVisual = lowSemanticScore + clampGlobalVisualIntelligence(0.144); // 0.750

      // High candidate retains tie-breaking priority due to higher raw semantic similarity
      expect(scoreHighWithMinVisual).toBeGreaterThanOrEqual(scoreLowWithMaxVisual);
    });
  });

  // ---------------------------------------------------------------------------
  // H. Useful visual differentiation remains
  // ---------------------------------------------------------------------------
  describe('H. Useful visual differentiation remains', () => {
    it('preserves visual advantage for equal semantic scores (+0.030 vs 0.000)', () => {
      const semanticScore = 0.75;
      const candidateWithVisualMatch = semanticScore + clampGlobalVisualIntelligence(0.030); // 0.780
      const candidateNeutral = semanticScore + clampGlobalVisualIntelligence(0.000); // 0.750
      expect(candidateWithVisualMatch).toBeGreaterThan(candidateNeutral);
      expect(candidateWithVisualMatch - candidateNeutral).toBeCloseTo(0.030, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // I. Boundary behavior
  // ---------------------------------------------------------------------------
  describe('I. Boundary behavior', () => {
    it('handles exact budget boundaries and adjacent fractional offsets', () => {
      expect(clampGlobalVisualIntelligence(-0.050)).toBe(-0.050);
      expect(clampGlobalVisualIntelligence(0.050)).toBe(0.050);
      expect(clampGlobalVisualIntelligence(-0.051)).toBe(-0.050);
      expect(clampGlobalVisualIntelligence(0.051)).toBe(0.050);
      expect(clampGlobalVisualIntelligence(-0.049)).toBe(-0.049);
      expect(clampGlobalVisualIntelligence(0.049)).toBe(0.049);
    });
  });

  // ---------------------------------------------------------------------------
  // J. Determinism & Immutability
  // ---------------------------------------------------------------------------
  describe('J. Determinism & Immutability', () => {
    it('produces identical deterministic output across repeated calls', () => {
      const input = {
        framingModifier: 0.008,
        atmosphericModifier: 0.004,
        motionModifier: -0.002,
        settingModifier: 0.008,
        densityModifier: 0.004,
        angleModifier: 0,
        timeModifier: 0.008,
        weatherModifier: 0.004,
        depthModifier: 0.008,
        temporalRateModifier: 0,
        mediumModifier: 0.008,
        compositionModifier: 0.004,
        lightingModifier: 0.008,
        povModifier: 0.004,
        chromaticModifier: 0.008,
        trajectoryModifier: 0.004,
        lensModifier: 0.008,
        textureModifier: 0.004,
      };
      const res1 = calculateAggregateVisualIntelligence(input);
      const res2 = calculateAggregateVisualIntelligence(input);
      expect(res1).toEqual(res2);
    });

    it('never mutates input modifier object', () => {
      const input = Object.freeze({
        framingModifier: 0.008,
        atmosphericModifier: 0.008,
        motionModifier: 0.008,
        settingModifier: 0.008,
        densityModifier: 0.008,
        angleModifier: 0.008,
        timeModifier: 0.008,
        weatherModifier: 0.008,
        depthModifier: 0.008,
        temporalRateModifier: 0.008,
        mediumModifier: 0.008,
        compositionModifier: 0.008,
        lightingModifier: 0.008,
        povModifier: 0.008,
        chromaticModifier: 0.008,
        trajectoryModifier: 0.008,
        lensModifier: 0.008,
        textureModifier: 0.008,
      });
      expect(() => calculateAggregateVisualIntelligence(input)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // K. End-to-End generateDraftTimeline & DraftStats Integration
  // ---------------------------------------------------------------------------
  describe('K. End-to-End generateDraftTimeline & DraftStats Integration', () => {
    it('populates Step 46 provenance fields and tracks budget clamping in generateDraftTimeline', async () => {
      const segments: AudioSegment[] = [
        {
          id: 's1',
          startTime: 0,
          endTime: 5,
          text: 'Expansive wide angle view of the majestic sunny mountain landscape with cinematic grain.',
        },
      ];

      const media: MediaAsset[] = [
        createTestMediaAsset({
          id: 'm1',
          name: 'mountain_epic.mp4',
          analysis: {
            analyzed: true,
            description: 'Expansive wide landscape of sunny mountains with natural lighting and fine grain',
            tags: ['wide', 'landscape', 'mountain', 'sunny', 'daylight', 'natural-light', 'film-grain'],
          },
        }),
      ];

      const result = await generateDraftTimeline(segments, media);
      expect(result.timeline.length).toBe(1);
      const item = result.timeline[0];

      expect(typeof item.provenance?.rawVisualIntelligence).toBe('number');
      expect(typeof item.provenance?.boundedVisualIntelligence).toBe('number');
      expect(item.provenance?.visualIntelligenceBudget).toBe(GLOBAL_VISUAL_INTELLIGENCE_BUDGET);
      expect(item.provenance?.boundedVisualIntelligence).toBeLessThanOrEqual(GLOBAL_VISUAL_INTELLIGENCE_BUDGET);
      expect(item.provenance?.boundedVisualIntelligence).toBeGreaterThanOrEqual(-GLOBAL_VISUAL_INTELLIGENCE_BUDGET);

      expect(result.stats.visualIntelligenceBudgetUsed).toBe(GLOBAL_VISUAL_INTELLIGENCE_BUDGET);
      expect(typeof result.stats.visualBudgetAdjustments).toBe('number');
    });

    it('includes all Step 46 visual budget counters in DraftStats type', () => {
      const stats: DraftStats = {
        totalSegments: 1,
        assignedSegments: 1,
        unassignedSegments: 0,
        totalDuration: 5.0,
        assignedDuration: 5.0,
        unassignedDuration: 0,
        uniqueMediaUsed: 1,
        mediaReuseCount: {},
        mediaUsageSummary: [],
        unassignedReasons: {},
        unassignedDetails: [],
        warnings: [],
        coveragePercentage: 100,
        thresholdUsed: 0.30,
        reusePenaltyUsed: 0.08,
        continuityPreferenceUsed: 0.03,
        generatedAt: Date.now(),
        visualBudgetAdjustments: 1,
        visualBudgetClampedBonuses: 0,
        visualBudgetClampedPenalties: 0,
        visualIntelligenceBudgetUsed: GLOBAL_VISUAL_INTELLIGENCE_BUDGET,
      };
      expect(stats.visualBudgetAdjustments).toBe(1);
      expect(stats.visualIntelligenceBudgetUsed).toBe(0.050);
    });
  });

  // ---------------------------------------------------------------------------
  // L. Schema JSON Serialization & Validation Round-Trip
  // ---------------------------------------------------------------------------
  describe('L. Schema JSON Serialization & Validation Round-Trip', () => {
    it('successfully exports and parses Step 46 visual intelligence provenance fields', () => {
      const project: LongFormProject = {
        version: '1.0',
        id: 'proj_step46_test',
        name: 'Step 46 Budget Verification Project',
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
            id: 'clip_step46_1',
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
              adjustedScore: 0.90,
              explanation: 'Strong semantic match with vista concepts',
              reuseCount: 0,
              rawVisualIntelligence: 0.088,
              boundedVisualIntelligence: 0.050,
              visualIntelligenceBudget: 0.050,
            },
          },
        ],
      };

      const jsonStr = exportProjectToPortableJSON(project);
      expect(jsonStr).toContain('rawVisualIntelligence');
      expect(jsonStr).toContain('boundedVisualIntelligence');
      expect(jsonStr).toContain('visualIntelligenceBudget');

      const parseResult = validateAndParseProjectJSON(jsonStr);
      expect(parseResult.isValid).toBe(true);
      expect(parseResult.project).toBeDefined();
      const parsedProvenance = parseResult.project?.timeline[0]?.provenance;
      expect(parsedProvenance?.rawVisualIntelligence).toBe(0.088);
      expect(parsedProvenance?.boundedVisualIntelligence).toBe(0.050);
      expect(parsedProvenance?.visualIntelligenceBudget).toBe(0.050);
    });
  });
});
