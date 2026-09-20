/**
 * Step 39 — Compositional Balance & Screen Alignment Intelligence
 *
 * Dedicated test suite verifying:
 *  - Composition balance classification (CENTERED_SYMMETRIC, RULE_OF_THIRDS_LEFT, RULE_OF_THIRDS_RIGHT, DISTRIBUTED_BALANCED, COMPOSITION_AGNOSTIC)
 *  - Narration composition intent extraction (CENTER, LEFT, RIGHT, DISTRIBUTED, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset composition balance establishing energy
 *  - Independence from Steps 22–38
 *  - Semantic dominance preservation
 *  - DraftStats counters & Full generateDraftTimeline integration
 *  - Schema JSON serialization round-trip
 *  - Immutability, edge cases, and determinism
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCompositionBalance,
  classifyNarrationCompositionIntent,
  calculateCompositionBalanceModifier,
  generateDraftTimeline,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  AudioSegment,
  CompositionBalance,
  CompositionIntent,
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
// 1. classifyCompositionBalance
// ---------------------------------------------------------------------------

describe('classifyCompositionBalance', () => {
  it('returns COMPOSITION_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyCompositionBalance(null)).toBe('COMPOSITION_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyCompositionBalance(undefined)).toBe('COMPOSITION_AGNOSTIC');
  });

  it('classifies CENTERED_SYMMETRIC from centered, symmetrical, dead center keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'centered_portrait.mp4',
      analysis: { description: 'Dead center portrait with symmetrical balance in frame', tags: ['centered', 'symmetry'] },
    });
    expect(classifyCompositionBalance(asset1)).toBe('CENTERED_SYMMETRIC');

    const asset2 = createTestMediaAsset({
      name: 'axial_view.mp4',
      analysis: { description: 'Perfect symmetry with front and center subject alignment', tags: ['axial', 'bullseye'] },
    });
    expect(classifyCompositionBalance(asset2)).toBe('CENTERED_SYMMETRIC');
  });

  it('classifies RULE_OF_THIRDS_LEFT from left third, left side, rule of thirds left keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'left_interview.mp4',
      analysis: { description: 'Speaker placed on the left side framing following rule of thirds left', tags: ['left-third', 'left-aligned'] },
    });
    expect(classifyCompositionBalance(asset1)).toBe('RULE_OF_THIRDS_LEFT');

    const asset2 = createTestMediaAsset({
      name: 'left_anchored_shot.mp4',
      analysis: { description: 'Subject framed on the left with negative space on the right', tags: ['left-weighted', 'left-frame'] },
    });
    expect(classifyCompositionBalance(asset2)).toBe('RULE_OF_THIRDS_LEFT');
  });

  it('classifies RULE_OF_THIRDS_RIGHT from right third, right side, rule of thirds right keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'right_interview.mp4',
      analysis: { description: 'Speaker framed on the right following rule of thirds right', tags: ['right-third', 'right-aligned'] },
    });
    expect(classifyCompositionBalance(asset1)).toBe('RULE_OF_THIRDS_RIGHT');

    const asset2 = createTestMediaAsset({
      name: 'right_weighted_shot.mp4',
      analysis: { description: 'Subject on the right side framing with negative space on the left', tags: ['right-weighted', 'right-frame'] },
    });
    expect(classifyCompositionBalance(asset2)).toBe('RULE_OF_THIRDS_RIGHT');
  });

  it('classifies DISTRIBUTED_BALANCED from distributed, multi-focal, all-over, panoramic spread keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'crowd_mosaic.mp4',
      analysis: { description: 'Distributed balance with multi-focal composition across the screen', tags: ['distributed', 'balanced'] },
    });
    expect(classifyCompositionBalance(asset1)).toBe('DISTRIBUTED_BALANCED');

    const asset2 = createTestMediaAsset({
      name: 'panoramic_landscape.mp4',
      analysis: { description: 'Panoramic spread with uniform distribution of scenic elements', tags: ['spread', 'grid-aligned'] },
    });
    expect(classifyCompositionBalance(asset2)).toBe('DISTRIBUTED_BALANCED');
  });

  it('returns COMPOSITION_AGNOSTIC for unanalyzed or neutral asset', () => {
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
    expect(classifyCompositionBalance(unanalyzedAsset)).toBe('COMPOSITION_AGNOSTIC');

    const neutralAsset = createTestMediaAsset({
      name: 'general_media.mp4',
      analysis: { description: 'General scenery footage', tags: ['neutral', 'clip'] },
    });
    expect(classifyCompositionBalance(neutralAsset)).toBe('COMPOSITION_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationCompositionIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationCompositionIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationCompositionIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationCompositionIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts CENTER intent from dead center, front and center, middle, and focal point keywords', () => {
    expect(classifyNarrationCompositionIntent('Right at the center of our discussion is this breakthrough.')).toBe('CENTER');
    expect(classifyNarrationCompositionIntent('Positioned dead center, the main subject grabs attention.')).toBe('CENTER');
    expect(classifyNarrationCompositionIntent('Front and center lies the core innovation.')).toBe('CENTER');
  });

  it('extracts LEFT intent from on the left, to the left, left-hand side keywords', () => {
    expect(classifyNarrationCompositionIntent('On the left side of the diagram we observe the incoming data.')).toBe('LEFT');
    expect(classifyNarrationCompositionIntent('Looking to the left, notice how the pattern changes.')).toBe('LEFT');
    expect(classifyNarrationCompositionIntent('On our left, the primary metric is displayed.')).toBe('LEFT');
  });

  it('extracts RIGHT intent from on the right, to the right, right-hand side keywords', () => {
    expect(classifyNarrationCompositionIntent('On the right side of the screen, results are calculated.')).toBe('RIGHT');
    expect(classifyNarrationCompositionIntent('Shift your attention to the right where the output appears.')).toBe('RIGHT');
    expect(classifyNarrationCompositionIntent('On our right, the final total is confirmed.')).toBe('RIGHT');
  });

  it('extracts DISTRIBUTED intent from spread across, scattered throughout, all over keywords', () => {
    expect(classifyNarrationCompositionIntent('Spread across the entire landscape are various nodes.')).toBe('DISTRIBUTED');
    expect(classifyNarrationCompositionIntent('Scattered throughout the whole frame, numerous elements interact.')).toBe('DISTRIBUTED');
    expect(classifyNarrationCompositionIntent('Distributed evenly across the screen, the data points align.')).toBe('DISTRIBUTED');
  });

  it('returns NEUTRAL for narration without composition balance cues', () => {
    expect(classifyNarrationCompositionIntent('Revenue increased significantly during the fourth quarter.')).toBe('NEUTRAL');
    expect(classifyNarrationCompositionIntent('We must consider all operational requirements.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationCompositionIntent('ON THE LEFT SIDE OF THE SCREEN')).toBe('LEFT');
    expect(classifyNarrationCompositionIntent('FRONT AND CENTER IN FOCUS')).toBe('CENTER');
    expect(classifyNarrationCompositionIntent('SPREAD ACROSS THE ENTIRE REGION')).toBe('DISTRIBUTED');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateCompositionBalanceModifier
// ---------------------------------------------------------------------------

describe('calculateCompositionBalanceModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const balances: CompositionBalance[] = [
      'CENTERED_SYMMETRIC',
      'RULE_OF_THIRDS_LEFT',
      'RULE_OF_THIRDS_RIGHT',
      'DISTRIBUTED_BALANCED',
      'COMPOSITION_AGNOSTIC',
    ];

    const intents: CompositionIntent[] = ['CENTER', 'LEFT', 'RIGHT', 'DISTRIBUTED', 'NEUTRAL'];

    for (const bal of balances) {
      for (const intent of intents) {
        const res = calculateCompositionBalanceModifier(bal, intent);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.compositionMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.compositionMatchScore).toBeLessThanOrEqual(1.0);
        expect(typeof res.reason).toBe('string');
        expect(res.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('awards +0.008 bonus for exact composition balance matches', () => {
    expect(calculateCompositionBalanceModifier('CENTERED_SYMMETRIC', 'CENTER').modifier).toBe(0.008);
    expect(calculateCompositionBalanceModifier('CENTERED_SYMMETRIC', 'CENTER').compositionMatchScore).toBe(1.0);

    expect(calculateCompositionBalanceModifier('RULE_OF_THIRDS_LEFT', 'LEFT').modifier).toBe(0.008);
    expect(calculateCompositionBalanceModifier('RULE_OF_THIRDS_LEFT', 'LEFT').compositionMatchScore).toBe(1.0);

    expect(calculateCompositionBalanceModifier('RULE_OF_THIRDS_RIGHT', 'RIGHT').modifier).toBe(0.008);
    expect(calculateCompositionBalanceModifier('RULE_OF_THIRDS_RIGHT', 'RIGHT').compositionMatchScore).toBe(1.0);

    expect(calculateCompositionBalanceModifier('DISTRIBUTED_BALANCED', 'DISTRIBUTED').modifier).toBe(0.008);
    expect(calculateCompositionBalanceModifier('DISTRIBUTED_BALANCED', 'DISTRIBUTED').compositionMatchScore).toBe(1.0);
  });

  it('awards moderate bonuses for compatible composition balance pairs', () => {
    // Distributed framing supports focused center or side contexts
    expect(calculateCompositionBalanceModifier('DISTRIBUTED_BALANCED', 'CENTER').modifier).toBe(0.002);
    expect(calculateCompositionBalanceModifier('DISTRIBUTED_BALANCED', 'LEFT').modifier).toBe(0.003);
    expect(calculateCompositionBalanceModifier('DISTRIBUTED_BALANCED', 'RIGHT').modifier).toBe(0.003);

    // Centered framing compatible with distributed context
    expect(calculateCompositionBalanceModifier('CENTERED_SYMMETRIC', 'DISTRIBUTED').modifier).toBe(0.003);
  });

  it('penalizes opposing left vs right thirds alignments', () => {
    // Right thirds candidate with left intent
    const leftMismatch = calculateCompositionBalanceModifier('RULE_OF_THIRDS_RIGHT', 'LEFT');
    expect(leftMismatch.modifier).toBe(-0.006);
    expect(leftMismatch.compositionMatchScore).toBe(0.15);

    // Left thirds candidate with right intent
    const rightMismatch = calculateCompositionBalanceModifier('RULE_OF_THIRDS_LEFT', 'RIGHT');
    expect(rightMismatch.modifier).toBe(-0.006);
    expect(rightMismatch.compositionMatchScore).toBe(0.15);
  });

  it('returns neutral 0.0 modifier for neutral intent or agnostic composition', () => {
    expect(calculateCompositionBalanceModifier('CENTERED_SYMMETRIC', 'NEUTRAL').modifier).toBe(0.0);
    expect(calculateCompositionBalanceModifier('COMPOSITION_AGNOSTIC', 'CENTER').modifier).toBe(0.0);
    expect(calculateCompositionBalanceModifier('COMPOSITION_AGNOSTIC', 'LEFT').modifier).toBe(0.0);
    expect(calculateCompositionBalanceModifier('COMPOSITION_AGNOSTIC', 'RIGHT').modifier).toBe(0.0);
    expect(calculateCompositionBalanceModifier('COMPOSITION_AGNOSTIC', 'DISTRIBUTED').modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive continuation penalty waiving
// ---------------------------------------------------------------------------

describe('Consecutive continuation penalty waiving', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normal opposing mismatch has -0.006 penalty
    const normalMismatch = calculateCompositionBalanceModifier('RULE_OF_THIRDS_RIGHT', 'LEFT', false);
    expect(normalMismatch.modifier).toBe(-0.006);

    // With consecutive continuation, modifier is waived to 0.0
    const continuedMismatch = calculateCompositionBalanceModifier('RULE_OF_THIRDS_RIGHT', 'LEFT', true);
    expect(continuedMismatch.modifier).toBe(0.0);
    expect(continuedMismatch.compositionMatchScore).toBe(0.8);
    expect(continuedMismatch.reason).toContain('Consecutive shot continuation');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat-reset composition balance establishing energy
// ---------------------------------------------------------------------------

describe('Beat-reset composition balance establishing energy', () => {
  it('awards +0.008 modifier with NEW_BEAT narrationBeatType for matching intent', () => {
    const beatMatch = calculateCompositionBalanceModifier('RULE_OF_THIRDS_LEFT', 'LEFT', false, 'NEW_BEAT');
    expect(beatMatch.modifier).toBe(0.008);
    expect(beatMatch.compositionMatchScore).toBe(1.0);
    expect(beatMatch.reason).toContain('New beat compositional introduction');
  });

  it('does not award beat bonus if narration intent is NEUTRAL', () => {
    const beatNeutral = calculateCompositionBalanceModifier('CENTERED_SYMMETRIC', 'NEUTRAL', false, 'NEW_BEAT');
    expect(beatNeutral.modifier).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–38
// ---------------------------------------------------------------------------

describe('Independence from Steps 22–38', () => {
  it('operates orthogonally to other visual intelligence layers', () => {
    const asset = createTestMediaAsset({
      name: 'left_screencast_slowmo.mp4',
      analysis: {
        description: 'Screen recording on the left side of the screen with slow motion playback and deep focus in an office',
        tags: ['screencast', 'left-third', 'slow-motion', 'deep-focus', 'indoor'],
      },
    });

    const compBalance = classifyCompositionBalance(asset);
    expect(compBalance).toBe('RULE_OF_THIRDS_LEFT');

    // Step 39 modifier evaluates strictly on composition balance
    const res = calculateCompositionBalanceModifier(compBalance, 'LEFT');
    expect(res.modifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic dominance preservation
// ---------------------------------------------------------------------------

describe('Semantic dominance preservation', () => {
  it('ensures semantic relevance remains dominant over composition modifiers', () => {
    const strongSemanticScore = 0.82;
    const weakSemanticScore = 0.42;

    const strongAssetPenalty = calculateCompositionBalanceModifier('RULE_OF_THIRDS_RIGHT', 'LEFT').modifier; // -0.006
    const weakAssetBonus = calculateCompositionBalanceModifier('RULE_OF_THIRDS_LEFT', 'LEFT').modifier; // +0.008

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
  it('populates Step 39 provenance fields and stats in generateDraftTimeline', async () => {
    const segments: AudioSegment[] = [
      {
        id: 's1',
        startTime: 0,
        endTime: 4,
        text: 'On the left side of our frame we inspect the primary data.',
      },
    ];

    const media: MediaAsset[] = [
      createTestMediaAsset({
        id: 'm1',
        name: 'left_analytics.mp4',
        analysis: {
          analyzed: true,
          description: 'Primary data displayed on the left side framing following rule of thirds left',
          tags: ['left-third', 'data', 'analytics'],
        },
      }),
    ];

    const result = await generateDraftTimeline(segments, media);
    expect(result.timeline.length).toBe(1);
    const item = result.timeline[0];
    expect(item.provenance?.compositionBalance).toBe('RULE_OF_THIRDS_LEFT');
    expect(item.provenance?.compositionModifier).toBe(0.008);
    expect(item.provenance?.compositionReason).toContain('left rule-of-thirds alignment');
    expect(item.provenance?.compositionMatchScore).toBe(1.0);

    expect(result.stats.compositionAdjustments).toBe(1);
    expect(result.stats.leftThirdSelections).toBe(1);
    expect(result.stats.compositionBonuses).toBe(1);
  });

  it('includes all 8 Step 39 composition counters in DraftStats type', () => {
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
      // Step 39 fields
      compositionAdjustments: 1,
      centeredSelections: 1,
      leftThirdSelections: 0,
      rightThirdSelections: 0,
      distributedSelections: 0,
      compositionAgnosticSelections: 0,
      compositionBonuses: 1,
      compositionPenalties: 0,
    };

    expect(stats.compositionAdjustments).toBe(1);
    expect(stats.centeredSelections).toBe(1);
    expect(stats.leftThirdSelections).toBe(0);
    expect(stats.rightThirdSelections).toBe(0);
    expect(stats.distributedSelections).toBe(0);
    expect(stats.compositionAgnosticSelections).toBe(0);
    expect(stats.compositionBonuses).toBe(1);
    expect(stats.compositionPenalties).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON serialization round-trip
// ---------------------------------------------------------------------------

describe('Schema JSON serialization round-trip for Step 39 provenance', () => {
  it('preserves Step 39 composition provenance fields across export and parse', () => {
    const project = createInitialProject('Step 39 Test');
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
          sourceSegmentText: 'On the left side of our screen is the key chart.',
          originalScore: 0.85,
          adjustedScore: 0.858,
          explanation: 'Strong semantic match with left rule-of-thirds composition.',
          reuseCount: 0,
          compositionBalance: 'RULE_OF_THIRDS_LEFT',
          compositionModifier: 0.008,
          compositionReason: 'Composition bonus: left rule-of-thirds alignment matches left-oriented narrative.',
          compositionMatchScore: 1.0,
        },
      },
    ];

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    const item = parsed.project?.timeline[0];
    expect(item?.provenance?.compositionBalance).toBe('RULE_OF_THIRDS_LEFT');
    expect(item?.provenance?.compositionModifier).toBe(0.008);
    expect(item?.provenance?.compositionReason).toBe('Composition bonus: left rule-of-thirds alignment matches left-oriented narrative.');
    expect(item?.provenance?.compositionMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Immutability, edge cases, and determinism
// ---------------------------------------------------------------------------

describe('Immutability, edge cases, and determinism', () => {
  it('does not mutate input candidate asset or description', () => {
    const asset = createTestMediaAsset({
      name: 'freeze_test.mp4',
      analysis: { description: 'Centered symmetric focal point', tags: ['centered'] },
    });
    const frozenAsset = Object.freeze({ ...asset });

    const balance1 = classifyCompositionBalance(frozenAsset);
    const balance2 = classifyCompositionBalance(frozenAsset);
    expect(balance1).toBe('CENTERED_SYMMETRIC');
    expect(balance2).toBe('CENTERED_SYMMETRIC');
  });

  it('produces identical deterministic results across repeated calls', () => {
    const res1 = calculateCompositionBalanceModifier('CENTERED_SYMMETRIC', 'CENTER');
    const res2 = calculateCompositionBalanceModifier('CENTERED_SYMMETRIC', 'CENTER');
    expect(res1).toEqual(res2);
  });

  it('never returns NaN or Infinity for modifier or compositionMatchScore', () => {
    const balances: CompositionBalance[] = [
      'CENTERED_SYMMETRIC',
      'RULE_OF_THIRDS_LEFT',
      'RULE_OF_THIRDS_RIGHT',
      'DISTRIBUTED_BALANCED',
      'COMPOSITION_AGNOSTIC',
    ];
    const intents: CompositionIntent[] = ['CENTER', 'LEFT', 'RIGHT', 'DISTRIBUTED', 'NEUTRAL'];
    for (const b of balances) {
      for (const i of intents) {
        const res = calculateCompositionBalanceModifier(b, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.compositionMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.compositionMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 composition balance classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['centered', 'symmetry'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['left-third', 'left-aligned'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['right-third', 'right-aligned'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['distributed', 'balanced'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyCompositionBalance(a));
    expect(classified).toContain('CENTERED_SYMMETRIC');
    expect(classified).toContain('RULE_OF_THIRDS_LEFT');
    expect(classified).toContain('RULE_OF_THIRDS_RIGHT');
    expect(classified).toContain('DISTRIBUTED_BALANCED');
    expect(classified).toContain('COMPOSITION_AGNOSTIC');
  });
});
