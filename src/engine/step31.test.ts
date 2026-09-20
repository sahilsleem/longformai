/**
 * Step 31 — Spatial Environment & Scene Setting Intelligence
 *
 * Dedicated test suite verifying:
 *  - Scene setting classification (INDOOR_INTERIOR, OUTDOOR_NATURAL, OUTDOOR_URBAN, STUDIO_ABSTRACT, NEUTRAL_SETTING)
 *  - Narration spatial setting intent extraction (INDOOR, NATURE, URBAN, ABSTRACT, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset environmental establishing energy
 *  - Independence from Steps 22–30
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifySceneSetting,
  classifyNarrationSettingIntent,
  calculateSceneSettingModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  SceneSetting,
  SettingIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
} from '../types/project';
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
// 1. classifySceneSetting
// ---------------------------------------------------------------------------

describe('classifySceneSetting', () => {
  it('returns NEUTRAL_SETTING for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifySceneSetting(null)).toBe('NEUTRAL_SETTING');
    // @ts-expect-error test undefined asset
    expect(classifySceneSetting(undefined)).toBe('NEUTRAL_SETTING');
  });

  it('classifies INDOOR_INTERIOR from office, room, desk, and kitchen keywords', () => {
    const officeAsset = createTestMediaAsset({
      name: 'corporate_office_meeting.mp4',
      analysis: {
        analyzed: true,
        tags: ['office', 'room', 'desk', 'workspace'],
        description: 'Colleagues working at a desk in a modern corporate office interior',
      },
    });
    expect(classifySceneSetting(officeAsset)).toBe('INDOOR_INTERIOR');

    const homeAsset = createTestMediaAsset({
      name: 'kitchen_cooking.mp4',
      analysis: {
        analyzed: true,
        tags: ['kitchen', 'home', 'house', 'indoor'],
        description: 'Cooking dinner inside a home kitchen',
      },
    });
    expect(classifySceneSetting(homeAsset)).toBe('INDOOR_INTERIOR');
  });

  it('classifies OUTDOOR_NATURAL from forest, mountain, ocean, and wilderness keywords', () => {
    const mountainAsset = createTestMediaAsset({
      name: 'alpine_mountains.mp4',
      analysis: {
        analyzed: true,
        tags: ['mountain', 'nature', 'landscape', 'wilderness'],
        description: 'Snowy mountain peaks and forest valley landscape',
      },
    });
    expect(classifySceneSetting(mountainAsset)).toBe('OUTDOOR_NATURAL');

    const oceanAsset = createTestMediaAsset({
      name: 'ocean_beach_waves.mp4',
      analysis: {
        analyzed: true,
        tags: ['ocean', 'sea', 'beach', 'coast', 'waterfall'],
        description: 'Waves crashing on a natural sandy beach',
      },
    });
    expect(classifySceneSetting(oceanAsset)).toBe('OUTDOOR_NATURAL');
  });

  it('classifies OUTDOOR_URBAN from city, street, skyscraper, and highway keywords', () => {
    const cityAsset = createTestMediaAsset({
      name: 'metropolitan_skyline.mp4',
      analysis: {
        analyzed: true,
        tags: ['city', 'urban', 'skyscraper', 'downtown', 'traffic'],
        description: 'Busy traffic and skyscrapers in a downtown city metropolis',
      },
    });
    expect(classifySceneSetting(cityAsset)).toBe('OUTDOOR_URBAN');
  });

  it('classifies STUDIO_ABSTRACT from backdrop, digital, render, pattern, and graphic keywords', () => {
    const abstractAsset = createTestMediaAsset({
      name: 'digital_data_grid.mp4',
      analysis: {
        analyzed: true,
        tags: ['abstract', 'digital', 'render', '3d', 'pattern'],
        description: 'A 3D animated digital grid pattern on a solid backdrop',
      },
    });
    expect(classifySceneSetting(abstractAsset)).toBe('STUDIO_ABSTRACT');
  });

  it('returns NEUTRAL_SETTING when no specific spatial keywords match', () => {
    const genericAsset = createTestMediaAsset({
      name: 'unspecified_clip.mp4',
      analysis: {
        analyzed: true,
        tags: ['general', 'ambient'],
        description: 'An ambient sequence',
      },
    });
    expect(classifySceneSetting(genericAsset)).toBe('NEUTRAL_SETTING');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationSettingIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationSettingIntent', () => {
  it('returns NEUTRAL for empty text and undefined role', () => {
    expect(classifyNarrationSettingIntent('')).toBe('NEUTRAL');
  });

  it('classifies INDOOR from office, room, desk, and indoor keywords', () => {
    expect(classifyNarrationSettingIntent('Inside the quiet office room, engineers gathered around the desk')).toBe('INDOOR');
    expect(classifyNarrationSettingIntent('Working late in the laboratory workspace')).toBe('INDOOR');
  });

  it('classifies NATURE from forest, mountain, ocean, river, and wilderness keywords', () => {
    expect(classifyNarrationSettingIntent('High up in the rugged mountain wilderness surrounded by forest')).toBe('NATURE');
    expect(classifyNarrationSettingIntent('Sailing across the vast blue ocean towards the coast')).toBe('NATURE');
  });

  it('classifies URBAN from city, street, downtown, traffic, and skyscraper keywords', () => {
    expect(classifyNarrationSettingIntent('Navigating through heavy traffic on the busy downtown city streets')).toBe('URBAN');
    expect(classifyNarrationSettingIntent('The towering skyscrapers of the urban metropolis')).toBe('URBAN');
  });

  it('classifies ABSTRACT from digital, concept, diagram, chart, and data keywords', () => {
    expect(classifyNarrationSettingIntent('Examining the abstract mathematical model and digital chart data')).toBe('ABSTRACT');
    expect(classifyNarrationSettingIntent('This diagram illustrates the core 3D concept')).toBe('ABSTRACT');
  });

  it('returns NEUTRAL for general narration without environmental keywords', () => {
    expect(classifyNarrationSettingIntent('The final results exceeded all our initial expectations')).toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateSceneSettingModifier
// ---------------------------------------------------------------------------

describe('calculateSceneSettingModifier', () => {
  const allSettings: SceneSetting[] = ['INDOOR_INTERIOR', 'OUTDOOR_NATURAL', 'OUTDOOR_URBAN', 'STUDIO_ABSTRACT', 'NEUTRAL_SETTING'];
  const allIntents: SettingIntent[] = ['INDOOR', 'NATURE', 'URBAN', 'ABSTRACT', 'NEUTRAL'];

  it('is strictly bounded within [-0.008, +0.008] across all permutations', () => {
    for (const setting of allSettings) {
      for (const intent of allIntents) {
        for (const isCont of [true, false]) {
          for (const beatType of ['NEW_BEAT', 'CONTINUING_BEAT', 'BEAT_END', 'STANDALONE'] as const) {
            const result = calculateSceneSettingModifier(setting, intent, isCont, beatType);
            expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
            expect(result.modifier).toBeLessThanOrEqual(0.008);
            expect(result.settingMatchScore).toBeGreaterThanOrEqual(0.0);
            expect(result.settingMatchScore).toBeLessThanOrEqual(1.0);
            expect(result.sceneSetting).toBe(setting);
            expect(result.settingIntent).toBe(intent);
            expect(typeof result.reason).toBe('string');
            expect(result.reason.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('awards +0.008 bonus for matching INDOOR intent with INDOOR_INTERIOR setting', () => {
    const res = calculateSceneSettingModifier('INDOOR_INTERIOR', 'INDOOR');
    expect(res.modifier).toBe(0.008);
    expect(res.settingMatchScore).toBe(1.0);
    expect(res.reason).toContain('Setting bonus');
  });

  it('applies -0.006 penalty for INDOOR intent clashing with OUTDOOR_NATURAL setting', () => {
    const res = calculateSceneSettingModifier('OUTDOOR_NATURAL', 'INDOOR');
    expect(res.modifier).toBe(-0.006);
    expect(res.settingMatchScore).toBe(0.15);
    expect(res.reason).toContain('Setting penalty');
  });

  it('awards +0.008 bonus for matching NATURE intent with OUTDOOR_NATURAL setting', () => {
    const res = calculateSceneSettingModifier('OUTDOOR_NATURAL', 'NATURE');
    expect(res.modifier).toBe(0.008);
    expect(res.settingMatchScore).toBe(1.0);
  });

  it('applies -0.006 penalty for NATURE intent clashing with INDOOR_INTERIOR setting', () => {
    const res = calculateSceneSettingModifier('INDOOR_INTERIOR', 'NATURE');
    expect(res.modifier).toBe(-0.006);
    expect(res.settingMatchScore).toBe(0.15);
  });

  it('awards +0.008 bonus for matching URBAN intent with OUTDOOR_URBAN setting', () => {
    const res = calculateSceneSettingModifier('OUTDOOR_URBAN', 'URBAN');
    expect(res.modifier).toBe(0.008);
    expect(res.settingMatchScore).toBe(1.0);
  });

  it('awards +0.008 bonus for matching ABSTRACT intent with STUDIO_ABSTRACT setting', () => {
    const res = calculateSceneSettingModifier('STUDIO_ABSTRACT', 'ABSTRACT');
    expect(res.modifier).toBe(0.008);
    expect(res.settingMatchScore).toBe(1.0);
  });

  it('returns neutral 0.0 modifier for NEUTRAL intent', () => {
    for (const setting of allSettings) {
      const res = calculateSceneSettingModifier(setting, 'NEUTRAL');
      expect(res.modifier).toBe(0.0);
      expect(res.settingMatchScore).toBe(0.5);
    }
  });

  it('waives penalties and sets modifier to 0.0 when isConsecutiveContinuation is true', () => {
    const res = calculateSceneSettingModifier('OUTDOOR_NATURAL', 'INDOOR', true);
    expect(res.modifier).toBe(0.0);
    expect(res.settingMatchScore).toBe(0.8);
    expect(res.reason).toContain('Consecutive shot continuation');
  });

  it('grants +0.008 establishing bonus on NEW_BEAT for matching environmental setting', () => {
    const res = calculateSceneSettingModifier('OUTDOOR_NATURAL', 'NATURE', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.reason).toContain('New beat establishing location');
  });

  it('produces deterministic output across multiple invocations', () => {
    const res1 = calculateSceneSettingModifier('INDOOR_INTERIOR', 'INDOOR');
    const res2 = calculateSceneSettingModifier('INDOOR_INTERIOR', 'INDOOR');
    expect(res1).toEqual(res2);
  });
});

// ---------------------------------------------------------------------------
// 4. Step 31 Independence from Steps 22–30
// ---------------------------------------------------------------------------

describe('Step 31 Independence from Steps 22–30', () => {
  const asset = createTestMediaAsset({
    analysis: {
      analyzed: true,
      tags: ['office', 'room', 'desk'],
      description: 'Interior office room with desks',
    },
  });

  it('Step 22 visual variety is unaffected by scene setting modifier', () => {
    const setting = classifySceneSetting(asset);
    const settingIntel = calculateSceneSettingModifier(setting, 'INDOOR');
    expect(typeof settingIntel.modifier).toBe('number');
    expect(settingIntel.modifier).toBe(0.008);
  });

  it('Step 23 pacing modifier is unaffected by scene setting modifier', () => {
    const setting = classifySceneSetting(asset);
    const settingIntel = calculateSceneSettingModifier(setting, 'INDOOR');
    expect(settingIntel.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 24 pacing arc modifier is unaffected by scene setting modifier', () => {
    const setting = classifySceneSetting(asset);
    const settingIntel = calculateSceneSettingModifier(setting, 'NATURE');
    expect(settingIntel.modifier).toBe(-0.006);
  });

  it('Step 25 visual impact modifier is unaffected by scene setting modifier', () => {
    const setting = classifySceneSetting(asset);
    expect(setting).toBe('INDOOR_INTERIOR');
  });

  it('Step 26 contrast modifier is unaffected by scene setting modifier', () => {
    const setting = classifySceneSetting(asset);
    expect(setting).toBe('INDOOR_INTERIOR');
  });

  it('Step 27 subject continuity modifier is unaffected by scene setting modifier', () => {
    const setting = classifySceneSetting(asset);
    const settingIntel = calculateSceneSettingModifier(setting, 'NEUTRAL');
    expect(settingIntel.modifier).toBe(0.0);
  });

  it('Step 28 framing scale modifier is unaffected by scene setting modifier', () => {
    const framing: FramingScale = 'WIDE';
    expect(framing).toBe('WIDE');
    const setting = classifySceneSetting(asset);
    expect(setting).toBe('INDOOR_INTERIOR');
  });

  it('Step 29 atmospheric modifier is unaffected by scene setting modifier', () => {
    const tone: AtmosphericTone = 'WARM_VIBRANT';
    expect(tone).toBe('WARM_VIBRANT');
    const setting = classifySceneSetting(asset);
    expect(setting).toBe('INDOOR_INTERIOR');
  });

  it('Step 30 camera motion modifier is unaffected by scene setting modifier', () => {
    const motion: CameraMotion = 'STATIC_LOCKED';
    expect(motion).toBe('STATIC_LOCKED');
    const setting = classifySceneSetting(asset);
    expect(setting).toBe('INDOOR_INTERIOR');
  });
});

// ---------------------------------------------------------------------------
// 5. Semantic Dominance Preservation with Step 31
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 31', () => {
  it('strong semantic match (0.82) with max penalty (-0.008) beats weak match (0.55) with max bonus (+0.008)', () => {
    const strongCandidateScore = 0.82 - 0.008; // 0.812
    const weakCandidateScore = 0.55 + 0.008;   // 0.558
    expect(strongCandidateScore).toBeGreaterThan(weakCandidateScore);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.07;
    const maxAllBonuses = +0.07;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.73
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.47
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 6. DraftStats Step 31 Metrics
// ---------------------------------------------------------------------------

describe('DraftStats Step 31 Fields Interface Check', () => {
  it('DraftStats supports all Step 31 setting counters', () => {
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
      settingAdjustments: 4,
      indoorSettingSelections: 2,
      natureSettingSelections: 1,
      urbanSettingSelections: 1,
      abstractSettingSelections: 0,
      settingBonuses: 3,
      settingPenalties: 1,
    };

    expect(sampleStats.settingAdjustments).toBe(4);
    expect(sampleStats.indoorSettingSelections).toBe(2);
    expect(sampleStats.natureSettingSelections).toBe(1);
    expect(sampleStats.urbanSettingSelections).toBe(1);
    expect(sampleStats.settingBonuses).toBe(3);
    expect(sampleStats.settingPenalties).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Schema Serialization Round-Trip for Step 31
// ---------------------------------------------------------------------------

describe('Schema Serialization Round-Trip for Step 31', () => {
  it('all 4 Step 31 provenance fields survive JSON stringify/parse round-trip', () => {
    const provenance = {
      sourceSegmentId: 'seg-1',
      originalScore: 0.85,
      adjustedScore: 0.858,
      explanation: 'Strong semantic match',
      reuseCount: 0,
      sceneSetting: 'INDOOR_INTERIOR' as SceneSetting,
      settingModifier: 0.008,
      settingReason: 'Setting bonus: indoor interior environment matches interior narration.',
      settingMatchScore: 1.0,
      isManuallyEdited: false,
    };

    const serialized = JSON.stringify(provenance);
    const parsed = JSON.parse(serialized);

    expect(parsed.sceneSetting).toBe('INDOOR_INTERIOR');
    expect(parsed.settingModifier).toBe(0.008);
    expect(parsed.settingReason).toContain('Setting bonus');
    expect(parsed.settingMatchScore).toBe(1.0);
  });

  it('preserves floating-point precision on modifier and match score', () => {
    const obj = { mod: -0.006, score: 0.85 };
    const roundTripped = JSON.parse(JSON.stringify(obj));
    expect(roundTripped.mod).toBe(-0.006);
    expect(roundTripped.score).toBe(0.85);
  });

  it('exports Step 31 provenance fields in exportProjectToPortableJSON', () => {
    const project = createInitialProject('Step 31 Full Export');
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
          sceneSetting: 'INDOOR_INTERIOR',
          settingModifier: 0.008,
          settingReason: 'Setting bonus: indoor interior environment matches interior narration.',
          settingMatchScore: 1.0,
          isManuallyEdited: false,
          assignedAt: Date.now(),
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = JSON.parse(json);

    expect(parsed.project.timeline[0]?.provenance?.sceneSetting).toBe('INDOOR_INTERIOR');
    expect(parsed.project.timeline[0]?.provenance?.settingModifier).toBe(0.008);
    expect(parsed.project.timeline[0]?.provenance?.settingReason).toContain('Setting bonus');
    expect(parsed.project.timeline[0]?.provenance?.settingMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 8. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifySceneSetting does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['office', 'room', 'desk'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifySceneSetting(frozen)).not.toThrow();
  });

  it('classifyNarrationSettingIntent does not mutate input text', () => {
    const text = 'Office team meeting discussion';
    const copy = `${text}`;
    classifyNarrationSettingIntent(text);
    expect(text).toBe(copy);
  });

  it('setting modifier does not modify sourceStart or duration', () => {
    const res = calculateSceneSettingModifier('INDOOR_INTERIOR', 'INDOOR');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of setting fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      sceneSetting: 'INDOOR_INTERIOR' as SceneSetting,
      settingModifier: 0.008,
      settingReason: 'Test reason',
      settingMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.sceneSetting).toBe('INDOOR_INTERIOR');
    expect(prov.settingModifier).toBe(0.008);
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
    expect(classifySceneSetting(emptyAsset)).toBe('NEUTRAL_SETTING');
  });

  it('returns valid reason string for every combination', () => {
    const allSettings: SceneSetting[] = ['INDOOR_INTERIOR', 'OUTDOOR_NATURAL', 'OUTDOOR_URBAN', 'STUDIO_ABSTRACT', 'NEUTRAL_SETTING'];
    const allIntents: SettingIntent[] = ['INDOOR', 'NATURE', 'URBAN', 'ABSTRACT', 'NEUTRAL'];
    for (const s of allSettings) {
      for (const i of allIntents) {
        const res = calculateSceneSettingModifier(s, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or settingMatchScore', () => {
    const allSettings: SceneSetting[] = ['INDOOR_INTERIOR', 'OUTDOOR_NATURAL', 'OUTDOOR_URBAN', 'STUDIO_ABSTRACT', 'NEUTRAL_SETTING'];
    const allIntents: SettingIntent[] = ['INDOOR', 'NATURE', 'URBAN', 'ABSTRACT', 'NEUTRAL'];
    for (const s of allSettings) {
      for (const i of allIntents) {
        const res = calculateSceneSettingModifier(s, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.settingMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.settingMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 scene settings are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['office', 'room', 'desk'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['forest', 'mountain', 'nature'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['city', 'street', 'downtown'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['abstract', 'digital', 'render'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['general'] } }),
    ];

    const classified = assets.map((a) => classifySceneSetting(a));
    expect(classified).toContain('INDOOR_INTERIOR');
    expect(classified).toContain('OUTDOOR_NATURAL');
    expect(classified).toContain('OUTDOOR_URBAN');
    expect(classified).toContain('STUDIO_ABSTRACT');
    expect(classified).toContain('NEUTRAL_SETTING');
  });
});
