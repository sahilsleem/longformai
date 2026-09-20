/**
 * Step 45 — Visual Texture & Surface Quality Intelligence
 *
 * Dedicated test suite verifying:
 *  - Visual texture classification (CLEAN_PRISTINE_DIGITAL, ORGANIC_FILM_GRAIN, VINTAGE_ANALOG_VHS, GRITTY_TEXTURED_NOISE, ETHEREAL_DIFFUSION_GLOW, TEXTURE_AGNOSTIC)
 *  - Narration texture intent extraction (PRISTINE_DIGITAL, FILM_GRAIN, ANALOG_VHS, GRITTY_NOISE, DIFFUSION_GLOW, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and opposing texture penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset visual texture establishing surface atmosphere
 *  - Independence from Steps 27–44 (Medium, chromatic grading, lens perspective, lighting, DOF)
 *  - Semantic dominance preservation
 *  - DraftStats counters & Full generateDraftTimeline integration
 *  - Schema JSON serialization round-trip
 *  - Immutability, edge cases, and determinism
 */

import { describe, it, expect } from 'vitest';
import {
  classifyVisualTexture,
  classifyNarrationTextureIntent,
  calculateTextureModifier,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  AudioSegment,
  VisualTexture,
  TextureIntent,
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
// 1. classifyVisualTexture
// ---------------------------------------------------------------------------

describe('classifyVisualTexture', () => {
  it('returns TEXTURE_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyVisualTexture(null)).toBe('TEXTURE_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyVisualTexture(undefined)).toBe('TEXTURE_AGNOSTIC');
  });

  it('classifies CLEAN_PRISTINE_DIGITAL from pristine, razor-sharp, noise-free, 4k-clarity keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'studio_digital_demo.mp4',
      analysis: { description: 'Razor sharp digital footage with crystal clear noise free sensor clarity', tags: ['pristine', 'clean-sensor'] },
    });
    expect(classifyVisualTexture(asset1)).toBe('CLEAN_PRISTINE_DIGITAL');

    const asset2 = createTestMediaAsset({
      name: 'nature_4k.mp4',
      analysis: { description: 'Pristine 4k ultra clean digital recording with smooth digital clarity', tags: ['4k-clarity', 'ultra-sharp'] },
    });
    expect(classifyVisualTexture(asset2)).toBe('CLEAN_PRISTINE_DIGITAL');
  });

  it('classifies ORGANIC_FILM_GRAIN from 35mm film grain, celluloid, photochemical, emulsion keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'cinematic_feature.mp4',
      analysis: { description: 'Shot on 35mm film grain with rich organic celluloid texture and emulsion warmth', tags: ['film-grain', '35mm-grain'] },
    });
    expect(classifyVisualTexture(asset1)).toBe('ORGANIC_FILM_GRAIN');

    const asset2 = createTestMediaAsset({
      name: 'vintage_archive.mp4',
      analysis: { description: '16mm film footage with authentic film grain and photochemical silver halide look', tags: ['photochemical', 'organic-grain'] },
    });
    expect(classifyVisualTexture(asset2)).toBe('ORGANIC_FILM_GRAIN');
  });

  it('classifies VINTAGE_ANALOG_VHS from vhs, crt-scanlines, analog glitch, camcorder keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'home_video_1994.mp4',
      analysis: { description: 'Retro 90s camcorder recording on VHS tape with CRT scanlines and tracking noise', tags: ['vhs', 'crt-scanlines'] },
    });
    expect(classifyVisualTexture(asset1)).toBe('VINTAGE_ANALOG_VHS');

    const asset2 = createTestMediaAsset({
      name: 'glitch_tape_art.mp4',
      analysis: { description: 'Analog tape tracking with magnetic cassette glitch and retro artifacts', tags: ['analog-glitch', 'retro-tape'] },
    });
    expect(classifyVisualTexture(asset2)).toBe('VINTAGE_ANALOG_VHS');
  });

  it('classifies GRITTY_TEXTURED_NOISE from gritty, high-iso, sensor-noise, industrial grit keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'night_documentary.mp4',
      analysis: { description: 'High ISO noise with gritty texture and rough tactile surface in dark alley', tags: ['gritty', 'high-iso'] },
    });
    expect(classifyVisualTexture(asset1)).toBe('GRITTY_TEXTURED_NOISE');

    const asset2 = createTestMediaAsset({
      name: 'factory_interior.mp4',
      analysis: { description: 'Raw industrial grit with coarse grainy texture and heavy sensor noise', tags: ['industrial-grit', 'heavy-noise'] },
    });
    expect(classifyVisualTexture(asset2)).toBe('GRITTY_TEXTURED_NOISE');
  });

  it('classifies ETHEREAL_DIFFUSION_GLOW from pro-mist, halation bloom, ethereal glow, diffusion keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'romantic_sunset.mp4',
      analysis: { description: 'Pro mist filter creating halation bloom and ethereal soft glow around highlights', tags: ['pro-mist', 'halation'] },
    });
    expect(classifyVisualTexture(asset1)).toBe('ETHEREAL_DIFFUSION_GLOW');

    const asset2 = createTestMediaAsset({
      name: 'dream_sequence.mp4',
      analysis: { description: 'Dreamy specular haze with soft diffusion glow and romantic mist glow', tags: ['bloom-glow', 'ethereal-glow'] },
    });
    expect(classifyVisualTexture(asset2)).toBe('ETHEREAL_DIFFUSION_GLOW');
  });

  it('returns TEXTURE_AGNOSTIC for unanalyzed or neutral footage', () => {
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
    expect(classifyVisualTexture(unanalyzedAsset)).toBe('TEXTURE_AGNOSTIC');

    const neutralAsset = createTestMediaAsset({
      name: 'standard_clip.mp4',
      analysis: { description: 'Standard clip without specific texture', tags: ['neutral', 'clip'] },
    });
    expect(classifyVisualTexture(neutralAsset)).toBe('TEXTURE_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationTextureIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationTextureIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationTextureIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationTextureIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts PRISTINE_DIGITAL intent from crystal clear, razor sharp, noise free keywords', () => {
    expect(classifyNarrationTextureIntent('Rendered with crystal clear clarity and razor sharp digital precision.')).toBe('PRISTINE_DIGITAL');
    expect(classifyNarrationTextureIntent('The presentation demands an ultra-clean, noise free digital look.')).toBe('PRISTINE_DIGITAL');
    expect(classifyNarrationTextureIntent('Immaculate digital view shows pristine digital clarity.')).toBe('PRISTINE_DIGITAL');
  });

  it('extracts FILM_GRAIN intent from film grain, 35mm film, celluloid texture, organic grain keywords', () => {
    expect(classifyNarrationTextureIntent('Captured on classic 35mm film with authentic organic grain.')).toBe('FILM_GRAIN');
    expect(classifyNarrationTextureIntent('The rich celluloid texture and photochemical aesthetic evoke classic cinema.')).toBe('FILM_GRAIN');
    expect(classifyNarrationTextureIntent('Film grain adds a timeless, tactile warmth to the narrative.')).toBe('FILM_GRAIN');
  });

  it('extracts ANALOG_VHS intent from vhs tape, analog glitch, crt scanlines, retro tape keywords', () => {
    expect(classifyNarrationTextureIntent('Recalling the nostalgic era of VHS tape and CRT scanlines.')).toBe('ANALOG_VHS');
    expect(classifyNarrationTextureIntent('Analog glitch and retro tape tracking define the visual aesthetic.')).toBe('ANALOG_VHS');
    expect(classifyNarrationTextureIntent('Vintage camcorder footage captures the raw home video feel.')).toBe('ANALOG_VHS');
  });

  it('extracts GRITTY_NOISE intent from gritty texture, rough grit, raw industrial noise keywords', () => {
    expect(classifyNarrationTextureIntent('A gritty texture and rough grit embody the harsh urban reality.')).toBe('GRITTY_NOISE');
    expect(classifyNarrationTextureIntent('Raw industrial noise and heavy sensor noise add unpolished intensity.')).toBe('GRITTY_NOISE');
    expect(classifyNarrationTextureIntent('Coarse grainy texture reinforces the uncompromising documentary tone.')).toBe('GRITTY_NOISE');
  });

  it('extracts DIFFUSION_GLOW intent from pro mist, ethereal glow, halation bloom, dreamy soft haze keywords', () => {
    expect(classifyNarrationTextureIntent('A gentle pro mist diffusion creates an ethereal glow around the subjects.')).toBe('DIFFUSION_GLOW');
    expect(classifyNarrationTextureIntent('Halation bloom and dreamy soft haze infuse the memory with romance.')).toBe('DIFFUSION_GLOW');
    expect(classifyNarrationTextureIntent('A romantic glow softly scatters the warm afternoon light.')).toBe('DIFFUSION_GLOW');
  });

  it('returns NEUTRAL for narration without visual texture cues', () => {
    expect(classifyNarrationTextureIntent('The quarterly projections exceeded initial forecasts by 15%.')).toBe('NEUTRAL');
    expect(classifyNarrationTextureIntent('Next we examine the system architecture components.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationTextureIntent('CAPTURED ON 35MM FILM WITH RICH CELLULOID TEXTURE')).toBe('FILM_GRAIN');
    expect(classifyNarrationTextureIntent('ANALOG GLITCH AND VHS TAPE SCANLINES')).toBe('ANALOG_VHS');
    expect(classifyNarrationTextureIntent('CRYSTAL CLEAR AND RAZOR SHARP')).toBe('PRISTINE_DIGITAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateTextureModifier
// ---------------------------------------------------------------------------

describe('calculateTextureModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const textures: VisualTexture[] = [
      'CLEAN_PRISTINE_DIGITAL',
      'ORGANIC_FILM_GRAIN',
      'VINTAGE_ANALOG_VHS',
      'GRITTY_TEXTURED_NOISE',
      'ETHEREAL_DIFFUSION_GLOW',
      'TEXTURE_AGNOSTIC',
    ];

    const intents: TextureIntent[] = ['PRISTINE_DIGITAL', 'FILM_GRAIN', 'ANALOG_VHS', 'GRITTY_NOISE', 'DIFFUSION_GLOW', 'NEUTRAL'];

    for (const t of textures) {
      for (const i of intents) {
        const res = calculateTextureModifier(t, i);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.textureMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.textureMatchScore).toBeLessThanOrEqual(1.0);
        expect(typeof res.reason).toBe('string');
        expect(res.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('awards +0.008 bonus for exact visual texture matches', () => {
    expect(calculateTextureModifier('CLEAN_PRISTINE_DIGITAL', 'PRISTINE_DIGITAL').modifier).toBe(0.008);
    expect(calculateTextureModifier('CLEAN_PRISTINE_DIGITAL', 'PRISTINE_DIGITAL').textureMatchScore).toBe(1.0);

    expect(calculateTextureModifier('ORGANIC_FILM_GRAIN', 'FILM_GRAIN').modifier).toBe(0.008);
    expect(calculateTextureModifier('ORGANIC_FILM_GRAIN', 'FILM_GRAIN').textureMatchScore).toBe(1.0);

    expect(calculateTextureModifier('VINTAGE_ANALOG_VHS', 'ANALOG_VHS').modifier).toBe(0.008);
    expect(calculateTextureModifier('VINTAGE_ANALOG_VHS', 'ANALOG_VHS').textureMatchScore).toBe(1.0);

    expect(calculateTextureModifier('GRITTY_TEXTURED_NOISE', 'GRITTY_NOISE').modifier).toBe(0.008);
    expect(calculateTextureModifier('GRITTY_TEXTURED_NOISE', 'GRITTY_NOISE').textureMatchScore).toBe(1.0);

    expect(calculateTextureModifier('ETHEREAL_DIFFUSION_GLOW', 'DIFFUSION_GLOW').modifier).toBe(0.008);
    expect(calculateTextureModifier('ETHEREAL_DIFFUSION_GLOW', 'DIFFUSION_GLOW').textureMatchScore).toBe(1.0);
  });

  it('awards moderate bonuses for compatible texture pairs', () => {
    // Halation diffusion glow complements organic film grain
    expect(calculateTextureModifier('ETHEREAL_DIFFUSION_GLOW', 'FILM_GRAIN').modifier).toBe(0.003);
    // Film grain enhances soft diffusion glow
    expect(calculateTextureModifier('ORGANIC_FILM_GRAIN', 'DIFFUSION_GLOW').modifier).toBe(0.003);
    // Gritty noise supports film grain
    expect(calculateTextureModifier('GRITTY_TEXTURED_NOISE', 'FILM_GRAIN').modifier).toBe(0.002);
    // Pristine digital provides clean base for diffusion glow
    expect(calculateTextureModifier('CLEAN_PRISTINE_DIGITAL', 'DIFFUSION_GLOW').modifier).toBe(0.002);
  });

  it('penalizes opposing visual textures', () => {
    // VHS candidate when pristine digital requested
    const vhsToPristine = calculateTextureModifier('VINTAGE_ANALOG_VHS', 'PRISTINE_DIGITAL');
    expect(vhsToPristine.modifier).toBe(-0.006);
    expect(vhsToPristine.textureMatchScore).toBe(0.15);

    // Pristine digital candidate when VHS requested
    const pristineToVhs = calculateTextureModifier('CLEAN_PRISTINE_DIGITAL', 'ANALOG_VHS');
    expect(pristineToVhs.modifier).toBe(-0.006);
    expect(pristineToVhs.textureMatchScore).toBe(0.15);

    // Gritty noise candidate when pristine digital requested
    const grittyToPristine = calculateTextureModifier('GRITTY_TEXTURED_NOISE', 'PRISTINE_DIGITAL');
    expect(grittyToPristine.modifier).toBe(-0.006);
    expect(grittyToPristine.textureMatchScore).toBe(0.15);

    // Pristine digital candidate when gritty noise requested
    const pristineToGritty = calculateTextureModifier('CLEAN_PRISTINE_DIGITAL', 'GRITTY_NOISE');
    expect(pristineToGritty.modifier).toBe(-0.006);
    expect(pristineToGritty.textureMatchScore).toBe(0.15);
  });

  it('returns neutral 0.0 modifier for neutral intent or agnostic texture profile', () => {
    expect(calculateTextureModifier('CLEAN_PRISTINE_DIGITAL', 'NEUTRAL').modifier).toBe(0.0);
    expect(calculateTextureModifier('TEXTURE_AGNOSTIC', 'PRISTINE_DIGITAL').modifier).toBe(0.0);
    expect(calculateTextureModifier('TEXTURE_AGNOSTIC', 'FILM_GRAIN').modifier).toBe(0.0);
    expect(calculateTextureModifier('TEXTURE_AGNOSTIC', 'ANALOG_VHS').modifier).toBe(0.0);
    expect(calculateTextureModifier('TEXTURE_AGNOSTIC', 'GRITTY_NOISE').modifier).toBe(0.0);
    expect(calculateTextureModifier('TEXTURE_AGNOSTIC', 'DIFFUSION_GLOW').modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive continuation penalty waiving
// ---------------------------------------------------------------------------

describe('Consecutive continuation penalty waiving', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normal opposing mismatch has -0.006 penalty
    const normalMismatch = calculateTextureModifier('VINTAGE_ANALOG_VHS', 'PRISTINE_DIGITAL', false);
    expect(normalMismatch.modifier).toBe(-0.006);

    // With consecutive continuation, modifier is waived to 0.0
    const continuedMismatch = calculateTextureModifier('VINTAGE_ANALOG_VHS', 'PRISTINE_DIGITAL', true);
    expect(continuedMismatch.modifier).toBe(0.0);
    expect(continuedMismatch.textureMatchScore).toBe(0.8);
    expect(continuedMismatch.reason).toContain('Consecutive shot continuation');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat-reset visual texture establishing surface atmosphere
// ---------------------------------------------------------------------------

describe('Beat-reset visual texture establishing surface atmosphere', () => {
  it('awards +0.008 modifier with NEW_BEAT narrationBeatType for matching intent', () => {
    const beatMatch = calculateTextureModifier('ORGANIC_FILM_GRAIN', 'FILM_GRAIN', false, 'NEW_BEAT');
    expect(beatMatch.modifier).toBe(0.008);
    expect(beatMatch.textureMatchScore).toBe(1.0);
    expect(beatMatch.reason).toContain('New beat visual texture introduction');
  });

  it('does not award beat bonus if narration intent is NEUTRAL', () => {
    const beatNeutral = calculateTextureModifier('ORGANIC_FILM_GRAIN', 'NEUTRAL', false, 'NEW_BEAT');
    expect(beatNeutral.modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 27–44
// ---------------------------------------------------------------------------

describe('Independence from Steps 27–44', () => {
  it('operates orthogonally to medium, chromatic grading, lens perspective, and lighting', () => {
    const asset = createTestMediaAsset({
      name: 'complex_texture_shot.mp4',
      analysis: {
        description: 'Live action shot with telephoto lens in black and white featuring 35mm film grain and halation bloom',
        tags: ['live-action', 'telephoto', 'black-and-white', 'film-grain', 'halation'],
      },
    });

    const texture = classifyVisualTexture(asset);
    expect(texture).toBe('ORGANIC_FILM_GRAIN');

    // Step 45 evaluates strictly on visual texture & surface quality
    const res = calculateTextureModifier(texture, 'FILM_GRAIN');
    expect(res.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic dominance preservation
// ---------------------------------------------------------------------------

describe('Semantic dominance preservation', () => {
  it('ensures semantic relevance remains dominant over texture modifiers', () => {
    const strongSemanticScore = 0.85;
    const weakSemanticScore = 0.40;

    const strongAssetPenalty = calculateTextureModifier('VINTAGE_ANALOG_VHS', 'PRISTINE_DIGITAL').modifier; // -0.006
    const weakAssetBonus = calculateTextureModifier('CLEAN_PRISTINE_DIGITAL', 'PRISTINE_DIGITAL').modifier; // +0.008

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
  it('populates Step 45 provenance fields and stats in generateDraftTimeline', async () => {
    const segments: AudioSegment[] = [
      {
        id: 's1',
        startTime: 0,
        endTime: 4,
        text: 'Shot on 35mm film grain with authentic organic celluloid texture.',
      },
    ];

    const media: MediaAsset[] = [
      createTestMediaAsset({
        id: 'm1',
        name: 'celluloid_film.mp4',
        analysis: {
          analyzed: true,
          description: 'Authentic 35mm film grain with organic celluloid texture and emulsion warmth',
          tags: ['film-grain', '35mm-grain', 'celluloid', 'organic-grain'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(1);
    const item = result.timeline[0];
    expect(item.provenance?.visualTexture).toBe('ORGANIC_FILM_GRAIN');
    expect(item.provenance?.textureModifier).toBe(0.008);
    expect(item.provenance?.textureReason).toContain('35mm film grain matches organic cinematic celluloid narrative');
    expect(item.provenance?.textureMatchScore).toBe(1.0);

    expect(result.stats.textureAdjustments).toBe(1);
    expect(result.stats.filmGrainSelections).toBe(1);
    expect(result.stats.textureBonuses).toBe(1);
  });

  it('includes all 9 Step 45 texture counters in DraftStats type', () => {
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
      // Step 45 fields
      textureAdjustments: 1,
      pristineDigitalSelections: 0,
      filmGrainSelections: 1,
      analogVhsSelections: 0,
      grittyNoiseSelections: 0,
      diffusionGlowSelections: 0,
      textureAgnosticSelections: 0,
      textureBonuses: 1,
      texturePenalties: 0,
    };

    expect(stats.textureAdjustments).toBe(1);
    expect(stats.pristineDigitalSelections).toBe(0);
    expect(stats.filmGrainSelections).toBe(1);
    expect(stats.analogVhsSelections).toBe(0);
    expect(stats.grittyNoiseSelections).toBe(0);
    expect(stats.diffusionGlowSelections).toBe(0);
    expect(stats.textureAgnosticSelections).toBe(0);
    expect(stats.textureBonuses).toBe(1);
    expect(stats.texturePenalties).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON Serialization & Validation Round-Trip
// ---------------------------------------------------------------------------

describe('Schema JSON Serialization & Validation Round-Trip', () => {
  it('successfully exports and parses Step 45 visualTexture provenance fields', () => {
    const project = createInitialProject('Step 45 Test');
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
          sourceSegmentText: 'Classic 35mm film grain.',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match with authentic 35mm film grain texture.',
          reuseCount: 0,
          visualTexture: 'ORGANIC_FILM_GRAIN',
          textureModifier: 0.008,
          textureReason: 'Texture bonus: authentic 35mm film grain matches organic cinematic celluloid narrative.',
          textureMatchScore: 1.0,
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    const item = parsed.project?.timeline[0];
    expect(item?.provenance?.visualTexture).toBe('ORGANIC_FILM_GRAIN');
    expect(item?.provenance?.textureModifier).toBe(0.008);
    expect(item?.provenance?.textureReason).toBe('Texture bonus: authentic 35mm film grain matches organic cinematic celluloid narrative.');
    expect(item?.provenance?.textureMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Immutability, edge cases, and determinism
// ---------------------------------------------------------------------------

describe('Immutability, edge cases, and determinism', () => {
  it('does not mutate input candidate asset or description', () => {
    const asset = createTestMediaAsset({
      name: 'freeze_test.mp4',
      analysis: { description: 'Authentic 35mm film grain texture', tags: ['film-grain'] },
    });
    const frozenAsset = Object.freeze({ ...asset });

    const c1 = classifyVisualTexture(frozenAsset);
    const c2 = classifyVisualTexture(frozenAsset);
    expect(c1).toBe('ORGANIC_FILM_GRAIN');
    expect(c2).toBe('ORGANIC_FILM_GRAIN');
  });

  it('produces identical deterministic results across repeated calls', () => {
    const res1 = calculateTextureModifier('ORGANIC_FILM_GRAIN', 'FILM_GRAIN');
    const res2 = calculateTextureModifier('ORGANIC_FILM_GRAIN', 'FILM_GRAIN');
    expect(res1).toEqual(res2);
  });

  it('never returns NaN or Infinity for modifier or textureMatchScore', () => {
    const textures: VisualTexture[] = [
      'CLEAN_PRISTINE_DIGITAL',
      'ORGANIC_FILM_GRAIN',
      'VINTAGE_ANALOG_VHS',
      'GRITTY_TEXTURED_NOISE',
      'ETHEREAL_DIFFUSION_GLOW',
      'TEXTURE_AGNOSTIC',
    ];
    const intents: TextureIntent[] = ['PRISTINE_DIGITAL', 'FILM_GRAIN', 'ANALOG_VHS', 'GRITTY_NOISE', 'DIFFUSION_GLOW', 'NEUTRAL'];
    for (const t of textures) {
      for (const i of intents) {
        const res = calculateTextureModifier(t, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.textureMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.textureMatchScore)).toBe(false);
      }
    }
  });

  it('all 6 visual texture classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['pristine', 'clean-sensor'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['film-grain', '35mm-grain'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['vhs', 'crt-scanlines'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['gritty', 'high-iso'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['pro-mist', 'halation'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyVisualTexture(a));
    expect(classified).toContain('CLEAN_PRISTINE_DIGITAL');
    expect(classified).toContain('ORGANIC_FILM_GRAIN');
    expect(classified).toContain('VINTAGE_ANALOG_VHS');
    expect(classified).toContain('GRITTY_TEXTURED_NOISE');
    expect(classified).toContain('ETHEREAL_DIFFUSION_GLOW');
    expect(classified).toContain('TEXTURE_AGNOSTIC');
  });
});
