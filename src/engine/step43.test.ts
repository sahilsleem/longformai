/**
 * Step 43 — Action Trajectory & Screen Direction Intelligence
 *
 * Dedicated test suite verifying:
 *  - Action trajectory classification (APPROACHING_CAMERA, RECEDING_DEPTH, LATERAL_LEFT_TO_RIGHT, LATERAL_RIGHT_TO_LEFT, ROTATIONAL_AXIAL, TRAJECTORY_AGNOSTIC)
 *  - Narration trajectory intent extraction (APPROACHING, RECEDING, LEFT_TO_RIGHT, RIGHT_TO_LEFT, ROTATIONAL, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and opposing trajectory penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset motion trajectory establishing momentum
 *  - Independence from Steps 27–42 (Camera motion, framing, angle, POV, chromatic grading)
 *  - Semantic dominance preservation
 *  - DraftStats counters & Full generateDraftTimeline integration
 *  - Schema JSON serialization round-trip
 *  - Immutability, edge cases, and determinism
 */

import { describe, it, expect } from 'vitest';
import {
  classifyActionTrajectory,
  classifyNarrationTrajectoryIntent,
  calculateTrajectoryModifier,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  AudioSegment,
  ActionTrajectory,
  TrajectoryIntent,
} from '../types/project';
import { exportProjectToPortableJSON, validateAndParseProjectJSON, createInitialProject } from './schema';

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

type TestAssetOverrides = Omit<Partial<MediaAsset>, 'analysis'> & {
  analysis?: Partial<Omit<NonNullable<MediaAsset['analysis']>, 'visualFeatures'>> & {
    visualFeatures?: Partial<NonNullable<NonNullable<MediaAsset['analysis']>['visualFeatures']>>;
  };
};

function createTestMediaAsset(overrides: TestAssetOverrides = {}): MediaAsset {
  const baseVisualFeatures = {
    dominantColors: ['#334455'],
    brightness: 0.5,
    contrast: 0.5,
    orientation: 'landscape' as const,
  };

  const analysis = overrides.analysis !== undefined
    ? {
        analyzed: true,
        description: 'A test video clip',
        tags: ['clip'],
        visualFeatures: baseVisualFeatures,
        ...overrides.analysis,
      }
    : {
        analyzed: true,
        description: 'A test video clip',
        tags: ['clip'],
        visualFeatures: baseVisualFeatures,
      };

  return {
    id: overrides.id ?? 'm1',
    name: overrides.name ?? 'test_asset.mp4',
    type: overrides.type ?? 'video',
    url: overrides.url ?? 'blob:http://localhost/test-blob',
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
    duration: overrides.duration ?? 10.0,
    aspectRatio: overrides.aspectRatio ?? 1920 / 1080,
    aspectRatioLabel: overrides.aspectRatioLabel ?? '16:9 Native',
    createdAt: overrides.createdAt ?? 1700000000000,
    analysis: analysis as NonNullable<MediaAsset['analysis']>,
  };
}

// ---------------------------------------------------------------------------
// 1. classifyActionTrajectory
// ---------------------------------------------------------------------------

describe('classifyActionTrajectory', () => {
  it('returns TRAJECTORY_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyActionTrajectory(null)).toBe('TRAJECTORY_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyActionTrajectory(undefined)).toBe('TRAJECTORY_AGNOSTIC');
  });

  it('classifies APPROACHING_CAMERA from oncoming, approaching, advancing towards camera keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'runner_approaching.mp4',
      analysis: { description: 'Athlete running and approaching the camera at high speed', tags: ['approaching', 'oncoming'] },
    });
    expect(classifyActionTrajectory(asset1)).toBe('APPROACHING_CAMERA');

    const asset2 = createTestMediaAsset({
      name: 'train_advancing.mp4',
      analysis: { description: 'Locomotive advancing forward heading towards lens', tags: ['advancing', 'coming-closer'] },
    });
    expect(classifyActionTrajectory(asset2)).toBe('APPROACHING_CAMERA');
  });

  it('classifies RECEDING_DEPTH from walking away, receding, retreating, departing keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'traveler_departing.mp4',
      analysis: { description: 'Explorer walking away into the distance across the desert', tags: ['receding', 'departing'] },
    });
    expect(classifyActionTrajectory(asset1)).toBe('RECEDING_DEPTH');

    const asset2 = createTestMediaAsset({
      name: 'ship_retreating.mp4',
      analysis: { description: 'Vessel receding into background sailing away from camera', tags: ['retreating', 'moving-away'] },
    });
    expect(classifyActionTrajectory(asset2)).toBe('RECEDING_DEPTH');
  });

  it('classifies LATERAL_LEFT_TO_RIGHT from left-to-right, crossing right, heading right keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'car_crossing_right.mp4',
      analysis: { description: 'Vehicle moving from left to right across the highway', tags: ['left-to-right', 'crossing-right'] },
    });
    expect(classifyActionTrajectory(asset1)).toBe('LATERAL_LEFT_TO_RIGHT');

    const asset2 = createTestMediaAsset({
      name: 'parade_marching_right.mp4',
      analysis: { description: 'Crowd sweeping rightwards along the avenue', tags: ['rightward', 'sweeping-right'] },
    });
    expect(classifyActionTrajectory(asset2)).toBe('LATERAL_LEFT_TO_RIGHT');
  });

  it('classifies LATERAL_RIGHT_TO_LEFT from right-to-left, crossing left, heading left keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'cyclist_crossing_left.mp4',
      analysis: { description: 'Bicycle moving from right to left across the screen', tags: ['right-to-left', 'crossing-left'] },
    });
    expect(classifyActionTrajectory(asset1)).toBe('LATERAL_RIGHT_TO_LEFT');

    const asset2 = createTestMediaAsset({
      name: 'bird_flying_left.mp4',
      analysis: { description: 'Flock sweeping leftwards over the lake', tags: ['leftward', 'sweeping-left'] },
    });
    expect(classifyActionTrajectory(asset2)).toBe('LATERAL_RIGHT_TO_LEFT');
  });

  it('classifies ROTATIONAL_AXIAL from spinning, rotating, orbiting, revolving keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'globe_spinning.mp4',
      analysis: { description: 'Planet spinning in place rotating on its axis', tags: ['spinning', 'rotating'] },
    });
    expect(classifyActionTrajectory(asset1)).toBe('ROTATIONAL_AXIAL');

    const asset2 = createTestMediaAsset({
      name: 'dancer_turning.mp4',
      analysis: { description: 'Ballerina turning around in a circle with axial rotation', tags: ['orbiting', 'revolving'] },
    });
    expect(classifyActionTrajectory(asset2)).toBe('ROTATIONAL_AXIAL');
  });

  it('returns TRAJECTORY_AGNOSTIC for unanalyzed or stationary neutral footage', () => {
    const unanalyzedAsset: MediaAsset = {
      id: 'm_un',
      name: 'un_analyzed.mp4',
      type: 'video',
      url: 'blob:http://localhost/un',
      width: 1920,
      height: 1080,
      duration: 5.0,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      createdAt: 1700000000000,
    };
    expect(classifyActionTrajectory(unanalyzedAsset)).toBe('TRAJECTORY_AGNOSTIC');

    const neutralAsset = createTestMediaAsset({
      name: 'still_landscape.mp4',
      analysis: { description: 'Stationary mountain ridge under calm sky', tags: ['stationary', 'static'] },
    });
    expect(classifyActionTrajectory(neutralAsset)).toBe('TRAJECTORY_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationTrajectoryIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationTrajectoryIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationTrajectoryIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationTrajectoryIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts APPROACHING intent from oncoming, coming towards us, advancing forward keywords', () => {
    expect(classifyNarrationTrajectoryIntent('The army is advancing forward towards our position.')).toBe('APPROACHING');
    expect(classifyNarrationTrajectoryIntent('A sudden figure comes closer, coming towards us in the mist.')).toBe('APPROACHING');
    expect(classifyNarrationTrajectoryIntent('Rushing at the screen with intense urgency.')).toBe('APPROACHING');
  });

  it('extracts RECEDING intent from walking away, moving away into distance, retreating keywords', () => {
    expect(classifyNarrationTrajectoryIntent('They are walking away into the distance, never to return.')).toBe('RECEDING');
    expect(classifyNarrationTrajectoryIntent('The soldiers are retreating into the distance after the defeat.')).toBe('RECEDING');
    expect(classifyNarrationTrajectoryIntent('Departing into the sunset as the journey concludes.')).toBe('RECEDING');
  });

  it('extracts LEFT_TO_RIGHT intent from moving from left to right, crossing right, sweeping rightwards keywords', () => {
    expect(classifyNarrationTrajectoryIntent('The convoy is moving from left to right along the river.')).toBe('LEFT_TO_RIGHT');
    expect(classifyNarrationTrajectoryIntent('A sweeping movement crossing to the right of the perimeter.')).toBe('LEFT_TO_RIGHT');
    expect(classifyNarrationTrajectoryIntent('Marching to the right across the open plain.')).toBe('LEFT_TO_RIGHT');
  });

  it('extracts RIGHT_TO_LEFT intent from moving from right to left, crossing left, sweeping leftwards keywords', () => {
    expect(classifyNarrationTrajectoryIntent('The returning scout is moving from right to left across the pass.')).toBe('RIGHT_TO_LEFT');
    expect(classifyNarrationTrajectoryIntent('A sudden shadow crossing to the left side of the frame.')).toBe('RIGHT_TO_LEFT');
    expect(classifyNarrationTrajectoryIntent('Heading left back towards base camp.')).toBe('RIGHT_TO_LEFT');
  });

  it('extracts ROTATIONAL intent from spinning in place, rotating on its axis, revolving around keywords', () => {
    expect(classifyNarrationTrajectoryIntent('The celestial sphere is spinning in place continuously.')).toBe('ROTATIONAL');
    expect(classifyNarrationTrajectoryIntent('Rotating on its axis, the turbine generates steady energy.')).toBe('ROTATIONAL');
    expect(classifyNarrationTrajectoryIntent('Turning around in a circle as the mechanism engages.')).toBe('ROTATIONAL');
  });

  it('returns NEUTRAL for narration without directional trajectory cues', () => {
    expect(classifyNarrationTrajectoryIntent('We gathered to discuss the quarter financial review.')).toBe('NEUTRAL');
    expect(classifyNarrationTrajectoryIntent('The software architecture consists of multiple microservices.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationTrajectoryIntent('ADVANCING FORWARD TOWARDS THE LENS')).toBe('APPROACHING');
    expect(classifyNarrationTrajectoryIntent('WALKING AWAY INTO THE DISTANCE')).toBe('RECEDING');
    expect(classifyNarrationTrajectoryIntent('MOVING FROM LEFT TO RIGHT')).toBe('LEFT_TO_RIGHT');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateTrajectoryModifier
// ---------------------------------------------------------------------------

describe('calculateTrajectoryModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const trajectories: ActionTrajectory[] = [
      'APPROACHING_CAMERA',
      'RECEDING_DEPTH',
      'LATERAL_LEFT_TO_RIGHT',
      'LATERAL_RIGHT_TO_LEFT',
      'ROTATIONAL_AXIAL',
      'TRAJECTORY_AGNOSTIC',
    ];

    const intents: TrajectoryIntent[] = ['APPROACHING', 'RECEDING', 'LEFT_TO_RIGHT', 'RIGHT_TO_LEFT', 'ROTATIONAL', 'NEUTRAL'];

    for (const t of trajectories) {
      for (const i of intents) {
        const res = calculateTrajectoryModifier(t, i);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.trajectoryMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.trajectoryMatchScore).toBeLessThanOrEqual(1.0);
        expect(typeof res.reason).toBe('string');
        expect(res.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('awards +0.008 bonus for exact trajectory matches', () => {
    expect(calculateTrajectoryModifier('APPROACHING_CAMERA', 'APPROACHING').modifier).toBe(0.008);
    expect(calculateTrajectoryModifier('APPROACHING_CAMERA', 'APPROACHING').trajectoryMatchScore).toBe(1.0);

    expect(calculateTrajectoryModifier('RECEDING_DEPTH', 'RECEDING').modifier).toBe(0.008);
    expect(calculateTrajectoryModifier('RECEDING_DEPTH', 'RECEDING').trajectoryMatchScore).toBe(1.0);

    expect(calculateTrajectoryModifier('LATERAL_LEFT_TO_RIGHT', 'LEFT_TO_RIGHT').modifier).toBe(0.008);
    expect(calculateTrajectoryModifier('LATERAL_LEFT_TO_RIGHT', 'LEFT_TO_RIGHT').trajectoryMatchScore).toBe(1.0);

    expect(calculateTrajectoryModifier('LATERAL_RIGHT_TO_LEFT', 'RIGHT_TO_LEFT').modifier).toBe(0.008);
    expect(calculateTrajectoryModifier('LATERAL_RIGHT_TO_LEFT', 'RIGHT_TO_LEFT').trajectoryMatchScore).toBe(1.0);

    expect(calculateTrajectoryModifier('ROTATIONAL_AXIAL', 'ROTATIONAL').modifier).toBe(0.008);
    expect(calculateTrajectoryModifier('ROTATIONAL_AXIAL', 'ROTATIONAL').trajectoryMatchScore).toBe(1.0);
  });

  it('awards moderate bonuses for compatible trajectory pairs', () => {
    // Rotational motion is compatible with approaching dynamic narration
    expect(calculateTrajectoryModifier('ROTATIONAL_AXIAL', 'APPROACHING').modifier).toBe(0.002);
    // Lateral traversal provides dynamic movement for approaching narration
    expect(calculateTrajectoryModifier('LATERAL_LEFT_TO_RIGHT', 'APPROACHING').modifier).toBe(0.002);
    // Lateral motion supports receding travel context
    expect(calculateTrajectoryModifier('LATERAL_RIGHT_TO_LEFT', 'RECEDING').modifier).toBe(0.002);
    // Forward depth supports left-to-right narrative
    expect(calculateTrajectoryModifier('APPROACHING_CAMERA', 'LEFT_TO_RIGHT').modifier).toBe(0.002);
  });

  it('penalizes opposing action trajectories', () => {
    // Receding candidate when approaching requested
    const recToApp = calculateTrajectoryModifier('RECEDING_DEPTH', 'APPROACHING');
    expect(recToApp.modifier).toBe(-0.006);
    expect(recToApp.trajectoryMatchScore).toBe(0.15);

    // Approaching candidate when receding requested
    const appToRec = calculateTrajectoryModifier('APPROACHING_CAMERA', 'RECEDING');
    expect(appToRec.modifier).toBe(-0.006);
    expect(appToRec.trajectoryMatchScore).toBe(0.15);

    // Right-to-left candidate when left-to-right requested
    const rtlToLtr = calculateTrajectoryModifier('LATERAL_RIGHT_TO_LEFT', 'LEFT_TO_RIGHT');
    expect(rtlToLtr.modifier).toBe(-0.006);
    expect(rtlToLtr.trajectoryMatchScore).toBe(0.15);

    // Left-to-right candidate when right-to-left requested
    const ltrToRtl = calculateTrajectoryModifier('LATERAL_LEFT_TO_RIGHT', 'RIGHT_TO_LEFT');
    expect(ltrToRtl.modifier).toBe(-0.006);
    expect(ltrToRtl.trajectoryMatchScore).toBe(0.15);
  });

  it('returns neutral 0.0 modifier for neutral intent or agnostic trajectory profile', () => {
    expect(calculateTrajectoryModifier('APPROACHING_CAMERA', 'NEUTRAL').modifier).toBe(0.0);
    expect(calculateTrajectoryModifier('TRAJECTORY_AGNOSTIC', 'APPROACHING').modifier).toBe(0.0);
    expect(calculateTrajectoryModifier('TRAJECTORY_AGNOSTIC', 'RECEDING').modifier).toBe(0.0);
    expect(calculateTrajectoryModifier('TRAJECTORY_AGNOSTIC', 'LEFT_TO_RIGHT').modifier).toBe(0.0);
    expect(calculateTrajectoryModifier('TRAJECTORY_AGNOSTIC', 'RIGHT_TO_LEFT').modifier).toBe(0.0);
    expect(calculateTrajectoryModifier('TRAJECTORY_AGNOSTIC', 'ROTATIONAL').modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive continuation penalty waiving
// ---------------------------------------------------------------------------

describe('Consecutive continuation penalty waiving', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normal opposing mismatch has -0.006 penalty
    const normalMismatch = calculateTrajectoryModifier('RECEDING_DEPTH', 'APPROACHING', false);
    expect(normalMismatch.modifier).toBe(-0.006);

    // With consecutive continuation, modifier is waived to 0.0
    const continuedMismatch = calculateTrajectoryModifier('RECEDING_DEPTH', 'APPROACHING', true);
    expect(continuedMismatch.modifier).toBe(0.0);
    expect(continuedMismatch.trajectoryMatchScore).toBe(0.8);
    expect(continuedMismatch.reason).toContain('Consecutive shot continuation');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat-reset motion trajectory establishing momentum
// ---------------------------------------------------------------------------

describe('Beat-reset motion trajectory establishing momentum', () => {
  it('awards +0.008 modifier with NEW_BEAT narrationBeatType for matching intent', () => {
    const beatMatch = calculateTrajectoryModifier('APPROACHING_CAMERA', 'APPROACHING', false, 'NEW_BEAT');
    expect(beatMatch.modifier).toBe(0.008);
    expect(beatMatch.trajectoryMatchScore).toBe(1.0);
    expect(beatMatch.reason).toContain('New beat motion trajectory introduction');
  });

  it('does not award beat bonus if narration intent is NEUTRAL', () => {
    const beatNeutral = calculateTrajectoryModifier('APPROACHING_CAMERA', 'NEUTRAL', false, 'NEW_BEAT');
    expect(beatNeutral.modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 27–42
// ---------------------------------------------------------------------------

describe('Independence from Steps 27–42', () => {
  it('operates orthogonally to camera motion, angle, POV, and chromatic grading', () => {
    const asset = createTestMediaAsset({
      name: 'complex_shot.mp4',
      analysis: {
        description: 'First person POV subjective camera in black and white with panning motion approaching the camera from an eye level perspective',
        tags: ['first-person', 'black-and-white', 'panning', 'approaching', 'oncoming'],
      },
    });

    const trajectory = classifyActionTrajectory(asset);
    expect(trajectory).toBe('APPROACHING_CAMERA');

    // Step 43 evaluates strictly on action trajectory
    const res = calculateTrajectoryModifier(trajectory, 'APPROACHING');
    expect(res.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic dominance preservation
// ---------------------------------------------------------------------------

describe('Semantic dominance preservation', () => {
  it('ensures semantic relevance remains dominant over trajectory modifiers', () => {
    const strongSemanticScore = 0.85;
    const weakSemanticScore = 0.40;

    const strongAssetPenalty = calculateTrajectoryModifier('RECEDING_DEPTH', 'APPROACHING').modifier; // -0.006
    const weakAssetBonus = calculateTrajectoryModifier('APPROACHING_CAMERA', 'APPROACHING').modifier; // +0.008

    const strongComposite = strongSemanticScore + strongAssetPenalty; // 0.844
    const weakComposite = weakSemanticScore + weakAssetBonus; // 0.408

    expect(strongComposite).toBeGreaterThan(weakComposite);
    expect(strongComposite - weakComposite).toBeGreaterThan(0.40);
  });
});

// ---------------------------------------------------------------------------
// 8. DraftStats counters and generateDraftTimeline Integration
// ---------------------------------------------------------------------------

describe('DraftStats counters and generateDraftTimeline Integration', () => {
  it('populates Step 43 provenance fields and stats in generateDraftTimeline', async () => {
    const segments: AudioSegment[] = [
      {
        id: 's1',
        startTime: 0,
        endTime: 4,
        text: 'The runner is advancing forward, coming towards the camera at full speed.',
      },
    ];

    const media: MediaAsset[] = [
      createTestMediaAsset({
        id: 'm1',
        name: 'runner_advancing.mp4',
        analysis: {
          analyzed: true,
          description: 'Athlete running approaching the camera with fast forward motion',
          tags: ['runner', 'approaching', 'oncoming', 'advancing'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(1);
    const item = result.timeline[0];
    expect(item.provenance?.actionTrajectory).toBe('APPROACHING_CAMERA');
    expect(item.provenance?.trajectoryModifier).toBe(0.008);
    expect(item.provenance?.trajectoryReason).toContain('forward oncoming motion matches advancing narration momentum');
    expect(item.provenance?.trajectoryMatchScore).toBe(1.0);

    expect(result.stats.trajectoryAdjustments).toBe(1);
    expect(result.stats.approachingSelections).toBe(1);
    expect(result.stats.trajectoryBonuses).toBe(1);
  });

  it('includes all 9 Step 43 trajectory counters in DraftStats type', () => {
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
      thresholdUsed: 0.3,
      reusePenaltyUsed: 0.08,
      continuityPreferenceUsed: 0.03,
      generatedAt: Date.now(),
      // Step 43 fields
      trajectoryAdjustments: 1,
      approachingSelections: 1,
      recedingSelections: 0,
      leftToRightSelections: 0,
      rightToLeftSelections: 0,
      rotationalSelections: 0,
      trajectoryAgnosticSelections: 0,
      trajectoryBonuses: 1,
      trajectoryPenalties: 0,
    };

    expect(stats.trajectoryAdjustments).toBe(1);
    expect(stats.approachingSelections).toBe(1);
    expect(stats.recedingSelections).toBe(0);
    expect(stats.leftToRightSelections).toBe(0);
    expect(stats.rightToLeftSelections).toBe(0);
    expect(stats.rotationalSelections).toBe(0);
    expect(stats.trajectoryAgnosticSelections).toBe(0);
    expect(stats.trajectoryBonuses).toBe(1);
    expect(stats.trajectoryPenalties).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON Serialization & Validation Round-Trip
// ---------------------------------------------------------------------------

describe('Schema JSON Serialization & Validation Round-Trip', () => {
  it('successfully exports and parses Step 43 actionTrajectory provenance fields', () => {
    const project = createInitialProject('Step 43 Test');
    project.media.push(createTestMediaAsset({ id: 'm1' }));
    project.timeline = [
      {
        id: 'clip_1',
        mediaId: 'm1',
        trackIndex: 0,
        startTime: 0,
        duration: 5.0,
        sourceStart: 0,
        sourceDuration: 5.0,
        transform: {
          x: 0,
          y: 0,
          scale: 1.0,
          fitMode: 'cover',
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
        provenance: {
          sourceSegmentId: 'seg_1',
          sourceSegmentText: 'Advancing forward towards the camera.',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match with oncoming forward action trajectory.',
          reuseCount: 0,
          actionTrajectory: 'APPROACHING_CAMERA',
          trajectoryModifier: 0.008,
          trajectoryReason: 'Trajectory bonus: forward oncoming motion matches advancing narration momentum.',
          trajectoryMatchScore: 1.0,
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    const item = parsed.project?.timeline[0];
    expect(item?.provenance?.actionTrajectory).toBe('APPROACHING_CAMERA');
    expect(item?.provenance?.trajectoryModifier).toBe(0.008);
    expect(item?.provenance?.trajectoryReason).toBe('Trajectory bonus: forward oncoming motion matches advancing narration momentum.');
    expect(item?.provenance?.trajectoryMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Immutability, edge cases, and determinism
// ---------------------------------------------------------------------------

describe('Immutability, edge cases, and determinism', () => {
  it('does not mutate input candidate asset or description', () => {
    const asset = createTestMediaAsset({
      name: 'freeze_test.mp4',
      analysis: { description: 'Athlete advancing towards camera', tags: ['approaching'] },
    });
    const frozenAsset = Object.freeze({ ...asset });

    const c1 = classifyActionTrajectory(frozenAsset);
    const c2 = classifyActionTrajectory(frozenAsset);
    expect(c1).toBe('APPROACHING_CAMERA');
    expect(c2).toBe('APPROACHING_CAMERA');
  });

  it('produces identical deterministic results across repeated calls', () => {
    const res1 = calculateTrajectoryModifier('APPROACHING_CAMERA', 'APPROACHING');
    const res2 = calculateTrajectoryModifier('APPROACHING_CAMERA', 'APPROACHING');
    expect(res1).toEqual(res2);
  });

  it('never returns NaN or Infinity for modifier or trajectoryMatchScore', () => {
    const trajectories: ActionTrajectory[] = [
      'APPROACHING_CAMERA',
      'RECEDING_DEPTH',
      'LATERAL_LEFT_TO_RIGHT',
      'LATERAL_RIGHT_TO_LEFT',
      'ROTATIONAL_AXIAL',
      'TRAJECTORY_AGNOSTIC',
    ];
    const intents: TrajectoryIntent[] = ['APPROACHING', 'RECEDING', 'LEFT_TO_RIGHT', 'RIGHT_TO_LEFT', 'ROTATIONAL', 'NEUTRAL'];
    for (const t of trajectories) {
      for (const i of intents) {
        const res = calculateTrajectoryModifier(t, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.trajectoryMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.trajectoryMatchScore)).toBe(false);
      }
    }
  });

  it('all 6 action trajectory classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['approaching', 'oncoming'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['receding', 'departing'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['left-to-right', 'crossing-right'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['right-to-left', 'crossing-left'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['spinning', 'rotating'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyActionTrajectory(a));
    expect(classified).toContain('APPROACHING_CAMERA');
    expect(classified).toContain('RECEDING_DEPTH');
    expect(classified).toContain('LATERAL_LEFT_TO_RIGHT');
    expect(classified).toContain('LATERAL_RIGHT_TO_LEFT');
    expect(classified).toContain('ROTATIONAL_AXIAL');
    expect(classified).toContain('TRAJECTORY_AGNOSTIC');
  });
});
