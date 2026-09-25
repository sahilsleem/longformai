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

// Health status cache to prevent redundant /health pings
let lastHealthCheck: { status: MatchingWorkerStatus; timestamp: number } | null = null;
const HEALTH_CACHE_TTL_MS = 30_000;

export function clearMatchingCache(): void {
  MATCH_CACHE.clear();
  lastHealthCheck = null;
}

/**
 * Checks if the local semantic matching worker is running on port 8767.
 * Health check result is cached with a short TTL to prevent spamming /health across loops.
 */
export async function checkMatchingWorkerHealth(
  workerUrl: string = getMatchingWorkerUrl(),
  options: { forceRefresh?: boolean } = {}
): Promise<MatchingWorkerStatus> {
  const now = Date.now();
  if (!options.forceRefresh && lastHealthCheck && now - lastHealthCheck.timestamp < HEALTH_CACHE_TTL_MS) {
    return lastHealthCheck.status;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 250);

    const res = await fetch(`${workerUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const status: MatchingWorkerStatus = {
        online: true,
        engine: data.engine || 'transformers-all-MiniLM-L6-v2',
        defaultModel: data.model || 'sentence-transformers/all-MiniLM-L6-v2',
        device: data.device || 'cpu',
        modelLoaded: Boolean(data.model_loaded),
        modelCached: Boolean(data.model_cached),
        state: data.state || (data.model_loaded ? 'ready' : data.model_cached ? 'cached_unloaded' : 'model_not_installed'),
        error: data.error || undefined,
      };
      lastHealthCheck = { status, timestamp: now };
      return status;
    }
    const status: MatchingWorkerStatus = { online: false, error: `Worker returned HTTP ${res.status}` };
    lastHealthCheck = { status, timestamp: now };
    return status;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status: MatchingWorkerStatus = {
      online: false,
      error: `Local matching worker unreachable at ${workerUrl} (${msg})`,
    };
    lastHealthCheck = { status, timestamp: now };
    return status;
  }
}

/**
 * Extracts genuine Step 5 semantic payload from media assets.
 */
export function extractMediaPayload(mediaAssets: MediaAsset[]) {
  return mediaAssets.map((m) => {
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

  // 1. Check worker health (cached)
  const status = await checkMatchingWorkerHealth(workerUrl, { forceRefresh: options.forceRefresh });
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
    MATCH_CACHE.set(cacheKey, fallback);
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
    MATCH_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  // 2. Extract genuine Step 5 semantic data only (no filenames, no fake heuristics)
  const mediaPayload = extractMediaPayload(mediaAssets);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${workerUrl}/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        segmentText: segment.text,
        mediaItems: mediaPayload,
        topK,
      }),
    });
    clearTimeout(timeoutId);

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
    MATCH_CACHE.set(cacheKey, errResult);
    return errResult;
  }
}

/**
 * Batch-matches multiple transcript segments in a single network call, caching all results.
 */
export async function batchMatchMediaForSegments(
  segments: AudioSegment[],
  mediaAssets: MediaAsset[],
  options: { forceRefresh?: boolean; workerUrl?: string; topK?: number } = {}
): Promise<Map<string, SegmentMatchResult>> {
  const resultsMap = new Map<string, SegmentMatchResult>();
  if (!segments || segments.length === 0) return resultsMap;

  const workerUrl = options.workerUrl || DEFAULT_MATCHING_WORKER_URL;
  const topK = options.topK || 15;

  // 1. Check worker health once
  const health = await checkMatchingWorkerHealth(workerUrl, { forceRefresh: options.forceRefresh });
  if (!health.online || health.state === 'model_not_installed') {
    for (const segment of segments) {
      const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}`;
      const fallback: SegmentMatchResult = {
        segmentId: segment.id,
        segmentText: segment.text,
        status: 'error',
        candidates: [],
        unavailableCount: mediaAssets.length,
        modelUsed: health.defaultModel || 'sentence-transformers/all-MiniLM-L6-v2',
        matchedAt: Date.now(),
        error: health.error || (!health.online ? 'Matching worker offline.' : 'Matching model not installed.'),
      };
      MATCH_CACHE.set(cacheKey, fallback);
      resultsMap.set(segment.id, fallback);
    }
    return resultsMap;
  }

  // 2. Format media payload
  const mediaPayload = extractMediaPayload(mediaAssets);

  // 3. Find uncached segments
  const uncachedSegments: AudioSegment[] = [];
  for (const segment of segments) {
    const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}`;
    if (!options.forceRefresh && MATCH_CACHE.has(cacheKey)) {
      resultsMap.set(segment.id, MATCH_CACHE.get(cacheKey)!);
    } else {
      uncachedSegments.push(segment);
    }
  }

  if (uncachedSegments.length === 0) {
    return resultsMap;
  }

  // 4. Try single batch endpoint
  let batchSupported = true;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${workerUrl}/match/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        segments: uncachedSegments.map((s) => ({ id: s.id, text: s.text })),
        mediaItems: mediaPayload,
        topK,
      }),
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const batchResults = data.results || [];
      for (const item of batchResults) {
        const seg = uncachedSegments.find((s) => s.id === item.segmentId) || { id: item.segmentId, text: item.segmentText };
        const res: SegmentMatchResult = {
          segmentId: item.segmentId,
          segmentText: item.segmentText,
          status: data.status === 'no_analyzed_media' ? 'no_analyzed_media' : 'success',
          candidates: (item.candidates || []).map((c: SemanticMatchCandidate) => ({
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
        const cacheKey = `${seg.id}_${seg.text}_${mediaAssets.length}`;
        MATCH_CACHE.set(cacheKey, res);
        resultsMap.set(seg.id, res);
      }
      return resultsMap;
    } else if (response.status === 404) {
      batchSupported = false;
    } else {
      throw new Error(`Batch match returned HTTP ${response.status}`);
    }
  } catch (err: unknown) {
    if (batchSupported && !(err instanceof Error && err.message.includes('404'))) {
      // Network unreachable / timeout: mark offline and return fallback for all uncached segments
      lastHealthCheck = { status: { online: false, error: String(err) }, timestamp: Date.now() };
      for (const segment of uncachedSegments) {
        const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}`;
        const fallback: SegmentMatchResult = {
          segmentId: segment.id,
          segmentText: segment.text,
          status: 'error',
          candidates: [],
          unavailableCount: mediaAssets.length,
          modelUsed: 'sentence-transformers/all-MiniLM-L6-v2',
          matchedAt: Date.now(),
          error: String(err),
        };
        MATCH_CACHE.set(cacheKey, fallback);
        resultsMap.set(segment.id, fallback);
      }
      return resultsMap;
    }
  }

  // Fallback: sequential matching if batch endpoint returned 404 on legacy worker
  for (const segment of uncachedSegments) {
    const res = await matchMediaForSegment(segment, mediaAssets, { ...options, workerUrl, topK });
    resultsMap.set(segment.id, res);
  }

  return resultsMap;
}
