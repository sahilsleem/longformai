import { describe, it, expect } from 'vitest';
import {
  calculateRenderClipGeometry,
  generateFFmpegVideoFilter,
  TARGET_WIDTH,
  TARGET_HEIGHT,
  TARGET_ASPECT_RATIO,
} from './renderFraming';
import { calculatePanBounds } from './schema';

describe('Render Framing & Aspect Ratio Fidelity Suite', () => {
  describe('Test A — Native 16:9 (1920x1080, 1280x720, 3840x2160)', () => {
    it('renders native 1920x1080 without scaling distortion or cropping at default 1.0x', () => {
      const geom = calculateRenderClipGeometry(1920, 1080, 1.0, 0, 0);

      expect(geom.scaledWidth).toBe(1920);
      expect(geom.scaledHeight).toBe(1080);
      expect(geom.cropX).toBe(0);
      expect(geom.cropY).toBe(0);
      expect(geom.posX).toBe(0);
      expect(geom.posY).toBe(0);
      expect(geom.scaledAspectRatio).toBeCloseTo(TARGET_ASPECT_RATIO, 4);

      const filter = generateFFmpegVideoFilter(geom);
      expect(filter).toContain('scale=1920:1080');
      expect(filter).toContain('crop=1920:1080:0:0');
    });

    it('scales 720p 16:9 (1280x720) up to 1080p uniformly preserving 16:9 ratio', () => {
      const geom = calculateRenderClipGeometry(1280, 720, 1.0, 0, 0);

      expect(geom.scaledWidth).toBe(1920);
      expect(geom.scaledHeight).toBe(1080);
      expect(geom.cropX).toBe(0);
      expect(geom.cropY).toBe(0);
      expect(geom.baseScale).toBeCloseTo(1.5, 4);
      expect(geom.scaledAspectRatio).toBeCloseTo(TARGET_ASPECT_RATIO, 4);
    });

    it('handles 4K 16:9 (3840x2160) with 1.5x zoom and pan offsets', () => {
      const geom = calculateRenderClipGeometry(3840, 2160, 1.5, 10, -5);

      expect(geom.scaledWidth).toBe(2880);
      expect(geom.scaledHeight).toBe(1620);
      // deltaX = 192, deltaY = -54
      // rawCropX = (2880 - 1920)/2 - 192 = 480 - 192 = 288
      // rawCropY = (1620 - 1080)/2 - (-54) = 270 + 54 = 324
      expect(geom.cropX).toBe(288);
      expect(geom.cropY).toBe(324);
      expect(geom.scaledAspectRatio).toBeCloseTo(TARGET_ASPECT_RATIO, 4);
    });
  });

  describe('Test B — Square 1:1 (1080x1080, 1000x1000, 600x600)', () => {
    it('preserves strict 1:1 aspect ratio without horizontal stretching for 1000x1000', () => {
      const geom = calculateRenderClipGeometry(1000, 1000, 1.0, 0, 0);

      // Width matches 1920, height is 1920
      expect(geom.scaledWidth).toBe(1920);
      expect(geom.scaledHeight).toBe(1920);
      expect(geom.scaledAspectRatio).toBe(1.0); // Exact 1:1 aspect ratio!

      // Center crop: (1920 - 1080) / 2 = 420
      expect(geom.cropX).toBe(0);
      expect(geom.cropY).toBe(420);

      const filter = generateFFmpegVideoFilter(geom);
      expect(filter).toContain('scale=1920:1920');
      expect(filter).toContain('crop=1920:1080:0:420');
    });

    it('correctly applies vertical pan on 1:1 square media', () => {
      // User panned up (+20% of 1080 frame = +216px) to show upper portion of square
      const geom = calculateRenderClipGeometry(1080, 1080, 1.0, 0, 20);

      expect(geom.scaledWidth).toBe(1920);
      expect(geom.scaledHeight).toBe(1920);
      expect(geom.cropX).toBe(0);
      // cropY = 420 - 216 = 204
      expect(geom.cropY).toBe(204);
    });
  });

  describe('Test C — Portrait 9:16 (1080x1920, 720x1280)', () => {
    it('preserves strict 9:16 aspect ratio and fills 1920 width with 0 black bars', () => {
      const geom = calculateRenderClipGeometry(1080, 1920, 1.0, 0, 0);

      expect(geom.scaledWidth).toBe(1920);
      expect(geom.scaledHeight).toBe(3414); // 1920 * (16/9) = 3413.33 -> 3414 (even int)
      expect(geom.scaledAspectRatio).toBeCloseTo(9 / 16, 2);

      // Centered vertical crop: (3414 - 1080) / 2 = 1167
      expect(geom.cropX).toBe(0);
      expect(geom.cropY).toBe(1167);

      const filter = generateFFmpegVideoFilter(geom);
      expect(filter).toContain('scale=1920:3414');
      expect(filter).toContain('crop=1920:1080:0:1167');
    });

    it('applies vertical panning bounds on 9:16 video without exposing empty space', () => {
      const bounds = calculatePanBounds(1080, 1920, 1.0, 'cover');

      // Pan at maximum top (+maxY)
      const geomTop = calculateRenderClipGeometry(1080, 1920, 1.0, 0, bounds.maxY);
      expect(geomTop.cropX).toBe(0);
      expect(geomTop.cropY).toBe(0); // Top of source is at top of 16:9 frame

      // Pan at maximum bottom (-minY)
      const geomBottom = calculateRenderClipGeometry(1080, 1920, 1.0, 0, bounds.minY);
      expect(geomBottom.cropX).toBe(0);
      expect(geomBottom.cropY).toBe(geomBottom.scaledHeight - TARGET_HEIGHT); // Bottom of source is at bottom of 16:9 frame
    });
  });

  describe('Test D — 4:3 Standard (1440x1080, 640x480)', () => {
    it('preserves strict 4:3 aspect ratio without stretching into 16:9', () => {
      const geom = calculateRenderClipGeometry(1440, 1080, 1.0, 0, 0);

      expect(geom.scaledWidth).toBe(1920);
      expect(geom.scaledHeight).toBe(1440);
      expect(geom.scaledAspectRatio).toBeCloseTo(4 / 3, 4);

      // Centered crop: (1440 - 1080) / 2 = 180
      expect(geom.cropX).toBe(0);
      expect(geom.cropY).toBe(180);

      const filter = generateFFmpegVideoFilter(geom);
      expect(filter).toContain('scale=1920:1440');
      expect(filter).toContain('crop=1920:1080:0:180');
    });
  });

  describe('Test E — Ultrawide 21:9 (2560x1080)', () => {
    it('preserves strict 21:9 aspect ratio and fills 1080 height with horizontal coverage', () => {
      const geom = calculateRenderClipGeometry(2560, 1080, 1.0, 0, 0);

      expect(geom.scaledWidth).toBe(2560);
      expect(geom.scaledHeight).toBe(1080);
      expect(geom.scaledAspectRatio).toBeCloseTo(2560 / 1080, 4);

      // Centered horizontal crop: (2560 - 1920) / 2 = 320
      expect(geom.cropX).toBe(320);
      expect(geom.cropY).toBe(0);

      const filter = generateFFmpegVideoFilter(geom);
      expect(filter).toContain('scale=2560:1080');
      expect(filter).toContain('crop=1920:1080:320:0');
    });

    it('correctly applies horizontal pan on 21:9 ultrawide media', () => {
      const bounds = calculatePanBounds(2560, 1080, 1.0, 'cover');

      // Pan to right edge (+maxX)
      const geomRight = calculateRenderClipGeometry(2560, 1080, 1.0, bounds.maxX, 0);
      expect(geomRight.cropX).toBe(0); // Left edge of source at left of 16:9 frame
      expect(geomRight.cropY).toBe(0);

      // Pan to left edge (minX)
      const geomLeft = calculateRenderClipGeometry(2560, 1080, 1.0, bounds.minX, 0);
      expect(geomLeft.cropX).toBe(2560 - 1920); // Right edge of source at right of 16:9 frame
      expect(geomLeft.cropY).toBe(0);
    });
  });

  describe('Test F — Mixed Timeline & Diverse Per-Clip Transforms', () => {
    it('maintains individual aspect ratios and independent transforms across 16:9 -> 1:1 -> 9:16 -> 4:3 -> 21:9 sequence', () => {
      const clips = [
        { name: '16:9 clip', w: 1920, h: 1080, scale: 1.0, panX: 0, panY: 0, expectedRatio: 16 / 9 },
        { name: '1:1 square', w: 1000, h: 1000, scale: 1.2, panX: 5, panY: -10, expectedRatio: 1.0 },
        { name: '9:16 portrait', w: 1080, h: 1920, scale: 1.0, panX: 0, panY: 15, expectedRatio: 9 / 16 },
        { name: '4:3 classic', w: 1440, h: 1080, scale: 1.5, panX: -8, panY: 4, expectedRatio: 4 / 3 },
        { name: '21:9 cinema', w: 2560, h: 1080, scale: 1.1, panX: 12, panY: 0, expectedRatio: 2560 / 1080 },
      ];

      for (const clip of clips) {
        const geom = calculateRenderClipGeometry(clip.w, clip.h, clip.scale, clip.panX, clip.panY);

        // Aspect ratio is strictly preserved
        expect(geom.scaledAspectRatio).toBeCloseTo(clip.expectedRatio, 2);

        // Scaled dimensions completely cover 1920x1080
        expect(geom.scaledWidth).toBeGreaterThanOrEqual(TARGET_WIDTH);
        expect(geom.scaledHeight).toBeGreaterThanOrEqual(TARGET_HEIGHT);

        // Crop coordinates are strictly within valid bounds
        expect(geom.cropX).toBeGreaterThanOrEqual(0);
        expect(geom.cropX).toBeLessThanOrEqual(geom.scaledWidth - TARGET_WIDTH);
        expect(geom.cropY).toBeGreaterThanOrEqual(0);
        expect(geom.cropY).toBeLessThanOrEqual(geom.scaledHeight - TARGET_HEIGHT);

        // Filter is valid and contains no non-proportional resize
        const filter = generateFFmpegVideoFilter(geom);
        expect(filter).toContain(`scale=${geom.scaledWidth}:${geom.scaledHeight}`);
        expect(filter).toContain(`crop=1920:1080:${geom.cropX}:${geom.cropY}`);
      }
    });
  });
});
