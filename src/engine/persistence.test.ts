import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveProjectLocal,
  loadProjectLocal,
  saveMediaBlob,
  getMediaBlob,
  deleteMediaBlob,
  clearLocalProject,
  hydrateProjectWithBlobs,
  sanitizeProjectForStorage,
} from './persistence';
import { LongFormProject, MediaAsset, TimelineItem } from '../types/project';
import { createInitialProject } from './schema';

describe('Local Persistence & Refresh Recovery Engine', () => {
  beforeEach(async () => {
    await clearLocalProject();
  });

  it('sanitizes project for storage by stripping transient file instances and object URLs', () => {
    const project = createInitialProject('Test Project');
    const mockFile = new File(['mock content'], 'test.mp4', { type: 'video/mp4' });
    const asset: MediaAsset = {
      id: 'media_1',
      name: 'test.mp4',
      type: 'video',
      url: 'blob:http://localhost:3000/12345',
      file: mockFile,
      width: 1920,
      height: 1080,
      duration: 10,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      createdAt: 1000,
    };
    project.media.push(asset);
    project.voiceover = {
      id: 'vo_1',
      name: 'voiceover.wav',
      type: 'audio',
      url: 'blob:http://localhost:3000/67890',
      file: mockFile,
      duration: 30,
      volume: 1,
      isMuted: false,
      createdAt: 1000,
    };

    const sanitized = sanitizeProjectForStorage(project);

    expect(sanitized.media[0].file).toBeUndefined();
    expect(sanitized.media[0].url).toBe('');
    expect(sanitized.media[0].name).toBe('test.mp4');
    expect(sanitized.media[0].duration).toBe(10);

    expect(sanitized.voiceover?.file).toBeUndefined();
    expect(sanitized.voiceover?.url).toBe('');
    expect(sanitized.voiceover?.name).toBe('voiceover.wav');
  });

  it('saves and loads project state with timeline items, transforms, and transcript segments', async () => {
    const project = createInitialProject('Video Master');
    project.timeline.push({
      id: 'clip_1',
      mediaId: 'media_1',
      trackIndex: 0,
      startTime: 0,
      duration: 5,
      sourceStart: 1.5,
      sourceDuration: 10,
      transform: {
        x: 12.5,
        y: -5.0,
        scale: 1.4,
        fitMode: 'cover',
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      },
      provenance: {
        sourceSegmentId: 'seg_1',
        originalScore: 0.85,
        adjustedScore: 0.92,
        explanation: 'Strong semantic match',
        reuseCount: 0,
      },
    });

    project.voiceover = {
      id: 'vo_1',
      name: 'voiceover.mp3',
      type: 'audio',
      url: '',
      duration: 15,
      volume: 0.8,
      isMuted: false,
      segments: [
        {
          id: 'seg_1',
          startTime: 0,
          endTime: 5,
          text: 'This is the edited narration segment.',
        },
      ],
      createdAt: Date.now(),
    };

    await saveProjectLocal(project);

    const loaded = await loadProjectLocal();
    expect(loaded).not.toBeNull();
    expect(loaded?.project.name).toBe('Video Master');
    expect(loaded?.project.timeline.length).toBe(1);

    const loadedClip = loaded?.project.timeline[0];
    expect(loadedClip?.transform.x).toBe(12.5);
    expect(loadedClip?.transform.y).toBe(-5.0);
    expect(loadedClip?.transform.scale).toBe(1.4);
    expect(loadedClip?.provenance?.explanation).toBe('Strong semantic match');

    expect(loaded?.project.voiceover?.segments?.[0].text).toBe(
      'This is the edited narration segment.'
    );
  });

  it('persists and retrieves media binary blobs and hydrates loaded projects', async () => {
    const dummyBlob = new Blob(['sample video binary data'], { type: 'video/mp4' });
    await saveMediaBlob('media_101', dummyBlob, 'clip.mp4', 'video');

    const retrieved = await getMediaBlob('media_101');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('clip.mp4');
    expect(retrieved?.type).toBe('video');

    const project = createInitialProject('Hydration Test');
    project.media.push({
      id: 'media_101',
      name: 'clip.mp4',
      type: 'video',
      url: '',
      width: 1920,
      height: 1080,
      duration: 12,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      createdAt: Date.now(),
    });

    const hydrated = await hydrateProjectWithBlobs(project);
    expect(hydrated.media[0].file).toBeDefined();
    expect(hydrated.media[0].file?.name).toBe('clip.mp4');
    expect(hydrated.media[0].url).toContain('blob:');
  });

  it('clears project and media stores on reset', async () => {
    const project = createInitialProject('To Be Reset');
    await saveProjectLocal(project);
    await saveMediaBlob('media_202', new Blob(['test']), 'test.mp4', 'video');

    await clearLocalProject();

    const loaded = await loadProjectLocal();
    expect(loaded).toBeNull();

    const retrievedBlob = await getMediaBlob('media_202');
    expect(retrievedBlob).toBeNull();
  });

  it('allows deleting individual media blobs', async () => {
    await saveMediaBlob('m_1', new Blob(['1']), '1.mp4', 'video');
    await saveMediaBlob('m_2', new Blob(['2']), '2.mp4', 'video');

    await deleteMediaBlob('m_1');

    expect(await getMediaBlob('m_1')).toBeNull();
    expect(await getMediaBlob('m_2')).not.toBeNull();
  });

  it('preserves existing timeline and framing when additional media assets are added', async () => {
    const project = createInitialProject('Multi-Asset Project');

    // Initial media & timeline
    const media1: MediaAsset = {
      id: 'm_1',
      name: 'first.mp4',
      type: 'video',
      url: '',
      width: 1920,
      height: 1080,
      duration: 10,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      createdAt: 100,
    };
    project.media.push(media1);

    const clip1: TimelineItem = {
      id: 'clip_1',
      mediaId: 'm_1',
      trackIndex: 0,
      startTime: 0,
      duration: 6,
      sourceStart: 2,
      sourceDuration: 10,
      transform: {
        x: 20,
        y: -10,
        scale: 1.5,
        fitMode: 'cover',
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
    };
    project.timeline.push(clip1);

    await saveProjectLocal(project);

    // Simulate adding 2 new media assets
    const media2: MediaAsset = {
      id: 'm_2',
      name: 'second.mp4',
      type: 'video',
      url: '',
      width: 1920,
      height: 1080,
      duration: 8,
      aspectRatio: 16 / 9,
      aspectRatioLabel: '16:9 Native',
      createdAt: 200,
    };
    const updatedProject: LongFormProject = {
      ...project,
      media: [...project.media, media2],
    };

    await saveProjectLocal(updatedProject);

    const reloaded = await loadProjectLocal();
    expect(reloaded?.project.media.length).toBe(2);
    expect(reloaded?.project.timeline.length).toBe(1);
    expect(reloaded?.project.timeline[0].transform.x).toBe(20);
    expect(reloaded?.project.timeline[0].transform.y).toBe(-10);
    expect(reloaded?.project.timeline[0].transform.scale).toBe(1.5);
  });
});
