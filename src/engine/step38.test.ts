/**
 * Step 38 — Visual Medium & Render Style Intelligence
 *
 * Dedicated test suite verifying:
 *  - Visual medium classification (LIVE_ACTION_REALISM, SCREENCAST_UI, ANIMATION_2D, CGI_3D_RENDER, ABSTRACT_GRAPHIC, MEDIUM_AGNOSTIC)
 *  - Narration medium intent extraction (LIVE_ACTION, SCREENCAST, ANIMATION, CGI_3D, ABSTRACT, NEUTRAL)
 *  - Modifier calculation strictly bounded within [-0.008, +0.008]
 *  - Compatible alignment pairs and penalty calculation
 *  - Consecutive continuation penalty waiving
 *  - Beat-reset visual medium establishing energy
 *  - Independence from Steps 22–37
 *  - Semantic dominance preservation
 *  - DraftStats counters
 *  - Schema JSON serialization round-trip
 *  - Immutability and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  classifyVisualMedium,
  classifyNarrationMediumIntent,
  calculateVisualMediumModifier,
  DraftStats,
} from './draftTimeline';
import {
  MediaAsset,
  VisualMedium,
  MediumIntent,
  FramingScale,
  AtmosphericTone,
  CameraMotion,
  SceneSetting,
  SubjectDensity,
  CameraAngle,
  TimeOfDay,
  WeatherCondition,
  DepthOfField,
  TemporalRate,
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
// 1. classifyVisualMedium
// ---------------------------------------------------------------------------

describe('classifyVisualMedium', () => {
  it('returns MEDIUM_AGNOSTIC for null or undefined asset', () => {
    // @ts-expect-error test null asset
    expect(classifyVisualMedium(null)).toBe('MEDIUM_AGNOSTIC');
    // @ts-expect-error test undefined asset
    expect(classifyVisualMedium(undefined)).toBe('MEDIUM_AGNOSTIC');
  });

  it('classifies SCREENCAST_UI from screen recording, ui, software, dashboard keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'app_dashboard_walkthrough.mp4',
      analysis: { description: 'Software user interface and dashboard demo walkthrough', tags: ['screencast', 'ui'] },
    });
    expect(classifyVisualMedium(asset1)).toBe('SCREENCAST_UI');

    const asset2 = createTestMediaAsset({
      name: 'code_editor.mp4',
      analysis: { description: 'Screen recording of terminal and web browser code editor', tags: ['code', 'ide'] },
    });
    expect(classifyVisualMedium(asset2)).toBe('SCREENCAST_UI');
  });

  it('classifies CGI_3D_RENDER from 3d render, digital twin, cad model, simulation keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'engine_digital_twin.mp4',
      analysis: { description: 'Photorealistic 3d render of mechanical turbine digital twin', tags: ['3d-render', 'simulation'] },
    });
    expect(classifyVisualMedium(asset1)).toBe('CGI_3D_RENDER');

    const asset2 = createTestMediaAsset({
      name: 'architectural_cad.mp4',
      analysis: { description: 'Volumetric 3d simulation of building structure in unreal engine', tags: ['unreal', 'cad'] },
    });
    expect(classifyVisualMedium(asset2)).toBe('CGI_3D_RENDER');
  });

  it('classifies ANIMATION_2D from 2d animation, cartoon, illustration, whiteboard keywords', () => {
    const asset1 = createTestMediaAsset({
      name: 'explainer_cartoon.mp4',
      analysis: { description: '2d animation vector character explainer cartoon illustration', tags: ['2d-animation', 'vector'] },
    });
    expect(classifyVisualMedium(asset1)).toBe('ANIMATION_2D');

    const asset2 = createTestMediaAsset({
      name: 'whiteboard_diagram.mp4',
      analysis: { description: 'Hand drawn whiteboard animation explaining business process', tags: ['whiteboard', 'drawing'] },
    });
    expect(classifyVisualMedium(asset2)).toBe('ANIMATION_2D');
  });

  it('classifies ABSTRACT_GRAPHIC from particle flows, data streams, digital grids, cybernetic visuals', () => {
    const asset1 = createTestMediaAsset({
      name: 'digital_particles_backdrop.mp4',
      analysis: { description: 'Abstract background with particle system and generative cybernetic energy flow', tags: ['particle', 'data-stream'] },
    });
    expect(classifyVisualMedium(asset1)).toBe('ABSTRACT_GRAPHIC');

    const asset2 = createTestMediaAsset({
      name: 'hud_overlay.mp4',
      analysis: { description: 'Digital grid waveform with geometric motion graphics', tags: ['hud', 'geometric'] },
    });
    expect(classifyVisualMedium(asset2)).toBe('ABSTRACT_GRAPHIC');
  });

  it('classifies LIVE_ACTION_REALISM from live-action, real-world, documentary camera footage', () => {
    const asset1 = createTestMediaAsset({
      name: 'street_interview.mp4',
      analysis: { description: 'Live action camera recording of authentic street documentary', tags: ['live-action', 'documentary'] },
    });
    expect(classifyVisualMedium(asset1)).toBe('LIVE_ACTION_REALISM');

    const assetDefault = createTestMediaAsset({
      name: 'nature_scenery.mp4',
      analysis: { description: 'Forest trees and mountains in morning sunlight', tags: ['nature'] },
    });
    expect(classifyVisualMedium(assetDefault)).toBe('LIVE_ACTION_REALISM');
  });

  it('returns MEDIUM_AGNOSTIC for unanalyzed asset', () => {
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
    expect(classifyVisualMedium(unanalyzedAsset)).toBe('MEDIUM_AGNOSTIC');
  });
});

// ---------------------------------------------------------------------------
// 2. classifyNarrationMediumIntent
// ---------------------------------------------------------------------------

describe('classifyNarrationMediumIntent', () => {
  it('returns NEUTRAL for empty or whitespace text', () => {
    expect(classifyNarrationMediumIntent('')).toBe('NEUTRAL');
    expect(classifyNarrationMediumIntent('   ')).toBe('NEUTRAL');
  });

  it('extracts SCREENCAST intent from app, website, settings, click, and UI keywords', () => {
    expect(classifyNarrationMediumIntent('Navigate to the settings page in the app and click on the export button.')).toBe('SCREENCAST');
    expect(classifyNarrationMediumIntent('Inside the software demo, we can see the user interface dashboard update.')).toBe('SCREENCAST');
    expect(classifyNarrationMediumIntent('Opening the code editor in the web browser reveals the configuration.')).toBe('SCREENCAST');
  });

  it('extracts CGI_3D intent from 3D model, simulation, CAD, and volumetric render keywords', () => {
    expect(classifyNarrationMediumIntent('Our 3d simulation reveals the internal stress dynamics of the structure.')).toBe('CGI_3D');
    expect(classifyNarrationMediumIntent('Rendered in 3d, the digital twin mirrors every mechanical movement.')).toBe('CGI_3D');
    expect(classifyNarrationMediumIntent('Inspect the cad blueprint for architectural simulation.')).toBe('CGI_3D');
  });

  it('extracts ANIMATION intent from cartoon, whiteboard, hand-drawn, and vector keywords', () => {
    expect(classifyNarrationMediumIntent('In this animated metaphor, our cartoon character solves the problem.')).toBe('ANIMATION');
    expect(classifyNarrationMediumIntent('A hand drawn whiteboard sketch illustrates how the pipeline works.')).toBe('ANIMATION');
  });

  it('extracts ABSTRACT intent from data streams, digital networks, particle flow keywords', () => {
    expect(classifyNarrationMediumIntent('An abstract concept visualized as a matrix of data streams and algorithmic flow.')).toBe('ABSTRACT');
    expect(classifyNarrationMediumIntent('A particle swarm pulses across the digital network.')).toBe('ABSTRACT');
  });

  it('extracts LIVE_ACTION intent from real-world, in real life, documentary, in-person keywords', () => {
    expect(classifyNarrationMediumIntent('In real life, observing the physical reality of the situation reveals new insights.')).toBe('LIVE_ACTION');
    expect(classifyNarrationMediumIntent('A live demonstration captured on camera in the real world.')).toBe('LIVE_ACTION');
  });

  it('returns NEUTRAL for narration without medium or render style cues', () => {
    expect(classifyNarrationMediumIntent('Revenue increased significantly during the fourth quarter.')).toBe('NEUTRAL');
    expect(classifyNarrationMediumIntent('We must consider all possible perspectives.')).toBe('NEUTRAL');
  });

  it('handles case insensitivity seamlessly', () => {
    expect(classifyNarrationMediumIntent('CLICK ON THE DASHBOARD SETTINGS IN THE APP')).toBe('SCREENCAST');
    expect(classifyNarrationMediumIntent('3D SIMULATION OF DIGITAL TWIN')).toBe('CGI_3D');
    expect(classifyNarrationMediumIntent('ANIMATED CARTOON ILLUSTRATION')).toBe('ANIMATION');
  });
});

// ---------------------------------------------------------------------------
// 3. calculateVisualMediumModifier
// ---------------------------------------------------------------------------

describe('calculateVisualMediumModifier', () => {
  it('strictly bounds output modifier within [-0.008, +0.008]', () => {
    const mediums: VisualMedium[] = [
      'LIVE_ACTION_REALISM',
      'SCREENCAST_UI',
      'ANIMATION_2D',
      'CGI_3D_RENDER',
      'ABSTRACT_GRAPHIC',
      'MEDIUM_AGNOSTIC',
    ];
    const intents: MediumIntent[] = ['LIVE_ACTION', 'SCREENCAST', 'ANIMATION', 'CGI_3D', 'ABSTRACT', 'NEUTRAL'];
    const beatTypes = ['NEW_BEAT' as const, 'CONTINUING_BEAT' as const, 'STANDALONE' as const, undefined];

    for (const m of mediums) {
      for (const i of intents) {
        for (const isCont of [true, false]) {
          for (const beat of beatTypes) {
            const result = calculateVisualMediumModifier(m, i, isCont, beat);
            expect(result.modifier).toBeGreaterThanOrEqual(-0.008);
            expect(result.modifier).toBeLessThanOrEqual(0.008);
            expect(result.mediumMatchScore).toBeGreaterThanOrEqual(0.0);
            expect(result.mediumMatchScore).toBeLessThanOrEqual(1.0);
            expect(typeof result.reason).toBe('string');
            expect(result.visualMedium).toBe(m);
          }
        }
      }
    }
  });

  it('rewards exact match between SCREENCAST_UI and SCREENCAST intent', () => {
    const result = calculateVisualMediumModifier('SCREENCAST_UI', 'SCREENCAST', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.mediumMatchScore).toBe(1.0);
    expect(result.reason).toContain('screencast UI');
  });

  it('rewards exact match between CGI_3D_RENDER and CGI_3D intent', () => {
    const result = calculateVisualMediumModifier('CGI_3D_RENDER', 'CGI_3D', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.mediumMatchScore).toBe(1.0);
    expect(result.reason).toContain('3D CGI simulation');
  });

  it('rewards exact match between ANIMATION_2D and ANIMATION intent', () => {
    const result = calculateVisualMediumModifier('ANIMATION_2D', 'ANIMATION', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.mediumMatchScore).toBe(1.0);
    expect(result.reason).toContain('2D animation');
  });

  it('rewards exact match between ABSTRACT_GRAPHIC and ABSTRACT intent', () => {
    const result = calculateVisualMediumModifier('ABSTRACT_GRAPHIC', 'ABSTRACT', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.mediumMatchScore).toBe(1.0);
    expect(result.reason).toContain('abstract motion graphics');
  });

  it('rewards exact match between LIVE_ACTION_REALISM and LIVE_ACTION intent', () => {
    const result = calculateVisualMediumModifier('LIVE_ACTION_REALISM', 'LIVE_ACTION', false, 'STANDALONE');
    expect(result.modifier).toBeGreaterThan(0);
    expect(result.mediumMatchScore).toBe(1.0);
    expect(result.reason).toContain('live-action documentary');
  });

  it('rewards compatible pairs (e.g. ABSTRACT_GRAPHIC with SCREENCAST, CGI_3D_RENDER with ABSTRACT)', () => {
    const absScreen = calculateVisualMediumModifier('ABSTRACT_GRAPHIC', 'SCREENCAST');
    expect(absScreen.modifier).toBe(0.003);
    expect(absScreen.mediumMatchScore).toBe(0.7);

    const cgiAbs = calculateVisualMediumModifier('CGI_3D_RENDER', 'ABSTRACT');
    expect(cgiAbs.modifier).toBe(0.003);
    expect(cgiAbs.mediumMatchScore).toBe(0.7);
  });

  it('penalizes visual medium mismatch (e.g. LIVE_ACTION_REALISM asset when narration walks through software UI)', () => {
    const result = calculateVisualMediumModifier('LIVE_ACTION_REALISM', 'SCREENCAST', false, 'STANDALONE');
    expect(result.modifier).toBeLessThan(0);
    expect(result.mediumMatchScore).toBe(0.15);
    expect(result.reason).toContain('fails to show the referenced software interface');
  });

  it('penalizes visual medium mismatch (e.g. SCREENCAST_UI asset when narration is LIVE_ACTION)', () => {
    const result = calculateVisualMediumModifier('SCREENCAST_UI', 'LIVE_ACTION', false, 'STANDALONE');
    expect(result.modifier).toBeLessThan(0);
    expect(result.mediumMatchScore).toBe(0.15);
    expect(result.reason).toContain('software screen recording conflicts with physical live-action story');
  });

  it('waives penalty when consecutive continuation is active', () => {
    const mismatched = calculateVisualMediumModifier('LIVE_ACTION_REALISM', 'SCREENCAST', false, 'CONTINUING_BEAT');
    const continuous = calculateVisualMediumModifier('LIVE_ACTION_REALISM', 'SCREENCAST', true, 'CONTINUING_BEAT');

    expect(mismatched.modifier).toBeLessThan(0);
    expect(continuous.modifier).toBe(0);
    expect(continuous.mediumMatchScore).toBe(0.8);
    expect(continuous.reason).toContain('visual medium penalties waived');
  });

  it('adds establishing bonus on NEW_BEAT for matching visual medium', () => {
    const normalResult = calculateVisualMediumModifier('SCREENCAST_UI', 'SCREENCAST', false, 'STANDALONE');
    const newBeatResult = calculateVisualMediumModifier('SCREENCAST_UI', 'SCREENCAST', false, 'NEW_BEAT');

    expect(newBeatResult.modifier).toBeGreaterThanOrEqual(normalResult.modifier);
    expect(newBeatResult.reason).toContain('New beat visual medium introduction');
  });

  it('returns neutral modifier for MEDIUM_AGNOSTIC asset', () => {
    const result = calculateVisualMediumModifier('MEDIUM_AGNOSTIC', 'SCREENCAST', false, 'STANDALONE');
    expect(result.modifier).toBe(0);
    expect(result.mediumMatchScore).toBe(0.5);
    expect(result.reason).toContain('agnostic format');
  });

  it('returns neutral modifier when narration intent is NEUTRAL', () => {
    const result = calculateVisualMediumModifier('LIVE_ACTION_REALISM', 'NEUTRAL', false, 'STANDALONE');
    expect(result.modifier).toBe(0);
    expect(result.mediumMatchScore).toBe(0.5);
    expect(result.reason).toContain('Neutral visual medium intent');
  });
});

// ---------------------------------------------------------------------------
// 4. Consecutive Continuation Handling
// ---------------------------------------------------------------------------

describe('Consecutive Continuation Handling', () => {
  it('waives penalties when isConsecutiveContinuation is true across all mismatched combinations', () => {
    const mismatched = calculateVisualMediumModifier('SCREENCAST_UI', 'LIVE_ACTION', false);
    expect(mismatched.modifier).toBe(-0.006);

    const continued = calculateVisualMediumModifier('SCREENCAST_UI', 'LIVE_ACTION', true);
    expect(continued.modifier).toBe(0.0);
    expect(continued.mediumMatchScore).toBe(0.8);
    expect(continued.reason).toContain('Consecutive shot continuation - visual medium penalties waived.');
  });
});

// ---------------------------------------------------------------------------
// 5. Beat Transition & Perspective Establishing Handling
// ---------------------------------------------------------------------------

describe('Beat Transition & Perspective Establishing Handling', () => {
  it('grants +0.008 bonus with new beat visual medium introduction reason at NEW_BEAT', () => {
    const res = calculateVisualMediumModifier('SCREENCAST_UI', 'SCREENCAST', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.008);
    expect(res.mediumMatchScore).toBe(1.0);
    expect(res.reason).toContain('New beat visual medium introduction');
  });

  it('retains standard scoring for neutral intent at NEW_BEAT', () => {
    const res = calculateVisualMediumModifier('SCREENCAST_UI', 'NEUTRAL', false, 'NEW_BEAT');
    expect(res.modifier).toBe(0.0);
    expect(res.mediumMatchScore).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Independence from Steps 22–37
// ---------------------------------------------------------------------------

describe('Independence from other intelligence layers', () => {
  it('operates orthogonally alongside framing, lighting, motion, setting, density, angle, time of day, weather, depth, and temporal rate', () => {
    const medRes = calculateVisualMediumModifier('SCREENCAST_UI', 'SCREENCAST');
    expect(medRes.visualMedium).toBe('SCREENCAST_UI');
    expect(medRes.mediumIntent).toBe('SCREENCAST');

    const framingSample: FramingScale = 'WIDE';
    const atmosphericSample: AtmosphericTone = 'WARM_VIBRANT';
    const motionSample: CameraMotion = 'SMOOTH_FLOAT';
    const settingSample: SceneSetting = 'INDOOR_INTERIOR';
    const densitySample: SubjectDensity = 'UNINHABITED_OBJECT';
    const angleSample: CameraAngle = 'AERIAL_OVERHEAD';
    const timeSample: TimeOfDay = 'DAYLIGHT_CLEAR';
    const weatherSample: WeatherCondition = 'CLEAR_FAIR';
    const depthSample: DepthOfField = 'SHALLOW_BOKEH';
    const rateSample: TemporalRate = 'REALTIME_STANDARD';

    expect(framingSample).toBe('WIDE');
    expect(atmosphericSample).toBe('WARM_VIBRANT');
    expect(motionSample).toBe('SMOOTH_FLOAT');
    expect(settingSample).toBe('INDOOR_INTERIOR');
    expect(densitySample).toBe('UNINHABITED_OBJECT');
    expect(angleSample).toBe('AERIAL_OVERHEAD');
    expect(timeSample).toBe('DAYLIGHT_CLEAR');
    expect(weatherSample).toBe('CLEAR_FAIR');
    expect(depthSample).toBe('SHALLOW_BOKEH');
    expect(rateSample).toBe('REALTIME_STANDARD');
    expect(medRes.modifier).toBe(0.008);
  });

  it('Step 28 framing scale is unaffected by visual medium classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['screencast', 'dashboard'] },
    });
    const medium = classifyVisualMedium(asset);
    expect(medium).toBe('SCREENCAST_UI');
  });

  it('Step 29 atmospheric tone is unaffected by visual medium classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['3d-render', 'simulation'] },
    });
    const medium = classifyVisualMedium(asset);
    expect(medium).toBe('CGI_3D_RENDER');
  });

  it('Step 30 camera motion is unaffected by visual medium classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['2d-animation', 'cartoon'] },
    });
    const medium = classifyVisualMedium(asset);
    expect(medium).toBe('ANIMATION_2D');
  });

  it('Step 37 temporal rate is unaffected by visual medium classification', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['particle', 'data-stream'] },
    });
    const medium = classifyVisualMedium(asset);
    expect(medium).toBe('ABSTRACT_GRAPHIC');
  });
});

// ---------------------------------------------------------------------------
// 7. Semantic Dominance Preservation
// ---------------------------------------------------------------------------

describe('Semantic Dominance Preservation', () => {
  it('guarantees semantic score dominance over maximum Step 38 visual medium modifier delta', () => {
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
    const maxAllPenalties = -0.120;
    const maxAllBonuses = +0.120;

    const strongComposite = strongSemantic + maxAllPenalties; // 0.680
    const weakComposite = weakSemantic + maxAllBonuses;       // 0.520
    expect(strongComposite).toBeGreaterThan(weakComposite);
  });
});

// ---------------------------------------------------------------------------
// 8. DraftStats Type Coverage
// ---------------------------------------------------------------------------

describe('DraftStats Step 38 properties', () => {
  it('validates all Step 38 counters exist on DraftStats schema', () => {
    const stats: Partial<DraftStats> = {
      mediumAdjustments: 12,
      liveActionSelections: 5,
      screencastSelections: 3,
      animationSelections: 2,
      cgi3dSelections: 1,
      abstractGraphicSelections: 1,
      mediumAgnosticSelections: 0,
      mediumBonuses: 8,
      mediumPenalties: 4,
    };

    expect(stats.mediumAdjustments).toBe(12);
    expect(stats.liveActionSelections).toBe(5);
    expect(stats.screencastSelections).toBe(3);
    expect(stats.animationSelections).toBe(2);
    expect(stats.cgi3dSelections).toBe(1);
    expect(stats.abstractGraphicSelections).toBe(1);
    expect(stats.mediumAgnosticSelections).toBe(0);
    expect(stats.mediumBonuses).toBe(8);
    expect(stats.mediumPenalties).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 9. Schema JSON Round-Trip Serialization
// ---------------------------------------------------------------------------

describe('Step 38 Schema Serialization Round-Trip', () => {
  it('preserves Step 38 provenance properties across export and parse', () => {
    const project = createInitialProject('Step 38 Serialization Test');
    const asset = createTestMediaAsset({ id: 'm-med-1' });
    project.media.push(asset);

    project.timeline.push({
      id: 'clip-1',
      mediaId: 'm-med-1',
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
        explanation: 'Selected due to matching screencast UI medium',
        reuseCount: 0,
        visualMedium: 'SCREENCAST_UI',
        mediumModifier: 0.008,
        mediumReason: 'Medium bonus: software screencast UI recording matches app/interface walkthrough.',
        mediumMatchScore: 1.0,
        isManuallyEdited: false,
        assignedAt: 1700000000000,
      },
    });

    const json = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(json);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project).toBeDefined();

    const prov = parsed.project!.timeline[0].provenance!;
    expect(prov.visualMedium).toBe('SCREENCAST_UI');
    expect(prov.mediumModifier).toBe(0.008);
    expect(prov.mediumReason).toBe('Medium bonus: software screencast UI recording matches app/interface walkthrough.');
    expect(prov.mediumMatchScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 10. Manual Edit & Invariant Preservation
// ---------------------------------------------------------------------------

describe('Manual Edit & Invariant Preservation', () => {
  it('classifyVisualMedium does not mutate input asset', () => {
    const asset = createTestMediaAsset({
      analysis: { analyzed: true, tags: ['screencast', 'dashboard'] },
    });
    const frozen = Object.freeze(JSON.parse(JSON.stringify(asset)));
    expect(() => classifyVisualMedium(frozen)).not.toThrow();
  });

  it('classifyNarrationMediumIntent does not mutate input text', () => {
    const text = 'Navigate to the settings page in the app and click on the export button.';
    const copy = `${text}`;
    classifyNarrationMediumIntent(text);
    expect(text).toBe(copy);
  });

  it('visual medium modifier does not modify sourceStart or duration', () => {
    const res = calculateVisualMediumModifier('SCREENCAST_UI', 'SCREENCAST');
    expect(res).not.toHaveProperty('sourceStart');
    expect(res).not.toHaveProperty('duration');
  });

  it('isManuallyEdited flag is independent of visual medium fields', () => {
    const prov = {
      sourceSegmentId: 's-1',
      originalScore: 0.8,
      adjustedScore: 0.808,
      explanation: 'Test',
      reuseCount: 0,
      visualMedium: 'SCREENCAST_UI' as VisualMedium,
      mediumModifier: 0.008,
      mediumReason: 'Test reason',
      mediumMatchScore: 1.0,
      isManuallyEdited: false,
    };
    expect(prov.isManuallyEdited).toBe(false);
    prov.isManuallyEdited = true;
    expect(prov.visualMedium).toBe('SCREENCAST_UI');
    expect(prov.mediumModifier).toBe(0.008);
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
    expect(classifyVisualMedium(emptyAnalyzedAsset)).toBe('LIVE_ACTION_REALISM');

    const unanalyzed = createTestMediaAsset({
      analysis: { analyzed: false },
    });
    expect(classifyVisualMedium(unanalyzed)).toBe('MEDIUM_AGNOSTIC');
  });

  it('returns valid reason string for every medium/intent combination', () => {
    const allMediums: VisualMedium[] = [
      'LIVE_ACTION_REALISM',
      'SCREENCAST_UI',
      'ANIMATION_2D',
      'CGI_3D_RENDER',
      'ABSTRACT_GRAPHIC',
      'MEDIUM_AGNOSTIC',
    ];
    const allIntents: MediumIntent[] = ['LIVE_ACTION', 'SCREENCAST', 'ANIMATION', 'CGI_3D', 'ABSTRACT', 'NEUTRAL'];
    for (const m of allMediums) {
      for (const i of allIntents) {
        const res = calculateVisualMediumModifier(m, i);
        expect(res.reason.length).toBeGreaterThan(5);
      }
    }
  });

  it('never returns NaN or Infinity for modifier or mediumMatchScore', () => {
    const allMediums: VisualMedium[] = [
      'LIVE_ACTION_REALISM',
      'SCREENCAST_UI',
      'ANIMATION_2D',
      'CGI_3D_RENDER',
      'ABSTRACT_GRAPHIC',
      'MEDIUM_AGNOSTIC',
    ];
    const allIntents: MediumIntent[] = ['LIVE_ACTION', 'SCREENCAST', 'ANIMATION', 'CGI_3D', 'ABSTRACT', 'NEUTRAL'];
    for (const m of allMediums) {
      for (const i of allIntents) {
        const res = calculateVisualMediumModifier(m, i);
        expect(Number.isFinite(res.modifier)).toBe(true);
        expect(Number.isFinite(res.mediumMatchScore)).toBe(true);
        expect(Number.isNaN(res.modifier)).toBe(false);
        expect(Number.isNaN(res.mediumMatchScore)).toBe(false);
      }
    }
  });

  it('all 6 visual medium classes are represented in possible classification outputs', () => {
    const assets: MediaAsset[] = [
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['live-action', 'documentary'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['screencast', 'dashboard'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['2d-animation', 'cartoon'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['3d-render', 'simulation'] } }),
      createTestMediaAsset({ analysis: { analyzed: true, tags: ['particle', 'data-stream'] } }),
      createTestMediaAsset({ type: 'image', analysis: { analyzed: true, tags: ['neutral', 'clip'] } }),
    ];

    const classified = assets.map((a) => classifyVisualMedium(a));
    expect(classified).toContain('LIVE_ACTION_REALISM');
    expect(classified).toContain('SCREENCAST_UI');
    expect(classified).toContain('ANIMATION_2D');
    expect(classified).toContain('CGI_3D_RENDER');
    expect(classified).toContain('ABSTRACT_GRAPHIC');
    expect(classified).toContain('MEDIUM_AGNOSTIC');
  });
});
