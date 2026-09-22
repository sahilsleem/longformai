import { MediaAsset, MediaAnalysis, MediaKeyframe, VisualFeatures } from '../types/project';
import { analyzeKeyframesSemantics, checkVisionWorkerHealth } from './vision';

/**
 * Deterministic timestamp planner for representative keyframes.
 * Keeps frame count low (2 to 6 frames maximum) for optimal performance.
 */
export function calculateKeyframeTimestamps(duration: number): number[] {
  if (!duration || duration <= 0) return [0];

  if (duration <= 3.0) {
    return [0, Math.round(duration * 0.5 * 100) / 100];
  } else if (duration <= 8.0) {
    return [0, Math.round(duration * 0.5 * 100) / 100, Math.round(duration * 0.9 * 100) / 100];
  } else if (duration <= 20.0) {
    return [
      0,
      Math.round(duration * 0.33 * 100) / 100,
      Math.round(duration * 0.66 * 100) / 100,
      Math.round(duration * 0.95 * 100) / 100,
    ];
  } else {
    // Longer videos: strictly capped at 5 representative frames (beginning, early-mid, center, late-mid, end)
    return [
      0,
      Math.round(duration * 0.25 * 100) / 100,
      Math.round(duration * 0.50 * 100) / 100,
      Math.round(duration * 0.75 * 100) / 100,
      Math.round(duration * 0.95 * 100) / 100,
    ];
  }
}

/**
 * Calculates brightness, contrast, and dominant color palette from a canvas context.
 */
function extractCanvasVisualFeatures(canvas: HTMLCanvasElement): {
  brightness: number;
  contrast: number;
  dominantColors: string[];
} {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { brightness: 0.5, contrast: 0.5, dominantColors: ['#3b82f6', '#1e293b'] };
  }

  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  let totalLuminance = 0;
  const luminances: number[] = [];
  const colorBuckets: { [hex: string]: number } = {};

  const step = Math.max(1, Math.floor(totalPixels / 1000));

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    totalLuminance += lum;
    luminances.push(lum);

    const qr = Math.floor(r / 48) * 48;
    const qg = Math.floor(g / 48) * 48;
    const qb = Math.floor(b / 48) * 48;
    const hex = `#${((1 << 24) + (qr << 16) + (qg << 8) + qb).toString(16).slice(1)}`;
    colorBuckets[hex] = (colorBuckets[hex] || 0) + 1;
  }

  const sampleCount = luminances.length || 1;
  const avgBrightness = totalLuminance / sampleCount;

  let varianceSum = 0;
  for (const lum of luminances) {
    varianceSum += Math.pow(lum - avgBrightness, 2);
  }
  const contrast = Math.min(1.0, Math.sqrt(varianceSum / sampleCount) * 2);

  const sortedColors = Object.entries(colorBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([hex]) => hex);

  return {
    brightness: Math.round(avgBrightness * 100) / 100,
    contrast: Math.round(contrast * 100) / 100,
    dominantColors: sortedColors.length > 0 ? sortedColors : ['#3b82f6', '#1e293b'],
  };
}

/**
 * Analyzes an Image asset locally in the browser (deterministic step).
 */
async function extractImageDeterministic(asset: MediaAsset): Promise<{
  visualFeatures: VisualFeatures;
  keyframes: MediaKeyframe[];
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const thumbWidth = 160;
      const thumbHeight = Math.max(90, Math.round((thumbWidth / (asset.width || 160)) * (asset.height || 90)));
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
      }

      const { brightness, contrast, dominantColors } = extractCanvasVisualFeatures(canvas);
      const thumbnailData = canvas.toDataURL('image/jpeg', 0.65);

      const ratio = asset.width / (asset.height || 1);
      const orientation: 'landscape' | 'portrait' | 'square' =
        ratio > 1.15 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square';

      const visualFeatures: VisualFeatures = {
        brightness,
        contrast,
        dominantColors,
        orientation,
      };

      const keyframes: MediaKeyframe[] = [
        {
          time: 0,
          imageData: thumbnailData,
          isKeyMoment: true,
        },
      ];

      resolve({ visualFeatures, keyframes });
    };

    img.onerror = () => {
      reject(new Error('Failed to decode image data locally.'));
    };

    img.src = asset.url;
  });
}

/**
 * Analyzes a Video asset locally (deterministic step).
 */
async function extractVideoDeterministic(asset: MediaAsset): Promise<{
  visualFeatures: VisualFeatures;
  keyframes: MediaKeyframe[];
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;

    const timestamps = calculateKeyframeTimestamps(asset.duration || 5);
    const keyframes: MediaKeyframe[] = [];
    let currentIndex = 0;
    let accumulatedBrightness = 0;
    let accumulatedContrast = 0;
    const accumulatedColors: { [hex: string]: number } = {};

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const captureCurrentFrame = () => {
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      const { brightness, contrast, dominantColors } = extractCanvasVisualFeatures(canvas);
      accumulatedBrightness += brightness;
      accumulatedContrast += contrast;
      dominantColors.forEach((hex) => {
        accumulatedColors[hex] = (accumulatedColors[hex] || 0) + 1;
      });

      const thumbData = canvas.toDataURL('image/jpeg', 0.6);
      keyframes.push({
        time: timestamps[currentIndex],
        imageData: thumbData,
        isKeyMoment: currentIndex === 0,
      });

      currentIndex++;
      if (currentIndex < timestamps.length) {
        video.currentTime = timestamps[currentIndex];
      } else {
        finalize();
      }
    };

    const finalize = () => {
      const count = Math.max(1, timestamps.length);
      const avgBrightness = Math.round((accumulatedBrightness / count) * 100) / 100;
      const avgContrast = Math.round((accumulatedContrast / count) * 100) / 100;
      const topColors = Object.entries(accumulatedColors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([hex]) => hex);

      const ratio = asset.width / (asset.height || 1);
      const orientation: 'landscape' | 'portrait' | 'square' =
        ratio > 1.15 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square';

      const visualFeatures: VisualFeatures = {
        brightness: avgBrightness,
        contrast: avgContrast,
        dominantColors: topColors.length > 0 ? topColors : ['#3b82f6', '#1e293b'],
        orientation,
      };

      video.removeAttribute('src');
      video.load();

      resolve({ visualFeatures, keyframes });
    };

    video.onloadedmetadata = () => {
      video.currentTime = timestamps[0];
    };

    video.onseeked = () => {
      captureCurrentFrame();
    };

    video.onerror = () => {
      reject(new Error('Failed to seek video frames for local analysis.'));
    };

    setTimeout(() => {
      if (keyframes.length > 0) {
        finalize();
      } else {
        reject(new Error('Video frame extraction timed out.'));
      }
    }, 12000);

    video.src = asset.url;
  });
}

/**
 * Main media analysis entry point.
 * Combines deterministic pixel statistics with local vision model inference.
 * Strictly avoids fake heuristics if vision model is unavailable.
 */
export async function analyzeMediaAsset(
  asset: MediaAsset,
  options: { runSemantic?: boolean } = { runSemantic: true }
): Promise<MediaAnalysis> {
  if (asset.type === 'audio') {
    return {
      analyzed: true,
      duration: asset.duration,
      analyzedAt: Date.now(),
    };
  }

  // 1. Deterministic Step: Extract keyframes & visualFeatures
  let visualFeatures = asset.analysis?.visualFeatures;
  let keyframes = asset.analysis?.keyframes;

  if (!visualFeatures || !keyframes || keyframes.length === 0) {
    const deterministic =
      asset.type === 'image'
        ? await extractImageDeterministic(asset)
        : await extractVideoDeterministic(asset);
    visualFeatures = deterministic.visualFeatures;
    keyframes = deterministic.keyframes;
  }

  // 2. Semantic Step: Call local vision model if requested
  let semantic = asset.analysis?.semantic;
  let description: string | undefined = undefined;
  let tags: string[] = [];
  let error: string | undefined = undefined;

  if (options.runSemantic !== false && keyframes.length > 0) {
    try {
      const workerStatus = await checkVisionWorkerHealth();
      if (!workerStatus.online) {
        error = 'Local vision worker is offline. (Start with: python server/vision_server.py)';
        semantic = { analyzed: false, description: '', tags: [] };
      } else if (workerStatus.state === 'model_not_installed') {
        error = 'Vision model not installed locally. Run "python server/download_model.py" to download weights.';
        semantic = { analyzed: false, description: '', tags: [] };
      } else {
        semantic = await analyzeKeyframesSemantics(
          keyframes,
          asset.type === 'video',
          asset.duration
        );
        description = semantic.description;
        tags = semantic.tags;

        // Enrich keyframes with individual descriptions, OCR, & key moments
        if (semantic.keyframeDescriptions && semantic.keyframeDescriptions.length > 0) {
          keyframes = keyframes.map((kf) => {
            const match = semantic?.keyframeDescriptions?.find((kd) => Math.abs(kd.time - kf.time) < 0.2);
            return match
              ? {
                  ...kf,
                  description: match.description,
                  tags: match.tags,
                  ocrText: match.ocrText ?? kf.ocrText,
                  ocrConfidence: match.ocrConfidence ?? kf.ocrConfidence,
                  isKeyMoment: match.isKeyMoment ?? kf.isKeyMoment,
                }
              : kf;
          });
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('Semantic vision analysis unavailable:', errMsg);
      error = errMsg;
      semantic = {
        analyzed: false,
        description: '',
        tags: [],
      };
      description = undefined;
      tags = [];
    }
  }

  return {
    analyzed: true,
    duration: asset.duration,
    visualFeatures,
    keyframes,
    semantic,
    description: description || undefined,
    tags: tags.length > 0 ? tags : undefined,
    ocrText: semantic?.ocrText || undefined,
    ocrConfidence: semantic?.ocrConfidence || undefined,
    error,
    analyzedAt: Date.now(),
  };
}
