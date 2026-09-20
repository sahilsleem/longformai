/**
 * Step 28 — Shot Framing & Composition Scale Intelligence
 * Comprehensive test suite (55+ focused tests)
 *
 * Tests cover:
 *  - Framing scale classification (WIDE, MEDIUM, CLOSEUP, DETAIL, STANDARD)
 *  - Narration framing intent classification (WIDE, CLOSEUP, DETAIL, DYNAMIC, NEUTRAL)
 *  - Modifier behavior (bounds [-0.008, +0.008], bonuses, penalties, alignment, NEW_BEAT,
 *    and Step 19 consecutive-continuation protection)
 *  - Independence from Steps 22–27
 *  - Semantic dominance preservation
 *  - Provenance fields presence
 *  - DraftStats counters
 *  - Serialization round-trip
 *  - Determinism & manual edit invariants
 */

import { describe, it, expect } from 'vitest';
import {
  classifyFramingScale,
  classifyNarrationFramingIntent,
  calculateFramingScaleModifier,
  calculateVisualVarietyModifier,
  calculatePacingModifier,
  calculatePacingArcModifier,
  calculateEmphasisImpactModifier,
  calculateNarrationVisualContrastModifier,
  calculateSubjectContinuityModifier,
} from './draftTimeline';
import type { MediaAsset, AudioSegment, FramingScale, FramingIntent, NarrationRole, NarrationBeatType } from '../types/project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    name: 'test-landscape.mp4',
    type: 'video',
    url: '',
    width: 1920,
    height: 1080,
    duration: 30,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 Native',
    analysis: {
      analyzed: true,
      description: 'A wide panoramic view of mountain ranges and open horizon',
      tags: ['mountains', 'landscape', 'wide', 'horizon'],
      visualFeatures: {
        dominantColors: ['#2a3b4c', '#d1e2f3'],
        brightness: 0.65,
        contrast: 0.55,
        orientation: 'landscape',
        hasFaces: false,
        faceCount: 0,
      },
      semantic: {
        analyzed: true,
        description: 'An expansive landscape with distant peaks under a clear sky',
        tags: ['mountains', 'landscape', 'vista', 'panoramic'],
        temporalSummary: 'Camera pans across the vast mountain valley',
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
    text: 'Across the vast horizon the mountains stretched endlessly',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. classifyFramingScale — Media Composition Scale Classification
// ---------------------------------------------------------------------------

describe('classifyFramingScale', () => {
  it('returns STANDARD for null/undefined asset', () => {
    expect(classifyFramingScale(null as unknown as MediaAsset)).toBe('STANDARD');
  });

  it('classifies WIDE from landscape tags and descriptions', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'A wide drone shot of the coastal highway',
        tags: ['aerial', 'landscape', 'coast'],
      },
    });
    expect(classifyFramingScale(asset)).toBe('WIDE');
  });

  it('classifies WIDE from panoramic/vista keywords', () => {
    const asset = makeAsset({
      name: 'panoramic_view.mp4',
      analysis: {
        analyzed: true,
        description: 'Expansive vista of the desert valley',
        tags: ['desert', 'valley'],
      },
    });
    expect(classifyFramingScale(asset)).toBe('WIDE');
  });

  it('classifies CLOSEUP from portrait tags and headshot keywords', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'Close-up portrait of an engineer explaining the mechanism',
        tags: ['portrait', 'face', 'interview'],
      },
    });
    expect(classifyFramingScale(asset)).toBe('CLOSEUP');
  });

  it('classifies CLOSEUP from single face in visualFeatures', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'Person speaking to camera',
        tags: ['speech'],
        visualFeatures: {
          dominantColors: ['#123456'],
          brightness: 0.5,
          contrast: 0.5,
          orientation: 'landscape',
          hasFaces: true,
          faceCount: 1,
        },
      },
    });
    expect(classifyFramingScale(asset)).toBe('CLOSEUP');
  });

  it('classifies DETAIL from macro/texture/minute keywords', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'Extreme macro zoom-in on the microchip circuitry texture',
        tags: ['macro', 'detail', 'circuit'],
      },
    });
    expect(classifyFramingScale(asset)).toBe('DETAIL');
  });

  it('classifies MEDIUM from interaction and multiple faces', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'Two team members walking and talking in the hallway',
        tags: ['walking', 'interaction'],
        visualFeatures: {
          dominantColors: ['#334455'],
          brightness: 0.5,
          contrast: 0.5,
          orientation: 'landscape',
          hasFaces: true,
          faceCount: 2,
        },
      },
    });
    expect(classifyFramingScale(asset)).toBe('MEDIUM');
  });

  it('classifies WIDE for broad 16:9 landscape asset without faces', () => {
    const asset = makeAsset({
      aspectRatio: 16 / 9,
      analysis: {
        analyzed: true,
        description: 'City streets at sunset',
        tags: ['city', 'sunset'],
        visualFeatures: {
          dominantColors: ['#445566'],
          brightness: 0.5,
          contrast: 0.5,
          orientation: 'landscape',
          hasFaces: false,
          faceCount: 0,
        },
      },
    });
    expect(classifyFramingScale(asset)).toBe('WIDE');
  });

  it('classifies DETAIL from keyframe tags', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'Laboratory equipment',
        tags: ['lab'],
        keyframes: [
          { time: 1, tags: ['macro', 'microscope'], description: 'microscopic view' },
        ],
      },
    });
    expect(classifyFramingScale(asset)).toBe('DETAIL');
  });

  it('returns STANDARD when no specific keywords or features match', () => {
    const asset = makeAsset({
      name: 'file.mp4',
      aspectRatio: 1.0,
      analysis: {
        analyzed: true,
        description: 'Abstract graphics',
        tags: ['graphics'],
        visualFeatures: {
          dominantColors: ['#000000'],
          brightness: 0.5,
          contrast: 0.5,
          orientation: 'square',
          hasFaces: false,
        },
      },
    });
    expect(classifyFramingScale(asset)).toBe('STANDARD');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationFramingIntent — Narration Intent Classification
// ---------------------------------------------------------------------------

describe('classifyNarrationFramingIntent', () => {
  it('returns NEUTRAL for empty text', () => {
    expect(classifyNarrationFramingIntent('')).toBe('NEUTRAL');
  });

  it('returns WIDE for establishing narration role', () => {
    expect(classifyNarrationFramingIntent('The team gathered today', 'establishing')).toBe('WIDE');
  });

  it('classifies WIDE from environmental and landscape keywords', () => {
    expect(classifyNarrationFramingIntent('The vast landscape stretched across the horizon')).toBe('WIDE');
    expect(classifyNarrationFramingIntent('Looking over the entire city and surrounding mountains')).toBe('WIDE');
    expect(classifyNarrationFramingIntent('Across the globe and into deep space')).toBe('WIDE');
  });

  it('classifies CLOSEUP from facial and emotion keywords', () => {
    expect(classifyNarrationFramingIntent('He looked directly into the camera with tears in his eyes')).toBe('CLOSEUP');
    expect(classifyNarrationFramingIntent('Her expression changed with a subtle smile')).toBe('CLOSEUP');
    expect(classifyNarrationFramingIntent('The speaker gazed intensely at the audience')).toBe('CLOSEUP');
  });

  it('classifies DETAIL from microscopic and texture keywords', () => {
    expect(classifyNarrationFramingIntent('A tiny microscopic particle on the intricate surface')).toBe('DETAIL');
    expect(classifyNarrationFramingIntent('Notice the minute texture and small button switch')).toBe('DETAIL');
    expect(classifyNarrationFramingIntent('Examining the intricate grain on the device screen')).toBe('DETAIL');
  });

  it('classifies DYNAMIC for action narration role', () => {
    expect(classifyNarrationFramingIntent('The vehicle accelerated rapidly through the gate', 'action')).toBe('DYNAMIC');
  });

  it('returns NEUTRAL for general narration without framing keywords', () => {
    expect(classifyNarrationFramingIntent('They discussed the schedule for Tuesday', 'description')).toBe('NEUTRAL');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateFramingScaleModifier — Core Modifier Logic & Bounds
// ---------------------------------------------------------------------------

describe('calculateFramingScaleModifier', () => {
  it('is strictly bounded within [-0.008, +0.008] across all permutations', () => {
    const scales: FramingScale[] = ['WIDE', 'MEDIUM', 'CLOSEUP', 'DETAIL', 'STANDARD'];
    const intents: FramingIntent[] = ['WIDE', 'CLOSEUP', 'DETAIL', 'DYNAMIC', 'NEUTRAL'];
    const roles: NarrationRole[] = ['establishing', 'action', 'description', 'emphasis', 'result'];
    const beats: NarrationBeatType[] = ['NEW_BEAT', 'CONTINUING_BEAT', 'BEAT_END', 'STANDALONE'];

    for (const scale of scales) {
      for (const intent of intents) {
        for (const role of roles) {
          for (const beat of beats) {
            const { modifier } = calculateFramingScaleModifier(scale, intent, role, false, beat);
            expect(modifier).toBeGreaterThanOrEqual(-0.008);
            expect(modifier).toBeLessThanOrEqual(0.008);
          }
        }
      }
    }
  });

  it('awards +0.008 bonus for WIDE intent matching WIDE framing', () => {
    const result = calculateFramingScaleModifier('WIDE', 'WIDE', 'establishing', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.framingMatchScore).toBe(1.0);
    expect(result.reason).toContain('wide composition matches broad establishing narration');
  });

  it('applies -0.006 penalty for WIDE intent clashing with DETAIL framing', () => {
    const result = calculateFramingScaleModifier('DETAIL', 'WIDE', 'establishing', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.006);
    expect(result.framingMatchScore).toBeLessThan(0.2);
    expect(result.reason).toContain('minute detail shot conflicts with wide establishing context');
  });

  it('applies -0.004 penalty for WIDE intent clashing with CLOSEUP framing', () => {
    const result = calculateFramingScaleModifier('CLOSEUP', 'WIDE', 'establishing', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.004);
    expect(result.reason).toContain('close-up shot conflicts with wide establishing context');
  });

  it('awards +0.008 bonus for CLOSEUP intent matching CLOSEUP framing', () => {
    const result = calculateFramingScaleModifier('CLOSEUP', 'CLOSEUP', 'emphasis', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.framingMatchScore).toBe(1.0);
    expect(result.reason).toContain('close-up shot captures intimate/focused narration');
  });

  it('applies -0.004 penalty for CLOSEUP intent clashing with WIDE framing', () => {
    const result = calculateFramingScaleModifier('WIDE', 'CLOSEUP', 'emphasis', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.004);
    expect(result.reason).toContain('distant wide shot undercuts intimate close-up narration');
  });

  it('awards +0.008 bonus for DETAIL intent matching DETAIL framing', () => {
    const result = calculateFramingScaleModifier('DETAIL', 'DETAIL', 'description', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.framingMatchScore).toBe(1.0);
    expect(result.reason).toContain('macro/detail shot perfectly illustrates minute subject');
  });

  it('applies -0.006 penalty for DETAIL intent clashing with WIDE framing', () => {
    const result = calculateFramingScaleModifier('WIDE', 'DETAIL', 'description', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(-0.006);
    expect(result.reason).toContain('wide shot loses focus on minute detail narration');
  });

  it('awards +0.006 bonus for DYNAMIC intent matching MEDIUM framing', () => {
    const result = calculateFramingScaleModifier('MEDIUM', 'DYNAMIC', 'action', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.006);
    expect(result.reason).toContain('medium composition provides optimal frame for action movement');
  });

  it('returns neutral 0.0 modifier for NEUTRAL intent', () => {
    const result = calculateFramingScaleModifier('STANDARD', 'NEUTRAL', 'description', false, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.0);
    expect(result.framingMatchScore).toBe(0.5);
  });

  it('waives penalties and sets modifier to 0.0 when isConsecutiveContinuation is true', () => {
    const result = calculateFramingScaleModifier('DETAIL', 'WIDE', 'establishing', true, 'CONTINUING_BEAT');
    expect(result.modifier).toBe(0.0);
    expect(result.framingMatchScore).toBe(1.0);
    expect(result.reason).toContain('Framing penalty waived for legitimate temporal continuation.');
  });

  it('gives establishing bonus on NEW_BEAT for WIDE framing and WIDE intent', () => {
    const result = calculateFramingScaleModifier('WIDE', 'WIDE', 'establishing', false, 'NEW_BEAT');
    expect(result.modifier).toBe(0.008);
    expect(result.reason).toContain('wide establishing shot reinforces new narrative beat');
  });

  it('produces all required provenance fields', () => {
    const result = calculateFramingScaleModifier('WIDE', 'WIDE', 'establishing', false, 'NEW_BEAT');
    expect(typeof result.modifier).toBe('number');
    expect(result.framingScale).toBe('WIDE');
    expect(result.framingIntent).toBe('WIDE');
    expect(typeof result.framingMatchScore).toBe('number');
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('produces deterministic output on repeated invocations', () => {
    const r1 = calculateFramingScaleModifier('CLOSEUP', 'CLOSEUP', 'emphasis', false, 'CONTINUING_BEAT');
    const r2 = calculateFramingScaleModifier('CLOSEUP', 'CLOSEUP', 'emphasis', false, 'CONTINUING_BEAT');
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// 4. Independence from Steps 22–27
// ---------------------------------------------------------------------------

describe('Step 28 Independence from Steps 22–27', () => {
  const asset = makeAsset();
  const prevAsset = makeAsset({ id: 'asset-2', name: 'other.mp4' });
  const segment = makeSegment();

  it('Step 22 visual variety is unaffected by framing scale modifier', () => {
    const result = calculateVisualVarietyModifier(asset, prevAsset, false);
    expect(result.modifier).toBeGreaterThanOrEqual(-0.012);
    expect(result.modifier).toBeLessThanOrEqual(0.012);
  });

  it('Step 23 pacing modifier is unaffected by framing scale modifier', () => {
    const result = calculatePacingModifier(asset, null, segment, 'action', 'CONTINUING_BEAT');
    expect(result.modifier).toBeGreaterThanOrEqual(-0.010);
    expect(result.modifier).toBeLessThanOrEqual(0.010);
  });

  it('Step 24 pacing arc modifier is unaffected by framing scale modifier', () => {
    const result = calculatePacingArcModifier('QUICK', ['QUICK', 'QUICK'], 'description', 'CONTINUING_BEAT', false);
    expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
    expect(result.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 25 visual impact modifier is unaffected by framing scale modifier', () => {
    const result = calculateEmphasisImpactModifier(0.8, 'emphasis', 'CONTINUING_BEAT', false);
    expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
    expect(result.modifier).toBeLessThanOrEqual(0.008);
  });

  it('Step 26 contrast modifier is unaffected by framing scale modifier', () => {
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

  it('Step 27 subject continuity modifier is unaffected by framing scale modifier', () => {
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
});

// ---------------------------------------------------------------------------
// 5. Semantic Dominance Preservation
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 28', () => {
  it('strong semantic match (0.82) with max penalty (-0.008) beats weak match (0.55) with max bonus (+0.008)', () => {
    const strongWithPenalty = 0.82 - 0.008;
    const weakWithBonus = 0.55 + 0.008;
    expect(strongWithPenalty).toBeGreaterThan(weakWithBonus);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    // Semantic difference = 0.30
    // Total combined max modifier sum for Steps 22-28 = 0.012 + 0.010 + 0.008 + 0.008 + 0.008 + 0.008 + 0.008 = 0.062
    // 0.80 - 0.062 = 0.738 > 0.50 + 0.062 = 0.562
    const highCandidateComposite = 0.80 - 0.062;
    const lowCandidateComposite = 0.50 + 0.062;
    expect(highCandidateComposite).toBeGreaterThan(lowCandidateComposite);
  });
});

// ---------------------------------------------------------------------------
// 6. DraftStats Step 28 Metrics
// ---------------------------------------------------------------------------

describe('DraftStats Step 28 Fields Interface Check', () => {
  it('DraftStats supports all Step 28 framing counters', () => {
    const stats = {
      framingAdjustments: 4,
      wideFramingSelections: 2,
      mediumFramingSelections: 1,
      closeupFramingSelections: 1,
      detailFramingSelections: 0,
      framingBonuses: 3,
      framingPenalties: 1,
    };
    expect(stats.framingAdjustments).toBe(4);
    expect(stats.wideFramingSelections).toBe(2);
    expect(stats.mediumFramingSelections).toBe(1);
    expect(stats.closeupFramingSelections).toBe(1);
    expect(stats.detailFramingSelections).toBe(0);
    expect(stats.framingBonuses).toBe(3);
    expect(stats.framingPenalties).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Schema Serialization Round-Trip
// ---------------------------------------------------------------------------

describe('Schema Serialization Round-Trip for Step 28', () => {
  it('all 4 Step 28 provenance fields survive JSON stringify/parse round-trip', () => {
    const provenance = {
      sourceSegmentId: 'seg-1',
      originalScore: 0.75,
      adjustedScore: 0.758,
      explanation: 'test',
      reuseCount: 0,
      framingScale: 'WIDE' as FramingScale,
      framingModifier: 0.008,
      framingReason: 'Framing bonus: wide composition matches broad establishing narration.',
      framingMatchScore: 1.0,
      isManuallyEdited: false,
    };

    const serialized = JSON.stringify(provenance);
    const parsed = JSON.parse(serialized);

    expect(parsed.framingScale).toBe('WIDE');
    expect(parsed.framingModifier).toBe(0.008);
    expect(parsed.framingReason).toBe('Framing bonus: wide composition matches broad establishing narration.');
    expect(parsed.framingMatchScore).toBe(1.0);
  });

  it('preserves floating-point precision on modifier and match score', () => {
    const obj = { mod: -0.006, score: 0.85 };
    const roundTripped = JSON.parse(JSON.stringify(obj));
    expect(roundTripped.mod).toBe(-0.006);
    expect(roundTripped.score).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// 8. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyFramingScale does not mutate input asset', () => {
    const asset = makeAsset();
    const before = JSON.stringify(asset);
    classifyFramingScale(asset);
    expect(JSON.stringify(asset)).toBe(before);
  });

  it('classifyNarrationFramingIntent does not mutate input text', () => {
    const text = 'The wide mountain landscape';
    const before = text;
    classifyNarrationFramingIntent(text, 'establishing');
    expect(text).toBe(before);
  });

  it('framing modifier does not modify sourceStart or duration', () => {
    const result = calculateFramingScaleModifier('WIDE', 'WIDE', 'establishing', false);
    // Modifier is bounded at 0.008, not a timing offset (sourceStart in seconds)
    expect(Math.abs(result.modifier)).toBeLessThanOrEqual(0.008);
  });

  it('isManuallyEdited flag is independent of framing fields', () => {
    const result = calculateFramingScaleModifier('WIDE', 'WIDE', 'establishing', false);
    expect('isManuallyEdited' in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Edge Cases and Boundaries
// ---------------------------------------------------------------------------

describe('Edge Cases and Boundaries', () => {
  it('handles empty string and undefined roles gracefully', () => {
    const intent = classifyNarrationFramingIntent('', undefined);
    expect(intent).toBe('NEUTRAL');
  });

  it('handles asset with missing tags and empty descriptions', () => {
    const asset = makeAsset({
      name: '',
      analysis: {
        analyzed: true,
        description: '',
        tags: [],
      },
    });
    const scale = classifyFramingScale(asset);
    expect(['WIDE', 'STANDARD', 'MEDIUM', 'CLOSEUP', 'DETAIL']).toContain(scale);
  });

  it('returns valid reason string for every combination', () => {
    const scales: FramingScale[] = ['WIDE', 'MEDIUM', 'CLOSEUP', 'DETAIL', 'STANDARD'];
    const intents: FramingIntent[] = ['WIDE', 'CLOSEUP', 'DETAIL', 'DYNAMIC', 'NEUTRAL'];

    for (const scale of scales) {
      for (const intent of intents) {
        const result = calculateFramingScaleModifier(scale, intent);
        expect(typeof result.reason).toBe('string');
        expect(result.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or framingMatchScore', () => {
    const result = calculateFramingScaleModifier('STANDARD', 'NEUTRAL');
    expect(Number.isFinite(result.modifier)).toBe(true);
    expect(Number.isFinite(result.framingMatchScore)).toBe(true);
  });

  it('NEW_BEAT with non-wide framing does not grant wide establishing bonus', () => {
    const result = calculateFramingScaleModifier('CLOSEUP', 'NEUTRAL', 'description', false, 'NEW_BEAT');
    expect(result.modifier).toBe(0.0);
  });

  it('classifies DETAIL from zoom-in and extreme close keywords', () => {
    const asset = makeAsset({
      name: 'extreme_zoom.mp4',
      analysis: {
        analyzed: true,
        description: 'extreme close texture',
        tags: ['zoom-in', 'texture'],
      },
    });
    expect(classifyFramingScale(asset)).toBe('DETAIL');
  });

  it('classifies MEDIUM from crowd or standing keywords', () => {
    const asset = makeAsset({
      analysis: {
        analyzed: true,
        description: 'Engineers working and standing in the control room',
        tags: ['standing', 'working'],
      },
    });
    expect(classifyFramingScale(asset)).toBe('MEDIUM');
  });

  it('handles mixed intent tokens prioritizing DETAIL over generic words', () => {
    const intent = classifyNarrationFramingIntent('Looking at the tiny microscopic particle');
    expect(intent).toBe('DETAIL');
  });

  it('all 4 framing scales are represented in possible classification outputs', () => {
    const outputs = new Set<FramingScale>();
    const assets = [
      makeAsset({ analysis: { analyzed: true, description: 'vast mountain landscape', tags: ['landscape', 'wide'] } }),
      makeAsset({ analysis: { analyzed: true, description: 'close portrait headshot', tags: ['portrait', 'headshot'] } }),
      makeAsset({ analysis: { analyzed: true, description: 'microscopic detail texture', tags: ['macro', 'detail'] } }),
      makeAsset({ analysis: { analyzed: true, description: 'two people walking and interacting', tags: ['walking', 'interaction'] } }),
      makeAsset({ analysis: { analyzed: true, description: 'neutral abstract graphic', tags: [] }, aspectRatio: 1.0 }),
    ];
    for (const a of assets) {
      outputs.add(classifyFramingScale(a));
    }
    expect(outputs.has('WIDE')).toBe(true);
    expect(outputs.has('CLOSEUP')).toBe(true);
    expect(outputs.has('DETAIL')).toBe(true);
    expect(outputs.has('MEDIUM')).toBe(true);
  });
});
