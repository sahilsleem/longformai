/**
 * Visual Story Director
 *
 * Pure editorial intelligence layer for LongFormAI.
 * Evaluates already-planned timeline items, narration segments, and provenance
 * to produce a deterministic VisualTreatmentPlan.
 *
 * This module does NOT:
 * - Render anything
 * - Modify media or timeline items
 * - Call FFmpeg or AI models
 * - Make network requests
 */

import type {
  AudioSegment,
  DraftProvenance,
  MediaAsset,
  MediaFolder,
  TimelineItem,
} from '../types/project';

// ---------------------------------------------------------------------------
// Treatment Types
// ---------------------------------------------------------------------------

export type VisualMotionTreatment = 'NORMAL_CLIP' | 'SLOW_ZOOM' | 'PUNCH_ZOOM' | 'HOLD';
export type VisualTypographyTreatment = 'NONE' | 'EMPHASIS_TEXT' | 'CONTEXT_LABEL' | 'FULLSCREEN_TEXT';
export type VisualTransitionTreatment = 'HARD_CUT' | 'CROSSFADE';

export interface VisualTextTiming {
  start: number; // in seconds (relative to clip start or timeline)
  end: number;   // in seconds
}

export interface VisualMotionParams {
  scale?: number;
  startScale?: number;
  endScale?: number;
  triggerTime?: number; // timestamp offset for punch zoom
}

export interface VisualTreatmentEvidence {
  confidenceLevel?: string;
  narrationRole?: string;
  matchedEntity?: string;
  impactScore?: number;
}

export interface VisualTreatment {
  motion: VisualMotionTreatment;
  typography: VisualTypographyTreatment;
  transition: VisualTransitionTreatment;
  reason: string;
  text?: string;
  textTiming?: VisualTextTiming;
  motionParams?: VisualMotionParams;
  transitionDuration?: number;
  evidence?: VisualTreatmentEvidence;
}

export interface VisualTreatmentPlanSummary {
  totalItems: number;
  normalClips: number;
  slowZooms: number;
  punchZooms: number;
  holds: number;
  emphasisTexts: number;
  contextLabels: number;
  fullscreenTexts: number;
  hardCuts: number;
  crossfades: number;
}

export interface VisualTreatmentPlan {
  version: '1.0';
  treatments: Record<string, VisualTreatment>;
  summary: VisualTreatmentPlanSummary;
}

export interface VisualDirectorContext {
  segments?: AudioSegment[];
  mediaAssets?: MediaAsset[];
  folders?: MediaFolder[];
}

// ---------------------------------------------------------------------------
// Constants & Heuristics
// ---------------------------------------------------------------------------

const BANNED_ENTITY_WORDS = new Set([
  'match',
  'entity',
  'candidate',
  'narration',
  'direct',
  'generic',
  'b-roll',
  'broll',
  'background',
  'backgrounds',
  'events',
  'event footage',
  'other',
  'misc',
  'miscellaneous',
  'uncategorized',
  'general',
  'clips',
  'footage',
  'video',
  'videos',
  'image',
  'images',
  'photos',
]);

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t',
  'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
  'each',
  'few', 'for', 'from', 'further',
  'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s',
  'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself',
  'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself',
  'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
  'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up',
  'very',
  'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t',
  'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function findEmphasisKeyword(segment: AudioSegment): { text: string; start: number; end: number } | undefined {
  if (!segment.words || segment.words.length === 0) {
    return undefined;
  }

  const candidates: Array<{ clean: string; start: number; end: number; score: number }> = [];

  for (const w of segment.words) {
    const raw = (w.word || '').trim();
    const clean = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    const lower = clean.toLowerCase();

    if (clean.length < 3) continue;
    if (STOP_WORDS.has(lower)) continue;

    const conf = w.confidence ?? 1.0;
    if (conf < 0.65) continue;

    const score = clean.length * 1.5 + conf * 10;
    candidates.push({ clean, start: w.start, end: w.end, score });
  }

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return {
    text: best.clean,
    start: best.start,
    end: best.end,
  };
}

export function resolveEntityForCandidate(
  item: TimelineItem,
  asset?: MediaAsset,
  folders?: MediaFolder[]
): string | undefined {
  // 1. Check folder assignment on the asset (highest priority, direct folder data)
  if (asset?.folderIds && folders && folders.length > 0) {
    for (const fId of asset.folderIds) {
      const folder = folders.find((f) => f.id === fId);
      if (folder && folder.name) {
        const cleanName = folder.name.trim();
        if (cleanName.length > 0 && !BANNED_ENTITY_WORDS.has(cleanName.toLowerCase())) {
          return cleanName;
        }
      }
    }
  }

  // 2. Check provenance entity match reason if explicit subject group is present
  const entityReason = item.provenance?.entityMatchReason;
  if (entityReason && (item.provenance?.entityConsistencyModifier ?? 0) > 0) {
    // Matches e.g. "candidate matches narration subject (katrina, kaif)"
    const match = entityReason.match(/subject\s*\(([^)]+)\)/i);
    if (match && match[1]) {
      const rawTokens = match[1]
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !BANNED_ENTITY_WORDS.has(t.toLowerCase()));

      if (rawTokens.length > 0) {
        const formatted = rawTokens
          .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
          .join(' ');
        if (!BANNED_ENTITY_WORDS.has(formatted.toLowerCase())) {
          return formatted;
        }
      }
    }
  }

  return undefined;
}

function isLowConfidence(provenance?: DraftProvenance): boolean {
  if (!provenance) return false;
  if (provenance.candidateConfidenceLevel === 'LOW') return true;
  if ((provenance.candidateConfidenceLevel as string) === 'VERY_LOW') return true;
  if (provenance.matchCertainty === 'LOW_CERTAINTY') return true;
  if (provenance.matchConfidence === 'NO_MATCH') return true;
  return false;
}

function isHighConfidence(provenance?: DraftProvenance): boolean {
  if (!provenance) return false;
  if (provenance.candidateConfidenceLevel === 'HIGH') return true;
  if ((provenance.candidateConfidenceLevel as string) === 'VERY_HIGH') return true;
  if (provenance.matchConfidence === 'STRONG') return true;
  if (provenance.matchCertainty === 'HIGH_CERTAINTY') return true;
  return false;
}

function hasHighVisualImpact(provenance?: DraftProvenance): boolean {
  if (!provenance || provenance.visualImpactScore === undefined) return false;
  const score = provenance.visualImpactScore;
  return score >= 75 || (score <= 1.0 && score >= 0.75);
}

// ---------------------------------------------------------------------------
// Main Director Function
// ---------------------------------------------------------------------------

export function generateVisualTreatmentPlan(
  items: TimelineItem[],
  context?: VisualDirectorContext
): VisualTreatmentPlan {
  const treatments: Record<string, VisualTreatment> = {};

  const summary: VisualTreatmentPlanSummary = {
    totalItems: items.length,
    normalClips: 0,
    slowZooms: 0,
    punchZooms: 0,
    holds: 0,
    emphasisTexts: 0,
    contextLabels: 0,
    fullscreenTexts: 0,
    hardCuts: 0,
    crossfades: 0,
  };

  if (items.length === 0) {
    return {
      version: '1.0',
      treatments,
      summary,
    };
  }

  const seenEntities = new Set<string>();
  let lastResolvedMotion: VisualMotionTreatment = 'NORMAL_CLIP';
  let consecutiveSlowZooms = 0;
  let lastTypographyIndex: number | undefined = undefined;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prov = item.provenance;
    const asset = context?.mediaAssets?.find((m) => m.id === item.mediaId);

    // Initial default state
    let motion: VisualMotionTreatment = 'NORMAL_CLIP';
    let typography: VisualTypographyTreatment = 'NONE';
    let transition: VisualTransitionTreatment = 'HARD_CUT';
    let reason = 'Safe default: normal clip with hard cut.';
    let text: string | undefined = undefined;
    let textTiming: VisualTextTiming | undefined = undefined;
    let motionParams: VisualMotionParams | undefined = undefined;
    let transitionDuration: number | undefined = undefined;

    const evidence: VisualTreatmentEvidence = {
      confidenceLevel: prov?.candidateConfidenceLevel,
      narrationRole: prov?.narrationRole,
      impactScore: prov?.visualImpactScore,
    };

    // -----------------------------------------------------------------------
    // RULE 1: Safety & Evidence Guardrail
    // -----------------------------------------------------------------------
    if (isLowConfidence(prov)) {
      reason = 'Low candidate match confidence; defaulting to safe normal clip.';
      motion = 'NORMAL_CLIP';
      typography = 'NONE';
      transition = 'HARD_CUT';
    } else {
      // ---------------------------------------------------------------------
      // RULE 6: Structural Transition
      // ---------------------------------------------------------------------
      const isTransitionBeat =
        prov?.narrationRole === 'transition' ||
        Boolean(prov?.continuityReason?.toLowerCase().includes('transition'));

      if (isTransitionBeat && item.duration >= 2.0) {
        transition = 'CROSSFADE';
        transitionDuration = 0.5;
        reason = 'Structural transition between narrative sections.';
      }

      // ---------------------------------------------------------------------
      // RULE 4: High-Confidence Emphasis
      // ---------------------------------------------------------------------
      const isEmphasisRole = prov?.narrationRole === 'emphasis';
      const isHighConf = isHighConfidence(prov);
      const isHighImpact = hasHighVisualImpact(prov);

      if (isEmphasisRole && isHighConf && isHighImpact) {
        motion = 'PUNCH_ZOOM';

        const matchingSegment = context?.segments?.find(
          (s) =>
            s.id === prov?.sourceSegmentId ||
            (s.startTime <= item.startTime && s.endTime >= item.startTime)
        );

        const keyword = matchingSegment ? findEmphasisKeyword(matchingSegment) : undefined;

        if (keyword) {
          const itemStart = item.startTime;
          const itemEnd = itemStart + item.duration;

          // Check if keyword falls completely outside current clip
          if (keyword.end <= itemStart || keyword.start >= itemEnd) {
            typography = 'NONE';
            motionParams = { scale: 1.25 };
            reason = 'High-confidence emphasis beat with strong visual impact (spoken keyword outside clip window).';
          } else {
            const relStart = Math.max(0, keyword.start - itemStart);
            let relEnd = keyword.end - itemStart;
            relEnd = Math.max(relStart, relEnd);

            // Sensible minimum display duration when possible (e.g. 0.8s), never exceeding clip duration
            const minDisplayDuration = 0.8;
            if (relEnd - relStart < minDisplayDuration) {
              relEnd = Math.min(item.duration, relStart + minDisplayDuration);
            }
            relEnd = Math.min(item.duration, Math.max(relStart, relEnd));

            const clampedStart = Number(relStart.toFixed(2));
            const clampedEnd = Number(relEnd.toFixed(2));

            typography = 'EMPHASIS_TEXT';
            text = keyword.text;
            textTiming = {
              start: clampedStart,
              end: clampedEnd,
            };
            motionParams = {
              scale: 1.25,
              triggerTime: clampedStart,
            };
            reason = 'High-confidence emphasis beat with strong visual impact.';
          }
        } else {
          typography = 'NONE';
          motionParams = { scale: 1.25 };
          reason = 'High-confidence emphasis beat with strong visual impact.';
        }
      }

      // ---------------------------------------------------------------------
      // RULE 5: New Entity Context
      // ---------------------------------------------------------------------
      const entityName = resolveEntityForCandidate(item, asset, context?.folders);
      if (entityName) {
        evidence.matchedEntity = entityName;
        const normalizedEntity = entityName.toLowerCase();

        if (!seenEntities.has(normalizedEntity)) {
          if (typography === 'NONE') {
            typography = 'CONTEXT_LABEL';
            text = entityName;
            textTiming = {
              start: 0.3,
              end: Number(Math.min(item.duration, 2.5).toFixed(2)),
            };
            if (motion === 'NORMAL_CLIP') {
              reason = `First appearance of identified entity: ${entityName}.`;
            } else {
              reason += ` Introduces identified entity: ${entityName}.`;
            }
          }
        }
      }

      // ---------------------------------------------------------------------
      // RULE 2: Still Image Liveness
      // ---------------------------------------------------------------------
      if (motion === 'NORMAL_CLIP' && asset?.type === 'image' && item.duration >= 2.0) {
        motion = 'SLOW_ZOOM';
        motionParams = { startScale: 1.0, endScale: 1.08 };
        reason = `Still image held for ${item.duration.toFixed(1)}s; subtle motion prevents a static visual.`;
      }

      // ---------------------------------------------------------------------
      // RULE 3: Opening / Establishing Moment
      // ---------------------------------------------------------------------
      if (motion === 'NORMAL_CLIP') {
        const isOpening = i === 0 || prov?.beatId === 'beat-0' || prov?.beatPosition === 1;
        const isEstablishing =
          prov?.narrationRole === 'establishing' || prov?.framingScale === 'WIDE';

        if (isOpening && isEstablishing) {
          motion = 'SLOW_ZOOM';
          motionParams = { startScale: 1.0, endScale: 1.10 };
          reason = 'Opening establishing shot; subtle slow push-in draws viewer into the scene.';
        }
      }

      // ---------------------------------------------------------------------
      // RULE 7: Anti-Fatigue Constraints
      // ---------------------------------------------------------------------

      // 1. Consecutive PUNCH_ZOOM prevention
      if (motion === 'PUNCH_ZOOM' && lastResolvedMotion === 'PUNCH_ZOOM') {
        motion = 'NORMAL_CLIP';
        motionParams = undefined;
        if (typography === 'EMPHASIS_TEXT') {
          typography = 'NONE';
          text = undefined;
          textTiming = undefined;
        }
        reason = 'Punch zoom demoted to normal clip to prevent consecutive punch fatigue.';
      }

      // 2. Slow Zoom fatigue (max 2 consecutive)
      if (motion === 'SLOW_ZOOM' && consecutiveSlowZooms >= 2) {
        motion = 'NORMAL_CLIP';
        motionParams = undefined;
        reason = 'Slow zoom demoted to normal clip to avoid visual motion fatigue after multiple slow zooms.';
      }

      // 3. Typography spacing guardrail
      if (typography !== 'NONE') {
        if (lastTypographyIndex !== undefined && i - lastTypographyIndex <= 1) {
          typography = 'NONE';
          text = undefined;
          textTiming = undefined;
          reason += ' (typography omitted to avoid rapid successive text overlays)';
        }
      }
    }

    // -----------------------------------------------------------------------
    // State Tracking & Summary Updates
    // -----------------------------------------------------------------------
    lastResolvedMotion = motion;
    if (motion === 'SLOW_ZOOM') {
      consecutiveSlowZooms++;
    } else {
      consecutiveSlowZooms = 0;
    }

    if (typography !== 'NONE') {
      lastTypographyIndex = i;
    }

    // Only mark entity as seen if CONTEXT_LABEL was actually committed to the final treatment
    if (typography === 'CONTEXT_LABEL' && text) {
      seenEntities.add(text.toLowerCase());
    }

    // Update summary counts
    if (motion === 'NORMAL_CLIP') summary.normalClips++;
    else if (motion === 'SLOW_ZOOM') summary.slowZooms++;
    else if (motion === 'PUNCH_ZOOM') summary.punchZooms++;
    else if (motion === 'HOLD') summary.holds++;

    if (typography === 'EMPHASIS_TEXT') summary.emphasisTexts++;
    else if (typography === 'CONTEXT_LABEL') summary.contextLabels++;
    else if ((typography as VisualTypographyTreatment) === 'FULLSCREEN_TEXT') summary.fullscreenTexts++;

    if (transition === 'HARD_CUT') summary.hardCuts++;
    else if (transition === 'CROSSFADE') summary.crossfades++;

    const treatment: VisualTreatment = {
      motion,
      typography,
      transition,
      reason,
      ...(text ? { text } : {}),
      ...(textTiming ? { textTiming } : {}),
      ...(motionParams ? { motionParams } : {}),
      ...(transitionDuration ? { transitionDuration } : {}),
      evidence,
    };

    treatments[item.id] = treatment;
  }

  return {
    version: '1.0',
    treatments,
    summary,
  };
}
