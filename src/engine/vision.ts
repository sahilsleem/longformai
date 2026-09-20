import { MediaKeyframe, MediaSemanticAnalysis } from '../types/project';

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

export const DEFAULT_VISION_WORKER_URL = 'http://127.0.0.1:8766';

/**
 * Checks if the local vision worker is running on port 8766 and queries model state.
 */
export async function checkVisionWorkerHealth(
  workerUrl: string = DEFAULT_VISION_WORKER_URL
): Promise<VisionWorkerStatus> {
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
 * Sends keyframes to the local vision worker for semantic understanding.
 * Strictly avoids faking or heuristic generation if vision model fails.
 */
export async function analyzeKeyframesSemantics(
  keyframes: MediaKeyframe[],
  isVideo: boolean,
  duration: number = 0,
  workerUrl: string = DEFAULT_VISION_WORKER_URL
): Promise<MediaSemanticAnalysis> {
  const validKeyframes = keyframes.filter((k) => Boolean(k.imageData));

  if (validKeyframes.length === 0) {
    throw new Error('No valid keyframe image data available for semantic vision analysis.');
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
      keyframeDescriptions: (data.keyframeDescriptions || []).map(
        (kd: { time: number; description: string; tags: string[]; isKeyMoment?: boolean }) => ({
          time: kd.time,
          description: kd.description,
          tags: kd.tags || [],
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
