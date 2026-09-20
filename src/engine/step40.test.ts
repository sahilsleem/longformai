/**
 * Step 40 — Lighting Setup & Key Illumination Intelligence
 *
 * Dedicated test suite verifying:
 *  - Lighting setup classification (FRONTAL_DIRECT, SIDE_SPLIT_DRAMATIC, BACKLIT_SILHOUETTE, TOP_DOWN_OVERHEAD, DIFFUSE_AMBIENT, LIGHTING_AGNOSTIC)
 *  - Narration lighting intent extraction (FRONTAL, SIDE_DRAMATIC, BACKLIT, OVERHEAD, DIFFUSE, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset lighting setup establishing energy
 *  - Independence from Steps 27–39
 *  - Semantic dominance preservation
 *  - DraftStats counters & Full generateDraftTimeline integration
 *  - Schema JSON serialization round-trip
 *  - Immutability, edge cases, and determinism
 */

import { describe, it, expect } from 'vitest';
import {
  classifyLightingSetup,
  classifyNarrationLightingIntent,
  calculateLightingSetupModifier,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  AudioSegment,
  LightingSetup,
  LightingIntent,
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
// 1. classifyLightingSetup
// ---------------------------------------------------------------------------

describe('classifyLightingSetup', () => {
  it('returns LIGHTING_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyLightingSetup(null)).toBe('LIGHTING_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyLightingSetup(undefined)).toBe('LIGHTING_AGNOSTIC');
  });

  it('classifies FRONTAL_DIRECT from frontal lighting, beauty light, ring light, direct flash keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'beauty_portrait.mp4',
      analysis: { description: 'Even frontal illumination with beauty light and direct flash', tags: ['frontal', 'ring-light'] },
    });
    expect(classifyLightingSetup(asset1)).toBe('FRONTAL_DIRECT');

    const asset2 = createTestMediaAsset({
      name: 'head_on_interview.mp4',
      analysis: { description: 'Front lit interview subject with direct front light', tags: ['front-lit', 'even-lighting'] },
    });
    expect(classifyLightingSetup(asset2)).toBe('FRONTAL_DIRECT');
  });

  it('classifies SIDE_SPLIT_DRAMATIC from side lighting, chiaroscuro, split lighting, dramatic shadow keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'noir_interview.mp4',
      analysis: { description: 'Chiaroscuro side lighting with dramatic shadow on subject profile', tags: ['side-lit', 'split-lighting'] },
    });
    expect(classifyLightingSetup(asset1)).toBe('SIDE_SPLIT_DRAMATIC');

    const asset2 = createTestMediaAsset({
      name: 'cross_light_portrait.mp4',
      analysis: { description: 'Raking light and cross light creating lateral light shadows', tags: ['cross-light', 'raking-light'] },
    });
    expect(classifyLightingSetup(asset2)).toBe('SIDE_SPLIT_DRAMATIC');
  });

  it('classifies BACKLIT_SILHOUETTE from backlit, rim light, halo effect, silhouette keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'sunset_silhouette.mp4',
      analysis: { description: 'Backlit silhouette with glowing edge light and halo effect', tags: ['backlit', 'rim-light'] },
    });
    expect(classifyLightingSetup(asset1)).toBe('BACKLIT_SILHOUETTE');

    const asset2 = createTestMediaAsset({
      name: 'sun_behind_speaker.mp4',
      analysis: { description: 'Subject against the light with sun behind creating edge light kicker', tags: ['contre-jour', 'silhouette'] },
    });
    expect(classifyLightingSetup(asset2)).toBe('BACKLIT_SILHOUETTE');
  });

  it('classifies TOP_DOWN_OVERHEAD from top light, overhead light, downlight, spotlight keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'stage_spotlight.mp4',
      analysis: { description: 'Spotlight from above with dramatic downlight on stage', tags: ['top-light', 'spotlight'] },
    });
    expect(classifyLightingSetup(asset1)).toBe('TOP_DOWN_OVERHEAD');

    const asset2 = createTestMediaAsset({
      name: 'noon_sun_desert.mp4',
      analysis: { description: 'Overhead light and zenith light from noon sun directly above', tags: ['overhead-light', 'noon-sun'] },
    });
    expect(classifyLightingSetup(asset2)).toBe('TOP_DOWN_OVERHEAD');
  });

  it('classifies DIFFUSE_AMBIENT from diffuse light, softbox, shadowless, wrap around light keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'softbox_studio.mp4',
      analysis: { description: 'Diffuse light with softbox wrap around light and shadowless ambient glow', tags: ['diffuse', 'soft-box'] },
    });
    expect(classifyLightingSetup(asset1)).toBe('DIFFUSE_AMBIENT');

    const asset2 = createTestMediaAsset({
      name: 'overcast_soft_illumination.mp4',
      analysis: { description: 'Soft lighting and bounce light creating even ambient illumination', tags: ['ambient-light', 'bounce-light'] },
    });
    expect(classifyLightingSetup(asset2)).toBe('DIFFUSE_AMBIENT');
  });

  it('returns LIGHTING_AGNOSTIC for unanalyzed or neutral asset', () => {
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
    expect(classifyLightingSetup(unanalyzedAsset)).toBe('LIGHTING_AGNOSTIC');

    const neutralAsset = createTestMediaAsset({
      name: 'general_media.mp4',
      analysis: { description: 'General scenic view', tags: ['neutral', 'clip'] },
    });
    expect(classifyLightingSetup(neutralAsset)).toBe('LIGHTING_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationLightingIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationLightingIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationLightingIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationLightingIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts FRONTAL intent from direct light, front light, clearly illuminated, bright face keywords', () => {
    expect(classifyNarrationLightingIntent('Lit from the front with direct light, every expression is clearly illuminated.')).toBe('FRONTAL');
    expect(classifyNarrationLightingIntent('We see a brightly lit face with a clear view of the details.')).toBe('FRONTAL');
  });

  it('extracts SIDE_DRAMATIC intent from in the shadows, dramatic shadow, split light, chiaroscuro keywords', () => {
    expect(classifyNarrationLightingIntent('Partially in the shadows with dramatic shadow, the subject appears intense.')).toBe('SIDE_DRAMATIC');
    expect(classifyNarrationLightingIntent('A split light and chiaroscuro effect creates a deep shadowed profile.')).toBe('SIDE_DRAMATIC');
  });

  it('extracts BACKLIT intent from silhouette, backlit, rim light, glowing from behind keywords', () => {
    expect(classifyNarrationLightingIntent('A silhouette stands against the light with sun behind.')).toBe('BACKLIT');
    expect(classifyNarrationLightingIntent('Glowing from behind with a distinct rim light halo effect.')).toBe('BACKLIT');
  });

  it('extracts OVERHEAD intent from spotlight from above, beam from above, lit from above keywords', () => {
    expect(classifyNarrationLightingIntent('A spotlight from above shines directly down on the subject.')).toBe('OVERHEAD');
    expect(classifyNarrationLightingIntent('Lit from above by a harsh overhead light beam.')).toBe('OVERHEAD');
  });

  it('extracts DIFFUSE intent from soft light, diffused light, gentle glow, shadowless keywords', () => {
    expect(classifyNarrationLightingIntent('Enveloped in soft light with shadowless even ambient glow.')).toBe('DIFFUSE');
    expect(classifyNarrationLightingIntent('A gentle glow and diffuse lighting creates a calm atmosphere.')).toBe('DIFFUSE');
  });

  it('returns NEUTRAL for narration without lighting cues', () => {
    expect(classifyNarrationLightingIntent('Revenue increased significantly during the fourth quarter.')).toBe('NEUTRAL');
    expect(classifyNarrationLightingIntent('We must consider all operational requirements.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationLightingIntent('A DRAMATIC SILHOUETTE AGAINST THE LIGHT')).toBe('BACKLIT');
    expect(classifyNarrationLightingIntent('BRIGHTLY LIT FACE WITH DIRECT LIGHT')).toBe('FRONTAL');
    expect(classifyNarrationLightingIntent('SPOTLIGHT FROM ABOVE ILLUMINATING THE STAGE')).toBe('OVERHEAD');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateLightingSetupModifier
// ---------------------------------------------------------------------------

describe('calculateLightingSetupModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const setups: LightingSetup[] = [
      'FRONTAL_DIRECT',
      'SIDE_SPLIT_DRAMATIC',
      'BACKLIT_SILHOUETTE',
      'TOP_DOWN_OVERHEAD',
      'DIFFUSE_AMBIENT',
      'LIGHTING_AGNOSTIC',
    ];

    const intents: LightingIntent[] = ['FRONTAL', 'SIDE_DRAMATIC', 'BACKLIT', 'OVERHEAD', 'DIFFUSE', 'NEUTRAL'];

    for (const s of setups) {
      for (const i of intents) {
        const res = calculateLightingSetupModifier(s, i);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.lightingMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.lightingMatchScore).toBeLessThanOrEqual(1.0);
        expect(typeof res.reason).toBe('string');
        expect(res.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('awards +0.008 bonus for exact lighting setup matches', () => {
    expect(calculateLightingSetupModifier('FRONTAL_DIRECT', 'FRONTAL').modifier).toBe(0.008);
    expect(calculateLightingSetupModifier('FRONTAL_DIRECT', 'FRONTAL').lightingMatchScore).toBe(1.0);

    expect(calculateLightingSetupModifier('SIDE_SPLIT_DRAMATIC', 'SIDE_DRAMATIC').modifier).toBe(0.008);
    expect(calculateLightingSetupModifier('SIDE_SPLIT_DRAMATIC', 'SIDE_DRAMATIC').lightingMatchScore).toBe(1.0);

    expect(calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'BACKLIT').modifier).toBe(0.008);
    expect(calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'BACKLIT').lightingMatchScore).toBe(1.0);

    expect(calculateLightingSetupModifier('TOP_DOWN_OVERHEAD', 'OVERHEAD').modifier).toBe(0.008);
    expect(calculateLightingSetupModifier('TOP_DOWN_OVERHEAD', 'OVERHEAD').lightingMatchScore).toBe(1.0);

    expect(calculateLightingSetupModifier('DIFFUSE_AMBIENT', 'DIFFUSE').modifier).toBe(0.008);
    expect(calculateLightingSetupModifier('DIFFUSE_AMBIENT', 'DIFFUSE').lightingMatchScore).toBe(1.0);
  });

  it('awards moderate bonuses for compatible lighting setup pairs', () => {
    // Diffuse lighting supports frontal visibility
    expect(calculateLightingSetupModifier('DIFFUSE_AMBIENT', 'FRONTAL').modifier).toBe(0.003);
    // Overhead spotlight supports dramatic side lighting mood
    expect(calculateLightingSetupModifier('TOP_DOWN_OVERHEAD', 'SIDE_DRAMATIC').modifier).toBe(0.003);
    // Side lighting complements backlit edge-lit aesthetic
    expect(calculateLightingSetupModifier('SIDE_SPLIT_DRAMATIC', 'BACKLIT').modifier).toBe(0.003);
  });

  it('penalizes opposing lighting setups', () => {
    // Backlit silhouette candidate when direct frontal view requested
    const frontalMismatch = calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'FRONTAL');
    expect(frontalMismatch.modifier).toBe(-0.006);
    expect(frontalMismatch.lightingMatchScore).toBe(0.15);

    // Frontal direct candidate when backlit silhouette requested
    const backlitMismatch = calculateLightingSetupModifier('FRONTAL_DIRECT', 'BACKLIT');
    expect(backlitMismatch.modifier).toBe(-0.006);
    expect(backlitMismatch.lightingMatchScore).toBe(0.15);
  });

  it('returns neutral 0.0 modifier for neutral intent or agnostic lighting', () => {
    expect(calculateLightingSetupModifier('FRONTAL_DIRECT', 'NEUTRAL').modifier).toBe(0.0);
    expect(calculateLightingSetupModifier('LIGHTING_AGNOSTIC', 'FRONTAL').modifier).toBe(0.0);
    expect(calculateLightingSetupModifier('LIGHTING_AGNOSTIC', 'SIDE_DRAMATIC').modifier).toBe(0.0);
    expect(calculateLightingSetupModifier('LIGHTING_AGNOSTIC', 'BACKLIT').modifier).toBe(0.0);
    expect(calculateLightingSetupModifier('LIGHTING_AGNOSTIC', 'OVERHEAD').modifier).toBe(0.0);
    expect(calculateLightingSetupModifier('LIGHTING_AGNOSTIC', 'DIFFUSE').modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive continuation penalty waiving
// ---------------------------------------------------------------------------

describe('Consecutive continuation penalty waiving', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normal opposing mismatch has -0.006 penalty
    const normalMismatch = calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'FRONTAL', false);
    expect(normalMismatch.modifier).toBe(-0.006);

    // With consecutive continuation, modifier is waived to 0.0
    const continuedMismatch = calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'FRONTAL', true);
    expect(continuedMismatch.modifier).toBe(0.0);
    expect(continuedMismatch.lightingMatchScore).toBe(0.8);
    expect(continuedMismatch.reason).toContain('Consecutive shot continuation');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat-reset lighting setup establishing energy
// ---------------------------------------------------------------------------

describe('Beat-reset lighting setup establishing energy', () => {
  it('awards +0.008 modifier with NEW_BEAT narrationBeatType for matching intent', () => {
    const beatMatch = calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'BACKLIT', false, 'NEW_BEAT');
    expect(beatMatch.modifier).toBe(0.008);
    expect(beatMatch.lightingMatchScore).toBe(1.0);
    expect(beatMatch.reason).toContain('New beat lighting introduction');
  });

  it('does not award beat bonus if narration intent is NEUTRAL', () => {
    const beatNeutral = calculateLightingSetupModifier('FRONTAL_DIRECT', 'NEUTRAL', false, 'NEW_BEAT');
    expect(beatNeutral.modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 27–39
// ---------------------------------------------------------------------------

describe('Independence from Steps 27–39', () => {
  it('operates orthogonally to other visual intelligence layers', () => {
    const asset = createTestMediaAsset({
      name: 'backlit_left_aerial_sunset.mp4',
      analysis: {
        description: 'Backlit silhouette of a speaker on the left side of the frame during golden hour sunset from an aerial view',
        tags: ['backlit', 'left-third', 'aerial', 'sunset', 'silhouette'],
      },
    });

    const lighting = classifyLightingSetup(asset);
    expect(lighting).toBe('BACKLIT_SILHOUETTE');

    // Step 40 modifier evaluates strictly on lighting setup
    const res = calculateLightingSetupModifier(lighting, 'BACKLIT');
    expect(res.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic dominance preservation
// ---------------------------------------------------------------------------

describe('Semantic dominance preservation', () => {
  it('ensures semantic relevance remains dominant over lighting modifiers', () => {
    const strongSemanticScore = 0.82;
    const weakSemanticScore = 0.42;

    const strongAssetPenalty = calculateLightingSetupModifier('FRONTAL_DIRECT', 'BACKLIT').modifier; // -0.006
    const weakAssetBonus = calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'BACKLIT').modifier; // +0.008

    const strongComposite = strongSemanticScore + strongAssetPenalty; // 0.814
    const weakComposite = weakSemanticScore + weakAssetBonus; // 0.428

    expect(strongComposite).toBeGreaterThan(weakComposite);
    expect(strongComposite - weakComposite).toBeGreaterThan(0.35);
  });
});

// ---------------------------------------------------------------------------
// 8. DraftStats counters and generateDraftTimeline Integration
// ---------------------------------------------------------------------------

describe('DraftStats counters and generateDraftTimeline Integration', () => {
  it('populates Step 40 provenance fields and stats in generateDraftTimeline', async () => {
    const segments: AudioSegment[] = [
      {
        id: 's1',
        startTime: 0,
        endTime: 4,
        text: 'A dramatic silhouette stands against the light with sun behind.',
      },
    ];

    const media: MediaAsset[] = [
      createTestMediaAsset({
        id: 'm1',
        name: 'backlit_speaker.mp4',
        analysis: {
          analyzed: true,
          description: 'A speaker in backlit silhouette with glowing rim light against bright backdrop',
          tags: ['backlit', 'silhouette', 'speaker'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(1);
    const item = result.timeline[0];
    expect(item.provenance?.lightingSetup).toBe('BACKLIT_SILHOUETTE');
    expect(item.provenance?.lightingModifier).toBe(0.008);
    expect(item.provenance?.lightingReason).toContain('backlit rim lighting');
    expect(item.provenance?.lightingMatchScore).toBe(1.0);

    expect(result.stats.lightingAdjustments).toBe(1);
    expect(result.stats.backlitSelections).toBe(1);
    expect(result.stats.lightingBonuses).toBe(1);
  });

  it('includes all 9 Step 40 lighting counters in DraftStats type', () => {
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
      // Step 40 fields
      lightingAdjustments: 1,
      frontalLightingSelections: 0,
      sideLightingSelections: 0,
      backlitSelections: 1,
      overheadLightingSelections: 0,
      diffuseLightingSelections: 0,
      lightingAgnosticSelections: 0,
      lightingBonuses: 1,
      lightingPenalties: 0,
    };

    expect(stats.lightingAdjustments).toBe(1);
    expect(stats.frontalLightingSelections).toBe(0);
    expect(stats.sideLightingSelections).toBe(0);
    expect(stats.backlitSelections).toBe(1);
    expect(stats.overheadLightingSelections).toBe(0);
    expect(stats.diffuseLightingSelections).toBe(0);
    expect(stats.lightingAgnosticSelections).toBe(0);
    expect(stats.lightingBonuses).toBe(1);
    expect(stats.lightingPenalties).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON serialization round-trip
// ---------------------------------------------------------------------------

describe('Schema JSON serialization round-trip for Step 40 provenance', () => {
  it('preserves Step 40 lighting provenance fields across export and parse', () => {
    const project = createInitialProject('Step 40 Test');
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
          sourceSegmentText: 'A silhouette stands against the light.',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match with backlit silhouette lighting.',
          reuseCount: 0,
          lightingSetup: 'BACKLIT_SILHOUETTE',
          lightingModifier: 0.008,
          lightingReason: 'Lighting bonus: backlit rim lighting matches silhouette narrative.',
          lightingMatchScore: 1.0,
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    const item = parsed.project?.timeline[0];
    expect(item?.provenance?.lightingSetup).toBe('BACKLIT_SILHOUETTE');
    expect(item?.provenance?.lightingModifier).toBe(0.008);
    expect(item?.provenance?.lightingReason).toBe('Lighting bonus: backlit rim lighting matches silhouette narrative.');
    expect(item?.provenance?.lightingMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Immutability, edge cases, and determinism
// ---------------------------------------------------------------------------

describe('Immutability, edge cases, and determinism', () => {
  it('does not mutate input candidate asset or description', () => {
    const asset = createTestMediaAsset({
      name: 'freeze_test.mp4',
      analysis: { description: 'Backlit silhouette with rim light', tags: ['backlit'] },
    });
    const frozenAsset = Object.freeze({ ...asset });

    const setup1 = classifyLightingSetup(frozenAsset);
    const setup2 = classifyLightingSetup(frozenAsset);
    expect(setup1).toBe('BACKLIT_SILHOUETTE');
    expect(setup2).toBe('BACKLIT_SILHOUETTE');
  });

  it('produces identical deterministic results across repeated calls', () => {
    const res1 = calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'BACKLIT');
    const res2 = calculateLightingSetupModifier('BACKLIT_SILHOUETTE', 'BACKLIT');
    expect(res1).toEqual(res2);
  });

  it('never returns NaN or Infinity for modifier or lightingMatchScore', () => {
    const setups: LightingSetup[] = [
      'FRONTAL_DIRECT',
      'SIDE_SPLIT_DRAMATIC',
      'BACKLIT_SILHOUETTE',
      'TOP_DOWN_OVERHEAD',
      'DIFFUSE_AMBIENT',
      'LIGHTING_AGNOSTIC',
    ];
    const intents: LightingIntent[] = ['FRONTAL', 'SIDE_DRAMATIC', 'BACKLIT', 'OVERHEAD', 'DIFFUSE', 'NEUTRAL'];
    for (const s of setups) {
      for (const i of intents) {
        const res = calculateLightingSetupModifier(s, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.lightingMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.lightingMatchScore)).toBe(false);
      }
    }
  });

  it('all 6 lighting setup classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['frontal', 'ring-light'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['side-lit', 'split-lighting'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['backlit', 'rim-light'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['top-light', 'spotlight'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['diffuse', 'soft-box'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyLightingSetup(a));
    expect(classified).toContain('FRONTAL_DIRECT');
    expect(classified).toContain('SIDE_SPLIT_DRAMATIC');
    expect(classified).toContain('BACKLIT_SILHOUETTE');
    expect(classified).toContain('TOP_DOWN_OVERHEAD');
    expect(classified).toContain('DIFFUSE_AMBIENT');
    expect(classified).toContain('LIGHTING_AGNOSTIC');
  });
});
