import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialProject,
  exportProjectToPortableJSON,
  validateAndParseProjectJSON,
  DEFAULT_BOLLYWOOD_FRAME,
} from './schema';
import { sanitizeProjectForStorage, saveProjectLocal, loadProjectLocal, clearLocalProject } from './persistence';
import { TimelineItem } from '../types/project';

describe('Project-Level Persistent Broadcast Frame', () => {
  beforeEach(async () => {
    await clearLocalProject();
  });

  it('initializes new projects with default enabled Bollywood frame', () => {
    const project = createInitialProject('Bollywood Project');
    expect(project.frame).toBeDefined();
    expect(project.frame?.enabled).toBe(true);
    expect(project.frame?.id).toBe('bollywood_broadcast_frame');
    expect(project.frame?.src).toBe('/assets/frames/bollywood_frame_overlay.png');
  });

  it('exports and validates frame configuration in portable JSON interchange', () => {
    const project = createInitialProject('Test Export Project');
    project.frame = {
      id: 'bollywood_broadcast_frame',
      name: 'Bollywood Broadcast Frame',
      enabled: false,
      src: '/assets/frames/bollywood_frame_overlay.png',
    };

    const jsonString = exportProjectToPortableJSON(project);
    const parseResult = validateAndParseProjectJSON(jsonString);

    expect(parseResult.isValid).toBe(true);
    expect(parseResult.project).toBeDefined();
    expect(parseResult.project?.frame).toBeDefined();
    expect(parseResult.project?.frame?.enabled).toBe(false);
    expect(parseResult.project?.frame?.id).toBe('bollywood_broadcast_frame');
  });

  it('gracefully adds default frame when importing legacy project JSON without frame field', () => {
    const legacyProject = {
      id: 'legacy_proj_1',
      version: '1.0',
      name: 'Legacy Video',
      resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
      fps: 30,
      media: [],
      timeline: [],
    };

    const jsonString = JSON.stringify(legacyProject);
    const parseResult = validateAndParseProjectJSON(jsonString);

    expect(parseResult.isValid).toBe(true);
    expect(parseResult.project).toBeDefined();
    expect(parseResult.project?.frame).toBeDefined();
    expect(parseResult.project?.frame?.enabled).toBe(true);
    expect(parseResult.project?.frame?.id).toBe(DEFAULT_BOLLYWOOD_FRAME.id);
  });

  it('preserves frame configuration across local persistence storage sanitization and reload', async () => {
    const project = createInitialProject('Persistent Frame Project');
    project.frame = {
      id: 'bollywood_broadcast_frame',
      name: 'Bollywood Broadcast Frame',
      enabled: true,
      src: '/assets/frames/bollywood_frame_overlay.png',
    };

    const sanitized = sanitizeProjectForStorage(project);
    expect(sanitized.frame).toBeDefined();
    expect(sanitized.frame?.enabled).toBe(true);

    await saveProjectLocal(sanitized);
    const loaded = await loadProjectLocal();

    expect(loaded).not.toBeNull();
    expect(loaded?.project).toBeDefined();
    expect(loaded?.project.frame?.enabled).toBe(true);
    expect(loaded?.project.frame?.id).toBe('bollywood_broadcast_frame');
  });

  it('toggling frame state operates independently from timeline items and clip transforms', () => {
    const project = createInitialProject('Multi Clip Project');
    
    const timelineItem: TimelineItem = {
      id: 'clip_1',
      mediaId: 'media_1',
      trackIndex: 0,
      startTime: 0,
      duration: 5,
      sourceStart: 0,
      sourceDuration: 5,
      transform: {
        x: 10,
        y: -15,
        scale: 1.25,
        fitMode: 'cover',
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
    };
    
    project.timeline.push(timelineItem);
    expect(project.frame?.enabled).toBe(true);

    // Toggle frame off
    project.frame = {
      ...project.frame!,
      enabled: false,
    };
    expect(project.frame.enabled).toBe(false);

    // Verify clip transform is untouched
    expect(project.timeline[0].transform.x).toBe(10);
    expect(project.timeline[0].transform.y).toBe(-15);
    expect(project.timeline[0].transform.scale).toBe(1.25);
    expect(project.timeline[0].duration).toBe(5);

    // Toggle frame back on
    project.frame = {
      ...project.frame,
      enabled: true,
    };
    expect(project.frame.enabled).toBe(true);
    expect(project.timeline[0].transform.x).toBe(10);
  });
});
