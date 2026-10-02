import { MediaKeyframe, MediaSemanticAnalysis, KeyframeSemantic, VisualChangeSegment } from '../types/project';
import { getVisionWorkerUrl } from '../config/workerConfig';
import { isNativeAndroid } from '../platform/androidMedia';
import { NativeBlip } from './NativeBlip';

export interface VisionWorkerStatus {
  online: boolean;
  engine?: string;
  defaultModel?: string;
  device?: string;
  modelLoaded?: boolean;
  modelCached?: boolean;
  state?: 'ready' | 'model_not_installed' | 'cached_unloaded' | 'loading' | 'error';
  error?: string;
}

export const DEFAULT_VISION_WORKER_URL = getVisionWorkerUrl();

// Stop words and generic stopwords matching server/vision_server.py
export const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'there', 'this', 'that', 'these', 'those', 'it', 'its', 'shows', 'showing', 'view', 'image', 'picture', 'photo'
]);

export const GENERIC_STOPWORDS = new Set([
  'scene', 'image', 'video', 'person', 'background', 'photo', 'clip', 'view', 'footage', 'shot',
  'the', 'a', 'of', 'in', 'on', 'and', 'frame'
]);

/**
 * Extracts clean semantic keywords from generated caption.
 * Exact behavioral replica of server/vision_server.py extract_tags_from_text.
 */
export function extractTagsFromText(text: string, maxTags: number = 6): string[] {
  const words = text.toLowerCase().match(/[a-zA-Z]{3,}/g) || [];
  const filtered = words.filter((w) => !STOP_WORDS.has(w));
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const w of filtered) {
    if (!seen.has(w)) {
      seen.add(w);
      tags.push(w);
    }
    if (tags.length >= maxTags) {
      break;
    }
  }
  return tags;
}

/**
 * Deduplicates and sorts tags across multiple frames, filtering generic stopwords.
 * Exact behavioral replica of server/vision_server.py aggregate_temporal_tags.
 */
export function aggregateTemporalTags(allTagsList: (string[] | string)[]): string[] {
  const tagCounts = new Map<string, number>();
  const flattened: string[] = [];
  for (const item of allTagsList) {
    if (Array.isArray(item)) {
      flattened.push(...item);
    } else if (typeof item === 'string') {
      flattened.push(item);
    }
  }

  for (const t of flattened) {
    const cleanT = t.toLowerCase().trim();
    if (cleanT && !GENERIC_STOPWORDS.has(cleanT)) {
      tagCounts.set(cleanT, (tagCounts.get(cleanT) || 0) + 1);
    }
  }

  const sortedUnique = Array.from(tagCounts.keys())
    .sort((a, b) => (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0))
    .slice(0, 10);

  if (sortedUnique.length === 0 && flattened.length > 0) {
    const seen = new Set<string>();
    const fallback: string[] = [];
    for (const t of flattened) {
      const cleanT = t.toLowerCase().trim();
      if (cleanT && !GENERIC_STOPWORDS.has(cleanT) && !seen.has(cleanT)) {
        seen.add(cleanT);
        fallback.push(cleanT);
      }
      if (fallback.length >= 8) break;
    }
    return fallback;
  }

  return sortedUnique;
}

/**
 * Builds a coherent temporal summary string from a sequence of frame descriptions.
 * Exact behavioral replica of server/vision_server.py build_temporal_summary.
 */
export function buildTemporalSummary(keyframeDescs: (string | { description: string })[]): string {
  if (!keyframeDescs || keyframeDescs.length === 0) {
    return 'Visual scene.';
  }

  const descriptions: string[] = [];
  for (const item of keyframeDescs) {
    if (typeof item === 'string') {
      descriptions.push(item);
    } else if (item && typeof item === 'object' && 'description' in item) {
      descriptions.push(item.description);
    }
  }

  if (descriptions.length <= 1) {
    return descriptions[0] || 'Visual scene.';
  }

  const distinctMoments: string[] = [];
  for (const d of descriptions) {
    const cleaned = d.replace(/\.+$/, '').trim();
    if (cleaned && (distinctMoments.length === 0 || distinctMoments[distinctMoments.length - 1].toLowerCase() !== cleaned.toLowerCase())) {
      distinctMoments.push(cleaned);
    }
  }

  if (distinctMoments.length === 1) {
    return `Video showing ${distinctMoments[0].toLowerCase()} throughout the clip.`;
  } else {
    const firstMoment = distinctMoments[0].toLowerCase();
    const subsequent = distinctMoments.slice(1, 4).map((m) => m.toLowerCase());
    const combinedParts = [firstMoment, ...subsequent.map((m) => `later ${m}`)];
    return `Video sequence showing ${combinedParts.join('; ')}.`;
  }
}

/**
 * Computes normalized mean absolute pixel difference between two images at 64x36 resolution.
 * Matches server/vision_server.py compute_image_difference.
 */
export async function computeImageDifference(dataUrl1: string, dataUrl2: string): Promise<number> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return 0;
  }
  return new Promise((resolve) => {
    const img1 = new Image();
    const img2 = new Image();
    let loaded1 = false;
    let loaded2 = false;

    const checkBoth = () => {
      if (!loaded1 || !loaded2) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 36;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(0);
          return;
        }

        ctx.drawImage(img1, 0, 0, 64, 36);
        const data1 = ctx.getImageData(0, 0, 64, 36).data;

        ctx.clearRect(0, 0, 64, 36);
        ctx.drawImage(img2, 0, 0, 64, 36);
        const data2 = ctx.getImageData(0, 0, 64, 36).data;

        let totalDiff = 0;
        const pixelCount = 64 * 36;
        for (let i = 0; i < data1.length; i += 4) {
          const g1 = 0.299 * data1[i] + 0.587 * data1[i + 1] + 0.114 * data1[i + 2];
          const g2 = 0.299 * data2[i] + 0.587 * data2[i + 1] + 0.114 * data2[i + 2];
          totalDiff += Math.abs(g1 - g2);
        }
        resolve(totalDiff / (pixelCount * 255.0));
      } catch {
        resolve(0);
      }
    };

    img1.onload = () => { loaded1 = true; checkBoth(); };
    img2.onload = () => { loaded2 = true; checkBoth(); };
    img1.onerror = () => resolve(0);
    img2.onerror = () => resolve(0);
    img1.src = dataUrl1;
    img2.src = dataUrl2;
  });
}

/**
 * Native Android Media Intelligence implementation using NativeBlip.
 * Runs on-device with zero localhost or Python worker dependency.
 */
export async function analyzeKeyframesNativeAndroid(
  keyframes: MediaKeyframe[],
  isVideo: boolean,
  _duration: number = 0
): Promise<MediaSemanticAnalysis> {
  const validKeyframes = keyframes.filter((k) => Boolean(k.imageData));
  if (validKeyframes.length === 0) {
    throw new Error('No valid keyframe image data available for native Android vision analysis.');
  }

  // 1. Ensure Native BLIP engine is initialized
  try {
    const status = await NativeBlip.isReady();
    if (!status.ready) {
      const initRes = await NativeBlip.initialize();
      if (!initRes.ready && initRes.state === 'error') {
        throw new Error(initRes.error || 'Failed to initialize Native BLIP');
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Native Android BLIP initialization failed: ${msg}`);
  }

  const keyframeResults: KeyframeSemantic[] = [];
  const descriptions: string[] = [];
  const allTags: string[] = [];

  // 2. Sequential inference per frame (preserves memory on device)
  for (let i = 0; i < validKeyframes.length; i++) {
    const kf = validKeyframes[i];
    try {
      const res = await NativeBlip.generateCaption({ imageData: kf.imageData! });
      if (!res || res.status !== 'success' || !res.caption) {
        throw new Error(`Native BLIP returned unsuccessful response at ${kf.time}s`);
      }

      const desc = res.caption.trim();
      const tags = extractTagsFromText(desc);

      descriptions.push(desc);
      allTags.push(...tags);

      keyframeResults.push({
        time: kf.time,
        description: desc,
        tags,
        ocrText: undefined,
        ocrConfidence: undefined,
        isKeyMoment: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Native Android BLIP inference failed on keyframe at ${kf.time}s: ${msg}`);
    }
  }

  // 3. Temporal Visual Change Detection
  const visualChanges: VisualChangeSegment[] = [];
  let hasVisualChange = false;

  if (isVideo && validKeyframes.length > 1) {
    for (let i = 0; i < validKeyframes.length - 1; i++) {
      const diff = await computeImageDifference(validKeyframes[i].imageData!, validKeyframes[i + 1].imageData!);
      const t1 = validKeyframes[i].time;
      const t2 = validKeyframes[i + 1].time;

      if (diff >= 0.12) {
        hasVisualChange = true;
        const changeDesc = `Visual change detected between ${t1.toFixed(1)}s and ${t2.toFixed(1)}s.`;
        visualChanges.push({
          fromTime: t1,
          toTime: t2,
          differenceScore: Math.round(diff * 1000) / 1000,
          description: changeDesc,
        });
        if (i + 1 < keyframeResults.length) {
          keyframeResults[i + 1].isKeyMoment = true;
        }
      }
    }
  }

  // 4. Informative Frame Selection
  const seenConcepts = new Set<string>();
  for (let idx = 0; idx < keyframeResults.length; idx++) {
    const kr = keyframeResults[idx];
    const newConcepts = kr.tags.filter((t) => !seenConcepts.has(t));
    if (newConcepts.length >= 2 || idx === 0) {
      kr.isKeyMoment = true;
    }
    for (const t of kr.tags) {
      seenConcepts.add(t);
    }
  }

  // 5. Temporal Tag Aggregation
  const sortedUniqueTags = aggregateTemporalTags(allTags);

  // 6. Temporal Semantic Summary
  let overallDescription: string;
  let temporalSummary: string | undefined = undefined;

  if (isVideo && descriptions.length > 1) {
    overallDescription = buildTemporalSummary(keyframeResults);
    temporalSummary = overallDescription;
  } else {
    overallDescription = descriptions[0] || 'Visual scene.';
    temporalSummary = undefined;
  }

  return {
    analyzed: true,
    description: overallDescription,
    tags: sortedUniqueTags,
    ocrText: undefined,
    ocrConfidence: undefined,
    keyframeDescriptions: keyframeResults,
    temporalSummary,
    hasVisualChange,
    visualChanges,
    modelUsed: 'Salesforce/blip-image-captioning-base (Native Android)',
    analyzedAt: Date.now(),
  };
}

/**
 * Checks if the local vision worker is running on port 8766 and queries model state.
 * On Android, queries native BLIP plugin state without network calls.
 */
export async function checkVisionWorkerHealth(
  workerUrl: string = getVisionWorkerUrl()
): Promise<VisionWorkerStatus> {
  if (isNativeAndroid()) {
    try {
      const status = await NativeBlip.isReady();
      return {
        online: true,
        engine: 'onnxruntime-android-blip',
        defaultModel: 'Salesforce/blip-image-captioning-base',
        device: 'arm64',
        modelLoaded: Boolean(status.ready),
        modelCached: true,
        state: status.ready ? 'ready' : (status.state === 'error' ? 'error' : 'cached_unloaded'),
        error: status.error,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        online: true,
        engine: 'onnxruntime-android-blip',
        defaultModel: 'Salesforce/blip-image-captioning-base',
        device: 'arm64',
        modelLoaded: false,
        modelCached: true,
        state: 'cached_unloaded',
        error: msg,
      };
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${workerUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        online: true,
        engine: data.engine || 'transformers-blip',
        defaultModel: data.model || 'Salesforce/blip-image-captioning-base',
        device: data.device || 'cpu',
        modelLoaded: Boolean(data.model_loaded),
        modelCached: Boolean(data.model_cached),
        state: data.state || (data.model_loaded ? 'ready' : data.model_cached ? 'cached_unloaded' : 'model_not_installed'),
        error: data.error || undefined,
      };
    }
    return { online: false, error: `Worker returned HTTP ${res.status}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      online: false,
      error: `Local vision worker unreachable at ${workerUrl} (${msg})`,
    };
  }
}

/**
 * Sends keyframes to the vision engine for semantic understanding.
 * On Android: routes directly to native on-device BLIP engine.
 * On Desktop/Browser: queries local Python vision worker on port 8766.
 */
export async function analyzeKeyframesSemantics(
  keyframes: MediaKeyframe[],
  isVideo: boolean,
  duration: number = 0,
  workerUrl: string = getVisionWorkerUrl()
): Promise<MediaSemanticAnalysis> {
  const validKeyframes = keyframes.filter((k) => Boolean(k.imageData));

  if (validKeyframes.length === 0) {
    throw new Error('No valid keyframe image data available for semantic vision analysis.');
  }

  if (isNativeAndroid()) {
    return analyzeKeyframesNativeAndroid(validKeyframes, isVideo, duration);
  }

  const payload = {
    isVideo,
    duration,
    keyframes: validKeyframes.map((k) => ({
      time: k.time,
      imageData: k.imageData,
    })),
  };

  try {
    const response = await fetch(`${workerUrl}/analyze-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        detail = errorJson.detail || detail;
      } catch {
        // fallback
      }
      throw new Error(detail);
    }

    const data = await response.json();

    return {
      analyzed: true,
      description: data.description || '',
      tags: data.tags || [],
      ocrText: data.ocrText || undefined,
      ocrConfidence: typeof data.ocrConfidence === 'number' ? data.ocrConfidence : undefined,
      keyframeDescriptions: (data.keyframeDescriptions || []).map(
        (kd: { time: number; description: string; tags: string[]; ocrText?: string; ocrConfidence?: number; isKeyMoment?: boolean }) => ({
          time: kd.time,
          description: kd.description,
          tags: kd.tags || [],
          ocrText: kd.ocrText || undefined,
          ocrConfidence: kd.ocrConfidence,
          isKeyMoment: Boolean(kd.isKeyMoment),
        })
      ),
      temporalSummary: data.temporalSummary || undefined,
      hasVisualChange: Boolean(data.hasVisualChange),
      visualChanges: data.visualChanges || [],
      modelUsed: data.modelUsed || 'Salesforce/blip-image-captioning-base',
      analyzedAt: Date.now(),
    };
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(
        `Local vision worker is not running on ${workerUrl}. Start it using: python server/vision_server.py`
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Explicitly releases Native BLIP in-memory ONNX Runtime sessions on Android.
 */
export async function releaseVisionModel(): Promise<void> {
  if (isNativeAndroid()) {
    try {
      await NativeBlip.releaseModel();
    } catch (e) {
      console.warn('Failed to release NativeBlip model:', e);
    }
  }
}
