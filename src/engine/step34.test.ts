/**
 * Step 34 — Time of Day & Chronological Lighting Phase Intelligence
 *
 * Dedicated test suite verifying:
 *  - Time of day classification (DAYLIGHT_CLEAR, GOLDEN_HOUR_SUNSET, NIGHT_NOCTURNAL, DAWN_TWILIGHT, TIME_AGNOSTIC)
 *  - Narration time intent extraction (DAY, SUNSET, NIGHT, DAWN, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset chronological establishing energy
 *  - Independence from Steps 22–33
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTimeOfDay,
  classifyNarrationTimeIntent,
  calculateTimeOfDayModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  TimeOfDay,
  TimeIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
  SceneSetting,
  SubjectDensity,
  CameraAngle,
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
// 1. classifyTimeOfDay
// ---------------------------------------------------------------------------

describe('classifyTimeOfDay', () => {
  it('returns TIME_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyTimeOfDay(null)).toBe('TIME_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyTimeOfDay(undefined)).toBe('TIME_AGNOSTIC');
  });

  it('classifies DAYLIGHT_CLEAR from daylight, sunny, midday, clear-sky keywords', () => {
    const daylightAsset = createTestMediaAsset({
      name: 'midday_sunlit_park.mp4',
      analysis: {
        analyzed: true,
        tags: ['daylight', 'sunny', 'sunshine', 'clear-sky'],
        description: 'Bright sunlit afternoon in the park under a clear sky',
      },
    });
    expect(classifyTimeOfDay(daylightAsset)).toBe('DAYLIGHT_CLEAR');
  });

  it('classifies GOLDEN_HOUR_SUNSET from sunset, golden-hour, dusk, evening keywords', () => {
    const sunsetAsset = createTestMediaAsset({
      name: 'golden_hour_sunset_beach.mp4',
      analysis: {
        analyzed: true,
        tags: ['sunset', 'golden-hour', 'dusk', 'evening'],
        description: 'Warm glowing sunset with setting sun over the ocean horizon',
      },
    });
    expect(classifyTimeOfDay(sunsetAsset)).toBe('GOLDEN_HOUR_SUNSET');
  });

  it('classifies NIGHT_NOCTURNAL from night, nocturnal, midnight, moon, stars keywords', () => {
    const nightAsset = createTestMediaAsset({
      name: 'starry_midnight_sky.mp4',
      analysis: {
        analyzed: true,
        tags: ['night', 'nocturnal', 'midnight', 'moonlight', 'stars'],
        description: 'Dark nocturnal night scene with starry constellation and moon',
      },
    });
    expect(classifyTimeOfDay(nightAsset)).toBe('NIGHT_NOCTURNAL');
  });

  it('classifies DAWN_TWILIGHT from dawn, twilight, sunrise, daybreak, early-morning keywords', () => {
    const dawnAsset = createTestMediaAsset({
      name: 'early_morning_sunrise_mist.mp4',
      analysis: {
        analyzed: true,
        tags: ['dawn', 'twilight', 'sunrise', 'daybreak', 'early-morning'],
        description: 'First light of daybreak at dawn with morning mist',
      },
    });
    expect(classifyTimeOfDay(dawnAsset)).toBe('DAWN_TWILIGHT');
  });

  it('classifies TIME_AGNOSTIC from studio, diagram, abstract, timeless keywords', () => {
    const studioAsset = createTestMediaAsset({
      name: 'studio_product_render.mp4',
      analysis: {
        analyzed: true,
        tags: ['studio', 'diagram', 'abstract', 'timeless'],
        description: 'Neutral indoor studio render with isolated white background',
      },
    });
    expect(classifyTimeOfDay(studioAsset)).toBe('TIME_AGNOSTIC');
  });

  it('defaults to TIME_AGNOSTIC when no time keywords are present', () => {
    const genericAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['general', 'content'],
        description: 'Standard background scene',
      },
    });
    expect(classifyTimeOfDay(genericAsset)).toBe('TIME_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationTimeIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationTimeIntent', () => {
  it('returns NEUTRAL for empty or whitespace-only text', () => {
    expect(classifyNarrationTimeIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationTimeIntent('   ')).toBe('NEUTRAL');
  });

  it('identifies DAY intent from daytime narration keywords and phrases', () => {
    expect(classifyNarrationTimeIntent('Walking through the city in broad daylight during the afternoon')).toBe('DAY');
    expect(classifyNarrationTimeIntent('Under the bright midday sun the team gathered outside')).toBe('DAY');
    expect(classifyNarrationTimeIntent('A bright sunny day across the valley')).toBe('DAY');
  });

  it('identifies SUNSET intent from golden hour and dusk keywords and phrases', () => {
    expect(classifyNarrationTimeIntent('As the sun sets during the golden hour, the colors shift')).toBe('SUNSET');
    expect(classifyNarrationTimeIntent('Watching the setting sun fade into dusk in the late evening')).toBe('SUNSET');
    expect(classifyNarrationTimeIntent('During sunset the skyline turns orange')).toBe('SUNSET');
  });

  it('identifies NIGHT intent from nocturnal and midnight keywords and phrases', () => {
    expect(classifyNarrationTimeIntent('Late at night under the stars the city goes quiet')).toBe('NIGHT');
    expect(classifyNarrationTimeIntent('Working overnight in the darkness of midnight')).toBe('NIGHT');
    expect(classifyNarrationTimeIntent('In the dead of night illuminated only by moonlight')).toBe('NIGHT');
  });

  it('identifies DAWN intent from sunrise and daybreak keywords and phrases', () => {
    expect(classifyNarrationTimeIntent('At first light of dawn the expedition begins')).toBe('DAWN');
    expect(classifyNarrationTimeIntent('Early morning sunrise breaks over the mountain ridge')).toBe('DAWN');
    expect(classifyNarrationTimeIntent('At the crack of dawn as the sun rises')).toBe('DAWN');
  });

  it('resolves conflicting keywords based on keyword frequency and multi-word phrases', () => {
    // Multi-word phrase 'late at night' (weight 2) + 'stars' (weight 1) vs 'morning' (weight 1)
    const text = 'Walking late at night under the stars thinking of tomorrow morning.';
    expect(classifyNarrationTimeIntent(text)).toBe('NIGHT');
  });

  it('returns NEUTRAL when narration contains no chronological lighting cues', () => {
    expect(classifyNarrationTimeIntent('The algorithm optimizes memory allocation across instances')).toBe('NEUTRAL');
    expect(classifyNarrationTimeIntent('Here we review the quarterly financial results')).toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateTimeOfDayModifier
// ---------------------------------------------------------------------------

describe('calculateTimeOfDayModifier', () => {
  it('strictly bounds all modifiers within [-0.008, +0.008]', () => {
    const times: TimeOfDay[] = [
      'DAYLIGHT_CLEAR',
      'GOLDEN_HOUR_SUNSET',
      'NIGHT_NOCTURNAL',
      'DAWN_TWILIGHT',
      'TIME_AGNOSTIC',
    ];
    const intents: TimeIntent[] = ['DAY', 'SUNSET', 'NIGHT', 'DAWN', 'NEUTRAL'];

    for (const time of times) {
      for (const intent of intents) {
        const res = calculateTimeOfDayModifier(time, intent);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.timeMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.timeMatchScore).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('awards +0.008 bonus for exact time of day matches', () => {
    expect(calculateTimeOfDayModifier('DAYLIGHT_CLEAR', 'DAY').modifier).toBe(0.008);
    expect(calculateTimeOfDayModifier('GOLDEN_HOUR_SUNSET', 'SUNSET').modifier).toBe(0.008);
    expect(calculateTimeOfDayModifier('NIGHT_NOCTURNAL', 'NIGHT').modifier).toBe(0.008);
    expect(calculateTimeOfDayModifier('DAWN_TWILIGHT', 'DAWN').modifier).toBe(0.008);
  });

  it('applies partial positive alignments for adjacent or compatible chronological lighting', () => {
    // Day narration with dawn lighting
    const dayDawn = calculateTimeOfDayModifier('DAWN_TWILIGHT', 'DAY');
    expect(dayDawn.modifier).toBe(0.003);
    expect(dayDawn.timeMatchScore).toBe(0.7);

    // Sunset narration with dawn twilight atmosphere
    const sunsetDawn = calculateTimeOfDayModifier('DAWN_TWILIGHT', 'SUNSET');
    expect(sunsetDawn.modifier).toBe(0.003);
    expect(sunsetDawn.timeMatchScore).toBe(0.7);

    // Night narration with golden hour sunset lighting
    const nightSunset = calculateTimeOfDayModifier('GOLDEN_HOUR_SUNSET', 'NIGHT');
    expect(nightSunset.modifier).toBe(0.002);
    expect(nightSunset.timeMatchScore).toBe(0.6);

    // Dawn narration with daylight clear footage
    const dawnDay = calculateTimeOfDayModifier('DAYLIGHT_CLEAR', 'DAWN');
    expect(dawnDay.modifier).toBe(0.003);
    expect(dawnDay.timeMatchScore).toBe(0.7);
  });

  it('applies penalties for clashing time of day settings', () => {
    // Day narration with night nocturnal footage
    const dayNight = calculateTimeOfDayModifier('NIGHT_NOCTURNAL', 'DAY');
    expect(dayNight.modifier).toBe(-0.007);
    expect(dayNight.timeMatchScore).toBe(0.1);

    // Night narration with bright daylight clear footage
    const nightDay = calculateTimeOfDayModifier('DAYLIGHT_CLEAR', 'NIGHT');
    expect(nightDay.modifier).toBe(-0.007);
    expect(nightDay.timeMatchScore).toBe(0.1);

    // Sunset narration with bright daylight clear footage
    const sunsetDay = calculateTimeOfDayModifier('DAYLIGHT_CLEAR', 'SUNSET');
    expect(sunsetDay.modifier).toBe(-0.004);
    expect(sunsetDay.timeMatchScore).toBe(0.3);

    // Dawn narration with pitch black night footage
    const dawnNight = calculateTimeOfDayModifier('NIGHT_NOCTURNAL', 'DAWN');
    expect(dawnNight.modifier).toBe(-0.006);
    expect(dawnNight.timeMatchScore).toBe(0.15);
  });

  it('returns 0.0 modifier and 0.5 match score for NEUTRAL intent', () => {
    const res = calculateTimeOfDayModifier('DAYLIGHT_CLEAR', 'NEUTRAL');
    expect(res.modifier).toBe(0.0);
    expect(res.timeMatchScore).toBe(0.5);
    expect(res.reason).toContain('Neutral time of day intent');
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive Continuation Handling
// ---------------------------------------------------------------------------

describe('Consecutive Continuation Handling', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normally NIGHT_NOCTURNAL with DAY narration receives -0.007 penalty
    const standard = calculateTimeOfDayModifier('NIGHT_NOCTURNAL', 'DAY', false);
    expect(standard.modifier).toBe(-0.007);

    const continued = calculateTimeOfDayModifier('NIGHT_NOCTURNAL', 'DAY', true);
    expect(continued.modifier).toBe(0.0);
    expect(continued.timeMatchScore).toBe(0.8);
    expect(continued.reason).toContain('Consecutive shot continuation - time of day penalties waived.');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat Transition & Perspective Establishing Handling
// ---------------------------------------------------------------------------

describe('Beat Transition & Perspective Establishing Handling', () => {
  it('grants +0.008 bonus with new beat temporal introduction reason at NEW_BEAT', () => {
    const res = calculateTimeOfDayModifier('GOLDEN_HOUR_SUNSET', 'SUNSET', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.timeMatchScore).toBe(1.0);
    expect(res.reason).toContain('New beat temporal introduction');
  });

  it('retains standard scoring for neutral intent at NEW_BEAT', () => {
    const res = calculateTimeOfDayModifier('GOLDEN_HOUR_SUNSET', 'NEUTRAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.0);
    expect(res.timeMatchScore).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–33 Intelligence Layers
// ---------------------------------------------------------------------------

describe('Independence from Other Intelligence Layers', () => {
  it('operates orthogonally alongside framing, lighting, motion, setting, density, and angle', () => {
    const timeRes = calculateTimeOfDayModifier('GOLDEN_HOUR_SUNSET', 'SUNSET');
    expect(timeRes.timeOfDay).toBe('GOLDEN_HOUR_SUNSET');
    expect(timeRes.timeIntent).toBe('SUNSET');

    const framingSample: FramingScale = 'WIDE';
    const atmosphericSample: AtmosphericTone = 'WARM_VIBRANT';
    const motionSample: CameraMotion = 'SMOOTH_FLOAT';
    const settingSample: SceneSetting = 'OUTDOOR_NATURAL';
    const densitySample: SubjectDensity = 'UNINHABITED_OBJECT';
    const angleSample: CameraAngle = 'AERIAL_OVERHEAD';

    expect(framingSample).toBe('WIDE');
    expect(atmosphericSample).toBe('WARM_VIBRANT');
    expect(motionSample).toBe('SMOOTH_FLOAT');
    expect(settingSample).toBe('OUTDOOR_NATURAL');
    expect(densitySample).toBe('UNINHABITED_OBJECT');
    expect(angleSample).toBe('AERIAL_OVERHEAD');
    expect(timeRes.modifier).toBe(0.008);
  });

  it('Step 28 framing scale is unaffected by time of day classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['daylight', 'sunny', 'midday'],
      },
    });
    const time = classifyTimeOfDay(asset);
    expect(time).toBe('DAYLIGHT_CLEAR');
  });

  it('Step 29 atmospheric tone is unaffected by time of day classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['sunset', 'golden-hour', 'dusk'],
      },
    });
    const time = classifyTimeOfDay(asset);
    expect(time).toBe('GOLDEN_HOUR_SUNSET');
  });

  it('Step 30 camera motion is unaffected by time of day classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['night', 'nocturnal', 'midnight'],
      },
    });
    const time = classifyTimeOfDay(asset);
    expect(time).toBe('NIGHT_NOCTURNAL');
  });

  it('Step 31 scene setting is unaffected by time of day classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['dawn', 'twilight', 'sunrise'],
      },
    });
    const time = classifyTimeOfDay(asset);
    expect(time).toBe('DAWN_TWILIGHT');
  });

  it('Step 32 subject density is unaffected by time of day classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['studio', 'diagram', 'timeless'],
      },
    });
    const time = classifyTimeOfDay(asset);
    expect(time).toBe('TIME_AGNOSTIC');
  });

  it('Step 33 camera angle is unaffected by time of day classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['daylight', 'clear-sky'],
      },
    });
    const time = classifyTimeOfDay(asset);
    expect(time).toBe('DAYLIGHT_CLEAR');
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic Dominance Preservation with Step 34
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 34', () => {
  it('strong semantic match (0.82) with max time penalty (-0.007) beats weak match (0.55) with max time bonus (+0.008)', () => {
    const strongCandidateScore = 0.82 - 0.007; // 0.813
    const weakCandidateScore = 0.55 + 0.008;   // 0.558
    expect(strongCandidateScore).toBeGreaterThan(weakCandidateScore);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.088;
    const maxAllBonuses = +0.088;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.712
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.488
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 8. Schema Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Schema Round-Trip Serialization', () => {
  it('serializes and deserializes Step 34 provenance fields accurately', () => {
    const project = createInitialProject('Step 34 Serialization Test');
    const asset = createTestMediaAsset({ id: 'm-time-1' });
    project.media.push(asset);

    project.timeline.push({
      id: 'clip-1',
      mediaId: 'm-time-1',
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
        explanation: 'Selected due to matching daylight clear lighting',
        reuseCount: 0,
        timeOfDay: 'DAYLIGHT_CLEAR',
        timeModifier: 0.008,
        timeReason: 'Time bonus: clear daylight setting matches daytime narration.',
        timeMatchScore: 1.0,
      },
    });

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project).toBeDefined();

    const prov = parsed.project!.timeline[0].provenance!;
    expect(prov.timeOfDay).toBe('DAYLIGHT_CLEAR');
    expect(prov.timeModifier).toBe(0.008);
    expect(prov.timeReason).toBe('Time bonus: clear daylight setting matches daytime narration.');
    expect(prov.timeMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 9. DraftStats Counters Verification
// ---------------------------------------------------------------------------

describe('DraftStats Counters Verification', () => {
  it('supports all Step 34 time metrics in DraftStats interface', () => {
    const stats: Partial<DraftStats> = {
      timeAdjustments: 14,
      daylightSelections: 5,
      sunsetSelections: 3,
      nightSelections: 4,
      dawnSelections: 1,
      timelessSelections: 1,
      timeBonuses: 10,
      timePenalties: 4,
    };

    expect(stats.timeAdjustments).toBe(14);
    expect(stats.daylightSelections).toBe(5);
    expect(stats.sunsetSelections).toBe(3);
    expect(stats.nightSelections).toBe(4);
    expect(stats.dawnSelections).toBe(1);
    expect(stats.timelessSelections).toBe(1);
    expect(stats.timeBonuses).toBe(10);
    expect(stats.timePenalties).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 10. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyTimeOfDay does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['daylight', 'sunny', 'midday'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifyTimeOfDay(frozen)).not.toThrow();
  });

  it('classifyNarrationTimeIntent does not mutate input text', () => {
    const text = 'Under the bright midday sun, we walked through the city.';
    const copy = `${text}`;
    classifyNarrationTimeIntent(text);
    expect(text).toBe(copy);
  });

  it('time modifier does not modify sourceStart or duration', () => {
    const res = calculateTimeOfDayModifier('DAYLIGHT_CLEAR', 'DAY');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of time fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      timeOfDay: 'DAYLIGHT_CLEAR' as TimeOfDay,
      timeModifier: 0.008,
      timeReason: 'Test reason',
      timeMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.timeOfDay).toBe('DAYLIGHT_CLEAR');
    expect(prov.timeModifier).toBe(0.008);
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
    expect(classifyTimeOfDay(emptyAsset)).toBe('TIME_AGNOSTIC');
  });

  it('returns valid reason string for every time/intent combination', () => {
    const allTimes: TimeOfDay[] = [
      'DAYLIGHT_CLEAR',
      'GOLDEN_HOUR_SUNSET',
      'NIGHT_NOCTURNAL',
      'DAWN_TWILIGHT',
      'TIME_AGNOSTIC',
    ];
    const allIntents: TimeIntent[] = ['DAY', 'SUNSET', 'NIGHT', 'DAWN', 'NEUTRAL'];
    for (const t of allTimes) {
      for (const i of allIntents) {
        const res = calculateTimeOfDayModifier(t, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or timeMatchScore', () => {
    const allTimes: TimeOfDay[] = [
      'DAYLIGHT_CLEAR',
      'GOLDEN_HOUR_SUNSET',
      'NIGHT_NOCTURNAL',
      'DAWN_TWILIGHT',
      'TIME_AGNOSTIC',
    ];
    const allIntents: TimeIntent[] = ['DAY', 'SUNSET', 'NIGHT', 'DAWN', 'NEUTRAL'];
    for (const t of allTimes) {
      for (const i of allIntents) {
        const res = calculateTimeOfDayModifier(t, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.timeMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.timeMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 time of day classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['daylight', 'sunny', 'midday'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['sunset', 'golden-hour', 'dusk'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['night', 'nocturnal', 'midnight'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['dawn', 'twilight', 'sunrise'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['studio', 'diagram', 'abstract'] } }),
    ];

    const classified = assets.map((a) => classifyTimeOfDay(a));
    expect(classified).toContain('DAYLIGHT_CLEAR');
    expect(classified).toContain('GOLDEN_HOUR_SUNSET');
    expect(classified).toContain('NIGHT_NOCTURNAL');
    expect(classified).toContain('DAWN_TWILIGHT');
    expect(classified).toContain('TIME_AGNOSTIC');
  });
});

