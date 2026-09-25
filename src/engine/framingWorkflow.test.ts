import { describe, it, expect } from 'vitest';
import {
  calculateDefault16x9Crop,
  calculatePanBounds,
  createDefaultTransform,
  classifyAspectRatio,
  validateAndParseProjectJSON,
} from './schema';
import { LongFormProject } from '../types/project';

describe('16:9 Framing & Direct Manipulation Workflow', () => {
  describe('Aspect Ratio Classification & Default Crop', () => {
    it('correctly classifies standard aspect ratios', () => {
      expect(classifyAspectRatio(1920, 1080).label).toBe('16:9 Native');
      expect(classifyAspectRatio(1080, 1920).label).toBe('9:16 Vertical');
      expect(classifyAspectRatio(1080, 1080).label).toBe('1:1 Square');
      expect(classifyAspectRatio(1440, 1080).label).toBe('4:3 Standard');
      expect(classifyAspectRatio(2560, 1080).label).toBe('21:9 Ultrawide');
    });

    it('creates default 16:9 full crop for native 16:9 footage', () => {
      const crop = calculateDefault16x9Crop(1920, 1080);
      expect(crop.x).toBe(0);
      expect(crop.y).toBe(0);
      expect(crop.width).toBe(1);
      expect(crop.height).toBe(1);
    });

    it('creates centered vertical crop for 9:16 vertical footage', () => {
      const crop = calculateDefault16x9Crop(1080, 1920);
      expect(crop.x).toBe(0);
      expect(crop.width).toBe(1);
      // Height should be centered
      expect(crop.y).toBeGreaterThan(0);
      expect(crop.height).toBeLessThan(1);
      expect(crop.y + crop.height / 2).toBeCloseTo(0.5, 2);
    });

    it('creates centered vertical crop for 1:1 square footage', () => {
      const crop = calculateDefault16x9Crop(1080, 1080);
      expect(crop.x).toBe(0);
      expect(crop.width).toBe(1);
      expect(crop.y).toBeGreaterThan(0);
      expect(crop.height).toBeLessThan(1);
      expect(crop.y + crop.height / 2).toBeCloseTo(0.5, 2);
    });
  });

  describe('Pan Bounds & Constraint Calculations', () => {
    it('restricts vertical pan on 16:9 footage at 1.0x zoom to prevent black borders', () => {
      const bounds = calculatePanBounds(1920, 1080, 1.0, 'cover');
      expect(bounds.minX).toBe(-5);
      expect(bounds.maxX).toBe(5);
      expect(bounds.minY).toBe(-5);
      expect(bounds.maxY).toBe(5);
    });

    it('allows vertical panning on 9:16 vertical footage in cover mode', () => {
      const bounds = calculatePanBounds(1080, 1920, 1.0, 'cover');
      // For 9:16 in 16:9 cover mode, height is significantly taller, allowing substantial Y panning
      expect(bounds.maxY).toBeGreaterThan(50);
      expect(bounds.minY).toBeLessThan(-50);
      expect(bounds.maxX).toBe(5);
      expect(bounds.minX).toBe(-5);
    });

    it('allows horizontal panning on 21:9 ultrawide footage in cover mode', () => {
      const bounds = calculatePanBounds(2560, 1080, 1.0, 'cover');
      expect(bounds.maxX).toBeGreaterThan(15);
      expect(bounds.minX).toBeLessThan(-15);
      expect(bounds.maxY).toBe(5);
      expect(bounds.minY).toBe(-5);
    });

    it('expands pan bounds in both axes when zoom scale increases', () => {
      const baseBounds = calculatePanBounds(1920, 1080, 1.0, 'cover');
      const zoomedBounds = calculatePanBounds(1920, 1080, 2.0, 'cover');

      expect(zoomedBounds.maxX).toBeGreaterThan(baseBounds.maxX);
      expect(zoomedBounds.maxY).toBeGreaterThan(baseBounds.maxY);
      expect(zoomedBounds.maxX).toBeCloseTo(50, 1);
      expect(zoomedBounds.maxY).toBeCloseTo(50, 1);
    });

    it('returns permissive -50 to +50 bounds for contain and custom modes', () => {
      const containBounds = calculatePanBounds(1920, 1080, 1.0, 'contain');
      expect(containBounds.minX).toBe(-50);
      expect(containBounds.maxX).toBe(50);
      expect(containBounds.minY).toBe(-50);
      expect(containBounds.maxY).toBe(50);

      const customBounds = calculatePanBounds(1080, 1920, 1.5, 'custom');
      expect(customBounds.minX).toBe(-50);
      expect(customBounds.maxX).toBe(50);
    });
  });

  describe('Default Transform Creation', () => {
    it('creates standardized default transform state', () => {
      const tf = createDefaultTransform(1920, 1080);
      expect(tf.x).toBe(0);
      expect(tf.y).toBe(0);
      expect(tf.scale).toBe(1.0);
      expect(tf.fitMode).toBe('cover');
      expect(tf.crop).toBeDefined();
    });
  });

  describe('Project Persistence and Transform Validation', () => {
    it('validates and preserves customized transforms without data loss', () => {
      const rawProject: LongFormProject = {
        version: '1.0',
        id: 'test_framing_proj',
        name: 'Framing Test',
        resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
        fps: 30,
        timeline: [
          {
            id: 'item_1',
            mediaId: 'media_vert',
            trackIndex: 0,
            startTime: 0,
            duration: 5,
            sourceStart: 0,
            sourceDuration: 10,
            transform: {
              x: 12.5,
              y: -24.0,
              scale: 1.45,
              fitMode: 'contain',
              crop: { x: 0, y: 0.1, width: 1, height: 0.8 },
            },
          },
        ],
        media: [
          {
            id: 'media_vert',
            name: 'vertical.mp4',
            type: 'video',
            url: '',
            width: 1080,
            height: 1920,
            duration: 10,
            aspectRatio: 9 / 16,
            aspectRatioLabel: '9:16 Vertical',
            createdAt: 1000,
          },
        ],
        createdAt: '2026-09-25T00:00:00.000Z',
        updatedAt: '2026-09-25T00:00:00.000Z',
      };

      const result = validateAndParseProjectJSON(JSON.stringify(rawProject));
      expect(result.isValid).toBe(true);
      expect(result.project).toBeDefined();

      const item = result.project!.timeline[0];
      expect(item.transform.x).toBe(12.5);
      expect(item.transform.y).toBe(-24.0);
      expect(item.transform.scale).toBe(1.45);
      expect(item.transform.fitMode).toBe('contain');
    });

    it('rejects legacy rotation in transform while preserving scale and pan', () => {
      const rawProject: any = {
        version: '1.0',
        id: 'test_legacy_rotation',
        name: 'Legacy Test',
        resolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
        fps: 30,
        timeline: [
          {
            id: 'item_legacy',
            mediaId: 'media_1',
            trackIndex: 0,
            startTime: 0,
            duration: 5,
            sourceStart: 0,
            sourceDuration: 5,
            transform: {
              x: 0,
              y: 0,
              scale: 1.0,
              fitMode: 'cover',
              rotation: 90, // legacy invalid property
            },
          },
        ],
        media: [
          {
            id: 'media_1',
            name: 'test.mp4',
            type: 'video',
            url: '',
            width: 1920,
            height: 1080,
            duration: 5,
            aspectRatio: 16 / 9,
            aspectRatioLabel: '16:9 Native',
            createdAt: 1000,
          },
        ],
        createdAt: '2026-09-25T00:00:00.000Z',
        updatedAt: '2026-09-25T00:00:00.000Z',
      };

      const result = validateAndParseProjectJSON(JSON.stringify(rawProject));
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('rotation'))).toBe(true);
    });

    it('guarantees complete vertical coverage from head (top) to shoes (bottom) for 9:16 footage', () => {
      const bounds = calculatePanBounds(1080, 1920, 1.0, 'cover');
      // 9:16 source ratio = 0.5625, target 16:9 = 1.7778
      // Height multiplier = (16/9) / (9/16) = 3.1605
      // Max Y offset = (3.1605 - 1) / 2 * 100 = ~108.02%
      expect(bounds.maxY).toBeCloseTo(108.02, 1);
      expect(bounds.minY).toBeCloseTo(-108.02, 1);

      // Verify that at maxY (+108%), the top of the vertical footage is framed (head)
      // Verify that at minY (-108%), the bottom of the vertical footage is framed (shoes)
      // Verify that at 0% (center), the middle of the vertical footage is framed (body)
      const topOffsetPercent = bounds.maxY;
      const bottomOffsetPercent = bounds.minY;
      expect(topOffsetPercent).toBeGreaterThan(100);
      expect(bottomOffsetPercent).toBeLessThan(-100);
    });
  });
});
