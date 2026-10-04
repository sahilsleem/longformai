import { describe, it, expect } from 'vitest';
import { resolveRenderPlan } from './renderPlan';
import type { LongFormProject, TimelineItem } from '../types/project';

function createMockTimelineItem(id: string, startTime: number, duration: number): TimelineItem {
  return {
    id,
    mediaId: `media-${id}`,
    trackIndex: 0,
    startTime,
    duration,
    sourceStart: 0,
    sourceDuration: 10,
    transform: { x: 0, y: 0, scale: 1, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
  };
}

function createBaseProject(): LongFormProject {
  return {
    version: '1.0',
    id: 'proj-1',
    name: 'Test Project',
    resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
    fps: 30,
    timeline: [],
    media: [],
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
  };
}

describe('resolveRenderPlan (Stage 3A)', () => {
  it('1. NORMAL identity: resolves a sequential timeline with matched treatments', () => {
    const project = createBaseProject();
    project.timeline = [
      createMockTimelineItem('clip-1', 0, 5),
      createMockTimelineItem('clip-2', 5, 5),
    ];
    project.visualTreatmentPlan = {
      version: '1.0',
      treatments: {
        'clip-1': { motion: 'SLOW_ZOOM', typography: 'NONE', transition: 'HARD_CUT', reason: 'Test 1' },
        'clip-2': { motion: 'NORMAL_CLIP', typography: 'EMPHASIS_TEXT', transition: 'CROSSFADE', reason: 'Test 2', text: 'Boom' },
      },
      summary: { totalItems: 2, normalClips: 1, slowZooms: 1, punchZooms: 0, holds: 0, emphasisTexts: 1, contextLabels: 0, fullscreenTexts: 0, hardCuts: 1, crossfades: 1 },
    };

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(2);
    
    // Both segments are not gaps
    expect(plan.segments[0].isGap).toBe(false);
    expect(plan.segments[1].isGap).toBe(false);

    // Treatments mapped accurately
    expect(plan.segments[0].treatment?.motion).toBe('SLOW_ZOOM');
    expect(plan.segments[1].treatment?.typography).toBe('EMPHASIS_TEXT');
    expect(plan.segments[1].treatment?.text).toBe('Boom');
  });

  it('2. Missing treatments: applies safe fallback when treatment is completely absent', () => {
    const project = createBaseProject();
    project.timeline = [createMockTimelineItem('clip-1', 0, 5)];
    // No visualTreatmentPlan provided
    project.visualTreatmentPlan = undefined;

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(1);
    
    const seg = plan.segments[0];
    expect(seg.isGap).toBe(false);
    expect(seg.treatment).toBeDefined();
    expect(seg.treatment?.motion).toBe('NORMAL_CLIP');
    expect(seg.treatment?.typography).toBe('NONE');
    expect(seg.treatment?.transition).toBe('HARD_CUT');
    expect(seg.treatment?.reason).toBe('Fallback treatment');
  });

  it('3. Missing partial treatments: applies safe fallback when treatment data is invalid/incomplete', () => {
    const project = createBaseProject();
    project.timeline = [createMockTimelineItem('clip-1', 0, 5)];
    project.visualTreatmentPlan = {
      version: '1.0',
      treatments: {
        // @ts-expect-error simulating corrupt data
        'clip-1': { reason: 'Corrupted' },
      },
      summary: { totalItems: 1 } as any,
    };

    const plan = resolveRenderPlan(project);
    const seg = plan.segments[0];
    expect(seg.treatment?.motion).toBe('NORMAL_CLIP');
    expect(seg.treatment?.typography).toBe('NONE');
    expect(seg.treatment?.transition).toBe('HARD_CUT');
    expect(seg.treatment?.reason).toBe('Corrupted'); // merges with fallback
  });

  it('4. Determinism: input order does not affect chronologically sorted output', () => {
    const projectA = createBaseProject();
    projectA.timeline = [
      createMockTimelineItem('clip-B', 5, 5),
      createMockTimelineItem('clip-A', 0, 5),
    ];

    const projectB = createBaseProject();
    projectB.timeline = [
      createMockTimelineItem('clip-A', 0, 5),
      createMockTimelineItem('clip-B', 5, 5),
    ];

    const planA = resolveRenderPlan(projectA);
    const planB = resolveRenderPlan(projectB);

    expect(planA.segments).toEqual(planB.segments);
    expect(planA.segments[0].timelineItem?.id).toBe('clip-A');
    expect(planA.segments[1].timelineItem?.id).toBe('clip-B');
  });

  it('5. Timeline/treatment immutability: original objects are not mutated', () => {
    const project = createBaseProject();
    const originalItem = createMockTimelineItem('clip-1', 0, 5);
    const originalTreatment = { motion: 'SLOW_ZOOM', typography: 'NONE', transition: 'HARD_CUT', reason: 'Original' };
    
    project.timeline = [originalItem];
    project.visualTreatmentPlan = {
      version: '1.0',
      treatments: { 'clip-1': originalTreatment as any },
      summary: { totalItems: 1 } as any,
    };

    Object.freeze(originalItem);
    Object.freeze(originalTreatment);

    const plan = resolveRenderPlan(project);
    const segment = plan.segments[0];

    // Must not be the identical reference
    expect(segment.timelineItem).not.toBe(originalItem);
    expect(segment.treatment).not.toBe(originalTreatment);
    
    // Values should match
    expect(segment.timelineItem?.id).toBe('clip-1');
    expect(segment.treatment?.motion).toBe('SLOW_ZOOM');
  });

  it('6. Gap derivation (with gaps): injects explicit gap segments between separated clips', () => {
    const project = createBaseProject();
    // clip A: 0-5
    // clip B: 8-10 (Gap 5-8)
    project.timeline = [
      createMockTimelineItem('clip-A', 0, 5),
      createMockTimelineItem('clip-B', 8, 2),
    ];

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(3);
    
    expect(plan.segments[0].isGap).toBe(false);
    expect(plan.segments[0].timelineItem?.id).toBe('clip-A');
    
    expect(plan.segments[1].isGap).toBe(true);
    expect(plan.segments[1].startTime).toBe(5);
    expect(plan.segments[1].duration).toBe(3);
    
    expect(plan.segments[2].isGap).toBe(false);
    expect(plan.segments[2].timelineItem?.id).toBe('clip-B');
  });

  it('7. Gap derivation (overlap threshold): ignores gaps <= 0.04s', () => {
    const project = createBaseProject();
    // clip A: 0-5
    // clip B: 5.02-7.02 (Gap is 0.02, which is <= 0.04 threshold)
    project.timeline = [
      createMockTimelineItem('clip-A', 0, 5),
      createMockTimelineItem('clip-B', 5.02, 2),
    ];

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(2);
    expect(plan.segments[0].isGap).toBe(false);
    expect(plan.segments[1].isGap).toBe(false);
  });

  it('8. Gap treatment suppression: gap segments contain NO item or treatment metadata', () => {
    const project = createBaseProject();
    project.timeline = [
      createMockTimelineItem('clip-A', 0, 5),
      createMockTimelineItem('clip-B', 8, 2),
    ];

    const plan = resolveRenderPlan(project);
    const gapSegment = plan.segments[1];
    
    expect(gapSegment.isGap).toBe(true);
    expect(gapSegment.timelineItem).toBeUndefined();
    expect(gapSegment.treatment).toBeUndefined();
  });

  it('9. Timing coordinate verification: maintains exact start/duration logic relative to timeline', () => {
    const project = createBaseProject();
    const item = createMockTimelineItem('clip-A', 2.5, 4.2);
    item.sourceStart = 1.0;
    project.timeline = [item];

    const plan = resolveRenderPlan(project);
    const clipSegment = plan.segments[1]; // First segment is a gap 0 - 2.5

    expect(clipSegment.isGap).toBe(false);
    expect(clipSegment.startTime).toBe(2.5);
    expect(clipSegment.duration).toBe(4.2);
    expect(clipSegment.timelineItem?.sourceStart).toBe(1.0);
  });

  it('10. Trailing gap extension: adds trailing gap if voiceover exceeds timeline items', () => {
    const project = createBaseProject();
    project.timeline = [createMockTimelineItem('clip-A', 0, 5)];
    project.voiceover = {
      id: 'vo-1', name: 'VO', type: 'audio', url: '', duration: 10, isMuted: false, volume: 1, createdAt: 0
    };

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(2);
    
    // Clip A
    expect(plan.segments[0].isGap).toBe(false);
    expect(plan.segments[0].duration).toBe(5);
    
    // Trailing gap (5 to 10)
    expect(plan.segments[1].isGap).toBe(true);
    expect(plan.segments[1].startTime).toBe(5);
    expect(plan.segments[1].duration).toBe(5);
  });

  it('11. Empty timeline fallback: creates a single total duration gap when timeline is empty', () => {
    const project = createBaseProject();
    project.timeline = [];
    project.voiceover = {
      id: 'vo-1', name: 'VO', type: 'audio', url: '', duration: 15, isMuted: false, volume: 1, createdAt: 0
    };

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].isGap).toBe(true);
    expect(plan.segments[0].startTime).toBe(0);
    expect(plan.segments[0].duration).toBe(15);
  });

  it('12. Ignores zero-duration clips during resolution', () => {
    const project = createBaseProject();
    project.timeline = [
      createMockTimelineItem('clip-A', 0, 5),
      createMockTimelineItem('clip-B', 5, 0), // Invalid / empty
      createMockTimelineItem('clip-C', 5, 5),
    ];

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(2);
    expect(plan.segments[0].timelineItem?.id).toBe('clip-A');
    expect(plan.segments[1].timelineItem?.id).toBe('clip-C');
  });
});

describe('resolveRenderPlan (Stage 3C Typography Overlays)', () => {
  it('1. Resolves EMPHASIS_TEXT overlay with explicit textTiming clamped to duration', () => {
    const project = createBaseProject();
    project.timeline = [createMockTimelineItem('clip-1', 0, 4)];
    project.visualTreatmentPlan = {
      version: '1.0',
      treatments: {
        'clip-1': {
          motion: 'SLOW_ZOOM',
          typography: 'EMPHASIS_TEXT',
          transition: 'HARD_CUT',
          reason: 'Impact beat',
          text: 'CRITICAL MOMENT',
          textTiming: { start: 0.5, end: 2.5 },
        },
      },
      summary: { totalItems: 1, normalClips: 0, slowZooms: 1, punchZooms: 0, holds: 0, emphasisTexts: 1, contextLabels: 0, fullscreenTexts: 0, hardCuts: 1, crossfades: 0 },
    };

    const plan = resolveRenderPlan(project);
    expect(plan.segments).toHaveLength(1);
    const seg = plan.segments[0];
    expect(seg.typographyOverlay).toBeDefined();
    expect(seg.typographyOverlay?.type).toBe('EMPHASIS_TEXT');
    expect(seg.typographyOverlay?.text).toBe('CRITICAL MOMENT');
    expect(seg.typographyOverlay?.startTime).toBe(0.5);
    expect(seg.typographyOverlay?.endTime).toBe(2.5);
  });

  it('2. Resolves CONTEXT_LABEL overlay with default timing', () => {
    const project = createBaseProject();
    project.timeline = [createMockTimelineItem('clip-1', 0, 5)];
    project.visualTreatmentPlan = {
      version: '1.0',
      treatments: {
        'clip-1': {
          motion: 'NORMAL_CLIP',
          typography: 'CONTEXT_LABEL',
          transition: 'HARD_CUT',
          reason: 'Entity introduction',
          text: 'Shah Rukh Khan',
        },
      },
      summary: { totalItems: 1, normalClips: 1, slowZooms: 0, punchZooms: 0, holds: 0, emphasisTexts: 0, contextLabels: 1, fullscreenTexts: 0, hardCuts: 1, crossfades: 0 },
    };

    const plan = resolveRenderPlan(project);
    const seg = plan.segments[0];
    expect(seg.typographyOverlay).toBeDefined();
    expect(seg.typographyOverlay?.type).toBe('CONTEXT_LABEL');
    expect(seg.typographyOverlay?.text).toBe('Shah Rukh Khan');
    expect(seg.typographyOverlay?.startTime).toBe(0.3);
    expect(seg.typographyOverlay?.endTime).toBe(2.5);
  });

  it('3. Clamps out-of-bounds timing to segment duration', () => {
    const project = createBaseProject();
    project.timeline = [createMockTimelineItem('clip-1', 0, 3)];
    project.visualTreatmentPlan = {
      version: '1.0',
      treatments: {
        'clip-1': {
          motion: 'PUNCH_ZOOM',
          typography: 'EMPHASIS_TEXT',
          transition: 'HARD_CUT',
          reason: 'Impact beat',
          text: 'WOW',
          textTiming: { start: -1.0, end: 10.0 }, // Exceeds 3s duration
        },
      },
      summary: { totalItems: 1, normalClips: 0, slowZooms: 0, punchZooms: 1, holds: 0, emphasisTexts: 1, contextLabels: 0, fullscreenTexts: 0, hardCuts: 1, crossfades: 0 },
    };

    const plan = resolveRenderPlan(project);
    const seg = plan.segments[0];
    expect(seg.typographyOverlay?.startTime).toBe(0.0);
    expect(seg.typographyOverlay?.endTime).toBe(3.0);
  });

  it('4. Ignores FULLSCREEN_TEXT and whitespace-only text', () => {
    const project = createBaseProject();
    project.timeline = [
      createMockTimelineItem('clip-1', 0, 4),
      createMockTimelineItem('clip-2', 4, 4),
    ];
    project.visualTreatmentPlan = {
      version: '1.0',
      treatments: {
        'clip-1': {
          motion: 'NORMAL_CLIP',
          typography: 'FULLSCREEN_TEXT',
          transition: 'HARD_CUT',
          reason: 'Fullscreen text not active in Stage 3C',
          text: 'Title Screen',
        },
        'clip-2': {
          motion: 'NORMAL_CLIP',
          typography: 'EMPHASIS_TEXT',
          transition: 'HARD_CUT',
          reason: 'Empty text',
          text: '   ',
        },
      },
      summary: { totalItems: 2, normalClips: 2, slowZooms: 0, punchZooms: 0, holds: 0, emphasisTexts: 1, contextLabels: 0, fullscreenTexts: 1, hardCuts: 2, crossfades: 0 },
    };

    const plan = resolveRenderPlan(project);
    expect(plan.segments[0].typographyOverlay).toBeUndefined();
    expect(plan.segments[1].typographyOverlay).toBeUndefined();
  });
});
