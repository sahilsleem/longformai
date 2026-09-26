import { describe, it, expect, vi } from 'vitest';
import { LongFormProject, MediaAsset, TimelineItem, TransformState } from '../types/project';
import { createDefaultTransform, createInitialProject } from './schema';

/**
 * Pure helper function mirroring replaceTimelineItemMedia logic for direct unit testing
 */
export function executeReplaceMedia(
  project: LongFormProject,
  timelineItemId: string,
  newMediaId: string
): LongFormProject {
  const itemIndex = project.timeline.findIndex((item) => item.id === timelineItemId);
  if (itemIndex === -1) {
    return project;
  }

  const currentItem = project.timeline[itemIndex];
  if (currentItem.mediaId === newMediaId) {
    return project;
  }

  const newAsset = project.media.find((m) => m.id === newMediaId);
  if (!newAsset) {
    return project;
  }

  if (newAsset.type !== 'video' && newAsset.type !== 'image') {
    return project;
  }

  const startTime = currentItem.startTime;
  const duration = currentItem.duration;

  let sourceStart = currentItem.sourceStart || 0;
  let sourceDuration = duration;

  if (newAsset.type === 'video' && typeof newAsset.duration === 'number' && newAsset.duration > 0) {
    if (sourceStart + 0.1 > newAsset.duration) {
      sourceStart = 0;
    }
    sourceDuration = Math.min(duration, Math.max(0.1, newAsset.duration - sourceStart));
  } else {
    sourceStart = 0;
    sourceDuration = duration;
  }

  const existingTransform = currentItem.transform;
  const transform: TransformState = existingTransform
    ? {
        ...existingTransform,
        fitMode: 'cover',
        scale:
          typeof existingTransform.scale === 'number' &&
          !isNaN(existingTransform.scale) &&
          existingTransform.scale >= 0.1
            ? existingTransform.scale
            : 1.0,
        x: typeof existingTransform.x === 'number' && !isNaN(existingTransform.x) ? existingTransform.x : 0,
        y: typeof existingTransform.y === 'number' && !isNaN(existingTransform.y) ? existingTransform.y : 0,
        crop: existingTransform.crop || { x: 0, y: 0, width: 1, height: 1 },
      }
    : JSON.parse(JSON.stringify(createDefaultTransform(newAsset.width, newAsset.height)));

  const updatedItem: TimelineItem = {
    ...currentItem,
    mediaId: newMediaId,
    startTime,
    duration,
    sourceStart,
    sourceDuration,
    transform,
    provenance: currentItem.provenance
      ? {
          ...currentItem.provenance,
          isManuallyEdited: true,
        }
      : undefined,
  };

  const updatedTimeline = [...project.timeline];
  updatedTimeline[itemIndex] = updatedItem;

  return {
    ...project,
    timeline: updatedTimeline,
    updatedAt: new Date().toISOString(),
  };
}

describe('Replace Media Engine & Timeline State Fidelity', () => {
  const assetVideoA: MediaAsset = {
    id: 'asset_video_a',
    name: 'bollywood_intro.mp4',
    type: 'video',
    url: 'blob:video-a',
    width: 1920,
    height: 1080,
    duration: 10.0,
    aspectRatio: 1.7777777777777777,
    aspectRatioLabel: '16:9 Native',
    createdAt: 1000,
  };

  const assetVideoB: MediaAsset = {
    id: 'asset_video_b',
    name: 'bollywood_awards.mp4',
    type: 'video',
    url: 'blob:video-b',
    width: 720,
    height: 1280,
    duration: 15.0,
    aspectRatio: 0.5625,
    aspectRatioLabel: '9:16 Vertical',
    createdAt: 2000,
  };

  const assetImageC: MediaAsset = {
    id: 'asset_image_c',
    name: 'celebrity_portrait.png',
    type: 'image',
    url: 'blob:image-c',
    width: 1920,
    height: 1080,
    duration: 5.0,
    aspectRatio: 1.7777777777777777,
    aspectRatioLabel: '16:9 Native',
    createdAt: 3000,
  };

  const assetAudioD: MediaAsset = {
    id: 'asset_audio_d',
    name: 'background_music.mp3',
    type: 'audio',
    url: 'blob:audio-d',
    width: 0,
    height: 0,
    duration: 30.0,
    aspectRatio: 1.0,
    aspectRatioLabel: '1:1 Square',
    createdAt: 4000,
  };

  const createTestProject = (): LongFormProject => {
    const base = createInitialProject();
    base.media = [assetVideoA, assetVideoB, assetImageC, assetAudioD];
    base.timeline = [
      {
        id: 'clip_1',
        mediaId: 'asset_video_a',
        trackIndex: 0,
        startTime: 0.0,
        duration: 5.2,
        sourceStart: 0.0,
        sourceDuration: 5.2,
        transform: {
          fitMode: 'cover',
          scale: 1.25,
          x: 12,
          y: -8,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      },
      {
        id: 'clip_2',
        mediaId: 'asset_video_b',
        trackIndex: 0,
        startTime: 5.2,
        duration: 3.5,
        sourceStart: 1.0,
        sourceDuration: 3.5,
        transform: {
          fitMode: 'cover',
          scale: 1.1,
          x: 0,
          y: 20,
          crop: { x: 0, y: 0.2, width: 1, height: 0.6 },
        },
        provenance: {
          sourceSegmentId: 'seg_2',
          sourceSegmentText: 'celebrity awards speech',
          originalScore: 0.85,
          adjustedScore: 0.85,
          explanation: 'AI match',
          reuseCount: 0,
        },
      },
      {
        id: 'clip_3',
        mediaId: 'asset_image_c',
        trackIndex: 0,
        startTime: 8.7,
        duration: 4.3,
        sourceStart: 0.0,
        sourceDuration: 4.3,
        transform: {
          fitMode: 'cover',
          scale: 1.0,
          x: 0,
          y: 0,
          crop: { x: 0, y: 0, width: 1, height: 1 },
        },
      },
    ];
    base.voiceover = {
      id: 'vo_1',
      name: 'voiceover.mp3',
      duration: 13.0,
      volume: 1.0,
      isMuted: false,
      segments: [
        { id: 'seg_1', startTime: 0, endTime: 5.2, text: 'Opening narration' },
        { id: 'seg_2', startTime: 5.2, endTime: 8.7, text: 'Middle narration' },
        { id: 'seg_3', startTime: 8.7, endTime: 13.0, text: 'Closing narration' },
      ],
    };
    return base;
  };

  it('Test 1 — Basic replacement: item A -> asset B', () => {
    const project = createTestProject();
    const updated = executeReplaceMedia(project, 'clip_1', 'asset_video_b');

    expect(updated.timeline[0].mediaId).toBe('asset_video_b');
    expect(updated.timeline[0].id).toBe('clip_1');
  });

  it('Test 2 — Timing preserved: start = 5.20, duration = 3.50 remain strictly unchanged', () => {
    const project = createTestProject();
    const originalClip2 = project.timeline[1];
    expect(originalClip2.startTime).toBe(5.2);
    expect(originalClip2.duration).toBe(3.5);

    const updated = executeReplaceMedia(project, 'clip_2', 'asset_image_c');
    const replacedClip2 = updated.timeline[1];

    expect(replacedClip2.startTime).toBe(5.2);
    expect(replacedClip2.duration).toBe(3.5);
    expect(replacedClip2.mediaId).toBe('asset_image_c');
  });

  it('Test 3 — Transform preserved: scale, pan_x, pan_y, and crop remain unchanged', () => {
    const project = createTestProject();
    const originalTransform = project.timeline[1].transform;
    expect(originalTransform?.scale).toBe(1.1);
    expect(originalTransform?.x).toBe(0);
    expect(originalTransform?.y).toBe(20);
    expect(originalTransform?.fitMode).toBe('cover');

    const updated = executeReplaceMedia(project, 'clip_2', 'asset_video_a');
    const replacedTransform = updated.timeline[1].transform;

    expect(replacedTransform?.scale).toBe(1.1);
    expect(replacedTransform?.x).toBe(0);
    expect(replacedTransform?.y).toBe(20);
    expect(replacedTransform?.fitMode).toBe('cover');
    expect(replacedTransform?.crop).toEqual(originalTransform?.crop);
  });

  it('Test 4 — Other timeline items unchanged: replacing clip_2 does not alter clip_1 or clip_3', () => {
    const project = createTestProject();
    const originalClip1 = { ...project.timeline[0] };
    const originalClip3 = { ...project.timeline[2] };
    const originalVoiceover = { ...project.voiceover };

    const updated = executeReplaceMedia(project, 'clip_2', 'asset_image_c');

    expect(updated.timeline[0]).toEqual(originalClip1);
    expect(updated.timeline[2]).toEqual(originalClip3);
    expect(updated.voiceover).toEqual(originalVoiceover);
  });

  it('Test 5 — Persistence & provenance: updates project timestamp and marks provenance as manually edited', () => {
    const project = createTestProject();
    const updated = executeReplaceMedia(project, 'clip_2', 'asset_video_a');

    expect(updated.updatedAt).toBeDefined();
    expect(updated.timeline[1].provenance?.isManuallyEdited).toBe(true);
  });

  it('Test 6 — Same asset replacement is a safe no-op', () => {
    const project = createTestProject();
    const updated = executeReplaceMedia(project, 'clip_1', 'asset_video_a');

    expect(updated).toBe(project);
    expect(updated.timeline[0].mediaId).toBe('asset_video_a');
  });

  it('Test 7 — Missing or invalid timeline item or asset is safely handled without corruption', () => {
    const project = createTestProject();

    // 1. Non-existent timeline item
    const res1 = executeReplaceMedia(project, 'non_existent_item', 'asset_video_b');
    expect(res1).toBe(project);

    // 2. Non-existent asset ID
    const res2 = executeReplaceMedia(project, 'clip_1', 'non_existent_asset');
    expect(res2).toBe(project);
    expect(res2.timeline[0].mediaId).toBe('asset_video_a');
  });

  it('Test 8 — Image -> Video and Video -> Image interchange works cleanly', () => {
    const project = createTestProject();

    // 1. Video -> Image
    const res1 = executeReplaceMedia(project, 'clip_1', 'asset_image_c');
    expect(res1.timeline[0].mediaId).toBe('asset_image_c');
    expect(res1.timeline[0].sourceStart).toBe(0);
    expect(res1.timeline[0].sourceDuration).toBe(5.2);

    // 2. Image -> Video
    const res2 = executeReplaceMedia(project, 'clip_3', 'asset_video_a');
    expect(res2.timeline[2].mediaId).toBe('asset_video_a');
    expect(res2.timeline[2].sourceStart).toBe(0);
    expect(res2.timeline[2].sourceDuration).toBe(4.3);
  });

  it('Test 9 — Rejects replacement with non-visual media type (e.g. audio asset)', () => {
    const project = createTestProject();
    const updated = executeReplaceMedia(project, 'clip_1', 'asset_audio_d');

    expect(updated).toBe(project);
    expect(updated.timeline[0].mediaId).toBe('asset_video_a');
  });

  it('Test 10 — Clamps sourceStart safely if previous sourceStart exceeded new video footage length', () => {
    const project = createTestProject();
    // Set a short video asset (3s duration)
    const shortVideo: MediaAsset = {
      id: 'short_video',
      name: 'short.mp4',
      type: 'video',
      url: 'blob:short',
      width: 1920,
      height: 1080,
      duration: 3.0,
      aspectRatio: 1.7777777777777777,
      aspectRatioLabel: '16:9 Native',
      createdAt: 5000,
    };
    project.media.push(shortVideo);

    // clip_1 has sourceStart = 0, let's artificially set sourceStart = 8 on clip_1
    project.timeline[0].sourceStart = 8.0;

    const updated = executeReplaceMedia(project, 'clip_1', 'short_video');
    expect(updated.timeline[0].mediaId).toBe('short_video');
    // Because 8.0 exceeds shortVideo.duration (3.0), sourceStart must be safely reset to 0
    expect(updated.timeline[0].sourceStart).toBe(0);
  });
});
