/**
 * Step 41 — Camera Point-of-View & Observer Perspective Intelligence
 *
 * Dedicated test suite verifying:
 *  - Point-of-view classification (FIRST_PERSON_POV, OVER_THE_SHOULDER, DIRECT_ADDRESS, OBJECTIVE_OBSERVATIONAL, POV_AGNOSTIC)
 *  - Narration POV intent extraction (FIRST_PERSON, OVER_THE_SHOULDER, DIRECT_ADDRESS, OBSERVATIONAL, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset POV perspective establishing energy
 *  - Independence from Steps 27–40
 *  - Semantic dominance preservation
 *  - DraftStats counters & Full generateDraftTimeline integration
 *  - Schema JSON serialization round-trip
 *  - Immutability, edge cases, and determinism
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPointOfView,
  classifyNarrationPOVIntent,
  calculatePOVModifier,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  AudioSegment,
  PointOfView,
  POVIntent,
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
// 1. classifyPointOfView
// ---------------------------------------------------------------------------

describe('classifyPointOfView', () => {
  it('returns POV_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyPointOfView(null)).toBe('POV_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyPointOfView(undefined)).toBe('POV_AGNOSTIC');
  });

  it('classifies FIRST_PERSON_POV from first person, hands in frame, bodycam, gopro, subjective camera keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'chef_hands_cooking.mp4',
      analysis: { description: 'First person pov looking down at hands chopping vegetables', tags: ['first-person', 'hands-in-frame'] },
    });
    expect(classifyPointOfView(asset1)).toBe('FIRST_PERSON_POV');

    const asset2 = createTestMediaAsset({
      name: 'mountain_biking_gopro.mp4',
      analysis: { description: 'Subjective camera bodycam view racing down a mountain trail', tags: ['bodycam', 'gopro-view'] },
    });
    expect(classifyPointOfView(asset2)).toBe('FIRST_PERSON_POV');
  });

  it('classifies OVER_THE_SHOULDER from ots, over the shoulder, behind shoulder keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'interview_ots.mp4',
      analysis: { description: 'Over the shoulder view watching laptop screen from behind', tags: ['ots-shot', 'over-the-shoulder'] },
    });
    expect(classifyPointOfView(asset1)).toBe('OVER_THE_SHOULDER');

    const asset2 = createTestMediaAsset({
      name: 'classroom_shoulder.mp4',
      analysis: { description: 'Framing looking past student shoulder towards the chalkboard', tags: ['behind-shoulder', 'shoulder-shot'] },
    });
    expect(classifyPointOfView(asset2)).toBe('OVER_THE_SHOULDER');
  });

  it('classifies DIRECT_ADDRESS from direct address, looking at camera, talking head, eye contact keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'host_presentation.mp4',
      analysis: { description: 'Presenter with direct address making eye contact with audience', tags: ['talking-head', 'to-camera'] },
    });
    expect(classifyPointOfView(asset1)).toBe('DIRECT_ADDRESS');

    const asset2 = createTestMediaAsset({
      name: 'vlogger_to_lens.mp4',
      analysis: { description: 'Front facing speaker looking straight at camera breaking fourth wall', tags: ['eye-contact', 'fourth-wall'] },
    });
    expect(classifyPointOfView(asset2)).toBe('DIRECT_ADDRESS');
  });

  it('classifies OBJECTIVE_OBSERVATIONAL from observational, bystander, fly on the wall, third person keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'wildlife_distance.mp4',
      analysis: { description: 'Observational fly on the wall view of lions resting in savanna', tags: ['bystander', 'unseen-observer'] },
    });
    expect(classifyPointOfView(asset1)).toBe('OBJECTIVE_OBSERVATIONAL');

    const asset2 = createTestMediaAsset({
      name: 'street_candid.mp4',
      analysis: { description: 'Candid third person footage watching from a distance unnoticed', tags: ['observational', 'candid-shot'] },
    });
    expect(classifyPointOfView(asset2)).toBe('OBJECTIVE_OBSERVATIONAL');
  });

  it('returns POV_AGNOSTIC for unanalyzed or neutral asset', () => {
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
    expect(classifyPointOfView(unanalyzedAsset)).toBe('POV_AGNOSTIC');

    const neutralAsset = createTestMediaAsset({
      name: 'scenic_landscape.mp4',
      analysis: { description: 'General landscape view', tags: ['neutral', 'clip'] },
    });
    expect(classifyPointOfView(neutralAsset)).toBe('POV_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationPOVIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationPOVIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationPOVIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationPOVIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts FIRST_PERSON intent from through my eyes, in my hands, first person keywords', () => {
    expect(classifyNarrationPOVIntent('Seen through my eyes, the control panel was glowing brightly.')).toBe('FIRST_PERSON');
    expect(classifyNarrationPOVIntent('Holding the device in my hands, I began the calibration.')).toBe('FIRST_PERSON');
    expect(classifyNarrationPOVIntent('From my perspective, everything seemed to happen in an instant.')).toBe('FIRST_PERSON');
  });

  it('extracts OVER_THE_SHOULDER intent from over the shoulder, watching from behind keywords', () => {
    expect(classifyNarrationPOVIntent('Watching from behind as the artisan shaped the clay on the wheel.')).toBe('OVER_THE_SHOULDER');
    expect(classifyNarrationPOVIntent('Looking on over their shoulder at the schematic diagram.')).toBe('OVER_THE_SHOULDER');
  });

  it('extracts DIRECT_ADDRESS intent from look at me, speaking directly to you, face to face keywords', () => {
    expect(classifyNarrationPOVIntent('Look at me and listen closely to what comes next.')).toBe('DIRECT_ADDRESS');
    expect(classifyNarrationPOVIntent('Speaking directly to you, I want to clarify our main objective.')).toBe('DIRECT_ADDRESS');
    expect(classifyNarrationPOVIntent('Let me tell you face to face why this matters.')).toBe('DIRECT_ADDRESS');
  });

  it('extracts OBSERVATIONAL intent from watching from a distance, fly on the wall, from afar keywords', () => {
    expect(classifyNarrationPOVIntent('Watching from a distance as the city slowly wakes up.')).toBe('OBSERVATIONAL');
    expect(classifyNarrationPOVIntent('Like a fly on the wall, we observe the negotiation taking place.')).toBe('OBSERVATIONAL');
    expect(classifyNarrationPOVIntent('From afar, the crowd appeared as a single moving organism.')).toBe('OBSERVATIONAL');
  });

  it('returns NEUTRAL for narration without point-of-view cues', () => {
    expect(classifyNarrationPOVIntent('Quarterly revenue climbed twelve percent following the launch.')).toBe('NEUTRAL');
    expect(classifyNarrationPOVIntent('The standard operating procedure must be followed strictly.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationPOVIntent('SEEN THROUGH MY EYES AS I WALKED FORWARD')).toBe('FIRST_PERSON');
    expect(classifyNarrationPOVIntent('LOOK AT ME AND UNDERSTAND THIS POINT')).toBe('DIRECT_ADDRESS');
    expect(classifyNarrationPOVIntent('WATCHING FROM A DISTANCE ACROSS THE PLAZA')).toBe('OBSERVATIONAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculatePOVModifier
// ---------------------------------------------------------------------------

describe('calculatePOVModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const povs: PointOfView[] = [
      'FIRST_PERSON_POV',
      'OVER_THE_SHOULDER',
      'DIRECT_ADDRESS',
      'OBJECTIVE_OBSERVATIONAL',
      'POV_AGNOSTIC',
    ];

    const intents: POVIntent[] = ['FIRST_PERSON', 'OVER_THE_SHOULDER', 'DIRECT_ADDRESS', 'OBSERVATIONAL', 'NEUTRAL'];

    for (const p of povs) {
      for (const i of intents) {
        const res = calculatePOVModifier(p, i);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.povMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.povMatchScore).toBeLessThanOrEqual(1.0);
        expect(typeof res.reason).toBe('string');
        expect(res.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('awards +0.008 bonus for exact POV matches', () => {
    expect(calculatePOVModifier('FIRST_PERSON_POV', 'FIRST_PERSON').modifier).toBe(0.008);
    expect(calculatePOVModifier('FIRST_PERSON_POV', 'FIRST_PERSON').povMatchScore).toBe(1.0);

    expect(calculatePOVModifier('OVER_THE_SHOULDER', 'OVER_THE_SHOULDER').modifier).toBe(0.008);
    expect(calculatePOVModifier('OVER_THE_SHOULDER', 'OVER_THE_SHOULDER').povMatchScore).toBe(1.0);

    expect(calculatePOVModifier('DIRECT_ADDRESS', 'DIRECT_ADDRESS').modifier).toBe(0.008);
    expect(calculatePOVModifier('DIRECT_ADDRESS', 'DIRECT_ADDRESS').povMatchScore).toBe(1.0);

    expect(calculatePOVModifier('OBJECTIVE_OBSERVATIONAL', 'OBSERVATIONAL').modifier).toBe(0.008);
    expect(calculatePOVModifier('OBJECTIVE_OBSERVATIONAL', 'OBSERVATIONAL').povMatchScore).toBe(1.0);
  });

  it('awards moderate bonuses for compatible POV pairs', () => {
    // OTS provides adjacent personal viewpoint for first person narration
    expect(calculatePOVModifier('OVER_THE_SHOULDER', 'FIRST_PERSON').modifier).toBe(0.003);
    // Observational perspective is compatible with OTS context
    expect(calculatePOVModifier('OBJECTIVE_OBSERVATIONAL', 'OVER_THE_SHOULDER').modifier).toBe(0.003);
    // First person is compatible with watching action in OTS
    expect(calculatePOVModifier('FIRST_PERSON_POV', 'OVER_THE_SHOULDER').modifier).toBe(0.002);
    // OTS supports observational perspective
    expect(calculatePOVModifier('OVER_THE_SHOULDER', 'OBSERVATIONAL').modifier).toBe(0.003);
  });

  it('penalizes opposing point-of-view perspectives', () => {
    // Direct address into camera when first-person immersive viewpoint requested
    const firstPersonMismatch = calculatePOVModifier('DIRECT_ADDRESS', 'FIRST_PERSON');
    expect(firstPersonMismatch.modifier).toBe(-0.006);
    expect(firstPersonMismatch.povMatchScore).toBe(0.15);

    // Subjective first-person camera when direct address presenter requested
    const directMismatch = calculatePOVModifier('FIRST_PERSON_POV', 'DIRECT_ADDRESS');
    expect(directMismatch.modifier).toBe(-0.006);
    expect(directMismatch.povMatchScore).toBe(0.15);

    // Direct address presenter when observational detached viewpoint requested
    const obsMismatch = calculatePOVModifier('DIRECT_ADDRESS', 'OBSERVATIONAL');
    expect(obsMismatch.modifier).toBe(-0.005);
    expect(obsMismatch.povMatchScore).toBe(0.2);
  });

  it('returns neutral 0.0 modifier for neutral intent or agnostic POV', () => {
    expect(calculatePOVModifier('FIRST_PERSON_POV', 'NEUTRAL').modifier).toBe(0.0);
    expect(calculatePOVModifier('POV_AGNOSTIC', 'FIRST_PERSON').modifier).toBe(0.0);
    expect(calculatePOVModifier('POV_AGNOSTIC', 'OVER_THE_SHOULDER').modifier).toBe(0.0);
    expect(calculatePOVModifier('POV_AGNOSTIC', 'DIRECT_ADDRESS').modifier).toBe(0.0);
    expect(calculatePOVModifier('POV_AGNOSTIC', 'OBSERVATIONAL').modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive continuation penalty waiving
// ---------------------------------------------------------------------------

describe('Consecutive continuation penalty waiving', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normal opposing mismatch has -0.006 penalty
    const normalMismatch = calculatePOVModifier('DIRECT_ADDRESS', 'FIRST_PERSON', false);
    expect(normalMismatch.modifier).toBe(-0.006);

    // With consecutive continuation, modifier is waived to 0.0
    const continuedMismatch = calculatePOVModifier('DIRECT_ADDRESS', 'FIRST_PERSON', true);
    expect(continuedMismatch.modifier).toBe(0.0);
    expect(continuedMismatch.povMatchScore).toBe(0.8);
    expect(continuedMismatch.reason).toContain('Consecutive shot continuation');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat-reset POV establishing energy
// ---------------------------------------------------------------------------

describe('Beat-reset POV establishing energy', () => {
  it('awards +0.008 modifier with NEW_BEAT narrationBeatType for matching intent', () => {
    const beatMatch = calculatePOVModifier('FIRST_PERSON_POV', 'FIRST_PERSON', false, 'NEW_BEAT');
    expect(beatMatch.modifier).toBe(0.008);
    expect(beatMatch.povMatchScore).toBe(1.0);
    expect(beatMatch.reason).toContain('New beat perspective introduction');
  });

  it('does not award beat bonus if narration intent is NEUTRAL', () => {
    const beatNeutral = calculatePOVModifier('FIRST_PERSON_POV', 'NEUTRAL', false, 'NEW_BEAT');
    expect(beatNeutral.modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 27–40
// ---------------------------------------------------------------------------

describe('Independence from Steps 27–40', () => {
  it('operates orthogonally to lighting, composition, and other visual intelligence layers', () => {
    const asset = createTestMediaAsset({
      name: 'backlit_firstperson_wide_sunset.mp4',
      analysis: {
        description: 'First person pov subjective camera looking down at hands during golden hour sunset with backlit rim light',
        tags: ['first-person', 'hands-in-frame', 'backlit', 'sunset', 'wide'],
      },
    });

    const pov = classifyPointOfView(asset);
    expect(pov).toBe('FIRST_PERSON_POV');

    // Step 41 modifier evaluates strictly on POV
    const res = calculatePOVModifier(pov, 'FIRST_PERSON');
    expect(res.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic dominance preservation
// ---------------------------------------------------------------------------

describe('Semantic dominance preservation', () => {
  it('ensures semantic relevance remains dominant over POV modifiers', () => {
    const strongSemanticScore = 0.85;
    const weakSemanticScore = 0.40;

    const strongAssetPenalty = calculatePOVModifier('DIRECT_ADDRESS', 'FIRST_PERSON').modifier; // -0.006
    const weakAssetBonus = calculatePOVModifier('FIRST_PERSON_POV', 'FIRST_PERSON').modifier; // +0.008

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
  it('populates Step 41 provenance fields and stats in generateDraftTimeline', async () => {
    const segments: AudioSegment[] = [
      {
        id: 's1',
        startTime: 0,
        endTime: 4,
        text: 'Seen through my eyes, the control panel was glowing brightly.',
      },
    ];

    const media: MediaAsset[] = [
      createTestMediaAsset({
        id: 'm1',
        name: 'cockpit_pov.mp4',
        analysis: {
          analyzed: true,
          description: 'First person pov subjective view looking at glowing cockpit control panel',
          tags: ['first-person', 'pov', 'cockpit', 'control-panel'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(1);
    const item = result.timeline[0];
    expect(item.provenance?.pointOfView).toBe('FIRST_PERSON_POV');
    expect(item.provenance?.povModifier).toBe(0.008);
    expect(item.provenance?.povReason).toContain('subjective first-person camera');
    expect(item.provenance?.povMatchScore).toBe(1.0);

    expect(result.stats.povAdjustments).toBe(1);
    expect(result.stats.firstPersonSelections).toBe(1);
    expect(result.stats.povBonuses).toBe(1);
  });

  it('includes all 8 Step 41 POV counters in DraftStats type', () => {
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
      // Step 41 fields
      povAdjustments: 1,
      firstPersonSelections: 1,
      overTheShoulderSelections: 0,
      directAddressSelections: 0,
      observationalSelections: 0,
      povAgnosticSelections: 0,
      povBonuses: 1,
      povPenalties: 0,
    };

    expect(stats.povAdjustments).toBe(1);
    expect(stats.firstPersonSelections).toBe(1);
    expect(stats.overTheShoulderSelections).toBe(0);
    expect(stats.directAddressSelections).toBe(0);
    expect(stats.observationalSelections).toBe(0);
    expect(stats.povAgnosticSelections).toBe(0);
    expect(stats.povBonuses).toBe(1);
    expect(stats.povPenalties).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON Serialization & Validation Round-Trip
// ---------------------------------------------------------------------------

describe('Schema JSON Serialization & Validation Round-Trip', () => {
  it('successfully exports and parses Step 41 pointOfView provenance fields', () => {
    const project = createInitialProject('Step 41 Test');
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
          sourceSegmentText: 'Seen through my eyes as I walked forward.',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match with first person subjective camera.',
          reuseCount: 0,
          pointOfView: 'FIRST_PERSON_POV',
          povModifier: 0.008,
          povReason: 'POV bonus: subjective first-person camera matches personal first-person narrative.',
          povMatchScore: 1.0,
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    const item = parsed.project?.timeline[0];
    expect(item?.provenance?.pointOfView).toBe('FIRST_PERSON_POV');
    expect(item?.provenance?.povModifier).toBe(0.008);
    expect(item?.provenance?.povReason).toBe('POV bonus: subjective first-person camera matches personal first-person narrative.');
    expect(item?.provenance?.povMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Immutability, edge cases, and determinism
// ---------------------------------------------------------------------------

describe('Immutability, edge cases, and determinism', () => {
  it('does not mutate input candidate asset or description', () => {
    const asset = createTestMediaAsset({
      name: 'freeze_test.mp4',
      analysis: { description: 'First person pov view', tags: ['first-person'] },
    });
    const frozenAsset = Object.freeze({ ...asset });

    const pov1 = classifyPointOfView(frozenAsset);
    const pov2 = classifyPointOfView(frozenAsset);
    expect(pov1).toBe('FIRST_PERSON_POV');
    expect(pov2).toBe('FIRST_PERSON_POV');
  });

  it('produces identical deterministic results across repeated calls', () => {
    const res1 = calculatePOVModifier('FIRST_PERSON_POV', 'FIRST_PERSON');
    const res2 = calculatePOVModifier('FIRST_PERSON_POV', 'FIRST_PERSON');
    expect(res1).toEqual(res2);
  });

  it('never returns NaN or Infinity for modifier or povMatchScore', () => {
    const povs: PointOfView[] = [
      'FIRST_PERSON_POV',
      'OVER_THE_SHOULDER',
      'DIRECT_ADDRESS',
      'OBJECTIVE_OBSERVATIONAL',
      'POV_AGNOSTIC',
    ];
    const intents: POVIntent[] = ['FIRST_PERSON', 'OVER_THE_SHOULDER', 'DIRECT_ADDRESS', 'OBSERVATIONAL', 'NEUTRAL'];
    for (const p of povs) {
      for (const i of intents) {
        const res = calculatePOVModifier(p, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.povMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.povMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 POV classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['first-person', 'hands-in-frame'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['ots-shot', 'over-the-shoulder'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['talking-head', 'to-camera'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['bystander', 'unseen-observer'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyPointOfView(a));
    expect(classified).toContain('FIRST_PERSON_POV');
    expect(classified).toContain('OVER_THE_SHOULDER');
    expect(classified).toContain('DIRECT_ADDRESS');
    expect(classified).toContain('OBJECTIVE_OBSERVATIONAL');
    expect(classified).toContain('POV_AGNOSTIC');
  });
});
