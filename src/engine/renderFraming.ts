/**
 * LongFormAI Render Framing & Geometry Synchronization
 *
 * Implements the single source of truth for converting TimelineItem transforms
 * into exact FFmpeg scale and crop coordinates for 1920x1080 16:9 output rendering.
 *
 * Invariant: What is framed inside PreviewCanvas's fixed 16:9 output frame is
 * identical in aspect ratio, scale, and placement to the rendered 1920x1080 video.
 */

export const TARGET_WIDTH = 1920;
export const TARGET_HEIGHT = 1080;
export const TARGET_ASPECT_RATIO = 16 / 9; // ~1.777777778
export const TARGET_FPS = 30;

export interface RenderClipGeometry {
  scaledWidth: number;
  scaledHeight: number;
  posX: number;
  posY: number;
  cropX: number;
  cropY: number;
  baseScale: number;
  totalScale: number;
  outputWidth: number;
  outputHeight: number;
  sourceAspectRatio: number;
  scaledAspectRatio: number;
}

/**
 * Calculates exact scaled dimensions and crop coordinates for 1920x1080 16:9 rendering.
 *
 * Preserves source aspect ratio strictly (uniform scaling factor applied to both width and height).
 * Matches PreviewCanvas.tsx direct canvas framing.
 */
export function calculateRenderClipGeometry(
  sourceWidth: number,
  sourceHeight: number,
  scale: number = 1.0,
  panX: number = 0.0,
  panY: number = 0.0
): RenderClipGeometry {
  const srcW = sourceWidth > 0 ? sourceWidth : TARGET_WIDTH;
  const srcH = sourceHeight > 0 ? sourceHeight : TARGET_HEIGHT;
  const sourceAspectRatio = srcW / srcH;

  // 1. Uniform base scale factor ensuring full 16:9 frame coverage with zero black bars
  // If sourceRatio < 16/9: baseScale = 1920 / srcW (fills 1920 width, overflows height)
  // If sourceRatio >= 16/9: baseScale = 1080 / srcH (fills 1080 height, overflows width)
  const baseScale = Math.max(TARGET_WIDTH / srcW, TARGET_HEIGHT / srcH);

  // 2. Uniform total scale factor including user zoom
  const userScale = Math.max(1.0, scale || 1.0);
  const totalScale = baseScale * userScale;

  // 3. Scaled dimensions (even integers for H.264 video codec compliance)
  const scaledWidth = Math.max(2, Math.round((srcW * totalScale) / 2) * 2);
  const scaledHeight = Math.max(2, Math.round((srcH * totalScale) / 2) * 2);

  // 4. Canvas top-left placement coordinates on 1920x1080 frame
  const deltaX = TARGET_WIDTH * ((panX || 0.0) / 100.0);
  const deltaY = TARGET_HEIGHT * ((panY || 0.0) / 100.0);

  const posX = Math.round((TARGET_WIDTH - scaledWidth) / 2 + deltaX);
  const posY = Math.round((TARGET_HEIGHT - scaledHeight) / 2 + deltaY);

  // 5. Crop offsets inside scaled footage for 1920x1080 window
  const rawCropX = Math.round((scaledWidth - TARGET_WIDTH) / 2 - deltaX);
  const rawCropY = Math.round((scaledHeight - TARGET_HEIGHT) / 2 - deltaY);

  const maxCropX = Math.max(0, scaledWidth - TARGET_WIDTH);
  const maxCropY = Math.max(0, scaledHeight - TARGET_HEIGHT);

  const cropX = Math.max(0, Math.min(maxCropX, rawCropX));
  const cropY = Math.max(0, Math.min(maxCropY, rawCropY));

  return {
    scaledWidth,
    scaledHeight,
    posX,
    posY,
    cropX,
    cropY,
    baseScale,
    totalScale,
    outputWidth: TARGET_WIDTH,
    outputHeight: TARGET_HEIGHT,
    sourceAspectRatio,
    scaledAspectRatio: scaledWidth / scaledHeight,
  };
}

/**
 * Generates the optimal FFmpeg video filter string for a clip.
 */
export function generateFFmpegVideoFilter(
  geom: RenderClipGeometry,
  fps: number = TARGET_FPS
): string {
  if (geom.scaledWidth >= TARGET_WIDTH && geom.scaledHeight >= TARGET_HEIGHT) {
    return `[0:v]scale=${geom.scaledWidth}:${geom.scaledHeight}:force_original_aspect_ratio=disable,crop=${TARGET_WIDTH}:${TARGET_HEIGHT}:${geom.cropX}:${geom.cropY},fps=${fps},setpts=PTS-STARTPTS[outv]`;
  }
  return `[0:v]scale=${geom.scaledWidth}:${geom.scaledHeight}:force_original_aspect_ratio=disable,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},setpts=PTS-STARTPTS[outv]`;
}
