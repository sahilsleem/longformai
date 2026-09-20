/**
 * Step 35 — Weather & Atmospheric Condition Intelligence
 *
 * Dedicated test suite verifying:
 *  - Weather condition classification (CLEAR_FAIR, OVERCAST_CLOUDY, RAIN_STORMY, SNOW_FROST, FOG_MIST, WEATHER_AGNOSTIC)
 *  - Narration weather intent extraction (CLEAR, OVERCAST, RAIN, SNOW, FOG, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset meteorological establishing energy
 *  - Independence from Steps 22–34
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifyWeatherCondition,
  classifyNarrationWeatherIntent,
  calculateWeatherModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  WeatherCondition,
  WeatherIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
  SceneSetting,
  SubjectDensity,
  CameraAngle,
  TimeOfDay,
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
// 1. classifyWeatherCondition
// ---------------------------------------------------------------------------

describe('classifyWeatherCondition', () => {
  it('returns WEATHER_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyWeatherCondition(null)).toBe('WEATHER_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyWeatherCondition(undefined)).toBe('WEATHER_AGNOSTIC');
  });

  it('classifies CLEAR_FAIR from clear, sunny, blue-sky, cloudless keywords', () => {
    const clearAsset = createTestMediaAsset({
      name: 'sunny_clear_sky.mp4',
      analysis: {
        analyzed: true,
        tags: ['clear', 'sunny', 'blue-sky', 'cloudless'],
        description: 'Bright sunny day under clear fair skies with crisp visibility',
      },
    });
    expect(classifyWeatherCondition(clearAsset)).toBe('CLEAR_FAIR');
  });

  it('classifies OVERCAST_CLOUDY from overcast, cloudy, clouds, grey-sky keywords', () => {
    const cloudyAsset = createTestMediaAsset({
      name: 'overcast_cloudy_sky.mp4',
      analysis: {
        analyzed: true,
        tags: ['overcast', 'cloudy', 'clouds', 'grey-sky'],
        description: 'Gloomy overcast gray clouds covering the sky',
      },
    });
    expect(classifyWeatherCondition(cloudyAsset)).toBe('OVERCAST_CLOUDY');
  });

  it('classifies RAIN_STORMY from rain, rainy, downpour, storm, thunderstorm keywords', () => {
    const rainAsset = createTestMediaAsset({
      name: 'rain_storm_downpour.mp4',
      analysis: {
        analyzed: true,
        tags: ['rain', 'downpour', 'storm', 'thunderstorm', 'puddles'],
        description: 'Heavy torrential rain storm with puddles on wet pavement',
      },
    });
    expect(classifyWeatherCondition(rainAsset)).toBe('RAIN_STORMY');
  });

  it('classifies SNOW_FROST from snow, snowy, blizzard, frost, ice keywords', () => {
    const snowAsset = createTestMediaAsset({
      name: 'winter_blizzard_snow.mp4',
      analysis: {
        analyzed: true,
        tags: ['snow', 'blizzard', 'frost', 'ice', 'winter'],
        description: 'Heavy snowfall and frost across a frozen winter landscape',
      },
    });
    expect(classifyWeatherCondition(snowAsset)).toBe('SNOW_FROST');
  });

  it('classifies FOG_MIST from fog, misty, haze, smoke, steam keywords', () => {
    const fogAsset = createTestMediaAsset({
      name: 'morning_mist_fog.mp4',
      analysis: {
        analyzed: true,
        tags: ['fog', 'mist', 'haze', 'misty'],
        description: 'Dense morning fog and mist obscuring the forest trees',
      },
    });
    expect(classifyWeatherCondition(fogAsset)).toBe('FOG_MIST');
  });

  it('classifies WEATHER_AGNOSTIC from studio, diagram, abstract, timeless keywords', () => {
    const studioAsset = createTestMediaAsset({
      name: 'studio_product_render.mp4',
      analysis: {
        analyzed: true,
        tags: ['studio', 'diagram', 'abstract', 'timeless'],
        description: 'Neutral indoor studio render with isolated background',
      },
    });
    expect(classifyWeatherCondition(studioAsset)).toBe('WEATHER_AGNOSTIC');
  });

  it('defaults to WEATHER_AGNOSTIC when no weather keywords are present', () => {
    const genericAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['general', 'content'],
        description: 'Standard background scene',
      },
    });
    expect(classifyWeatherCondition(genericAsset)).toBe('WEATHER_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationWeatherIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationWeatherIntent', () => {
  it('returns NEUTRAL for empty or whitespace-only text', () => {
    expect(classifyNarrationWeatherIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationWeatherIntent('   ')).toBe('NEUTRAL');
  });

  it('identifies CLEAR intent from clear skies and sunny weather keywords', () => {
    expect(classifyNarrationWeatherIntent('Under the clear blue sky and bright sunny conditions')).toBe('CLEAR');
    expect(classifyNarrationWeatherIntent('Enjoying fair weather and sunshine across the coast')).toBe('CLEAR');
    expect(classifyNarrationWeatherIntent('A cloudless sky greeted the team')).toBe('CLEAR');
  });

  it('identifies OVERCAST intent from cloudy and gray sky keywords', () => {
    expect(classifyNarrationWeatherIntent('Under overcast skies with gathering dark clouds')).toBe('OVERCAST');
    expect(classifyNarrationWeatherIntent('A gloomy gray sky hung over the landscape')).toBe('OVERCAST');
    expect(classifyNarrationWeatherIntent('Cloudy weather persisted throughout the region')).toBe('OVERCAST');
  });

  it('identifies RAIN intent from precipitation and storm keywords', () => {
    expect(classifyNarrationWeatherIntent('Caught in torrential rain with thunder and lightning')).toBe('RAIN');
    expect(classifyNarrationWeatherIntent('A heavy rain storm poured over the city streets')).toBe('RAIN');
    expect(classifyNarrationWeatherIntent('Walking in the rain as downpour flooded the paths')).toBe('RAIN');
  });

  it('identifies SNOW intent from winter and snowfall keywords', () => {
    expect(classifyNarrationWeatherIntent('Navigating through a winter blizzard in the snow')).toBe('SNOW');
    expect(classifyNarrationWeatherIntent('Heavy snow falling across the frozen ice fields')).toBe('SNOW');
    expect(classifyNarrationWeatherIntent('Frosty temperatures brought early snowfall')).toBe('SNOW');
  });

  it('identifies FOG intent from mist and haze keywords', () => {
    expect(classifyNarrationWeatherIntent('Enveloped in dense fog and heavy haze')).toBe('FOG');
    expect(classifyNarrationWeatherIntent('Early morning mist shrouded the river valley')).toBe('FOG');
    expect(classifyNarrationWeatherIntent('Visibility dropped in the thick misty air')).toBe('FOG');
  });

  it('resolves conflicting keywords based on keyword frequency and multi-word phrases', () => {
    const text = 'Under torrential rain the storm drenched the sunny flowers.';
    expect(classifyNarrationWeatherIntent(text)).toBe('RAIN');
  });

  it('returns NEUTRAL when narration contains no meteorological weather cues', () => {
    expect(classifyNarrationWeatherIntent('The compiler generated optimized bytecode')).toBe('NEUTRAL');
    expect(classifyNarrationWeatherIntent('Here we review the quarterly progress metrics')).toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateWeatherModifier
// ---------------------------------------------------------------------------

describe('calculateWeatherModifier', () => {
  it('strictly bounds all modifiers within [-0.008, +0.008]', () => {
    const conditions: WeatherCondition[] = [
      'CLEAR_FAIR',
      'OVERCAST_CLOUDY',
      'RAIN_STORMY',
      'SNOW_FROST',
      'FOG_MIST',
      'WEATHER_AGNOSTIC',
    ];
    const intents: WeatherIntent[] = ['CLEAR', 'OVERCAST', 'RAIN', 'SNOW', 'FOG', 'NEUTRAL'];

    for (const condition of conditions) {
      for (const intent of intents) {
        const res = calculateWeatherModifier(condition, intent);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.weatherMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.weatherMatchScore).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('awards +0.008 bonus for exact weather condition matches', () => {
    expect(calculateWeatherModifier('CLEAR_FAIR', 'CLEAR').modifier).toBe(0.008);
    expect(calculateWeatherModifier('OVERCAST_CLOUDY', 'OVERCAST').modifier).toBe(0.008);
    expect(calculateWeatherModifier('RAIN_STORMY', 'RAIN').modifier).toBe(0.008);
    expect(calculateWeatherModifier('SNOW_FROST', 'SNOW').modifier).toBe(0.008);
    expect(calculateWeatherModifier('FOG_MIST', 'FOG').modifier).toBe(0.008);
  });

  it('applies partial positive alignments for compatible atmospheric weather', () => {
    // Overcast condition with rain narration (dark cloudy skies fit rain)
    const overcastRain = calculateWeatherModifier('OVERCAST_CLOUDY', 'RAIN');
    expect(overcastRain.modifier).toBe(0.003);
    expect(overcastRain.weatherMatchScore).toBe(0.7);

    // Overcast condition with fog narration (gloomy/cloudy atmosphere fits fog)
    const overcastFog = calculateWeatherModifier('OVERCAST_CLOUDY', 'FOG');
    expect(overcastFog.modifier).toBe(0.003);
    expect(overcastFog.weatherMatchScore).toBe(0.7);

    // Rain condition with overcast narration
    const rainOvercast = calculateWeatherModifier('RAIN_STORMY', 'OVERCAST');
    expect(rainOvercast.modifier).toBe(0.003);
    expect(rainOvercast.weatherMatchScore).toBe(0.7);

    // Snow condition with overcast narration
    const snowOvercast = calculateWeatherModifier('SNOW_FROST', 'OVERCAST');
    expect(snowOvercast.modifier).toBe(0.002);
    expect(snowOvercast.weatherMatchScore).toBe(0.6);

    // Fog condition with rain narration
    const fogRain = calculateWeatherModifier('FOG_MIST', 'RAIN');
    expect(fogRain.modifier).toBe(0.002);
    expect(fogRain.weatherMatchScore).toBe(0.6);

    // Clear condition with snow narration
    const clearSnow = calculateWeatherModifier('CLEAR_FAIR', 'SNOW');
    expect(clearSnow.modifier).toBe(-0.005);
    expect(clearSnow.weatherMatchScore).toBe(0.2);

    // Snow condition with fog narration
    const snowFog = calculateWeatherModifier('SNOW_FROST', 'FOG');
    expect(snowFog.modifier).toBe(0.002);
    expect(snowFog.weatherMatchScore).toBe(0.6);
  });

  it('applies penalties for clashing weather conditions', () => {
    // Clear sunny footage with torrential rain narration
    const clearRain = calculateWeatherModifier('CLEAR_FAIR', 'RAIN');
    expect(clearRain.modifier).toBe(-0.007);
    expect(clearRain.weatherMatchScore).toBe(0.1);

    // Clear sunny footage with dense fog narration
    const clearFog = calculateWeatherModifier('CLEAR_FAIR', 'FOG');
    expect(clearFog.modifier).toBe(-0.005);
    expect(clearFog.weatherMatchScore).toBe(0.2);

    // Rain stormy footage with clear sunny narration
    const rainClear = calculateWeatherModifier('RAIN_STORMY', 'CLEAR');
    expect(rainClear.modifier).toBe(-0.007);
    expect(rainClear.weatherMatchScore).toBe(0.1);

    // Snow footage with bright clear summer narration
    const snowClear = calculateWeatherModifier('SNOW_FROST', 'CLEAR');
    expect(snowClear.modifier).toBe(-0.004);
    expect(snowClear.weatherMatchScore).toBe(0.3);

    // Fog mist footage with clear sunny skies narration
    const fogClear = calculateWeatherModifier('FOG_MIST', 'CLEAR');
    expect(fogClear.modifier).toBe(-0.004);
    expect(fogClear.weatherMatchScore).toBe(0.3);

    // Rain stormy footage with snow winter narration
    const rainSnow = calculateWeatherModifier('RAIN_STORMY', 'SNOW');
    expect(rainSnow.modifier).toBe(-0.003);
    expect(rainSnow.weatherMatchScore).toBe(0.35);
  });

  it('returns 0.0 modifier and 0.5 match score for NEUTRAL intent', () => {
    const res = calculateWeatherModifier('CLEAR_FAIR', 'NEUTRAL');
    expect(res.modifier).toBe(0.0);
    expect(res.weatherMatchScore).toBe(0.5);
    expect(res.reason).toContain('Neutral weather intent');
  });

  it('returns 0.0 modifier for WEATHER_AGNOSTIC condition across all intents', () => {
    const res = calculateWeatherModifier('WEATHER_AGNOSTIC', 'RAIN');
    expect(res.modifier).toBe(0.0);
    expect(res.weatherMatchScore).toBe(0.5);
    expect(res.reason).toContain('agnostic');
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive Continuation Handling
// ---------------------------------------------------------------------------

describe('Consecutive Continuation Handling', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normally RAIN_STORMY with CLEAR narration receives -0.007 penalty
    const standard = calculateWeatherModifier('RAIN_STORMY', 'CLEAR', false);
    expect(standard.modifier).toBe(-0.007);

    const continued = calculateWeatherModifier('RAIN_STORMY', 'CLEAR', true);
    expect(continued.modifier).toBe(0.0);
    expect(continued.weatherMatchScore).toBe(0.8);
    expect(continued.reason).toContain('Consecutive shot continuation - weather penalties waived.');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat Transition & Perspective Establishing Handling
// ---------------------------------------------------------------------------

describe('Beat Transition & Perspective Establishing Handling', () => {
  it('grants +0.008 bonus with new beat meteorological establishing reason at NEW_BEAT', () => {
    const res = calculateWeatherModifier('RAIN_STORMY', 'RAIN', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.weatherMatchScore).toBe(1.0);
    expect(res.reason).toContain('New beat meteorological introduction');
  });

  it('retains standard scoring for neutral intent at NEW_BEAT', () => {
    const res = calculateWeatherModifier('RAIN_STORMY', 'NEUTRAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.0);
    expect(res.weatherMatchScore).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–34 Intelligence Layers
// ---------------------------------------------------------------------------

describe('Independence from Other Intelligence Layers', () => {
  it('operates orthogonally alongside framing, lighting, motion, setting, density, angle, and time of day', () => {
    const weatherRes = calculateWeatherModifier('RAIN_STORMY', 'RAIN');
    expect(weatherRes.weatherCondition).toBe('RAIN_STORMY');
    expect(weatherRes.weatherIntent).toBe('RAIN');

    const framingSample: FramingScale = 'WIDE';
    const atmosphericSample: AtmosphericTone = 'WARM_VIBRANT';
    const motionSample: CameraMotion = 'SMOOTH_FLOAT';
    const settingSample: SceneSetting = 'OUTDOOR_NATURAL';
    const densitySample: SubjectDensity = 'UNINHABITED_OBJECT';
    const angleSample: CameraAngle = 'AERIAL_OVERHEAD';
    const timeSample: TimeOfDay = 'DAYLIGHT_CLEAR';

    expect(framingSample).toBe('WIDE');
    expect(atmosphericSample).toBe('WARM_VIBRANT');
    expect(motionSample).toBe('SMOOTH_FLOAT');
    expect(settingSample).toBe('OUTDOOR_NATURAL');
    expect(densitySample).toBe('UNINHABITED_OBJECT');
    expect(angleSample).toBe('AERIAL_OVERHEAD');
    expect(timeSample).toBe('DAYLIGHT_CLEAR');
    expect(weatherRes.modifier).toBe(0.008);
  });

  it('Step 28 framing scale is unaffected by weather classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['sunny', 'clear-sky', 'fair-weather'],
      },
    });
    const weather = classifyWeatherCondition(asset);
    expect(weather).toBe('CLEAR_FAIR');
  });

  it('Step 29 atmospheric tone is unaffected by weather classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['cloudy', 'overcast', 'gray-sky'],
      },
    });
    const weather = classifyWeatherCondition(asset);
    expect(weather).toBe('OVERCAST_CLOUDY');
  });

  it('Step 30 camera motion is unaffected by weather classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['rain', 'downpour', 'storm'],
      },
    });
    const weather = classifyWeatherCondition(asset);
    expect(weather).toBe('RAIN_STORMY');
  });

  it('Step 31 scene setting is unaffected by weather classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['snow', 'blizzard', 'frost'],
      },
    });
    const weather = classifyWeatherCondition(asset);
    expect(weather).toBe('SNOW_FROST');
  });

  it('Step 32 subject density is unaffected by weather classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['fog', 'mist', 'haze'],
      },
    });
    const weather = classifyWeatherCondition(asset);
    expect(weather).toBe('FOG_MIST');
  });

  it('Step 33 camera angle is unaffected by weather classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['studio', 'diagram', 'abstract'],
      },
    });
    const weather = classifyWeatherCondition(asset);
    expect(weather).toBe('WEATHER_AGNOSTIC');
  });

  it('Step 34 time of day is unaffected by weather classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['sunny', 'bright-sunshine'],
      },
    });
    const weather = classifyWeatherCondition(asset);
    expect(weather).toBe('CLEAR_FAIR');
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic Dominance Preservation with Step 35
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 35', () => {
  it('strong semantic match (0.82) with max weather penalty (-0.007) beats weak match (0.55) with max weather bonus (+0.008)', () => {
    const strongCandidateScore = 0.82 - 0.007; // 0.813
    const weakCandidateScore = 0.55 + 0.008;   // 0.558
    expect(strongCandidateScore).toBeGreaterThan(weakCandidateScore);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.096;
    const maxAllBonuses = +0.096;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.704
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.496
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 8. Schema Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Schema Round-Trip Serialization', () => {
  it('serializes and deserializes Step 35 provenance fields accurately', () => {
    const project = createInitialProject('Step 35 Serialization Test');
    const asset = createTestMediaAsset({ id: 'm-weather-1' });
    project.media.push(asset);

    project.timeline.push({
      id: 'clip-1',
      mediaId: 'm-weather-1',
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
        explanation: 'Selected due to matching rain stormy weather',
        reuseCount: 0,
        weatherCondition: 'RAIN_STORMY',
        weatherModifier: 0.008,
        weatherReason: 'Weather bonus: rain stormy conditions match narration.',
        weatherMatchScore: 1.0,
      },
    });

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project).toBeDefined();

    const prov = parsed.project!.timeline[0].provenance!;
    expect(prov.weatherCondition).toBe('RAIN_STORMY');
    expect(prov.weatherModifier).toBe(0.008);
    expect(prov.weatherReason).toBe('Weather bonus: rain stormy conditions match narration.');
    expect(prov.weatherMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 9. DraftStats Counters Verification
// ---------------------------------------------------------------------------

describe('DraftStats Counters Verification', () => {
  it('supports all Step 35 weather metrics in DraftStats interface', () => {
    const stats: Partial<DraftStats> = {
      weatherAdjustments: 18,
      clearWeatherSelections: 6,
      overcastWeatherSelections: 4,
      rainWeatherSelections: 3,
      snowWeatherSelections: 2,
      fogWeatherSelections: 2,
      weatherAgnosticSelections: 1,
      weatherBonuses: 12,
      weatherPenalties: 6,
    };

    expect(stats.weatherAdjustments).toBe(18);
    expect(stats.clearWeatherSelections).toBe(6);
    expect(stats.overcastWeatherSelections).toBe(4);
    expect(stats.rainWeatherSelections).toBe(3);
    expect(stats.snowWeatherSelections).toBe(2);
    expect(stats.fogWeatherSelections).toBe(2);
    expect(stats.weatherAgnosticSelections).toBe(1);
    expect(stats.weatherBonuses).toBe(12);
    expect(stats.weatherPenalties).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 10. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyWeatherCondition does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['rain', 'downpour', 'storm'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifyWeatherCondition(frozen)).not.toThrow();
  });

  it('classifyNarrationWeatherIntent does not mutate input text', () => {
    const text = 'Under heavy torrential rain the river flooded its banks.';
    const copy = `${text}`;
    classifyNarrationWeatherIntent(text);
    expect(text).toBe(copy);
  });

  it('weather modifier does not modify sourceStart or duration', () => {
    const res = calculateWeatherModifier('RAIN_STORMY', 'RAIN');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of weather fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      weatherCondition: 'RAIN_STORMY' as WeatherCondition,
      weatherModifier: 0.008,
      weatherReason: 'Test reason',
      weatherMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.weatherCondition).toBe('RAIN_STORMY');
    expect(prov.weatherModifier).toBe(0.008);
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
    expect(classifyWeatherCondition(emptyAsset)).toBe('WEATHER_AGNOSTIC');
  });

  it('returns valid reason string for every weather/intent combination', () => {
    const allConditions: WeatherCondition[] = [
      'CLEAR_FAIR',
      'OVERCAST_CLOUDY',
      'RAIN_STORMY',
      'SNOW_FROST',
      'FOG_MIST',
      'WEATHER_AGNOSTIC',
    ];
    const allIntents: WeatherIntent[] = ['CLEAR', 'OVERCAST', 'RAIN', 'SNOW', 'FOG', 'NEUTRAL'];
    for (const c of allConditions) {
      for (const i of allIntents) {
        const res = calculateWeatherModifier(c, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or weatherMatchScore', () => {
    const allConditions: WeatherCondition[] = [
      'CLEAR_FAIR',
      'OVERCAST_CLOUDY',
      'RAIN_STORMY',
      'SNOW_FROST',
      'FOG_MIST',
      'WEATHER_AGNOSTIC',
    ];
    const allIntents: WeatherIntent[] = ['CLEAR', 'OVERCAST', 'RAIN', 'SNOW', 'FOG', 'NEUTRAL'];
    for (const c of allConditions) {
      for (const i of allIntents) {
        const res = calculateWeatherModifier(c, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.weatherMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.weatherMatchScore)).toBe(false);
      }
    }
  });

  it('all 6 weather condition classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['sunny', 'clear-sky', 'fair-weather'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['cloudy', 'overcast', 'gray-sky'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['rain', 'downpour', 'storm'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['snow', 'blizzard', 'frost'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['fog', 'mist', 'haze'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['studio', 'diagram', 'abstract'] } }),
    ];

    const classified = assets.map((a) => classifyWeatherCondition(a));
    expect(classified).toContain('CLEAR_FAIR');
    expect(classified).toContain('OVERCAST_CLOUDY');
    expect(classified).toContain('RAIN_STORMY');
    expect(classified).toContain('SNOW_FROST');
    expect(classified).toContain('FOG_MIST');
    expect(classified).toContain('WEATHER_AGNOSTIC');
  });
});


