/**
 * Step 44 — Optical Lens & Focal Perspective Intelligence
 *
 * Dedicated test suite verifying:
 *  - Optical lens classification (FISHEYE_ULTRAWIDE, WIDE_ANGLE_EXPANSIVE, STANDARD_NORMAL, TELEPHOTO_COMPRESSED, MACRO_MICROSCOPIC, LENS_AGNOSTIC)
 *  - Narration lens intent extraction (FISHEYE, WIDE, NORMAL, TELEPHOTO, MACRO, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and opposing lens penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset optical lens perspective establishing focal scale
 *  - Independence from Steps 27–43 (Framing scale, depth of field, camera motion, POV, chromatic grading, trajectory)
 *  - Semantic dominance preservation
 *  - DraftStats counters & Full generateDraftTimeline integration
 *  - Schema JSON serialization round-trip
 *  - Immutability, edge cases, and determinism
 */

import { describe, it, expect } from 'vitest';
import {
  classifyOpticalLensPerspective,
  classifyNarrationLensIntent,
  calculateLensModifier,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  AudioSegment,
  OpticalLensPerspective,
  LensIntent,
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
// 1. classifyOpticalLensPerspective
// ---------------------------------------------------------------------------

describe('classifyOpticalLensPerspective', () => {
  it('returns LENS_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyOpticalLensPerspective(null)).toBe('LENS_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyOpticalLensPerspective(undefined)).toBe('LENS_AGNOSTIC');
  });

  it('classifies FISHEYE_ULTRAWIDE from fisheye, ultra-wide, barrel-distortion, action-cam keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'skateboard_fisheye.mp4',
      analysis: { description: 'Action camera with extreme fisheye lens and pronounced barrel distortion', tags: ['fisheye', 'action-cam'] },
    });
    expect(classifyOpticalLensPerspective(asset1)).toBe('FISHEYE_ULTRAWIDE');

    const asset2 = createTestMediaAsset({
      name: 'gopro_surf.mp4',
      analysis: { description: 'Surfer recorded with ultra wide angle curvilinear perspective', tags: ['ultra-wide', 'gopro'] },
    });
    expect(classifyOpticalLensPerspective(asset2)).toBe('FISHEYE_ULTRAWIDE');
  });

  it('classifies WIDE_ANGLE_EXPANSIVE from wide-angle, expansive field of view, sweeping-view keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'architectural_hall.mp4',
      analysis: { description: 'Interior of grand cathedral captured with a 24mm wide angle lens', tags: ['wide-angle', 'expansive'] },
    });
    expect(classifyOpticalLensPerspective(asset1)).toBe('WIDE_ANGLE_EXPANSIVE');

    const asset2 = createTestMediaAsset({
      name: 'mountain_valley.mp4',
      analysis: { description: 'Vast expansive view of the canyon showing broad environmental scenery', tags: ['environmental', 'broad-view'] },
    });
    expect(classifyOpticalLensPerspective(asset2)).toBe('WIDE_ANGLE_EXPANSIVE');
  });

  it('classifies STANDARD_NORMAL from standard 50mm, human eye perspective, natural undistorted keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'portrait_interview.mp4',
      analysis: { description: 'Documentary standard lens with natural undistorted perspective and true to life proportion', tags: ['50mm', 'standard-lens'] },
    });
    expect(classifyOpticalLensPerspective(asset1)).toBe('STANDARD_NORMAL');

    const asset2 = createTestMediaAsset({
      name: 'street_scene.mp4',
      analysis: { description: 'Human eye perspective street documentation with distortion-free framing', tags: ['human-eye', 'natural-perspective'] },
    });
    expect(classifyOpticalLensPerspective(asset2)).toBe('STANDARD_NORMAL');
  });

  it('classifies TELEPHOTO_COMPRESSED from telephoto lens, compressed background, long lens keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'wildlife_safari.mp4',
      analysis: { description: 'Distant lion filmed with telephoto lens showing compressed depth and spatial compression', tags: ['telephoto', 'compressed-depth'] },
    });
    expect(classifyOpticalLensPerspective(asset1)).toBe('TELEPHOTO_COMPRESSED');

    const asset2 = createTestMediaAsset({
      name: 'city_skyline_zoom.mp4',
      analysis: { description: 'Long focal length zoom with compressed background and distant telephoto reach', tags: ['long-lens', '70-200mm'] },
    });
    expect(classifyOpticalLensPerspective(asset2)).toBe('TELEPHOTO_COMPRESSED');
  });

  it('classifies MACRO_MICROSCOPIC from macro lens, microscopic detail, probe lens keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'butterfly_wing.mp4',
      analysis: { description: 'Extreme magnification of butterfly wing scales using a macro lens', tags: ['macro', 'microscopic'] },
    });
    expect(classifyOpticalLensPerspective(asset1)).toBe('MACRO_MICROSCOPIC');

    const asset2 = createTestMediaAsset({
      name: 'circuit_micro.mp4',
      analysis: { description: 'Probe lens close examination of semiconductor micro detail at cellular level', tags: ['probe-lens', 'micro-detail'] },
    });
    expect(classifyOpticalLensPerspective(asset2)).toBe('MACRO_MICROSCOPIC');
  });

  it('returns LENS_AGNOSTIC for unanalyzed or neutral footage', () => {
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
    expect(classifyOpticalLensPerspective(unanalyzedAsset)).toBe('LENS_AGNOSTIC');

    const neutralAsset = createTestMediaAsset({
      name: 'general_stock.mp4',
      analysis: { description: 'General background clip', tags: ['neutral', 'clip'] },
    });
    expect(classifyOpticalLensPerspective(neutralAsset)).toBe('LENS_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationLensIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationLensIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationLensIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationLensIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts FISHEYE intent from fisheye lens, ultra wide angle, action cam, barrel distortion keywords', () => {
    expect(classifyNarrationLensIntent('Captured on an action cam with extreme fisheye lens distortion.')).toBe('FISHEYE');
    expect(classifyNarrationLensIntent('The ultra wide angle view curves the horizon dramatically.')).toBe('FISHEYE');
    expect(classifyNarrationLensIntent('Notice the distinct barrel distortion across the dynamic shot.')).toBe('FISHEYE');
  });

  it('extracts WIDE intent from wide angle, expansive view, sweeping expanse, broad field of view keywords', () => {
    expect(classifyNarrationLensIntent('A sweeping expanse opens up before us in a grand wide angle perspective.')).toBe('WIDE');
    expect(classifyNarrationLensIntent('The expansive view captures the entire mountain valley.')).toBe('WIDE');
    expect(classifyNarrationLensIntent('With a broad field of view, we take in the surrounding landscape.')).toBe('WIDE');
  });

  it('extracts NORMAL intent from natural perspective, human eye view, standard lens keywords', () => {
    expect(classifyNarrationLensIntent('Presented through a natural perspective as seen by the naked human eye.')).toBe('NORMAL');
    expect(classifyNarrationLensIntent('A standard lens gives true to life proportion to the interview.')).toBe('NORMAL');
    expect(classifyNarrationLensIntent('Documentary style view provides an unexaggerated real-world look.')).toBe('NORMAL');
  });

  it('extracts TELEPHOTO intent from telephoto lens, compressed background, long lens observation keywords', () => {
    expect(classifyNarrationLensIntent('Filmed through a telephoto lens, the distant peaks appear compressed against the city.')).toBe('TELEPHOTO');
    expect(classifyNarrationLensIntent('Long lens observation allows us to track the subject from miles away.')).toBe('TELEPHOTO');
    expect(classifyNarrationLensIntent('The compressed background flattens the distance between the layers.')).toBe('TELEPHOTO');
  });

  it('extracts MACRO intent from macro lens, microscopic view, magnified detail, cellular scale keywords', () => {
    expect(classifyNarrationLensIntent('Under a macro lens, the intricate crystalline patterns become visible.')).toBe('MACRO');
    expect(classifyNarrationLensIntent('A microscopic view reveals life on a cellular scale.')).toBe('MACRO');
    expect(classifyNarrationLensIntent('Extreme close up examination displays the magnified detail of the structure.')).toBe('MACRO');
  });

  it('returns NEUTRAL for narration without optical lens cues', () => {
    expect(classifyNarrationLensIntent('We reviewed the timeline and confirmed all deadlines.')).toBe('NEUTRAL');
    expect(classifyNarrationLensIntent('The user interface has undergone significant usability updates.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationLensIntent('CAPTURED THROUGH A TELEPHOTO LENS WITH COMPRESSED BACKGROUND')).toBe('TELEPHOTO');
    expect(classifyNarrationLensIntent('A SWEEPING EXPANSE WITH BROAD FIELD OF VIEW')).toBe('WIDE');
    expect(classifyNarrationLensIntent('MICROSCOPIC VIEW ON A CELLULAR SCALE')).toBe('MACRO');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateLensModifier
// ---------------------------------------------------------------------------

describe('calculateLensModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const perspectives: OpticalLensPerspective[] = [
      'FISHEYE_ULTRAWIDE',
      'WIDE_ANGLE_EXPANSIVE',
      'STANDARD_NORMAL',
      'TELEPHOTO_COMPRESSED',
      'MACRO_MICROSCOPIC',
      'LENS_AGNOSTIC',
    ];

    const intents: LensIntent[] = ['FISHEYE', 'WIDE', 'NORMAL', 'TELEPHOTO', 'MACRO', 'NEUTRAL'];

    for (const p of perspectives) {
      for (const i of intents) {
        const res = calculateLensModifier(p, i);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.lensMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.lensMatchScore).toBeLessThanOrEqual(1.0);
        expect(typeof res.reason).toBe('string');
        expect(res.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('awards +0.008 bonus for exact optical lens matches', () => {
    expect(calculateLensModifier('FISHEYE_ULTRAWIDE', 'FISHEYE').modifier).toBe(0.008);
    expect(calculateLensModifier('FISHEYE_ULTRAWIDE', 'FISHEYE').lensMatchScore).toBe(1.0);

    expect(calculateLensModifier('WIDE_ANGLE_EXPANSIVE', 'WIDE').modifier).toBe(0.008);
    expect(calculateLensModifier('WIDE_ANGLE_EXPANSIVE', 'WIDE').lensMatchScore).toBe(1.0);

    expect(calculateLensModifier('STANDARD_NORMAL', 'NORMAL').modifier).toBe(0.008);
    expect(calculateLensModifier('STANDARD_NORMAL', 'NORMAL').lensMatchScore).toBe(1.0);

    expect(calculateLensModifier('TELEPHOTO_COMPRESSED', 'TELEPHOTO').modifier).toBe(0.008);
    expect(calculateLensModifier('TELEPHOTO_COMPRESSED', 'TELEPHOTO').lensMatchScore).toBe(1.0);

    expect(calculateLensModifier('MACRO_MICROSCOPIC', 'MACRO').modifier).toBe(0.008);
    expect(calculateLensModifier('MACRO_MICROSCOPIC', 'MACRO').lensMatchScore).toBe(1.0);
  });

  it('awards moderate bonuses for compatible lens pairs', () => {
    // Wide angle is compatible with fisheye action intent
    expect(calculateLensModifier('WIDE_ANGLE_EXPANSIVE', 'FISHEYE').modifier).toBe(0.003);
    // Fisheye supports sweeping wide coverage
    expect(calculateLensModifier('FISHEYE_ULTRAWIDE', 'WIDE').modifier).toBe(0.003);
    // Standard normal supports wide environmental narrative
    expect(calculateLensModifier('STANDARD_NORMAL', 'WIDE').modifier).toBe(0.002);
    // Telephoto supports tight macro observation
    expect(calculateLensModifier('TELEPHOTO_COMPRESSED', 'MACRO').modifier).toBe(0.002);
  });

  it('penalizes opposing optical lens perspectives', () => {
    // Macro candidate when wide requested
    const macroToWide = calculateLensModifier('MACRO_MICROSCOPIC', 'WIDE');
    expect(macroToWide.modifier).toBe(-0.006);
    expect(macroToWide.lensMatchScore).toBe(0.15);

    // Wide candidate when macro requested
    const wideToMacro = calculateLensModifier('WIDE_ANGLE_EXPANSIVE', 'MACRO');
    expect(wideToMacro.modifier).toBe(-0.006);
    expect(wideToMacro.lensMatchScore).toBe(0.15);

    // Telephoto candidate when fisheye requested
    const teleToFisheye = calculateLensModifier('TELEPHOTO_COMPRESSED', 'FISHEYE');
    expect(teleToFisheye.modifier).toBe(-0.006);
    expect(teleToFisheye.lensMatchScore).toBe(0.15);

    // Fisheye candidate when telephoto requested
    const fisheyeToTele = calculateLensModifier('FISHEYE_ULTRAWIDE', 'TELEPHOTO');
    expect(fisheyeToTele.modifier).toBe(-0.006);
    expect(fisheyeToTele.lensMatchScore).toBe(0.15);
  });

  it('returns neutral 0.0 modifier for neutral intent or agnostic lens profile', () => {
    expect(calculateLensModifier('STANDARD_NORMAL', 'NEUTRAL').modifier).toBe(0.0);
    expect(calculateLensModifier('LENS_AGNOSTIC', 'FISHEYE').modifier).toBe(0.0);
    expect(calculateLensModifier('LENS_AGNOSTIC', 'WIDE').modifier).toBe(0.0);
    expect(calculateLensModifier('LENS_AGNOSTIC', 'NORMAL').modifier).toBe(0.0);
    expect(calculateLensModifier('LENS_AGNOSTIC', 'TELEPHOTO').modifier).toBe(0.0);
    expect(calculateLensModifier('LENS_AGNOSTIC', 'MACRO').modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive continuation penalty waiving
// ---------------------------------------------------------------------------

describe('Consecutive continuation penalty waiving', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normal opposing mismatch has -0.006 penalty
    const normalMismatch = calculateLensModifier('MACRO_MICROSCOPIC', 'WIDE', false);
    expect(normalMismatch.modifier).toBe(-0.006);

    // With consecutive continuation, modifier is waived to 0.0
    const continuedMismatch = calculateLensModifier('MACRO_MICROSCOPIC', 'WIDE', true);
    expect(continuedMismatch.modifier).toBe(0.0);
    expect(continuedMismatch.lensMatchScore).toBe(0.8);
    expect(continuedMismatch.reason).toContain('Consecutive shot continuation');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat-reset optical lens perspective establishing focal scale
// ---------------------------------------------------------------------------

describe('Beat-reset optical lens perspective establishing focal scale', () => {
  it('awards +0.008 modifier with NEW_BEAT narrationBeatType for matching intent', () => {
    const beatMatch = calculateLensModifier('TELEPHOTO_COMPRESSED', 'TELEPHOTO', false, 'NEW_BEAT');
    expect(beatMatch.modifier).toBe(0.008);
    expect(beatMatch.lensMatchScore).toBe(1.0);
    expect(beatMatch.reason).toContain('New beat optical lens introduction');
  });

  it('does not award beat bonus if narration intent is NEUTRAL', () => {
    const beatNeutral = calculateLensModifier('TELEPHOTO_COMPRESSED', 'NEUTRAL', false, 'NEW_BEAT');
    expect(beatNeutral.modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 27–43
// ---------------------------------------------------------------------------

describe('Independence from Steps 27–43', () => {
  it('operates orthogonally to framing scale, camera motion, depth of field, and action trajectory', () => {
    const asset = createTestMediaAsset({
      name: 'complex_cinematography.mp4',
      analysis: {
        description: 'Close-up framing with shallow bokeh depth of field and telephoto compressed background approaching the camera',
        tags: ['closeup', 'shallow-bokeh', 'telephoto', 'compressed-depth', 'approaching'],
      },
    });

    const lens = classifyOpticalLensPerspective(asset);
    expect(lens).toBe('TELEPHOTO_COMPRESSED');

    // Step 44 evaluates strictly on optical lens perspective
    const res = calculateLensModifier(lens, 'TELEPHOTO');
    expect(res.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic dominance preservation
// ---------------------------------------------------------------------------

describe('Semantic dominance preservation', () => {
  it('ensures semantic relevance remains dominant over lens modifiers', () => {
    const strongSemanticScore = 0.85;
    const weakSemanticScore = 0.40;

    const strongAssetPenalty = calculateLensModifier('MACRO_MICROSCOPIC', 'WIDE').modifier; // -0.006
    const weakAssetBonus = calculateLensModifier('WIDE_ANGLE_EXPANSIVE', 'WIDE').modifier; // +0.008

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
  it('populates Step 44 provenance fields and stats in generateDraftTimeline', async () => {
    const segments: AudioSegment[] = [
      {
        id: 's1',
        startTime: 0,
        endTime: 4,
        text: 'Captured through a telephoto lens, the distant peaks appear compressed against the city.',
      },
    ];

    const media: MediaAsset[] = [
      createTestMediaAsset({
        id: 'm1',
        name: 'telephoto_city.mp4',
        analysis: {
          analyzed: true,
          description: 'City skyline with telephoto lens and compressed background perspective',
          tags: ['telephoto', 'compressed-depth', 'city', 'long-lens'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(1);
    const item = result.timeline[0];
    expect(item.provenance?.lensPerspective).toBe('TELEPHOTO_COMPRESSED');
    expect(item.provenance?.lensModifier).toBe(0.008);
    expect(item.provenance?.lensReason).toContain('compressed telephoto perspective matches distant observation narrative');
    expect(item.provenance?.lensMatchScore).toBe(1.0);

    expect(result.stats.lensAdjustments).toBe(1);
    expect(result.stats.telephotoSelections).toBe(1);
    expect(result.stats.lensBonuses).toBe(1);
  });

  it('includes all 9 Step 44 lens counters in DraftStats type', () => {
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
      // Step 44 fields
      lensAdjustments: 1,
      fisheyeSelections: 0,
      wideAngleSelections: 0,
      standardLensSelections: 0,
      telephotoSelections: 1,
      macroSelections: 0,
      lensAgnosticSelections: 0,
      lensBonuses: 1,
      lensPenalties: 0,
    };

    expect(stats.lensAdjustments).toBe(1);
    expect(stats.fisheyeSelections).toBe(0);
    expect(stats.wideAngleSelections).toBe(0);
    expect(stats.standardLensSelections).toBe(0);
    expect(stats.telephotoSelections).toBe(1);
    expect(stats.macroSelections).toBe(0);
    expect(stats.lensAgnosticSelections).toBe(0);
    expect(stats.lensBonuses).toBe(1);
    expect(stats.lensPenalties).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON Serialization & Validation Round-Trip
// ---------------------------------------------------------------------------

describe('Schema JSON Serialization & Validation Round-Trip', () => {
  it('successfully exports and parses Step 44 lensPerspective provenance fields', () => {
    const project = createInitialProject('Step 44 Test');
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
          sourceSegmentText: 'Distant telephoto observation.',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match with compressed telephoto perspective.',
          reuseCount: 0,
          lensPerspective: 'TELEPHOTO_COMPRESSED',
          lensModifier: 0.008,
          lensReason: 'Lens bonus: compressed telephoto perspective matches distant observation narrative.',
          lensMatchScore: 1.0,
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    const item = parsed.project?.timeline[0];
    expect(item?.provenance?.lensPerspective).toBe('TELEPHOTO_COMPRESSED');
    expect(item?.provenance?.lensModifier).toBe(0.008);
    expect(item?.provenance?.lensReason).toBe('Lens bonus: compressed telephoto perspective matches distant observation narrative.');
    expect(item?.provenance?.lensMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Immutability, edge cases, and determinism
// ---------------------------------------------------------------------------

describe('Immutability, edge cases, and determinism', () => {
  it('does not mutate input candidate asset or description', () => {
    const asset = createTestMediaAsset({
      name: 'freeze_test.mp4',
      analysis: { description: 'Telephoto lens with compressed background', tags: ['telephoto'] },
    });
    const frozenAsset = Object.freeze({ ...asset });

    const c1 = classifyOpticalLensPerspective(frozenAsset);
    const c2 = classifyOpticalLensPerspective(frozenAsset);
    expect(c1).toBe('TELEPHOTO_COMPRESSED');
    expect(c2).toBe('TELEPHOTO_COMPRESSED');
  });

  it('produces identical deterministic results across repeated calls', () => {
    const res1 = calculateLensModifier('TELEPHOTO_COMPRESSED', 'TELEPHOTO');
    const res2 = calculateLensModifier('TELEPHOTO_COMPRESSED', 'TELEPHOTO');
    expect(res1).toEqual(res2);
  });

  it('never returns NaN or Infinity for modifier or lensMatchScore', () => {
    const perspectives: OpticalLensPerspective[] = [
      'FISHEYE_ULTRAWIDE',
      'WIDE_ANGLE_EXPANSIVE',
      'STANDARD_NORMAL',
      'TELEPHOTO_COMPRESSED',
      'MACRO_MICROSCOPIC',
      'LENS_AGNOSTIC',
    ];
    const intents: LensIntent[] = ['FISHEYE', 'WIDE', 'NORMAL', 'TELEPHOTO', 'MACRO', 'NEUTRAL'];
    for (const p of perspectives) {
      for (const i of intents) {
        const res = calculateLensModifier(p, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.lensMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.lensMatchScore)).toBe(false);
      }
    }
  });

  it('all 6 optical lens perspective classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['fisheye', 'action-cam'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['wide-angle', 'expansive'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['50mm', 'standard-lens'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['telephoto', 'compressed-depth'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['macro', 'microscopic'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyOpticalLensPerspective(a));
    expect(classified).toContain('FISHEYE_ULTRAWIDE');
    expect(classified).toContain('WIDE_ANGLE_EXPANSIVE');
    expect(classified).toContain('STANDARD_NORMAL');
    expect(classified).toContain('TELEPHOTO_COMPRESSED');
    expect(classified).toContain('MACRO_MICROSCOPIC');
    expect(classified).toContain('LENS_AGNOSTIC');
  });
});
