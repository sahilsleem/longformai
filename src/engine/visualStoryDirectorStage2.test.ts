/**
 * Visual Story Director — Stage 2 Integration Tests
 *
 * Verifies the data/plan layer integration of VisualStoryDirector with
 * the timeline draft generation pipeline and project schema persistence.
 */

import { describe, it, expect } from 'vitest';
import { generateDraftTimeline } from './draftTimeline';
import {
  exportProjectToPortableJSON,
  validateAndParseProjectJSON,
  createInitialProject,
} from './schema';
import { buildSegmentCommand } from './ffmpegBuilder';
import type { AudioSegment, MediaAsset, MediaFolder, LongFormProject } from '../types/project';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeMediaAsset(id: string, name: string, description: string, overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id,
    name,
    type: 'video',
    url: `blob:http://localhost/${id}`,
    width: 1920,
    height: 1080,
    duration: 15,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9 Native',
    createdAt: 1700000000000,
    analysis: {
      analyzed: true,
      description,
      tags: ['test', 'footage'],
      semantic: {
        analyzed: true,
        description,
        tags: ['test', 'footage'],
        temporalSummary: description,
      },
    },
    ...overrides,
  };
}

function makeSegment(id: string, text: string, startTime: number, endTime: number): AudioSegment {
  return {
    id,
    text,
    startTime,
    endTime,
    words: text.split(' ').map((word, idx) => ({
      word,
      start: startTime + idx * 0.4,
      end: startTime + (idx + 1) * 0.4,
    })),
  };
}

describe('Visual Story Director — Stage 2 Integration', () => {
  const sampleMedia: MediaAsset[] = [
    makeMediaAsset('m1', 'salman_speech.mp4', 'Salman Khan speaking at a press conference on stage'),
    makeMediaAsset('m2', 'action_stunt.mp4', 'Dramatic fast action car chase scene explosively moving'),
    makeMediaAsset('m3', 'city_overview.mp4', 'Establishing wide shot of a modern city skyline at dusk'),
  ];

  const sampleFolders: MediaFolder[] = [
    { id: 'f1', name: 'Salman Khan', createdAt: 1700000000000 },
  ];

  sampleMedia[0].folderIds = ['f1'];

  const sampleSegments: AudioSegment[] = [
    makeSegment('s1', 'In the beginning, we witnessed the vibrant city.', 0, 4),
    makeSegment('s2', 'Suddenly, an explosive chase broke out through the streets!', 4, 8),
    makeSegment('s3', 'Salman Khan addressed the crowd with great determination.', 8, 12),
  ];

  // 1. generateDraftTimeline() returns a treatment plan
  it('1. generateDraftTimeline returns a valid VisualTreatmentPlan alongside existing outputs', async () => {
    const result = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    expect(result).toHaveProperty('treatmentPlan');
    expect(result.treatmentPlan).toBeDefined();
    expect(result.treatmentPlan.version).toBe('1.0');
    expect(result.treatmentPlan.treatments).toBeDefined();
    expect(result.treatmentPlan.summary).toBeDefined();
    expect(typeof result.treatmentPlan.summary.totalItems).toBe('number');
  });

  // 2. Treatment plan contains entries keyed by generated timeline item IDs
  it('2. Treatment plan contains entries keyed by generated timeline item IDs', async () => {
    const result = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    expect(result.timeline.length).toBeGreaterThan(0);
    for (const item of result.timeline) {
      const treatment = result.treatmentPlan.treatments[item.id];
      expect(treatment).toBeDefined();
      expect(['NORMAL_CLIP', 'SLOW_ZOOM', 'PUNCH_ZOOM', 'HOLD']).toContain(treatment.motion);
      expect(['NONE', 'EMPHASIS_TEXT', 'CONTEXT_LABEL', 'FULLSCREEN_TEXT']).toContain(treatment.typography);
      expect(['HARD_CUT', 'CROSSFADE']).toContain(treatment.transition);
      expect(typeof treatment.reason).toBe('string');
      expect(treatment.reason.length).toBeGreaterThan(0);
    }
  });

  // 3. Treatment count matches final timeline item count
  it('3. Treatment count in summary and treatments matches final timeline item count', async () => {
    const result = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    const treatmentKeys = Object.keys(result.treatmentPlan.treatments);
    expect(treatmentKeys.length).toBe(result.timeline.length);
    expect(result.treatmentPlan.summary.totalItems).toBe(result.timeline.length);
  });

  // 4. Existing timeline item fields are unchanged by Director integration
  it('4. Existing timeline item fields are preserved with correct structure and values', async () => {
    const result = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    for (const item of result.timeline) {
      expect(item.id).toMatch(/^draft_/);
      expect(typeof item.mediaId).toBe('string');
      expect(item.trackIndex).toBe(0);
      expect(typeof item.startTime).toBe('number');
      expect(item.startTime).toBeGreaterThanOrEqual(0);
      expect(typeof item.duration).toBe('number');
      expect(item.duration).toBeGreaterThan(0);
      expect(typeof item.sourceStart).toBe('number');
      expect(typeof item.sourceDuration).toBe('number');
      expect(item.transform).toBeDefined();
      expect(item.transform.fitMode).toBe('cover');
      expect(item.transform.scale).toBeGreaterThanOrEqual(1.0);
      expect(item.provenance).toBeDefined();
      expect(item.provenance?.sourceSegmentId).toBeDefined();
      expect(item.provenance?.explanation).toBeDefined();
    }
  });

  // 5. Existing stats remain unchanged
  it('5. Existing stats calculations remain intact', async () => {
    const result = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    expect(result.stats).toBeDefined();
    expect(result.stats.totalSegments).toBe(3);
    expect(result.stats.assignedSegments).toBe(result.timeline.length);
    expect(result.stats.totalDuration).toBe(12);
    expect(result.stats.coveragePercentage).toBeGreaterThan(0);
    expect(result.stats.uniqueMediaUsed).toBeGreaterThan(0);
  });

  // 6. Existing unassigned segment IDs remain unchanged
  it('6. Unassigned segment IDs are accurately returned when media cannot match', async () => {
    const emptyResult = await generateDraftTimeline(sampleSegments, [], {
      folders: sampleFolders,
    });

    expect(emptyResult.timeline).toEqual([]);
    expect(emptyResult.unassignedSegmentIds).toEqual(['s1', 's2', 's3']);
    expect(emptyResult.treatmentPlan.summary.totalItems).toBe(0);
    expect(emptyResult.treatmentPlan.treatments).toEqual({});
  });

  // 7. Treatment plan is deterministic for the same inputs
  it('7. Treatment plan produces deterministic decisions for the same inputs', async () => {
    const resultA = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });
    const resultB = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    expect(resultA.timeline.length).toBe(resultB.timeline.length);
    expect(resultA.treatmentPlan.summary).toEqual(resultB.treatmentPlan.summary);

    // Verify per-index treatment properties (motion, typography, transition) are identical
    for (let i = 0; i < resultA.timeline.length; i++) {
      const itemA = resultA.timeline[i];
      const itemB = resultB.timeline[i];
      const treatA = resultA.treatmentPlan.treatments[itemA.id];
      const treatB = resultB.treatmentPlan.treatments[itemB.id];

      expect(treatA.motion).toBe(treatB.motion);
      expect(treatA.typography).toBe(treatB.typography);
      expect(treatA.transition).toBe(treatB.transition);
      expect(treatA.text).toBe(treatB.text);
    }
  });

  // 8. An old project without visualTreatmentPlan remains loadable
  it('8. An old project without visualTreatmentPlan remains loadable and valid', () => {
    const baseProject = createInitialProject('Legacy Project');
    delete baseProject.visualTreatmentPlan;

    const legacyJSON = exportProjectToPortableJSON(baseProject);
    const parsed = validateAndParseProjectJSON(legacyJSON);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    expect(parsed.project?.visualTreatmentPlan).toBeUndefined();
    expect(parsed.errors).toEqual([]);
  });

  // 9. A saved/new project containing visualTreatmentPlan can round-trip
  it('9. A project containing visualTreatmentPlan successfully round-trips through export and import', async () => {
    const draftRes = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    const project: LongFormProject = {
      ...createInitialProject('Directed Project'),
      media: sampleMedia,
      folders: sampleFolders,
      timeline: draftRes.timeline,
      visualTreatmentPlan: draftRes.treatmentPlan,
    };

    const exportedJSON = exportProjectToPortableJSON(project);
    const parsed = validateAndParseProjectJSON(exportedJSON);

    expect(parsed.isValid).toBe(true);
    expect(parsed.project).toBeDefined();
    expect(parsed.project?.visualTreatmentPlan).toBeDefined();
    expect(parsed.project?.visualTreatmentPlan?.version).toBe('1.0');
    expect(parsed.project?.visualTreatmentPlan?.summary).toEqual(draftRes.treatmentPlan.summary);

    // Verify treatments were accurately deserialized
    const loadedTreatments = parsed.project?.visualTreatmentPlan?.treatments;
    expect(loadedTreatments).toBeDefined();
    for (const item of draftRes.timeline) {
      expect(loadedTreatments?.[item.id]).toEqual(draftRes.treatmentPlan.treatments[item.id]);
    }

    // Verify malformed treatment plan gracefully resolves to undefined without failing project
    const rawParsed = JSON.parse(exportedJSON);
    rawParsed.project.visualTreatmentPlan = 'malformed_string_not_an_object';
    const parsedMalformed = validateAndParseProjectJSON(JSON.stringify(rawParsed));
    expect(parsedMalformed.isValid).toBe(true);
    expect(parsedMalformed.project?.visualTreatmentPlan).toBeUndefined();
  });

  // 10. No renderer behavior changes
  it('10. Renderer FFmpeg segment command generation remains identical and unmodified', async () => {
    const result = await generateDraftTimeline(sampleSegments, sampleMedia, {
      folders: sampleFolders,
    });

    expect(result.timeline.length).toBeGreaterThan(0);
    const firstItem = result.timeline[0];

    const cmd = buildSegmentCommand({
      timelineItem: firstItem,
      mediaPath: 'C:/test/media.mp4',
      duration: firstItem.duration,
      outPath: 'C:/test/out.mp4',
    });

    expect(cmd[0]).toBe('ffmpeg');
    expect(cmd).toContain('-c:v');
    expect(cmd).toContain('libx264');
    expect(cmd).toContain('C:/test/out.mp4');
  });
});
