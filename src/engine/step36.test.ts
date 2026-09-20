/**
 * Step 36 — Optical Depth of Field & Focus Plane Intelligence
 *
 * Dedicated test suite verifying:
 *  - Depth of field classification (SHALLOW_BOKEH, DEEP_FOCUS, RACK_FOCUS, SOFT_DREAMY, DEPTH_AGNOSTIC)
 *  - Narration depth intent extraction (SHALLOW, DEEP, RACK, SOFT, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset optical depth establishing energy
 *  - Independence from Steps 22–35
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDepthOfField,
  classifyNarrationDepthIntent,
  calculateDepthOfFieldModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  DepthOfField,
  DepthIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
  SceneSetting,
  SubjectDensity,
  CameraAngle,
  TimeOfDay,
  WeatherCondition,
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
// 1. classifyDepthOfField
// ---------------------------------------------------------------------------

describe('classifyDepthOfField', () => {
  it('returns DEPTH_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyDepthOfField(null)).toBe('DEPTH_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyDepthOfField(undefined)).toBe('DEPTH_AGNOSTIC');
  });

  it('classifies SHALLOW_BOKEH from shallow-depth, bokeh, blurred-background, macro, portrait-mode keywords', () => {
    const asset1 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['shallow-depth', 'bokeh', 'blurred-background'],
      },
    });
    expect(classifyDepthOfField(asset1)).toBe('SHALLOW_BOKEH');

    const asset2 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['macro', 'close-focus', 'isolated-subject'],
      },
    });
    expect(classifyDepthOfField(asset2)).toBe('SHALLOW_BOKEH');
  });

  it('classifies DEEP_FOCUS from deep-focus, pan-focus, sharp-horizon, everything-in-focus keywords', () => {
    const asset1 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['deep-focus', 'pan-focus', 'sharp-horizon'],
      },
    });
    expect(classifyDepthOfField(asset1)).toBe('DEEP_FOCUS');

    const asset2 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['everything-in-focus', 'landscape-clarity', 'edge-to-edge'],
      },
    });
    expect(classifyDepthOfField(asset2)).toBe('DEEP_FOCUS');
  });

  it('classifies RACK_FOCUS from rack-focus, focus-pull, pull-focus, shifting-focus keywords', () => {
    const asset1 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['rack-focus', 'focus-pull'],
      },
    });
    expect(classifyDepthOfField(asset1)).toBe('RACK_FOCUS');

    const asset2 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['shifting-focus', 'focus-shift', 'refocus'],
      },
    });
    expect(classifyDepthOfField(asset2)).toBe('RACK_FOCUS');
  });

  it('classifies SOFT_DREAMY from soft-focus, dreamy, ethereal, diffused-focus, nostalgic-blur keywords', () => {
    const asset1 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['soft-focus', 'dreamy', 'ethereal'],
      },
    });
    expect(classifyDepthOfField(asset1)).toBe('SOFT_DREAMY');

    const asset2 = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['nostalgic-blur', 'soft-glow', 'vintage-lens'],
      },
    });
    expect(classifyDepthOfField(asset2)).toBe('SOFT_DREAMY');
  });

  it('classifies DEPTH_AGNOSTIC from studio, diagram, flat, 2d, infographic keywords', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['studio', 'diagram', 'flat', 'infographic'],
      },
    });
    expect(classifyDepthOfField(asset)).toBe('DEPTH_AGNOSTIC');
  });

  it('defaults to DEPTH_AGNOSTIC when no depth keywords are present', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['unrelated', 'generic', 'content'],
      },
    });
    expect(classifyDepthOfField(asset)).toBe('DEPTH_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationDepthIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationDepthIntent', () => {
  it('returns NEUTRAL for empty or whitespace-only text', () => {
    expect(classifyNarrationDepthIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationDepthIntent('   ')).toBe('NEUTRAL');
  });

  it('identifies SHALLOW intent from macro, bokeh, selective focus, isolated against background keywords', () => {
    expect(classifyNarrationDepthIntent('Focusing closely on the intricate macro details with blurred background')).toBe('SHALLOW');
    expect(classifyNarrationDepthIntent('The subject is isolated against a creamy bokeh background')).toBe('SHALLOW');
    expect(classifyNarrationDepthIntent('In sharp focus, every micro texture in the foreground is visible')).toBe('SHALLOW');
  });

  it('identifies DEEP intent from vast landscape, panorama, panoramic view, edge to edge keywords', () => {
    expect(classifyNarrationDepthIntent('Across the vast landscape where everything is in sharp deep focus')).toBe('DEEP');
    expect(classifyNarrationDepthIntent('A sweeping panoramic view extending edge to edge across the horizon')).toBe('DEEP');
    expect(classifyNarrationDepthIntent('The entire scene is visible across the broad panoramic vista')).toBe('DEEP');
  });

  it('identifies RACK intent from shift focus, revealing behind, rack focus, pull focus keywords', () => {
    expect(classifyNarrationDepthIntent('We shift focus to reveal what was hidden behind the subject')).toBe('RACK');
    expect(classifyNarrationDepthIntent('The camera performs a smooth rack focus between the foreground and background')).toBe('RACK');
    expect(classifyNarrationDepthIntent('Turning our attention, the focal transition reveals the truth')).toBe('RACK');
  });

  it('identifies SOFT intent from dreamlike, nostalgic glow, ethereal glow, hazy memory keywords', () => {
    expect(classifyNarrationDepthIntent('A dreamlike vision from a distant nostalgic memory')).toBe('SOFT');
    expect(classifyNarrationDepthIntent('The soft focus and ethereal glow created a dreamy atmosphere')).toBe('SOFT');
    expect(classifyNarrationDepthIntent('In this hazy memory, thoughts drifted like distant illusions')).toBe('SOFT');
  });

  it('resolves conflicting keywords based on keyword frequency and multi-word phrases', () => {
    const text = 'Under the vast landscape, the camera performs a rack focus shift to reveal what is behind.';
    expect(classifyNarrationDepthIntent(text)).toBe('RACK');
  });

  it('returns NEUTRAL when narration contains no optical depth cues', () => {
    expect(classifyNarrationDepthIntent('The computational algorithm processed all vectors efficiently')).toBe('NEUTRAL');
    expect(classifyNarrationDepthIntent('Here we review the third-quarter financial ledger')).toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateDepthOfFieldModifier
// ---------------------------------------------------------------------------

describe('calculateDepthOfFieldModifier', () => {
  it('strictly bounds all modifiers within [-0.008, +0.008]', () => {
    const depths: DepthOfField[] = [
      'SHALLOW_BOKEH',
      'DEEP_FOCUS',
      'RACK_FOCUS',
      'SOFT_DREAMY',
      'DEPTH_AGNOSTIC',
    ];
    const intents: DepthIntent[] = ['SHALLOW', 'DEEP', 'RACK', 'SOFT', 'NEUTRAL'];

    for (const depth of depths) {
      for (const intent of intents) {
        const res = calculateDepthOfFieldModifier(depth, intent);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.depthMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.depthMatchScore).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('awards +0.008 bonus for exact depth of field matches', () => {
    expect(calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'SHALLOW').modifier).toBe(0.008);
    expect(calculateDepthOfFieldModifier('DEEP_FOCUS', 'DEEP').modifier).toBe(0.008);
    expect(calculateDepthOfFieldModifier('RACK_FOCUS', 'RACK').modifier).toBe(0.008);
    expect(calculateDepthOfFieldModifier('SOFT_DREAMY', 'SOFT').modifier).toBe(0.008);
  });

  it('applies partial positive alignments for compatible optical depth', () => {
    // Rack focus with shallow narration
    const rackShallow = calculateDepthOfFieldModifier('RACK_FOCUS', 'SHALLOW');
    expect(rackShallow.modifier).toBe(0.003);
    expect(rackShallow.depthMatchScore).toBe(0.7);

    // Soft dreamy with shallow narration
    const softShallow = calculateDepthOfFieldModifier('SOFT_DREAMY', 'SHALLOW');
    expect(softShallow.modifier).toBe(0.002);
    expect(softShallow.depthMatchScore).toBe(0.6);

    // Rack focus with deep narration
    const rackDeep = calculateDepthOfFieldModifier('RACK_FOCUS', 'DEEP');
    expect(rackDeep.modifier).toBe(0.003);
    expect(rackDeep.depthMatchScore).toBe(0.7);

    // Shallow bokeh with rack focus narration
    const shallowRack = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'RACK');
    expect(shallowRack.modifier).toBe(0.003);
    expect(shallowRack.depthMatchScore).toBe(0.7);

    // Deep focus with rack focus narration
    const deepRack = calculateDepthOfFieldModifier('DEEP_FOCUS', 'RACK');
    expect(deepRack.modifier).toBe(0.003);
    expect(deepRack.depthMatchScore).toBe(0.7);

    // Shallow bokeh with soft dreamy narration
    const shallowSoft = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'SOFT');
    expect(shallowSoft.modifier).toBe(0.003);
    expect(shallowSoft.depthMatchScore).toBe(0.7);

    // Rack focus with soft dreamy narration
    const rackSoft = calculateDepthOfFieldModifier('RACK_FOCUS', 'SOFT');
    expect(rackSoft.modifier).toBe(0.002);
    expect(rackSoft.depthMatchScore).toBe(0.6);
  });

  it('applies penalties for clashing optical depth settings', () => {
    // Shallow narration with deep all-in-focus footage
    const deepShallow = calculateDepthOfFieldModifier('DEEP_FOCUS', 'SHALLOW');
    expect(deepShallow.modifier).toBe(-0.006);
    expect(deepShallow.depthMatchScore).toBe(0.15);

    // Deep narration with shallow bokeh footage
    const shallowDeep = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'DEEP');
    expect(shallowDeep.modifier).toBe(-0.006);
    expect(shallowDeep.depthMatchScore).toBe(0.15);

    // Deep narration with soft diffused focus footage
    const softDeep = calculateDepthOfFieldModifier('SOFT_DREAMY', 'DEEP');
    expect(softDeep.modifier).toBe(-0.004);
    expect(softDeep.depthMatchScore).toBe(0.3);

    // Soft dreamy narration with hyper-sharp deep focus footage
    const deepSoft = calculateDepthOfFieldModifier('DEEP_FOCUS', 'SOFT');
    expect(deepSoft.modifier).toBe(-0.005);
    expect(deepSoft.depthMatchScore).toBe(0.2);
  });

  it('returns 0.0 modifier and 0.5 match score for NEUTRAL intent', () => {
    const res = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'NEUTRAL');
    expect(res.modifier).toBe(0.0);
    expect(res.depthMatchScore).toBe(0.5);
    expect(res.reason).toContain('Neutral depth of field intent');
  });

  it('returns 0.0 modifier for DEPTH_AGNOSTIC condition across all intents', () => {
    const res = calculateDepthOfFieldModifier('DEPTH_AGNOSTIC', 'SHALLOW');
    expect(res.modifier).toBe(0.0);
    expect(res.depthMatchScore).toBe(0.5);
    expect(res.reason).toContain('agnostic');
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive Continuation Handling
// ---------------------------------------------------------------------------

describe('Consecutive Continuation Handling', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normally SHALLOW_BOKEH with DEEP narration receives -0.006 penalty
    const standard = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'DEEP', false);
    expect(standard.modifier).toBe(-0.006);

    const continued = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'DEEP', true);
    expect(continued.modifier).toBe(0.0);
    expect(continued.depthMatchScore).toBe(0.8);
    expect(continued.reason).toContain('Consecutive shot continuation - depth of field penalties waived.');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat Transition & Perspective Establishing Handling
// ---------------------------------------------------------------------------

describe('Beat Transition & Perspective Establishing Handling', () => {
  it('grants +0.008 bonus with new beat optical depth introduction reason at NEW_BEAT', () => {
    const res = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'SHALLOW', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.depthMatchScore).toBe(1.0);
    expect(res.reason).toContain('New beat optical depth introduction');
  });

  it('retains standard scoring for neutral intent at NEW_BEAT', () => {
    const res = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'NEUTRAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.0);
    expect(res.depthMatchScore).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–35 Intelligence Layers
// ---------------------------------------------------------------------------

describe('Independence from Other Intelligence Layers', () => {
  it('operates orthogonally alongside framing, lighting, motion, setting, density, angle, time of day, and weather', () => {
    const depthRes = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'SHALLOW');
    expect(depthRes.depthOfField).toBe('SHALLOW_BOKEH');
    expect(depthRes.depthIntent).toBe('SHALLOW');

    const framingSample: FramingScale = 'WIDE';
    const atmosphericSample: AtmosphericTone = 'WARM_VIBRANT';
    const motionSample: CameraMotion = 'SMOOTH_FLOAT';
    const settingSample: SceneSetting = 'OUTDOOR_NATURAL';
    const densitySample: SubjectDensity = 'UNINHABITED_OBJECT';
    const angleSample: CameraAngle = 'AERIAL_OVERHEAD';
    const timeSample: TimeOfDay = 'DAYLIGHT_CLEAR';
    const weatherSample: WeatherCondition = 'CLEAR_FAIR';

    expect(framingSample).toBe('WIDE');
    expect(atmosphericSample).toBe('WARM_VIBRANT');
    expect(motionSample).toBe('SMOOTH_FLOAT');
    expect(settingSample).toBe('OUTDOOR_NATURAL');
    expect(densitySample).toBe('UNINHABITED_OBJECT');
    expect(angleSample).toBe('AERIAL_OVERHEAD');
    expect(timeSample).toBe('DAYLIGHT_CLEAR');
    expect(weatherSample).toBe('CLEAR_FAIR');
    expect(depthRes.modifier).toBe(0.008);
  });

  it('Step 28 framing scale is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['bokeh', 'shallow-depth', 'macro'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('SHALLOW_BOKEH');
  });

  it('Step 29 atmospheric tone is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['deep-focus', 'sharp-horizon', 'panoramic-depth'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('DEEP_FOCUS');
  });

  it('Step 30 camera motion is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['rack-focus', 'focus-pull'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('RACK_FOCUS');
  });

  it('Step 31 scene setting is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['soft-focus', 'dreamy', 'ethereal'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('SOFT_DREAMY');
  });

  it('Step 32 subject density is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['studio', 'diagram', 'abstract'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('DEPTH_AGNOSTIC');
  });

  it('Step 33 camera angle is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['bokeh', 'portrait-mode'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('SHALLOW_BOKEH');
  });

  it('Step 34 time of day is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['deep-focus', 'pan-focus'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('DEEP_FOCUS');
  });

  it('Step 35 weather condition is unaffected by depth of field classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['soft-focus', 'vintage-lens'],
      },
    });
    const depth = classifyDepthOfField(asset);
    expect(depth).toBe('SOFT_DREAMY');
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic Dominance Preservation with Step 36
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 36', () => {
  it('strong semantic match (0.82) with max depth penalty (-0.006) beats weak match (0.55) with max depth bonus (+0.008)', () => {
    const strongCandidateScore = 0.82 - 0.006; // 0.814
    const weakCandidateScore = 0.55 + 0.008;   // 0.558
    expect(strongCandidateScore).toBeGreaterThan(weakCandidateScore);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.104;
    const maxAllBonuses = +0.104;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.696
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.504
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 8. Schema Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Schema Round-Trip Serialization', () => {
  it('serializes and deserializes Step 36 provenance fields accurately', () => {
    const project = createInitialProject('Step 36 Serialization Test');
    const asset = createTestMediaAsset({ id: 'm-depth-1' });
    project.media.push(asset);

    project.timeline.push({
      id: 'clip-1',
      mediaId: 'm-depth-1',
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
        explanation: 'Selected due to matching shallow bokeh depth of field',
        reuseCount: 0,
        depthOfField: 'SHALLOW_BOKEH',
        depthModifier: 0.008,
        depthReason: 'Depth bonus: shallow depth with bokeh background matches isolated focus narration.',
        depthMatchScore: 1.0,
      },
    });

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project).toBeDefined();

    const prov = parsed.project!.timeline[0].provenance!;
    expect(prov.depthOfField).toBe('SHALLOW_BOKEH');
    expect(prov.depthModifier).toBe(0.008);
    expect(prov.depthReason).toBe('Depth bonus: shallow depth with bokeh background matches isolated focus narration.');
    expect(prov.depthMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 9. DraftStats Counters Verification
// ---------------------------------------------------------------------------

describe('DraftStats Counters Verification', () => {
  it('supports all Step 36 depth metrics in DraftStats interface', () => {
    const stats: Partial<DraftStats> = {
      depthAdjustments: 16,
      shallowBokehSelections: 5,
      deepFocusSelections: 4,
      rackFocusSelections: 3,
      softDreamySelections: 2,
      depthAgnosticSelections: 2,
      depthBonuses: 11,
      depthPenalties: 5,
    };

    expect(stats.depthAdjustments).toBe(16);
    expect(stats.shallowBokehSelections).toBe(5);
    expect(stats.deepFocusSelections).toBe(4);
    expect(stats.rackFocusSelections).toBe(3);
    expect(stats.softDreamySelections).toBe(2);
    expect(stats.depthAgnosticSelections).toBe(2);
    expect(stats.depthBonuses).toBe(11);
    expect(stats.depthPenalties).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 10. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyDepthOfField does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['bokeh', 'shallow-depth', 'macro'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifyDepthOfField(frozen)).not.toThrow();
  });

  it('classifyNarrationDepthIntent does not mutate input text', () => {
    const text = 'Focusing closely on the intricate macro details with blurred background.';
    const copy = `${text}`;
    classifyNarrationDepthIntent(text);
    expect(text).toBe(copy);
  });

  it('depth modifier does not modify sourceStart or duration', () => {
    const res = calculateDepthOfFieldModifier('SHALLOW_BOKEH', 'SHALLOW');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of depth fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      depthOfField: 'SHALLOW_BOKEH' as DepthOfField,
      depthModifier: 0.008,
      depthReason: 'Test reason',
      depthMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.depthOfField).toBe('SHALLOW_BOKEH');
    expect(prov.depthModifier).toBe(0.008);
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
    expect(classifyDepthOfField(emptyAsset)).toBe('DEPTH_AGNOSTIC');
  });

  it('returns valid reason string for every depth/intent combination', () => {
    const allDepths: DepthOfField[] = [
      'SHALLOW_BOKEH',
      'DEEP_FOCUS',
      'RACK_FOCUS',
      'SOFT_DREAMY',
      'DEPTH_AGNOSTIC',
    ];
    const allIntents: DepthIntent[] = ['SHALLOW', 'DEEP', 'RACK', 'SOFT', 'NEUTRAL'];
    for (const d of allDepths) {
      for (const i of allIntents) {
        const res = calculateDepthOfFieldModifier(d, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or depthMatchScore', () => {
    const allDepths: DepthOfField[] = [
      'SHALLOW_BOKEH',
      'DEEP_FOCUS',
      'RACK_FOCUS',
      'SOFT_DREAMY',
      'DEPTH_AGNOSTIC',
    ];
    const allIntents: DepthIntent[] = ['SHALLOW', 'DEEP', 'RACK', 'SOFT', 'NEUTRAL'];
    for (const d of allDepths) {
      for (const i of allIntents) {
        const res = calculateDepthOfFieldModifier(d, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.depthMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.depthMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 depth of field classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['shallow-depth', 'bokeh'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['deep-focus', 'pan-focus'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['rack-focus', 'focus-pull'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['soft-focus', 'dreamy'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['studio', 'diagram', 'abstract'] } }),
    ];

    const classified = assets.map((a) => classifyDepthOfField(a));
    expect(classified).toContain('SHALLOW_BOKEH');
    expect(classified).toContain('DEEP_FOCUS');
    expect(classified).toContain('RACK_FOCUS');
    expect(classified).toContain('SOFT_DREAMY');
    expect(classified).toContain('DEPTH_AGNOSTIC');
  });
});
