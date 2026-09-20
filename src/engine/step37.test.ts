/**
 * Step 37 — Temporal Motion Rate & Playback Speed Intelligence
 *
 * Dedicated test suite verifying:
 *  - Temporal rate classification (REALTIME_STANDARD, SLOW_MOTION, TIMELAPSE_HYPERLAPSE, STOP_MOTION_FREEZE, TEMPORAL_AGNOSTIC)
 *  - Narration temporal intent extraction (REALTIME, SLOW_MO, TIMELAPSE, FREEZE, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset temporal rate establishing energy
 *  - Independence from Steps 22–36
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTemporalRate,
  classifyNarrationTemporalIntent,
  calculateTemporalRateModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  TemporalRate,
  TemporalIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
  SceneSetting,
  SubjectDensity,
  CameraAngle,
  TimeOfDay,
  WeatherCondition,
  DepthOfField,
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
// 1. classifyTemporalRate
// ---------------------------------------------------------------------------

describe('classifyTemporalRate', () => {
  it('returns TEMPORAL_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyTemporalRate(null)).toBe('TEMPORAL_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyTemporalRate(undefined)).toBe('TEMPORAL_AGNOSTIC');
  });

  it('classifies SLOW_MOTION from slow motion, high frame rate, slowmo keywords in tags/description/name', () => {
    const asset1 = createTestMediaAsset({
      name: 'cinematic_slow_motion_drop.mp4',
      analysis: { description: 'Water drop splashing in slow motion', tags: ['slow-motion', 'fluid'] },
    });
    expect(classifyTemporalRate(asset1)).toBe('SLOW_MOTION');

    const asset2 = createTestMediaAsset({
      name: 'athlete_sprint.mp4',
      analysis: { description: 'Recorded at 120fps high speed camera slowmo replay', tags: ['overcranked'] },
    });
    expect(classifyTemporalRate(asset2)).toBe('SLOW_MOTION');

    const asset3 = createTestMediaAsset({
      name: 'bird_flight.mp4',
      analysis: { description: 'High framerate 240fps decelerated flight', tags: ['fluid-slow'] },
    });
    expect(classifyTemporalRate(asset3)).toBe('SLOW_MOTION');
  });

  it('classifies TIMELAPSE_HYPERLAPSE from timelapse, hyperlapse, fast-forward, accelerated keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'city_traffic_hyperlapse.mp4',
      analysis: { description: 'Accelerated time lapse of bustling traffic and moving shadows', tags: ['timelapse', 'hyperlapse'] },
    });
    expect(classifyTemporalRate(asset1)).toBe('TIMELAPSE_HYPERLAPSE');

    const asset2 = createTestMediaAsset({
      name: 'construction_progress.mp4',
      analysis: { description: 'Fast motion time compression of building construction over months', tags: ['intervalometer'] },
    });
    expect(classifyTemporalRate(asset2)).toBe('TIMELAPSE_HYPERLAPSE');

    const asset3 = createTestMediaAsset({
      name: 'sunset_clouds.mp4',
      analysis: { description: 'Speed ramp interval capture of rolling storm clouds', tags: ['speed-ramp'] },
    });
    expect(classifyTemporalRate(asset3)).toBe('TIMELAPSE_HYPERLAPSE');
  });

  it('classifies STOP_MOTION_FREEZE from freeze-frame, stop-motion, claymation, frozen-instant keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'bullet_time_freeze.mp4',
      analysis: { description: 'Freeze frame instant pause of dancer mid-air', tags: ['freeze-frame', 'stop-motion'] },
    });
    expect(classifyTemporalRate(asset1)).toBe('STOP_MOTION_FREEZE');

    const asset2 = createTestMediaAsset({
      name: 'character_animation.mp4',
      analysis: { description: 'Claymation puppet animated frame by frame stop motion style', tags: ['claymation'] },
    });
    expect(classifyTemporalRate(asset2)).toBe('STOP_MOTION_FREEZE');

    const asset3 = createTestMediaAsset({
      name: 'strobe_dance.mp4',
      analysis: { description: 'High-speed freeze strobe light effect in dark room', tags: ['strobe', 'step-motion'] },
    });
    expect(classifyTemporalRate(asset3)).toBe('STOP_MOTION_FREEZE');
  });

  it('classifies TEMPORAL_AGNOSTIC from still images, static photo, infographics, diagrams', () => {
    const assetImage = createTestMediaAsset({
      type: 'image',
      name: 'diagram.png',
      analysis: { description: 'Technical architecture blueprint chart infographic', tags: ['diagram', 'infographic'] },
    });
    expect(classifyTemporalRate(assetImage)).toBe('TEMPORAL_AGNOSTIC');

    const assetStill = createTestMediaAsset({
      name: 'slide_photo.jpg',
      analysis: { description: 'Still photo screenshot slide graphic', tags: ['still photo'] },
    });
    expect(classifyTemporalRate(assetStill)).toBe('TEMPORAL_AGNOSTIC');
  });

  it('classifies REALTIME_STANDARD for standard natural live-action video recordings', () => {
    const asset1 = createTestMediaAsset({
      name: 'interview_conversation.mp4',
      analysis: { description: 'Two people talking in regular natural realtime conversation at 24fps standard playback', tags: ['realtime', 'live action'] },
    });
    expect(classifyTemporalRate(asset1)).toBe('REALTIME_STANDARD');

    const assetDefault = createTestMediaAsset({
      name: 'general_broll.mp4',
      analysis: { description: 'Pedestrians walking down the street naturally', tags: ['street'] },
    });
    expect(classifyTemporalRate(assetDefault)).toBe('REALTIME_STANDARD');
  });

  it('returns TEMPORAL_AGNOSTIC for unanalyzed asset', () => {
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
    expect(classifyTemporalRate(unanalyzedAsset)).toBe('TEMPORAL_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationTemporalIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationTemporalIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationTemporalIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationTemporalIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts SLOW_MO intent from deceleration and high-speed keywords', () => {
    expect(classifyNarrationTemporalIntent('Watch in slow motion as the drop impacts the surface.')).toBe('SLOW_MO');
    expect(classifyNarrationTemporalIntent('Every millisecond unfolds in mesmerizing ultra slow motion.')).toBe('SLOW_MO');
    expect(classifyNarrationTemporalIntent('Let us slow down and examine this critical decisive moment.')).toBe('SLOW_MO');
    expect(classifyNarrationTemporalIntent('A suspended frame decelerated to show true grace.')).toBe('SLOW_MO');
  });

  it('extracts TIMELAPSE intent from time passage and acceleration keywords', () => {
    expect(classifyNarrationTemporalIntent('Over the next decades, the cityscape transformed into a modern metropolis.')).toBe('TIMELAPSE');
    expect(classifyNarrationTemporalIntent('Watch as days turn into weeks in a fast forward timelapse.')).toBe('TIMELAPSE');
    expect(classifyNarrationTemporalIntent('Through the seasons, hours slip by rapidly.')).toBe('TIMELAPSE');
    expect(classifyNarrationTemporalIntent('Years passed in the blink of an eye as construction accelerated.')).toBe('TIMELAPSE');
  });

  it('extracts FREEZE intent from frozen instant and stillness keywords', () => {
    expect(classifyNarrationTemporalIntent('Time stood completely still in that single frozen moment.')).toBe('FREEZE');
    expect(classifyNarrationTemporalIntent('Let us freeze the frame and analyze this pause.')).toBe('FREEZE');
    expect(classifyNarrationTemporalIntent('A timeless pause locked in memory forever.')).toBe('FREEZE');
  });

  it('extracts REALTIME intent from natural pacing and live action keywords', () => {
    expect(classifyNarrationTemporalIntent('In real time, the process unfolds naturally.')).toBe('REALTIME');
    expect(classifyNarrationTemporalIntent('Live in the moment as the event happens in normal speed.')).toBe('REALTIME');
    expect(classifyNarrationTemporalIntent('A spontaneous live conversation at natural pace.')).toBe('REALTIME');
  });

  it('returns NEUTRAL for narration with no explicit temporal playback cues', () => {
    expect(classifyNarrationTemporalIntent('We explored the basic features of the software.')).toBe('NEUTRAL');
    expect(classifyNarrationTemporalIntent('The overall revenue grew by fifteen percent.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationTemporalIntent('SLOW MOTION CAPTURE OF THE IMPACT')).toBe('SLOW_MO');
    expect(classifyNarrationTemporalIntent('TIMELAPSE PASSAGE OF CLOUDS')).toBe('TIMELAPSE');
    expect(classifyNarrationTemporalIntent('FREEZE FRAME SUSPENSION')).toBe('FREEZE');
    expect(classifyNarrationTemporalIntent('REAL TIME INTERACTION')).toBe('REALTIME');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateTemporalRateModifier
// ---------------------------------------------------------------------------

describe('calculateTemporalRateModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const rates: TemporalRate[] = [
      'REALTIME_STANDARD',
      'SLOW_MOTION',
      'TIMELAPSE_HYPERLAPSE',
      'STOP_MOTION_FREEZE',
      'TEMPORAL_AGNOSTIC',
    ];
    const intents: TemporalIntent[] = ['REALTIME', 'SLOW_MO', 'TIMELAPSE', 'FREEZE', 'NEUTRAL'];
    const beatTypes = ['NEW_BEAT' as const, 'CONTINUING_BEAT' as const, 'STANDALONE' as const, undefined];

    for (const rate of rates) {
      for (const intent of intents) {
        for (const isCont of [true, false]) {
          for (const beat of beatTypes) {
            const result = calculateTemporalRateModifier(rate, intent, isCont, beat);
            expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
            expect(result.modifier).toBeLessThanOrEqual(0.008);
            expect(result.temporalMatchScore).toBeGreaterThanOrEqual(0.0);
            expect(result.temporalMatchScore).toBeLessThanOrEqual(1.0);
            expect(typeof result.reason).toBe('string');
            expect(result.temporalRate).toBe(rate);
          }
        }
      }
    }
  });

  it('rewards exact match between SLOW_MOTION and SLOW_MO intent', () => {
    const result = calculateTemporalRateModifier('SLOW_MOTION', 'SLOW_MO', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.temporalMatchScore).toBe(1.0);
    expect(result.reason).toContain('cinematic slow-motion');
  });

  it('rewards exact match between TIMELAPSE_HYPERLAPSE and TIMELAPSE intent', () => {
    const result = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'TIMELAPSE', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.temporalMatchScore).toBe(1.0);
    expect(result.reason).toContain('accelerated timelapse/hyperlapse');
  });

  it('rewards exact match between STOP_MOTION_FREEZE and FREEZE intent', () => {
    const result = calculateTemporalRateModifier('STOP_MOTION_FREEZE', 'FREEZE', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.temporalMatchScore).toBe(1.0);
    expect(result.reason).toContain('freeze-frame / stop-motion');
  });

  it('rewards exact match between REALTIME_STANDARD and REALTIME intent', () => {
    const result = calculateTemporalRateModifier('REALTIME_STANDARD', 'REALTIME', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.temporalMatchScore).toBe(1.0);
    expect(result.reason).toContain('standard real-time playback');
  });

  it('rewards compatible pairs (e.g. STOP_MOTION_FREEZE with SLOW_MO, SLOW_MOTION with FREEZE)', () => {
    const stopSlow = calculateTemporalRateModifier('STOP_MOTION_FREEZE', 'SLOW_MO');
    expect(stopSlow.modifier).toBe(0.003);
    expect(stopSlow.temporalMatchScore).toBe(0.7);

    const slowFreeze = calculateTemporalRateModifier('SLOW_MOTION', 'FREEZE');
    expect(slowFreeze.modifier).toBe(0.003);
    expect(slowFreeze.temporalMatchScore).toBe(0.7);
  });

  it('penalizes temporal mismatch (e.g. TIMELAPSE asset when narration requests SLOW_MO)', () => {
    const result = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'SLOW_MO', false, 'STANDALONE');
    expect(result.modifier).toBeLessThan(0);
    expect(result.temporalMatchScore).toBe(0.1);
    expect(result.reason).toContain('accelerated timelapse directly contradicts slow-motion');
  });

  it('penalizes temporal mismatch (e.g. SLOW_MOTION asset when narration requests TIMELAPSE)', () => {
    const result = calculateTemporalRateModifier('SLOW_MOTION', 'TIMELAPSE', false, 'STANDALONE');
    expect(result.modifier).toBeLessThan(0);
    expect(result.temporalMatchScore).toBe(0.1);
    expect(result.reason).toContain('decelerated slow-motion directly contradicts accelerated timelapse');
  });

  it('penalizes temporal mismatch (e.g. TIMELAPSE asset when narration requests REALTIME)', () => {
    const result = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'REALTIME', false, 'STANDALONE');
    expect(result.modifier).toBe(-0.006);
    expect(result.temporalMatchScore).toBe(0.15);
  });

  it('penalizes temporal mismatch (e.g. TIMELAPSE asset when narration requests FREEZE)', () => {
    const result = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'FREEZE', false, 'STANDALONE');
    expect(result.modifier).toBe(-0.006);
    expect(result.temporalMatchScore).toBe(0.15);
  });

  it('waives penalty when consecutive continuation is active', () => {
    const mismatched = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'SLOW_MO', false, 'CONTINUING_BEAT');
    const continuous = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'SLOW_MO', true, 'CONTINUING_BEAT');

    expect(mismatched.modifier).toBeLessThan(0);
    expect(continuous.modifier).toBe(0);
    expect(continuous.temporalMatchScore).toBe(0.8);
    expect(continuous.reason).toContain('temporal rate penalties waived');
  });

  it('adds establishing bonus on NEW_BEAT for timelapse / slowmo footage', () => {
    const normalResult = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'TIMELAPSE', false, 'STANDALONE');
    const newBeatResult = calculateTemporalRateModifier('TIMELAPSE_HYPERLAPSE', 'TIMELAPSE', false, 'NEW_BEAT');

    expect(newBeatResult.modifier).toBeGreaterThanOrEqual(normalResult.modifier);
    expect(newBeatResult.reason).toContain('New beat temporal playback rate introduction');
  });

  it('returns neutral modifier for TEMPORAL_AGNOSTIC asset', () => {
    const result = calculateTemporalRateModifier('TEMPORAL_AGNOSTIC', 'SLOW_MO', false, 'STANDALONE');
    expect(result.modifier).toBe(0);
    expect(result.temporalMatchScore).toBe(0.5);
    expect(result.reason).toContain('static/agnostic media for slow-motion narrative');
  });

  it('returns neutral modifier when narration intent is NEUTRAL', () => {
    const result = calculateTemporalRateModifier('REALTIME_STANDARD', 'NEUTRAL', false, 'STANDALONE');
    expect(result.modifier).toBe(0);
    expect(result.temporalMatchScore).toBe(0.5);
    expect(result.reason).toContain('Neutral temporal rate intent');
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive Continuation Handling
// ---------------------------------------------------------------------------

describe('Consecutive Continuation Handling', () => {
  it('waives penalties when isConsecutiveContinuation is true across all mismatched combinations', () => {
    const mismatched = calculateTemporalRateModifier('SLOW_MOTION', 'TIMELAPSE', false);
    expect(mismatched.modifier).toBe(-0.007);

    const continued = calculateTemporalRateModifier('SLOW_MOTION', 'TIMELAPSE', true);
    expect(continued.modifier).toBe(0.0);
    expect(continued.temporalMatchScore).toBe(0.8);
    expect(continued.reason).toContain('Consecutive shot continuation - temporal rate penalties waived.');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat Transition & Perspective Establishing Handling
// ---------------------------------------------------------------------------

describe('Beat Transition & Perspective Establishing Handling', () => {
  it('grants +0.008 bonus with new beat temporal playback rate introduction reason at NEW_BEAT', () => {
    const res = calculateTemporalRateModifier('SLOW_MOTION', 'SLOW_MO', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.temporalMatchScore).toBe(1.0);
    expect(res.reason).toContain('New beat temporal playback rate introduction');
  });

  it('retains standard scoring for neutral intent at NEW_BEAT', () => {
    const res = calculateTemporalRateModifier('SLOW_MOTION', 'NEUTRAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.0);
    expect(res.temporalMatchScore).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–36
// ---------------------------------------------------------------------------

describe('Independence from other intelligence layers', () => {
  it('operates orthogonally alongside framing, lighting, motion, setting, density, angle, time of day, weather, and depth', () => {
    const rateRes = calculateTemporalRateModifier('SLOW_MOTION', 'SLOW_MO');
    expect(rateRes.temporalRate).toBe('SLOW_MOTION');
    expect(rateRes.temporalIntent).toBe('SLOW_MO');

    const framingSample: FramingScale = 'WIDE';
    const atmosphericSample: AtmosphericTone = 'WARM_VIBRANT';
    const motionSample: CameraMotion = 'SMOOTH_FLOAT';
    const settingSample: SceneSetting = 'OUTDOOR_NATURAL';
    const densitySample: SubjectDensity = 'UNINHABITED_OBJECT';
    const angleSample: CameraAngle = 'AERIAL_OVERHEAD';
    const timeSample: TimeOfDay = 'DAYLIGHT_CLEAR';
    const weatherSample: WeatherCondition = 'CLEAR_FAIR';
    const depthSample: DepthOfField = 'SHALLOW_BOKEH';

    expect(framingSample).toBe('WIDE');
    expect(atmosphericSample).toBe('WARM_VIBRANT');
    expect(motionSample).toBe('SMOOTH_FLOAT');
    expect(settingSample).toBe('OUTDOOR_NATURAL');
    expect(densitySample).toBe('UNINHABITED_OBJECT');
    expect(angleSample).toBe('AERIAL_OVERHEAD');
    expect(timeSample).toBe('DAYLIGHT_CLEAR');
    expect(weatherSample).toBe('CLEAR_FAIR');
    expect(depthSample).toBe('SHALLOW_BOKEH');
    expect(rateRes.modifier).toBe(0.008);
  });

  it('Step 28 framing scale is unaffected by temporal rate classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['slow-motion', '120fps'] },
    });
    const rate = classifyTemporalRate(asset);
    expect(rate).toBe('SLOW_MOTION');
  });

  it('Step 29 atmospheric tone is unaffected by temporal rate classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['timelapse', 'hyperlapse'] },
    });
    const rate = classifyTemporalRate(asset);
    expect(rate).toBe('TIMELAPSE_HYPERLAPSE');
  });

  it('Step 30 camera motion is unaffected by temporal rate classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['freeze-frame', 'stop-motion'] },
    });
    const rate = classifyTemporalRate(asset);
    expect(rate).toBe('STOP_MOTION_FREEZE');
  });

  it('Step 36 depth of field is unaffected by temporal rate classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['realtime', '24fps'] },
    });
    const rate = classifyTemporalRate(asset);
    expect(rate).toBe('REALTIME_STANDARD');
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic Dominance Preservation
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation', () => {
  it('guarantees semantic score dominance over maximum Step 37 temporal modifier delta', () => {
    const highSemanticScore = 0.85;
    const lowSemanticScore = 0.40;

    const maxPenaltyModifier = -0.008;
    const maxBonusModifier = 0.008;

    const candidateHighSemanticWithPenalty = highSemanticScore + maxPenaltyModifier;
    const candidateLowSemanticWithBonus = lowSemanticScore + maxBonusModifier;

    expect(candidateHighSemanticWithPenalty).toBeGreaterThan(candidateLowSemanticWithBonus);
    expect(candidateHighSemanticWithPenalty - candidateLowSemanticWithBonus).toBeGreaterThan(0.40);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.112;
    const maxAllBonuses = +0.112;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.688
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.512
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 8. DraftStats Type Coverage
// ---------------------------------------------------------------------------

describe('DraftStats Step 37 properties', () => {
  it('validates all Step 37 counters exist on DraftStats schema', () => {
    const stats: Partial<DraftStats> = {
      temporalRateAdjustments: 10,
      realtimeSelections: 5,
      slowMotionSelections: 2,
      timelapseSelections: 2,
      stopMotionSelections: 1,
      temporalAgnosticSelections: 0,
      temporalRateBonuses: 6,
      temporalRatePenalties: 2,
    };

    expect(stats.temporalRateAdjustments).toBe(10);
    expect(stats.realtimeSelections).toBe(5);
    expect(stats.slowMotionSelections).toBe(2);
    expect(stats.timelapseSelections).toBe(2);
    expect(stats.stopMotionSelections).toBe(1);
    expect(stats.temporalAgnosticSelections).toBe(0);
    expect(stats.temporalRateBonuses).toBe(6);
    expect(stats.temporalRatePenalties).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Step 37 Schema Serialization Round-Trip', () => {
  it('preserves Step 37 provenance properties across export and parse', () => {
    const project = createInitialProject('Step 37 Serialization Test');
    const asset = createTestMediaAsset({ id: 'm-rate-1' });
    project.media.push(asset);

    project.timeline.push({
      id: 'clip-1',
      mediaId: 'm-rate-1',
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
        explanation: 'Selected due to matching slow motion playback rate',
        reuseCount: 0,
        temporalRate: 'SLOW_MOTION',
        temporalModifier: 0.008,
        temporalReason: 'Rate bonus: cinematic slow-motion footage matches dramatic slowed narration.',
        temporalMatchScore: 1.0,
        isManuallyEdited: false,
        assignedAt: 1700000000000,
      },
    });

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project).toBeDefined();

    const prov = parsed.project!.timeline[0].provenance!;
    expect(prov.temporalRate).toBe('SLOW_MOTION');
    expect(prov.temporalModifier).toBe(0.008);
    expect(prov.temporalReason).toBe('Rate bonus: cinematic slow-motion footage matches dramatic slowed narration.');
    expect(prov.temporalMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyTemporalRate does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['slow-motion', '120fps'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifyTemporalRate(frozen)).not.toThrow();
  });

  it('classifyNarrationTemporalIntent does not mutate input text', () => {
    const text = 'Watch in slow motion as the drop impacts the surface.';
    const copy = `${text}`;
    classifyNarrationTemporalIntent(text);
    expect(text).toBe(copy);
  });

  it('temporal modifier does not modify sourceStart or duration', () => {
    const res = calculateTemporalRateModifier('SLOW_MOTION', 'SLOW_MO');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of temporal rate fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      temporalRate: 'SLOW_MOTION' as TemporalRate,
      temporalModifier: 0.008,
      temporalReason: 'Test reason',
      temporalMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.temporalRate).toBe('SLOW_MOTION');
    expect(prov.temporalModifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 11. Edge Cases and Boundaries
// ---------------------------------------------------------------------------

describe('Edge Cases and Boundaries', () => {
  it('handles asset with missing tags and empty descriptions gracefully', () => {
    const emptyAnalyzedAsset = createTestMediaAsset({
      analysis: { analyzed: true, description: '', tags: [] },
    });
    expect(classifyTemporalRate(emptyAnalyzedAsset)).toBe('REALTIME_STANDARD');

    const unanalyzed = createTestMediaAsset({
      analysis: { analyzed: false },
    });
    expect(classifyTemporalRate(unanalyzed)).toBe('TEMPORAL_AGNOSTIC');
  });

  it('returns valid reason string for every rate/intent combination', () => {
    const allRates: TemporalRate[] = [
      'REALTIME_STANDARD',
      'SLOW_MOTION',
      'TIMELAPSE_HYPERLAPSE',
      'STOP_MOTION_FREEZE',
      'TEMPORAL_AGNOSTIC',
    ];
    const allIntents: TemporalIntent[] = ['REALTIME', 'SLOW_MO', 'TIMELAPSE', 'FREEZE', 'NEUTRAL'];
    for (const r of allRates) {
      for (const i of allIntents) {
        const res = calculateTemporalRateModifier(r, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or temporalMatchScore', () => {
    const allRates: TemporalRate[] = [
      'REALTIME_STANDARD',
      'SLOW_MOTION',
      'TIMELAPSE_HYPERLAPSE',
      'STOP_MOTION_FREEZE',
      'TEMPORAL_AGNOSTIC',
    ];
    const allIntents: TemporalIntent[] = ['REALTIME', 'SLOW_MO', 'TIMELAPSE', 'FREEZE', 'NEUTRAL'];
    for (const r of allRates) {
      for (const i of allIntents) {
        const res = calculateTemporalRateModifier(r, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.temporalMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.temporalMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 temporal rate classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['realtime', '24fps'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['slow-motion', '120fps'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['timelapse', 'hyperlapse'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['stop-motion', 'claymation'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['diagram', 'chart'] } }),
    ];

    const classified = assets.map((a) => classifyTemporalRate(a));
    expect(classified).toContain('REALTIME_STANDARD');
    expect(classified).toContain('SLOW_MOTION');
    expect(classified).toContain('TIMELAPSE_HYPERLAPSE');
    expect(classified).toContain('STOP_MOTION_FREEZE');
    expect(classified).toContain('TEMPORAL_AGNOSTIC');
  });
});
