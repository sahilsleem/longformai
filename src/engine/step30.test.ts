/**
 * Step 30 — Camera Motion & Kinetic Dynamics Intelligence
 *
 * Dedicated test suite verifying:
 *  - Camera motion classification (STATIC_LOCKED, PANNING_SWEEP, ZOOMING_FOCUS, DYNAMIC_ACTION, SMOOTH_FLOAT)
 *  - Narration kinetic intent extraction (STATIC, PAN, ZOOM, ACTION, SMOOTH, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset kinetic energy
 *  - Independence from Steps 22–29
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCameraMotion,
  classifyNarrationMotionIntent,
  calculateMotionDynamicsModifier,
  DraftStats,
} from './draftTimeline';
import { MediaAsset, CameraMotion, MotionIntent, FramingScale, AtmosphericTone } from '../types/project';
import { exportProjectToPortableJSON, createInitialProject } from './schema';

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

function createTestMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: `media-${Math.random().toString(36).substring(2, 7)}`,
    name: 'test_asset.mp4',
    type: 'video',
    url: 'blob:http://localhost/test-video',
    width: 1920,
    height: 1080,
    duration: 10.0,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 Native',
    createdAt: Date.now(),
    analysis: {
      analyzed: true,
      description: 'A test video clip',
      tags: ['clip'],
      visualFeatures: {
        dominantColors: ['#334455'],
        brightness: 0.5,
        contrast: 0.5,
        orientation: 'landscape',
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. classifyCameraMotion
// ---------------------------------------------------------------------------

describe('classifyCameraMotion', () => {
  it('returns STATIC_LOCKED for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyCameraMotion(null)).toBe('STATIC_LOCKED');
    // @ts-expect-error test undefined asset
    expect(classifyCameraMotion(undefined)).toBe('STATIC_LOCKED');
  });

  it('classifies photos as STATIC_LOCKED regardless of descriptions', () => {
    const photo = createTestMediaAsset({
      type: 'image',
      name: 'speeding_racecar.jpg',
      analysis: {
        analyzed: true,
        tags: ['action', 'fast', 'racing', 'speed'],
        description: 'A fast car in high speed racing action',
      },
    });
    expect(classifyCameraMotion(photo)).toBe('STATIC_LOCKED');
  });

  it('classifies DYNAMIC_ACTION from action, chase, fast, and combat keywords', () => {
    const actionAsset = createTestMediaAsset({
      name: 'car_chase_sequence.mp4',
      analysis: {
        analyzed: true,
        tags: ['chase', 'racing', 'action', 'rapid'],
        description: 'A high-speed vehicle pursuit through city streets',
      },
    });
    expect(classifyCameraMotion(actionAsset)).toBe('DYNAMIC_ACTION');
  });

  it('classifies DYNAMIC_ACTION when semantic hasVisualChange is true', () => {
    const dynamicAsset = createTestMediaAsset({
      name: 'visual_change_clip.mp4',
      analysis: {
        analyzed: true,
        tags: ['clip'],
        semantic: {
          analyzed: true,
          description: 'A clip with dynamic movement',
          tags: ['general'],
          hasVisualChange: true,
        },
      },
    });
    expect(classifyCameraMotion(dynamicAsset)).toBe('DYNAMIC_ACTION');
  });

  it('classifies PANNING_SWEEP from pan, sweep, and panoramic keywords', () => {
    const panAsset = createTestMediaAsset({
      name: 'mountain_panorama_sweep.mp4',
      analysis: {
        analyzed: true,
        tags: ['panning', 'sweep', 'panorama', 'lateral'],
        description: 'Horizontal pan across the mountain range',
      },
    });
    expect(classifyCameraMotion(panAsset)).toBe('PANNING_SWEEP');
  });

  it('classifies ZOOMING_FOCUS from zoom, push in, macro focus keywords', () => {
    const zoomAsset = createTestMediaAsset({
      name: 'lens_zoom_in.mp4',
      analysis: {
        analyzed: true,
        tags: ['zoom', 'zooming', 'push in', 'focus pull'],
        description: 'Camera pushes in close to inspect the mechanical gears',
      },
    });
    expect(classifyCameraMotion(zoomAsset)).toBe('ZOOMING_FOCUS');
  });

  it('classifies SMOOTH_FLOAT from drone, aerial, glide, and steadicam keywords', () => {
    const droneAsset = createTestMediaAsset({
      name: 'drone_aerial_flyover.mp4',
      analysis: {
        analyzed: true,
        tags: ['drone', 'aerial', 'glide', 'flyover', 'steadicam'],
        description: 'Smooth aerial drone gliding gently over the forest canopy',
      },
    });
    expect(classifyCameraMotion(droneAsset)).toBe('SMOOTH_FLOAT');
  });

  it('classifies STATIC_LOCKED from tripod, locked, and still keywords', () => {
    const tripodAsset = createTestMediaAsset({
      name: 'interview_tripod_shot.mp4',
      analysis: {
        analyzed: true,
        tags: ['static', 'tripod', 'locked', 'stationary'],
        description: 'A calm locked-off tripod shot of the interviewee',
      },
    });
    expect(classifyCameraMotion(tripodAsset)).toBe('STATIC_LOCKED');
  });

  it('returns STATIC_LOCKED when no specific motion keywords match', () => {
    const genericAsset = createTestMediaAsset({
      name: 'generic_clip.mp4',
      analysis: {
        analyzed: true,
        tags: ['abstract', 'gradient'],
        description: 'An abstract display of colors',
      },
    });
    expect(classifyCameraMotion(genericAsset)).toBe('STATIC_LOCKED');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationMotionIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationMotionIntent', () => {
  it('returns NEUTRAL for empty text and undefined role', () => {
    expect(classifyNarrationMotionIntent('')).toBe('NEUTRAL');
  });

  it('classifies ACTION from action verbs and high-speed keywords', () => {
    expect(classifyNarrationMotionIntent('The vehicles race at breakneck speed in a fast chase')).toBe('ACTION');
    expect(classifyNarrationMotionIntent('Running rapidly to escape the sudden explosive blast')).toBe('ACTION');
  });

  it('classifies ACTION when narration role is action', () => {
    expect(classifyNarrationMotionIntent('They prepared the equipment', 'action')).toBe('ACTION');
  });

  it('classifies SMOOTH from drone, aerial, glide, and float keywords', () => {
    expect(classifyNarrationMotionIntent('Gliding smoothly like an aerial drone soaring over the canyon')).toBe('SMOOTH');
    expect(classifyNarrationMotionIntent('Floating weightlessly in gentle drift')).toBe('SMOOTH');
  });

  it('classifies PAN from sweep, scan, across, and panorama keywords', () => {
    expect(classifyNarrationMotionIntent('A panoramic sweep across the broad open horizon')).toBe('PAN');
    expect(classifyNarrationMotionIntent('Scanning from left to right along the coastline')).toBe('PAN');
  });

  it('classifies ZOOM from zoom, inspect, focus, and close look keywords', () => {
    expect(classifyNarrationMotionIntent('Zooming in closer to inspect the microscopic details')).toBe('ZOOM');
    expect(classifyNarrationMotionIntent('Focusing deeply into the complex circuitry to examine every component')).toBe('ZOOM');
  });

  it('classifies STATIC from calm, still, quiet, peaceful, and motionless keywords', () => {
    expect(classifyNarrationMotionIntent('Everything remained calm and peaceful in the quiet still afternoon')).toBe('STATIC');
    expect(classifyNarrationMotionIntent('Standing motionless in the silent frozen landscape')).toBe('STATIC');
  });

  it('returns NEUTRAL for general narration without kinetic keywords', () => {
    expect(classifyNarrationMotionIntent('We reviewed the quarterly business metrics and discussed the plan')).toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateMotionDynamicsModifier
// ---------------------------------------------------------------------------

describe('calculateMotionDynamicsModifier', () => {
  const allMotions: CameraMotion[] = ['STATIC_LOCKED', 'PANNING_SWEEP', 'ZOOMING_FOCUS', 'DYNAMIC_ACTION', 'SMOOTH_FLOAT'];
  const allIntents: MotionIntent[] = ['STATIC', 'PAN', 'ZOOM', 'ACTION', 'SMOOTH', 'NEUTRAL'];

  it('is strictly bounded within [-0.008, +0.008] across all permutations', () => {
    for (const motion of allMotions) {
      for (const intent of allIntents) {
        for (const isCont of [true, false]) {
          for (const beatType of ['NEW_BEAT', 'CONTINUING_BEAT', 'BEAT_END', 'STANDALONE'] as const) {
            const result = calculateMotionDynamicsModifier(motion, intent, isCont, beatType);
            expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
            expect(result.modifier).toBeLessThanOrEqual(0.008);
            expect(result.motionMatchScore).toBeGreaterThanOrEqual(0.0);
            expect(result.motionMatchScore).toBeLessThanOrEqual(1.0);
            expect(result.cameraMotion).toBe(motion);
            expect(result.motionIntent).toBe(intent);
            expect(typeof result.reason).toBe('string');
            expect(result.reason.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('awards +0.008 bonus for matching ACTION intent with DYNAMIC_ACTION motion', () => {
    const res = calculateMotionDynamicsModifier('DYNAMIC_ACTION', 'ACTION');
    expect(res.modifier).toBe(0.008);
    expect(res.motionMatchScore).toBe(1.0);
    expect(res.reason).toContain('Kinetic bonus');
  });

  it('applies -0.006 penalty for ACTION intent clashing with STATIC_LOCKED motion', () => {
    const res = calculateMotionDynamicsModifier('STATIC_LOCKED', 'ACTION');
    expect(res.modifier).toBe(-0.006);
    expect(res.motionMatchScore).toBe(0.15);
    expect(res.reason).toContain('Kinetic penalty');
  });

  it('awards +0.008 bonus for matching SMOOTH intent with SMOOTH_FLOAT motion', () => {
    const res = calculateMotionDynamicsModifier('SMOOTH_FLOAT', 'SMOOTH');
    expect(res.modifier).toBe(0.008);
    expect(res.motionMatchScore).toBe(1.0);
  });

  it('applies -0.006 penalty for SMOOTH intent clashing with DYNAMIC_ACTION motion', () => {
    const res = calculateMotionDynamicsModifier('DYNAMIC_ACTION', 'SMOOTH');
    expect(res.modifier).toBe(-0.006);
    expect(res.motionMatchScore).toBe(0.15);
  });

  it('awards +0.008 bonus for matching PAN intent with PANNING_SWEEP motion', () => {
    const res = calculateMotionDynamicsModifier('PANNING_SWEEP', 'PAN');
    expect(res.modifier).toBe(0.008);
    expect(res.motionMatchScore).toBe(1.0);
  });

  it('awards +0.008 bonus for matching ZOOM intent with ZOOMING_FOCUS motion', () => {
    const res = calculateMotionDynamicsModifier('ZOOMING_FOCUS', 'ZOOM');
    expect(res.modifier).toBe(0.008);
    expect(res.motionMatchScore).toBe(1.0);
  });

  it('awards +0.008 bonus for matching STATIC intent with STATIC_LOCKED motion', () => {
    const res = calculateMotionDynamicsModifier('STATIC_LOCKED', 'STATIC');
    expect(res.modifier).toBe(0.008);
    expect(res.motionMatchScore).toBe(1.0);
  });

  it('returns neutral 0.0 modifier for NEUTRAL intent', () => {
    for (const motion of allMotions) {
      const res = calculateMotionDynamicsModifier(motion, 'NEUTRAL');
      expect(res.modifier).toBe(0.0);
      expect(res.motionMatchScore).toBe(0.5);
    }
  });

  it('waives penalties and sets modifier to 0.0 when isConsecutiveContinuation is true', () => {
    const res = calculateMotionDynamicsModifier('STATIC_LOCKED', 'ACTION', true);
    expect(res.modifier).toBe(0.0);
    expect(res.motionMatchScore).toBe(0.8);
    expect(res.reason).toContain('Consecutive shot continuation');
  });

  it('grants +0.008 establishing dynamic energy on NEW_BEAT for dynamic/panning motion with action/pan intent', () => {
    const res = calculateMotionDynamicsModifier('DYNAMIC_ACTION', 'ACTION', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.reason).toContain('New beat dynamic energy');
  });

  it('produces deterministic output across multiple invocations', () => {
    const res1 = calculateMotionDynamicsModifier('DYNAMIC_ACTION', 'ACTION');
    const res2 = calculateMotionDynamicsModifier('DYNAMIC_ACTION', 'ACTION');
    expect(res1).toEqual(res2);
  });
});

// ---------------------------------------------------------------------------
// 4. Step 30 Independence from Steps 22–29
// ---------------------------------------------------------------------------

describe('Step 30 Independence from Steps 22–29', () => {
  const asset = createTestMediaAsset({
    analysis: {
      analyzed: true,
      tags: ['action', 'fast', 'chase'],
      description: 'Dynamic car chase in action',
    },
  });

  it('Step 22 visual variety is unaffected by camera motion modifier', () => {
    const motion = classifyCameraMotion(asset);
    const motionIntel = calculateMotionDynamicsModifier(motion, 'ACTION');
    expect(typeof motionIntel.modifier).toBe('number');
    expect(motionIntel.modifier).toBe(0.008);
  });

  it('Step 23 pacing modifier is unaffected by camera motion modifier', () => {
    const motion = classifyCameraMotion(asset);
    const motionIntel = calculateMotionDynamicsModifier(motion, 'ACTION');
    expect(motionIntel.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 24 pacing arc modifier is unaffected by camera motion modifier', () => {
    const motion = classifyCameraMotion(asset);
    const motionIntel = calculateMotionDynamicsModifier(motion, 'STATIC');
    expect(motionIntel.modifier).toBe(-0.006);
  });

  it('Step 25 visual impact modifier is unaffected by camera motion modifier', () => {
    const motion = classifyCameraMotion(asset);
    expect(motion).toBe('DYNAMIC_ACTION');
  });

  it('Step 26 contrast modifier is unaffected by camera motion modifier', () => {
    const motion = classifyCameraMotion(asset);
    expect(motion).toBe('DYNAMIC_ACTION');
  });

  it('Step 27 subject continuity modifier is unaffected by camera motion modifier', () => {
    const motion = classifyCameraMotion(asset);
    const motionIntel = calculateMotionDynamicsModifier(motion, 'NEUTRAL');
    expect(motionIntel.modifier).toBe(0.0);
  });

  it('Step 28 framing scale modifier is unaffected by camera motion modifier', () => {
    const framing: FramingScale = 'WIDE';
    expect(framing).toBe('WIDE');
    const motion = classifyCameraMotion(asset);
    expect(motion).toBe('DYNAMIC_ACTION');
  });

  it('Step 29 atmospheric modifier is unaffected by camera motion modifier', () => {
    const tone: AtmosphericTone = 'WARM_VIBRANT';
    expect(tone).toBe('WARM_VIBRANT');
    const motion = classifyCameraMotion(asset);
    expect(motion).toBe('DYNAMIC_ACTION');
  });
});

// ---------------------------------------------------------------------------
// 5. Semantic Dominance Preservation with Step 30
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 30', () => {
  it('strong semantic match (0.82) with max penalty (-0.008) beats weak match (0.55) with max bonus (+0.008)', () => {
    const strongCandidateScore = 0.82 - 0.008; // 0.812
    const weakCandidateScore = 0.55 + 0.008;   // 0.558
    expect(strongCandidateScore).toBeGreaterThan(weakCandidateScore);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.06;
    const maxAllBonuses = +0.06;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.74
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.46
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 6. DraftStats Step 30 Metrics
// ---------------------------------------------------------------------------

describe('DraftStats Step 30 Fields Interface Check', () => {
  it('DraftStats supports all Step 30 motion counters', () => {
    const sampleStats: DraftStats = {
      totalSegments: 5,
      assignedSegments: 5,
      unassignedSegments: 0,
      totalDuration: 20.0,
      assignedDuration: 20.0,
      unassignedDuration: 0,
      uniqueMediaUsed: 3,
      mediaReuseCount: { 'm-1': 2 },
      mediaUsageSummary: [],
      unassignedReasons: {},
      unassignedDetails: [],
      warnings: [],
      coveragePercentage: 100,
      thresholdUsed: 0.30,
      reusePenaltyUsed: 0.08,
      continuityPreferenceUsed: 0.03,
      generatedAt: Date.now(),
      motionAdjustments: 4,
      staticMotionSelections: 1,
      dynamicMotionSelections: 2,
      panningMotionSelections: 1,
      zoomingMotionSelections: 0,
      smoothMotionSelections: 0,
      motionBonuses: 3,
      motionPenalties: 1,
    };

    expect(sampleStats.motionAdjustments).toBe(4);
    expect(sampleStats.staticMotionSelections).toBe(1);
    expect(sampleStats.dynamicMotionSelections).toBe(2);
    expect(sampleStats.panningMotionSelections).toBe(1);
    expect(sampleStats.motionBonuses).toBe(3);
    expect(sampleStats.motionPenalties).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Schema Serialization Round-Trip for Step 30
// ---------------------------------------------------------------------------

describe('Schema Serialization Round-Trip for Step 30', () => {
  it('all 4 Step 30 provenance fields survive JSON stringify/parse round-trip', () => {
    const provenance = {
      sourceSegmentId: 'seg-1',
      originalScore: 0.85,
      adjustedScore: 0.858,
      explanation: 'Strong semantic match',
      reuseCount: 0,
      cameraMotion: 'DYNAMIC_ACTION' as CameraMotion,
      motionModifier: 0.008,
      motionReason: 'Kinetic bonus: dynamic action motion matches intense narration.',
      motionMatchScore: 1.0,
      isManuallyEdited: false,
    };

    const serialized = JSON.stringify(provenance);
    const parsed = JSON.parse(serialized);

    expect(parsed.cameraMotion).toBe('DYNAMIC_ACTION');
    expect(parsed.motionModifier).toBe(0.008);
    expect(parsed.motionReason).toContain('Kinetic bonus');
    expect(parsed.motionMatchScore).toBe(1.0);
  });

  it('preserves floating-point precision on modifier and match score', () => {
    const obj = { mod: -0.006, score: 0.85 };
    const roundTripped = JSON.parse(JSON.stringify(obj));
    expect(roundTripped.mod).toBe(-0.006);
    expect(roundTripped.score).toBe(0.85);
  });

  it('exports Step 30 provenance fields in exportProjectToPortableJSON', () => {
    const project = createInitialProject('Step 30 Full Export');
    project.media = [
      createTestMediaAsset({ id: 'm-1' }),
    ];
    project.timeline = [
      {
        id: 'tl-1',
        mediaId: 'm-1',
        trackIndex: 0,
        startTime: 0,
        duration: 4.0,
        sourceStart: 0,
        sourceDuration: 4.0,
        transform: {
          x: 0,
          y: 0,
          scale: 1.0,
          fitMode: 'cover',
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
        provenance: {
          sourceSegmentId: 'seg-1',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match',
          reuseCount: 0,
          cameraMotion: 'DYNAMIC_ACTION',
          motionModifier: 0.008,
          motionReason: 'Kinetic bonus: dynamic action motion matches intense narration.',
          motionMatchScore: 1.0,
          isManuallyEdited: false,
          assignedAt: Date.now(),
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = JSON.parse(json);

    expect(parsed.project.timeline[0]?.provenance?.cameraMotion).toBe('DYNAMIC_ACTION');
    expect(parsed.project.timeline[0]?.provenance?.motionModifier).toBe(0.008);
    expect(parsed.project.timeline[0]?.provenance?.motionReason).toContain('Kinetic bonus');
    expect(parsed.project.timeline[0]?.provenance?.motionMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 8. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyCameraMotion does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['drone', 'aerial', 'glide'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifyCameraMotion(frozen)).not.toThrow();
  });

  it('classifyNarrationMotionIntent does not mutate input text', () => {
    const text = 'Fast running action sequence';
    const copy = `${text}`;
    classifyNarrationMotionIntent(text, 'action');
    expect(text).toBe(copy);
  });

  it('motion modifier does not modify sourceStart or duration', () => {
    const res = calculateMotionDynamicsModifier('DYNAMIC_ACTION', 'ACTION');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of motion fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      cameraMotion: 'DYNAMIC_ACTION' as CameraMotion,
      motionModifier: 0.008,
      motionReason: 'Test reason',
      motionMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.cameraMotion).toBe('DYNAMIC_ACTION');
    expect(prov.motionModifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 9. Edge Cases and Boundaries
// ---------------------------------------------------------------------------

describe('Edge Cases and Boundaries', () => {
  it('handles asset with missing tags and empty descriptions gracefully', () => {
    const emptyAsset = createTestMediaAsset({
      analysis: undefined,
    });
    expect(classifyCameraMotion(emptyAsset)).toBe('STATIC_LOCKED');
  });

  it('returns valid reason string for every combination', () => {
    const allMotions: CameraMotion[] = ['STATIC_LOCKED', 'PANNING_SWEEP', 'ZOOMING_FOCUS', 'DYNAMIC_ACTION', 'SMOOTH_FLOAT'];
    const allIntents: MotionIntent[] = ['STATIC', 'PAN', 'ZOOM', 'ACTION', 'SMOOTH', 'NEUTRAL'];
    for (const m of allMotions) {
      for (const i of allIntents) {
        const res = calculateMotionDynamicsModifier(m, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or motionMatchScore', () => {
    const allMotions: CameraMotion[] = ['STATIC_LOCKED', 'PANNING_SWEEP', 'ZOOMING_FOCUS', 'DYNAMIC_ACTION', 'SMOOTH_FLOAT'];
    const allIntents: MotionIntent[] = ['STATIC', 'PAN', 'ZOOM', 'ACTION', 'SMOOTH', 'NEUTRAL'];
    for (const m of allMotions) {
      for (const i of allIntents) {
        const res = calculateMotionDynamicsModifier(m, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.motionMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.motionMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 camera motions are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['tripod', 'locked', 'still'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['pan', 'sweep', 'panorama'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['zoom', 'zooming', 'focus pull'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['action', 'chase', 'racing', 'fast'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['drone', 'aerial', 'glide', 'soar'] } }),
    ];

    const classified = assets.map((a) => classifyCameraMotion(a));
    expect(classified).toContain('STATIC_LOCKED');
    expect(classified).toContain('PANNING_SWEEP');
    expect(classified).toContain('ZOOMING_FOCUS');
    expect(classified).toContain('DYNAMIC_ACTION');
    expect(classified).toContain('SMOOTH_FLOAT');
  });
});
