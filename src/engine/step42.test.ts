/**
 * Step 42 — Chromatic Saturation & Color Grading Intelligence
 *
 * Dedicated test suite verifying:
 *  - Chromatic grading classification (MONOCHROME_GRAYSCALE, VIBRANT_SATURATED, MUTED_DESATURATED, WARM_SEPIA_DUOTONE, NATURAL_BALANCED, CHROMATIC_AGNOSTIC)
 *  - Narration chromatic intent extraction (MONOCHROME, VIBRANT, MUTED, SEPIA_DUOTONE, NATURAL, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset chromatic color grading establishing energy
 *  - Independence from Steps 27–41
 *  - Semantic dominance preservation
 *  - DraftStats counters & Full generateDraftTimeline integration
 *  - Schema JSON serialization round-trip
 *  - Immutability, edge cases, and determinism
 */

import { describe, it, expect } from 'vitest';
import {
  classifyChromaticGrading,
  classifyNarrationChromaticIntent,
  calculateChromaticModifier,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  AudioSegment,
  ChromaticGrading,
  ChromaticIntent,
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
// 1. classifyChromaticGrading
// ---------------------------------------------------------------------------

describe('classifyChromaticGrading', () => {
  it('returns CHROMATIC_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyChromaticGrading(null)).toBe('CHROMATIC_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyChromaticGrading(undefined)).toBe('CHROMATIC_AGNOSTIC');
  });

  it('classifies MONOCHROME_GRAYSCALE from black and white, monochrome, grayscale, noir, b&w keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'archival_interview.mp4',
      analysis: { description: 'Historical archival footage in black and white with high contrast', tags: ['black-and-white', 'monochrome'] },
    });
    expect(classifyChromaticGrading(asset1)).toBe('MONOCHROME_GRAYSCALE');

    const asset2 = createTestMediaAsset({
      name: 'noir_detective.mp4',
      analysis: { description: 'Dramatic noir style scene with stark grayscale silver halide look', tags: ['noir', 'grayscale'] },
    });
    expect(classifyChromaticGrading(asset2)).toBe('MONOCHROME_GRAYSCALE');
  });

  it('classifies VIBRANT_SATURATED from vibrant, saturated, vivid colors, technicolor, pop of color keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'carnival_parade.mp4',
      analysis: { description: 'Bursting with vibrant color and vivid hues across the festival', tags: ['vibrant', 'technicolor'] },
    });
    expect(classifyChromaticGrading(asset1)).toBe('VIBRANT_SATURATED');

    const asset2 = createTestMediaAsset({
      name: 'neon_city_night.mp4',
      analysis: { description: 'Hyper saturated neon signs with colorful pop of color in Tokyo', tags: ['hyper-saturated', 'pop-of-color'] },
    });
    expect(classifyChromaticGrading(asset2)).toBe('VIBRANT_SATURATED');
  });

  it('classifies MUTED_DESATURATED from muted, desaturated, bleach bypass, washed out, faded keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'post_apocalyptic_wasteland.mp4',
      analysis: { description: 'Bleak landscape with bleach bypass desaturated palette and muted tones', tags: ['bleach-bypass', 'muted'] },
    });
    expect(classifyChromaticGrading(asset1)).toBe('MUTED_DESATURATED');

    const asset2 = createTestMediaAsset({
      name: 'winter_dawn_fog.mp4',
      analysis: { description: 'Washed out faded color palette in chilly overcast morning', tags: ['washed-out', 'faded'] },
    });
    expect(classifyChromaticGrading(asset2)).toBe('MUTED_DESATURATED');
  });

  it('classifies WARM_SEPIA_DUOTONE from sepia, duotone, split-tone, vintage tone keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'old_family_memory.mp4',
      analysis: { description: 'Vintage sepia toned footage from 1920s family gathering', tags: ['sepia', 'vintage-tone'] },
    });
    expect(classifyChromaticGrading(asset1)).toBe('WARM_SEPIA_DUOTONE');

    const asset2 = createTestMediaAsset({
      name: 'stylized_duotone_art.mp4',
      analysis: { description: 'Two tone tint and split toned duotone gradient wash', tags: ['duotone', 'split-tone'] },
    });
    expect(classifyChromaticGrading(asset2)).toBe('WARM_SEPIA_DUOTONE');
  });

  it('classifies NATURAL_BALANCED from natural color, realistic color, true to life keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'documentary_interview.mp4',
      analysis: { description: 'Standard interview with natural color and accurate realistic skin tones', tags: ['natural-color', 'realistic-color'] },
    });
    expect(classifyChromaticGrading(asset1)).toBe('NATURAL_BALANCED');

    const asset2 = createTestMediaAsset({
      name: 'nature_wildlife_true.mp4',
      analysis: { description: 'True to life balanced color recording of a mountain river', tags: ['true-to-life', 'realistic'] },
    });
    expect(classifyChromaticGrading(asset2)).toBe('NATURAL_BALANCED');
  });

  it('returns CHROMATIC_AGNOSTIC for unanalyzed or neutral asset', () => {
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
    expect(classifyChromaticGrading(unanalyzedAsset)).toBe('CHROMATIC_AGNOSTIC');

    const neutralAsset = createTestMediaAsset({
      name: 'generic_clip.mp4',
      analysis: { description: 'General scenery', tags: ['neutral', 'clip'] },
    });
    expect(classifyChromaticGrading(neutralAsset)).toBe('CHROMATIC_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationChromaticIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationChromaticIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationChromaticIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationChromaticIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts MONOCHROME intent from black and white, monochrome, grayscale, noir style keywords', () => {
    expect(classifyNarrationChromaticIntent('Captured in classic black and white, the memory feels timeless.')).toBe('MONOCHROME');
    expect(classifyNarrationChromaticIntent('The scene unfolds in stark monochrome and shades of gray.')).toBe('MONOCHROME');
    expect(classifyNarrationChromaticIntent('Rendered in noir style with heavy shadow contrasts.')).toBe('MONOCHROME');
  });

  it('extracts VIBRANT intent from vibrant color, bursting with color, vivid colors, technicolor keywords', () => {
    expect(classifyNarrationChromaticIntent('The marketplace is bursting with color and vibrant energy.')).toBe('VIBRANT');
    expect(classifyNarrationChromaticIntent('A technicolor explosion of vivid colors dazzles the audience.')).toBe('VIBRANT');
    expect(classifyNarrationChromaticIntent('A bright pop of color brings the composition to life.')).toBe('VIBRANT');
  });

  it('extracts MUTED intent from muted colors, bleak and desaturated, washed out, faded tones keywords', () => {
    expect(classifyNarrationChromaticIntent('In a bleak and desaturated world, resources were scarce.')).toBe('MUTED');
    expect(classifyNarrationChromaticIntent('The washed out palette and faded tones reflect the melancholy.')).toBe('MUTED');
    expect(classifyNarrationChromaticIntent('A bleach bypass look creates subdued colors and pale surfaces.')).toBe('MUTED');
  });

  it('extracts SEPIA_DUOTONE intent from sepia-toned, vintage sepia, duotone, split-toned keywords', () => {
    expect(classifyNarrationChromaticIntent('Looking back on sepia-toned memories from decades past.')).toBe('SEPIA_DUOTONE');
    expect(classifyNarrationChromaticIntent('A warm sepia duotone look evokes a nostalgic two-tone feel.')).toBe('SEPIA_DUOTONE');
  });

  it('extracts NATURAL intent from natural color, true to life, realistic colors keywords', () => {
    expect(classifyNarrationChromaticIntent('Presented with natural lighting and color as seen by the naked eye.')).toBe('NATURAL');
    expect(classifyNarrationChromaticIntent('True to life colors ensure accurate representation of the specimen.')).toBe('NATURAL');
  });

  it('returns NEUTRAL for narration without chromatic grading cues', () => {
    expect(classifyNarrationChromaticIntent('We analyzed the preliminary findings thoroughly.')).toBe('NEUTRAL');
    expect(classifyNarrationChromaticIntent('The process requires three distinct phases.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationChromaticIntent('CAPTURED IN BLACK AND WHITE ARCHIVAL FILM')).toBe('MONOCHROME');
    expect(classifyNarrationChromaticIntent('BURSTING WITH VIBRANT COLOR AND SATURATION')).toBe('VIBRANT');
    expect(classifyNarrationChromaticIntent('A BLEAK AND DESATURATED WASTELAND')).toBe('MUTED');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateChromaticModifier
// ---------------------------------------------------------------------------

describe('calculateChromaticModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const gradings: ChromaticGrading[] = [
      'MONOCHROME_GRAYSCALE',
      'VIBRANT_SATURATED',
      'MUTED_DESATURATED',
      'WARM_SEPIA_DUOTONE',
      'NATURAL_BALANCED',
      'CHROMATIC_AGNOSTIC',
    ];

    const intents: ChromaticIntent[] = ['MONOCHROME', 'VIBRANT', 'MUTED', 'SEPIA_DUOTONE', 'NATURAL', 'NEUTRAL'];

    for (const g of gradings) {
      for (const i of intents) {
        const res = calculateChromaticModifier(g, i);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.chromaticMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.chromaticMatchScore).toBeLessThanOrEqual(1.0);
        expect(typeof res.reason).toBe('string');
        expect(res.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('awards +0.008 bonus for exact chromatic grading matches', () => {
    expect(calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'MONOCHROME').modifier).toBe(0.008);
    expect(calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'MONOCHROME').chromaticMatchScore).toBe(1.0);

    expect(calculateChromaticModifier('VIBRANT_SATURATED', 'VIBRANT').modifier).toBe(0.008);
    expect(calculateChromaticModifier('VIBRANT_SATURATED', 'VIBRANT').chromaticMatchScore).toBe(1.0);

    expect(calculateChromaticModifier('MUTED_DESATURATED', 'MUTED').modifier).toBe(0.008);
    expect(calculateChromaticModifier('MUTED_DESATURATED', 'MUTED').chromaticMatchScore).toBe(1.0);

    expect(calculateChromaticModifier('WARM_SEPIA_DUOTONE', 'SEPIA_DUOTONE').modifier).toBe(0.008);
    expect(calculateChromaticModifier('WARM_SEPIA_DUOTONE', 'SEPIA_DUOTONE').chromaticMatchScore).toBe(1.0);

    expect(calculateChromaticModifier('NATURAL_BALANCED', 'NATURAL').modifier).toBe(0.008);
    expect(calculateChromaticModifier('NATURAL_BALANCED', 'NATURAL').chromaticMatchScore).toBe(1.0);
  });

  it('awards moderate bonuses for compatible chromatic pairs', () => {
    // Sepia duotone is compatible with monochrome narrative
    expect(calculateChromaticModifier('WARM_SEPIA_DUOTONE', 'MONOCHROME').modifier).toBe(0.003);
    // Natural color supports vibrant presentation
    expect(calculateChromaticModifier('NATURAL_BALANCED', 'VIBRANT').modifier).toBe(0.003);
    // Monochrome supports muted somber tone
    expect(calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'MUTED').modifier).toBe(0.003);
    // Sepia duotone complements muted narrative
    expect(calculateChromaticModifier('WARM_SEPIA_DUOTONE', 'MUTED').modifier).toBe(0.002);
  });

  it('penalizes opposing chromatic grading styles', () => {
    // Vibrant saturated candidate when monochrome requested
    const vibrantToMono = calculateChromaticModifier('VIBRANT_SATURATED', 'MONOCHROME');
    expect(vibrantToMono.modifier).toBe(-0.006);
    expect(vibrantToMono.chromaticMatchScore).toBe(0.15);

    // Monochrome grayscale candidate when vibrant requested
    const monoToVibrant = calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'VIBRANT');
    expect(monoToVibrant.modifier).toBe(-0.006);
    expect(monoToVibrant.chromaticMatchScore).toBe(0.15);

    // Muted desaturated candidate when vibrant requested
    const mutedToVibrant = calculateChromaticModifier('MUTED_DESATURATED', 'VIBRANT');
    expect(mutedToVibrant.modifier).toBe(-0.005);
    expect(mutedToVibrant.chromaticMatchScore).toBe(0.2);

    // Vibrant saturated candidate when muted requested
    const vibrantToMuted = calculateChromaticModifier('VIBRANT_SATURATED', 'MUTED');
    expect(vibrantToMuted.modifier).toBe(-0.006);
    expect(vibrantToMuted.chromaticMatchScore).toBe(0.15);
  });

  it('returns neutral 0.0 modifier for neutral intent or agnostic chromatic profile', () => {
    expect(calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'NEUTRAL').modifier).toBe(0.0);
    expect(calculateChromaticModifier('CHROMATIC_AGNOSTIC', 'MONOCHROME').modifier).toBe(0.0);
    expect(calculateChromaticModifier('CHROMATIC_AGNOSTIC', 'VIBRANT').modifier).toBe(0.0);
    expect(calculateChromaticModifier('CHROMATIC_AGNOSTIC', 'MUTED').modifier).toBe(0.0);
    expect(calculateChromaticModifier('CHROMATIC_AGNOSTIC', 'SEPIA_DUOTONE').modifier).toBe(0.0);
    expect(calculateChromaticModifier('CHROMATIC_AGNOSTIC', 'NATURAL').modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive continuation penalty waiving
// ---------------------------------------------------------------------------

describe('Consecutive continuation penalty waiving', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normal opposing mismatch has -0.006 penalty
    const normalMismatch = calculateChromaticModifier('VIBRANT_SATURATED', 'MONOCHROME', false);
    expect(normalMismatch.modifier).toBe(-0.006);

    // With consecutive continuation, modifier is waived to 0.0
    const continuedMismatch = calculateChromaticModifier('VIBRANT_SATURATED', 'MONOCHROME', true);
    expect(continuedMismatch.modifier).toBe(0.0);
    expect(continuedMismatch.chromaticMatchScore).toBe(0.8);
    expect(continuedMismatch.reason).toContain('Consecutive shot continuation');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat-reset chromatic color grading establishing energy
// ---------------------------------------------------------------------------

describe('Beat-reset chromatic color grading establishing energy', () => {
  it('awards +0.008 modifier with NEW_BEAT narrationBeatType for matching intent', () => {
    const beatMatch = calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'MONOCHROME', false, 'NEW_BEAT');
    expect(beatMatch.modifier).toBe(0.008);
    expect(beatMatch.chromaticMatchScore).toBe(1.0);
    expect(beatMatch.reason).toContain('New beat color grading introduction');
  });

  it('does not award beat bonus if narration intent is NEUTRAL', () => {
    const beatNeutral = calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'NEUTRAL', false, 'NEW_BEAT');
    expect(beatNeutral.modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 27–41
// ---------------------------------------------------------------------------

describe('Independence from Steps 27–41', () => {
  it('operates orthogonally to lighting, POV, and atmospheric tone layers', () => {
    const asset = createTestMediaAsset({
      name: 'monochrome_backlit_firstperson_aerial.mp4',
      analysis: {
        description: 'First person POV subjective camera in black and white with backlit rim lighting during sunset from an aerial perspective',
        tags: ['black-and-white', 'monochrome', 'first-person', 'backlit', 'aerial'],
      },
    });

    const chromatic = classifyChromaticGrading(asset);
    expect(chromatic).toBe('MONOCHROME_GRAYSCALE');

    // Step 42 modifier evaluates strictly on chromatic saturation
    const res = calculateChromaticModifier(chromatic, 'MONOCHROME');
    expect(res.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic dominance preservation
// ---------------------------------------------------------------------------

describe('Semantic dominance preservation', () => {
  it('ensures semantic relevance remains dominant over chromatic modifiers', () => {
    const strongSemanticScore = 0.84;
    const weakSemanticScore = 0.41;

    const strongAssetPenalty = calculateChromaticModifier('VIBRANT_SATURATED', 'MONOCHROME').modifier; // -0.006
    const weakAssetBonus = calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'MONOCHROME').modifier; // +0.008

    const strongComposite = strongSemanticScore + strongAssetPenalty; // 0.834
    const weakComposite = weakSemanticScore + weakAssetBonus; // 0.418

    expect(strongComposite).toBeGreaterThan(weakComposite);
    expect(strongComposite - weakComposite).toBeGreaterThan(0.40);
  });
});

// ---------------------------------------------------------------------------
// 8. DraftStats counters and generateDraftTimeline Integration
// ---------------------------------------------------------------------------

describe('DraftStats counters and generateDraftTimeline Integration', () => {
  it('populates Step 42 provenance fields and stats in generateDraftTimeline', async () => {
    const segments: AudioSegment[] = [
      {
        id: 's1',
        startTime: 0,
        endTime: 4,
        text: 'Captured in classic black and white, the archival film tells the story.',
      },
    ];

    const media: MediaAsset[] = [
      createTestMediaAsset({
        id: 'm1',
        name: 'archival_bw_film.mp4',
        analysis: {
          analyzed: true,
          description: 'Historical archive footage in black and white monochrome with grain',
          tags: ['black-and-white', 'monochrome', 'archival', 'film'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(1);
    const item = result.timeline[0];
    expect(item.provenance?.chromaticGrading).toBe('MONOCHROME_GRAYSCALE');
    expect(item.provenance?.chromaticModifier).toBe(0.008);
    expect(item.provenance?.chromaticReason).toContain('monochrome black-and-white grading');
    expect(item.provenance?.chromaticMatchScore).toBe(1.0);

    expect(result.stats.chromaticAdjustments).toBe(1);
    expect(result.stats.monochromeSelections).toBe(1);
    expect(result.stats.chromaticBonuses).toBe(1);
  });

  it('includes all 9 Step 42 chromatic counters in DraftStats type', () => {
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
      // Step 42 fields
      chromaticAdjustments: 1,
      monochromeSelections: 1,
      vibrantSelections: 0,
      mutedSelections: 0,
      sepiaDuotoneSelections: 0,
      naturalChromaticSelections: 0,
      chromaticAgnosticSelections: 0,
      chromaticBonuses: 1,
      chromaticPenalties: 0,
    };

    expect(stats.chromaticAdjustments).toBe(1);
    expect(stats.monochromeSelections).toBe(1);
    expect(stats.vibrantSelections).toBe(0);
    expect(stats.mutedSelections).toBe(0);
    expect(stats.sepiaDuotoneSelections).toBe(0);
    expect(stats.naturalChromaticSelections).toBe(0);
    expect(stats.chromaticAgnosticSelections).toBe(0);
    expect(stats.chromaticBonuses).toBe(1);
    expect(stats.chromaticPenalties).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON Serialization & Validation Round-Trip
// ---------------------------------------------------------------------------

describe('Schema JSON Serialization & Validation Round-Trip', () => {
  it('successfully exports and parses Step 42 chromaticGrading provenance fields', () => {
    const project = createInitialProject('Step 42 Test');
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
          sourceSegmentText: 'Captured in classic black and white.',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match with monochrome black and white color grading.',
          reuseCount: 0,
          chromaticGrading: 'MONOCHROME_GRAYSCALE',
          chromaticModifier: 0.008,
          chromaticReason: 'Chromatic bonus: monochrome black-and-white grading matches stark noir narrative.',
          chromaticMatchScore: 1.0,
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    const item = parsed.project?.timeline[0];
    expect(item?.provenance?.chromaticGrading).toBe('MONOCHROME_GRAYSCALE');
    expect(item?.provenance?.chromaticModifier).toBe(0.008);
    expect(item?.provenance?.chromaticReason).toBe('Chromatic bonus: monochrome black-and-white grading matches stark noir narrative.');
    expect(item?.provenance?.chromaticMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Immutability, edge cases, and determinism
// ---------------------------------------------------------------------------

describe('Immutability, edge cases, and determinism', () => {
  it('does not mutate input candidate asset or description', () => {
    const asset = createTestMediaAsset({
      name: 'freeze_test.mp4',
      analysis: { description: 'Monochrome black and white film', tags: ['monochrome'] },
    });
    const frozenAsset = Object.freeze({ ...asset });

    const c1 = classifyChromaticGrading(frozenAsset);
    const c2 = classifyChromaticGrading(frozenAsset);
    expect(c1).toBe('MONOCHROME_GRAYSCALE');
    expect(c2).toBe('MONOCHROME_GRAYSCALE');
  });

  it('produces identical deterministic results across repeated calls', () => {
    const res1 = calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'MONOCHROME');
    const res2 = calculateChromaticModifier('MONOCHROME_GRAYSCALE', 'MONOCHROME');
    expect(res1).toEqual(res2);
  });

  it('never returns NaN or Infinity for modifier or chromaticMatchScore', () => {
    const gradings: ChromaticGrading[] = [
      'MONOCHROME_GRAYSCALE',
      'VIBRANT_SATURATED',
      'MUTED_DESATURATED',
      'WARM_SEPIA_DUOTONE',
      'NATURAL_BALANCED',
      'CHROMATIC_AGNOSTIC',
    ];
    const intents: ChromaticIntent[] = ['MONOCHROME', 'VIBRANT', 'MUTED', 'SEPIA_DUOTONE', 'NATURAL', 'NEUTRAL'];
    for (const g of gradings) {
      for (const i of intents) {
        const res = calculateChromaticModifier(g, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.chromaticMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.chromaticMatchScore)).toBe(false);
      }
    }
  });

  it('all 6 chromatic grading classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['black-and-white', 'monochrome'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['vibrant', 'technicolor'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['bleach-bypass', 'muted'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['sepia', 'vintage-tone'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['natural-color', 'realistic-color'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyChromaticGrading(a));
    expect(classified).toContain('MONOCHROME_GRAYSCALE');
    expect(classified).toContain('VIBRANT_SATURATED');
    expect(classified).toContain('MUTED_DESATURATED');
    expect(classified).toContain('WARM_SEPIA_DUOTONE');
    expect(classified).toContain('NATURAL_BALANCED');
    expect(classified).toContain('CHROMATIC_AGNOSTIC');
  });
});
