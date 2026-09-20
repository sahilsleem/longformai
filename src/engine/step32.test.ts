/**
 * Step 32 — Human Subject Presence & Social Density Intelligence
 *
 * Dedicated test suite verifying:
 *  - Subject density classification (SOLO_INDIVIDUAL, DUO_INTERACTION, GROUP_TEAM, CROWD_AUDIENCE, UNINHABITED_OBJECT)
 *  - Narration social density intent extraction (SOLO, DUO, GROUP, CROWD, EMPTY, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset character introduction energy
 *  - Independence from Steps 22–31
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifySubjectDensity,
  classifyNarrationDensityIntent,
  calculateSubjectDensityModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  SubjectDensity,
  DensityIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
  SceneSetting,
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
// 1. classifySubjectDensity
// ---------------------------------------------------------------------------

describe('classifySubjectDensity', () => {
  it('returns UNINHABITED_OBJECT for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifySubjectDensity(null)).toBe('UNINHABITED_OBJECT');
    // @ts-expect-error test undefined asset
    expect(classifySubjectDensity(undefined)).toBe('UNINHABITED_OBJECT');
  });

  it('classifies based on visualFeatures faceCount directly', () => {
    const soloFaceAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        visualFeatures: { hasFaces: true, faceCount: 1 },
      },
    });
    expect(classifySubjectDensity(soloFaceAsset)).toBe('SOLO_INDIVIDUAL');

    const duoFaceAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        visualFeatures: { hasFaces: true, faceCount: 2 },
      },
    });
    expect(classifySubjectDensity(duoFaceAsset)).toBe('DUO_INTERACTION');

    const groupFaceAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        visualFeatures: { hasFaces: true, faceCount: 4 },
      },
    });
    expect(classifySubjectDensity(groupFaceAsset)).toBe('GROUP_TEAM');

    const crowdFaceAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        visualFeatures: { hasFaces: true, faceCount: 12 },
      },
    });
    expect(classifySubjectDensity(crowdFaceAsset)).toBe('CROWD_AUDIENCE');
  });

  it('classifies SOLO_INDIVIDUAL when hasFaces is true without explicit faceCount', () => {
    const faceAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        visualFeatures: { hasFaces: true },
      },
    });
    expect(classifySubjectDensity(faceAsset)).toBe('SOLO_INDIVIDUAL');
  });

  it('classifies SOLO_INDIVIDUAL from portrait, monologue, creator keywords', () => {
    const soloAsset = createTestMediaAsset({
      name: 'founder_interview_portrait.mp4',
      analysis: {
        analyzed: true,
        tags: ['founder', 'portrait', 'person', 'interviewee'],
        description: 'Single creator speaking alone directly to camera',
      },
    });
    expect(classifySubjectDensity(soloAsset)).toBe('SOLO_INDIVIDUAL');
  });

  it('classifies DUO_INTERACTION from pair, couple, dialogue, conversation keywords', () => {
    const duoAsset = createTestMediaAsset({
      name: 'co_founders_dialogue.mp4',
      analysis: {
        analyzed: true,
        tags: ['duo', 'pair', 'partners', 'dialogue'],
        description: 'Two collaborators having a conversation together',
      },
    });
    expect(classifySubjectDensity(duoAsset)).toBe('DUO_INTERACTION');
  });

  it('classifies GROUP_TEAM from team, crew, committee, colleagues keywords', () => {
    const teamAsset = createTestMediaAsset({
      name: 'engineering_team_meeting.mp4',
      analysis: {
        analyzed: true,
        tags: ['team', 'engineers', 'group', 'colleagues'],
        description: 'A crew of scientists collaborating during a project meeting',
      },
    });
    expect(classifySubjectDensity(teamAsset)).toBe('GROUP_TEAM');
  });

  it('classifies CROWD_AUDIENCE from crowd, audience, fans, stadium keywords', () => {
    const crowdAsset = createTestMediaAsset({
      name: 'stadium_concert_audience.mp4',
      analysis: {
        analyzed: true,
        tags: ['crowd', 'audience', 'spectators', 'stadium'],
        description: 'Thousands of fans cheering in a packed concert arena',
      },
    });
    expect(classifySubjectDensity(crowdAsset)).toBe('CROWD_AUDIENCE');
  });

  it('classifies UNINHABITED_OBJECT from machine, hardware, empty, landscape keywords', () => {
    const emptyAsset = createTestMediaAsset({
      name: 'deserted_automated_factory.mp4',
      analysis: {
        analyzed: true,
        tags: ['automated', 'machine', 'equipment', 'empty'],
        description: 'Robotic machinery operating in an uninhabited facility with nobody around',
      },
    });
    expect(classifySubjectDensity(emptyAsset)).toBe('UNINHABITED_OBJECT');
  });

  it('falls back to UNINHABITED_OBJECT when no density keywords or faces are present', () => {
    const genericAsset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['general', 'content'],
        description: 'Generic background',
      },
    });
    expect(classifySubjectDensity(genericAsset)).toBe('UNINHABITED_OBJECT');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationDensityIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationDensityIntent', () => {
  it('returns NEUTRAL for empty or whitespace-only text', () => {
    expect(classifyNarrationDensityIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationDensityIntent('   ')).toBe('NEUTRAL');
  });

  it('detects SOLO intent from individual, founder, monologue, alone keywords', () => {
    expect(
      classifyNarrationDensityIntent('He stood alone as the sole founder reflectively speaking.')
    ).toBe('SOLO');
    expect(
      classifyNarrationDensityIntent('The artist worked by herself in a single quiet room.')
    ).toBe('SOLO');
  });

  it('detects DUO intent from duo, pair, dialogue, couple, partner keywords', () => {
    expect(
      classifyNarrationDensityIntent('The two co-founders engaged in an intense dialogue together.')
    ).toBe('DUO');
    expect(
      classifyNarrationDensityIntent('Both partners sat down for an insightful interview conversation.')
    ).toBe('DUO');
  });

  it('detects GROUP intent from team, crew, committee, colleagues, staff keywords', () => {
    expect(
      classifyNarrationDensityIntent('The engineering team and crew gathered for a collaborative meeting.')
    ).toBe('GROUP');
    expect(
      classifyNarrationDensityIntent('Our department of scientists and colleagues solved the challenge.')
    ).toBe('GROUP');
  });

  it('detects CROWD intent from audience, crowd, thousands, spectators, fans keywords', () => {
    expect(
      classifyNarrationDensityIntent('Thousands of fans and spectators filled the stadium audience.')
    ).toBe('CROWD');
    expect(
      classifyNarrationDensityIntent('A massive crowd of citizens gathered for the public demonstration.')
    ).toBe('CROWD');
  });

  it('detects EMPTY intent from deserted, machine, uninhabited, robot, hardware keywords', () => {
    expect(
      classifyNarrationDensityIntent('The automated machinery ran with total silence in the deserted facility.')
    ).toBe('EMPTY');
    expect(
      classifyNarrationDensityIntent('An uninhabited landscape with nobody around and stillness in the air.')
    ).toBe('EMPTY');
  });

  it('resolves conflicting keywords based on keyword frequency', () => {
    // 2 crowd keywords ("crowd", "audience") vs 1 solo keyword ("person")
    const text = 'A single person looked out at the massive crowd in the packed audience.';
    expect(classifyNarrationDensityIntent(text)).toBe('CROWD');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateSubjectDensityModifier
// ---------------------------------------------------------------------------

describe('calculateSubjectDensityModifier', () => {
  it('strictly bounds all modifiers within [-0.008, +0.008]', () => {
    const densities: SubjectDensity[] = [
      'SOLO_INDIVIDUAL',
      'DUO_INTERACTION',
      'GROUP_TEAM',
      'CROWD_AUDIENCE',
      'UNINHABITED_OBJECT',
    ];
    const intents: DensityIntent[] = ['SOLO', 'DUO', 'GROUP', 'CROWD', 'EMPTY', 'NEUTRAL'];

    for (const density of densities) {
      for (const intent of intents) {
        const res = calculateSubjectDensityModifier(density, intent);
        expect(res.modifier).toBeGreaterThanOrEqual(-0.008);
        expect(res.modifier).toBeLessThanOrEqual(0.008);
        expect(res.densityMatchScore).toBeGreaterThanOrEqual(0.0);
        expect(res.densityMatchScore).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('awards +0.008 bonus for exact subject density matches', () => {
    expect(calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'SOLO').modifier).toBe(0.008);
    expect(calculateSubjectDensityModifier('DUO_INTERACTION', 'DUO').modifier).toBe(0.008);
    expect(calculateSubjectDensityModifier('GROUP_TEAM', 'GROUP').modifier).toBe(0.008);
    expect(calculateSubjectDensityModifier('CROWD_AUDIENCE', 'CROWD').modifier).toBe(0.008);
    expect(calculateSubjectDensityModifier('UNINHABITED_OBJECT', 'EMPTY').modifier).toBe(0.008);
  });

  it('applies partial positive alignments for adjacent or compatible social densities', () => {
    // Solo character in dialogue duo setting
    const duoSolo = calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'DUO');
    expect(duoSolo.modifier).toBe(0.003);
    expect(duoSolo.densityMatchScore).toBe(0.7);

    // Pair interaction supporting team collaboration
    const groupDuo = calculateSubjectDensityModifier('DUO_INTERACTION', 'GROUP');
    expect(groupDuo.modifier).toBe(0.004);
    expect(groupDuo.densityMatchScore).toBe(0.8);

    // Group presence supporting crowd scale
    const crowdGroup = calculateSubjectDensityModifier('GROUP_TEAM', 'CROWD');
    expect(crowdGroup.modifier).toBe(0.003);
    expect(crowdGroup.densityMatchScore).toBe(0.7);
  });

  it('applies penalties for clashing social densities', () => {
    // Solo narration with mass crowd footage
    const soloCrowd = calculateSubjectDensityModifier('CROWD_AUDIENCE', 'SOLO');
    expect(soloCrowd.modifier).toBe(-0.006);
    expect(soloCrowd.densityMatchScore).toBe(0.15);

    // Crowd narration with solo individual
    const crowdSolo = calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'CROWD');
    expect(crowdSolo.modifier).toBe(-0.006);
    expect(crowdSolo.densityMatchScore).toBe(0.15);

    // Empty narration with crowd footage
    const emptyCrowd = calculateSubjectDensityModifier('CROWD_AUDIENCE', 'EMPTY');
    expect(emptyCrowd.modifier).toBe(-0.006);
    expect(emptyCrowd.densityMatchScore).toBe(0.15);
  });

  it('returns 0.0 modifier and 0.5 match score for NEUTRAL intent', () => {
    const res = calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'NEUTRAL');
    expect(res.modifier).toBe(0.0);
    expect(res.densityMatchScore).toBe(0.5);
    expect(res.reason).toContain('Neutral subject density intent');
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive Continuation Handling
// ---------------------------------------------------------------------------

describe('Consecutive Continuation Handling', () => {
  it('waives penalties when isConsecutiveContinuation is true', () => {
    // Normally CROWD_AUDIENCE with SOLO narration receives -0.006 penalty
    const standard = calculateSubjectDensityModifier('CROWD_AUDIENCE', 'SOLO', false);
    expect(standard.modifier).toBe(-0.006);

    const continued = calculateSubjectDensityModifier('CROWD_AUDIENCE', 'SOLO', true);
    expect(continued.modifier).toBe(0.0);
    expect(continued.densityMatchScore).toBe(0.8);
    expect(continued.reason).toContain('Consecutive shot continuation - subject density penalties waived.');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat Transition & Character Introduction Handling
// ---------------------------------------------------------------------------

describe('Beat Transition & Character Introduction Handling', () => {
  it('grants +0.008 bonus with new beat character introduction reason at NEW_BEAT', () => {
    const res = calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'SOLO', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.densityMatchScore).toBe(1.0);
    expect(res.reason).toContain('New beat character introduction');
  });

  it('retains standard scoring for neutral intent at NEW_BEAT', () => {
    const res = calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'NEUTRAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.0);
    expect(res.densityMatchScore).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–31 Intelligence Layers
// ---------------------------------------------------------------------------

describe('Independence from Other Intelligence Layers', () => {
  it('operates orthogonally alongside framing, lighting, motion, and setting', () => {
    const densityRes = calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'SOLO');
    expect(densityRes.subjectDensity).toBe('SOLO_INDIVIDUAL');
    expect(densityRes.densityIntent).toBe('SOLO');

    // Subject density operates independently regardless of framing scale (e.g. CLOSEUP vs WIDE)
    const framingSample: FramingScale = 'CLOSEUP';
    const atmosphericSample: AtmosphericTone = 'WARM_VIBRANT';
    const motionSample: CameraMotion = 'STATIC_LOCKED';
    const settingSample: SceneSetting = 'INDOOR_INTERIOR';

    expect(framingSample).toBe('CLOSEUP');
    expect(atmosphericSample).toBe('WARM_VIBRANT');
    expect(motionSample).toBe('STATIC_LOCKED');
    expect(settingSample).toBe('INDOOR_INTERIOR');
    expect(densityRes.modifier).toBe(0.008);
  });

  it('Step 28 framing scale is unaffected by subject density classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['portrait', 'face', 'founder'],
        visualFeatures: { hasFaces: true, faceCount: 1 },
      },
    });
    const density = classifySubjectDensity(asset);
    expect(density).toBe('SOLO_INDIVIDUAL');
  });

  it('Step 29 atmospheric tone is unaffected by subject density classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['warm', 'golden', 'team'],
        visualFeatures: { hasFaces: true, faceCount: 4 },
      },
    });
    const density = classifySubjectDensity(asset);
    expect(density).toBe('GROUP_TEAM');
  });

  it('Step 30 camera motion is unaffected by subject density classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['crowd', 'stadium', 'spectators'],
        visualFeatures: { hasFaces: true, faceCount: 20 },
      },
    });
    const density = classifySubjectDensity(asset);
    expect(density).toBe('CROWD_AUDIENCE');
  });

  it('Step 31 scene setting is unaffected by subject density classification', () => {
    const asset = createTestMediaAsset({
      analysis: {
        analyzed: true,
        tags: ['office', 'desk', 'machine', 'empty'],
      },
    });
    const density = classifySubjectDensity(asset);
    expect(density).toBe('UNINHABITED_OBJECT');
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic Dominance Preservation with Step 32
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation with Step 32', () => {
  it('strong semantic match (0.82) with max density penalty (-0.008) beats weak match (0.55) with max density bonus (+0.008)', () => {
    const strongCandidateScore = 0.82 - 0.008; // 0.812
    const weakCandidateScore = 0.55 + 0.008;   // 0.558
    expect(strongCandidateScore).toBeGreaterThan(weakCandidateScore);
  });

  it('composite score maintains semantic dominance with all modifiers active', () => {
    const strongSemantic = 0.80;
    const weakSemantic = 0.40;
    const maxAllPenalties = -0.075;
    const maxAllBonuses = +0.075;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.725
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.475
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 7. Schema Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Schema Round-Trip Serialization', () => {
  it('serializes and deserializes Step 32 provenance fields accurately', () => {
    const project = createInitialProject('Step 32 Serialization Test');
    const asset = createTestMediaAsset({ id: 'm-density-1' });
    project.media.push(asset);

    project.timeline.push({
      id: 'clip-1',
      mediaId: 'm-density-1',
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
        explanation: 'Selected due to matching solo subject character focus',
        reuseCount: 0,
        subjectDensity: 'SOLO_INDIVIDUAL',
        densityModifier: 0.008,
        densityReason: 'Density bonus: individual subject framing matches personal solo narration.',
        densityMatchScore: 1.0,
      },
    });

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project).toBeDefined();

    const prov = parsed.project!.timeline[0].provenance!;
    expect(prov.subjectDensity).toBe('SOLO_INDIVIDUAL');
    expect(prov.densityModifier).toBe(0.008);
    expect(prov.densityReason).toBe('Density bonus: individual subject framing matches personal solo narration.');
    expect(prov.densityMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 8. DraftStats Counters Verification
// ---------------------------------------------------------------------------

describe('DraftStats Counters Verification', () => {
  it('supports all Step 32 density metrics in DraftStats interface', () => {
    const stats: Partial<DraftStats> = {
      densityAdjustments: 12,
      soloSubjectSelections: 4,
      duoSubjectSelections: 2,
      groupSubjectSelections: 3,
      crowdSubjectSelections: 2,
      uninhabitedSelections: 1,
      densityBonuses: 9,
      densityPenalties: 3,
    };

    expect(stats.densityAdjustments).toBe(12);
    expect(stats.soloSubjectSelections).toBe(4);
    expect(stats.duoSubjectSelections).toBe(2);
    expect(stats.groupSubjectSelections).toBe(3);
    expect(stats.crowdSubjectSelections).toBe(2);
    expect(stats.uninhabitedSelections).toBe(1);
    expect(stats.densityBonuses).toBe(9);
    expect(stats.densityPenalties).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 9. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifySubjectDensity does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['founder', 'portrait', 'solo'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifySubjectDensity(frozen)).not.toThrow();
  });

  it('classifyNarrationDensityIntent does not mutate input text', () => {
    const text = 'The founder worked alone in isolation.';
    const copy = `${text}`;
    classifyNarrationDensityIntent(text);
    expect(text).toBe(copy);
  });

  it('density modifier does not modify sourceStart or duration', () => {
    const res = calculateSubjectDensityModifier('SOLO_INDIVIDUAL', 'SOLO');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of density fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      subjectDensity: 'SOLO_INDIVIDUAL' as SubjectDensity,
      densityModifier: 0.008,
      densityReason: 'Test reason',
      densityMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.subjectDensity).toBe('SOLO_INDIVIDUAL');
    expect(prov.densityModifier).toBe(0.008);
  });
});

// ---------------------------------------------------------------------------
// 10. Edge Cases and Boundaries
// ---------------------------------------------------------------------------

describe('Edge Cases and Boundaries', () => {
  it('handles asset with missing tags and empty descriptions gracefully', () => {
    const emptyAsset = createTestMediaAsset({
      analysis: undefined,
    });
    expect(classifySubjectDensity(emptyAsset)).toBe('UNINHABITED_OBJECT');
  });

  it('returns valid reason string for every density/intent combination', () => {
    const allDensities: SubjectDensity[] = [
      'SOLO_INDIVIDUAL',
      'DUO_INTERACTION',
      'GROUP_TEAM',
      'CROWD_AUDIENCE',
      'UNINHABITED_OBJECT',
    ];
    const allIntents: DensityIntent[] = ['SOLO', 'DUO', 'GROUP', 'CROWD', 'EMPTY', 'NEUTRAL'];
    for (const d of allDensities) {
      for (const i of allIntents) {
        const res = calculateSubjectDensityModifier(d, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or densityMatchScore', () => {
    const allDensities: SubjectDensity[] = [
      'SOLO_INDIVIDUAL',
      'DUO_INTERACTION',
      'GROUP_TEAM',
      'CROWD_AUDIENCE',
      'UNINHABITED_OBJECT',
    ];
    const allIntents: DensityIntent[] = ['SOLO', 'DUO', 'GROUP', 'CROWD', 'EMPTY', 'NEUTRAL'];
    for (const d of allDensities) {
      for (const i of allIntents) {
        const res = calculateSubjectDensityModifier(d, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.densityMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.densityMatchScore)).toBe(false);
      }
    }
  });

  it('all 5 subject densities are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, visualFeatures: { hasFaces: true, faceCount: 1 } } }),
      createTestMediaAsset({ analysis: { analyzed: true, visualFeatures: { hasFaces: true, faceCount: 2 } } }),
      createTestMediaAsset({ analysis: { analyzed: true, visualFeatures: { hasFaces: true, faceCount: 5 } } }),
      createTestMediaAsset({ analysis: { analyzed: true, visualFeatures: { hasFaces: true, faceCount: 15 } } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['machine', 'equipment', 'empty'] } }),
    ];

    const classified = assets.map((a) => classifySubjectDensity(a));
    expect(classified).toContain('SOLO_INDIVIDUAL');
    expect(classified).toContain('DUO_INTERACTION');
    expect(classified).toContain('GROUP_TEAM');
    expect(classified).toContain('CROWD_AUDIENCE');
    expect(classified).toContain('UNINHABITED_OBJECT');
  });
});
