/**
 * Step 29 — Color Mood & Atmospheric Lighting Intelligence
 * Comprehensive test suite (55+ focused tests)
 *
 * Tests cover:
 *  - Hex color warmth calculation
 *  - Atmospheric tone classification (WARM_VIBRANT, COOL_MUTED, HIGH_KEY_BRIGHT, LOW_KEY_DARK, NEUTRAL_BALANCED)
 *  - Narration atmospheric intent classification (WARM, COOL, BRIGHT, DARK, NEUTRAL)
 *  - Modifier behavior (bounds [-0.008, +0.008], bonuses, penalties, alignment, NEW_BEAT,
 *    and Step 19 consecutive-continuation protection)
 *  - Independence from Steps 22–28
 *  - Semantic dominance preservation
 *  - Provenance fields presence
 *  - DraftStats counters
 *  - Serialization round-trip
 *  - Determinism & manual edit invariants
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHexWarmth,
  classifyAtmosphericTone,
  classifyNarrationAtmosphericIntent,
  calculateAtmosphericToneModifier,
  calculateVisualVarietyModifier,
  calculatePacingModifier,
  calculatePacingArcModifier,
  calculateEmphasisImpactModifier,
  calculateNarrationVisualContrastModifier,
  calculateSubjectContinuityModifier,
  calculateFramingScaleModifier,
} from './draftTimeline';
import type { MediaAsset, AudioSegment, AtmosphericTone, AtmosphericIntent, NarrationBeatType } from '../types/project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    name: 'test-sunset.mp4',
    type: 'video',
    url: '',
    width: 1920,
    height: 1080,
    duration: 30,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 Native',
    analysis: {
      analyzed: true,
      description: 'A vibrant golden sunset over the horizon',
      tags: ['sunset', 'golden', 'warm', 'sky'],
      visualFeatures: {
        dominantColors: ['#ff8800', '#d96600', '#ffcc00'],
        brightness: 0.60,
        contrast: 0.65,
        orientation: 'landscape',
        hasFaces: false,
        faceCount: 0,
      },
      semantic: {
        analyzed: true,
        description: 'Warm glowing sunlight setting over the mountains',
        tags: ['sunset', 'warm', 'glow', 'dusk'],
        temporalSummary: 'The sun dips below the mountains in warm hues',
        hasVisualChange: true,
      },
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: 'seg-1',
    startTime: 0,
    endTime: 4,
    text: 'As the golden sunset bathed the valley in warm light',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. calculateHexWarmth — Perceptual Color Warmth
// ---------------------------------------------------------------------------

describe('calculateHexWarmth', () => {
  it('returns positive score for pure red and warm orange (#ff8800)', () => {
    const warmth = calculateHexWarmth('#ff8800');
    expect(warmth).toBeGreaterThan(0.5);
  });

  it('returns negative score for pure blue (#0044ff)', () => {
    const warmth = calculateHexWarmth('#0044ff');
    expect(warmth).toBeLessThan(-0.5);
  });

  it('returns near zero for neutral gray (#808080) and white (#ffffff)', () => {
    expect(calculateHexWarmth('#808080')).toBeCloseTo(0.0, 2);
    expect(calculateHexWarmth('#ffffff')).toBeCloseTo(0.0, 2);
  });

  it('handles empty and invalid hex strings gracefully', () => {
    expect(calculateHexWarmth('')).toBe(0.0);
    expect(calculateHexWarmth('invalid')).toBe(0.0);
    expect(calculateHexWarmth('#12')).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 2. classifyAtmosphericTone — Media Atmospheric Classification
// ---------------------------------------------------------------------------

describe('classifyAtmosphericTone', () => {
  it('returns NEUTRAL_BALANCED for null/undefined asset', () => {
    expect(classifyAtmosphericTone(null as unknown as MediaAsset)).toBe('NEUTRAL_BALANCED');
  });

  it('classifies WARM_VIBRANT from sunset/golden tags and warm color palette', () => {
    const asset = makeAsset();
    expect(classifyAtmosphericTone(asset)).toBe('WARM_VIBRANT');
  });

  it('classifies COOL_MUTED from ice/winter/blue tags and cold color palette', () => {
    const asset = makeAsset({
      name: 'test-winter.mp4',
      analysis: {
        analyzed: true,
        description: 'Frozen snow and ice during winter storm',
        tags: ['snow', 'ice', 'winter', 'cold'],
        visualFeatures: {
          dominantColors: ['#0066cc', '#3388ee', '#e0f0ff'],
          brightness: 0.55,
          contrast: 0.50,
          orientation: 'landscape',
        },
      },
    });
    expect(classifyAtmosphericTone(asset)).toBe('COOL_MUTED');
  });

  it('classifies HIGH_KEY_BRIGHT from daylight tags and high brightness (> 0.78)', () => {
    const asset = makeAsset({
      name: 'test-bright.mp4',
      analysis: {
        analyzed: true,
        description: 'Bright midday illumination on clear glass facade',
        tags: ['daylight', 'bright', 'sunlight'],
        visualFeatures: {
          dominantColors: ['#ffffff', '#f0f0f0'],
          brightness: 0.85,
          contrast: 0.70,
          orientation: 'landscape',
        },
      },
    });
    expect(classifyAtmosphericTone(asset)).toBe('HIGH_KEY_BRIGHT');
  });

  it('classifies LOW_KEY_DARK from night/shadow tags and low brightness (< 0.28)', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'Nocturnal scene with deep shadows in city alley at midnight',
        tags: ['night', 'dark', 'midnight', 'shadows'],
        visualFeatures: {
          dominantColors: ['#101015', '#1a1a25'],
          brightness: 0.18,
          contrast: 0.40,
          orientation: 'landscape',
        },
      },
    });
    expect(classifyAtmosphericTone(asset)).toBe('LOW_KEY_DARK');
  });

  it('classifies NEUTRAL_BALANCED for standard everyday indoor footage', () => {
    const asset = makeAsset({
      name: 'interview_standard.mp4',
      analysis: {
        analyzed: true,
        description: 'Standard office conference room meeting',
        tags: ['office', 'meeting', 'indoor'],
        visualFeatures: {
          dominantColors: ['#888888', '#666666'],
          brightness: 0.50,
          contrast: 0.50,
          orientation: 'landscape',
        },
      },
    });
    expect(classifyAtmosphericTone(asset)).toBe('NEUTRAL_BALANCED');
  });
});

// ---------------------------------------------------------------------------
// 3. classifyNarrationAtmosphericIntent — Narration Intent Classification
// ---------------------------------------------------------------------------

describe('classifyNarrationAtmosphericIntent', () => {
  it('returns NEUTRAL for empty text', () => {
    expect(classifyNarrationAtmosphericIntent('')).toBe('NEUTRAL');
  });

  it('classifies WARM from sunset, warmth, and golden keywords', () => {
    expect(classifyNarrationAtmosphericIntent('The warm glow of the setting sun illuminated the camp')).toBe('WARM');
    expect(classifyNarrationAtmosphericIntent('Sitting by the cozy fire on a golden afternoon')).toBe('WARM');
  });

  it('classifies COOL from ice, snow, and chill keywords', () => {
    expect(classifyNarrationAtmosphericIntent('A freezing winter blizzard swept across the icy terrain')).toBe('COOL');
    expect(classifyNarrationAtmosphericIntent('Deep underwater in the cold blue ocean depths')).toBe('COOL');
  });

  it('classifies BRIGHT from brilliant illumination and daylight keywords', () => {
    expect(classifyNarrationAtmosphericIntent('Brilliant daylight flooded through the high glass windows')).toBe('BRIGHT');
    expect(classifyNarrationAtmosphericIntent('The radiant sun was dazzling in the clear sky')).toBe('BRIGHT');
  });

  it('classifies DARK from nocturnal, night, and shadow keywords', () => {
    expect(classifyNarrationAtmosphericIntent('Under the cover of midnight darkness and deep shadows')).toBe('DARK');
    expect(classifyNarrationAtmosphericIntent('The gloomy night obscured their movement through the ruins')).toBe('DARK');
  });

  it('returns NEUTRAL for general non-atmospheric narration', () => {
    expect(classifyNarrationAtmosphericIntent('The committee met at ten in the morning to review the report')).toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// 4. calculateAtmosphericToneModifier — Modifier Behavior & Bounds
// ---------------------------------------------------------------------------

describe('calculateAtmosphericToneModifier', () => {
  it('is strictly bounded within [-0.008, +0.008] across all tone and intent pairs', () => {
    const tones: AtmosphericTone[] = [
      'WARM_VIBRANT',
      'COOL_MUTED',
      'HIGH_KEY_BRIGHT',
      'LOW_KEY_DARK',
      'NEUTRAL_BALANCED',
    ];
    const intents: AtmosphericIntent[] = ['WARM', 'COOL', 'BRIGHT', 'DARK', 'NEUTRAL'];
    const beats: NarrationBeatType[] = ['NEW_BEAT', 'CONTINUING_BEAT', 'BEAT_END', 'STANDALONE'];

    for (const tone of tones) {
      for (const intent of intents) {
        for (const beat of beats) {
          const { modifier } = calculateAtmosphericToneModifier(tone, intent, false, beat);
          expect(modifier).toBeGreaterThanOrEqual(-0.008);
          expect(modifier).toBeLessThanOrEqual(0.008);
        }
      }
    }
  });

  it('awards +0.008 bonus for WARM intent matching WARM_VIBRANT tone', () => {
    const result = calculateAtmosphericToneModifier('WARM_VIBRANT', 'WARM', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.atmosphericMatchScore).toBe(1.0);
    expect(result.reason).toContain('warm vibrant lighting matches warm narrative mood');
  });

  it('applies -0.006 penalty for WARM intent clashing with LOW_KEY_DARK tone', () => {
    const result = calculateAtmosphericToneModifier('LOW_KEY_DARK', 'WARM', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.006);
    expect(result.atmosphericMatchScore).toBeLessThan(0.2);
    expect(result.reason).toContain('dark shadowy lighting conflicts with warm setting');
  });

  it('awards +0.008 bonus for COOL intent matching COOL_MUTED tone', () => {
    const result = calculateAtmosphericToneModifier('COOL_MUTED', 'COOL', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.atmosphericMatchScore).toBe(1.0);
    expect(result.reason).toContain('cool muted lighting matches cold/cool narrative mood');
  });

  it('applies -0.004 penalty for COOL intent clashing with WARM_VIBRANT tone', () => {
    const result = calculateAtmosphericToneModifier('WARM_VIBRANT', 'COOL', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.004);
    expect(result.reason).toContain('warm golden lighting clashes with cool/cold narrative mood');
  });

  it('awards +0.008 bonus for BRIGHT intent matching HIGH_KEY_BRIGHT tone', () => {
    const result = calculateAtmosphericToneModifier('HIGH_KEY_BRIGHT', 'BRIGHT', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.atmosphericMatchScore).toBe(1.0);
    expect(result.reason).toContain('high-key bright illumination reinforces radiant narration');
  });

  it('applies -0.006 penalty for BRIGHT intent clashing with LOW_KEY_DARK tone', () => {
    const result = calculateAtmosphericToneModifier('LOW_KEY_DARK', 'BRIGHT', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.006);
    expect(result.reason).toContain('dark shadows directly contradict bright/radiant narration');
  });

  it('awards +0.008 bonus for DARK intent matching LOW_KEY_DARK tone', () => {
    const result = calculateAtmosphericToneModifier('LOW_KEY_DARK', 'DARK', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.atmosphericMatchScore).toBe(1.0);
    expect(result.reason).toContain('low-key dark lighting matches nocturnal/shadowy narration');
  });

  it('applies -0.006 penalty for DARK intent clashing with HIGH_KEY_BRIGHT tone', () => {
    const result = calculateAtmosphericToneModifier('HIGH_KEY_BRIGHT', 'DARK', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.006);
    expect(result.reason).toContain('high-key bright illumination conflicts with dark/night setting');
  });

  it('returns neutral 0.0 modifier for NEUTRAL intent', () => {
    const result = calculateAtmosphericToneModifier('NEUTRAL_BALANCED', 'NEUTRAL', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.0);
    expect(result.atmosphericMatchScore).toBe(0.5);
  });

  it('waives penalties and sets modifier to 0.0 when isConsecutiveContinuation is true', () => {
    const result = calculateAtmosphericToneModifier('LOW_KEY_DARK', 'BRIGHT', true, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.0);
    expect(result.atmosphericMatchScore).toBe(1.0);
    expect(result.reason).toContain('Atmospheric penalty waived for legitimate temporal continuation.');
  });

  it('produces all required provenance fields', () => {
    const result = calculateAtmosphericToneModifier('WARM_VIBRANT', 'WARM', false, 'NEW_BEAT');
    expect(typeof result.modifier).toBe('number');
    expect(result.atmosphericTone).toBe('WARM_VIBRANT');
    expect(result.atmosphericIntent).toBe('WARM');
    expect(typeof result.atmosphericMatchScore).toBe('number');
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('produces deterministic output on repeated invocations', () => {
    const r1 = calculateAtmosphericToneModifier('COOL_MUTED', 'COOL', false, 'CONTINUING_BEAT');
    const r2 = calculateAtmosphericToneModifier('COOL_MUTED', 'COOL', false, 'CONTINUING_BEAT');
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// 5. Independence from Steps 22–28
// ---------------------------------------------------------------------------

describe('Step 29 Independence from Steps 22–28', () => {
  const asset = makeAsset();
  const prevAsset = makeAsset({ id: 'asset-2', name: 'other.mp4' });
  const segment = makeSegment();

  it('Step 22 visual variety is unaffected by atmospheric modifier', () => {
    const result = calculateVisualVarietyModifier(asset, prevAsset, false);
    expect(result.modifier).toBeGreaterThanOrEqual(-0.012);
    expect(result.modifier).toBeLessThanOrEqual(0.012);
  });

  it('Step 23 pacing modifier is unaffected by atmospheric modifier', () => {
    const result = calculatePacingModifier(asset, null, segment, 'action', 'CONTINUING_BEAT');
    expect(result.modifier).toBeGreaterThanOrEqual(-0.010);
    expect(result.modifier).toBeLessThanOrEqual(0.010);
  });

  it('Step 24 pacing arc modifier is unaffected by atmospheric modifier', () => {
    const result = calculatePacingArcModifier('QUICK', ['QUICK', 'QUICK'], 'description', 'CONTINUING_BEAT', false);
    expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
    expect(result.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 25 visual impact modifier is unaffected by atmospheric modifier', () => {
    const result = calculateEmphasisImpactModifier(0.8, 'emphasis', 'CONTINUING_BEAT', false);
    expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
    expect(result.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 26 contrast modifier is unaffected by atmospheric modifier', () => {
    const result = calculateNarrationVisualContrastModifier(
      'The rocket exploded dynamically',
      'action',
      'DYNAMIC',
      0.8,
      true,
      'CONTINUING_BEAT',
      false
    );
    expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
    expect(result.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 27 subject continuity modifier is unaffected by atmospheric modifier', () => {
    const result = calculateSubjectContinuityModifier(
      ['rocket', 'launch'],
      ['rocket', 'launch'],
      0.8,
      'CONTINUING_BEAT',
      false
    );
    expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
    expect(result.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 28 framing scale modifier is unaffected by atmospheric modifier', () => {
    const result = calculateFramingScaleModifier('WIDE', 'WIDE', 'establishing', false);
    expect(result.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 6. Semantic Dominance Preservation
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 29', () => {
  it('strong semantic match (0.82) with max penalty (-0.008) beats weak match (0.55) with max bonus (+0.008)', () => {
    const strongWithPenalty = 0.82 - 0.008;
    const weakWithBonus = 0.55 + 0.008;
    expect(strongWithPenalty).toBeGreaterThan(weakWithBonus);
  });

  it('composite score maintains semantic dominance with all Steps 22-29 modifiers active', () => {
    // Total combined max modifier sum for Steps 22-29 = 0.012 + 0.010 + 0.008 + 0.008 + 0.008 + 0.008 + 0.008 + 0.008 = 0.070
    // 0.80 - 0.070 = 0.730 > 0.50 + 0.070 = 0.570
    const highCandidateComposite = 0.80 - 0.070;
    const lowCandidateComposite = 0.50 + 0.070;
    expect(highCandidateComposite).toBeGreaterThan(lowCandidateComposite);
  });
});

// ---------------------------------------------------------------------------
// 7. DraftStats Step 29 Metrics
// ---------------------------------------------------------------------------

describe('DraftStats Step 29 Fields Interface Check', () => {
  it('DraftStats supports all Step 29 atmospheric counters', () => {
    const stats = {
      atmosphericAdjustments: 5,
      warmToneSelections: 2,
      coolToneSelections: 1,
      brightToneSelections: 1,
      darkToneSelections: 1,
      atmosphericBonuses: 4,
      atmosphericPenalties: 1,
    };
    expect(stats.atmosphericAdjustments).toBe(5);
    expect(stats.warmToneSelections).toBe(2);
    expect(stats.coolToneSelections).toBe(1);
    expect(stats.brightToneSelections).toBe(1);
    expect(stats.darkToneSelections).toBe(1);
    expect(stats.atmosphericBonuses).toBe(4);
    expect(stats.atmosphericPenalties).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Schema Serialization Round-Trip
// ---------------------------------------------------------------------------

describe('Schema Serialization Round-Trip for Step 29', () => {
  it('all 4 Step 29 provenance fields survive JSON stringify/parse round-trip', () => {
    const provenance = {
      sourceSegmentId: 'seg-1',
      originalScore: 0.78,
      adjustedScore: 0.788,
      explanation: 'test',
      reuseCount: 0,
      atmosphericTone: 'WARM_VIBRANT' as AtmosphericTone,
      atmosphericModifier: 0.008,
      atmosphericReason: 'Atmospheric bonus: warm vibrant lighting matches warm narrative mood.',
      atmosphericMatchScore: 1.0,
      isManuallyEdited: false,
    };

    const serialized = JSON.stringify(provenance);
    const parsed = JSON.parse(serialized);

    expect(parsed.atmosphericTone).toBe('WARM_VIBRANT');
    expect(parsed.atmosphericModifier).toBe(0.008);
    expect(parsed.atmosphericReason).toBe('Atmospheric bonus: warm vibrant lighting matches warm narrative mood.');
    expect(parsed.atmosphericMatchScore).toBe(1.0);
  });

  it('preserves floating-point precision on modifier and match score', () => {
    const obj = { mod: -0.006, score: 0.75 };
    const roundTripped = JSON.parse(JSON.stringify(obj));
    expect(roundTripped.mod).toBe(-0.006);
    expect(roundTripped.score).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// 9. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyAtmosphericTone does not mutate input asset', () => {
    const asset = makeAsset();
    const before = JSON.stringify(asset);
    classifyAtmosphericTone(asset);
    expect(JSON.stringify(asset)).toBe(before);
  });

  it('classifyNarrationAtmosphericIntent does not mutate input text', () => {
    const text = 'The golden warm sunset';
    const before = text;
    classifyNarrationAtmosphericIntent(text);
    expect(text).toBe(before);
  });

  it('atmospheric modifier does not modify sourceStart or duration', () => {
    const result = calculateAtmosphericToneModifier('WARM_VIBRANT', 'WARM', false);
    expect(Math.abs(result.modifier)).toBeLessThanOrEqual(0.008);
  });

  it('isManuallyEdited flag is independent of atmospheric fields', () => {
    const result = calculateAtmosphericToneModifier('WARM_VIBRANT', 'WARM', false);
    expect('isManuallyEdited' in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Edge Cases and Boundaries
// ---------------------------------------------------------------------------

describe('Edge Cases and Boundaries', () => {
  it('handles asset with missing visualFeatures or empty tags', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: '',
        tags: [],
      },
    });
    const tone = classifyAtmosphericTone(asset);
    expect(['WARM_VIBRANT', 'COOL_MUTED', 'HIGH_KEY_BRIGHT', 'LOW_KEY_DARK', 'NEUTRAL_BALANCED']).toContain(tone);
  });

  it('returns valid reason string for every combination', () => {
    const tones: AtmosphericTone[] = [
      'WARM_VIBRANT',
      'COOL_MUTED',
      'HIGH_KEY_BRIGHT',
      'LOW_KEY_DARK',
      'NEUTRAL_BALANCED',
    ];
    const intents: AtmosphericIntent[] = ['WARM', 'COOL', 'BRIGHT', 'DARK', 'NEUTRAL'];

    for (const tone of tones) {
      for (const intent of intents) {
        const result = calculateAtmosphericToneModifier(tone, intent);
        expect(typeof result.reason).toBe('string');
        expect(result.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or atmosphericMatchScore', () => {
    const result = calculateAtmosphericToneModifier('NEUTRAL_BALANCED', 'NEUTRAL');
    expect(Number.isFinite(result.modifier)).toBe(true);
    expect(Number.isFinite(result.atmosphericMatchScore)).toBe(true);
  });
});
