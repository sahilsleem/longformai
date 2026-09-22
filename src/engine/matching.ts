import { MediaAsset, AudioSegment, SegmentMatchResult, SemanticMatchCandidate } from '../types/project';
import { getMatchingWorkerUrl } from '../config/workerConfig';

export interface MatchingWorkerStatus {
  online: boolean;
  engine?: string;
  defaultModel?: string;
  device?: string;
  modelLoaded?: boolean;
  modelCached?: boolean;
  state?: 'ready' | 'model_not_installed' | 'cached_unloaded' | 'loading' | 'error';
  error?: string;
}

export const DEFAULT_MATCHING_WORKER_URL = getMatchingWorkerUrl();

// Transient runtime cache to prevent redundant re-computation
const MATCH_CACHE = new Map<string, SegmentMatchResult>();

/**
 * Checks if the local semantic matching worker is running on port 8767.
 */
export async function checkMatchingWorkerHealth(
  workerUrl: string = getMatchingWorkerUrl()
): Promise<MatchingWorkerStatus> {
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
        engine: data.engine || 'transformers-all-MiniLM-L6-v2',
        defaultModel: data.model || 'sentence-transformers/all-MiniLM-L6-v2',
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
      error: `Local matching worker unreachable at ${workerUrl} (${msg})`,
    };
  }
}

/**
 * Matches a transcript segment against supplied media assets using genuine Step 5 semantic analysis.
 * Operates purely on-demand with local in-memory caching.
 */
export async function matchMediaForSegment(
  segment: AudioSegment,
  mediaAssets: MediaAsset[],
  options: { forceRefresh?: boolean; workerUrl?: string; topK?: number } = {}
): Promise<SegmentMatchResult> {
  const workerUrl = options.workerUrl || DEFAULT_MATCHING_WORKER_URL;
  const topK = options.topK || 5;
  const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}`;

  if (!options.forceRefresh && MATCH_CACHE.has(cacheKey)) {
    return MATCH_CACHE.get(cacheKey)!;
  }

  // 1. Check worker health
  const status = await checkMatchingWorkerHealth(workerUrl);
  if (!status.online) {
    const fallback: SegmentMatchResult = {
      segmentId: segment.id,
      segmentText: segment.text,
      status: 'error',
      candidates: [],
      unavailableCount: mediaAssets.length,
      modelUsed: 'none',
      matchedAt: Date.now(),
      error: 'Matching worker offline. (Start with: python server/matching_server.py)',
    };
    return fallback;
  }

  if (status.state === 'model_not_installed') {
    const fallback: SegmentMatchResult = {
      segmentId: segment.id,
      segmentText: segment.text,
      status: 'error',
      candidates: [],
      unavailableCount: mediaAssets.length,
      modelUsed: status.defaultModel || 'sentence-transformers/all-MiniLM-L6-v2',
      matchedAt: Date.now(),
      error: 'Matching model not installed locally. Run "python server/download_matching_model.py".',
    };
    return fallback;
  }

  // 2. Extract genuine Step 5 semantic data only (no filenames, no fake heuristics)
  const mediaPayload = mediaAssets.map((m) => {
    const semantic = m.analysis?.semantic;
    const keyframes = m.analysis?.keyframes || [];

    return {
      mediaId: m.id,
      mediaName: m.name,
      description: semantic?.description || m.analysis?.description || '',
      ocrText: semantic?.ocrText || m.analysis?.ocrText || undefined,
      tags: semantic?.tags || m.analysis?.tags || [],
      temporalSummary: semantic?.temporalSummary || undefined,
      keyframeDescriptions: keyframes
        .filter((kf) => Boolean(kf.description || kf.ocrText))
        .map((kf) => ({
          time: kf.time,
          description: kf.description || '',
          ocrText: kf.ocrText || undefined,
          tags: kf.tags || [],
        })),
    };
  });

  try {
    const response = await fetch(`${workerUrl}/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        segmentText: segment.text,
        mediaItems: mediaPayload,
        topK,
      }),
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

    const result: SegmentMatchResult = {
      segmentId: segment.id,
      segmentText: segment.text,
      status: data.status === 'no_analyzed_media' ? 'no_analyzed_media' : 'success',
      candidates: (data.candidates || []).map((c: SemanticMatchCandidate) => ({
        mediaId: c.mediaId,
        mediaName: c.mediaName,
        score: c.score,
        explanation: c.explanation,
        matchedSnippet: c.matchedSnippet,
      })),
      unavailableCount: data.unavailableCount ?? 0,
      modelUsed: data.modelUsed || 'sentence-transformers/all-MiniLM-L6-v2',
      matchedAt: Date.now(),
    };

    MATCH_CACHE.set(cacheKey, result);
    return result;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errResult: SegmentMatchResult = {
      segmentId: segment.id,
      segmentText: segment.text,
      status: 'error',
      candidates: [],
      unavailableCount: mediaAssets.length,
      modelUsed: 'sentence-transformers/all-MiniLM-L6-v2',
      matchedAt: Date.now(),
      error: errMsg,
    };
    return errResult;
  }
}
