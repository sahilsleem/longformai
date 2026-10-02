import { MediaAsset, AudioSegment, SegmentMatchResult, SemanticMatchCandidate } from '../types/project';
import { getMatchingWorkerUrl } from '../config/workerConfig';
import { expandMultilingualEntityVariants, matchEntityInNarration } from './entityNormalization';
import { isNativeAndroid } from '../platform/androidMedia';
import NativeMiniLM from './NativeMiniLM';
import { expandSemanticNumericText } from './textNormalization';

export interface PreparedMediaCandidate {
  mediaId: string;
  mediaName: string;
  main_emb: number[];
  main_explanation: string;
  main_snippet: string;
  ocr_emb: number[] | null;
  ocr_explanation: string;
  ocr_snippet: string;
  temp_emb: number[] | null;
  temp_explanation: string;
  temp_snippet: string;
  keyframes: Array<{
    emb: number[];
    explanation: string;
    snippet: string;
    time: number;
  }>;
}

export const MEDIA_EMBEDDINGS_CACHE = new Map<string, PreparedMediaCandidate>();

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
  MEDIA_EMBEDDINGS_CACHE.clear();
  lastHealthCheck = null;
}

/**
 * Checks if the local semantic matching worker is running on port 8767.
 * On Android, queries native MiniLM ONNX Runtime directly with zero HTTP calls.
 * Health check result is cached with a short TTL to prevent spamming across loops.
 */
export async function checkMatchingWorkerHealth(
  workerUrl: string = getMatchingWorkerUrl(),
  options: { forceRefresh?: boolean } = {}
): Promise<MatchingWorkerStatus> {
  if (isNativeAndroid()) {
    try {
      const info = await NativeMiniLM.getSystemInfo();
      return {
        online: true,
        engine: info.engine || 'onnxruntime-android',
        defaultModel: info.model || 'sentence-transformers/all-MiniLM-L6-v2',
        device: 'arm64',
        modelLoaded: true,
        modelCached: true,
        state: 'ready',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        online: false,
        engine: 'onnxruntime-android',
        defaultModel: 'sentence-transformers/all-MiniLM-L6-v2',
        state: 'error',
        error: `Native MiniLM error: ${msg}`,
      };
    }
  }

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
import { MediaFolder } from '../types/project';


export function getQueryEntityAnchors(text: string, folders: MediaFolder[]): string {
  if (!text || !folders || folders.length === 0) return '';
  const anchors: string[] = [];

  for (const folder of folders) {
    if (!folder.name) continue;
    const variants = expandMultilingualEntityVariants(folder.name);
    if (folder.aliases) {
      for (const alias of folder.aliases) {
        variants.push(...expandMultilingualEntityVariants(alias));
      }
    }
    const matchRes = matchEntityInNarration(text, variants);
    if (matchRes.matched) {
      anchors.push(folder.name);
    }
  }

  if (anchors.length > 0) {
    return ' ' + Array.from(new Set(anchors)).join(' ');
  }
  return '';
}

export function extractMediaPayload(mediaAssets: MediaAsset[], folders: MediaFolder[] = []) {
  return mediaAssets.map((m) => {
    const semantic = m.analysis?.semantic;
    const keyframes = m.analysis?.keyframes || [];

    let description = semantic?.description || m.analysis?.description || '';
    let folderSubjectPrefix = '';

    // EXPERIMENT: Inject folder identity into the main semantic payload and keyframes
    if (m.folderIds && m.folderIds.length > 0 && folders.length > 0) {
      const folder = folders.find((f) => m.folderIds!.includes(f.id));
      if (folder && folder.name) {
        folderSubjectPrefix = `Subject: ${folder.name}. `;
        description = folderSubjectPrefix + description;
      }
    }

    return {
      mediaId: m.id,
      mediaName: m.name,
      description,
      ocrText: semantic?.ocrText || m.analysis?.ocrText || undefined,
      tags: semantic?.tags || m.analysis?.tags || [],
      temporalSummary: semantic?.temporalSummary || undefined,
      keyframeDescriptions: keyframes
        .filter((kf) => Boolean(kf.description || kf.ocrText))
        .map((kf) => ({
          time: kf.time,
          description: kf.description ? (folderSubjectPrefix + kf.description) : (folderSubjectPrefix ? folderSubjectPrefix.trim() : ''),
          ocrText: kf.ocrText || undefined,
          tags: kf.tags || [],
        })),
    };
  });
}

// Helper to calculate dot product
function dotProduct(vecA: number[], vecB: number[]): number {
  let product = 0;
  for (let i = 0; i < vecA.length; i++) {
    product += vecA[i] * vecB[i];
  }
  return product;
}

export function scoreCandidateAgainstSegment(
  segmentEmb: number[],
  candidates: PreparedMediaCandidate[],
  topK: number
): SemanticMatchCandidate[] {
  const candidatesScored: SemanticMatchCandidate[] = [];

  for (const p of candidates) {
    let bestScore = dotProduct(segmentEmb, p.main_emb);
    let bestExplanation = p.main_explanation;
    let bestSnippet = p.main_snippet;

    if (p.ocr_emb) {
      const ocrScore = dotProduct(segmentEmb, p.ocr_emb);
      if (ocrScore > bestScore) {
        bestScore = ocrScore;
        bestExplanation = p.ocr_explanation;
        bestSnippet = p.ocr_snippet;
      }
    }

    if (p.temp_emb) {
      const tempScore = dotProduct(segmentEmb, p.temp_emb);
      if (tempScore > bestScore) {
        bestScore = tempScore;
        bestExplanation = p.temp_explanation;
        bestSnippet = p.temp_snippet;
      }
    }

    let bestKfScore = -1.0;
    let bestKfTime: number | undefined = undefined;

    for (const kf of p.keyframes) {
      const kfScore = dotProduct(segmentEmb, kf.emb);
      if (kfScore > bestKfScore) {
        bestKfScore = kfScore;
        bestKfTime = kf.time;
      }
      if (kfScore > bestScore) {
        bestScore = kfScore;
        bestExplanation = kf.explanation;
        bestSnippet = kf.snippet;
      }
    }

    const normalizedScore = Math.max(0.0, Math.min(1.0, Number(bestScore.toFixed(2))));

    candidatesScored.push({
      mediaId: p.mediaId,
      mediaName: p.mediaName,
      score: normalizedScore,
      explanation: bestExplanation,
      matchedSnippet: bestSnippet || undefined,
      bestKeyframeTime: bestKfTime
    });
  }

  candidatesScored.sort((a, b) => b.score - a.score);
  return candidatesScored.slice(0, topK || 5);
}

export async function prepareMediaAssetsNative(
  mediaAssets: MediaAsset[],
  folders: MediaFolder[]
): Promise<{ candidates: PreparedMediaCandidate[], unavailableCount: number }> {
  const payload = extractMediaPayload(mediaAssets, folders);
  const candidates: PreparedMediaCandidate[] = [];
  
  const validItems = [];
  let unavailableCount = 0;
  
  for (const item of payload) {
    const hasDesc = !!(item.description && item.description.trim());
    const hasOcr = !!(item.ocrText && item.ocrText.trim());
    const hasTags = !!(item.tags && item.tags.length > 0);
    const hasKeyframes = !!(item.keyframeDescriptions && item.keyframeDescriptions.length > 0);
    const hasTemporal = !!(item.temporalSummary && item.temporalSummary.trim());
    
    if (hasDesc || hasOcr || hasTags || hasKeyframes || hasTemporal) {
      validItems.push(item);
    } else {
      unavailableCount++;
    }
  }
  
  const itemsToEmbed = [];
  for (const item of validItems) {
    if (MEDIA_EMBEDDINGS_CACHE.has(item.mediaId)) {
      candidates.push(MEDIA_EMBEDDINGS_CACHE.get(item.mediaId)!);
    } else {
      itemsToEmbed.push(item);
    }
  }
  
  const allTextsToEmbed = new Set<string>();
  
  for (const item of itemsToEmbed) {
    const descText = (item.description || '').trim();
    const ocrText = (item.ocrText || '').trim();
    const tagsText = (item.tags || []).join(', ');
    
    const parts: string[] = [];
    if (descText) parts.push(descText);
    if (ocrText) parts.push(`Visible text: ${ocrText}`);
    if (tagsText) parts.push(`Concepts: ${tagsText}`);
    
    const combinedRaw = parts.length > 0 ? parts.join('. ') : (descText || ocrText);
    const combinedText = expandSemanticNumericText(combinedRaw);
    if (combinedText) allTextsToEmbed.add(combinedText);
    
    if (ocrText) {
      allTextsToEmbed.add(expandSemanticNumericText(`Visible text: ${ocrText}`));
    }
    
    const temporalSum = item.temporalSummary;
    if (temporalSum && temporalSum.trim()) {
      allTextsToEmbed.add(temporalSum.trim());
    }
    
    for (const kd of item.keyframeDescriptions) {
      const kfDesc = kd.description || '';
      const kfOcr = kd.ocrText || '';
      const kfParts: string[] = [];
      if (kfDesc) kfParts.push(kfDesc);
      if (kfOcr) kfParts.push(`Visible text: ${kfOcr}`);
      if (kfParts.length > 0) {
        allTextsToEmbed.add(expandSemanticNumericText(kfParts.join('. ')));
      }
    }
  }
  
  const textArray = Array.from(allTextsToEmbed);
  const embeddingMap = new Map<string, number[]>();
  
  if (textArray.length > 0) {
    const CHUNK_SIZE = 32;
    for (let i = 0; i < textArray.length; i += CHUNK_SIZE) {
      const chunk = textArray.slice(i, i + CHUNK_SIZE);
      const res = await NativeMiniLM.embedBatch({ texts: chunk });
      for (let j = 0; j < chunk.length; j++) {
        embeddingMap.set(chunk[j], res.embeddings[j]);
      }
    }
  }
  
  for (const item of itemsToEmbed) {
    const descText = (item.description || '').trim();
    const ocrText = (item.ocrText || '').trim();
    const tagsText = (item.tags || []).join(', ');
    
    const parts: string[] = [];
    if (descText) parts.push(descText);
    if (ocrText) parts.push(`Visible text: ${ocrText}`);
    if (tagsText) parts.push(`Concepts: ${tagsText}`);
    
    const combinedRaw = parts.length > 0 ? parts.join('. ') : (descText || ocrText);
    const combinedText = expandSemanticNumericText(combinedRaw);
    
    const main_emb = embeddingMap.get(combinedText) || [];
    
    let main_explanation = '';
    if (ocrText) {
      main_explanation = descText ? `Visible text: "${ocrText}"; Description: "${descText}"` : `Visible text: "${ocrText}"`;
    } else {
      main_explanation = descText ? `Media description mentions: "${descText}"` : `Visual tags: ${tagsText}`;
    }
    const main_snippet = ocrText || descText;
    
    let ocr_emb: number[] | null = null;
    let ocr_explanation = '';
    let ocr_snippet = '';
    if (ocrText) {
      const ocrExpanded = expandSemanticNumericText(`Visible text: ${ocrText}`);
      ocr_emb = embeddingMap.get(ocrExpanded) || null;
      ocr_explanation = `Visible on-screen text matches: "${ocrText}"`;
      ocr_snippet = ocrText;
    }
    
    let temp_emb: number[] | null = null;
    let temp_explanation = '';
    let temp_snippet = '';
    const temporalSum = item.temporalSummary;
    if (temporalSum && temporalSum.trim()) {
      temp_emb = embeddingMap.get(temporalSum.trim()) || null;
      temp_explanation = `Temporal video narrative shows: "${temporalSum}"`;
      temp_snippet = temporalSum;
    }
    
    const keyframes = [];
    for (const kd of item.keyframeDescriptions) {
      const kfDesc = kd.description || '';
      const kfOcr = kd.ocrText || '';
      const kfTime = kd.time;
      const kfParts: string[] = [];
      if (kfDesc) kfParts.push(kfDesc);
      if (kfOcr) kfParts.push(`Visible text: ${kfOcr}`);
      if (kfParts.length > 0) {
        const kfCombined = expandSemanticNumericText(kfParts.join('. '));
        const emb = embeddingMap.get(kfCombined);
        if (emb) {
          keyframes.push({
            emb,
            explanation: `Frame @ ${kfTime.toFixed(1)}s shows: "${kfDesc || kfOcr}"`,
            snippet: kfOcr || kfDesc,
            time: kfTime
          });
        }
      }
    }
    
    const candidate: PreparedMediaCandidate = {
      mediaId: item.mediaId,
      mediaName: item.mediaName,
      main_emb,
      main_explanation,
      main_snippet,
      ocr_emb,
      ocr_explanation,
      ocr_snippet,
      temp_emb,
      temp_explanation,
      temp_snippet,
      keyframes
    };
    
    MEDIA_EMBEDDINGS_CACHE.set(item.mediaId, candidate);
    candidates.push(candidate);
  }
  
  return { candidates, unavailableCount };
}

export async function matchMediaForSegmentNativeAndroid(
  segment: AudioSegment,
  mediaAssets: MediaAsset[],
  options: { forceRefresh?: boolean; topK?: number; folders?: MediaFolder[] } = {}
): Promise<SegmentMatchResult> {
  const topK = options.topK || 5;
  const folders = options.folders || [];
  
  const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;
  if (!options.forceRefresh && MATCH_CACHE.has(cacheKey)) {
    return MATCH_CACHE.get(cacheKey)!;
  }
  
  const { candidates, unavailableCount } = await prepareMediaAssetsNative(mediaAssets, folders);
  
  if (candidates.length === 0) {
    const res: SegmentMatchResult = {
      segmentId: segment.id,
      segmentText: segment.text,
      status: 'no_analyzed_media',
      candidates: [],
      unavailableCount,
      modelUsed: 'onnxruntime-android',
      matchedAt: Date.now()
    };
    MATCH_CACHE.set(cacheKey, res);
    return res;
  }
  
  const queryText = segment.text + getQueryEntityAnchors(segment.text, folders);
  const expandedQuery = expandSemanticNumericText(queryText);
  const segRes = await NativeMiniLM.embed({ text: expandedQuery });
  
  const selectedCandidates = scoreCandidateAgainstSegment(segRes.embedding, candidates, topK);
  
  const res: SegmentMatchResult = {
    segmentId: segment.id,
    segmentText: segment.text,
    status: 'success',
    candidates: selectedCandidates,
    unavailableCount,
    modelUsed: 'onnxruntime-android',
    matchedAt: Date.now()
  };
  MATCH_CACHE.set(cacheKey, res);
  return res;
}

export async function batchMatchMediaForSegmentsNativeAndroid(
  segments: AudioSegment[],
  mediaAssets: MediaAsset[],
  options: { forceRefresh?: boolean; topK?: number; folders?: MediaFolder[] } = {}
): Promise<Map<string, SegmentMatchResult>> {
  const resultsMap = new Map<string, SegmentMatchResult>();
  if (!segments || segments.length === 0) return resultsMap;
  
  const topK = options.topK || 15;
  const folders = options.folders || [];
  
  const uncachedSegments: AudioSegment[] = [];
  for (const segment of segments) {
    const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;
    if (!options.forceRefresh && MATCH_CACHE.has(cacheKey)) {
      resultsMap.set(segment.id, MATCH_CACHE.get(cacheKey)!);
    } else {
      uncachedSegments.push(segment);
    }
  }
  
  if (uncachedSegments.length === 0) return resultsMap;
  
  const { candidates, unavailableCount } = await prepareMediaAssetsNative(mediaAssets, folders);
  
  if (candidates.length === 0) {
    for (const segment of uncachedSegments) {
      const res: SegmentMatchResult = {
        segmentId: segment.id,
        segmentText: segment.text,
        status: 'no_analyzed_media',
        candidates: [],
        unavailableCount,
        modelUsed: 'onnxruntime-android',
        matchedAt: Date.now()
      };
      const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;
      MATCH_CACHE.set(cacheKey, res);
      resultsMap.set(segment.id, res);
    }
    return resultsMap;
  }
  
  const textsToEmbed = uncachedSegments.map(s => expandSemanticNumericText(s.text + getQueryEntityAnchors(s.text, folders)));
  const segEmbeddings: number[][] = [];
  
  const CHUNK_SIZE = 32;
  for (let i = 0; i < textsToEmbed.length; i += CHUNK_SIZE) {
    const chunk = textsToEmbed.slice(i, i + CHUNK_SIZE);
    const res = await NativeMiniLM.embedBatch({ texts: chunk });
    segEmbeddings.push(...res.embeddings);
  }
  
  for (let i = 0; i < uncachedSegments.length; i++) {
    const segment = uncachedSegments[i];
    const emb = segEmbeddings[i];
    const selectedCandidates = scoreCandidateAgainstSegment(emb, candidates, topK);
    
    const res: SegmentMatchResult = {
      segmentId: segment.id,
      segmentText: segment.text,
      status: 'success',
      candidates: selectedCandidates,
      unavailableCount,
      modelUsed: 'onnxruntime-android',
      matchedAt: Date.now()
    };
    const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;
    MATCH_CACHE.set(cacheKey, res);
    resultsMap.set(segment.id, res);
  }
  
  return resultsMap;
}

/**
 * Matches a transcript segment against supplied media assets using genuine Step 5 semantic analysis.
 * Operates purely on-demand with local in-memory caching.
 */
export async function matchMediaForSegment(
  segment: AudioSegment,
  mediaAssets: MediaAsset[],
  options: { forceRefresh?: boolean; workerUrl?: string; topK?: number; folders?: MediaFolder[] } = {}
): Promise<SegmentMatchResult> {
  if (isNativeAndroid()) {
    return matchMediaForSegmentNativeAndroid(segment, mediaAssets, options);
  }

  const workerUrl = options.workerUrl || DEFAULT_MATCHING_WORKER_URL;
  const topK = options.topK || 5;
  const folders = options.folders || [];
  const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;

  if (!options.forceRefresh && MATCH_CACHE.has(cacheKey)) {
    return MATCH_CACHE.get(cacheKey)!;
  }

  // 1. Check worker health (cached)
  const status = await checkMatchingWorkerHealth(workerUrl, { forceRefresh: options.forceRefresh });
  if (!status.online) {
    const fallback: SegmentMatchResult = {
      segmentId: segment.id,
      segmentText: segment.text + getQueryEntityAnchors(segment.text, folders),
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
  const mediaPayload = extractMediaPayload(mediaAssets, folders);

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
        segmentText: segment.text + getQueryEntityAnchors(segment.text, folders),
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
          bestKeyframeTime: c.bestKeyframeTime,
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
  options: { forceRefresh?: boolean; workerUrl?: string; topK?: number; folders?: MediaFolder[] } = {}
): Promise<Map<string, SegmentMatchResult>> {
  if (isNativeAndroid()) {
    return batchMatchMediaForSegmentsNativeAndroid(segments, mediaAssets, options);
  }

  const resultsMap = new Map<string, SegmentMatchResult>();
  if (!segments || segments.length === 0) return resultsMap;

  const workerUrl = options.workerUrl || DEFAULT_MATCHING_WORKER_URL;
  const topK = options.topK || 15;
  const folders = options.folders || [];

  // 1. Check worker health once
  const health = await checkMatchingWorkerHealth(workerUrl, { forceRefresh: options.forceRefresh });
  if (!health.online || health.state === 'model_not_installed') {
    for (const segment of segments) {
      const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;
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
  const mediaPayload = extractMediaPayload(mediaAssets, folders);

  // 3. Find uncached segments
  const uncachedSegments: AudioSegment[] = [];
  for (const segment of segments) {
    const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;
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
        segments: uncachedSegments.map((s) => ({ id: s.id, text: s.text + getQueryEntityAnchors(s.text, folders) })),
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
          bestKeyframeTime: c.bestKeyframeTime,
        })),
          unavailableCount: data.unavailableCount ?? 0,
          modelUsed: data.modelUsed || 'sentence-transformers/all-MiniLM-L6-v2',
          matchedAt: Date.now(),
        };
        const cacheKey = `${seg.id}_${seg.text}_${mediaAssets.length}_${folders.length}`;
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
        const cacheKey = `${segment.id}_${segment.text}_${mediaAssets.length}_${folders.length}`;
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

/**
 * Explicitly releases Native MiniLM in-memory ONNX Runtime session on Android.
 */
export async function releaseMatchingModel(): Promise<void> {
  if (isNativeAndroid()) {
    try {
      await NativeMiniLM.releaseModel();
    } catch (e) {
      console.warn('Failed to release NativeMiniLM model:', e);
    }
  }
}
