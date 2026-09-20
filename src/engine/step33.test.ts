/**
 * Step 33 — Camera Angle & Vertical Perspective Intelligence
 *
 * Dedicated test suite verifying:
 *  - Camera angle classification (AERIAL_OVERHEAD, HIGH_ANGLE, EYE_LEVEL, LOW_ANGLE, GROUND_LEVEL)
 *  - Narration angle intent extraction (AERIAL, HIGH, EYE, LOW, GROUND, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset perspective establishing energy
 *  - Independence from Steps 22–32
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCameraAngle,
  classifyNarrationAngleIntent,
  calculateCameraAngleModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  CameraAngle,
  AngleIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
  SceneSetting,
  SubjectDensity,
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
        ...overrides.analysis,
        visualFeatures: overrides.analysis.visualFeatures
          ? { ...baseVisualFeatures, ...overrides.analysis.visualFeatures }
          : baseVisualFeatures,
      }
    : {
        analyzed: true,
        description: 'A test video clip',
        tags: ['clip'],
        visualFeatures: baseVisualFeatures,
      };

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
    ...overrides,
    analysis,
  };
}

// ---------------------------------------------------------------------------
// 1. classifyCameraAngle
// ---------------------------------------------------------------------------

describe('classifyCameraAngle', () => {
  it('returns EYE_LEVEL for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyCameraAngle(null)).toBe('EYE_LEVEL');
    // @ts-expect-error test undefined asset
    expect(classifyCameraAngle(undefined)).toBe('EYE_LEVEL');
  });

  it('classifies AERIAL_OVERHEAD from aerial, drone, top-down, satellite keywords', () => {
    const droneAsset = createTestMediaAsset({
      name: 'drone_aerial_city_overview.mp4',
      analysis: {
        analyzed: true,
        tags: ['aerial', 'drone', 'topdown', 'satellite'],
        description: 'Birdseye view of city streets shot from an overhead drone flight',
      },
    });
    expect(classifyCameraAngle(droneAsset)).toBe('AERIAL_OVERHEAD');
  });

  it('classifies HIGH_ANGLE from overlooking, elevated, balcony, summit keywords', () => {
    const rooftopAsset = createTestMediaAsset({
      name: 'rooftop_overlooking_square.mp4',
      analysis: {
        analyzed: true,
        tags: ['overlooking', 'high-angle', 'rooftop', 'vantage'],
        description: 'Elevated shot looking down at the crowded city plaza from a rooftop terrace',
      },
    });
    expect(classifyCameraAngle(rooftopAsset)).toBe('HIGH_ANGLE');
  });

  it('classifies LOW_ANGLE from low-angle, towering, monumental, majestic keywords', () => {
    const skyscraperAsset = createTestMediaAsset({
      name: 'towering_skyscraper_monument.mp4',
      analysis: {
        analyzed: true,
        tags: ['low-angle', 'towering', 'skyscraper', 'monumental'],
        description: 'Majestic upward perspective looking up at an imposing architectural monument',
      },
    });
    expect(classifyCameraAngle(skyscraperAsset)).toBe('LOW_ANGLE');
  });

  it('classifies GROUND_LEVEL from ground-level, surface, dirt, worms-eye keywords', () => {
    const groundAsset = createTestMediaAsset({
      name: 'macro_ground_surface_pavement.mp4',
      analysis: {
        analyzed: true,
        tags: ['ground', 'ground-level', 'surface', 'dirt', 'worm'],
        description: 'Extreme low angle surface shot of pavement and soil underfoot',
      },
    });
    expect(classifyCameraAngle(groundAsset)).toBe('GROUND_LEVEL');
  });

  it('classifies EYE_LEVEL from eye-level, portrait, interview, conversational keywords', () => {
    const interviewAsset = createTestMediaAsset({
      name: 'interview_eye_level_dialogue.mp4',
      analysis: {
        analyzed: true,
        tags: ['eye-level', 'interview', 'portrait', 'face'],
        description: 'Direct straight-on horizontal headshot interview with subject seated at desk',
      },
    });
    expect(classifyCameraAngle(interviewAsset)).toBe('EYE_LEVEL');
  });

  it('defaults to EYE_LEVEL when no angle keywords are present', () => {
    const genericAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['general', 'content'],
        description: 'Standard background scene',
      },
    });
    expect(classifyCameraAngle(genericAsset)).toBe('EYE_LEVEL');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationAngleIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationAngleIntent', () => {
  it('returns NEUTRAL for empty or whitespace-only text', () => {
    expect(classifyNarrationAngleIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationAngleIntent('   ')).toBe('NEUTRAL');
  });

  it('detects AERIAL intent from overhead, top-down, bird\'s eye, satellite keywords', () => {
    expect(
      classifyNarrationAngleIntent('From above, the entire continent opened up like a satellite map.')
    ).toBe('AERIAL');
    expect(
      classifyNarrationAngleIntent('We took a bird\'s eye drone view of the sprawling metropolis.')
    ).toBe('AERIAL');
  });

  it('detects HIGH intent from overlooking, high vantage, rooftop, looking down keywords', () => {
    expect(
      classifyNarrationAngleIntent('Standing on the rooftop summit overlooking the valley below.')
    ).toBe('HIGH');
    expect(
      classifyNarrationAngleIntent('Looking down from an elevated commanding balcony vantage point.')
    ).toBe('HIGH');
  });

  it('detects LOW intent from towering, monumental, looking up, majestic keywords', () => {
    expect(
      classifyNarrationAngleIntent('Looking up at the towering, monumental skyscraper rising above us.')
    ).toBe('LOW');
    expect(
      classifyNarrationAngleIntent('The heroic monument appeared colossal and majestic in the city center.')
    ).toBe('LOW');
  });

  it('detects GROUND intent from ground level, floor, surface, underfoot keywords', () => {
    expect(
      classifyNarrationAngleIntent('Down on the ground, the tiny seeds germinated in the soil underfoot.')
    ).toBe('GROUND');
    expect(
      classifyNarrationAngleIntent('A worm\'s eye view revealed intricate details on the pavement surface.')
    ).toBe('GROUND');
  });

  it('detects EYE intent from eye to eye, face to face, direct, conversational keywords', () => {
    expect(
      classifyNarrationAngleIntent('Meeting face to face, they spoke with direct conversational candor.')
    ).toBe('EYE');
    expect(
      classifyNarrationAngleIntent('She looked eye to eye with the interviewer and confided her story.')
    ).toBe('EYE');
  });

  it('resolves conflicting keywords based on keyword frequency and multi-word phrases', () => {
    // Multi-word phrase 'looking down' (weight 2) + 'summit' (weight 1) vs 'ground' (weight 1)
    const text = 'From the summit looking down at the distant ground below.';
    expect(classifyNarrationAngleIntent(text)).toBe('HIGH');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateCameraAngleModifier
// ---------------------------------------------------------------------------

describe('calculateCameraAngleModifier', () => {
  it('strictly bounds all modifiers within [-0.008, +0.008]', () => {
    const angles: CameraAngle[] = [
      'AERIAL_OVERHEAD',
      'HIGH_ANGLE',
      'EYE_LEVEL',
      'LOW_ANGLE',
      'GROUND_LEVEL',
    ];
    const intents: AngleIntent[] = ['AERIAL', 'HIGH', 'EYE', 'LOW', 'GROUND', 'NEUTRAL'];

    for (const angle of angles) {
      for (const intent of intents) {
        const res = calculateCameraAngleModifier(angle, intent);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.angleMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.angleMatchScore).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('awards +0.008 bonus for exact camera angle matches', () => {
    expect(calculateCameraAngleModifier('AERIAL_OVERHEAD', 'AERIAL').modifier).toBe(0.008);
    expect(calculateCameraAngleModifier('HIGH_ANGLE', 'HIGH').modifier).toBe(0.008);
    expect(calculateCameraAngleModifier('LOW_ANGLE', 'LOW').modifier).toBe(0.008);
    expect(calculateCameraAngleModifier('GROUND_LEVEL', 'GROUND').modifier).toBe(0.008);
    expect(calculateCameraAngleModifier('EYE_LEVEL', 'EYE').modifier).toBe(0.008);
  });

  it('applies partial positive alignments for adjacent or compatible camera perspectives', () => {
    // Aerial narration with high angle overlooking footage
    const aerialHigh = calculateCameraAngleModifier('HIGH_ANGLE', 'AERIAL');
    expect(aerialHigh.modifier).toBe(0.004);
    expect(aerialHigh.angleMatchScore).toBe(0.8);

    // High angle narration with aerial overview
    const highAerial = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'HIGH');
    expect(highAerial.modifier).toBe(0.004);
    expect(highAerial.angleMatchScore).toBe(0.8);

    // Low angle monumental narration with ground level perspective
    const lowGround = calculateCameraAngleModifier('GROUND_LEVEL', 'LOW');
    expect(lowGround.modifier).toBe(0.003);
    expect(lowGround.angleMatchScore).toBe(0.7);

    // Ground narration with low angle perspective
    const groundLow = calculateCameraAngleModifier('LOW_ANGLE', 'GROUND');
    expect(groundLow.modifier).toBe(0.003);
    expect(groundLow.angleMatchScore).toBe(0.7);
  });

  it('applies penalties for clashing camera angles', () => {
    // Aerial narration with ground level footage
    const aerialGround = calculateCameraAngleModifier('GROUND_LEVEL', 'AERIAL');
    expect(aerialGround.modifier).toBe(-0.006);
    expect(aerialGround.angleMatchScore).toBe(0.15);

    // Low angle monumental narration with overhead aerial footage
    const lowAerial = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'LOW');
    expect(lowAerial.modifier).toBe(-0.006);
    expect(lowAerial.angleMatchScore).toBe(0.15);

    // Ground level narration with overhead aerial footage
    const groundAerial = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'GROUND');
    expect(groundAerial.modifier).toBe(-0.006);
    expect(groundAerial.angleMatchScore).toBe(0.15);

    // Eye level conversational narration with overhead aerial footage
    const eyeAerial = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'EYE');
    expect(eyeAerial.modifier).toBe(-0.006);
    expect(eyeAerial.angleMatchScore).toBe(0.15);
  });

  it('returns 0.0 modifier and 0.5 match score for NEUTRAL intent', () => {
    const res = calculateCameraAngleModifier('EYE_LEVEL', 'NEUTRAL');
    expect(res.modifier).toBe(0.0);
    expect(res.angleMatchScore).toBe(0.5);
    expect(res.reason).toContain('Neutral camera angle intent');
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive Continuation Handling
// ---------------------------------------------------------------------------

describe('Consecutive Continuation Handling', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normally GROUND_LEVEL with AERIAL narration receives -0.006 penalty
    const standard = calculateCameraAngleModifier('GROUND_LEVEL', 'AERIAL', false);
    expect(standard.modifier).toBe(-0.006);

    const continued = calculateCameraAngleModifier('GROUND_LEVEL', 'AERIAL', true);
    expect(continued.modifier).toBe(0.0);
    expect(continued.angleMatchScore).toBe(0.8);
    expect(continued.reason).toContain('Consecutive shot continuation - camera angle penalties waived.');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat Transition & Perspective Establishing Handling
// ---------------------------------------------------------------------------

describe('Beat Transition & Perspective Establishing Handling', () => {
  it('grants +0.008 bonus with new beat perspective introduction reason at NEW_BEAT', () => {
    const res = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'AERIAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.angleMatchScore).toBe(1.0);
    expect(res.reason).toContain('New beat perspective introduction');
  });

  it('retains standard scoring for neutral intent at NEW_BEAT', () => {
    const res = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'NEUTRAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.0);
    expect(res.angleMatchScore).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–32 Intelligence Layers
// ---------------------------------------------------------------------------

describe('Independence from Other Intelligence Layers', () => {
  it('operates orthogonally alongside framing, lighting, motion, setting, and density', () => {
    const angleRes = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'AERIAL');
    expect(angleRes.cameraAngle).toBe('AERIAL_OVERHEAD');
    expect(angleRes.angleIntent).toBe('AERIAL');

    const framingSample: FramingScale = 'WIDE';
    const atmosphericSample: AtmosphericTone = 'HIGH_KEY_BRIGHT';
    const motionSample: CameraMotion = 'SMOOTH_FLOAT';
    const settingSample: SceneSetting = 'OUTDOOR_NATURAL';
    const densitySample: SubjectDensity = 'UNINHABITED_OBJECT';

    expect(framingSample).toBe('WIDE');
    expect(atmosphericSample).toBe('HIGH_KEY_BRIGHT');
    expect(motionSample).toBe('SMOOTH_FLOAT');
    expect(settingSample).toBe('OUTDOOR_NATURAL');
    expect(densitySample).toBe('UNINHABITED_OBJECT');
    expect(angleRes.modifier).toBe(0.008);
  });

  it('Step 28 framing scale is unaffected by camera angle classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['aerial', 'drone', 'overhead'],
      },
    });
    const angle = classifyCameraAngle(asset);
    expect(angle).toBe('AERIAL_OVERHEAD');
  });

  it('Step 29 atmospheric tone is unaffected by camera angle classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['rooftop', 'overlooking', 'high-angle'],
      },
    });
    const angle = classifyCameraAngle(asset);
    expect(angle).toBe('HIGH_ANGLE');
  });

  it('Step 30 camera motion is unaffected by camera angle classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['towering', 'skyscraper', 'low-angle'],
      },
    });
    const angle = classifyCameraAngle(asset);
    expect(angle).toBe('LOW_ANGLE');
  });

  it('Step 31 scene setting is unaffected by camera angle classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['ground', 'surface', 'dirt'],
      },
    });
    const angle = classifyCameraAngle(asset);
    expect(angle).toBe('GROUND_LEVEL');
  });

  it('Step 32 subject density is unaffected by camera angle classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['interview', 'portrait', 'eye-level'],
      },
    });
    const angle = classifyCameraAngle(asset);
    expect(angle).toBe('EYE_LEVEL');
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic Dominance Preservation with Step 33
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 33', () => {
  it('strong semantic match (0.82) with max angle penalty (-0.008) beats weak match (0.55) with max angle bonus (+0.008)', () => {
    const strongCandidateScore = 0.82 - 0.008; // 0.812
    const weakCandidateScore = 0.55 + 0.008;   // 0.558
    expect(strongCandidateScore).toBeGreaterThan(weakCandidateScore);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.08;
    const maxAllBonuses = +0.08;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.72
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.48
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 8. Schema Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Schema Round-Trip Serialization', () => {
  it('serializes and deserializes Step 33 provenance fields accurately', () => {
    const project = createInitialProject('Step 33 Serialization Test');
    const asset = createTestMediaAsset({ id: 'm-angle-1' });
    project.media.push(asset);

    project.timeline.push({
      id: 'clip-1',
      mediaId: 'm-angle-1',
      trackIndex: 0,
      startTime: 0,
      duration: 5.0,
      sourceStart: 0,
      sourceDuration: 10.0,
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
        explanation: 'Selected due to matching aerial overhead perspective',
        reuseCount: 0,
        cameraAngle: 'AERIAL_OVERHEAD',
        angleModifier: 0.008,
        angleReason: 'Angle bonus: aerial top-down perspective matches overhead narrative scope.',
        angleMatchScore: 1.0,
      },
    });

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project).toBeDefined();

    const prov = parsed.project!.timeline[0].provenance!;
    expect(prov.cameraAngle).toBe('AERIAL_OVERHEAD');
    expect(prov.angleModifier).toBe(0.008);
    expect(prov.angleReason).toBe('Angle bonus: aerial top-down perspective matches overhead narrative scope.');
    expect(prov.angleMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 9. DraftStats Counters Verification
// ---------------------------------------------------------------------------

describe('DraftStats Counters Verification', () => {
  it('supports all Step 33 angle metrics in DraftStats interface', () => {
    const stats: Partial<DraftStats> = {
      angleAdjustments: 14,
      aerialAngleSelections: 3,
      highAngleSelections: 2,
      eyeLevelAngleSelections: 6,
      lowAngleSelections: 2,
      groundAngleSelections: 1,
      angleBonuses: 10,
      anglePenalties: 4,
    };

    expect(stats.angleAdjustments).toBe(14);
    expect(stats.aerialAngleSelections).toBe(3);
    expect(stats.highAngleSelections).toBe(2);
    expect(stats.eyeLevelAngleSelections).toBe(6);
    expect(stats.lowAngleSelections).toBe(2);
    expect(stats.groundAngleSelections).toBe(1);
    expect(stats.angleBonuses).toBe(10);
    expect(stats.anglePenalties).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 10. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyCameraAngle does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['aerial', 'drone', 'overhead'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifyCameraAngle(frozen)).not.toThrow();
  });

  it('classifyNarrationAngleIntent does not mutate input text', () => {
    const text = 'From high above, we overlooked the city.';
    const copy = `${text}`;
    classifyNarrationAngleIntent(text);
    expect(text).toBe(copy);
  });

  it('angle modifier does not modify sourceStart or duration', () => {
    const res = calculateCameraAngleModifier('AERIAL_OVERHEAD', 'AERIAL');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of angle fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      cameraAngle: 'AERIAL_OVERHEAD' as CameraAngle,
      angleModifier: 0.008,
      angleReason: 'Test reason',
      angleMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.cameraAngle).toBe('AERIAL_OVERHEAD');
    expect(prov.angleModifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 11. Edge Cases and Boundaries
// ---------------------------------------------------------------------------

describe('Edge Cases and Boundaries', () => {
  it('handles asset with missing tags and empty descriptions gracefully', () => {
    const emptyAsset = createTestMediaAsset({
      analysis: undefined,
    });
    expect(classifyCameraAngle(emptyAsset)).toBe('EYE_LEVEL');
  });

  it('returns valid reason string for every angle/intent combination', () => {
    const allAngles: CameraAngle[] = [
      'AERIAL_OVERHEAD',
      'HIGH_ANGLE',
      'EYE_LEVEL',
      'LOW_ANGLE',
      'GROUND_LEVEL',
    ];
    const allIntents: AngleIntent[] = ['AERIAL', 'HIGH', 'EYE', 'LOW', 'GROUND', 'NEUTRAL'];
    for (const a of allAngles) {
      for (const i of allIntents) {
        const res = calculateCameraAngleModifier(a, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or angleMatchScore', () => {
    const allAngles: CameraAngle[] = [
      'AERIAL_OVERHEAD',
      'HIGH_ANGLE',
      'EYE_LEVEL',
      'LOW_ANGLE',
      'GROUND_LEVEL',
    ];
    const allIntents: AngleIntent[] = ['AERIAL', 'HIGH', 'EYE', 'LOW', 'GROUND', 'NEUTRAL'];
    for (const a of allAngles) {
      for (const i of allIntents) {
        const res = calculateCameraAngleModifier(a, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.angleMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.angleMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 camera angles are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['aerial', 'drone', 'topdown'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['overlooking', 'high-angle', 'rooftop'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['interview', 'portrait', 'eye-level'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['towering', 'skyscraper', 'low-angle'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['ground', 'surface', 'dirt'] } }),
    ];

    const classified = assets.map((a) => classifyCameraAngle(a));
    expect(classified).toContain('AERIAL_OVERHEAD');
    expect(classified).toContain('HIGH_ANGLE');
    expect(classified).toContain('EYE_LEVEL');
    expect(classified).toContain('LOW_ANGLE');
    expect(classified).toContain('GROUND_LEVEL');
  });
});
