import { AudioSegment, MediaAsset, TimelineItem, TransformState, NarrationRole, NarrationBeatType, PacingClass, VisualState, SubjectContinuityLevel, FramingScale, FramingIntent, AtmosphericTone, AtmosphericIntent, CameraMotion, MotionIntent, SceneSetting, SettingIntent, SubjectDensity, DensityIntent, CameraAngle, AngleIntent, TimeOfDay, TimeIntent, WeatherCondition, WeatherIntent, DepthOfField, DepthIntent, TemporalRate, TemporalIntent, VisualMedium, MediumIntent, CompositionBalance, CompositionIntent, LightingSetup, LightingIntent, PointOfView, POVIntent, ChromaticGrading, ChromaticIntent, ActionTrajectory, TrajectoryIntent, OpticalLensPerspective, LensIntent, VisualTexture, TextureIntent } from '../types/project';
import { createDefaultTransform } from './schema';
import { matchMediaForSegment } from './matching';

export interface DraftOptions {
  similarityThreshold?: number;     // default: 0.30 (range 0.15 to 0.60)
  reusePenalty?: number;            // default: 0.08 (range 0.00 to 0.25)
  continuityPreference?: number;    // default: 0.03 (range 0.00 to 0.10)
  preferVideoOverImage?: boolean;   // default: true (gives +0.03 bonus to video footage)
  workerUrl?: string;
}

export interface MediaUsageItem {
  mediaId: string;
  mediaName: string;
  mediaType: 'video' | 'image' | 'audio';
  useCount: number;
  totalDuration: number;
  hasConsecutiveReuse: boolean;
}

export interface UnassignedSegmentDetail {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  reason: string;
}

export interface DraftStats {
  totalSegments: number;
  assignedSegments: number;
  unassignedSegments: number;
  totalDuration: number;
  assignedDuration: number;
  unassignedDuration: number;
  uniqueMediaUsed: number;
  mediaReuseCount: { [mediaId: string]: number };
  mediaUsageSummary: MediaUsageItem[];
  unassignedReasons: { [segmentId: string]: string };
  unassignedDetails: UnassignedSegmentDetail[];
  warnings: string[];
  coveragePercentage: number;
  sourceStartsOptimized?: number;
  durationAdjustmentsCount?: number;
  continuityLinksCount?: number;
  roleBreakdown?: { [role in NarrationRole]?: number };
  beatCount?: number;
  continuationSegments?: number;
  standaloneSegments?: number;
  varietyAdjustments?: number;
  repetitionPenalties?: number;
  visualVarietyBonuses?: number;
  pacingAdjustments?: number;
  pacingArcAdjustments?: number;
  emphasisImpactAdjustments?: number;
  highImpactSelections?: number;
  moderateImpactSelections?: number;
  lowImpactSelections?: number;
  contrastAdjustments?: number;
  staticCompatibleSelections?: number;
  dynamicCompatibleSelections?: number;
  contrastWarnings?: number;
  subjectContinuityAdjustments?: number;
  highSubjectContinuitySelections?: number;
  moderateSubjectContinuitySelections?: number;
  lowSubjectContinuitySelections?: number;
  framingAdjustments?: number;
  wideFramingSelections?: number;
  mediumFramingSelections?: number;
  closeupFramingSelections?: number;
  detailFramingSelections?: number;
  framingBonuses?: number;
  framingPenalties?: number;
  atmosphericAdjustments?: number;
  warmToneSelections?: number;
  coolToneSelections?: number;
  brightToneSelections?: number;
  darkToneSelections?: number;
  atmosphericBonuses?: number;
  atmosphericPenalties?: number;
  motionAdjustments?: number;
  staticMotionSelections?: number;
  dynamicMotionSelections?: number;
  panningMotionSelections?: number;
  zoomingMotionSelections?: number;
  smoothMotionSelections?: number;
  motionBonuses?: number;
  motionPenalties?: number;
  settingAdjustments?: number;
  indoorSettingSelections?: number;
  natureSettingSelections?: number;
  urbanSettingSelections?: number;
  abstractSettingSelections?: number;
  settingBonuses?: number;
  settingPenalties?: number;
  densityAdjustments?: number;
  soloSubjectSelections?: number;
  duoSubjectSelections?: number;
  groupSubjectSelections?: number;
  crowdSubjectSelections?: number;
  uninhabitedSelections?: number;
  densityBonuses?: number;
  densityPenalties?: number;
  angleAdjustments?: number;
  aerialAngleSelections?: number;
  highAngleSelections?: number;
  eyeLevelAngleSelections?: number;
  lowAngleSelections?: number;
  groundAngleSelections?: number;
  angleBonuses?: number;
  anglePenalties?: number;
  timeAdjustments?: number;
  daylightSelections?: number;
  sunsetSelections?: number;
  nightSelections?: number;
  dawnSelections?: number;
  timelessSelections?: number;
  timeBonuses?: number;
  timePenalties?: number;
  weatherAdjustments?: number;
  clearWeatherSelections?: number;
  overcastWeatherSelections?: number;
  rainWeatherSelections?: number;
  snowWeatherSelections?: number;
  fogWeatherSelections?: number;
  weatherAgnosticSelections?: number;
  weatherBonuses?: number;
  weatherPenalties?: number;
  depthAdjustments?: number;
  shallowBokehSelections?: number;
  deepFocusSelections?: number;
  rackFocusSelections?: number;
  softDreamySelections?: number;
  depthAgnosticSelections?: number;
  depthBonuses?: number;
  depthPenalties?: number;
  temporalRateAdjustments?: number;
  realtimeSelections?: number;
  slowMotionSelections?: number;
  timelapseSelections?: number;
  stopMotionSelections?: number;
  temporalAgnosticSelections?: number;
  temporalRateBonuses?: number;
  temporalRatePenalties?: number;
  mediumAdjustments?: number;
  liveActionSelections?: number;
  screencastSelections?: number;
  animationSelections?: number;
  cgi3dSelections?: number;
  abstractGraphicSelections?: number;
  mediumAgnosticSelections?: number;
  mediumBonuses?: number;
  mediumPenalties?: number;
  compositionAdjustments?: number;
  centeredSelections?: number;
  leftThirdSelections?: number;
  rightThirdSelections?: number;
  distributedSelections?: number;
  compositionAgnosticSelections?: number;
  compositionBonuses?: number;
  compositionPenalties?: number;
  lightingAdjustments?: number;
  frontalLightingSelections?: number;
  sideLightingSelections?: number;
  backlitSelections?: number;
  overheadLightingSelections?: number;
  diffuseLightingSelections?: number;
  lightingAgnosticSelections?: number;
  lightingBonuses?: number;
  lightingPenalties?: number;
  povAdjustments?: number;
  firstPersonSelections?: number;
  overTheShoulderSelections?: number;
  directAddressSelections?: number;
  observationalSelections?: number;
  povAgnosticSelections?: number;
  povBonuses?: number;
  povPenalties?: number;
  chromaticAdjustments?: number;
  monochromeSelections?: number;
  vibrantSelections?: number;
  mutedSelections?: number;
  sepiaDuotoneSelections?: number;
  naturalChromaticSelections?: number;
  chromaticAgnosticSelections?: number;
  chromaticBonuses?: number;
  chromaticPenalties?: number;
  trajectoryAdjustments?: number;
  approachingSelections?: number;
  recedingSelections?: number;
  leftToRightSelections?: number;
  rightToLeftSelections?: number;
  rotationalSelections?: number;
  trajectoryAgnosticSelections?: number;
  trajectoryBonuses?: number;
  trajectoryPenalties?: number;
  lensAdjustments?: number;
  fisheyeSelections?: number;
  wideAngleSelections?: number;
  standardLensSelections?: number;
  telephotoSelections?: number;
  macroSelections?: number;
  lensAgnosticSelections?: number;
  lensBonuses?: number;
  lensPenalties?: number;
  textureAdjustments?: number;
  pristineDigitalSelections?: number;
  filmGrainSelections?: number;
  analogVhsSelections?: number;
  grittyNoiseSelections?: number;
  diffusionGlowSelections?: number;
  textureAgnosticSelections?: number;
  textureBonuses?: number;
  texturePenalties?: number;
  visualBudgetAdjustments?: number;
  visualBudgetClampedBonuses?: number;
  visualBudgetClampedPenalties?: number;
  visualIntelligenceBudgetUsed?: number;
  semanticProtectionAdjustments?: number;
  semanticRankingSafetyBandUsed?: number;
  highConfidenceSelections?: number;    // Step 48: Segments where selectionMargin >= 0.050
  moderateConfidenceSelections?: number; // Step 48: Segments where 0.020 <= selectionMargin < 0.050
  lowConfidenceSelections?: number;     // Step 48: Segments where selectionMargin < 0.020
  averageSelectionMargin?: number;      // Step 48: Mean selectionMargin across all assigned segments
  quickPacingSelections?: number;
  normalPacingSelections?: number;
  lingeringPacingSelections?: number;
  thresholdUsed: number;
  reusePenaltyUsed: number;
  continuityPreferenceUsed: number;
  generatedAt: number;
}

export interface DraftResult {
  timeline: TimelineItem[];
  stats: DraftStats;
  unassignedSegmentIds: string[];
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.30;
export const DEFAULT_REUSE_PENALTY = 0.08;
export const DEFAULT_CONTINUITY_PREFERENCE = 0.03;

/**
 * Step 46: Global Visual Intelligence Budget constant.
 * Bounds the aggregate additive influence of Steps 28–45 micro-intelligence layers to [-0.050, +0.050].
 * Preserves individual layer sensitivity while strictly preventing cumulative score runaway.
 */
export const GLOBAL_VISUAL_INTELLIGENCE_BUDGET = 0.050;

/**
 * Step 47: Semantic Ranking Safety Band constant.
 * Guarantees that when candidate A has a raw semantic similarity at least 0.100 higher than candidate B,
 * the bounded visual subsystem cannot cause B to outrank A.
 */
export const VISUAL_RANKING_SEMANTIC_SAFETY_BAND = 0.100;

// Generic filler words to discount when evaluating semantic strength
const GENERIC_STOPWORDS = new Set([
  'scene',
  'person',
  'video',
  'image',
  'background',
  'photo',
  'clip',
  'picture',
  'footage',
  'shot',
  'stock',
  'view',
  'wallpaper',
]);

// Common grammatical words to ignore during keyword matching
const COMMON_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'between',
  'through', 'about', 'after', 'before', 'without', 'during', 'against',
  'that', 'this', 'these', 'those', 'they', 'them', 'their', 'there', 'here',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'have', 'has', 'had', 'having', 'been', 'being', 'were', 'does', 'doing',
  'would', 'should', 'could', 'might', 'must', 'will', 'shall', 'inside', 'outside',
  ...GENERIC_STOPWORDS,
]);

// Action and movement terms to detect dynamic narration
const ACTION_KEYWORDS = new Set([
  'enter', 'enters', 'entering', 'entered',
  'exit', 'exits', 'exiting', 'exited',
  'walk', 'walks', 'walking', 'walked',
  'run', 'runs', 'running', 'ran',
  'fly', 'flies', 'flying', 'flew',
  'move', 'moves', 'moving', 'moved',
  'turn', 'turns', 'turning', 'turned',
  'change', 'changes', 'changing', 'changed',
  'shift', 'shifts', 'shifting', 'shifted',
  'transition', 'transitions', 'transitioning',
  'arrive', 'arrives', 'arriving', 'arrived',
  'leave', 'leaves', 'leaving', 'left',
  'open', 'opens', 'opening', 'opened',
  'close', 'closes', 'closing', 'closed',
  'dock', 'docks', 'docking', 'docked',
  'launch', 'launches', 'launching', 'launched',
  'land', 'lands', 'landing', 'landed',
  'travel', 'travels', 'traveling', 'traveled',
  'drive', 'drives', 'driving', 'drove',
  'step', 'steps', 'stepping', 'stepped',
  'climb', 'climbs', 'climbing', 'climbed',
]);

/**
 * Calculates a generic noise penalty if the candidate's matched text or tags
 * consist predominantly of empty/generic descriptors.
 */
function calculateGenericNoiseDiscount(description?: string, tags: string[] = []): number {
  if (!description && tags.length === 0) return 0.85;

  const words = (description || '')
    .toLowerCase()
    .split(/[\s,._-]+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) return 0.90;

  const genericCount = words.filter((w) => GENERIC_STOPWORDS.has(w)).length;
  const genericRatio = genericCount / words.length;

  if (genericRatio > 0.65) {
    return 0.88; // 12% discount for overly generic descriptions
  }
  if (genericRatio > 0.40) {
    return 0.95; // 5% discount
  }
  return 1.0;
}

/**
 * Calculates temporal bonuses for video candidates with genuine temporal analysis:
 * 1. Multi-frame concept coverage (+0.025 if narration concepts appear across >= 2 keyframes)
 * 2. Key-moment alignment (+0.020 if the matched keyframe is marked isKeyMoment)
 * 3. Visual change / transition alignment (+0.020 if narration contains action and video has recorded visual change)
 * 
 * Strict constraints:
 * - Total temporal bonus is capped at +0.05
 * - Photos or videos without temporal analysis strictly return 0 bonus
 */
export function calculateTemporalBonus(
  candidateAsset: MediaAsset,
  segmentText: string,
  matchedSnippet?: string
): {
  totalBonus: number;
  isKeyMoment: boolean;
  hasVisualChange: boolean;
  temporalCoverageCount: number;
  reasonParts: string[];
} {
  // Photos and unanalyzed assets have 0 temporal bonus
  if (candidateAsset.type !== 'video' || !candidateAsset.analysis) {
    return {
      totalBonus: 0.0,
      isKeyMoment: false,
      hasVisualChange: false,
      temporalCoverageCount: 0,
      reasonParts: [],
    };
  }

  const keyframes = candidateAsset.analysis.keyframes || [];
  const keyframeDescs = candidateAsset.analysis.semantic?.keyframeDescriptions || [];
  const hasRecordedVisualChange = Boolean(
    candidateAsset.analysis.semantic?.hasVisualChange ||
    (candidateAsset.analysis.semantic?.visualChanges && candidateAsset.analysis.semantic.visualChanges.length > 0)
  );

  let coverageBonus = 0.0;
  let keyMomentBonus = 0.0;
  let visualChangeBonus = 0.0;
  const reasonParts: string[] = [];

  // Extract non-generic words from segment text (length >= 3)
  const segmentWords = segmentText
    .toLowerCase()
    .split(/[\s,._!?;:"'()]+/)
    .filter((w) => w.length >= 3 && !GENERIC_STOPWORDS.has(w));

  // 1. Multi-Frame Concept Coverage
  let matchingFramesCount = 0;
  if (keyframeDescs.length > 1) {
    for (const kd of keyframeDescs) {
      const frameText = `${kd.description || ''} ${(kd.tags || []).join(' ')}`.toLowerCase();
      const hasMatch = segmentWords.some((sw) => frameText.includes(sw));
      if (hasMatch) {
        matchingFramesCount++;
      }
    }
  } else if (keyframes.length > 1) {
    for (const kf of keyframes) {
      const frameText = `${kf.description || ''} ${(kf.tags || []).join(' ')}`.toLowerCase();
      const hasMatch = segmentWords.some((sw) => frameText.includes(sw));
      if (hasMatch) {
        matchingFramesCount++;
      }
    }
  }

  if (matchingFramesCount >= 2) {
    coverageBonus = 0.025;
    reasonParts.push(`temporal sequence also covers the narration's concepts (${matchingFramesCount} frames)`);
  }

  // 2. Key-Moment Awareness
  let isKeyMoment = false;
  if (matchedSnippet) {
    const matchedKd = keyframeDescs.find(
      (kd) => kd.isKeyMoment && (kd.description?.toLowerCase().includes(matchedSnippet.toLowerCase()) || matchedSnippet.toLowerCase().includes(kd.description?.toLowerCase() || ''))
    );
    const matchedKf = keyframes.find(
      (kf) => kf.isKeyMoment && (kf.description?.toLowerCase().includes(matchedSnippet.toLowerCase()) || matchedSnippet.toLowerCase().includes(kf.description?.toLowerCase() || ''))
    );
    if (matchedKd || matchedKf) {
      isKeyMoment = true;
    }
  }

  // If candidate has isKeyMoment frames and temporalSummary matched
  if (!isKeyMoment && candidateAsset.analysis.semantic?.temporalSummary && matchedSnippet === candidateAsset.analysis.semantic.temporalSummary) {
    const hasAnyKeyMoment = keyframeDescs.some((kd) => kd.isKeyMoment) || keyframes.some((kf) => kf.isKeyMoment);
    if (hasAnyKeyMoment) {
      isKeyMoment = true;
    }
  }

  if (isKeyMoment) {
    keyMomentBonus = 0.020;
    reasonParts.push('matches an informative key moment in footage');
  }

  // 3. Visual-Change / Action Alignment
  let hasVisualChangeAction = false;
  const hasActionInNarration = segmentWords.some((w) => ACTION_KEYWORDS.has(w));
  if (hasActionInNarration && hasRecordedVisualChange) {
    hasVisualChangeAction = true;
    visualChangeBonus = 0.020;
    reasonParts.push('video contains recorded visual transitions matching the dynamic narration');
  }

  const rawTotal = coverageBonus + keyMomentBonus + visualChangeBonus;
  // Cap total temporal bonus at +0.05 to keep semantic score dominant
  const totalBonus = Math.min(0.05, Math.round(rawTotal * 1000) / 1000);

  return {
    totalBonus,
    isKeyMoment,
    hasVisualChange: hasVisualChangeAction,
    temporalCoverageCount: matchingFramesCount,
    reasonParts,
  };
}

const ESTABLISHING_KEYWORDS = new Set([
  'landscape', 'city', 'mountains', 'mountain', 'sky', 'surface', 'planet',
  'space', 'station', 'room', 'horizon', 'valley', 'ocean', 'building',
  'exterior', 'wide', 'view', 'facility', 'overview', 'environment', 'scenery'
]);

/**
 * Step 20: Lightweight deterministic linguistic classifier for narration structural roles.
 * Classifies transcript segment into:
 * - establishing, action, description, transition, result, continuation, emphasis, unknown
 */
export function classifyNarrationRole(
  segmentText: string,
  segmentIndex: number = 0,
  totalSegments: number = 1,
  prevSegmentText?: string,
  nextSegmentText?: string
): {
  role: NarrationRole;
  reason: string;
} {
  const text = (segmentText || '').trim();
  if (!text) {
    return { role: 'unknown', reason: 'Role heuristic: neutral narration' };
  }

  const lower = text.toLowerCase();

  // 1. Transition Phrases
  if (
    /\b(meanwhile|afterwards|shortly after|a few minutes later|following this|at the same time|in the meantime|soon after|next up)\b/i.test(lower) ||
    /^(then|next|later|eventually|soon|suddenly|before long)\b/i.test(lower)
  ) {
    return { role: 'transition', reason: 'Role heuristic: transition phrase detected' };
  }

  // 2. Result Phrases
  if (
    /\b(as a result|which led to|ended with|consequently|resulting in|in the end)\b/i.test(lower) ||
    /^(therefore|finally|thus)\b/i.test(lower)
  ) {
    return { role: 'result', reason: 'Role heuristic: result/outcome structure detected' };
  }

  // 3. Continuation Phrases (also checking connection with previous segment)
  const prevLower = (prevSegmentText || '').toLowerCase();
  const nextLower = (nextSegmentText || '').toLowerCase();

  if (
    /\b(continued to|continued|kept on|furthermore|once again|as well)\b/i.test(lower) ||
    /^(he also|she also|they also|it also|still|again|and then)\b/i.test(lower) ||
    (segmentIndex > 0 && /^(he|she|they|it)\s+(also|still|went|saw|found|looked|kept|remained)\b/i.test(lower)) ||
    (Boolean(prevLower) && /^(and|while|as)\s+(he|she|they|it)\b/i.test(lower))
  ) {
    return { role: 'continuation', reason: 'Role heuristic: subject continuation detected' };
  }

  // 4. Contextual Transition before a distinct next segment
  if (Boolean(nextLower) && /^(meanwhile|later|after that)\b/i.test(nextLower) && /\b(before|prior to)\b/i.test(lower)) {
    return { role: 'transition', reason: 'Role heuristic: pre-transition context detected' };
  }

  // 5. Emphasis Phrases
  if (
    /\b(especially|particularly|most importantly|notably|in fact|crucially|remarkably|essential|vital|the key)\b/i.test(lower)
  ) {
    return { role: 'emphasis', reason: 'Role heuristic: linguistic emphasis detected' };
  }

  // 5. Establishing Setting / Scene Context
  if (
    /\b(arrived at|entered|came to|was at|stood at|appeared in|was seen|located in|outside the|inside the|welcome to|here in|around the|we find|begins at|overview of)\b/i.test(lower) ||
    (segmentIndex === 0 && totalSegments > 1 && Array.from(ESTABLISHING_KEYWORDS).some((kw) => lower.includes(kw))) ||
    (/\b(landscape|city|mountains|sky|surface|planet|space|station|room|horizon|valley|ocean|building|facility|temple|chamber)\b/i.test(lower) && /\b(is|was|stands|sits|lies|overlooking|features)\b/i.test(lower))
  ) {
    return { role: 'establishing', reason: 'Role heuristic: establishing scene context detected' };
  }

  // 6. Action Phrases
  const segmentWords = lower.split(/[\s,._!?;:"'()]+/);
  const hasActionVerb = segmentWords.some((w) => ACTION_KEYWORDS.has(w));
  if (hasActionVerb) {
    return { role: 'action', reason: 'Role heuristic: dynamic action terms detected' };
  }

  // 7. Descriptive scene details
  if (
    /\b(is covered with|features a|consists of|shows a|smooth|bright|dark|vast|enormous|quiet|serene|ancient|massive|towering|glowing|shimmering)\b/i.test(lower)
  ) {
    return { role: 'description', reason: 'Role heuristic: descriptive scene features detected' };
  }

  return { role: 'unknown', reason: 'Role heuristic: neutral narration' };
}

/**
 * Step 20: Deterministic scoring modifier based on classified narration structural role.
 * Maximum bonus is strictly capped at +0.020 so semantic score remains dominant.
 */
export function calculateNarrationRoleModifier(
  role: NarrationRole,
  candidateAsset: MediaAsset,
  prevAsset: MediaAsset | null,
  rawScore: number,
  isKeyMoment: boolean = false,
  hasVisualChange: boolean = false
): { bonus: number; reason?: string } {
  let bonus = 0.0;
  let reason: string | undefined = undefined;

  switch (role) {
    case 'establishing': {
      const assetTags = new Set(
        (candidateAsset.analysis?.semantic?.tags || candidateAsset.analysis?.tags || []).map((t) => t.toLowerCase())
      );
      const desc = (candidateAsset.analysis?.semantic?.description || candidateAsset.analysis?.description || '').toLowerCase();
      const hasEstablishingConcept = Array.from(ESTABLISHING_KEYWORDS).some(
        (kw) => assetTags.has(kw) || desc.includes(kw)
      );
      if (hasEstablishingConcept) {
        bonus = 0.020;
        reason = 'Role modifier: establishing setting concepts aligned';
      }
      break;
    }
    case 'action': {
      if (candidateAsset.type === 'video' && hasVisualChange) {
        bonus = 0.015;
        reason = 'Role modifier: action narration aligns with dynamic footage';
      }
      break;
    }
    case 'transition': {
      if (!prevAsset || candidateAsset.id !== prevAsset.id) {
        bonus = 0.015;
        reason = 'Role modifier: transition aligns with fresh visual scene';
      }
      break;
    }
    case 'result': {
      if (isKeyMoment) {
        bonus = 0.015;
        reason = 'Role modifier: result aligns with key moment in footage';
      }
      break;
    }
    case 'continuation': {
      if (prevAsset) {
        const candTags = new Set(
          (candidateAsset.analysis?.semantic?.tags || candidateAsset.analysis?.tags || []).map((t) => t.toLowerCase())
        );
        const prevTags = (prevAsset.analysis?.semantic?.tags || prevAsset.analysis?.tags || []).map((t) => t.toLowerCase());
        const shared = prevTags.filter((t) => candTags.has(t) && !COMMON_STOPWORDS.has(t));
        if (shared.length >= 1 || candidateAsset.id === prevAsset.id) {
          bonus = 0.015;
          reason = 'Role modifier: continuation aligns with ongoing subject';
        }
      }
      break;
    }
    case 'emphasis': {
      if (rawScore >= 0.70) {
        bonus = 0.015;
        reason = 'Role modifier: strong semantic match for emphatic narration';
      }
      break;
    }
    default:
      break;
  }

  // Cap role bonus at +0.020 max
  const cappedBonus = Math.min(0.020, Math.round(bonus * 1000) / 1000);
  return { bonus: cappedBonus, reason };
}

export interface NarrationBeatSegmentResult {
  narrationBeatType: NarrationBeatType;
  beatId: string;
  beatPosition: number;
  beatLength: number;
  beatReason: string;
}

/**
 * Step 21: Deterministic heuristic beat detector for a single segment relative to its neighbor.
 * Detects whether the current segment is a continuous extension of the previous subject/scene
 * or triggers a new beat.
 */
export function detectNarrationBeat(
  segmentText: string,
  segmentIndex: number = 0,
  _totalSegments: number = 1,
  prevSegmentText?: string,
  _nextSegmentText?: string,
  currentRole?: NarrationRole,
  previousRole?: NarrationRole
): {
  isContinuation: boolean;
  reason: string;
} {
  if (segmentIndex === 0 || !prevSegmentText || !prevSegmentText.trim()) {
    return { isContinuation: false, reason: 'First narration segment starts initial beat.' };
  }

  const text = (segmentText || '').trim();
  const lower = text.toLowerCase();
  const prevLower = (prevSegmentText || '').trim().toLowerCase();

  // 1. Explicit transition markers that trigger a fresh beat
  if (
    /\b(meanwhile|afterwards|shortly after|a few minutes later|following this|at the same time|in the meantime|soon after|next up)\b/i.test(lower) ||
    /^(then|next|later|eventually|soon|suddenly|before long)\b/i.test(lower) ||
    currentRole === 'transition'
  ) {
    // If text specifically begins with a direct pronoun continuation despite transition word, respect it
    if (/^(and|while|as)\s+(he|she|they|it|this|that)\b/i.test(lower)) {
      return { isContinuation: true, reason: 'Pronoun continuation following conjunction.' };
    }
    return { isContinuation: false, reason: 'Explicit transition phrase initiates new narration beat.' };
  }

  // 2. Strong new scene/location shift
  if (
    /\b(arrived at|came to|welcome to|inside the|outside the|in the laboratory|at the station|looking at the)\b/i.test(lower) &&
    currentRole === 'establishing' &&
    previousRole !== 'establishing'
  ) {
    return { isContinuation: false, reason: 'New establishing location initiates new narration beat.' };
  }

  // 3. Pronoun Continuation (Conservative check at beginning of clause)
  if (
    /^(it|this|that|they|them|he|she|these|those)\b/i.test(lower) ||
    /^(and|while|as|so)\s+(it|this|that|they|he|she|these|those)\b/i.test(lower) ||
    /^(he|she|they|it)\s+(also|still|is|was|had|continued|went|saw|found|looked|kept|remained)\b/i.test(lower)
  ) {
    return { isContinuation: true, reason: 'Pronoun subject continues previous narration beat.' };
  }

  // 4. Additive & Continuation Language
  if (
    /^(also|too|additionally|furthermore|and|while)\b/i.test(lower) ||
    /\b(continued to|continued|kept on|furthermore|once again|as well|still)\b/i.test(lower) ||
    currentRole === 'continuation'
  ) {
    return { isContinuation: true, reason: 'Additive continuation language continues previous beat.' };
  }

  // 5. Shared Meaningful Terms (Nouns / Distinctive Content Words length >= 4)
  const prevWords = new Set(
    prevLower
      .split(/[\s,._!?;:"'()]+/)
      .filter((w) => w.length >= 4 && !COMMON_STOPWORDS.has(w))
  );
  const currentWords = lower
    .split(/[\s,._!?;:"'()]+/)
    .filter((w) => w.length >= 4 && !COMMON_STOPWORDS.has(w));

  const sharedTerms = currentWords.filter((w) => prevWords.has(w));
  if (sharedTerms.length >= 1) {
    return {
      isContinuation: true,
      reason: `Shares meaningful subject terms (${Array.from(new Set(sharedTerms)).slice(0, 2).join(', ')}) with previous segment.`,
    };
  }

  // 6. Compatible Narration Roles
  if (
    (previousRole === 'establishing' && (currentRole === 'description' || currentRole === 'action')) ||
    (previousRole === 'action' && (currentRole === 'description' || currentRole === 'result')) ||
    (previousRole === 'description' && currentRole === 'description')
  ) {
    return {
      isContinuation: true,
      reason: `Compatible narration role sequence (${previousRole} -> ${currentRole}) continues beat.`,
    };
  }

  // 7. Default: Distinct / Standalone topic
  return { isContinuation: false, reason: 'Distinct subject / new narration beat.' };
}

/**
 * Step 21: Pre-pass group detector for complete narration beats across all transcript segments.
 * Enforces maximum beat size of 4 segments, deterministic IDs ('beat-0', 'beat-1', ...),
 * and assigns honest labels (STANDALONE, NEW_BEAT, CONTINUING_BEAT, BEAT_END).
 */
export function detectNarrationBeats(
  segments: AudioSegment[],
  roles?: NarrationRole[]
): NarrationBeatSegmentResult[] {
  if (!segments || segments.length === 0) return [];

  const total = segments.length;
  const computedRoles: NarrationRole[] = roles && roles.length === total
    ? roles
    : segments.map((seg, idx) => {
        const prevText = idx > 0 ? segments[idx - 1]?.text : undefined;
        const nextText = idx + 1 < total ? segments[idx + 1]?.text : undefined;
        return classifyNarrationRole(seg.text, idx, total, prevText, nextText).role;
      });

  // Group indices into beats
  interface BeatGroup {
    id: string;
    items: Array<{ index: number; reason: string }>;
  }

  const groups: BeatGroup[] = [];
  let currentGroup: BeatGroup = {
    id: 'beat-0',
    items: [{ index: 0, reason: 'Initial narration beat' }],
  };

  for (let i = 1; i < total; i++) {
    const seg = segments[i];
    const prevSeg = segments[i - 1];
    const curRole = computedRoles[i];
    const prevRole = computedRoles[i - 1];
    const nextSeg = i + 1 < total ? segments[i + 1] : undefined;

    // Enforce max beat length of 4 segments
    if (currentGroup.items.length >= 4) {
      groups.push(currentGroup);
      currentGroup = {
        id: `beat-${groups.length}`,
        items: [{ index: i, reason: 'New beat (maximum 4 segments reached)' }],
      };
      continue;
    }

    const decision = detectNarrationBeat(
      seg.text,
      i,
      total,
      prevSeg?.text,
      nextSeg?.text,
      curRole,
      prevRole
    );

    if (decision.isContinuation) {
      currentGroup.items.push({ index: i, reason: decision.reason });
    } else {
      groups.push(currentGroup);
      currentGroup = {
        id: `beat-${groups.length}`,
        items: [{ index: i, reason: decision.reason }],
      };
    }
  }

  if (currentGroup.items.length > 0) {
    groups.push(currentGroup);
  }

  // Map each segment index to its honest beat labeling
  const results: NarrationBeatSegmentResult[] = new Array(total);

  for (const g of groups) {
    const len = g.items.length;
    for (let pos = 0; pos < len; pos++) {
      const item = g.items[pos];
      const position = pos + 1; // 1-indexed

      let beatType: NarrationBeatType;
      if (len === 1) {
        beatType = 'STANDALONE';
      } else if (pos === 0) {
        beatType = 'NEW_BEAT';
      } else if (pos === len - 1) {
        beatType = 'BEAT_END';
      } else {
        beatType = 'CONTINUING_BEAT';
      }

      results[item.index] = {
        narrationBeatType: beatType,
        beatId: g.id,
        beatPosition: position,
        beatLength: len,
        beatReason: item.reason,
      };
    }
  }

  return results;
}

/**
 * Step 21: Deterministic scoring modifier based on Narration Beat context.
 * Strictly capped at [-0.015, +0.015] so semantic relevance remains dominant.
 */
export function calculateNarrationBeatModifier(
  beatId?: string,
  beatPosition?: number,
  beatLength?: number,
  candidateAsset?: MediaAsset,
  prevAsset?: MediaAsset | null,
  prevBeatId?: string | null
): { bonus: number; reason?: string } {
  if (!beatId || !prevBeatId || prevBeatId !== beatId || !prevAsset || !candidateAsset || !beatPosition || beatPosition <= 1 || (beatLength && beatLength <= 1)) {
    return { bonus: 0.0 };
  }

  // Candidate inside an active multi-segment beat:
  // Case A: Same asset continuation inside the active beat
  if (candidateAsset.id === prevAsset.id) {
    return {
      bonus: 0.012,
      reason: 'Beat modifier: same media continuity across active narration beat',
    };
  }

  // Case B: Thematic concept continuity with previous asset in beat
  const candTags = new Set(
    (candidateAsset.analysis?.semantic?.tags || candidateAsset.analysis?.tags || []).map((t) => t.toLowerCase())
  );
  const prevTags = (prevAsset.analysis?.semantic?.tags || prevAsset.analysis?.tags || []).map((t) => t.toLowerCase());
  const sharedTags = prevTags.filter((t) => candTags.has(t) && !COMMON_STOPWORDS.has(t));

  if (sharedTags.length >= 1) {
    return {
      bonus: 0.010,
      reason: `Beat modifier: thematic scene continuity within narration beat (${sharedTags.slice(0, 2).join(', ')})`,
    };
  }

  // Case C: Completely unrelated asset inside an active beat
  return {
    bonus: -0.010,
    reason: 'Beat modifier: penalized unrelated media within active narration beat',
  };
}

export type VisualOrientationClass = 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE' | 'ULTRAWIDE' | 'UNKNOWN';

export function getVisualOrientationClass(asset?: MediaAsset | null): VisualOrientationClass {
  if (!asset) return 'UNKNOWN';
  const w = asset.width || 0;
  const h = asset.height || 0;
  if (w <= 0 || h <= 0) return 'UNKNOWN';
  const ratio = w / h;
  if (ratio >= 2.0) return 'ULTRAWIDE';
  if (ratio >= 1.25) return 'LANDSCAPE';
  if (ratio <= 0.8) return 'PORTRAIT';
  return 'SQUARE';
}

/**
 * Step 22: Computes a normalized deterministic visual similarity score in range [0.0, 1.0].
 * Combines media type, coarse orientation, dominant color presence, brightness/contrast,
 * and semantic tag overlap.
 */
export function calculateVisualSimilarity(
  candidateAsset: MediaAsset,
  prevAsset: MediaAsset | null,
  isConsecutiveContinuation: boolean = false
): number {
  if (!prevAsset) return 0.0;

  // Same source asset
  if (candidateAsset.id === prevAsset.id) {
    // If Step 19 identified distinct temporal moment continuation
    if (isConsecutiveContinuation) {
      return 0.65;
    }
    return 1.0;
  }

  // 1. Media Type Similarity (Weight: 0.20)
  const typeSim = candidateAsset.type === prevAsset.type ? 1.0 : 0.0;

  // 2. Coarse Orientation Similarity (Weight: 0.20)
  const candOrient = getVisualOrientationClass(candidateAsset);
  const prevOrient = getVisualOrientationClass(prevAsset);
  const orientSim = (candOrient !== 'UNKNOWN' && prevOrient !== 'UNKNOWN' && candOrient === prevOrient) ? 1.0 : 0.0;

  // 3. Dominant Color Overlap (Weight: 0.20)
  const candColors = (candidateAsset.analysis?.visualFeatures?.dominantColors || []).map((c) => c.toLowerCase());
  const prevColors = (prevAsset.analysis?.visualFeatures?.dominantColors || []).map((c) => c.toLowerCase());
  let colorSim = 0.5; // neutral fallback if no colors
  if (candColors.length > 0 && prevColors.length > 0) {
    const sharedColors = candColors.filter((c) => prevColors.includes(c));
    colorSim = sharedColors.length > 0 ? 1.0 : 0.0;
  }

  // 4. Brightness & Contrast Similarity (Weight: 0.15)
  const candB = candidateAsset.analysis?.visualFeatures?.brightness ?? 0.5;
  const prevB = prevAsset.analysis?.visualFeatures?.brightness ?? 0.5;
  const candC = candidateAsset.analysis?.visualFeatures?.contrast ?? 0.5;
  const prevC = prevAsset.analysis?.visualFeatures?.contrast ?? 0.5;
  const lumSim = Math.max(0, 1.0 - (Math.abs(candB - prevB) * 0.5 + Math.abs(candC - prevC) * 0.5));

  // 5. Semantic Tag Overlap (Weight: 0.25)
  const candTags = new Set(
    (candidateAsset.analysis?.semantic?.tags || candidateAsset.analysis?.tags || []).map((t) => t.toLowerCase())
  );
  const prevTags = (prevAsset.analysis?.semantic?.tags || prevAsset.analysis?.tags || []).map((t) => t.toLowerCase());
  const sharedTags = prevTags.filter((t) => candTags.has(t) && !COMMON_STOPWORDS.has(t));
  const totalTags = new Set([...Array.from(candTags), ...prevTags]);
  const tagSim = totalTags.size > 0 ? sharedTags.length / totalTags.size : 0.0;

  const compositeSim = (typeSim * 0.20) + (orientSim * 0.20) + (colorSim * 0.20) + (lumSim * 0.15) + (tagSim * 0.25);
  return Math.max(0.0, Math.min(1.0, Math.round(compositeSim * 100) / 100));
}

/**
 * Step 22: Visual Variety & Anti-Repetition Modifier.
 * Evaluates candidate against previous shot to avoid visual monotony.
 * Strictly bounded in [-0.012, +0.012] so semantic relevance remains dominant.
 *
 * Consumes Step 19 isConsecutiveContinuation to waive/reduce repetition penalty
 * for legitimate temporal continuations.
 */
export function calculateVisualVarietyModifier(
  candidateAsset: MediaAsset,
  prevAsset: MediaAsset | null,
  isConsecutiveContinuation: boolean = false,
  _isRepetitionReduced: boolean = false
): {
  modifier: number;
  visualSimilarity: number;
  reason?: string;
} {
  if (!prevAsset) {
    return { modifier: 0.0, visualSimilarity: 0.0 };
  }

  const similarity = calculateVisualSimilarity(candidateAsset, prevAsset, isConsecutiveContinuation);

  // Case A: Same source asset
  if (candidateAsset.id === prevAsset.id) {
    if (isConsecutiveContinuation) {
      // Step 19 already vetted this as legitimate continuation
      return {
        modifier: 0.0,
        visualSimilarity: similarity,
        reason: 'Same source asset; repetition penalty waived for legitimate temporal continuation.',
      };
    } else {
      // Repetitive identical frame or static photo
      return {
        modifier: -0.010,
        visualSimilarity: similarity,
        reason: 'Same source asset; repetition penalty applied for visually identical shot.',
      };
    }
  }

  // Case B: Different assets
  if (similarity <= 0.35) {
    // Diverse visual appearance
    let reasonDetail = 'diverse visual presentation from previous shot';
    if (candidateAsset.type !== prevAsset.type) {
      reasonDetail = `diverse media type (${candidateAsset.type} vs ${prevAsset.type})`;
    } else if (getVisualOrientationClass(candidateAsset) !== getVisualOrientationClass(prevAsset)) {
      reasonDetail = `different orientation framing (${getVisualOrientationClass(candidateAsset)} vs ${getVisualOrientationClass(prevAsset)})`;
    }
    return {
      modifier: 0.008,
      visualSimilarity: similarity,
      reason: `Visual variety bonus: ${reasonDetail}.`,
    };
  } else if (similarity >= 0.75) {
    // Redundant appearance
    return {
      modifier: -0.008,
      visualSimilarity: similarity,
      reason: 'Visual variety penalty: high visual similarity and redundant appearance with previous shot.',
    };
  }

  // Neutral
  return {
    modifier: 0.0,
    visualSimilarity: similarity,
    reason: 'Balanced visual variety with previous shot.',
  };
}

/**
 * Step 23: Deterministic classification of narration segment into QUICK, NORMAL, or LINGERING pacing.
 */
export function classifyPacing(
  segmentDuration: number,
  narrationRole?: NarrationRole,
  isKeyMoment: boolean = false,
  hasVisualChange: boolean = false
): PacingClass {
  if (
    narrationRole === 'action' ||
    narrationRole === 'emphasis' ||
    segmentDuration <= 2.5 ||
    hasVisualChange ||
    isKeyMoment
  ) {
    return 'QUICK';
  }
  if (
    (narrationRole === 'description' || narrationRole === 'establishing' || segmentDuration >= 6.0) &&
    !hasVisualChange &&
    !isKeyMoment
  ) {
    return 'LINGERING';
  }
  return 'NORMAL';
}

/**
 * Step 23: Deterministic Pacing & Shot Rhythm Modifier.
 * Evaluates candidate fit for the narration pacing and preceding shot rhythm.
 * Strictly bounded in [-0.010, +0.010].
 *
 * Consumes Step 19 isConsecutiveContinuation and Step 21 narrationBeatType.
 */
export function calculatePacingModifier(
  candidateAsset: MediaAsset,
  previousTimelineItem: TimelineItem | null,
  narrationSegment: AudioSegment,
  narrationRole?: NarrationRole,
  narrationBeatType?: NarrationBeatType,
  pacingClass?: PacingClass,
  isConsecutiveContinuation: boolean = false,
  isKeyMoment: boolean = false,
  hasVisualChange: boolean = false
): {
  modifier: number;
  pacingClass: PacingClass;
  reason: string;
} {
  const segDur = Math.max(0.1, narrationSegment.endTime - narrationSegment.startTime);
  const resolvedClass = pacingClass || classifyPacing(segDur, narrationRole, isKeyMoment, hasVisualChange);

  let modifier = 0.0;
  let reason = 'Pacing alignment: standard narration rhythm.';

  const isCandidateVideo = candidateAsset.type === 'video';
  const hasCandVisualChange = Boolean(
    candidateAsset.analysis?.semantic?.hasVisualChange ||
    (candidateAsset.analysis?.semantic?.visualChanges && candidateAsset.analysis.semantic.visualChanges.length > 0)
  );
  const hasCandKeyMoment = Boolean(
    candidateAsset.analysis?.keyframes?.some((kf) => kf.isKeyMoment) ||
    candidateAsset.analysis?.semantic?.keyframeDescriptions?.some((kd) => kd.isKeyMoment)
  );

  // 1. Pacing category alignment
  if (resolvedClass === 'QUICK') {
    if (isCandidateVideo && (hasCandVisualChange || hasCandKeyMoment)) {
      modifier += 0.008;
      reason = 'Pacing bonus: dynamic footage aligns with rapid narration rhythm.';
    } else if (!isCandidateVideo) {
      modifier -= 0.006;
      reason = 'Pacing penalty: static image slows rapid narration cadence.';
    } else {
      modifier += 0.004;
      reason = 'Pacing alignment: video footage fits quick narration rhythm.';
    }
  } else if (resolvedClass === 'LINGERING') {
    if (!isCandidateVideo || (!hasCandVisualChange && !hasCandKeyMoment)) {
      modifier += 0.006;
      reason = 'Pacing bonus: stable visual aligns with lingering narration rhythm.';
    } else if (isCandidateVideo && hasCandVisualChange) {
      modifier -= 0.006;
      reason = 'Pacing penalty: volatile visual change interrupts lingering narration cadence.';
    } else {
      modifier += 0.002;
      reason = 'Pacing alignment: calm visual fits lingering narration.';
    }
  }

  // 2. Shot Rhythm Anti-Monotony Check (Only within active multi-segment beat)
  if (
    previousTimelineItem &&
    narrationBeatType &&
    narrationBeatType !== 'NEW_BEAT' &&
    narrationBeatType !== 'STANDALONE' &&
    !isConsecutiveContinuation
  ) {
    // Check if consecutive static visuals are accumulating
    const isPrevImage = previousTimelineItem.duration > 0 && !isCandidateVideo;
    if (isPrevImage && !isCandidateVideo) {
      modifier -= 0.004;
      reason = 'Pacing rhythm: penalized consecutive static shots in active beat.';
    }
  }

  // Strict bounding [-0.010, +0.010]
  const clampedModifier = Math.max(-0.010, Math.min(0.010, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    pacingClass: resolvedClass,
    reason,
  };
}

/**
 * Step 24: Deterministic Narration-to-Visual Pacing Arc Intelligence.
 * Evaluates candidate pacing fit relative to recent rolling rhythm history (max 3 previous shots).
 * Strictly bounded in [-0.008, +0.008].
 *
 * Consumes Step 23 candidate pacingClass, Step 19 isConsecutiveContinuation, and Step 21 narrationBeatType.
 */
export function calculatePacingArcModifier(
  candidatePacingClass: PacingClass,
  recentPacingClasses: PacingClass[] = [],
  narrationRole?: NarrationRole,
  narrationBeatType?: NarrationBeatType,
  isConsecutiveContinuation: boolean = false
): {
  modifier: number;
  reason?: string;
} {
  if (!recentPacingClasses || recentPacingClasses.length === 0) {
    return { modifier: 0.0 };
  }

  // 1. Reset / waived conditions
  if (narrationBeatType === 'NEW_BEAT' || narrationBeatType === 'STANDALONE') {
    return { modifier: 0.0, reason: 'Pacing arc pressure reset at beat boundary.' };
  }

  if (isConsecutiveContinuation) {
    return { modifier: 0.0, reason: 'Pacing arc penalty waived for legitimate temporal continuation.' };
  }

  if (narrationRole === 'transition') {
    return { modifier: 0.0, reason: 'Pacing arc pressure relieved by transition narration.' };
  }

  // Examine recent window (up to 3 shots)
  const window = recentPacingClasses.slice(-3);
  let modifier = 0.0;
  let reason: string | undefined = undefined;

  // Streak checks
  const isQuickStreak = window.length >= 2 && window.every((p) => p === 'QUICK');
  const isLingeringStreak = window.length >= 2 && window.every((p) => p === 'LINGERING');

  if (isQuickStreak) {
    if (
      narrationRole === 'description' ||
      narrationRole === 'establishing' ||
      narrationRole === 'result'
    ) {
      if (candidatePacingClass === 'LINGERING' || candidatePacingClass === 'NORMAL') {
        modifier = 0.006;
        reason = 'Pacing arc bonus: pacing transition relieves rapid shot cadence.';
      } else if (candidatePacingClass === 'QUICK') {
        modifier = -0.006;
        reason = 'Pacing arc penalty: prolonged quick streak during descriptive narration.';
      }
    }
  } else if (isLingeringStreak) {
    if (narrationRole === 'action' || narrationRole === 'emphasis') {
      if (candidatePacingClass === 'QUICK' || candidatePacingClass === 'NORMAL') {
        modifier = 0.006;
        reason = 'Pacing arc bonus: dynamic visual relieves prolonged static/lingering rhythm.';
      } else if (candidatePacingClass === 'LINGERING') {
        modifier = -0.006;
        reason = 'Pacing arc penalty: prolonged lingering rhythm slows action narration.';
      }
    }
  }

  // Strict bounding [-0.008, +0.008]
  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    reason,
  };
}

/**
 * Step 25: Deterministic calculation of normalized Visual Impact Score [0.0, 1.0].
 * Combines existing metadata signals: key moments, visual changes, video format, temporal coverage,
 * visual features (contrast/brightness), and meaningful concept tags.
 */
export function calculateVisualImpactScore(candidateAsset: MediaAsset): number {
  if (!candidateAsset) return 0.0;

  let score = 0.0;

  const isVideo = candidateAsset.type === 'video';
  if (isVideo) {
    score += 0.15;
  }

  // 1. Key Moments (Informative climax/highlights)
  const hasKeyMoment = Boolean(
    candidateAsset.analysis?.keyframes?.some((kf) => kf.isKeyMoment) ||
    candidateAsset.analysis?.semantic?.keyframeDescriptions?.some((kd) => kd.isKeyMoment)
  );
  if (hasKeyMoment) {
    score += 0.25;
  }

  // 2. Dynamic Visual Change / Visual Transitions
  const hasVisualChange = Boolean(
    candidateAsset.analysis?.semantic?.hasVisualChange ||
    (candidateAsset.analysis?.semantic?.visualChanges && candidateAsset.analysis.semantic.visualChanges.length > 0)
  );
  if (hasVisualChange) {
    score += 0.20;
  }

  // 3. Temporal Coverage & Rich Keyframes
  const keyframeCount = candidateAsset.analysis?.keyframes?.length || 0;
  if (keyframeCount >= 3) {
    score += 0.15;
  } else if (keyframeCount >= 1) {
    score += 0.08;
  }

  // 4. Brightness & Contrast Dynamism
  const contrast = candidateAsset.analysis?.visualFeatures?.contrast ?? 0.5;
  const brightness = candidateAsset.analysis?.visualFeatures?.brightness ?? 0.5;
  const isContrastive = contrast > 0.55 || Math.abs(brightness - 0.5) > 0.20;
  if (isContrastive) {
    score += 0.10;
  }

  // 5. Meaningful Visual Tags Count
  const tags = (candidateAsset.analysis?.semantic?.tags || candidateAsset.analysis?.tags || []).filter(
    (t) => !GENERIC_STOPWORDS.has(t.toLowerCase()) && !COMMON_STOPWORDS.has(t.toLowerCase())
  );
  if (tags.length >= 4) {
    score += 0.15;
  } else if (tags.length >= 2) {
    score += 0.08;
  }

  // Clamped in [0.0, 1.0]
  return Math.max(0.0, Math.min(1.0, Math.round(score * 1000) / 1000));
}

/**
 * Step 25: Deterministic Emphasis & Visual Impact Modifier.
 * Evaluates whether candidate visual impact matches narration structural emphasis.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateEmphasisImpactModifier(
  visualImpactScore: number,
  narrationRole?: NarrationRole,
  _narrationBeatType?: NarrationBeatType,
  isConsecutiveContinuation: boolean = false
): {
  modifier: number;
  reason?: string;
} {
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      reason: 'Emphasis impact penalty waived for legitimate temporal continuation.',
    };
  }

  let modifier = 0.0;
  let reason: string | undefined = undefined;

  switch (narrationRole) {
    case 'emphasis': {
      if (visualImpactScore >= 0.70) {
        modifier = 0.008;
        reason = 'Visual impact bonus: high-impact visual reinforces emphatic narration.';
      } else if (visualImpactScore < 0.40) {
        modifier = -0.006;
        reason = 'Visual impact penalty: low-impact visual undercuts emphatic narration.';
      } else {
        modifier = 0.002;
        reason = 'Visual impact alignment: moderate-impact visual matches emphatic narration.';
      }
      break;
    }
    case 'result': {
      if (visualImpactScore >= 0.70) {
        modifier = 0.006;
        reason = 'Visual impact bonus: strong visual delivers impactful result moment.';
      } else if (visualImpactScore < 0.40) {
        modifier = -0.004;
        reason = 'Visual impact penalty: subtle visual weakens result moment.';
      } else {
        modifier = 0.002;
        reason = 'Visual impact alignment: moderate visual supports result narration.';
      }
      break;
    }
    case 'action': {
      if (visualImpactScore >= 0.70) {
        modifier = 0.006;
        reason = 'Visual impact bonus: dynamic visual supports action narration.';
      } else if (visualImpactScore < 0.40) {
        modifier = -0.004;
        reason = 'Visual impact penalty: static/low-impact visual dampens action narration.';
      }
      break;
    }
    case 'establishing': {
      if (visualImpactScore >= 0.70) {
        modifier = 0.004;
        reason = 'Visual impact bonus: striking scene establishes narrative setting.';
      }
      break;
    }
    case 'description':
    case 'continuation':
    case 'transition':
    default: {
      modifier = 0.0;
      reason = undefined;
      break;
    }
  }

  // Strict bounding [-0.008, +0.008]
  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    reason,
  };
}

const STATIC_CALM_KEYWORDS = new Set([
  'calm', 'quiet', 'still', 'silent', 'peaceful', 'motionless', 'resting', 'unchanged', 'stable'
]);

const DYNAMIC_CHANGE_KEYWORDS = new Set([
  'suddenly', 'quickly', 'rapidly', 'exploded', 'changed', 'moved', 'running', 'rushed', 'accelerated', 'dramatic'
]);

const RESULT_FINAL_KEYWORDS = new Set([
  'finally', 'result', 'ended', 'completed', 'finished', 'outcome', 'revealed'
]);

const SCALE_IMPACT_KEYWORDS = new Set([
  'huge', 'massive', 'enormous', 'dramatic', 'remarkable', 'major', 'significant', 'important'
]);

/**
 * Step 26: Classifies visual state of an asset into STATIC, STABLE, DYNAMIC, or HIGH_IMPACT.
 */
export function classifyVisualState(
  candidateAsset: MediaAsset,
  visualImpactScore?: number
): VisualState {
  if (!candidateAsset) return 'STATIC';

  const impact = typeof visualImpactScore === 'number' ? visualImpactScore : calculateVisualImpactScore(candidateAsset);
  if (impact >= 0.70) {
    return 'HIGH_IMPACT';
  }

  if (candidateAsset.type !== 'video') {
    return 'STATIC';
  }

  const hasVisualChange = Boolean(
    candidateAsset.analysis?.semantic?.hasVisualChange ||
    (candidateAsset.analysis?.semantic?.visualChanges && candidateAsset.analysis.semantic.visualChanges.length > 0) ||
    candidateAsset.analysis?.keyframes?.some((kf) => kf.isKeyMoment)
  );

  if (hasVisualChange) {
    return 'DYNAMIC';
  }

  return 'STABLE';
}

/**
 * Step 26: Deterministic Narration-to-Visual Contrast Intelligence.
 * Evaluates compatibility between described narration state/action and candidate visual state.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateNarrationVisualContrastModifier(
  narrationText: string = '',
  narrationRole?: NarrationRole,
  candidateVisualState?: VisualState,
  visualImpactScore?: number,
  _hasVisualChange: boolean = false,
  _narrationBeatType?: NarrationBeatType,
  isConsecutiveContinuation: boolean = false
): {
  modifier: number;
  visualState: VisualState;
  reason?: string;
} {
  const vState = candidateVisualState || 'STATIC';

  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      visualState: vState,
      reason: 'Contrast penalty waived for legitimate temporal continuation.',
    };
  }

  const words = (narrationText || '')
    .toLowerCase()
    .split(/[\s,._!?;:"'()]+/)
    .filter(Boolean);

  const hasStaticCalm = words.some((w) => STATIC_CALM_KEYWORDS.has(w));
  const hasDynamicChange = words.some((w) => DYNAMIC_CHANGE_KEYWORDS.has(w));
  const hasScaleImpact = words.some((w) => SCALE_IMPACT_KEYWORDS.has(w));
  const hasResultFinal = words.some((w) => RESULT_FINAL_KEYWORDS.has(w));

  let modifier = 0.0;
  let reason: string | undefined = undefined;

  if (hasStaticCalm) {
    if (vState === 'STATIC' || vState === 'STABLE') {
      modifier = 0.006;
      reason = 'Contrast bonus: calm narration aligns with stable visual state.';
    } else if (vState === 'DYNAMIC' || vState === 'HIGH_IMPACT') {
      modifier = -0.006;
      reason = 'Contrast mismatch: dynamic visual conflicts with calm/still narration.';
    }
  } else if (hasDynamicChange) {
    if (vState === 'DYNAMIC' || vState === 'HIGH_IMPACT') {
      modifier = 0.006;
      reason = 'Contrast bonus: dynamic visual aligns with action/change narration.';
    } else if (vState === 'STATIC') {
      modifier = -0.006;
      reason = 'Contrast mismatch: static visual conflicts with active/changing narration.';
    }
  } else if (hasScaleImpact) {
    const impact = typeof visualImpactScore === 'number' ? visualImpactScore : 0.5;
    if (vState === 'HIGH_IMPACT' || impact >= 0.70) {
      modifier = 0.006;
      reason = 'Contrast bonus: high-impact visual reinforces prominent scale narration.';
    } else if (vState === 'STATIC' || impact < 0.40) {
      modifier = -0.004;
      reason = 'Contrast mismatch: low-impact visual undercuts prominent scale narration.';
    }
  } else if (hasResultFinal || narrationRole === 'result') {
    if (vState === 'HIGH_IMPACT' || vState === 'STABLE') {
      modifier = 0.004;
      reason = 'Contrast bonus: visual state delivers definitive result outcome.';
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    visualState: vState,
    reason,
  };
}

/**
 * Step 27: Extracts meaningful subject content tokens from narration text.
 * Rules:
 * - lowercase
 * - tokenize deterministically
 * - remove COMMON_STOPWORDS
 * - remove short tokens (< 4 chars)
 * - deduplicate preserving first-seen order
 */
export function extractSubjectTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !COMMON_STOPWORDS.has(w));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      result.push(w);
    }
  }
  return result;
}

/**
 * Step 27: Calculates lexical subject continuity overlap between current and previous narration segments.
 * Jaccard similarity: intersection / union.
 * HIGH: >= 0.50, MODERATE: >= 0.25 and < 0.50, LOW: < 0.25.
 */
export function calculateSubjectOverlap(
  currentTokens: string[],
  previousTokens: string[]
): {
  overlap: number;
  continuity: SubjectContinuityLevel;
} {
  if (!currentTokens.length || !previousTokens.length) {
    return { overlap: 0.0, continuity: 'LOW' };
  }

  const prevSet = new Set(previousTokens);
  const currSet = new Set(currentTokens);

  let intersectionCount = 0;
  for (const token of currSet) {
    if (prevSet.has(token)) {
      intersectionCount++;
    }
  }

  const allTokens = new Set([...currentTokens, ...previousTokens]);
  const unionCount = allTokens.size;
  if (unionCount === 0) {
    return { overlap: 0.0, continuity: 'LOW' };
  }

  const overlap = Math.round((intersectionCount / unionCount) * 1000) / 1000;
  let continuity: SubjectContinuityLevel = 'LOW';
  if (overlap >= 0.50) {
    continuity = 'HIGH';
  } else if (overlap >= 0.25) {
    continuity = 'MODERATE';
  } else {
    continuity = 'LOW';
  }

  return { overlap, continuity };
}

/**
 * Step 27: Matches narration subject tokens against existing candidate media metadata:
 * - meaningful tags
 * - temporal tags
 * - BLIP descriptions
 * - temporalSummary
 * Returns normalized score in [0.0, 1.0].
 */
export function calculateMediaSubjectMatch(
  narrationSubjectTokens: string[],
  candidateAsset: MediaAsset
): number {
  if (!narrationSubjectTokens || narrationSubjectTokens.length === 0 || !candidateAsset) {
    return 0.0;
  }

  const mediaWords = new Set<string>();

  // Asset analysis tags & semantic tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3 && !COMMON_STOPWORDS.has(t)) {
        mediaWords.add(t);
      }
    }
  }

  // Keyframes tags & descriptions
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3 && !COMMON_STOPWORDS.has(token)) {
              mediaWords.add(token);
            }
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3 && !COMMON_STOPWORDS.has(token)) {
            mediaWords.add(token);
          }
        }
      }
    }
  }

  // Semantic keyframe descriptions
  if (candidateAsset.analysis?.semantic?.keyframeDescriptions) {
    for (const kf of candidateAsset.analysis.semantic.keyframeDescriptions) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3 && !COMMON_STOPWORDS.has(token)) {
              mediaWords.add(token);
            }
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3 && !COMMON_STOPWORDS.has(token)) {
            mediaWords.add(token);
          }
        }
      }
    }
  }

  // Descriptions: general, semantic, temporalSummary, asset name
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
      for (const token of tokens) {
        if (token.length >= 3 && !COMMON_STOPWORDS.has(token)) {
          mediaWords.add(token);
        }
      }
    }
  }

  let matchedCount = 0;
  for (const token of narrationSubjectTokens) {
    if (mediaWords.has(token)) {
      matchedCount++;
    } else {
      let found = false;
      for (const mw of mediaWords) {
        if (mw === token || (mw.length >= 4 && token.length >= 4 && (mw.includes(token) || token.includes(mw)))) {
          found = true;
          break;
        }
      }
      if (found) {
        matchedCount++;
      }
    }
  }

  const score = Math.min(1.0, Math.max(0.0, matchedCount / narrationSubjectTokens.length));
  return Math.round(score * 1000) / 1000;
}

/**
 * Step 27: Narration Entity & Subject Continuity Intelligence.
 * Evaluates subject continuity across narration and candidate media.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateSubjectContinuityModifier(
  narrationSubjectTokens: string[] = [],
  previousNarrationSubjectTokens: string[] = [],
  mediaSubjectMatch: number = 0,
  narrationBeatType?: NarrationBeatType,
  isConsecutiveContinuation: boolean = false
): {
  modifier: number;
  subjectContinuity: SubjectContinuityLevel;
  reason: string;
  subjectMatchScore: number;
} {
  // Reset continuity pressure at NEW_BEAT or STANDALONE
  if (narrationBeatType === 'NEW_BEAT' || narrationBeatType === 'STANDALONE') {
    return {
      modifier: 0.0,
      subjectContinuity: 'LOW',
      reason: 'New beat / standalone segment - subject continuity reset.',
      subjectMatchScore: mediaSubjectMatch,
    };
  }

  const { overlap: _overlap, continuity: rawContinuity } = calculateSubjectOverlap(
    narrationSubjectTokens,
    previousNarrationSubjectTokens
  );

  let subjectContinuity: SubjectContinuityLevel = rawContinuity;
  if (narrationBeatType === 'CONTINUING_BEAT' && rawContinuity === 'LOW' && previousNarrationSubjectTokens.length > 0) {
    subjectContinuity = 'MODERATE';
  }

  let modifier = 0.0;
  let reason = 'Low subject continuity with previous segment - neutral candidate scoring.';

  if (subjectContinuity === 'HIGH') {
    if (mediaSubjectMatch >= 0.50) {
      modifier = mediaSubjectMatch >= 0.75 ? 0.008 : 0.006;
      reason = 'Strong subject continuity supported by matching media subject tags.';
    } else if (mediaSubjectMatch < 0.25) {
      if (isConsecutiveContinuation) {
        modifier = 0.0;
        reason = 'Temporal continuation preserved despite low lexical media overlap.';
      } else {
        modifier = -0.006;
        reason = 'Subject continuity expected but candidate media lacks subject overlap.';
      }
    } else {
      modifier = 0.002;
      reason = 'Moderate media subject match in continuous narration.';
    }
  } else if (subjectContinuity === 'MODERATE') {
    if (mediaSubjectMatch >= 0.50) {
      modifier = 0.004;
      reason = 'Moderate subject continuity with matching visual entity.';
    } else if (mediaSubjectMatch < 0.25) {
      if (isConsecutiveContinuation) {
        modifier = 0.0;
        reason = 'Temporal continuation preserved with moderate subject continuity.';
      } else {
        modifier = -0.002;
        reason = 'Moderate subject continuity with low visual subject overlap.';
      }
    } else {
      modifier = 0.0;
      reason = 'Moderate subject continuity neutral candidate scoring.';
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    subjectContinuity,
    reason,
    subjectMatchScore: mediaSubjectMatch,
  };
}

const WIDE_COMPOSITION_KEYWORDS = new Set([
  'wide', 'aerial', 'drone', 'landscape', 'panoramic', 'vista', 'horizon',
  'overview', 'skyline', 'mountains', 'mountain', 'ocean', 'sea', 'establishing',
  'scenery', 'exterior', 'environment', 'valley', 'space', 'cityscape', 'broad'
]);

const CLOSEUP_COMPOSITION_KEYWORDS = new Set([
  'portrait', 'face', 'headshot', 'interview', 'eyes', 'eye', 'mouth', 'smile', 'closeup', 'close-up'
]);

const DETAIL_COMPOSITION_KEYWORDS = new Set([
  'macro', 'micro', 'detail', 'texture', 'tiny', 'small', 'zoom-in',
  'extreme close', 'isolated', 'finger', 'grain', 'object close', 'device'
]);

const MEDIUM_COMPOSITION_KEYWORDS = new Set([
  'medium', 'action', 'walking', 'interaction', 'half', 'waist', 'standing', 'working', 'talking'
]);

const WIDE_INTENT_KEYWORDS = new Set([
  'wide', 'landscape', 'horizon', 'overview', 'world', 'city', 'mountains', 'mountain',
  'sky', 'ocean', 'scenery', 'environment', 'space', 'universe', 'surroundings',
  'everywhere', 'global', 'exterior', 'area', 'region', 'country', 'planet'
]);

const CLOSEUP_INTENT_KEYWORDS = new Set([
  'face', 'faces', 'eyes', 'eye', 'expression', 'expressions', 'smile', 'smiles',
  'smiling', 'gaze', 'gazes', 'gazed', 'gazing', 'whispered', 'whisper', 'reaction',
  'reactions', 'stared', 'staring', 'stare', 'glance', 'glanced', 'focus', 'focused',
  'emotion', 'emotional', 'tears', 'crying', 'laughing', 'portrait', 'headshot'
]);

const DETAIL_INTENT_KEYWORDS = new Set([
  'tiny', 'small', 'detail', 'texture', 'minute', 'intricate', 'button', 'microscopic',
  'grain', 'pattern', 'surface', 'finger', 'particle', 'switch', 'text', 'screen', 'device'
]);

/**
 * Step 28: Classifies the framing and composition scale of a media asset:
 * - WIDE: broad landscape, aerial, panoramic, establishing shots
 * - MEDIUM: waist/half body, action, interaction, general scene
 * - CLOSEUP: face, portrait, headshot, focused character
 * - DETAIL: macro, texture, microscopic, minute object
 * - STANDARD: standard default 16:9 framing
 */
export function classifyFramingScale(candidateAsset: MediaAsset): FramingScale {
  if (!candidateAsset) return 'STANDARD';

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const hasDetail = Array.from(words).some((w) => DETAIL_COMPOSITION_KEYWORDS.has(w));
  if (hasDetail) return 'DETAIL';

  const hasMultipleFaces = Boolean(
    candidateAsset.analysis?.visualFeatures?.hasFaces &&
    (candidateAsset.analysis?.visualFeatures?.faceCount || 0) > 1
  );
  const hasMedium = Array.from(words).some((w) => MEDIUM_COMPOSITION_KEYWORDS.has(w));
  if (hasMultipleFaces || (hasMedium && !Array.from(words).some((w) => CLOSEUP_COMPOSITION_KEYWORDS.has(w)))) {
    return 'MEDIUM';
  }

  const hasCloseup = Array.from(words).some((w) => CLOSEUP_COMPOSITION_KEYWORDS.has(w));
  const hasSingleFace = Boolean(
    candidateAsset.analysis?.visualFeatures?.hasFaces &&
    candidateAsset.analysis?.visualFeatures?.faceCount === 1
  );
  if (hasCloseup || hasSingleFace) return 'CLOSEUP';

  const hasWide = Array.from(words).some((w) => WIDE_COMPOSITION_KEYWORDS.has(w));
  const isBroadLandscape = Boolean(
    candidateAsset.analysis?.visualFeatures?.orientation === 'landscape' &&
    candidateAsset.aspectRatio >= 1.7 &&
    !candidateAsset.analysis?.visualFeatures?.hasFaces
  );
  if (hasWide) return 'WIDE';

  if (hasMedium) return 'MEDIUM';

  if (isBroadLandscape) return 'WIDE';

  return 'STANDARD';
}

/**
 * Step 28: Classifies the framing intent of narration text:
 * - WIDE: broad environmental/establishing intent
 * - CLOSEUP: intimate/character/facial focus
 * - DETAIL: microscopic/minute object/texture focus
 * - DYNAMIC: action/movement intent
 * - NEUTRAL: general narration
 */
export function classifyNarrationFramingIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): FramingIntent {
  if (narrationRole === 'establishing') {
    return 'WIDE';
  }

  const words = (narrationText || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'NEUTRAL';
  }

  if (words.some((w) => DETAIL_INTENT_KEYWORDS.has(w))) {
    return 'DETAIL';
  }

  if (words.some((w) => CLOSEUP_INTENT_KEYWORDS.has(w))) {
    return 'CLOSEUP';
  }

  if (words.some((w) => WIDE_INTENT_KEYWORDS.has(w))) {
    return 'WIDE';
  }

  if (narrationRole === 'action') {
    return 'DYNAMIC';
  }

  return 'NEUTRAL';
}

/**
 * Step 28: Shot Framing & Composition Scale Intelligence.
 * Evaluates compatibility between candidate framing scale and narration framing intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateFramingScaleModifier(
  candidateFraming: FramingScale,
  narrationIntent: FramingIntent,
  narrationRole?: NarrationRole,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  framingScale: FramingScale;
  framingIntent: FramingIntent;
  framingMatchScore: number;
  reason: string;
} {
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      framingScale: candidateFraming,
      framingIntent: narrationIntent,
      framingMatchScore: 1.0,
      reason: 'Framing penalty waived for legitimate temporal continuation.',
    };
  }

  if (narrationBeatType === 'NEW_BEAT' && candidateFraming === 'WIDE' && (narrationIntent === 'WIDE' || narrationRole === 'establishing')) {
    return {
      modifier: 0.008,
      framingScale: candidateFraming,
      framingIntent: narrationIntent,
      framingMatchScore: 1.0,
      reason: 'Framing bonus: wide establishing shot reinforces new narrative beat.',
    };
  }

  let modifier = 0.0;
  let framingMatchScore = 0.5;
  let reason = 'Neutral framing intent - standard scoring applied.';

  switch (narrationIntent) {
    case 'WIDE': {
      if (candidateFraming === 'WIDE') {
        modifier = 0.008;
        framingMatchScore = 1.0;
        reason = 'Framing bonus: wide composition matches broad establishing narration.';
      } else if (candidateFraming === 'STANDARD') {
        modifier = 0.002;
        framingMatchScore = 0.6;
        reason = 'Framing alignment: standard shot supports wide narration.';
      } else if (candidateFraming === 'MEDIUM') {
        modifier = 0.0;
        framingMatchScore = 0.5;
        reason = 'Framing neutral: medium shot for wide narration.';
      } else if (candidateFraming === 'CLOSEUP') {
        modifier = -0.004;
        framingMatchScore = 0.2;
        reason = 'Framing penalty: close-up shot conflicts with wide establishing context.';
      } else if (candidateFraming === 'DETAIL') {
        modifier = -0.006;
        framingMatchScore = 0.1;
        reason = 'Framing penalty: minute detail shot conflicts with wide establishing context.';
      }
      break;
    }
    case 'CLOSEUP': {
      if (candidateFraming === 'CLOSEUP') {
        modifier = 0.008;
        framingMatchScore = 1.0;
        reason = 'Framing bonus: close-up shot captures intimate/focused narration.';
      } else if (candidateFraming === 'DETAIL') {
        modifier = 0.004;
        framingMatchScore = 0.8;
        reason = 'Framing alignment: detail shot supports focused narration.';
      } else if (candidateFraming === 'MEDIUM') {
        modifier = 0.002;
        framingMatchScore = 0.6;
        reason = 'Framing alignment: medium shot supports subject narration.';
      } else if (candidateFraming === 'STANDARD') {
        modifier = 0.0;
        framingMatchScore = 0.5;
        reason = 'Framing neutral: standard composition for close-up narration.';
      } else if (candidateFraming === 'WIDE') {
        modifier = -0.004;
        framingMatchScore = 0.2;
        reason = 'Framing penalty: distant wide shot undercuts intimate close-up narration.';
      }
      break;
    }
    case 'DETAIL': {
      if (candidateFraming === 'DETAIL') {
        modifier = 0.008;
        framingMatchScore = 1.0;
        reason = 'Framing bonus: macro/detail shot perfectly illustrates minute subject.';
      } else if (candidateFraming === 'CLOSEUP') {
        modifier = 0.004;
        framingMatchScore = 0.8;
        reason = 'Framing alignment: close-up shot supports detail narration.';
      } else if (candidateFraming === 'MEDIUM') {
        modifier = -0.002;
        framingMatchScore = 0.4;
        reason = 'Framing mild penalty: medium shot lacks required detail focus.';
      } else if (candidateFraming === 'STANDARD') {
        modifier = 0.0;
        framingMatchScore = 0.5;
        reason = 'Framing neutral: standard framing for detail narration.';
      } else if (candidateFraming === 'WIDE') {
        modifier = -0.006;
        framingMatchScore = 0.1;
        reason = 'Framing penalty: wide shot loses focus on minute detail narration.';
      }
      break;
    }
    case 'DYNAMIC': {
      if (candidateFraming === 'MEDIUM') {
        modifier = 0.006;
        framingMatchScore = 1.0;
        reason = 'Framing bonus: medium composition provides optimal frame for action movement.';
      } else if (candidateFraming === 'WIDE') {
        modifier = 0.004;
        framingMatchScore = 0.8;
        reason = 'Framing alignment: wide shot shows full scope of dynamic action.';
      } else if (candidateFraming === 'STANDARD') {
        modifier = 0.002;
        framingMatchScore = 0.6;
        reason = 'Framing alignment: standard shot supports dynamic action.';
      } else if (candidateFraming === 'CLOSEUP') {
        modifier = 0.0;
        framingMatchScore = 0.5;
        reason = 'Framing neutral: close-up for action narration.';
      } else if (candidateFraming === 'DETAIL') {
        modifier = -0.004;
        framingMatchScore = 0.3;
        reason = 'Framing penalty: static detail shot dampens dynamic action narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      framingMatchScore = 0.5;
      reason = 'Neutral framing intent - standard scoring applied.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    framingScale: candidateFraming,
    framingIntent: narrationIntent,
    framingMatchScore: Math.round(framingMatchScore * 1000) / 1000,
    reason,
  };
}

const WARM_ATMOSPHERIC_KEYWORDS = new Set([
  'warm', 'warmth', 'sunset', 'sunrise', 'golden', 'sunny', 'sun', 'fire',
  'flame', 'summer', 'glow', 'heat', 'candlelight', 'amber', 'desert', 'dusk',
  'cozy', 'autumn', 'orange', 'red'
]);

const COOL_ATMOSPHERIC_KEYWORDS = new Set([
  'cold', 'cool', 'ice', 'icy', 'snow', 'snowy', 'winter', 'freezing',
  'frost', 'frosty', 'chill', 'chilly', 'blue', 'underwater', 'ocean',
  'deep sea', 'rain', 'storm', 'stormy', 'fog', 'foggy', 'mist', 'haze'
]);

const BRIGHT_ATMOSPHERIC_KEYWORDS = new Set([
  'bright', 'brilliant', 'illuminated', 'radiant', 'gleam', 'glare', 'dazzling',
  'crystal', 'high-key', 'blinding'
]);

const DARK_ATMOSPHERIC_KEYWORDS = new Set([
  'dark', 'darkness', 'night', 'nighttime', 'midnight', 'nocturnal', 'shadow',
  'shadows', 'gloomy', 'dim', 'black', 'twilight', 'moon', 'moonlight',
  'cave', 'underground', 'obscure', 'pitch'
]);

/**
 * Calculates average color warmth score in range [-1.0, 1.0] from hex color palette.
 * Positive = warm (red/yellow), Negative = cool (blue/cyan).
 */
export function calculateHexWarmth(hex: string): number {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) {
    return 0.0;
  }
  const r = parseInt(hex.substring(1, 3), 16) || 0;
  const g = parseInt(hex.substring(3, 5), 16) || 0;
  const b = parseInt(hex.substring(5, 7), 16) || 0;
  const total = r + g + b;
  if (total === 0) return 0.0;
  return Math.round(((r - b) / 255) * 1000) / 1000;
}

/**
 * Step 29: Classifies the lighting and atmospheric color tone of a media asset:
 * - WARM_VIBRANT: golden hour, warm sunset/sunrise, fireside, high warm-color saturation
 * - COOL_MUTED: ice/snow, underwater, cool blue tones, overcast fog
 * - HIGH_KEY_BRIGHT: bright daylight, high illumination, clear skies
 * - LOW_KEY_DARK: nighttime, nocturnal shadows, deep dark scenery
 * - NEUTRAL_BALANCED: balanced everyday lighting and neutral color tones
 */
export function classifyAtmosphericTone(candidateAsset: MediaAsset): AtmosphericTone {
  if (!candidateAsset) return 'NEUTRAL_BALANCED';

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);
  const hasDarkKeywords = tagList.some((w) => DARK_ATMOSPHERIC_KEYWORDS.has(w));
  const hasBrightKeywords = tagList.some((w) => BRIGHT_ATMOSPHERIC_KEYWORDS.has(w));
  const hasWarmKeywords = tagList.some((w) => WARM_ATMOSPHERIC_KEYWORDS.has(w));
  const hasCoolKeywords = tagList.some((w) => COOL_ATMOSPHERIC_KEYWORDS.has(w));

  const brightness = candidateAsset.analysis?.visualFeatures?.brightness ?? 0.5;
  const dominantColors = candidateAsset.analysis?.visualFeatures?.dominantColors || [];

  let avgWarmth = 0.0;
  if (dominantColors.length > 0) {
    const warmthSum = dominantColors.reduce((acc, hex) => acc + calculateHexWarmth(hex), 0);
    avgWarmth = warmthSum / dominantColors.length;
  }

  if (hasDarkKeywords || brightness < 0.28) {
    return 'LOW_KEY_DARK';
  }

  if (hasCoolKeywords || (avgWarmth < -0.18 && !hasWarmKeywords)) {
    return 'COOL_MUTED';
  }

  if (hasWarmKeywords || (avgWarmth > 0.18 && !hasCoolKeywords)) {
    return 'WARM_VIBRANT';
  }

  if (hasBrightKeywords || brightness > 0.78) {
    return 'HIGH_KEY_BRIGHT';
  }

  return 'NEUTRAL_BALANCED';
}

/**
 * Step 29: Classifies the atmospheric lighting intent of narration text:
 * - WARM: warm, sunset, golden, cozy, fire
 * - COOL: cold, ice, snow, winter, blue, underwater
 * - BRIGHT: bright daylight, brilliant illumination, radiant
 * - DARK: dark, night, shadow, midnight, nocturnal
 * - NEUTRAL: general narration
 */
export function classifyNarrationAtmosphericIntent(narrationText: string = ''): AtmosphericIntent {
  const words = (narrationText || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'NEUTRAL';
  }

  let darkCount = 0;
  let brightCount = 0;
  let warmCount = 0;
  let coolCount = 0;

  for (const w of words) {
    if (DARK_ATMOSPHERIC_KEYWORDS.has(w)) darkCount++;
    if (BRIGHT_ATMOSPHERIC_KEYWORDS.has(w)) brightCount++;
    if (WARM_ATMOSPHERIC_KEYWORDS.has(w)) warmCount++;
    if (COOL_ATMOSPHERIC_KEYWORDS.has(w)) coolCount++;
  }

  const maxCount = Math.max(darkCount, brightCount, warmCount, coolCount);
  if (maxCount === 0) return 'NEUTRAL';

  // Specific chromatic tones (WARM / COOL) take precedence over general intensity (BRIGHT / DARK) on ties
  if (warmCount === maxCount) return 'WARM';
  if (coolCount === maxCount) return 'COOL';
  if (darkCount === maxCount) return 'DARK';
  if (brightCount === maxCount) return 'BRIGHT';

  return 'NEUTRAL';
}

/**
 * Step 29: Color Mood & Atmospheric Lighting Intelligence.
 * Evaluates compatibility between candidate lighting/tonality and narration atmospheric intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateAtmosphericToneModifier(
  candidateTone: AtmosphericTone,
  narrationIntent: AtmosphericIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  atmosphericTone: AtmosphericTone;
  atmosphericIntent: AtmosphericIntent;
  atmosphericMatchScore: number;
  reason: string;
} {
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      atmosphericTone: candidateTone,
      atmosphericIntent: narrationIntent,
      atmosphericMatchScore: 1.0,
      reason: 'Atmospheric penalty waived for legitimate temporal continuation.',
    };
  }

  if (narrationBeatType === 'NEW_BEAT' && narrationIntent === 'NEUTRAL') {
    return {
      modifier: 0.0,
      atmosphericTone: candidateTone,
      atmosphericIntent: narrationIntent,
      atmosphericMatchScore: 0.5,
      reason: 'New beat atmospheric reset - standard baseline scoring.',
    };
  }

  let modifier = 0.0;
  let atmosphericMatchScore = 0.5;
  let reason = 'Neutral atmospheric intent - balanced tone scoring.';

  switch (narrationIntent) {
    case 'WARM': {
      if (candidateTone === 'WARM_VIBRANT') {
        modifier = 0.008;
        atmosphericMatchScore = 1.0;
        reason = 'Atmospheric bonus: warm vibrant lighting matches warm narrative mood.';
      } else if (candidateTone === 'HIGH_KEY_BRIGHT') {
        modifier = 0.003;
        atmosphericMatchScore = 0.7;
        reason = 'Atmospheric alignment: bright illumination supports warm setting.';
      } else if (candidateTone === 'NEUTRAL_BALANCED') {
        modifier = 0.0;
        atmosphericMatchScore = 0.5;
        reason = 'Atmospheric neutral: balanced tone for warm narration.';
      } else if (candidateTone === 'COOL_MUTED') {
        modifier = -0.004;
        atmosphericMatchScore = 0.2;
        reason = 'Atmospheric penalty: cool muted lighting clashes with warm narrative mood.';
      } else if (candidateTone === 'LOW_KEY_DARK') {
        modifier = -0.006;
        atmosphericMatchScore = 0.1;
        reason = 'Atmospheric penalty: dark shadowy lighting conflicts with warm setting.';
      }
      break;
    }
    case 'COOL': {
      if (candidateTone === 'COOL_MUTED') {
        modifier = 0.008;
        atmosphericMatchScore = 1.0;
        reason = 'Atmospheric bonus: cool muted lighting matches cold/cool narrative mood.';
      } else if (candidateTone === 'LOW_KEY_DARK') {
        modifier = 0.003;
        atmosphericMatchScore = 0.7;
        reason = 'Atmospheric alignment: dark tones support cool nocturnal setting.';
      } else if (candidateTone === 'NEUTRAL_BALANCED') {
        modifier = 0.0;
        atmosphericMatchScore = 0.5;
        reason = 'Atmospheric neutral: balanced tone for cool narration.';
      } else if (candidateTone === 'WARM_VIBRANT') {
        modifier = -0.004;
        atmosphericMatchScore = 0.2;
        reason = 'Atmospheric penalty: warm golden lighting clashes with cool/cold narrative mood.';
      } else if (candidateTone === 'HIGH_KEY_BRIGHT') {
        modifier = -0.002;
        atmosphericMatchScore = 0.4;
        reason = 'Atmospheric mild penalty: high-key illumination weakens cool atmosphere.';
      }
      break;
    }
    case 'BRIGHT': {
      if (candidateTone === 'HIGH_KEY_BRIGHT') {
        modifier = 0.008;
        atmosphericMatchScore = 1.0;
        reason = 'Atmospheric bonus: high-key bright illumination reinforces radiant narration.';
      } else if (candidateTone === 'WARM_VIBRANT') {
        modifier = 0.004;
        atmosphericMatchScore = 0.8;
        reason = 'Atmospheric alignment: vibrant sunny lighting supports bright setting.';
      } else if (candidateTone === 'NEUTRAL_BALANCED') {
        modifier = 0.0;
        atmosphericMatchScore = 0.5;
        reason = 'Atmospheric neutral: balanced lighting for bright narration.';
      } else if (candidateTone === 'COOL_MUTED') {
        modifier = -0.002;
        atmosphericMatchScore = 0.4;
        reason = 'Atmospheric mild penalty: muted lighting dampens bright narration.';
      } else if (candidateTone === 'LOW_KEY_DARK') {
        modifier = -0.006;
        atmosphericMatchScore = 0.1;
        reason = 'Atmospheric penalty: dark shadows directly contradict bright/radiant narration.';
      }
      break;
    }
    case 'DARK': {
      if (candidateTone === 'LOW_KEY_DARK') {
        modifier = 0.008;
        atmosphericMatchScore = 1.0;
        reason = 'Atmospheric bonus: low-key dark lighting matches nocturnal/shadowy narration.';
      } else if (candidateTone === 'COOL_MUTED') {
        modifier = 0.004;
        atmosphericMatchScore = 0.8;
        reason = 'Atmospheric alignment: cool muted tone supports dark setting.';
      } else if (candidateTone === 'NEUTRAL_BALANCED') {
        modifier = 0.0;
        atmosphericMatchScore = 0.5;
        reason = 'Atmospheric neutral: balanced lighting for dark narration.';
      } else if (candidateTone === 'WARM_VIBRANT') {
        modifier = -0.004;
        atmosphericMatchScore = 0.2;
        reason = 'Atmospheric penalty: warm daylight clashes with dark nocturnal narration.';
      } else if (candidateTone === 'HIGH_KEY_BRIGHT') {
        modifier = -0.006;
        atmosphericMatchScore = 0.1;
        reason = 'Atmospheric penalty: high-key bright illumination conflicts with dark/night setting.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      atmosphericMatchScore = 0.5;
      reason = 'Neutral atmospheric intent - balanced tone scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    atmosphericTone: candidateTone,
    atmosphericIntent: narrationIntent,
    atmosphericMatchScore: Math.round(atmosphericMatchScore * 1000) / 1000,
    reason,
  };
}

const STATIC_MOTION_KEYWORDS = new Set([
  'static', 'tripod', 'locked', 'still', 'motionless', 'fixed', 'calm',
  'peaceful', 'idle', 'portrait', 'frozen', 'steady', 'stationary', 'quiet', 'silent'
]);

const PAN_MOTION_KEYWORDS = new Set([
  'pan', 'panning', 'sweep', 'sweeping', 'panorama', 'panoramic', 'lateral',
  'tilt', 'tilting', 'survey', 'surveying', 'scan', 'scanning', 'horizontal', 'tracking'
]);

const ZOOM_MOTION_KEYWORDS = new Set([
  'zoom', 'zooming', 'push in', 'pull out', 'macro focus', 'close focus',
  'dolly zoom', 'scale in', 'focus', 'focusing', 'focus pull', 'dive', 'inspect',
  'inspecting', 'inspection', 'examine', 'examining'
]);

const ACTION_MOTION_KEYWORDS = new Set([
  'action', 'fast', 'chase', 'racing', 'running', 'sprint', 'driving', 'flight',
  'explode', 'explosion', 'rapid', 'dynamic', 'handheld', 'shaky', 'combat',
  'crash', 'speed', 'rush', 'sprinting', 'fleeing', 'quick'
]);

const SMOOTH_MOTION_KEYWORDS = new Set([
  'drone', 'aerial', 'glide', 'gliding', 'hover', 'soar', 'floating',
  'steadicam', 'gimbal', 'smooth', 'drift', 'flyover', 'cinematic fly', 'float'
]);

/**
 * Step 30: Classifies the camera movement and kinetic motion dynamics of a media asset:
 * - STATIC_LOCKED: Still photo, motionless tripod, static composition
 * - PANNING_SWEEP: Horizontal pan, sweeping landscape, panoramic scan
 * - ZOOMING_FOCUS: Optical zoom, push-in, focus transition, detail inspection
 * - DYNAMIC_ACTION: Fast kinetic movement, handheld, high motion energy, action sequence
 * - SMOOTH_FLOAT: Drone flyover, steadicam glide, floating aerial drift
 */
export function classifyCameraMotion(candidateAsset: MediaAsset): CameraMotion {
  if (!candidateAsset) return 'STATIC_LOCKED';

  // Still images are inherently static
  if (candidateAsset.type === 'image') {
    return 'STATIC_LOCKED';
  }

  const words = new Set<string>();

  // Tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Descriptions & temporal summaries
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let staticCount = 0;
  let panCount = 0;
  let zoomCount = 0;
  let actionCount = 0;
  let smoothCount = 0;

  for (const w of tagList) {
    if (STATIC_MOTION_KEYWORDS.has(w)) staticCount++;
    if (PAN_MOTION_KEYWORDS.has(w)) panCount++;
    if (ZOOM_MOTION_KEYWORDS.has(w)) zoomCount++;
    if (ACTION_MOTION_KEYWORDS.has(w)) actionCount++;
    if (SMOOTH_MOTION_KEYWORDS.has(w)) smoothCount++;
  }

  // Check visualChanges array or hasVisualChange flag
  const hasVisualChange = candidateAsset.analysis?.semantic?.hasVisualChange;
  const visualChanges = candidateAsset.analysis?.semantic?.visualChanges || [];
  if (hasVisualChange || visualChanges.length > 0) {
    actionCount += 1;
  }

  const maxCount = Math.max(staticCount, panCount, zoomCount, actionCount, smoothCount);

  if (maxCount > 0) {
    if (actionCount === maxCount) return 'DYNAMIC_ACTION';
    if (smoothCount === maxCount) return 'SMOOTH_FLOAT';
    if (panCount === maxCount) return 'PANNING_SWEEP';
    if (zoomCount === maxCount) return 'ZOOMING_FOCUS';
    if (staticCount === maxCount) return 'STATIC_LOCKED';
  }

  return 'STATIC_LOCKED';
}

/**
 * Step 30: Classifies narration kinetic motion intent:
 * - STATIC: calm, still, quiet, peaceful, motionless, paused
 * - PAN: sweep, across, scanning, horizon, pan, panorama, wide sweep
 * - ZOOM: focus, inspect, close look, zoom, examine, dive into, push in
 * - ACTION: fast, rush, run, sprint, drive, chase, fly, race, burst, rapid
 * - SMOOTH: glide, drift, soar, floating, smooth, hover, drone, aerial
 * - NEUTRAL: general narration
 */
export function classifyNarrationMotionIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): MotionIntent {
  const words = (narrationText || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let staticCount = 0;
  let panCount = 0;
  let zoomCount = 0;
  let actionCount = 0;
  let smoothCount = 0;

  for (const w of words) {
    if (STATIC_MOTION_KEYWORDS.has(w)) staticCount++;
    if (PAN_MOTION_KEYWORDS.has(w)) panCount++;
    if (ZOOM_MOTION_KEYWORDS.has(w)) zoomCount++;
    if (ACTION_MOTION_KEYWORDS.has(w)) actionCount++;
    if (SMOOTH_MOTION_KEYWORDS.has(w)) smoothCount++;
  }

  if (narrationRole === 'action') {
    actionCount += 2;
  }

  const maxCount = Math.max(staticCount, panCount, zoomCount, actionCount, smoothCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (actionCount === maxCount) return 'ACTION';
  if (smoothCount === maxCount) return 'SMOOTH';
  if (panCount === maxCount) return 'PAN';
  if (zoomCount === maxCount) return 'ZOOM';
  if (staticCount === maxCount) return 'STATIC';

  return 'NEUTRAL';
}

/**
 * Step 30: Camera Motion & Kinetic Dynamics Intelligence.
 * Evaluates compatibility between candidate camera/subject movement and narration kinetic intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateMotionDynamicsModifier(
  candidateMotion: CameraMotion,
  narrationIntent: MotionIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  cameraMotion: CameraMotion;
  motionIntent: MotionIntent;
  motionMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      cameraMotion: candidateMotion,
      motionIntent: narrationIntent,
      motionMatchScore: 0.8,
      reason: 'Consecutive shot continuation - camera motion penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && (narrationIntent === 'ACTION' || narrationIntent === 'PAN')) {
    if (candidateMotion === 'DYNAMIC_ACTION' || candidateMotion === 'PANNING_SWEEP') {
      return {
        modifier: 0.008,
        cameraMotion: candidateMotion,
        motionIntent: narrationIntent,
        motionMatchScore: 1.0,
        reason: 'New beat dynamic energy: sweeping/active motion establishes high kinetic momentum.',
      };
    }
  }

  let modifier = 0.0;
  let motionMatchScore = 0.5;
  let reason = 'Neutral motion intent - balanced camera movement scoring.';

  switch (narrationIntent) {
    case 'ACTION': {
      if (candidateMotion === 'DYNAMIC_ACTION') {
        modifier = 0.008;
        motionMatchScore = 1.0;
        reason = 'Kinetic bonus: dynamic action motion matches intense narration.';
      } else if (candidateMotion === 'SMOOTH_FLOAT') {
        modifier = 0.003;
        motionMatchScore = 0.7;
        reason = 'Kinetic alignment: smooth aerial tracking supports action narration.';
      } else if (candidateMotion === 'PANNING_SWEEP') {
        modifier = 0.002;
        motionMatchScore = 0.6;
        reason = 'Kinetic alignment: panning sweep supports active narrative momentum.';
      } else if (candidateMotion === 'ZOOMING_FOCUS') {
        modifier = 0.0;
        motionMatchScore = 0.5;
        reason = 'Kinetic neutral: zooming focus on action scene.';
      } else if (candidateMotion === 'STATIC_LOCKED') {
        modifier = -0.006;
        motionMatchScore = 0.15;
        reason = 'Kinetic penalty: static locked shot clashes with dynamic action narration.';
      }
      break;
    }
    case 'SMOOTH': {
      if (candidateMotion === 'SMOOTH_FLOAT') {
        modifier = 0.008;
        motionMatchScore = 1.0;
        reason = 'Kinetic bonus: smooth floating drone/steadicam matches gliding narration.';
      } else if (candidateMotion === 'PANNING_SWEEP') {
        modifier = 0.004;
        motionMatchScore = 0.8;
        reason = 'Kinetic alignment: steady panning sweep supports smooth visual trajectory.';
      } else if (candidateMotion === 'STATIC_LOCKED') {
        modifier = 0.0;
        motionMatchScore = 0.5;
        reason = 'Kinetic neutral: calm static framing for smooth narration.';
      } else if (candidateMotion === 'ZOOMING_FOCUS') {
        modifier = -0.002;
        motionMatchScore = 0.4;
        reason = 'Kinetic mild penalty: zooming focus disrupts smooth floating flow.';
      } else if (candidateMotion === 'DYNAMIC_ACTION') {
        modifier = -0.006;
        motionMatchScore = 0.15;
        reason = 'Kinetic penalty: erratic dynamic action contradicts smooth floating narration.';
      }
      break;
    }
    case 'PAN': {
      if (candidateMotion === 'PANNING_SWEEP') {
        modifier = 0.008;
        motionMatchScore = 1.0;
        reason = 'Kinetic bonus: sweeping panoramic motion matches scanning narration.';
      } else if (candidateMotion === 'SMOOTH_FLOAT') {
        modifier = 0.004;
        motionMatchScore = 0.8;
        reason = 'Kinetic alignment: smooth aerial glide supports panoramic survey.';
      } else if (candidateMotion === 'STATIC_LOCKED') {
        modifier = -0.004;
        motionMatchScore = 0.3;
        reason = 'Kinetic penalty: static locked camera fails to provide requested sweeping movement.';
      } else if (candidateMotion === 'DYNAMIC_ACTION') {
        modifier = -0.003;
        motionMatchScore = 0.35;
        reason = 'Kinetic penalty: rapid action motion interferes with measured panoramic scan.';
      } else if (candidateMotion === 'ZOOMING_FOCUS') {
        modifier = -0.002;
        motionMatchScore = 0.4;
        reason = 'Kinetic mild penalty: axial zoom contradicts lateral panning scan.';
      }
      break;
    }
    case 'ZOOM': {
      if (candidateMotion === 'ZOOMING_FOCUS') {
        modifier = 0.008;
        motionMatchScore = 1.0;
        reason = 'Kinetic bonus: zooming focus matches detailed inspection narration.';
      } else if (candidateMotion === 'STATIC_LOCKED') {
        modifier = 0.002;
        motionMatchScore = 0.6;
        reason = 'Kinetic alignment: static locked shot provides stable platform for inspection.';
      } else if (candidateMotion === 'SMOOTH_FLOAT') {
        modifier = -0.002;
        motionMatchScore = 0.4;
        reason = 'Kinetic mild penalty: wide floating glide distracts from targeted zoom inspection.';
      } else if (candidateMotion === 'PANNING_SWEEP') {
        modifier = -0.003;
        motionMatchScore = 0.35;
        reason = 'Kinetic penalty: lateral sweep conflicts with focal zoom inspection.';
      } else if (candidateMotion === 'DYNAMIC_ACTION') {
        modifier = -0.006;
        motionMatchScore = 0.15;
        reason = 'Kinetic penalty: intense dynamic motion prevents focused inspection.';
      }
      break;
    }
    case 'STATIC': {
      if (candidateMotion === 'STATIC_LOCKED') {
        modifier = 0.008;
        motionMatchScore = 1.0;
        reason = 'Kinetic bonus: calm static framing reinforces peaceful/motionless narration.';
      } else if (candidateMotion === 'SMOOTH_FLOAT') {
        modifier = 0.002;
        motionMatchScore = 0.6;
        reason = 'Kinetic alignment: subtle floating motion compatible with calm setting.';
      } else if (candidateMotion === 'PANNING_SWEEP') {
        modifier = -0.002;
        motionMatchScore = 0.4;
        reason = 'Kinetic mild penalty: panning sweep introduces unwanted motion for static scene.';
      } else if (candidateMotion === 'ZOOMING_FOCUS') {
        modifier = -0.003;
        motionMatchScore = 0.35;
        reason = 'Kinetic penalty: zoom movement disrupts stillness of static scene.';
      } else if (candidateMotion === 'DYNAMIC_ACTION') {
        modifier = -0.006;
        motionMatchScore = 0.15;
        reason = 'Kinetic penalty: dynamic action directly contradicts calm/motionless narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      motionMatchScore = 0.5;
      reason = 'Neutral motion intent - balanced camera movement scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    cameraMotion: candidateMotion,
    motionIntent: narrationIntent,
    motionMatchScore: Math.round(motionMatchScore * 1000) / 1000,
    reason,
  };
}

const INDOOR_SETTING_KEYWORDS = new Set([
  'indoor', 'indoors', 'interior', 'room', 'office', 'home', 'house', 'studio',
  'kitchen', 'bedroom', 'living room', 'desk', 'workspace', 'classroom', 'hallway',
  'corridor', 'building interior', 'lab', 'laboratory', 'workshop', 'boardroom',
  'conference', 'warehouse', 'garage', 'inside', 'apartment'
]);

const NATURE_SETTING_KEYWORDS = new Set([
  'nature', 'natural', 'forest', 'jungle', 'woods', 'mountain', 'mountains',
  'river', 'lake', 'ocean', 'sea', 'beach', 'coast', 'waterfall', 'desert',
  'wilderness', 'wildlife', 'trees', 'sky', 'clouds', 'hills', 'valley',
  'field', 'meadow', 'landscape', 'canyon', 'island', 'savanna'
]);

const URBAN_SETTING_KEYWORDS = new Set([
  'urban', 'city', 'street', 'streets', 'skyscraper', 'skyscrapers', 'downtown',
  'metropolis', 'traffic', 'highway', 'road', 'roads', 'bridge', 'subway',
  'sidewalk', 'buildings', 'architecture', 'town', 'avenue', 'cityscape',
  'skyline', 'neighborhood', 'alley'
]);

const ABSTRACT_SETTING_KEYWORDS = new Set([
  'abstract', 'backdrop', 'graphic', 'graphics', 'digital', 'render', '3d',
  'diagram', 'chart', 'data', 'concept', 'conceptual', 'solid background',
  'isolated', 'pattern', 'minimal', 'overlay', 'animation', 'code', 'ui'
]);

/**
 * Step 31: Classifies the spatial environment and scene setting of a media asset:
 * - INDOOR_INTERIOR: Interior spaces, offices, rooms, studios, workspaces
 * - OUTDOOR_NATURAL: Wilderness, landscapes, forests, oceans, mountains
 * - OUTDOOR_URBAN: Cities, streets, metropolitan buildings, highways
 * - STUDIO_ABSTRACT: Digital graphics, abstract patterns, isolated backdrops, 3D renders
 * - NEUTRAL_SETTING: Versatile or balanced scene settings
 */
export function classifySceneSetting(candidateAsset: MediaAsset): SceneSetting {
  if (!candidateAsset) return 'NEUTRAL_SETTING';

  const words = new Set<string>();

  // Tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Descriptions & temporal summaries
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let indoorCount = 0;
  let natureCount = 0;
  let urbanCount = 0;
  let abstractCount = 0;

  for (const w of tagList) {
    if (INDOOR_SETTING_KEYWORDS.has(w)) indoorCount++;
    if (NATURE_SETTING_KEYWORDS.has(w)) natureCount++;
    if (URBAN_SETTING_KEYWORDS.has(w)) urbanCount++;
    if (ABSTRACT_SETTING_KEYWORDS.has(w)) abstractCount++;
  }

  const maxCount = Math.max(indoorCount, natureCount, urbanCount, abstractCount);

  if (maxCount > 0) {
    if (indoorCount === maxCount) return 'INDOOR_INTERIOR';
    if (natureCount === maxCount) return 'OUTDOOR_NATURAL';
    if (urbanCount === maxCount) return 'OUTDOOR_URBAN';
    if (abstractCount === maxCount) return 'STUDIO_ABSTRACT';
  }

  return 'NEUTRAL_SETTING';
}

/**
 * Step 31: Classifies narration spatial setting intent:
 * - INDOOR: office, room, home, desk, studio, inside, meeting, classroom
 * - NATURE: forest, mountain, river, ocean, beach, wilderness, landscape, sky
 * - URBAN: city, street, traffic, downtown, building, metropolitan, road
 * - ABSTRACT: concept, diagram, chart, digital, data, 3d, model
 * - NEUTRAL: general narration without environmental constraints
 */
export function classifyNarrationSettingIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): SettingIntent {
  const words = (narrationText || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let indoorCount = 0;
  let natureCount = 0;
  let urbanCount = 0;
  let abstractCount = 0;

  for (const w of words) {
    if (INDOOR_SETTING_KEYWORDS.has(w)) indoorCount++;
    if (NATURE_SETTING_KEYWORDS.has(w)) natureCount++;
    if (URBAN_SETTING_KEYWORDS.has(w)) urbanCount++;
    if (ABSTRACT_SETTING_KEYWORDS.has(w)) abstractCount++;
  }

  const maxCount = Math.max(indoorCount, natureCount, urbanCount, abstractCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (indoorCount === maxCount) return 'INDOOR';
  if (natureCount === maxCount) return 'NATURE';
  if (urbanCount === maxCount) return 'URBAN';
  if (abstractCount === maxCount) return 'ABSTRACT';

  return 'NEUTRAL';
}

/**
 * Step 31: Spatial Environment & Scene Setting Intelligence.
 * Evaluates compatibility between candidate spatial setting and narration environmental intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateSceneSettingModifier(
  candidateSetting: SceneSetting,
  narrationIntent: SettingIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  sceneSetting: SceneSetting;
  settingIntent: SettingIntent;
  settingMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      sceneSetting: candidateSetting,
      settingIntent: narrationIntent,
      settingMatchScore: 0.8,
      reason: 'Consecutive shot continuation - scene setting penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'INDOOR' && candidateSetting === 'INDOOR_INTERIOR') ||
      (narrationIntent === 'NATURE' && candidateSetting === 'OUTDOOR_NATURAL') ||
      (narrationIntent === 'URBAN' && candidateSetting === 'OUTDOOR_URBAN') ||
      (narrationIntent === 'ABSTRACT' && candidateSetting === 'STUDIO_ABSTRACT')
    ) {
      return {
        modifier: 0.008,
        sceneSetting: candidateSetting,
        settingIntent: narrationIntent,
        settingMatchScore: 1.0,
        reason: 'New beat establishing location: environmental scene setting aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let settingMatchScore = 0.5;
  let reason = 'Neutral scene setting intent - balanced environmental scoring.';

  switch (narrationIntent) {
    case 'INDOOR': {
      if (candidateSetting === 'INDOOR_INTERIOR') {
        modifier = 0.008;
        settingMatchScore = 1.0;
        reason = 'Setting bonus: indoor interior environment matches interior narration.';
      } else if (candidateSetting === 'STUDIO_ABSTRACT') {
        modifier = 0.003;
        settingMatchScore = 0.7;
        reason = 'Setting alignment: studio/controlled backdrop supports interior context.';
      } else if (candidateSetting === 'NEUTRAL_SETTING') {
        modifier = 0.0;
        settingMatchScore = 0.5;
        reason = 'Setting neutral: versatile setting for indoor narration.';
      } else if (candidateSetting === 'OUTDOOR_URBAN') {
        modifier = -0.003;
        settingMatchScore = 0.35;
        reason = 'Setting mild penalty: outdoor urban environment for indoor narration.';
      } else if (candidateSetting === 'OUTDOOR_NATURAL') {
        modifier = -0.006;
        settingMatchScore = 0.15;
        reason = 'Setting penalty: outdoor natural wilderness clashes with indoor interior narration.';
      }
      break;
    }
    case 'NATURE': {
      if (candidateSetting === 'OUTDOOR_NATURAL') {
        modifier = 0.008;
        settingMatchScore = 1.0;
        reason = 'Setting bonus: natural outdoor landscape matches nature narration.';
      } else if (candidateSetting === 'NEUTRAL_SETTING') {
        modifier = 0.002;
        settingMatchScore = 0.6;
        reason = 'Setting alignment: balanced outdoor setting supports nature topic.';
      } else if (candidateSetting === 'OUTDOOR_URBAN') {
        modifier = -0.004;
        settingMatchScore = 0.3;
        reason = 'Setting penalty: urban city setting clashes with natural wilderness narration.';
      } else if (candidateSetting === 'INDOOR_INTERIOR') {
        modifier = -0.006;
        settingMatchScore = 0.15;
        reason = 'Setting penalty: enclosed indoor room clashes with nature landscape narration.';
      } else if (candidateSetting === 'STUDIO_ABSTRACT') {
        modifier = -0.004;
        settingMatchScore = 0.3;
        reason = 'Setting penalty: abstract studio backdrop dampens natural wilderness narrative.';
      }
      break;
    }
    case 'URBAN': {
      if (candidateSetting === 'OUTDOOR_URBAN') {
        modifier = 0.008;
        settingMatchScore = 1.0;
        reason = 'Setting bonus: urban cityscape environment matches metropolitan narration.';
      } else if (candidateSetting === 'INDOOR_INTERIOR') {
        modifier = 0.003;
        settingMatchScore = 0.7;
        reason = 'Setting alignment: urban interior office/building supports city context.';
      } else if (candidateSetting === 'NEUTRAL_SETTING') {
        modifier = 0.0;
        settingMatchScore = 0.5;
        reason = 'Setting neutral: versatile setting for urban narration.';
      } else if (candidateSetting === 'STUDIO_ABSTRACT') {
        modifier = -0.002;
        settingMatchScore = 0.4;
        reason = 'Setting mild penalty: abstract studio backdrop lacks urban realism.';
      } else if (candidateSetting === 'OUTDOOR_NATURAL') {
        modifier = -0.006;
        settingMatchScore = 0.15;
        reason = 'Setting penalty: rural natural landscape conflicts with urban metropolitan narration.';
      }
      break;
    }
    case 'ABSTRACT': {
      if (candidateSetting === 'STUDIO_ABSTRACT') {
        modifier = 0.008;
        settingMatchScore = 1.0;
        reason = 'Setting bonus: abstract graphical studio backdrop matches conceptual narration.';
      } else if (candidateSetting === 'NEUTRAL_SETTING') {
        modifier = 0.002;
        settingMatchScore = 0.6;
        reason = 'Setting alignment: neutral clean backdrop supports conceptual topic.';
      } else if (candidateSetting === 'INDOOR_INTERIOR') {
        modifier = 0.0;
        settingMatchScore = 0.5;
        reason = 'Setting neutral: interior setting for abstract concept.';
      } else if (candidateSetting === 'OUTDOOR_URBAN') {
        modifier = -0.003;
        settingMatchScore = 0.35;
        reason = 'Setting penalty: specific urban footage may distract from abstract concept.';
      } else if (candidateSetting === 'OUTDOOR_NATURAL') {
        modifier = -0.004;
        settingMatchScore = 0.3;
        reason = 'Setting penalty: specific natural footage distracts from abstract conceptual narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      settingMatchScore = 0.5;
      reason = 'Neutral scene setting intent - balanced environmental scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    sceneSetting: candidateSetting,
    settingIntent: narrationIntent,
    settingMatchScore: Math.round(settingMatchScore * 1000) / 1000,
    reason,
  };
}

const SOLO_DENSITY_KEYWORDS = new Set([
  'solo', 'portrait', 'person', 'individual', 'founder', 'creator', 'artist',
  'himself', 'herself', 'monologue', 'character', 'protagonist', 'single',
  'alone', 'man', 'woman', 'speaker', 'interviewee', 'face'
]);

const DUO_DENSITY_KEYWORDS = new Set([
  'duo', 'pair', 'couple', 'partners', 'dialogue', 'interview',
  'conversation', 'both', 'collaborators', 'together', 'co-founders'
]);

const GROUP_DENSITY_KEYWORDS = new Set([
  'team', 'group', 'colleagues', 'crew', 'committee', 'board', 'panel',
  'department', 'engineers', 'scientists', 'meeting', 'staff',
  'employees', 'class', 'students', 'band'
]);

const CROWD_DENSITY_KEYWORDS = new Set([
  'crowd', 'audience', 'people', 'thousands', 'millions', 'public', 'citizens',
  'community', 'fans', 'spectators', 'masses', 'gathering', 'stadium', 'mob',
  'protest', 'attendees', 'civilians'
]);

const EMPTY_DENSITY_KEYWORDS = new Set([
  'empty', 'deserted', 'abandoned', 'automated', 'machine', 'device', 'landscape',
  'uninhabited', 'silence', 'robot', 'tools', 'hardware', 'scenery', 'object',
  'mechanism', 'equipment', 'nobody', 'stillness'
]);

/**
 * Step 32: Classifies the human subject presence and social density of a media asset:
 * - SOLO_INDIVIDUAL: Exactly 1 person / single face / portrait
 * - DUO_INTERACTION: 2 people / pair / dialogue interaction
 * - GROUP_TEAM: Small group of 3-6 people / team / meeting
 * - CROWD_AUDIENCE: Large crowd / audience / 7+ people / public gathering
 * - UNINHABITED_OBJECT: 0 people / inanimate objects / empty landscapes / machinery
 */
export function classifySubjectDensity(candidateAsset: MediaAsset): SubjectDensity {
  if (!candidateAsset) return 'UNINHABITED_OBJECT';

  const faceCount = candidateAsset.analysis?.visualFeatures?.faceCount;
  const hasFaces = candidateAsset.analysis?.visualFeatures?.hasFaces;

  if (typeof faceCount === 'number') {
    if (faceCount === 1) return 'SOLO_INDIVIDUAL';
    if (faceCount === 2) return 'DUO_INTERACTION';
    if (faceCount >= 3 && faceCount <= 6) return 'GROUP_TEAM';
    if (faceCount > 6) return 'CROWD_AUDIENCE';
  } else if (hasFaces === true) {
    return 'SOLO_INDIVIDUAL';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let soloCount = 0;
  let duoCount = 0;
  let groupCount = 0;
  let crowdCount = 0;
  let emptyCount = 0;

  for (const w of tagList) {
    if (CROWD_DENSITY_KEYWORDS.has(w)) crowdCount++;
    if (GROUP_DENSITY_KEYWORDS.has(w)) groupCount++;
    if (DUO_DENSITY_KEYWORDS.has(w)) duoCount++;
    if (SOLO_DENSITY_KEYWORDS.has(w)) soloCount++;
    if (EMPTY_DENSITY_KEYWORDS.has(w)) emptyCount++;
  }

  const maxCount = Math.max(soloCount, duoCount, groupCount, crowdCount, emptyCount);

  if (maxCount > 0) {
    if (crowdCount === maxCount) return 'CROWD_AUDIENCE';
    if (groupCount === maxCount) return 'GROUP_TEAM';
    if (duoCount === maxCount) return 'DUO_INTERACTION';
    if (soloCount === maxCount) return 'SOLO_INDIVIDUAL';
    if (emptyCount === maxCount) return 'UNINHABITED_OBJECT';
  }

  return 'UNINHABITED_OBJECT';
}

/**
 * Step 32: Classifies narration social density and character presence intent:
 * - SOLO: solitary person, individual, monologue, founder, he/she, personal reflection
 * - DUO: dialogue, pair, couple, partner, two people
 * - GROUP: team, committee, crew, department, engineers, staff
 * - CROWD: audience, thousands, fans, community, public, citizens, spectators
 * - EMPTY: empty, machine, hardware, uninhabited, landscape, automated
 * - NEUTRAL: general narration without social presence requirements
 */
export function classifyNarrationDensityIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): DensityIntent {
  const words = (narrationText || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let soloCount = 0;
  let duoCount = 0;
  let groupCount = 0;
  let crowdCount = 0;
  let emptyCount = 0;

  for (const w of words) {
    if (CROWD_DENSITY_KEYWORDS.has(w)) crowdCount++;
    if (GROUP_DENSITY_KEYWORDS.has(w)) groupCount++;
    if (DUO_DENSITY_KEYWORDS.has(w)) duoCount++;
    if (SOLO_DENSITY_KEYWORDS.has(w)) soloCount++;
    if (EMPTY_DENSITY_KEYWORDS.has(w)) emptyCount++;
  }

  const maxCount = Math.max(soloCount, duoCount, groupCount, crowdCount, emptyCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (crowdCount === maxCount) return 'CROWD';
  if (groupCount === maxCount) return 'GROUP';
  if (duoCount === maxCount) return 'DUO';
  if (soloCount === maxCount) return 'SOLO';
  if (emptyCount === maxCount) return 'EMPTY';

  return 'NEUTRAL';
}

/**
 * Step 32: Human Subject Presence & Social Density Intelligence.
 * Evaluates compatibility between candidate visual social density and narration character presence intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateSubjectDensityModifier(
  candidateDensity: SubjectDensity,
  narrationIntent: DensityIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  subjectDensity: SubjectDensity;
  densityIntent: DensityIntent;
  densityMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      subjectDensity: candidateDensity,
      densityIntent: narrationIntent,
      densityMatchScore: 0.8,
      reason: 'Consecutive shot continuation - subject density penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'SOLO' && candidateDensity === 'SOLO_INDIVIDUAL') ||
      (narrationIntent === 'DUO' && candidateDensity === 'DUO_INTERACTION') ||
      (narrationIntent === 'GROUP' && candidateDensity === 'GROUP_TEAM') ||
      (narrationIntent === 'CROWD' && candidateDensity === 'CROWD_AUDIENCE') ||
      (narrationIntent === 'EMPTY' && candidateDensity === 'UNINHABITED_OBJECT')
    ) {
      return {
        modifier: 0.008,
        subjectDensity: candidateDensity,
        densityIntent: narrationIntent,
        densityMatchScore: 1.0,
        reason: 'New beat character introduction: subject social density aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let densityMatchScore = 0.5;
  let reason = 'Neutral subject density intent - balanced presence scoring.';

  switch (narrationIntent) {
    case 'SOLO': {
      if (candidateDensity === 'SOLO_INDIVIDUAL') {
        modifier = 0.008;
        densityMatchScore = 1.0;
        reason = 'Density bonus: individual subject framing matches personal solo narration.';
      } else if (candidateDensity === 'DUO_INTERACTION') {
        modifier = 0.002;
        densityMatchScore = 0.6;
        reason = 'Density alignment: two-person setting supports intimate character focus.';
      } else if (candidateDensity === 'GROUP_TEAM') {
        modifier = -0.003;
        densityMatchScore = 0.35;
        reason = 'Density mild penalty: group team setting dilutes individual character focus.';
      } else if (candidateDensity === 'UNINHABITED_OBJECT') {
        modifier = -0.004;
        densityMatchScore = 0.3;
        reason = 'Density penalty: uninhabited footage lacks the referenced individual character.';
      } else if (candidateDensity === 'CROWD_AUDIENCE') {
        modifier = -0.006;
        densityMatchScore = 0.15;
        reason = 'Density penalty: mass crowd setting directly contradicts intimate solo narration.';
      }
      break;
    }
    case 'DUO': {
      if (candidateDensity === 'DUO_INTERACTION') {
        modifier = 0.008;
        densityMatchScore = 1.0;
        reason = 'Density bonus: two-person interaction matches dialogue/duo narration.';
      } else if (candidateDensity === 'SOLO_INDIVIDUAL') {
        modifier = 0.003;
        densityMatchScore = 0.7;
        reason = 'Density alignment: individual speaker supports dialogue perspective.';
      } else if (candidateDensity === 'GROUP_TEAM') {
        modifier = 0.003;
        densityMatchScore = 0.7;
        reason = 'Density alignment: small collaborative team compatible with duo context.';
      } else if (candidateDensity === 'UNINHABITED_OBJECT') {
        modifier = -0.004;
        densityMatchScore = 0.3;
        reason = 'Density penalty: uninhabited scene lacks interpersonal interaction.';
      } else if (candidateDensity === 'CROWD_AUDIENCE') {
        modifier = -0.005;
        densityMatchScore = 0.2;
        reason = 'Density penalty: mass audience crowd overwhelms two-person interaction.';
      }
      break;
    }
    case 'GROUP': {
      if (candidateDensity === 'GROUP_TEAM') {
        modifier = 0.008;
        densityMatchScore = 1.0;
        reason = 'Density bonus: group team setting matches collaborative narration.';
      } else if (candidateDensity === 'DUO_INTERACTION') {
        modifier = 0.004;
        densityMatchScore = 0.8;
        reason = 'Density alignment: pair interaction supports team collaboration.';
      } else if (candidateDensity === 'CROWD_AUDIENCE') {
        modifier = 0.002;
        densityMatchScore = 0.6;
        reason = 'Density alignment: larger group/crowd compatible with organizational theme.';
      } else if (candidateDensity === 'SOLO_INDIVIDUAL') {
        modifier = -0.003;
        densityMatchScore = 0.35;
        reason = 'Density mild penalty: solitary subject narrows collective team scope.';
      } else if (candidateDensity === 'UNINHABITED_OBJECT') {
        modifier = -0.005;
        densityMatchScore = 0.2;
        reason = 'Density penalty: uninhabited footage lacks human team presence.';
      }
      break;
    }
    case 'CROWD': {
      if (candidateDensity === 'CROWD_AUDIENCE') {
        modifier = 0.008;
        densityMatchScore = 1.0;
        reason = 'Density bonus: crowd and audience scale matches mass public narration.';
      } else if (candidateDensity === 'GROUP_TEAM') {
        modifier = 0.003;
        densityMatchScore = 0.7;
        reason = 'Density alignment: group presence supports collective social scale.';
      } else if (candidateDensity === 'SOLO_INDIVIDUAL') {
        modifier = -0.006;
        densityMatchScore = 0.15;
        reason = 'Density penalty: solitary individual fails to convey mass crowd scale.';
      } else if (candidateDensity === 'DUO_INTERACTION') {
        modifier = -0.005;
        densityMatchScore = 0.2;
        reason = 'Density penalty: two-person setting is too intimate for mass public theme.';
      } else if (candidateDensity === 'UNINHABITED_OBJECT') {
        modifier = -0.006;
        densityMatchScore = 0.15;
        reason = 'Density penalty: empty uninhabited scene conflicts with crowded audience narrative.';
      }
      break;
    }
    case 'EMPTY': {
      if (candidateDensity === 'UNINHABITED_OBJECT') {
        modifier = 0.008;
        densityMatchScore = 1.0;
        reason = 'Density bonus: uninhabited scene matches inanimate/empty narration focus.';
      } else if (candidateDensity === 'SOLO_INDIVIDUAL') {
        modifier = -0.003;
        densityMatchScore = 0.35;
        reason = 'Density mild penalty: human presence distracts from uninhabited focus.';
      } else if (candidateDensity === 'DUO_INTERACTION') {
        modifier = -0.004;
        densityMatchScore = 0.3;
        reason = 'Density penalty: human interaction conflicts with uninhabited scene focus.';
      } else if (candidateDensity === 'GROUP_TEAM') {
        modifier = -0.005;
        densityMatchScore = 0.2;
        reason = 'Density penalty: group activity conflicts with empty/automated topic.';
      } else if (candidateDensity === 'CROWD_AUDIENCE') {
        modifier = -0.006;
        densityMatchScore = 0.15;
        reason = 'Density penalty: mass crowd directly contradicts empty/uninhabited narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      densityMatchScore = 0.5;
      reason = 'Neutral subject density intent - balanced presence scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    subjectDensity: candidateDensity,
    densityIntent: narrationIntent,
    densityMatchScore: Math.round(densityMatchScore * 1000) / 1000,
    reason,
  };
}

const AERIAL_ANGLE_KEYWORDS = new Set([
  'aerial', 'overhead', 'topdown', 'top-down', 'drone', 'satellite', 'birdseye',
  'birds-eye', 'zenith', 'airplane', 'orbit', 'map', 'godseye', 'skyview'
]);

const HIGH_ANGLE_KEYWORDS = new Set([
  'overlooking', 'high-angle', 'elevated', 'balcony', 'rooftop', 'roof',
  'summit', 'cliff', 'vantage', 'tower', 'downward', 'descending'
]);

const LOW_ANGLE_KEYWORDS = new Set([
  'low-angle', 'monumental', 'towering', 'majestic', 'heroic', 'upward',
  'ascending', 'skyscraper', 'giant', 'monument', 'imposing', 'statue'
]);

const GROUND_ANGLE_KEYWORDS = new Set([
  'ground', 'ground-level', 'surface', 'floor', 'dirt', 'soil', 'grass',
  'worm', 'worms-eye', 'underfoot', 'pavement', 'feet', 'subsurface', 'macro'
]);

const EYE_LEVEL_KEYWORDS = new Set([
  'eye-level', 'straight', 'direct', 'horizontal', 'conversational',
  'interview', 'portrait', 'headshot', 'seated', 'desk', 'face', 'person'
]);

const AERIAL_INTENT_KEYWORDS = new Set([
  'aerial', 'overhead', 'satellite', 'birdseye', 'birds-eye', 'top-down', 'topdown',
  'drone', 'flight', 'sky', 'clouds', 'map', 'continent', 'globe', 'orbit'
]);

const HIGH_INTENT_KEYWORDS = new Set([
  'overlooking', 'elevated', 'rooftop', 'summit', 'balcony', 'vantage', 'cliff',
  'peak', 'commanding'
]);

const LOW_INTENT_KEYWORDS = new Set([
  'towering', 'monumental', 'majestic', 'heroic',
  'massive', 'skyscraper', 'giant', 'soaring', 'imposing', 'colossal', 'monument'
]);

const GROUND_INTENT_KEYWORDS = new Set([
  'ground', 'floor', 'surface', 'dirt', 'grass', 'soil', 'roots',
  'worms-eye', 'underfoot', 'pavement', 'feet', 'crawling', 'below'
]);

const EYE_INTENT_KEYWORDS = new Set([
  'direct', 'personally', 'conversational',
  'interview', 'speaking', 'teller', 'confided', 'whispered', 'stared'
]);

/**
 * Step 33: Classifies the camera angle and vertical perspective of a media asset:
 * - AERIAL_OVERHEAD: Top-down, bird's-eye view, satellite/drone zenith, high overhead
 * - HIGH_ANGLE: Elevated vantage point, overlooking, looking down from above
 * - EYE_LEVEL: Direct neutral eye-line, conversational horizontal viewpoint
 * - LOW_ANGLE: Looking up, heroic, towering, monumental, powerful perspective
 * - GROUND_LEVEL: Surface-level, worm's-eye view, extreme low angle, floor level
 */
export function classifyCameraAngle(candidateAsset: MediaAsset): CameraAngle {
  if (!candidateAsset) return 'EYE_LEVEL';

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let aerialCount = 0;
  let highCount = 0;
  let lowCount = 0;
  let groundCount = 0;
  let eyeCount = 0;

  for (const w of tagList) {
    if (AERIAL_ANGLE_KEYWORDS.has(w)) aerialCount++;
    if (HIGH_ANGLE_KEYWORDS.has(w)) highCount++;
    if (LOW_ANGLE_KEYWORDS.has(w)) lowCount++;
    if (GROUND_ANGLE_KEYWORDS.has(w)) groundCount++;
    if (EYE_LEVEL_KEYWORDS.has(w)) eyeCount++;
  }

  const maxCount = Math.max(aerialCount, highCount, lowCount, groundCount, eyeCount);

  if (maxCount > 0) {
    if (aerialCount === maxCount) return 'AERIAL_OVERHEAD';
    if (highCount === maxCount) return 'HIGH_ANGLE';
    if (lowCount === maxCount) return 'LOW_ANGLE';
    if (groundCount === maxCount) return 'GROUND_LEVEL';
    if (eyeCount === maxCount) return 'EYE_LEVEL';
  }

  return 'EYE_LEVEL';
}

/**
 * Step 33: Classifies narration camera angle and vertical perspective intent:
 * - AERIAL: aerial, overhead, top-down, bird's eye, satellite, drone
 * - HIGH: overlooking, high vantage, rooftop, summit, looking down
 * - EYE: direct eye level, face to face, interview, conversational
 * - LOW: towering, monumental, looking up, majestic, heroic, giant
 * - GROUND: ground level, surface, floor, worm's eye, underfoot
 * - NEUTRAL: general narration without vertical perspective intent
 */
export function classifyNarrationAngleIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): AngleIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let aerialCount = 0;
  let highCount = 0;
  let lowCount = 0;
  let groundCount = 0;
  let eyeCount = 0;

  // Check multi-word phrase patterns
  if (textLower.includes('from above') || textLower.includes('bird eye') || textLower.includes('bird\'s eye') || textLower.includes('birds eye') || textLower.includes('top down') || textLower.includes('top-down')) {
    aerialCount += 2;
  }
  if (textLower.includes('looking down') || textLower.includes('from the top') || textLower.includes('high above')) {
    highCount += 2;
  }
  if (textLower.includes('looking up') || textLower.includes('look up') || textLower.includes('rising above') || textLower.includes('soaring high')) {
    lowCount += 2;
  }
  if (textLower.includes('on the ground') || textLower.includes('worm eye') || textLower.includes('worm\'s eye') || textLower.includes('worms eye')) {
    groundCount += 2;
  }
  if (textLower.includes('face to face') || textLower.includes('eye to eye') || textLower.includes('eye-level') || textLower.includes('eye level')) {
    eyeCount += 2;
  }

  for (const w of words) {
    if (AERIAL_INTENT_KEYWORDS.has(w)) aerialCount++;
    if (HIGH_INTENT_KEYWORDS.has(w)) highCount++;
    if (LOW_INTENT_KEYWORDS.has(w)) lowCount++;
    if (GROUND_INTENT_KEYWORDS.has(w)) groundCount++;
    if (EYE_INTENT_KEYWORDS.has(w)) eyeCount++;
  }

  const maxCount = Math.max(aerialCount, highCount, lowCount, groundCount, eyeCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (aerialCount === maxCount) return 'AERIAL';
  if (highCount === maxCount) return 'HIGH';
  if (lowCount === maxCount) return 'LOW';
  if (groundCount === maxCount) return 'GROUND';
  if (eyeCount === maxCount) return 'EYE';

  return 'NEUTRAL';
}

/**
 * Step 33: Camera Angle & Vertical Perspective Intelligence.
 * Evaluates compatibility between candidate camera angle and narration vertical perspective intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateCameraAngleModifier(
  candidateAngle: CameraAngle,
  narrationIntent: AngleIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  cameraAngle: CameraAngle;
  angleIntent: AngleIntent;
  angleMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      cameraAngle: candidateAngle,
      angleIntent: narrationIntent,
      angleMatchScore: 0.8,
      reason: 'Consecutive shot continuation - camera angle penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'AERIAL' && candidateAngle === 'AERIAL_OVERHEAD') ||
      (narrationIntent === 'HIGH' && candidateAngle === 'HIGH_ANGLE') ||
      (narrationIntent === 'LOW' && candidateAngle === 'LOW_ANGLE') ||
      (narrationIntent === 'GROUND' && candidateAngle === 'GROUND_LEVEL') ||
      (narrationIntent === 'EYE' && candidateAngle === 'EYE_LEVEL')
    ) {
      return {
        modifier: 0.008,
        cameraAngle: candidateAngle,
        angleIntent: narrationIntent,
        angleMatchScore: 1.0,
        reason: 'New beat perspective introduction: camera viewpoint angle aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let angleMatchScore = 0.5;
  let reason = 'Neutral camera angle intent - standard perspective scoring.';

  switch (narrationIntent) {
    case 'AERIAL': {
      if (candidateAngle === 'AERIAL_OVERHEAD') {
        modifier = 0.008;
        angleMatchScore = 1.0;
        reason = 'Angle bonus: aerial top-down perspective matches overhead narrative scope.';
      } else if (candidateAngle === 'HIGH_ANGLE') {
        modifier = 0.004;
        angleMatchScore = 0.8;
        reason = 'Angle alignment: elevated high-angle vantage supports wide overview.';
      } else if (candidateAngle === 'EYE_LEVEL') {
        modifier = 0.0;
        angleMatchScore = 0.5;
        reason = 'Angle neutral: eye-level framing for overview narration.';
      } else if (candidateAngle === 'LOW_ANGLE') {
        modifier = -0.004;
        angleMatchScore = 0.3;
        reason = 'Angle penalty: low-angle looking up conflicts with overhead aerial narration.';
      } else if (candidateAngle === 'GROUND_LEVEL') {
        modifier = -0.006;
        angleMatchScore = 0.15;
        reason = 'Angle penalty: ground-level perspective directly contradicts aerial overhead narration.';
      }
      break;
    }
    case 'HIGH': {
      if (candidateAngle === 'HIGH_ANGLE') {
        modifier = 0.008;
        angleMatchScore = 1.0;
        reason = 'Angle bonus: high-angle overlooking viewpoint matches elevated perspective.';
      } else if (candidateAngle === 'AERIAL_OVERHEAD') {
        modifier = 0.004;
        angleMatchScore = 0.8;
        reason = 'Angle alignment: aerial perspective supports high vantage narrative.';
      } else if (candidateAngle === 'EYE_LEVEL') {
        modifier = 0.0;
        angleMatchScore = 0.5;
        reason = 'Angle neutral: standard eye-level framing for elevated narrative.';
      } else if (candidateAngle === 'GROUND_LEVEL') {
        modifier = -0.004;
        angleMatchScore = 0.3;
        reason = 'Angle penalty: ground-level viewpoint clashes with overlooking narration.';
      } else if (candidateAngle === 'LOW_ANGLE') {
        modifier = -0.006;
        angleMatchScore = 0.15;
        reason = 'Angle penalty: upward low angle conflicts with downward high vantage narration.';
      }
      break;
    }
    case 'LOW': {
      if (candidateAngle === 'LOW_ANGLE') {
        modifier = 0.008;
        angleMatchScore = 1.0;
        reason = 'Angle bonus: low-angle heroic viewpoint matches monumental/towering narration.';
      } else if (candidateAngle === 'GROUND_LEVEL') {
        modifier = 0.003;
        angleMatchScore = 0.7;
        reason = 'Angle alignment: ground-level upward perspective supports monumental scale.';
      } else if (candidateAngle === 'EYE_LEVEL') {
        modifier = 0.0;
        angleMatchScore = 0.5;
        reason = 'Angle neutral: eye-level view for majestic subject.';
      } else if (candidateAngle === 'HIGH_ANGLE') {
        modifier = -0.004;
        angleMatchScore = 0.3;
        reason = 'Angle penalty: downward high angle diminishes monumental/towering narrative.';
      } else if (candidateAngle === 'AERIAL_OVERHEAD') {
        modifier = -0.006;
        angleMatchScore = 0.15;
        reason = 'Angle penalty: bird\'s-eye overhead shot directly contradicts towering low-angle focus.';
      }
      break;
    }
    case 'GROUND': {
      if (candidateAngle === 'GROUND_LEVEL') {
        modifier = 0.008;
        angleMatchScore = 1.0;
        reason = 'Angle bonus: ground-level surface perspective matches low-level/floor narration.';
      } else if (candidateAngle === 'LOW_ANGLE') {
        modifier = 0.003;
        angleMatchScore = 0.7;
        reason = 'Angle alignment: upward low angle compatible with ground perspective.';
      } else if (candidateAngle === 'EYE_LEVEL') {
        modifier = 0.0;
        angleMatchScore = 0.5;
        reason = 'Angle neutral: eye-level view for surface topic.';
      } else if (candidateAngle === 'HIGH_ANGLE') {
        modifier = -0.003;
        angleMatchScore = 0.35;
        reason = 'Angle mild penalty: high angle view distances from ground surface detail.';
      } else if (candidateAngle === 'AERIAL_OVERHEAD') {
        modifier = -0.006;
        angleMatchScore = 0.15;
        reason = 'Angle penalty: aerial bird\'s-eye shot directly contradicts ground-level focus.';
      }
      break;
    }
    case 'EYE': {
      if (candidateAngle === 'EYE_LEVEL') {
        modifier = 0.008;
        angleMatchScore = 1.0;
        reason = 'Angle bonus: direct eye-level perspective matches intimate/conversational narration.';
      } else if (candidateAngle === 'HIGH_ANGLE') {
        modifier = -0.002;
        angleMatchScore = 0.4;
        reason = 'Angle mild penalty: high angle creates detachment for conversational narration.';
      } else if (candidateAngle === 'LOW_ANGLE') {
        modifier = -0.002;
        angleMatchScore = 0.4;
        reason = 'Angle mild penalty: low angle creates artificial hierarchy for conversational narration.';
      } else if (candidateAngle === 'GROUND_LEVEL') {
        modifier = -0.005;
        angleMatchScore = 0.2;
        reason = 'Angle penalty: ground-level perspective fails to provide face-to-face connection.';
      } else if (candidateAngle === 'AERIAL_OVERHEAD') {
        modifier = -0.006;
        angleMatchScore = 0.15;
        reason = 'Angle penalty: distant aerial view eliminates personal eye-level engagement.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      angleMatchScore = 0.5;
      reason = 'Neutral camera angle intent - standard perspective scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    cameraAngle: candidateAngle,
    angleIntent: narrationIntent,
    angleMatchScore: Math.round(angleMatchScore * 1000) / 1000,
    reason,
  };
}

const DAYLIGHT_KEYWORDS = new Set([
  'daylight', 'day', 'daytime', 'noon', 'midday', 'sunlit', 'sunny', 'sunshine',
  'afternoon', 'morning', 'bright-day', 'clear-sky', 'sun', 'brightly-lit'
]);

const SUNSET_KEYWORDS = new Set([
  'sunset', 'sundown', 'golden-hour', 'goldenhour', 'dusk', 'evening',
  'crepuscular', 'warm-glow', 'setting-sun', 'sundown', 'twilight-warm', 'afterglow'
]);

const NIGHT_KEYWORDS = new Set([
  'night', 'nighttime', 'nocturnal', 'midnight', 'darkness', 'moon', 'moonlight',
  'starry', 'stars', 'neon', 'astronomy', 'constellation', 'dark-sky', 'nightfall', 'overnight'
]);

const DAWN_KEYWORDS = new Set([
  'dawn', 'twilight', 'sunrise', 'daybreak', 'early-morning', 'first-light',
  'sunup', 'aurora', 'sun-rising', 'morning-mist', 'early-light'
]);

const TIMELESS_KEYWORDS = new Set([
  'timeless', 'studio', 'interior', 'abstract', 'isolated', 'diagram',
  'infographic', 'render', 'graphic', 'neutral-time', 'indoor'
]);

const DAY_INTENT_KEYWORDS = new Set([
  'day', 'daylight', 'daytime', 'noon', 'midday', 'sunlit', 'sunny', 'sunshine',
  'afternoon', 'morning', 'sun', 'bright'
]);

const SUNSET_INTENT_KEYWORDS = new Set([
  'sunset', 'sundown', 'golden-hour', 'goldenhour', 'dusk', 'evening',
  'sundown', 'afterglow'
]);

const NIGHT_INTENT_KEYWORDS = new Set([
  'night', 'nighttime', 'midnight', 'darkness', 'moon', 'moonlight', 'stars',
  'starry', 'nocturnal', 'overnight', 'late-night', 'nightfall'
]);

const DAWN_INTENT_KEYWORDS = new Set([
  'dawn', 'twilight', 'sunrise', 'daybreak', 'early-morning', 'first-light',
  'sunup', 'aurora'
]);

/**
 * Step 34: Classifies the time of day & chronological lighting phase of a media asset:
 * - DAYLIGHT_CLEAR: High midday sun, bright direct sunlit illumination, clear daylight
 * - GOLDEN_HOUR_SUNSET: Low angled warm golden glow, sunset, dusk, sundown, evening
 * - NIGHT_NOCTURNAL: Darkness, moonlit, night sky, starry, midnight, nocturnal illumination
 * - DAWN_TWILIGHT: Early morning twilight, sunrise, daybreak, first light, blue hour
 * - TIME_AGNOSTIC: Abstract, indoor studio, or chronological time indeterminate
 */
export function classifyTimeOfDay(candidateAsset: MediaAsset): TimeOfDay {
  if (!candidateAsset) return 'TIME_AGNOSTIC';

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let daylightCount = 0;
  let sunsetCount = 0;
  let nightCount = 0;
  let dawnCount = 0;
  let timelessCount = 0;

  for (const w of tagList) {
    if (DAYLIGHT_KEYWORDS.has(w)) daylightCount++;
    if (SUNSET_KEYWORDS.has(w)) sunsetCount++;
    if (NIGHT_KEYWORDS.has(w)) nightCount++;
    if (DAWN_KEYWORDS.has(w)) dawnCount++;
    if (TIMELESS_KEYWORDS.has(w)) timelessCount++;
  }

  const maxCount = Math.max(daylightCount, sunsetCount, nightCount, dawnCount, timelessCount);

  if (maxCount > 0) {
    if (nightCount === maxCount) return 'NIGHT_NOCTURNAL';
    if (sunsetCount === maxCount) return 'GOLDEN_HOUR_SUNSET';
    if (dawnCount === maxCount) return 'DAWN_TWILIGHT';
    if (daylightCount === maxCount) return 'DAYLIGHT_CLEAR';
    if (timelessCount === maxCount) return 'TIME_AGNOSTIC';
  }

  return 'TIME_AGNOSTIC';
}

/**
 * Step 34: Classifies narration time of day & chronological lighting intent:
 * - DAY: daylight, daytime, afternoon, midday, noon, bright sunny day
 * - SUNSET: sunset, dusk, golden hour, evening, sundown, setting sun
 * - NIGHT: night, nighttime, midnight, nocturnal, darkness, stars, moon
 * - DAWN: dawn, sunrise, twilight, daybreak, early morning, first light
 * - NEUTRAL: general narration without chronological time intent
 */
export function classifyNarrationTimeIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): TimeIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let dayCount = 0;
  let sunsetCount = 0;
  let nightCount = 0;
  let dawnCount = 0;

  // Check multi-word phrase patterns
  if (textLower.includes('broad daylight') || textLower.includes('bright sunny day') || textLower.includes('during the day') || textLower.includes('middle of the day') || textLower.includes('midday sun')) {
    dayCount += 2;
  }
  if (textLower.includes('golden hour') || textLower.includes('setting sun') || textLower.includes('sun sets') || textLower.includes('sun is setting') || textLower.includes('late afternoon sun')) {
    sunsetCount += 2;
  }
  if (textLower.includes('at night') || textLower.includes('late at night') || textLower.includes('in the dark') || textLower.includes('under the stars') || textLower.includes('dead of night') || textLower.includes('night sky')) {
    nightCount += 2;
  }
  if (textLower.includes('at dawn') || textLower.includes('early morning') || textLower.includes('first light') || textLower.includes('sun rises') || textLower.includes('sun rising') || textLower.includes('crack of dawn')) {
    dawnCount += 2;
  }

  for (const w of words) {
    if (DAY_INTENT_KEYWORDS.has(w)) dayCount++;
    if (SUNSET_INTENT_KEYWORDS.has(w)) sunsetCount++;
    if (NIGHT_INTENT_KEYWORDS.has(w)) nightCount++;
    if (DAWN_INTENT_KEYWORDS.has(w)) dawnCount++;
  }

  const maxCount = Math.max(dayCount, sunsetCount, nightCount, dawnCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (nightCount === maxCount) return 'NIGHT';
  if (sunsetCount === maxCount) return 'SUNSET';
  if (dawnCount === maxCount) return 'DAWN';
  if (dayCount === maxCount) return 'DAY';

  return 'NEUTRAL';
}

/**
 * Step 34: Time of Day & Chronological Lighting Phase Intelligence.
 * Evaluates compatibility between candidate chronological lighting and narration time intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateTimeOfDayModifier(
  candidateTime: TimeOfDay,
  narrationIntent: TimeIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  timeOfDay: TimeOfDay;
  timeIntent: TimeIntent;
  timeMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      timeOfDay: candidateTime,
      timeIntent: narrationIntent,
      timeMatchScore: 0.8,
      reason: 'Consecutive shot continuation - time of day penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'DAY' && candidateTime === 'DAYLIGHT_CLEAR') ||
      (narrationIntent === 'SUNSET' && candidateTime === 'GOLDEN_HOUR_SUNSET') ||
      (narrationIntent === 'NIGHT' && candidateTime === 'NIGHT_NOCTURNAL') ||
      (narrationIntent === 'DAWN' && candidateTime === 'DAWN_TWILIGHT')
    ) {
      return {
        modifier: 0.008,
        timeOfDay: candidateTime,
        timeIntent: narrationIntent,
        timeMatchScore: 1.0,
        reason: 'New beat temporal introduction: chronological time of day aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let timeMatchScore = 0.5;
  let reason = 'Neutral time of day intent - standard chronological lighting scoring.';

  switch (narrationIntent) {
    case 'DAY': {
      if (candidateTime === 'DAYLIGHT_CLEAR') {
        modifier = 0.008;
        timeMatchScore = 1.0;
        reason = 'Time bonus: clear daylight setting matches daytime narration.';
      } else if (candidateTime === 'DAWN_TWILIGHT') {
        modifier = 0.003;
        timeMatchScore = 0.7;
        reason = 'Time alignment: morning dawn light compatible with daytime theme.';
      } else if (candidateTime === 'TIME_AGNOSTIC') {
        modifier = 0.0;
        timeMatchScore = 0.5;
        reason = 'Time neutral: timeless setting for daytime narrative.';
      } else if (candidateTime === 'GOLDEN_HOUR_SUNSET') {
        modifier = -0.003;
        timeMatchScore = 0.35;
        reason = 'Time mild penalty: golden sunset tone contrasts with midday narration.';
      } else if (candidateTime === 'NIGHT_NOCTURNAL') {
        modifier = -0.007;
        timeMatchScore = 0.1;
        reason = 'Time penalty: night nocturnal footage directly contradicts daylight narration.';
      }
      break;
    }
    case 'SUNSET': {
      if (candidateTime === 'GOLDEN_HOUR_SUNSET') {
        modifier = 0.008;
        timeMatchScore = 1.0;
        reason = 'Time bonus: golden hour sunset illumination matches evening narration.';
      } else if (candidateTime === 'DAWN_TWILIGHT') {
        modifier = 0.003;
        timeMatchScore = 0.7;
        reason = 'Time alignment: twilight atmosphere supports sunset transition.';
      } else if (candidateTime === 'TIME_AGNOSTIC') {
        modifier = 0.0;
        timeMatchScore = 0.5;
        reason = 'Time neutral: timeless setting for sunset narrative.';
      } else if (candidateTime === 'DAYLIGHT_CLEAR') {
        modifier = -0.004;
        timeMatchScore = 0.3;
        reason = 'Time penalty: bright daylight footage lacks evening sunset atmosphere.';
      } else if (candidateTime === 'NIGHT_NOCTURNAL') {
        modifier = -0.005;
        timeMatchScore = 0.2;
        reason = 'Time penalty: midnight nocturnal footage clashes with golden sunset narration.';
      }
      break;
    }
    case 'NIGHT': {
      if (candidateTime === 'NIGHT_NOCTURNAL') {
        modifier = 0.008;
        timeMatchScore = 1.0;
        reason = 'Time bonus: nocturnal night setting matches nocturnal voiceover.';
      } else if (candidateTime === 'GOLDEN_HOUR_SUNSET') {
        modifier = 0.002;
        timeMatchScore = 0.6;
        reason = 'Time alignment: late evening dusk light compatible with night transition.';
      } else if (candidateTime === 'TIME_AGNOSTIC') {
        modifier = 0.0;
        timeMatchScore = 0.5;
        reason = 'Time neutral: timeless setting for nighttime narrative.';
      } else if (candidateTime === 'DAWN_TWILIGHT') {
        modifier = -0.004;
        timeMatchScore = 0.3;
        reason = 'Time penalty: early dawn light conflicts with night narration.';
      } else if (candidateTime === 'DAYLIGHT_CLEAR') {
        modifier = -0.007;
        timeMatchScore = 0.1;
        reason = 'Time penalty: bright daylight footage directly contradicts night nocturnal narration.';
      }
      break;
    }
    case 'DAWN': {
      if (candidateTime === 'DAWN_TWILIGHT') {
        modifier = 0.008;
        timeMatchScore = 1.0;
        reason = 'Time bonus: early dawn twilight lighting matches sunrise narration.';
      } else if (candidateTime === 'DAYLIGHT_CLEAR') {
        modifier = 0.003;
        timeMatchScore = 0.7;
        reason = 'Time alignment: daylight footage compatible with morning sunrise.';
      } else if (candidateTime === 'GOLDEN_HOUR_SUNSET') {
        modifier = 0.002;
        timeMatchScore = 0.6;
        reason = 'Time alignment: warm low sun angle compatible with morning light.';
      } else if (candidateTime === 'TIME_AGNOSTIC') {
        modifier = 0.0;
        timeMatchScore = 0.5;
        reason = 'Time neutral: timeless setting for dawn narrative.';
      } else if (candidateTime === 'NIGHT_NOCTURNAL') {
        modifier = -0.006;
        timeMatchScore = 0.15;
        reason = 'Time penalty: pitch black night footage clashes with sunrise dawn narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      timeMatchScore = 0.5;
      reason = 'Neutral time of day intent - standard chronological lighting scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    timeOfDay: candidateTime,
    timeIntent: narrationIntent,
    timeMatchScore: Math.round(timeMatchScore * 1000) / 1000,
    reason,
  };
}

const CLEAR_WEATHER_KEYWORDS = new Set([
  'clear', 'fair', 'sunny', 'blue-sky', 'sunshine', 'cloudless', 'crisp',
  'bright-sky', 'fair-weather', 'sun', 'clear-skies'
]);

const OVERCAST_WEATHER_KEYWORDS = new Set([
  'overcast', 'cloudy', 'clouds', 'grey-sky', 'gray-sky', 'storm-clouds',
  'gloomy', 'cumulus', 'stratus', 'dark-clouds', 'cloud', 'gray', 'grey'
]);

const RAIN_WEATHER_KEYWORDS = new Set([
  'rain', 'rainy', 'raining', 'downpour', 'drizzle', 'storm', 'stormy',
  'thunderstorm', 'puddles', 'wet', 'lightning', 'monsoon', 'torrential',
  'raindrop', 'raindrops', 'precipitation'
]);

const SNOW_WEATHER_KEYWORDS = new Set([
  'snow', 'snowy', 'snowing', 'blizzard', 'frost', 'frosty', 'ice', 'icy',
  'winter', 'flurries', 'frozen', 'glacier', 'snowfall', 'sleet', 'hail'
]);

const FOG_WEATHER_KEYWORDS = new Set([
  'fog', 'foggy', 'mist', 'misty', 'haze', 'hazy', 'smog', 'steam', 'smoke',
  'vapor', 'atmospheric-haze', 'murky', 'obscured'
]);

const WEATHER_AGNOSTIC_KEYWORDS = new Set([
  'indoor', 'studio', 'abstract', 'interior', 'diagram', 'infographic',
  'render', 'neutral-weather', 'timeless', 'isolated'
]);

const CLEAR_INTENT_KEYWORDS = new Set([
  'clear', 'fair', 'sunny', 'sunshine', 'cloudless', 'fair-weather', 'blue-sky', 'sun'
]);

const OVERCAST_INTENT_KEYWORDS = new Set([
  'overcast', 'cloudy', 'clouds', 'gloomy', 'gray-sky', 'grey-sky', 'cloud'
]);

const RAIN_INTENT_KEYWORDS = new Set([
  'rain', 'rainy', 'raining', 'downpour', 'drizzle', 'storm', 'stormy',
  'thunderstorm', 'monsoon', 'torrential', 'puddles', 'wet'
]);

const SNOW_INTENT_KEYWORDS = new Set([
  'snow', 'snowy', 'snowing', 'blizzard', 'frost', 'frosty', 'ice', 'icy',
  'flurries', 'snowfall', 'frozen', 'winter'
]);

const FOG_INTENT_KEYWORDS = new Set([
  'fog', 'foggy', 'mist', 'misty', 'haze', 'hazy', 'smog', 'steam', 'smoke'
]);

/**
 * Step 35: Classifies the meteorological & atmospheric weather condition of a media asset:
 * - CLEAR_FAIR: Crisp clear skies, bright fair weather, sunny, cloudless
 * - OVERCAST_CLOUDY: Diffused cloud cover, gloomy gray skies, gathering storm clouds
 * - RAIN_STORMY: Rain, downpour, drizzle, thunderstorm, wet precipitation
 * - SNOW_FROST: Snow, frost, ice, winter blizzard, snowfall, frozen landscapes
 * - FOG_MIST: Dense fog, morning mist, atmospheric haze, steam, obscured visibility
 * - WEATHER_AGNOSTIC: Indoor, abstract studio, or weather condition indeterminate
 */
export function classifyWeatherCondition(candidateAsset: MediaAsset): WeatherCondition {
  if (!candidateAsset) return 'WEATHER_AGNOSTIC';

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let clearCount = 0;
  let overcastCount = 0;
  let rainCount = 0;
  let snowCount = 0;
  let fogCount = 0;
  let agnosticCount = 0;

  for (const w of tagList) {
    if (CLEAR_WEATHER_KEYWORDS.has(w)) clearCount++;
    if (OVERCAST_WEATHER_KEYWORDS.has(w)) overcastCount++;
    if (RAIN_WEATHER_KEYWORDS.has(w)) rainCount++;
    if (SNOW_WEATHER_KEYWORDS.has(w)) snowCount++;
    if (FOG_WEATHER_KEYWORDS.has(w)) fogCount++;
    if (WEATHER_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(clearCount, overcastCount, rainCount, snowCount, fogCount, agnosticCount);

  if (maxCount > 0) {
    if (rainCount === maxCount) return 'RAIN_STORMY';
    if (snowCount === maxCount) return 'SNOW_FROST';
    if (fogCount === maxCount) return 'FOG_MIST';
    if (overcastCount === maxCount) return 'OVERCAST_CLOUDY';
    if (clearCount === maxCount) return 'CLEAR_FAIR';
    if (agnosticCount === maxCount) return 'WEATHER_AGNOSTIC';
  }

  return 'WEATHER_AGNOSTIC';
}

/**
 * Step 35: Classifies narration meteorological weather & atmospheric condition intent:
 * - CLEAR: clear sky, sunny, blue skies, fair weather, sunshine
 * - OVERCAST: overcast, cloudy, gray skies, dark clouds, gloomy
 * - RAIN: rain, downpour, storm, drizzle, thunderstorm, torrential, wet
 * - SNOW: snow, blizzard, frost, ice, winter storm, freezing, snowfall
 * - FOG: fog, misty, haze, dense smoke, steam, obscured visibility
 * - NEUTRAL: general narration without meteorological weather intent
 */
export function classifyNarrationWeatherIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): WeatherIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let clearCount = 0;
  let overcastCount = 0;
  let rainCount = 0;
  let snowCount = 0;
  let fogCount = 0;

  // Check multi-word phrase patterns
  if (textLower.includes('clear blue sky') || textLower.includes('clear skies') || textLower.includes('fair weather') || textLower.includes('bright sunny') || textLower.includes('under the sun')) {
    clearCount += 2;
  }
  if (textLower.includes('overcast skies') || textLower.includes('cloudy sky') || textLower.includes('gray clouds') || textLower.includes('grey clouds') || textLower.includes('gathering clouds')) {
    overcastCount += 2;
  }
  if (textLower.includes('torrential rain') || textLower.includes('heavy rain') || textLower.includes('pouring rain') || textLower.includes('rain storm') || textLower.includes('thunder and lightning') || textLower.includes('in the rain')) {
    rainCount += 2;
  }
  if (textLower.includes('heavy snow') || textLower.includes('snow falling') || textLower.includes('winter blizzard') || textLower.includes('frozen ice') || textLower.includes('in the snow')) {
    snowCount += 2;
  }
  if (textLower.includes('dense fog') || textLower.includes('thick mist') || textLower.includes('shrouded in fog') || textLower.includes('morning mist') || textLower.includes('heavy haze')) {
    fogCount += 2;
  }

  for (const w of words) {
    if (CLEAR_INTENT_KEYWORDS.has(w)) clearCount++;
    if (OVERCAST_INTENT_KEYWORDS.has(w)) overcastCount++;
    if (RAIN_INTENT_KEYWORDS.has(w)) rainCount++;
    if (SNOW_INTENT_KEYWORDS.has(w)) snowCount++;
    if (FOG_INTENT_KEYWORDS.has(w)) fogCount++;
  }

  const maxCount = Math.max(clearCount, overcastCount, rainCount, snowCount, fogCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (rainCount === maxCount) return 'RAIN';
  if (snowCount === maxCount) return 'SNOW';
  if (fogCount === maxCount) return 'FOG';
  if (overcastCount === maxCount) return 'OVERCAST';
  if (clearCount === maxCount) return 'CLEAR';

  return 'NEUTRAL';
}

/**
 * Step 35: Weather & Atmospheric Condition Intelligence.
 * Evaluates compatibility between candidate meteorological condition and narration weather intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateWeatherModifier(
  candidateWeather: WeatherCondition,
  narrationIntent: WeatherIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  weatherCondition: WeatherCondition;
  weatherIntent: WeatherIntent;
  weatherMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      weatherCondition: candidateWeather,
      weatherIntent: narrationIntent,
      weatherMatchScore: 0.8,
      reason: 'Consecutive shot continuation - weather penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'CLEAR' && candidateWeather === 'CLEAR_FAIR') ||
      (narrationIntent === 'OVERCAST' && candidateWeather === 'OVERCAST_CLOUDY') ||
      (narrationIntent === 'RAIN' && candidateWeather === 'RAIN_STORMY') ||
      (narrationIntent === 'SNOW' && candidateWeather === 'SNOW_FROST') ||
      (narrationIntent === 'FOG' && candidateWeather === 'FOG_MIST')
    ) {
      return {
        modifier: 0.008,
        weatherCondition: candidateWeather,
        weatherIntent: narrationIntent,
        weatherMatchScore: 1.0,
        reason: 'New beat meteorological introduction: weather and atmospheric condition aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let weatherMatchScore = 0.5;
  let reason = 'Neutral weather intent - standard atmospheric scoring.';

  switch (narrationIntent) {
    case 'CLEAR': {
      if (candidateWeather === 'CLEAR_FAIR') {
        modifier = 0.008;
        weatherMatchScore = 1.0;
        reason = 'Weather bonus: clear fair skies match sunny weather narration.';
      } else if (candidateWeather === 'WEATHER_AGNOSTIC') {
        modifier = 0.0;
        weatherMatchScore = 0.5;
        reason = 'Weather neutral: indoor/agnostic scene for clear weather narrative.';
      } else if (candidateWeather === 'OVERCAST_CLOUDY') {
        modifier = -0.002;
        weatherMatchScore = 0.4;
        reason = 'Weather mild penalty: cloudy overcast sky contrasts with clear sunny narration.';
      } else if (candidateWeather === 'FOG_MIST') {
        modifier = -0.004;
        weatherMatchScore = 0.3;
        reason = 'Weather penalty: misty haze obscures clear sunny narrative focus.';
      } else if (candidateWeather === 'SNOW_FROST') {
        modifier = -0.004;
        weatherMatchScore = 0.3;
        reason = 'Weather penalty: frosty snowy landscape contrasts with clear warm weather narration.';
      } else if (candidateWeather === 'RAIN_STORMY') {
        modifier = -0.007;
        weatherMatchScore = 0.1;
        reason = 'Weather penalty: rainy stormy footage directly contradicts clear fair weather narration.';
      }
      break;
    }
    case 'OVERCAST': {
      if (candidateWeather === 'OVERCAST_CLOUDY') {
        modifier = 0.008;
        weatherMatchScore = 1.0;
        reason = 'Weather bonus: overcast cloudy skies match diffused lighting narration.';
      } else if (candidateWeather === 'RAIN_STORMY') {
        modifier = 0.003;
        weatherMatchScore = 0.7;
        reason = 'Weather alignment: stormy rain clouds compatible with overcast narrative.';
      } else if (candidateWeather === 'FOG_MIST') {
        modifier = 0.002;
        weatherMatchScore = 0.6;
        reason = 'Weather alignment: misty haze compatible with cloudy atmosphere.';
      } else if (candidateWeather === 'SNOW_FROST') {
        modifier = 0.002;
        weatherMatchScore = 0.6;
        reason = 'Weather alignment: winter overcast compatible with cloudy setting.';
      } else if (candidateWeather === 'WEATHER_AGNOSTIC') {
        modifier = 0.0;
        weatherMatchScore = 0.5;
        reason = 'Weather neutral: agnostic setting for overcast narrative.';
      } else if (candidateWeather === 'CLEAR_FAIR') {
        modifier = -0.003;
        weatherMatchScore = 0.35;
        reason = 'Weather mild penalty: bright sunny skies clash with overcast cloudy narration.';
      }
      break;
    }
    case 'RAIN': {
      if (candidateWeather === 'RAIN_STORMY') {
        modifier = 0.008;
        weatherMatchScore = 1.0;
        reason = 'Weather bonus: rainy stormy conditions match precipitation voiceover.';
      } else if (candidateWeather === 'OVERCAST_CLOUDY') {
        modifier = 0.003;
        weatherMatchScore = 0.7;
        reason = 'Weather alignment: cloudy overcast weather compatible with rainy theme.';
      } else if (candidateWeather === 'FOG_MIST') {
        modifier = 0.002;
        weatherMatchScore = 0.6;
        reason = 'Weather alignment: misty atmospheric humidity supports rain context.';
      } else if (candidateWeather === 'WEATHER_AGNOSTIC') {
        modifier = 0.0;
        weatherMatchScore = 0.5;
        reason = 'Weather neutral: agnostic setting for rain narrative.';
      } else if (candidateWeather === 'SNOW_FROST') {
        modifier = -0.003;
        weatherMatchScore = 0.35;
        reason = 'Weather mild penalty: snow frost differs from liquid rain precipitation.';
      } else if (candidateWeather === 'CLEAR_FAIR') {
        modifier = -0.007;
        weatherMatchScore = 0.1;
        reason = 'Weather penalty: clear dry sunny footage clashes with rainy storm narration.';
      }
      break;
    }
    case 'SNOW': {
      if (candidateWeather === 'SNOW_FROST') {
        modifier = 0.008;
        weatherMatchScore = 1.0;
        reason = 'Weather bonus: snowy frosty landscape matches winter weather narration.';
      } else if (candidateWeather === 'OVERCAST_CLOUDY') {
        modifier = 0.003;
        weatherMatchScore = 0.7;
        reason = 'Weather alignment: overcast winter sky compatible with snowy narrative.';
      } else if (candidateWeather === 'FOG_MIST') {
        modifier = 0.002;
        weatherMatchScore = 0.6;
        reason = 'Weather alignment: misty cold haze supports winter snowfall.';
      } else if (candidateWeather === 'WEATHER_AGNOSTIC') {
        modifier = 0.0;
        weatherMatchScore = 0.5;
        reason = 'Weather neutral: agnostic setting for winter snow narrative.';
      } else if (candidateWeather === 'RAIN_STORMY') {
        modifier = -0.003;
        weatherMatchScore = 0.35;
        reason = 'Weather mild penalty: rain precipitation conflicts with frozen snow narrative.';
      } else if (candidateWeather === 'CLEAR_FAIR') {
        modifier = -0.005;
        weatherMatchScore = 0.2;
        reason = 'Weather penalty: dry sunny footage clashes with snowy winter narrative.';
      }
      break;
    }
    case 'FOG': {
      if (candidateWeather === 'FOG_MIST') {
        modifier = 0.008;
        weatherMatchScore = 1.0;
        reason = 'Weather bonus: foggy misty atmosphere matches obscured haze narration.';
      } else if (candidateWeather === 'OVERCAST_CLOUDY') {
        modifier = 0.003;
        weatherMatchScore = 0.7;
        reason = 'Weather alignment: cloudy overcast sky compatible with misty atmosphere.';
      } else if (candidateWeather === 'RAIN_STORMY') {
        modifier = 0.002;
        weatherMatchScore = 0.6;
        reason = 'Weather alignment: stormy humidity compatible with misty context.';
      } else if (candidateWeather === 'SNOW_FROST') {
        modifier = 0.002;
        weatherMatchScore = 0.6;
        reason = 'Weather alignment: frosty haze compatible with mist narration.';
      } else if (candidateWeather === 'WEATHER_AGNOSTIC') {
        modifier = 0.0;
        weatherMatchScore = 0.5;
        reason = 'Weather neutral: agnostic setting for fog narrative.';
      } else if (candidateWeather === 'CLEAR_FAIR') {
        modifier = -0.005;
        weatherMatchScore = 0.2;
        reason = 'Weather penalty: crisp clear visibility directly contradicts foggy misty narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      weatherMatchScore = 0.5;
      reason = 'Neutral weather intent - standard atmospheric scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    weatherCondition: candidateWeather,
    weatherIntent: narrationIntent,
    weatherMatchScore: Math.round(weatherMatchScore * 1000) / 1000,
    reason,
  };
}

const SHALLOW_DEPTH_KEYWORDS = new Set([
  'shallow-depth', 'shallow-focus', 'bokeh', 'blurred-background', 'blur',
  'macro', 'portrait-mode', 'isolated-subject', 'selective-focus', 'defocused-background',
  'depth-of-field', 'creamy-bokeh', 'subject-isolation', 'close-focus', 'blurred-backdrop'
]);

const DEEP_DEPTH_KEYWORDS = new Set([
  'deep-focus', 'deep-depth', 'pan-focus', 'sharp-horizon', 'edge-to-edge',
  'everything-in-focus', 'panoramic-depth', 'hyperfocal', 'all-in-focus',
  'landscape-clarity', 'crisp-background', 'full-depth', 'wide-depth'
]);

const RACK_DEPTH_KEYWORDS = new Set([
  'rack-focus', 'focus-pull', 'pull-focus', 'shifting-focus', 'focus-shift',
  'refocus', 'focal-transition', 'focus-change', 'dynamic-focus'
]);

const SOFT_DEPTH_KEYWORDS = new Set([
  'soft-focus', 'dreamy', 'ethereal', 'diffused-focus', 'hazy-focus',
  'nostalgic-blur', 'glow', 'soft-glow', 'vintage-lens', 'dreamlike', 'vignette-blur'
]);

const DEPTH_AGNOSTIC_KEYWORDS = new Set([
  'indoor', 'studio', 'flat', '2d', 'diagram', 'chart', 'infographic', 'vector', 'ui', 'screencast',
  'render', 'abstract', 'isolated-graphic', 'neutral-depth'
]);

const SHALLOW_INTENT_KEYWORDS = new Set([
  'macro', 'bokeh', 'shallow-focus', 'shallow-depth', 'close-focus', 'micro-detail', 'blurred-background', 'bokeh-blur'
]);

const DEEP_INTENT_KEYWORDS = new Set([
  'panorama', 'panoramic', 'horizon', 'deep-focus', 'pan-focus', 'hyperfocal', 'edge-to-edge', 'vast-expanse'
]);

const RACK_INTENT_KEYWORDS = new Set([
  'refocus', 'rack-focus', 'pull-focus', 'focus-pull', 'focus-shift', 'shifting-focus'
]);

const SOFT_INTENT_KEYWORDS = new Set([
  'dreamlike', 'soft-focus', 'ethereal', 'hazy-memory', 'nostalgic-glow', 'ethereal-glow', 'vintage-lens'
]);

/**
 * Step 36: Classifies the optical depth of field & focus plane of a media asset:
 * - SHALLOW_BOKEH: Shallow depth of field, blurred creamy background (bokeh), strong subject isolation, macro / portrait
 * - DEEP_FOCUS: Deep depth of field, sharp focus across all planes from near foreground to distant horizon, pan-focus
 * - RACK_FOCUS: Focus pull / shifting focal plane, dynamic transition of sharpness between foreground and background subjects
 * - SOFT_DREAMY: Soft focus, diffused hazy edges, ethereal / vintage / nostalgic memory aesthetic
 * - DEPTH_AGNOSTIC: Flat 2D graphics, diagrams, UI screencasts, studio infographics, or indeterminate optical depth
 */
export function classifyDepthOfField(candidateAsset: MediaAsset): DepthOfField {
  if (!candidateAsset) return 'DEPTH_AGNOSTIC';

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  for (const desc of descriptions) {
    if (desc) {
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let shallowCount = 0;
  let deepCount = 0;
  let rackCount = 0;
  let softCount = 0;
  let agnosticCount = 0;

  for (const w of tagList) {
    if (SHALLOW_DEPTH_KEYWORDS.has(w)) shallowCount++;
    if (DEEP_DEPTH_KEYWORDS.has(w)) deepCount++;
    if (RACK_DEPTH_KEYWORDS.has(w)) rackCount++;
    if (SOFT_DEPTH_KEYWORDS.has(w)) softCount++;
    if (DEPTH_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(shallowCount, deepCount, rackCount, softCount, agnosticCount);

  if (maxCount > 0) {
    if (rackCount === maxCount) return 'RACK_FOCUS';
    if (softCount === maxCount) return 'SOFT_DREAMY';
    if (shallowCount === maxCount) return 'SHALLOW_BOKEH';
    if (deepCount === maxCount) return 'DEEP_FOCUS';
    if (agnosticCount === maxCount) return 'DEPTH_AGNOSTIC';
  }

  return 'DEPTH_AGNOSTIC';
}

/**
 * Step 36: Classifies narration optical depth of field & focus intent:
 * - SHALLOW: micro details, selective focus, bokeh, subject isolation, intimate view
 * - DEEP: vast panoramas, sweeping expanses, edge-to-edge landscape clarity, all elements in view
 * - RACK: shifting focus, revealing behind, transition between near and far, changing attention
 * - SOFT: dreamy, nostalgic memories, ethereal impressions, misty thoughts, vintage glow
 * - NEUTRAL: general narration without optical depth or focal cues
 */
export function classifyNarrationDepthIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): DepthIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let shallowCount = 0;
  let deepCount = 0;
  let rackCount = 0;
  let softCount = 0;

  // Check multi-word phrase patterns
  if (textLower.includes('shallow focus') || textLower.includes('shallow depth') || textLower.includes('blurred background') || textLower.includes('isolated against') || textLower.includes('focusing closely') || textLower.includes('intimate detail') || textLower.includes('macro view') || textLower.includes('sharp foreground') || textLower.includes('in sharp focus') || textLower.includes('bokeh')) {
    shallowCount += 2;
  }
  if (textLower.includes('deep focus') || textLower.includes('vast landscape') || textLower.includes('panoramic view') || textLower.includes('edge to edge') || textLower.includes('across the horizon') || textLower.includes('entire scene') || textLower.includes('everything in view') || textLower.includes('sweeping vista') || textLower.includes('panoramic vista')) {
    deepCount += 2;
  }
  if (textLower.includes('shift focus') || textLower.includes('shifting focus') || textLower.includes('revealing behind') || textLower.includes('rack focus') || textLower.includes('pull focus') || textLower.includes('focus shifts') || textLower.includes('turning our attention') || textLower.includes('focal transition')) {
    rackCount += 2;
  }
  if (textLower.includes('dreamlike') || textLower.includes('distant memory') || textLower.includes('soft focus') || textLower.includes('nostalgic glow') || textLower.includes('ethereal glow') || textLower.includes('hazy memory') || textLower.includes('dreamy state') || textLower.includes('dreamy atmosphere') || textLower.includes('nostalgic memory')) {
    softCount += 2;
  }

  for (const w of words) {
    if (SHALLOW_INTENT_KEYWORDS.has(w)) shallowCount++;
    if (DEEP_INTENT_KEYWORDS.has(w)) deepCount++;
    if (RACK_INTENT_KEYWORDS.has(w)) rackCount++;
    if (SOFT_INTENT_KEYWORDS.has(w)) softCount++;
  }

  const maxCount = Math.max(shallowCount, deepCount, rackCount, softCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (rackCount === maxCount) return 'RACK';
  if (softCount === maxCount) return 'SOFT';
  if (shallowCount === maxCount) return 'SHALLOW';
  if (deepCount === maxCount) return 'DEEP';

  return 'NEUTRAL';
}

/**
 * Step 36: Optical Depth of Field & Focus Plane Intelligence.
 * Evaluates compatibility between candidate optical depth and narration focal intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateDepthOfFieldModifier(
  candidateDepth: DepthOfField,
  narrationIntent: DepthIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  depthOfField: DepthOfField;
  depthIntent: DepthIntent;
  depthMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      depthOfField: candidateDepth,
      depthIntent: narrationIntent,
      depthMatchScore: 0.8,
      reason: 'Consecutive shot continuation - depth of field penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'SHALLOW' && candidateDepth === 'SHALLOW_BOKEH') ||
      (narrationIntent === 'DEEP' && candidateDepth === 'DEEP_FOCUS') ||
      (narrationIntent === 'RACK' && candidateDepth === 'RACK_FOCUS') ||
      (narrationIntent === 'SOFT' && candidateDepth === 'SOFT_DREAMY')
    ) {
      return {
        modifier: 0.008,
        depthOfField: candidateDepth,
        depthIntent: narrationIntent,
        depthMatchScore: 1.0,
        reason: 'New beat optical depth introduction: depth of field and focal plane aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let depthMatchScore = 0.5;
  let reason = 'Neutral depth of field intent - standard optical scoring.';

  switch (narrationIntent) {
    case 'SHALLOW': {
      if (candidateDepth === 'SHALLOW_BOKEH') {
        modifier = 0.008;
        depthMatchScore = 1.0;
        reason = 'Depth bonus: shallow depth with bokeh background matches isolated focus narration.';
      } else if (candidateDepth === 'RACK_FOCUS') {
        modifier = 0.003;
        depthMatchScore = 0.7;
        reason = 'Depth alignment: dynamic focus pull compatible with selective attention.';
      } else if (candidateDepth === 'SOFT_DREAMY') {
        modifier = 0.002;
        depthMatchScore = 0.6;
        reason = 'Depth alignment: soft diffused focus supports intimate mood.';
      } else if (candidateDepth === 'DEPTH_AGNOSTIC') {
        modifier = 0.0;
        depthMatchScore = 0.5;
        reason = 'Depth neutral: agnostic setting for detail focus narrative.';
      } else if (candidateDepth === 'DEEP_FOCUS') {
        modifier = -0.006;
        depthMatchScore = 0.15;
        reason = 'Depth penalty: deep all-in-focus footage contradicts shallow isolated focus narration.';
      }
      break;
    }
    case 'DEEP': {
      if (candidateDepth === 'DEEP_FOCUS') {
        modifier = 0.008;
        depthMatchScore = 1.0;
        reason = 'Depth bonus: deep pan-focus clarity matches sweeping panoramic narration.';
      } else if (candidateDepth === 'RACK_FOCUS') {
        modifier = 0.003;
        depthMatchScore = 0.7;
        reason = 'Depth alignment: focus depth transition compatible with expansive scene.';
      } else if (candidateDepth === 'DEPTH_AGNOSTIC') {
        modifier = 0.0;
        depthMatchScore = 0.5;
        reason = 'Depth neutral: agnostic setting for panoramic depth narrative.';
      } else if (candidateDepth === 'SOFT_DREAMY') {
        modifier = -0.004;
        depthMatchScore = 0.3;
        reason = 'Depth penalty: soft diffused blur obscures panoramic clarity.';
      } else if (candidateDepth === 'SHALLOW_BOKEH') {
        modifier = -0.006;
        depthMatchScore = 0.15;
        reason = 'Depth penalty: shallow bokeh blur conflicts with vast deep focus narration.';
      }
      break;
    }
    case 'RACK': {
      if (candidateDepth === 'RACK_FOCUS') {
        modifier = 0.008;
        depthMatchScore = 1.0;
        reason = 'Depth bonus: rack focus transition matches narrative perspective shift.';
      } else if (candidateDepth === 'SHALLOW_BOKEH') {
        modifier = 0.003;
        depthMatchScore = 0.7;
        reason = 'Depth alignment: selective focus supports shifting subject emphasis.';
      } else if (candidateDepth === 'DEEP_FOCUS') {
        modifier = 0.003;
        depthMatchScore = 0.7;
        reason = 'Depth alignment: deep focus reveals background relationship during transition.';
      } else if (candidateDepth === 'SOFT_DREAMY') {
        modifier = 0.002;
        depthMatchScore = 0.6;
        reason = 'Depth alignment: soft focus compatible with transitional narrative tone.';
      } else if (candidateDepth === 'DEPTH_AGNOSTIC') {
        modifier = 0.0;
        depthMatchScore = 0.5;
        reason = 'Depth neutral: agnostic setting for focus shift narrative.';
      }
      break;
    }
    case 'SOFT': {
      if (candidateDepth === 'SOFT_DREAMY') {
        modifier = 0.008;
        depthMatchScore = 1.0;
        reason = 'Depth bonus: soft diffused focus matches dreamy nostalgic narration.';
      } else if (candidateDepth === 'SHALLOW_BOKEH') {
        modifier = 0.003;
        depthMatchScore = 0.7;
        reason = 'Depth alignment: creamy bokeh blur enhances nostalgic atmosphere.';
      } else if (candidateDepth === 'RACK_FOCUS') {
        modifier = 0.002;
        depthMatchScore = 0.6;
        reason = 'Depth alignment: focus transition compatible with shifting memory.';
      } else if (candidateDepth === 'DEPTH_AGNOSTIC') {
        modifier = 0.0;
        depthMatchScore = 0.5;
        reason = 'Depth neutral: agnostic setting for dreamlike narrative.';
      } else if (candidateDepth === 'DEEP_FOCUS') {
        modifier = -0.005;
        depthMatchScore = 0.2;
        reason = 'Depth penalty: hyper-sharp deep focus contrasts with soft dreamlike narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      depthMatchScore = 0.5;
      reason = 'Neutral depth of field intent - standard optical scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    depthOfField: candidateDepth,
    depthIntent: narrationIntent,
    depthMatchScore: Math.round(depthMatchScore * 1000) / 1000,
    reason,
  };
}

const REALTIME_RATE_KEYWORDS = new Set([
  'realtime', 'real-time', 'standard-speed', 'natural-motion', '24fps', '30fps', '60fps',
  'normal-speed', 'live-action', 'conversational'
]);

const SLOW_MOTION_KEYWORDS = new Set([
  'slow-motion', 'slow-mo', 'slowmo', 'high-speed', 'high-framerate', '120fps', '240fps',
  'slowed', 'decelerated', 'fluid-slow', 'slow-pacing-motion', 'overcranked'
]);

const TIMELAPSE_KEYWORDS = new Set([
  'timelapse', 'time-lapse', 'hyperlapse', 'hyper-lapse', 'fast-motion', 'accelerated',
  'fast-forward', 'speed-ramp', 'long-exposure-timelapse', 'interval-capture', 'intervalometer',
  'compression', 'acceleration'
]);

const STOP_MOTION_KEYWORDS = new Set([
  'stop-motion', 'stopmotion', 'freeze-frame', 'frozen-instant', 'strobe', 'claymation',
  'step-motion', 'high-speed-freeze'
]);

const TEMPORAL_AGNOSTIC_KEYWORDS = new Set([
  'still', 'photo', 'image', 'static', 'diagram', 'chart', 'graphic', 'flat',
  'infographic', '2d', 'ui', 'screencast', 'abstract', 'neutral-tempo'
]);

const REALTIME_INTENT_KEYWORDS = new Set([
  'realtime', 'real-time', 'live-action', 'natural-pace', 'conversational'
]);

const SLOW_MO_INTENT_KEYWORDS = new Set([
  'slow-motion', 'slow-mo', 'slowmo', 'slowed-down', 'high-speed-camera', 'slowly-unfolding', 'dramatic-slow',
  'decelerated', 'slowdown', 'slow-down'
]);

const TIMELAPSE_INTENT_KEYWORDS = new Set([
  'timelapse', 'time-lapse', 'hyperlapse', 'fast-forward', 'hours-passed', 'rushing-by', 'accelerated',
  'decades', 'seasons', 'centuries', 'years-passed'
]);

const FREEZE_INTENT_KEYWORDS = new Set([
  'freeze-frame', 'frozen-in-time', 'split-second', 'stop-motion', 'frozen-moment', 'pause', 'stillness'
]);

/**
 * Step 37: Classifies the temporal motion rate & playback speed dynamics of a media asset:
 * - REALTIME_STANDARD: Normal speed (24/30/60 fps), natural human/object movement
 * - SLOW_MOTION: Cinematic high-frame-rate capture (120/240+ fps), dramatic deceleration
 * - TIMELAPSE_HYPERLAPSE: Accelerated passage of time, hyperlapse, interval capture
 * - STOP_MOTION_FREEZE: Frozen high-speed instant, stop-motion animation, strobe cadence
 * - TEMPORAL_AGNOSTIC: Still photos, graphics, diagrams, or non-temporal media
 */
export function classifyTemporalRate(candidateAsset: MediaAsset): TemporalRate {
  if (!candidateAsset) return 'TEMPORAL_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'TEMPORAL_AGNOSTIC';
  }

  if (candidateAsset.type !== 'video' || candidateAsset.duration === 0) {
    return 'TEMPORAL_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 3) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 3) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 3) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 3) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let realtimeCount = 0;
  let slowCount = 0;
  let timelapseCount = 0;
  let stopCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('slow motion') || fullDescText.includes('slow mo') || fullDescText.includes('high speed camera') || fullDescText.includes('overcranked')) {
    slowCount += 3;
  }
  if (fullDescText.includes('timelapse') || fullDescText.includes('time lapse') || fullDescText.includes('hyperlapse') || fullDescText.includes('fast motion') || fullDescText.includes('time compression') || fullDescText.includes('intervalometer')) {
    timelapseCount += 3;
  }
  if (fullDescText.includes('freeze frame') || fullDescText.includes('stop motion') || fullDescText.includes('claymation') || fullDescText.includes('frozen instant')) {
    stopCount += 3;
  }
  if (fullDescText.includes('still photo') || fullDescText.includes('screenshot') || fullDescText.includes('infographic') || fullDescText.includes('diagram')) {
    agnosticCount += 3;
  }
  if (fullDescText.includes('realtime') || fullDescText.includes('real time') || fullDescText.includes('natural conversation') || fullDescText.includes('live action') || fullDescText.includes('standard playback')) {
    realtimeCount += 2;
  }

  for (const w of tagList) {
    if (SLOW_MOTION_KEYWORDS.has(w)) slowCount++;
    if (TIMELAPSE_KEYWORDS.has(w)) timelapseCount++;
    if (STOP_MOTION_KEYWORDS.has(w)) stopCount++;
    if (REALTIME_RATE_KEYWORDS.has(w)) realtimeCount++;
    if (TEMPORAL_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(realtimeCount, slowCount, timelapseCount, stopCount, agnosticCount);

  if (maxCount > 0) {
    if (slowCount === maxCount) return 'SLOW_MOTION';
    if (timelapseCount === maxCount) return 'TIMELAPSE_HYPERLAPSE';
    if (stopCount === maxCount) return 'STOP_MOTION_FREEZE';
    if (realtimeCount === maxCount) return 'REALTIME_STANDARD';
    if (agnosticCount === maxCount) return 'TEMPORAL_AGNOSTIC';
  }

  return 'REALTIME_STANDARD';
}

/**
 * Step 37: Classifies narration temporal motion rate & playback speed intent:
 * - REALTIME: in real time, live action, natural movement, conversational flow
 * - SLOW_MO: in slow motion, slowed down to reveal, dramatic slow-mo, high-speed camera
 * - TIMELAPSE: timelapse, hyperlapse, over the course of hours, fast-forward, passage of time
 * - FREEZE: frozen in time, freeze frame, split second, frozen moment, stop motion
 * - NEUTRAL: general narration without temporal rate cues
 */
export function classifyNarrationTemporalIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): TemporalIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let realtimeCount = 0;
  let slowCount = 0;
  let timelapseCount = 0;
  let freezeCount = 0;

  // Check multi-word phrase patterns
  if (textLower.includes('in real time') || textLower.includes('real time') || textLower.includes('live action') || textLower.includes('everyday life') || textLower.includes('as it happens') || textLower.includes('live in the moment') || textLower.includes('normal speed') || textLower.includes('natural pace') || textLower.includes('spontaneous live')) {
    realtimeCount += 3;
  }
  if (textLower.includes('in slow motion') || textLower.includes('slowed down') || textLower.includes('slow down') || textLower.includes('high speed camera') || textLower.includes('dramatic slow-mo') || textLower.includes('slow motion') || textLower.includes('slowed to reveal') || textLower.includes('every droplet') || textLower.includes('graceful slow') || textLower.includes('decelerated') || textLower.includes('suspended frame') || textLower.includes('millisecond')) {
    slowCount += 3;
  }
  if (textLower.includes('timelapse') || textLower.includes('hyperlapse') || textLower.includes('time lapse') || textLower.includes('over the course of') || textLower.includes('hours passed') || textLower.includes('fast forward') || textLower.includes('passage of time') || textLower.includes('compressed into seconds') || textLower.includes('rushing by') || textLower.includes('accelerated') || textLower.includes('over the next decades') || textLower.includes('days turn into weeks') || textLower.includes('through the seasons') || textLower.includes('hours slip by') || textLower.includes('years passed') || textLower.includes('blink of an eye')) {
    timelapseCount += 3;
  }
  if (textLower.includes('frozen in time') || textLower.includes('freeze frame') || textLower.includes('freeze the frame') || textLower.includes('split second') || textLower.includes('frozen moment') || textLower.includes('stop motion') || textLower.includes('frozen instant') || textLower.includes('instant in time') || textLower.includes('time stood completely still') || textLower.includes('time stood still') || textLower.includes('timeless pause') || textLower.includes('locked in memory')) {
    freezeCount += 3;
  }

  for (const w of words) {
    if (SLOW_MO_INTENT_KEYWORDS.has(w)) slowCount++;
    if (TIMELAPSE_INTENT_KEYWORDS.has(w)) timelapseCount++;
    if (FREEZE_INTENT_KEYWORDS.has(w)) freezeCount++;
    if (REALTIME_INTENT_KEYWORDS.has(w)) realtimeCount++;
  }

  const maxCount = Math.max(realtimeCount, slowCount, timelapseCount, freezeCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (slowCount === maxCount) return 'SLOW_MO';
  if (timelapseCount === maxCount) return 'TIMELAPSE';
  if (freezeCount === maxCount) return 'FREEZE';
  if (realtimeCount === maxCount) return 'REALTIME';

  return 'NEUTRAL';
}

/**
 * Step 37: Temporal Motion Rate & Playback Speed Intelligence.
 * Evaluates compatibility between candidate temporal capture rate and narration playback intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateTemporalRateModifier(
  candidateRate: TemporalRate,
  narrationIntent: TemporalIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  temporalRate: TemporalRate;
  temporalIntent: TemporalIntent;
  temporalMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      temporalRate: candidateRate,
      temporalIntent: narrationIntent,
      temporalMatchScore: 0.8,
      reason: 'Consecutive shot continuation - temporal rate penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'REALTIME' && candidateRate === 'REALTIME_STANDARD') ||
      (narrationIntent === 'SLOW_MO' && candidateRate === 'SLOW_MOTION') ||
      (narrationIntent === 'TIMELAPSE' && candidateRate === 'TIMELAPSE_HYPERLAPSE') ||
      (narrationIntent === 'FREEZE' && candidateRate === 'STOP_MOTION_FREEZE')
    ) {
      return {
        modifier: 0.008,
        temporalRate: candidateRate,
        temporalIntent: narrationIntent,
        temporalMatchScore: 1.0,
        reason: 'New beat temporal playback rate introduction: rate and dynamics align perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let temporalMatchScore = 0.5;
  let reason = 'Neutral temporal rate intent - standard playback scoring.';

  switch (narrationIntent) {
    case 'REALTIME': {
      if (candidateRate === 'REALTIME_STANDARD') {
        modifier = 0.008;
        temporalMatchScore = 1.0;
        reason = 'Rate bonus: standard real-time playback matches natural conversational narration.';
      } else if (candidateRate === 'TEMPORAL_AGNOSTIC') {
        modifier = 0.0;
        temporalMatchScore = 0.5;
        reason = 'Rate neutral: static/agnostic media for real-time narrative.';
      } else if (candidateRate === 'STOP_MOTION_FREEZE') {
        modifier = -0.003;
        temporalMatchScore = 0.35;
        reason = 'Rate mild penalty: frozen stop-motion creates artificial cadence for natural narration.';
      } else if (candidateRate === 'SLOW_MOTION') {
        modifier = -0.003;
        temporalMatchScore = 0.35;
        reason = 'Rate mild penalty: slow-motion playback drags natural real-time dialogue.';
      } else if (candidateRate === 'TIMELAPSE_HYPERLAPSE') {
        modifier = -0.006;
        temporalMatchScore = 0.15;
        reason = 'Rate penalty: fast-forward timelapse directly contradicts real-time natural narration.';
      }
      break;
    }
    case 'SLOW_MO': {
      if (candidateRate === 'SLOW_MOTION') {
        modifier = 0.008;
        temporalMatchScore = 1.0;
        reason = 'Rate bonus: cinematic slow-motion footage matches dramatic slowed narration.';
      } else if (candidateRate === 'STOP_MOTION_FREEZE') {
        modifier = 0.003;
        temporalMatchScore = 0.7;
        reason = 'Rate alignment: high-speed frozen moment supports slow-motion detail emphasis.';
      } else if (candidateRate === 'TEMPORAL_AGNOSTIC') {
        modifier = 0.0;
        temporalMatchScore = 0.5;
        reason = 'Rate neutral: static/agnostic media for slow-motion narrative.';
      } else if (candidateRate === 'REALTIME_STANDARD') {
        modifier = -0.004;
        temporalMatchScore = 0.3;
        reason = 'Rate penalty: normal-speed footage lacks intended slow-motion dramatic emphasis.';
      } else if (candidateRate === 'TIMELAPSE_HYPERLAPSE') {
        modifier = -0.007;
        temporalMatchScore = 0.1;
        reason = 'Rate penalty: accelerated timelapse directly contradicts slow-motion narrative focus.';
      }
      break;
    }
    case 'TIMELAPSE': {
      if (candidateRate === 'TIMELAPSE_HYPERLAPSE') {
        modifier = 0.008;
        temporalMatchScore = 1.0;
        reason = 'Rate bonus: accelerated timelapse/hyperlapse matches passage-of-time narration.';
      } else if (candidateRate === 'REALTIME_STANDARD') {
        modifier = 0.0;
        temporalMatchScore = 0.5;
        reason = 'Rate neutral: real-time footage for passage-of-time narrative.';
      } else if (candidateRate === 'TEMPORAL_AGNOSTIC') {
        modifier = 0.0;
        temporalMatchScore = 0.5;
        reason = 'Rate neutral: static/agnostic media for timelapse narrative.';
      } else if (candidateRate === 'STOP_MOTION_FREEZE') {
        modifier = -0.004;
        temporalMatchScore = 0.3;
        reason = 'Rate penalty: frozen still frame halts temporal flow for timelapse narration.';
      } else if (candidateRate === 'SLOW_MOTION') {
        modifier = -0.007;
        temporalMatchScore = 0.1;
        reason = 'Rate penalty: decelerated slow-motion directly contradicts accelerated timelapse narration.';
      }
      break;
    }
    case 'FREEZE': {
      if (candidateRate === 'STOP_MOTION_FREEZE') {
        modifier = 0.008;
        temporalMatchScore = 1.0;
        reason = 'Rate bonus: freeze-frame / stop-motion capture matches frozen moment narration.';
      } else if (candidateRate === 'SLOW_MOTION') {
        modifier = 0.003;
        temporalMatchScore = 0.7;
        reason = 'Rate alignment: ultra-slow-motion footage approaches frozen instant aesthetic.';
      } else if (candidateRate === 'TEMPORAL_AGNOSTIC') {
        modifier = 0.0;
        temporalMatchScore = 0.5;
        reason = 'Rate neutral: static/agnostic media for frozen moment narrative.';
      } else if (candidateRate === 'REALTIME_STANDARD') {
        modifier = -0.004;
        temporalMatchScore = 0.3;
        reason = 'Rate penalty: continuous real-time playback lacks freeze-frame emphasis.';
      } else if (candidateRate === 'TIMELAPSE_HYPERLAPSE') {
        modifier = -0.006;
        temporalMatchScore = 0.15;
        reason = 'Rate penalty: rushing timelapse contradicts split-second frozen moment narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      temporalMatchScore = 0.5;
      reason = 'Neutral temporal rate intent - standard playback scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    temporalRate: candidateRate,
    temporalIntent: narrationIntent,
    temporalMatchScore: Math.round(temporalMatchScore * 1000) / 1000,
    reason,
  };
}

const LIVE_ACTION_KEYWORDS = new Set([
  'live-action', 'liveaction', 'real-world', 'photographic', 'documentary', 'footage', 'realism',
  'human', 'authentic', 'camera-capture', 'natural-footage', 'filmed', 'interview', 'b-roll', 'broll'
]);

const SCREENCAST_UI_KEYWORDS = new Set([
  'screencast', 'screen-recording', 'ui', 'interface', 'software', 'app', 'dashboard', 'browser',
  'website', 'code', 'ide', 'terminal', 'mockup', 'click', 'menu', 'screen-capture', 'desktop', 'screenshot', 'gui'
]);

const ANIMATION_2D_KEYWORDS = new Set([
  'animation', '2d-animation', 'cartoon', 'vector', 'illustration', 'animated', 'whiteboard',
  'drawing', 'hand-drawn', 'motion-graphics', 'character-animation', 'flat-vector', '2d'
]);

const CGI_3D_KEYWORDS = new Set([
  '3d', 'cgi', '3d-render', 'render', 'digital-twin', 'cad', 'simulation', 'unreal', 'blender',
  'raytracing', 'volumetric', '3d-model', 'mesh', 'polygonal', 'holographic-3d', 'architectural-render'
]);

const ABSTRACT_GRAPHIC_KEYWORDS = new Set([
  'abstract', 'particle', 'particles', 'data-stream', 'waveform', 'geometric', 'motion-background',
  'digital-grid', 'hud', 'cyber', 'energy-flow', 'generative', 'plexus', 'infographic', 'data-visualization'
]);

const MEDIUM_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'agnostic', 'general', 'media', 'clip', 'asset'
]);

const LIVE_ACTION_INTENT_KEYWORDS = new Set([
  'live-action', 'real-world', 'real-life', 'documentary', 'in-person', 'hands-on', 'physical', 'interview'
]);

const SCREENCAST_INTENT_KEYWORDS = new Set([
  'screencast', 'interface', 'dashboard', 'software', 'screen', 'click', 'clicking', 'settings',
  'browser', 'app', 'website', 'terminal', 'code', 'typing', 'ui', 'portal', 'button', 'menu'
]);

const ANIMATION_INTENT_KEYWORDS = new Set([
  'animation', 'cartoon', 'animated', 'illustration', 'illustrated', 'drawing', 'sketch', 'hand-drawn',
  'whiteboard', 'vector-character', 'drawn'
]);

const CGI_3D_INTENT_KEYWORDS = new Set([
  '3d-model', '3d-render', 'simulation', 'cad', 'digital-twin', 'volumetric', 'architectural-model',
  '3d-simulation', 'render', '3d', 'polygonal'
]);

const ABSTRACT_INTENT_KEYWORDS = new Set([
  'abstract', 'particles', 'data-flow', 'network', 'algorithm', 'cyber', 'digital-stream', 'waveforms', 'data-stream'
]);

/**
 * Step 38: Classifies the visual medium and rendering style of a media asset:
 * - LIVE_ACTION_REALISM: Live-action camera recording, photographic realism, documentary footage
 * - SCREENCAST_UI: Software interface, app screencast, browser walkthrough, dashboard, code editor
 * - ANIMATION_2D: 2D vector animation, cartoon illustration, whiteboard sketch, hand-drawn explainer
 * - CGI_3D_RENDER: 3D modeled render, digital twin simulation, volumetric graphics, CAD models
 * - ABSTRACT_GRAPHIC: Abstract motion backgrounds, particle flows, geometric networks, cybernetic visuals
 * - MEDIUM_AGNOSTIC: Indeterminate, versatile, or neutral format
 */
export function classifyVisualMedium(candidateAsset: MediaAsset): VisualMedium {
  if (!candidateAsset) return 'MEDIUM_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'MEDIUM_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let liveCount = 0;
  let screencastCount = 0;
  let animationCount = 0;
  let cgi3dCount = 0;
  let abstractCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('screen recording') || fullDescText.includes('screencast') || fullDescText.includes('user interface') || fullDescText.includes('software demo') || fullDescText.includes('dashboard walkthrough') || fullDescText.includes('web browser') || fullDescText.includes('code editor')) {
    screencastCount += 3;
  }
  if (fullDescText.includes('3d render') || fullDescText.includes('digital twin') || fullDescText.includes('cgi simulation') || fullDescText.includes('cad model') || fullDescText.includes('volumetric 3d') || fullDescText.includes('unreal engine') || fullDescText.includes('blender render') || fullDescText.includes('3d simulation')) {
    cgi3dCount += 3;
  }
  if (fullDescText.includes('2d animation') || fullDescText.includes('cartoon illustration') || fullDescText.includes('motion graphic') || fullDescText.includes('hand drawn') || fullDescText.includes('vector art') || fullDescText.includes('whiteboard animation') || fullDescText.includes('animated character')) {
    animationCount += 3;
  }
  if (fullDescText.includes('abstract background') || fullDescText.includes('particle system') || fullDescText.includes('data stream') || fullDescText.includes('digital grid') || fullDescText.includes('geometric motion') || fullDescText.includes('cybernetic') || fullDescText.includes('particle flow')) {
    abstractCount += 3;
  }
  if (fullDescText.includes('live action') || fullDescText.includes('real world') || fullDescText.includes('documentary footage') || fullDescText.includes('camera recording') || fullDescText.includes('photographic realism') || fullDescText.includes('live conversation')) {
    liveCount += 3;
  }

  for (const w of tagList) {
    if (SCREENCAST_UI_KEYWORDS.has(w)) screencastCount++;
    if (CGI_3D_KEYWORDS.has(w)) cgi3dCount++;
    if (ANIMATION_2D_KEYWORDS.has(w)) animationCount++;
    if (ABSTRACT_GRAPHIC_KEYWORDS.has(w)) abstractCount++;
    if (LIVE_ACTION_KEYWORDS.has(w)) liveCount++;
    if (MEDIUM_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(liveCount, screencastCount, animationCount, cgi3dCount, abstractCount, agnosticCount);

  if (maxCount > 0) {
    if (screencastCount === maxCount) return 'SCREENCAST_UI';
    if (cgi3dCount === maxCount) return 'CGI_3D_RENDER';
    if (animationCount === maxCount) return 'ANIMATION_2D';
    if (abstractCount === maxCount) return 'ABSTRACT_GRAPHIC';
    if (liveCount === maxCount) return 'LIVE_ACTION_REALISM';
    if (agnosticCount === maxCount) return 'MEDIUM_AGNOSTIC';
  }

  if (candidateAsset.type === 'video') {
    return 'LIVE_ACTION_REALISM';
  }

  return 'MEDIUM_AGNOSTIC';
}

/**
 * Step 38: Classifies narration visual medium and render style intent:
 * - LIVE_ACTION: real-world events, documentary, authentic human experience, live camera
 * - SCREENCAST: software walkthrough, click here, menu, settings, code, app, dashboard, browser, website
 * - ANIMATION: cartoon, hand-drawn illustration, animated character, whiteboard explainer
 * - CGI_3D: 3D render, digital simulation, CAD model, architectural simulation, volumetric model
 * - ABSTRACT: abstract data streams, particle flow, algorithmic networks, cybernetic energy
 * - NEUTRAL: general narration without medium constraints
 */
export function classifyNarrationMediumIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): MediumIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let liveCount = 0;
  let screencastCount = 0;
  let animationCount = 0;
  let cgi3dCount = 0;
  let abstractCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('in the app') || textLower.includes('on the website') || textLower.includes('user interface') || textLower.includes('dashboard') || textLower.includes('settings page') || textLower.includes('click on') || textLower.includes('screen recording') || textLower.includes('code editor') || textLower.includes('software demo') || textLower.includes('navigation bar') || textLower.includes('drop down menu')) {
    screencastCount += 3;
  }
  if (textLower.includes('3d simulation') || textLower.includes('digital twin') || textLower.includes('3d model') || textLower.includes('rendered in 3d') || textLower.includes('cad blueprint') || textLower.includes('architectural simulation') || textLower.includes('volumetric rendering') || textLower.includes('3d reconstruction')) {
    cgi3dCount += 3;
  }
  if (textLower.includes('animated') || textLower.includes('cartoon') || textLower.includes('illustration') || textLower.includes('hand drawn') || textLower.includes('drawn by hand') || textLower.includes('whiteboard sketch') || textLower.includes('vector graphic') || textLower.includes('animated metaphor')) {
    animationCount += 3;
  }
  if (textLower.includes('abstract concept') || textLower.includes('data streams') || textLower.includes('digital network') || textLower.includes('particle swarm') || textLower.includes('algorithmic flow') || textLower.includes('matrix of data') || textLower.includes('stream of information') || textLower.includes('digital flow')) {
    abstractCount += 3;
  }
  if (textLower.includes('in real life') || textLower.includes('real world') || textLower.includes('live in person') || textLower.includes('on camera') || textLower.includes('hands on') || textLower.includes('documentary') || textLower.includes('physical reality') || textLower.includes('in the real world') || textLower.includes('live demonstration')) {
    liveCount += 3;
  }

  for (const w of words) {
    if (SCREENCAST_INTENT_KEYWORDS.has(w)) screencastCount++;
    if (CGI_3D_INTENT_KEYWORDS.has(w)) cgi3dCount++;
    if (ANIMATION_INTENT_KEYWORDS.has(w)) animationCount++;
    if (ABSTRACT_INTENT_KEYWORDS.has(w)) abstractCount++;
    if (LIVE_ACTION_INTENT_KEYWORDS.has(w)) liveCount++;
  }

  const maxCount = Math.max(liveCount, screencastCount, animationCount, cgi3dCount, abstractCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (screencastCount === maxCount) return 'SCREENCAST';
  if (cgi3dCount === maxCount) return 'CGI_3D';
  if (animationCount === maxCount) return 'ANIMATION';
  if (abstractCount === maxCount) return 'ABSTRACT';
  if (liveCount === maxCount) return 'LIVE_ACTION';

  return 'NEUTRAL';
}

/**
 * Step 38: Visual Medium & Render Style Intelligence.
 * Evaluates compatibility between candidate visual medium and narration rendering modality intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateVisualMediumModifier(
  candidateMedium: VisualMedium,
  narrationIntent: MediumIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  visualMedium: VisualMedium;
  mediumIntent: MediumIntent;
  mediumMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      visualMedium: candidateMedium,
      mediumIntent: narrationIntent,
      mediumMatchScore: 0.8,
      reason: 'Consecutive shot continuation - visual medium penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'LIVE_ACTION' && candidateMedium === 'LIVE_ACTION_REALISM') ||
      (narrationIntent === 'SCREENCAST' && candidateMedium === 'SCREENCAST_UI') ||
      (narrationIntent === 'ANIMATION' && candidateMedium === 'ANIMATION_2D') ||
      (narrationIntent === 'CGI_3D' && candidateMedium === 'CGI_3D_RENDER') ||
      (narrationIntent === 'ABSTRACT' && candidateMedium === 'ABSTRACT_GRAPHIC')
    ) {
      return {
        modifier: 0.008,
        visualMedium: candidateMedium,
        mediumIntent: narrationIntent,
        mediumMatchScore: 1.0,
        reason: 'New beat visual medium introduction: medium and rendering style align perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let mediumMatchScore = 0.5;
  let reason = 'Neutral visual medium intent - standard rendering style scoring.';

  switch (narrationIntent) {
    case 'LIVE_ACTION': {
      if (candidateMedium === 'LIVE_ACTION_REALISM') {
        modifier = 0.008;
        mediumMatchScore = 1.0;
        reason = 'Medium bonus: live-action documentary footage matches real-world narrative.';
      } else if (candidateMedium === 'CGI_3D_RENDER') {
        modifier = 0.002;
        mediumMatchScore = 0.6;
        reason = 'Medium alignment: realistic 3D simulation supports real-world topic.';
      } else if (candidateMedium === 'MEDIUM_AGNOSTIC') {
        modifier = 0.0;
        mediumMatchScore = 0.5;
        reason = 'Medium neutral: agnostic format for live-action narrative.';
      } else if (candidateMedium === 'ABSTRACT_GRAPHIC') {
        modifier = -0.003;
        mediumMatchScore = 0.35;
        reason = 'Medium mild penalty: abstract graphics lack authentic live-action presence.';
      } else if (candidateMedium === 'ANIMATION_2D') {
        modifier = -0.004;
        mediumMatchScore = 0.3;
        reason = 'Medium penalty: cartoon 2D animation conflicts with live-action documentary narration.';
      } else if (candidateMedium === 'SCREENCAST_UI') {
        modifier = -0.006;
        mediumMatchScore = 0.15;
        reason = 'Medium penalty: software screen recording conflicts with physical live-action story.';
      }
      break;
    }
    case 'SCREENCAST': {
      if (candidateMedium === 'SCREENCAST_UI') {
        modifier = 0.008;
        mediumMatchScore = 1.0;
        reason = 'Medium bonus: software screencast UI recording matches app/interface walkthrough.';
      } else if (candidateMedium === 'ABSTRACT_GRAPHIC') {
        modifier = 0.003;
        mediumMatchScore = 0.7;
        reason = 'Medium alignment: digital tech graphic supports software context.';
      } else if (candidateMedium === 'CGI_3D_RENDER') {
        modifier = 0.002;
        mediumMatchScore = 0.6;
        reason = 'Medium alignment: 3D tech visualization compatible with software explanation.';
      } else if (candidateMedium === 'MEDIUM_AGNOSTIC') {
        modifier = 0.0;
        mediumMatchScore = 0.5;
        reason = 'Medium neutral: agnostic format for software UI narrative.';
      } else if (candidateMedium === 'ANIMATION_2D') {
        modifier = -0.003;
        mediumMatchScore = 0.35;
        reason = 'Medium mild penalty: cartoon animation diverges from literal software UI demo.';
      } else if (candidateMedium === 'LIVE_ACTION_REALISM') {
        modifier = -0.006;
        mediumMatchScore = 0.15;
        reason = 'Medium penalty: live-action footage fails to show the referenced software interface.';
      }
      break;
    }
    case 'ANIMATION': {
      if (candidateMedium === 'ANIMATION_2D') {
        modifier = 0.008;
        mediumMatchScore = 1.0;
        reason = 'Medium bonus: 2D animation and illustrated style matches animated narrative.';
      } else if (candidateMedium === 'ABSTRACT_GRAPHIC') {
        modifier = 0.003;
        mediumMatchScore = 0.7;
        reason = 'Medium alignment: motion graphic elements complement animation style.';
      } else if (candidateMedium === 'CGI_3D_RENDER') {
        modifier = 0.002;
        mediumMatchScore = 0.6;
        reason = 'Medium alignment: 3D animation elements compatible with illustrated storytelling.';
      } else if (candidateMedium === 'MEDIUM_AGNOSTIC') {
        modifier = 0.0;
        mediumMatchScore = 0.5;
        reason = 'Medium neutral: agnostic format for animation narrative.';
      } else if (candidateMedium === 'SCREENCAST_UI') {
        modifier = -0.004;
        mediumMatchScore = 0.3;
        reason = 'Medium penalty: static UI capture lacks animated illustrative energy.';
      } else if (candidateMedium === 'LIVE_ACTION_REALISM') {
        modifier = -0.005;
        mediumMatchScore = 0.2;
        reason = 'Medium penalty: physical live-action footage clashes with animated concept narration.';
      }
      break;
    }
    case 'CGI_3D': {
      if (candidateMedium === 'CGI_3D_RENDER') {
        modifier = 0.008;
        mediumMatchScore = 1.0;
        reason = 'Medium bonus: 3D CGI simulation and model matches 3D digital concept.';
      } else if (candidateMedium === 'ABSTRACT_GRAPHIC') {
        modifier = 0.003;
        mediumMatchScore = 0.7;
        reason = 'Medium alignment: digital geometric visuals support 3D simulation context.';
      } else if (candidateMedium === 'ANIMATION_2D') {
        modifier = 0.002;
        mediumMatchScore = 0.6;
        reason = 'Medium alignment: stylized animation compatible with digital modeling.';
      } else if (candidateMedium === 'MEDIUM_AGNOSTIC') {
        modifier = 0.0;
        mediumMatchScore = 0.5;
        reason = 'Medium neutral: agnostic format for 3D CGI narrative.';
      } else if (candidateMedium === 'SCREENCAST_UI') {
        modifier = -0.004;
        mediumMatchScore = 0.3;
        reason = 'Medium penalty: flat software UI lacks dimensional 3D depth.';
      } else if (candidateMedium === 'LIVE_ACTION_REALISM') {
        modifier = -0.005;
        mediumMatchScore = 0.2;
        reason = 'Medium penalty: standard live-action footage fails to depict 3D digital simulation.';
      }
      break;
    }
    case 'ABSTRACT': {
      if (candidateMedium === 'ABSTRACT_GRAPHIC') {
        modifier = 0.008;
        mediumMatchScore = 1.0;
        reason = 'Medium bonus: abstract motion graphics match conceptual data/energy narrative.';
      } else if (candidateMedium === 'CGI_3D_RENDER') {
        modifier = 0.003;
        mediumMatchScore = 0.7;
        reason = 'Medium alignment: 3D digital visuals support abstract concept.';
      } else if (candidateMedium === 'ANIMATION_2D') {
        modifier = 0.003;
        mediumMatchScore = 0.7;
        reason = 'Medium alignment: motion graphics animation supports abstract topic.';
      } else if (candidateMedium === 'MEDIUM_AGNOSTIC') {
        modifier = 0.0;
        mediumMatchScore = 0.5;
        reason = 'Medium neutral: agnostic format for abstract narrative.';
      } else if (candidateMedium === 'SCREENCAST_UI') {
        modifier = -0.003;
        mediumMatchScore = 0.35;
        reason = 'Medium mild penalty: specific software UI is too literal for abstract concept.';
      } else if (candidateMedium === 'LIVE_ACTION_REALISM') {
        modifier = -0.005;
        mediumMatchScore = 0.2;
        reason = 'Medium penalty: literal physical footage conflicts with abstract conceptual narrative.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      mediumMatchScore = 0.5;
      reason = 'Neutral visual medium intent - standard rendering style scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    visualMedium: candidateMedium,
    mediumIntent: narrationIntent,
    mediumMatchScore: Math.round(mediumMatchScore * 1000) / 1000,
    reason,
  };
}

// ==========================================
// Step 39: Compositional Balance & Screen Alignment Intelligence
// ==========================================

const CENTERED_COMPOSITION_KEYWORDS = new Set([
  'centered', 'center', 'centre', 'central', 'symmetry', 'symmetrical', 'middle',
  'dead-center', 'bullseye', 'equidistant', 'axial', 'front-and-center'
]);

const LEFT_THIRD_KEYWORDS = new Set([
  'left-third', 'rule-of-thirds-left', 'left-aligned', 'left-side', 'left-frame',
  'left-weighted', 'left-anchored', 'left-placed'
]);

const RIGHT_THIRD_KEYWORDS = new Set([
  'right-third', 'rule-of-thirds-right', 'right-aligned', 'right-side', 'right-frame',
  'right-weighted', 'right-anchored', 'right-placed'
]);

const DISTRIBUTED_COMPOSITION_KEYWORDS = new Set([
  'distributed', 'balanced', 'multi-focal', 'spread', 'all-over', 'grid-aligned',
  'patterned', 'uniform-distribution', 'wide-balance', 'panoramic-spread'
]);

const COMPOSITION_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'agnostic', 'general', 'media', 'clip', 'asset', 'unframed'
]);

const CENTER_INTENT_KEYWORDS = new Set([
  'center', 'centered', 'middle', 'central', 'focus', 'spotlight', 'symmetry',
  'symmetrical', 'focal-point', 'in-focus', 'subject-center'
]);

const LEFT_INTENT_KEYWORDS = new Set([
  'left-side', 'left-hand', 'leftward', 'left-flank', 'left-column', 'left-margin', 'left'
]);

const RIGHT_INTENT_KEYWORDS = new Set([
  'right-side', 'right-hand', 'rightward', 'right-flank', 'right-column', 'right-margin', 'right'
]);

const DISTRIBUTED_INTENT_KEYWORDS = new Set([
  'scattered', 'distributed', 'panoramic', 'spread', 'mosaic', 'grid', 'multi-point', 'balanced'
]);

/**
 * Step 39: Classifies the compositional balance and screen alignment of a media asset:
 * - CENTERED_SYMMETRIC: Dead center focus, symmetrical balance, axial symmetry
 * - RULE_OF_THIRDS_LEFT: Subject placed on the left third axis of the 16:9 frame
 * - RULE_OF_THIRDS_RIGHT: Subject placed on the right third axis of the 16:9 frame
 * - DISTRIBUTED_BALANCED: Multi-focal, all-over coverage, uniform screen distribution
 * - COMPOSITION_AGNOSTIC: Neutral, unweighted, or versatile framing
 */
export function classifyCompositionBalance(candidateAsset: MediaAsset): CompositionBalance {
  if (!candidateAsset) return 'COMPOSITION_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'COMPOSITION_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let centerCount = 0;
  let leftCount = 0;
  let rightCount = 0;
  let distributedCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('rule of thirds left') || fullDescText.includes('on the left') || fullDescText.includes('left aligned') || fullDescText.includes('left side framing') || fullDescText.includes('left third') || fullDescText.includes('left weighted') || fullDescText.includes('framed on the left')) {
    leftCount += 3;
  }
  if (fullDescText.includes('rule of thirds right') || fullDescText.includes('on the right') || fullDescText.includes('right aligned') || fullDescText.includes('right side framing') || fullDescText.includes('right third') || fullDescText.includes('right weighted') || fullDescText.includes('framed on the right')) {
    rightCount += 3;
  }
  if (fullDescText.includes('dead center') || fullDescText.includes('symmetrical balance') || fullDescText.includes('centered framing') || fullDescText.includes('center framed') || fullDescText.includes('axial symmetry') || fullDescText.includes('perfect symmetry') || fullDescText.includes('front and center')) {
    centerCount += 3;
  }
  if (fullDescText.includes('distributed balance') || fullDescText.includes('multi-focal composition') || fullDescText.includes('uniform distribution') || fullDescText.includes('all-over composition') || fullDescText.includes('panoramic spread') || fullDescText.includes('grid layout') || fullDescText.includes('scattered elements')) {
    distributedCount += 3;
  }

  for (const w of tagList) {
    if (LEFT_THIRD_KEYWORDS.has(w)) leftCount++;
    if (RIGHT_THIRD_KEYWORDS.has(w)) rightCount++;
    if (CENTERED_COMPOSITION_KEYWORDS.has(w)) centerCount++;
    if (DISTRIBUTED_COMPOSITION_KEYWORDS.has(w)) distributedCount++;
    if (COMPOSITION_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(centerCount, leftCount, rightCount, distributedCount, agnosticCount);

  if (maxCount > 0) {
    if (leftCount === maxCount) return 'RULE_OF_THIRDS_LEFT';
    if (rightCount === maxCount) return 'RULE_OF_THIRDS_RIGHT';
    if (centerCount === maxCount) return 'CENTERED_SYMMETRIC';
    if (distributedCount === maxCount) return 'DISTRIBUTED_BALANCED';
    if (agnosticCount === maxCount) return 'COMPOSITION_AGNOSTIC';
  }

  return 'COMPOSITION_AGNOSTIC';
}

/**
 * Step 39: Classifies narration composition balance & screen alignment intent:
 * - CENTER: central focus, front and center, spotlight, symmetry, middle
 * - LEFT: on the left, to the left, left-hand side, left column
 * - RIGHT: on the right, to the right, right-hand side, right column
 * - DISTRIBUTED: spread across, all over, scattered, throughout, multi-point
 * - NEUTRAL: general narration without screen placement cues
 */
export function classifyNarrationCompositionIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): CompositionIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let centerCount = 0;
  let leftCount = 0;
  let rightCount = 0;
  let distributedCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('on the left') || textLower.includes('to the left') || textLower.includes('left hand side') || textLower.includes('on our left') || textLower.includes('left side') || textLower.includes('towards the left') || textLower.includes('in the left column')) {
    leftCount += 3;
  }
  if (textLower.includes('on the right') || textLower.includes('to the right') || textLower.includes('right hand side') || textLower.includes('on our right') || textLower.includes('right side') || textLower.includes('towards the right') || textLower.includes('in the right column')) {
    rightCount += 3;
  }
  if (textLower.includes('dead center') || textLower.includes('front and center') || textLower.includes('in the center') || textLower.includes('in the middle') || textLower.includes('at the center') || textLower.includes('centered around') || textLower.includes('focal point') || textLower.includes('core focus')) {
    centerCount += 3;
  }
  if (textLower.includes('spread across') || textLower.includes('all across') || textLower.includes('scattered throughout') || textLower.includes('across the screen') || textLower.includes('distributed evenly') || textLower.includes('all over the place') || textLower.includes('on both sides') || textLower.includes('throughout the whole frame')) {
    distributedCount += 3;
  }

  for (const w of words) {
    if (LEFT_INTENT_KEYWORDS.has(w)) leftCount++;
    if (RIGHT_INTENT_KEYWORDS.has(w)) rightCount++;
    if (CENTER_INTENT_KEYWORDS.has(w)) centerCount++;
    if (DISTRIBUTED_INTENT_KEYWORDS.has(w)) distributedCount++;
  }

  const maxCount = Math.max(centerCount, leftCount, rightCount, distributedCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (leftCount === maxCount) return 'LEFT';
  if (rightCount === maxCount) return 'RIGHT';
  if (centerCount === maxCount) return 'CENTER';
  if (distributedCount === maxCount) return 'DISTRIBUTED';

  return 'NEUTRAL';
}

/**
 * Step 39: Compositional Balance & Screen Alignment Intelligence.
 * Evaluates compatibility between candidate visual screen alignment and narration composition intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateCompositionBalanceModifier(
  candidateBalance: CompositionBalance,
  narrationIntent: CompositionIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  compositionBalance: CompositionBalance;
  compositionIntent: CompositionIntent;
  compositionMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      compositionBalance: candidateBalance,
      compositionIntent: narrationIntent,
      compositionMatchScore: 0.8,
      reason: 'Consecutive shot continuation - composition balance penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'CENTER' && candidateBalance === 'CENTERED_SYMMETRIC') ||
      (narrationIntent === 'LEFT' && candidateBalance === 'RULE_OF_THIRDS_LEFT') ||
      (narrationIntent === 'RIGHT' && candidateBalance === 'RULE_OF_THIRDS_RIGHT') ||
      (narrationIntent === 'DISTRIBUTED' && candidateBalance === 'DISTRIBUTED_BALANCED')
    ) {
      return {
        modifier: 0.008,
        compositionBalance: candidateBalance,
        compositionIntent: narrationIntent,
        compositionMatchScore: 1.0,
        reason: 'New beat compositional introduction: screen alignment and visual balance align perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let compositionMatchScore = 0.5;
  let reason = 'Neutral composition intent - standard screen balance scoring.';

  switch (narrationIntent) {
    case 'CENTER': {
      if (candidateBalance === 'CENTERED_SYMMETRIC') {
        modifier = 0.008;
        compositionMatchScore = 1.0;
        reason = 'Composition bonus: centered symmetric framing highlights primary focal topic.';
      } else if (candidateBalance === 'DISTRIBUTED_BALANCED') {
        modifier = 0.002;
        compositionMatchScore = 0.6;
        reason = 'Composition alignment: distributed visual balance supports focused context.';
      } else if (candidateBalance === 'COMPOSITION_AGNOSTIC') {
        modifier = 0.0;
        compositionMatchScore = 0.5;
        reason = 'Composition neutral: agnostic framing for centered narration.';
      } else if (candidateBalance === 'RULE_OF_THIRDS_LEFT') {
        modifier = -0.003;
        compositionMatchScore = 0.35;
        reason = 'Composition mild penalty: off-center left weighting diverges from centered focus.';
      } else if (candidateBalance === 'RULE_OF_THIRDS_RIGHT') {
        modifier = -0.003;
        compositionMatchScore = 0.35;
        reason = 'Composition mild penalty: off-center right weighting diverges from centered focus.';
      }
      break;
    }
    case 'LEFT': {
      if (candidateBalance === 'RULE_OF_THIRDS_LEFT') {
        modifier = 0.008;
        compositionMatchScore = 1.0;
        reason = 'Composition bonus: left rule-of-thirds alignment matches left-oriented narrative.';
      } else if (candidateBalance === 'DISTRIBUTED_BALANCED') {
        modifier = 0.003;
        compositionMatchScore = 0.7;
        reason = 'Composition alignment: balanced wide framing covers left screen area.';
      } else if (candidateBalance === 'CENTERED_SYMMETRIC') {
        modifier = 0.0;
        compositionMatchScore = 0.5;
        reason = 'Composition neutral: centered framing provides neutral balance for left narrative.';
      } else if (candidateBalance === 'COMPOSITION_AGNOSTIC') {
        modifier = 0.0;
        compositionMatchScore = 0.5;
        reason = 'Composition neutral: agnostic framing for left-oriented narration.';
      } else if (candidateBalance === 'RULE_OF_THIRDS_RIGHT') {
        modifier = -0.006;
        compositionMatchScore = 0.15;
        reason = 'Composition penalty: right rule-of-thirds weighting directly opposes left narrative direction.';
      }
      break;
    }
    case 'RIGHT': {
      if (candidateBalance === 'RULE_OF_THIRDS_RIGHT') {
        modifier = 0.008;
        compositionMatchScore = 1.0;
        reason = 'Composition bonus: right rule-of-thirds alignment matches right-oriented narrative.';
      } else if (candidateBalance === 'DISTRIBUTED_BALANCED') {
        modifier = 0.003;
        compositionMatchScore = 0.7;
        reason = 'Composition alignment: balanced wide framing covers right screen area.';
      } else if (candidateBalance === 'CENTERED_SYMMETRIC') {
        modifier = 0.0;
        compositionMatchScore = 0.5;
        reason = 'Composition neutral: centered framing provides neutral balance for right narrative.';
      } else if (candidateBalance === 'COMPOSITION_AGNOSTIC') {
        modifier = 0.0;
        compositionMatchScore = 0.5;
        reason = 'Composition neutral: agnostic framing for right-oriented narration.';
      } else if (candidateBalance === 'RULE_OF_THIRDS_LEFT') {
        modifier = -0.006;
        compositionMatchScore = 0.15;
        reason = 'Composition penalty: left rule-of-thirds weighting directly opposes right narrative direction.';
      }
      break;
    }
    case 'DISTRIBUTED': {
      if (candidateBalance === 'DISTRIBUTED_BALANCED') {
        modifier = 0.008;
        compositionMatchScore = 1.0;
        reason = 'Composition bonus: multi-focal distributed balance matches widespread narrative elements.';
      } else if (candidateBalance === 'CENTERED_SYMMETRIC') {
        modifier = 0.003;
        compositionMatchScore = 0.7;
        reason = 'Composition alignment: centered symmetry supports structured multi-point context.';
      } else if (candidateBalance === 'RULE_OF_THIRDS_LEFT') {
        modifier = 0.002;
        compositionMatchScore = 0.6;
        reason = 'Composition alignment: rule-of-thirds framing compatible with distributed narrative.';
      } else if (candidateBalance === 'RULE_OF_THIRDS_RIGHT') {
        modifier = 0.002;
        compositionMatchScore = 0.6;
        reason = 'Composition alignment: rule-of-thirds framing compatible with distributed narrative.';
      } else if (candidateBalance === 'COMPOSITION_AGNOSTIC') {
        modifier = 0.0;
        compositionMatchScore = 0.5;
        reason = 'Composition neutral: agnostic framing for distributed narration.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      compositionMatchScore = 0.5;
      reason = 'Neutral composition intent - standard screen balance scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    compositionBalance: candidateBalance,
    compositionIntent: narrationIntent,
    compositionMatchScore: Math.round(compositionMatchScore * 1000) / 1000,
    reason,
  };
}

// ==========================================
// Step 40: Lighting Setup & Key Illumination Intelligence
// ==========================================

const FRONTAL_DIRECT_KEYWORDS = new Set([
  'frontal', 'front-lit', 'front-light', 'direct-light', 'beauty-light', 'flat-light',
  'ring-light', 'direct-flash', 'even-lighting', 'direct-illumination', 'head-on'
]);

const SIDE_SPLIT_KEYWORDS = new Set([
  'side-lit', 'side-light', 'split-lighting', 'cross-light', 'chiaroscuro', 'raking-light',
  'lateral-light', 'dramatic-shadow', 'shadowed-profile', 'half-shadow', 'textured-lighting'
]);

const BACKLIT_SILHOUETTE_KEYWORDS = new Set([
  'backlit', 'back-light', 'silhouette', 'rim-light', 'halo', 'kicker', 'edge-light',
  'contre-jour', 'sun-behind', 'halo-effect', 'backlight', 'edge-glow'
]);

const TOP_DOWN_KEYWORDS = new Set([
  'top-light', 'overhead-light', 'downlight', 'spotlight', 'zenith-light', 'sun-overhead',
  'noon-sun', 'ceiling-light', 'overhead-beam', 'lit-from-above'
]);

const DIFFUSE_AMBIENT_KEYWORDS = new Set([
  'diffuse', 'diffused', 'soft-box', 'wrap-around', 'shadowless', 'ambient-light',
  'bounce-light', 'soft-light', 'gentle-glow', 'even-ambient', 'soft-illumination'
]);

const LIGHTING_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'agnostic', 'general', 'media', 'clip', 'asset', 'unlit'
]);

const FRONTAL_INTENT_KEYWORDS = new Set([
  'frontal', 'front-lit', 'direct-light', 'clearly-lit', 'unshadowed', 'bright-face', 'clear-view'
]);

const SIDE_INTENT_KEYWORDS = new Set([
  'side-light', 'shadows', 'shadowed', 'dramatic-shadow', 'split-light', 'chiaroscuro', 'cross-light', 'contrast'
]);

const BACKLIT_INTENT_KEYWORDS = new Set([
  'silhouette', 'backlit', 'rim-light', 'halo', 'backlight', 'glowing-edge', 'halo-effect'
]);

const OVERHEAD_INTENT_KEYWORDS = new Set([
  'spotlight', 'overhead', 'downlight', 'zenith', 'from-above', 'top-light'
]);

const DIFFUSE_INTENT_KEYWORDS = new Set([
  'soft-light', 'diffuse', 'diffused', 'shadowless', 'ambient-glow', 'softly-lit', 'gentle-light'
]);

/**
 * Step 40: Classifies the lighting setup and key illumination style of a media asset:
 * - FRONTAL_DIRECT: Direct frontal key light, even face illumination, flat beauty lighting
 * - SIDE_SPLIT_DRAMATIC: Lateral key light, chiaroscuro, split lighting, dramatic shadow relief
 * - BACKLIT_SILHOUETTE: Light source behind subject, rim lighting, halo effect, silhouette
 * - TOP_DOWN_OVERHEAD: Top-down spotlight, overhead beam, noon zenith lighting
 * - DIFFUSE_AMBIENT: Soft wrap-around illumination, shadowless bounce light, diffuse glow
 * - LIGHTING_AGNOSTIC: Neutral, standard, or indeterminate lighting setup
 */
export function classifyLightingSetup(candidateAsset: MediaAsset): LightingSetup {
  if (!candidateAsset) return 'LIGHTING_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'LIGHTING_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let frontCount = 0;
  let sideCount = 0;
  let backCount = 0;
  let topCount = 0;
  let diffuseCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('frontal lighting') || fullDescText.includes('front lit') || fullDescText.includes('direct front light') || fullDescText.includes('ring light') || fullDescText.includes('even frontal illumination') || fullDescText.includes('beauty light') || fullDescText.includes('direct flash')) {
    frontCount += 3;
  }
  if (fullDescText.includes('side lighting') || fullDescText.includes('side lit') || fullDescText.includes('split lighting') || fullDescText.includes('chiaroscuro') || fullDescText.includes('cross light') || fullDescText.includes('raking light') || fullDescText.includes('dramatic shadow')) {
    sideCount += 3;
  }
  if (fullDescText.includes('backlit') || fullDescText.includes('back light') || fullDescText.includes('rim light') || fullDescText.includes('silhouette') || fullDescText.includes('halo effect') || fullDescText.includes('edge light') || fullDescText.includes('sun behind')) {
    backCount += 3;
  }
  if (fullDescText.includes('top light') || fullDescText.includes('overhead light') || fullDescText.includes('downlight') || fullDescText.includes('spotlight from above') || fullDescText.includes('zenith light') || fullDescText.includes('lit from above')) {
    topCount += 3;
  }
  if (fullDescText.includes('diffuse light') || fullDescText.includes('diffused lighting') || fullDescText.includes('softbox') || fullDescText.includes('soft box') || fullDescText.includes('wrap around light') || fullDescText.includes('shadowless') || fullDescText.includes('ambient glow') || fullDescText.includes('soft lighting')) {
    diffuseCount += 3;
  }

  for (const w of tagList) {
    if (FRONTAL_DIRECT_KEYWORDS.has(w)) frontCount++;
    if (SIDE_SPLIT_KEYWORDS.has(w)) sideCount++;
    if (BACKLIT_SILHOUETTE_KEYWORDS.has(w)) backCount++;
    if (TOP_DOWN_KEYWORDS.has(w)) topCount++;
    if (DIFFUSE_AMBIENT_KEYWORDS.has(w)) diffuseCount++;
    if (LIGHTING_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(frontCount, sideCount, backCount, topCount, diffuseCount, agnosticCount);

  if (maxCount > 0) {
    if (backCount === maxCount) return 'BACKLIT_SILHOUETTE';
    if (sideCount === maxCount) return 'SIDE_SPLIT_DRAMATIC';
    if (topCount === maxCount) return 'TOP_DOWN_OVERHEAD';
    if (diffuseCount === maxCount) return 'DIFFUSE_AMBIENT';
    if (frontCount === maxCount) return 'FRONTAL_DIRECT';
    if (agnosticCount === maxCount) return 'LIGHTING_AGNOSTIC';
  }

  return 'LIGHTING_AGNOSTIC';
}

/**
 * Step 40: Classifies narration lighting setup & key illumination intent:
 * - FRONTAL: clear frontal view, direct light, bright face, clearly illuminated
 * - SIDE_DRAMATIC: in the shadows, dramatic shadow, split light, half in light, chiaroscuro
 * - BACKLIT: silhouette, backlit, rim light, glowing from behind, halo, against the light
 * - OVERHEAD: spotlight from above, beam from above, lit from above, downward spotlight
 * - DIFFUSE: soft light, diffused ambient, gentle glow, shadowless, even illumination
 * - NEUTRAL: general narration without lighting angle cues
 */
export function classifyNarrationLightingIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): LightingIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let frontCount = 0;
  let sideCount = 0;
  let backCount = 0;
  let topCount = 0;
  let diffuseCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('direct light') || textLower.includes('front light') || textLower.includes('clearly illuminated') || textLower.includes('lit from the front') || textLower.includes('clearly visible') || textLower.includes('brightly lit face') || textLower.includes('clear view')) {
    frontCount += 3;
  }
  if (textLower.includes('side light') || textLower.includes('in the shadows') || textLower.includes('shadowed profile') || textLower.includes('dramatic shadow') || textLower.includes('split light') || textLower.includes('half in light') || textLower.includes('chiaroscuro') || textLower.includes('cross light')) {
    sideCount += 3;
  }
  if (textLower.includes('silhouette') || textLower.includes('backlit') || textLower.includes('rim light') || textLower.includes('glowing from behind') || textLower.includes('halo') || textLower.includes('sun behind') || textLower.includes('against the light') || textLower.includes('shadowy figure') || textLower.includes('halo effect')) {
    backCount += 3;
  }
  if (textLower.includes('spotlight from above') || textLower.includes('overhead light') || textLower.includes('beam from above') || textLower.includes('shining down') || textLower.includes('lit from above') || textLower.includes('downlight') || textLower.includes('overhead spotlight')) {
    topCount += 3;
  }
  if (textLower.includes('soft light') || textLower.includes('diffused light') || textLower.includes('gentle glow') || textLower.includes('shadowless') || textLower.includes('even ambient') || textLower.includes('soft illumination') || textLower.includes('diffuse lighting')) {
    diffuseCount += 3;
  }

  for (const w of words) {
    if (FRONTAL_INTENT_KEYWORDS.has(w)) frontCount++;
    if (SIDE_INTENT_KEYWORDS.has(w)) sideCount++;
    if (BACKLIT_INTENT_KEYWORDS.has(w)) backCount++;
    if (OVERHEAD_INTENT_KEYWORDS.has(w)) topCount++;
    if (DIFFUSE_INTENT_KEYWORDS.has(w)) diffuseCount++;
  }

  const maxCount = Math.max(frontCount, sideCount, backCount, topCount, diffuseCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (backCount === maxCount) return 'BACKLIT';
  if (sideCount === maxCount) return 'SIDE_DRAMATIC';
  if (topCount === maxCount) return 'OVERHEAD';
  if (diffuseCount === maxCount) return 'DIFFUSE';
  if (frontCount === maxCount) return 'FRONTAL';

  return 'NEUTRAL';
}

/**
 * Step 40: Lighting Setup & Key Illumination Intelligence.
 * Evaluates compatibility between candidate lighting geometry and narration illumination intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateLightingSetupModifier(
  candidateLighting: LightingSetup,
  narrationIntent: LightingIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  lightingSetup: LightingSetup;
  lightingIntent: LightingIntent;
  lightingMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      lightingSetup: candidateLighting,
      lightingIntent: narrationIntent,
      lightingMatchScore: 0.8,
      reason: 'Consecutive shot continuation - lighting setup penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'FRONTAL' && candidateLighting === 'FRONTAL_DIRECT') ||
      (narrationIntent === 'SIDE_DRAMATIC' && candidateLighting === 'SIDE_SPLIT_DRAMATIC') ||
      (narrationIntent === 'BACKLIT' && candidateLighting === 'BACKLIT_SILHOUETTE') ||
      (narrationIntent === 'OVERHEAD' && candidateLighting === 'TOP_DOWN_OVERHEAD') ||
      (narrationIntent === 'DIFFUSE' && candidateLighting === 'DIFFUSE_AMBIENT')
    ) {
      return {
        modifier: 0.008,
        lightingSetup: candidateLighting,
        lightingIntent: narrationIntent,
        lightingMatchScore: 1.0,
        reason: 'New beat lighting introduction: key illumination geometry aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let lightingMatchScore = 0.5;
  let reason = 'Neutral lighting intent - standard illumination scoring.';

  switch (narrationIntent) {
    case 'FRONTAL': {
      if (candidateLighting === 'FRONTAL_DIRECT') {
        modifier = 0.008;
        lightingMatchScore = 1.0;
        reason = 'Lighting bonus: frontal direct illumination provides clear, unshadowed subject clarity.';
      } else if (candidateLighting === 'DIFFUSE_AMBIENT') {
        modifier = 0.003;
        lightingMatchScore = 0.7;
        reason = 'Lighting alignment: soft diffuse ambient light supports clear subject visibility.';
      } else if (candidateLighting === 'LIGHTING_AGNOSTIC') {
        modifier = 0.0;
        lightingMatchScore = 0.5;
        reason = 'Lighting neutral: agnostic illumination for frontal narrative.';
      } else if (candidateLighting === 'SIDE_SPLIT_DRAMATIC') {
        modifier = -0.003;
        lightingMatchScore = 0.35;
        reason = 'Lighting mild penalty: dramatic side shadows obscure direct frontal visibility.';
      } else if (candidateLighting === 'TOP_DOWN_OVERHEAD') {
        modifier = -0.003;
        lightingMatchScore = 0.35;
        reason = 'Lighting mild penalty: harsh overhead downlight casts top shadows on subject face.';
      } else if (candidateLighting === 'BACKLIT_SILHOUETTE') {
        modifier = -0.006;
        lightingMatchScore = 0.15;
        reason = 'Lighting penalty: backlit silhouette conceals subject details required for frontal view.';
      }
      break;
    }
    case 'SIDE_DRAMATIC': {
      if (candidateLighting === 'SIDE_SPLIT_DRAMATIC') {
        modifier = 0.008;
        lightingMatchScore = 1.0;
        reason = 'Lighting bonus: chiaroscuro side lighting emphasizes dramatic shadow and texture.';
      } else if (candidateLighting === 'TOP_DOWN_OVERHEAD') {
        modifier = 0.003;
        lightingMatchScore = 0.7;
        reason = 'Lighting alignment: overhead directional spotlight supports dramatic mood.';
      } else if (candidateLighting === 'BACKLIT_SILHOUETTE') {
        modifier = 0.002;
        lightingMatchScore = 0.6;
        reason = 'Lighting alignment: rim backlight complements moody shadow aesthetic.';
      } else if (candidateLighting === 'LIGHTING_AGNOSTIC') {
        modifier = 0.0;
        lightingMatchScore = 0.5;
        reason = 'Lighting neutral: agnostic illumination for dramatic side-lit narrative.';
      } else if (candidateLighting === 'DIFFUSE_AMBIENT') {
        modifier = -0.003;
        lightingMatchScore = 0.35;
        reason = 'Lighting mild penalty: flat diffuse wrap lacks high-contrast side shadows.';
      } else if (candidateLighting === 'FRONTAL_DIRECT') {
        modifier = -0.005;
        lightingMatchScore = 0.2;
        reason = 'Lighting penalty: flat direct front light washes out dramatic textural shadows.';
      }
      break;
    }
    case 'BACKLIT': {
      if (candidateLighting === 'BACKLIT_SILHOUETTE') {
        modifier = 0.008;
        lightingMatchScore = 1.0;
        reason = 'Lighting bonus: backlit rim lighting and silhouette match glowing contour narrative.';
      } else if (candidateLighting === 'SIDE_SPLIT_DRAMATIC') {
        modifier = 0.003;
        lightingMatchScore = 0.7;
        reason = 'Lighting alignment: high-contrast side light complements edge-lit aesthetic.';
      } else if (candidateLighting === 'TOP_DOWN_OVERHEAD') {
        modifier = 0.002;
        lightingMatchScore = 0.6;
        reason = 'Lighting alignment: top-back edge light compatible with dramatic backlighting.';
      } else if (candidateLighting === 'LIGHTING_AGNOSTIC') {
        modifier = 0.0;
        lightingMatchScore = 0.5;
        reason = 'Lighting neutral: agnostic illumination for backlit narrative.';
      } else if (candidateLighting === 'DIFFUSE_AMBIENT') {
        modifier = -0.004;
        lightingMatchScore = 0.3;
        reason = 'Lighting penalty: even diffuse lighting lacks distinct edge rim glow.';
      } else if (candidateLighting === 'FRONTAL_DIRECT') {
        modifier = -0.006;
        lightingMatchScore = 0.15;
        reason = 'Lighting penalty: direct frontal illumination opposes backlit silhouette aesthetic.';
      }
      break;
    }
    case 'OVERHEAD': {
      if (candidateLighting === 'TOP_DOWN_OVERHEAD') {
        modifier = 0.008;
        lightingMatchScore = 1.0;
        reason = 'Lighting bonus: top-down overhead spotlight matches zenith lighting narrative.';
      } else if (candidateLighting === 'SIDE_SPLIT_DRAMATIC') {
        modifier = 0.003;
        lightingMatchScore = 0.7;
        reason = 'Lighting alignment: directional side lighting supports dramatic spotlight focus.';
      } else if (candidateLighting === 'BACKLIT_SILHOUETTE') {
        modifier = 0.002;
        lightingMatchScore = 0.6;
        reason = 'Lighting alignment: top-back edge light compatible with overhead spotlight mood.';
      } else if (candidateLighting === 'LIGHTING_AGNOSTIC') {
        modifier = 0.0;
        lightingMatchScore = 0.5;
        reason = 'Lighting neutral: agnostic illumination for overhead lighting narrative.';
      } else if (candidateLighting === 'DIFFUSE_AMBIENT') {
        modifier = -0.003;
        lightingMatchScore = 0.35;
        reason = 'Lighting mild penalty: diffuse ambient glow lacks concentrated overhead spotlight beam.';
      } else if (candidateLighting === 'FRONTAL_DIRECT') {
        modifier = -0.004;
        lightingMatchScore = 0.3;
        reason = 'Lighting penalty: flat frontal illumination diverges from downward overhead beam.';
      }
      break;
    }
    case 'DIFFUSE': {
      if (candidateLighting === 'DIFFUSE_AMBIENT') {
        modifier = 0.008;
        lightingMatchScore = 1.0;
        reason = 'Lighting bonus: soft diffuse wrap-around lighting matches shadowless ambient narrative.';
      } else if (candidateLighting === 'FRONTAL_DIRECT') {
        modifier = 0.003;
        lightingMatchScore = 0.7;
        reason = 'Lighting alignment: even front lighting supports soft, shadowless visibility.';
      } else if (candidateLighting === 'LIGHTING_AGNOSTIC') {
        modifier = 0.0;
        lightingMatchScore = 0.5;
        reason = 'Lighting neutral: agnostic illumination for diffuse narrative.';
      } else if (candidateLighting === 'TOP_DOWN_OVERHEAD') {
        modifier = -0.003;
        lightingMatchScore = 0.35;
        reason = 'Lighting mild penalty: harsh overhead downlight contrasts with soft diffuse mood.';
      } else if (candidateLighting === 'SIDE_SPLIT_DRAMATIC') {
        modifier = -0.004;
        lightingMatchScore = 0.3;
        reason = 'Lighting penalty: harsh split shadows conflict with gentle diffuse ambient glow.';
      } else if (candidateLighting === 'BACKLIT_SILHOUETTE') {
        modifier = -0.005;
        lightingMatchScore = 0.2;
        reason = 'Lighting penalty: high-contrast silhouette conflicts with soft ambient illumination.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      lightingMatchScore = 0.5;
      reason = 'Neutral lighting intent - standard illumination scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    lightingSetup: candidateLighting,
    lightingIntent: narrationIntent,
    lightingMatchScore: Math.round(lightingMatchScore * 1000) / 1000,
    reason,
  };
}

// ==========================================
// Step 41: Camera Point-of-View & Observer Perspective Intelligence
// ==========================================

const FIRST_PERSON_POV_KEYWORDS = new Set([
  'pov', 'first-person', 'point-of-view', 'bodycam', 'helmet-cam', 'gopro-pov',
  'subjective-cam', 'hands-in-frame', 'looking-down', 'first-person-perspective', 'dashcam'
]);

const OVER_THE_SHOULDER_KEYWORDS = new Set([
  'over-the-shoulder', 'ots', 'behind-shoulder', 'shoulder-shot', 'watching-screen-over-shoulder',
  'over-shoulder', 'shoulder-perspective', 'behind-the-back'
]);

const DIRECT_ADDRESS_KEYWORDS = new Set([
  'direct-address', 'looking-at-camera', 'eye-contact', 'talking-head', 'presenter',
  'addressing-viewer', 'fourth-wall', 'front-facing-speaker', 'to-camera', 'anchor'
]);

const OBJECTIVE_OBSERVATIONAL_KEYWORDS = new Set([
  'observational', 'bystander', 'third-person', 'fly-on-the-wall', 'unseen-observer',
  'distant-observer', 'surveillance-view', 'candid-shot', 'unobserved', 'voyeuristic'
]);

const POV_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'agnostic', 'general', 'media', 'clip', 'asset'
]);

const FIRST_PERSON_INTENT_KEYWORDS = new Set([
  'first-person', 'pov', 'my-perspective', 'hands-on', 'holding', 'through-my-eyes'
]);

const OVER_THE_SHOULDER_INTENT_KEYWORDS = new Set([
  'over-the-shoulder', 'ots', 'from-behind', 'behind-shoulder'
]);

const DIRECT_ADDRESS_INTENT_KEYWORDS = new Set([
  'direct-address', 'talking-head', 'to-you', 'directly-to-you', 'look-at-me', 'face-to-face'
]);

const OBSERVATIONAL_INTENT_KEYWORDS = new Set([
  'observational', 'third-person', 'from-afar', 'bystander', 'fly-on-the-wall', 'watching'
]);

/**
 * Step 41: Classifies the camera point-of-view and observer perspective of a media asset:
 * - FIRST_PERSON_POV: Subjective camera, hands in frame, bodycam/GoPro perspective
 * - OVER_THE_SHOULDER: OTS framing looking past a shoulder towards an action or screen
 * - DIRECT_ADDRESS: Presenter looking straight into the lens, talking head, breaking fourth wall
 * - OBJECTIVE_OBSERVATIONAL: Fly-on-the-wall, candid third-person unseen bystander viewpoint
 * - POV_AGNOSTIC: Neutral, standard, or versatile camera perspective
 */
export function classifyPointOfView(candidateAsset: MediaAsset): PointOfView {
  if (!candidateAsset) return 'POV_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'POV_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let povCount = 0;
  let otsCount = 0;
  let directCount = 0;
  let obsCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('first person pov') || fullDescText.includes('point of view') || fullDescText.includes('hands in frame') || fullDescText.includes('bodycam') || fullDescText.includes('gopro pov') || fullDescText.includes('subjective camera') || fullDescText.includes('looking down at hands')) {
    povCount += 3;
  }
  if (fullDescText.includes('over the shoulder') || fullDescText.includes('ots shot') || fullDescText.includes('behind shoulder') || fullDescText.includes('watching screen over shoulder') || fullDescText.includes('shoulder shot') || fullDescText.includes('from behind the shoulder')) {
    otsCount += 3;
  }
  if (fullDescText.includes('direct address') || fullDescText.includes('looking at camera') || fullDescText.includes('talking head') || fullDescText.includes('eye contact') || fullDescText.includes('presenter to camera') || fullDescText.includes('breaking the fourth wall') || fullDescText.includes('front facing speaker')) {
    directCount += 3;
  }
  if (fullDescText.includes('observational') || fullDescText.includes('fly on the wall') || fullDescText.includes('unseen observer') || fullDescText.includes('bystander perspective') || fullDescText.includes('candid third person') || fullDescText.includes('watching from a distance') || fullDescText.includes('surveillance view')) {
    obsCount += 3;
  }

  for (const w of tagList) {
    if (FIRST_PERSON_POV_KEYWORDS.has(w)) povCount++;
    if (OVER_THE_SHOULDER_KEYWORDS.has(w)) otsCount++;
    if (DIRECT_ADDRESS_KEYWORDS.has(w)) directCount++;
    if (OBJECTIVE_OBSERVATIONAL_KEYWORDS.has(w)) obsCount++;
    if (POV_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(povCount, otsCount, directCount, obsCount, agnosticCount);

  if (maxCount > 0) {
    if (povCount === maxCount) return 'FIRST_PERSON_POV';
    if (otsCount === maxCount) return 'OVER_THE_SHOULDER';
    if (directCount === maxCount) return 'DIRECT_ADDRESS';
    if (obsCount === maxCount) return 'OBJECTIVE_OBSERVATIONAL';
    if (agnosticCount === maxCount) return 'POV_AGNOSTIC';
  }

  return 'POV_AGNOSTIC';
}

/**
 * Step 41: Classifies narration point-of-view & observer perspective intent:
 * - FIRST_PERSON: through my eyes, first person, from my perspective, in my hands, as I saw it
 * - OVER_THE_SHOULDER: over the shoulder, watching from behind, looking on over, behind shoulder
 * - DIRECT_ADDRESS: look at me, speaking directly to you, face to face, addressing you, talking head
 * - OBSERVATIONAL: watching from a distance, as an observer, fly on the wall, from afar, bystander
 * - NEUTRAL: general narration without narrative viewpoint cues
 */
export function classifyNarrationPOVIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): POVIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let povCount = 0;
  let otsCount = 0;
  let directCount = 0;
  let obsCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('through my eyes') || textLower.includes('first person') || textLower.includes('from my perspective') || textLower.includes('as i saw it') || textLower.includes('in my hands') || textLower.includes('holding in my hand') || textLower.includes('my point of view') || textLower.includes('looking down at my')) {
    povCount += 3;
  }
  if (textLower.includes('over the shoulder') || textLower.includes('over their shoulder') || textLower.includes('watching from behind') || textLower.includes('looking on over') || textLower.includes('behind the shoulder') || textLower.includes('over his shoulder') || textLower.includes('over her shoulder')) {
    otsCount += 3;
  }
  if (textLower.includes('listen closely') || textLower.includes('look at me') || textLower.includes('speaking directly to you') || textLower.includes('let me tell you') || textLower.includes('i want you to know') || textLower.includes('face to face') || textLower.includes('addressing you') || textLower.includes('look into my eyes')) {
    directCount += 3;
  }
  if (textLower.includes('watching from a distance') || textLower.includes('as an observer') || textLower.includes('from the outside') || textLower.includes('fly on the wall') || textLower.includes('unnoticed') || textLower.includes('observing the scene') || textLower.includes('from afar') || textLower.includes('bystander perspective')) {
    obsCount += 3;
  }

  for (const w of words) {
    if (FIRST_PERSON_INTENT_KEYWORDS.has(w)) povCount++;
    if (OVER_THE_SHOULDER_INTENT_KEYWORDS.has(w)) otsCount++;
    if (DIRECT_ADDRESS_INTENT_KEYWORDS.has(w)) directCount++;
    if (OBSERVATIONAL_INTENT_KEYWORDS.has(w)) obsCount++;
  }

  const maxCount = Math.max(povCount, otsCount, directCount, obsCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (povCount === maxCount) return 'FIRST_PERSON';
  if (otsCount === maxCount) return 'OVER_THE_SHOULDER';
  if (directCount === maxCount) return 'DIRECT_ADDRESS';
  if (obsCount === maxCount) return 'OBSERVATIONAL';

  return 'NEUTRAL';
}

/**
 * Step 41: Camera Point-of-View & Observer Perspective Intelligence.
 * Evaluates compatibility between candidate camera viewpoint and narration narrative perspective intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculatePOVModifier(
  candidatePOV: PointOfView,
  narrationIntent: POVIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  pointOfView: PointOfView;
  povIntent: POVIntent;
  povMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      pointOfView: candidatePOV,
      povIntent: narrationIntent,
      povMatchScore: 0.8,
      reason: 'Consecutive shot continuation - point of view penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'FIRST_PERSON' && candidatePOV === 'FIRST_PERSON_POV') ||
      (narrationIntent === 'OVER_THE_SHOULDER' && candidatePOV === 'OVER_THE_SHOULDER') ||
      (narrationIntent === 'DIRECT_ADDRESS' && candidatePOV === 'DIRECT_ADDRESS') ||
      (narrationIntent === 'OBSERVATIONAL' && candidatePOV === 'OBJECTIVE_OBSERVATIONAL')
    ) {
      return {
        modifier: 0.008,
        pointOfView: candidatePOV,
        povIntent: narrationIntent,
        povMatchScore: 1.0,
        reason: 'New beat perspective introduction: camera point-of-view aligns perfectly with narration.',
      };
    }
  }

  let modifier = 0.0;
  let povMatchScore = 0.5;
  let reason = 'Neutral point-of-view intent - standard perspective scoring.';

  switch (narrationIntent) {
    case 'FIRST_PERSON': {
      if (candidatePOV === 'FIRST_PERSON_POV') {
        modifier = 0.008;
        povMatchScore = 1.0;
        reason = 'POV bonus: subjective first-person camera matches personal first-person narrative.';
      } else if (candidatePOV === 'OVER_THE_SHOULDER') {
        modifier = 0.003;
        povMatchScore = 0.7;
        reason = 'POV alignment: over-the-shoulder framing provides adjacent personal viewpoint.';
      } else if (candidatePOV === 'POV_AGNOSTIC') {
        modifier = 0.0;
        povMatchScore = 0.5;
        reason = 'POV neutral: agnostic viewpoint for first-person narration.';
      } else if (candidatePOV === 'OBJECTIVE_OBSERVATIONAL') {
        modifier = -0.003;
        povMatchScore = 0.35;
        reason = 'POV mild penalty: distant third-person bystander view lacks immersive first-person presence.';
      } else if (candidatePOV === 'DIRECT_ADDRESS') {
        modifier = -0.006;
        povMatchScore = 0.15;
        reason = 'POV penalty: direct address into camera breaks subjective first-person immersion.';
      }
      break;
    }
    case 'OVER_THE_SHOULDER': {
      if (candidatePOV === 'OVER_THE_SHOULDER') {
        modifier = 0.008;
        povMatchScore = 1.0;
        reason = 'POV bonus: over-the-shoulder framing matches secondary observer narrative.';
      } else if (candidatePOV === 'OBJECTIVE_OBSERVATIONAL') {
        modifier = 0.003;
        povMatchScore = 0.7;
        reason = 'POV alignment: observational perspective compatible with over-the-shoulder context.';
      } else if (candidatePOV === 'FIRST_PERSON_POV') {
        modifier = 0.002;
        povMatchScore = 0.6;
        reason = 'POV alignment: subjective first-person framing compatible with watching action.';
      } else if (candidatePOV === 'POV_AGNOSTIC') {
        modifier = 0.0;
        povMatchScore = 0.5;
        reason = 'POV neutral: agnostic viewpoint for over-the-shoulder narration.';
      } else if (candidatePOV === 'DIRECT_ADDRESS') {
        modifier = -0.005;
        povMatchScore = 0.2;
        reason = 'POV penalty: direct address eye contact diverges from over-the-shoulder observational angle.';
      }
      break;
    }
    case 'DIRECT_ADDRESS': {
      if (candidatePOV === 'DIRECT_ADDRESS') {
        modifier = 0.008;
        povMatchScore = 1.0;
        reason = 'POV bonus: direct address presenter framing matches direct audience engagement narrative.';
      } else if (candidatePOV === 'POV_AGNOSTIC') {
        modifier = 0.0;
        povMatchScore = 0.5;
        reason = 'POV neutral: agnostic viewpoint for direct address narration.';
      } else if (candidatePOV === 'OBJECTIVE_OBSERVATIONAL') {
        modifier = -0.003;
        povMatchScore = 0.35;
        reason = 'POV mild penalty: distant observational view lacks direct personal presenter eye contact.';
      } else if (candidatePOV === 'OVER_THE_SHOULDER') {
        modifier = -0.004;
        povMatchScore = 0.3;
        reason = 'POV penalty: over-the-shoulder view looks away from direct presenter-to-viewer connection.';
      } else if (candidatePOV === 'FIRST_PERSON_POV') {
        modifier = -0.006;
        povMatchScore = 0.15;
        reason = 'POV penalty: subjective first-person camera fails to show presenter addressing audience.';
      }
      break;
    }
    case 'OBSERVATIONAL': {
      if (candidatePOV === 'OBJECTIVE_OBSERVATIONAL') {
        modifier = 0.008;
        povMatchScore = 1.0;
        reason = 'POV bonus: fly-on-the-wall observational camera matches objective documentary narration.';
      } else if (candidatePOV === 'OVER_THE_SHOULDER') {
        modifier = 0.003;
        povMatchScore = 0.7;
        reason = 'POV alignment: over-the-shoulder view supports observational perspective.';
      } else if (candidatePOV === 'POV_AGNOSTIC') {
        modifier = 0.0;
        povMatchScore = 0.5;
        reason = 'POV neutral: agnostic viewpoint for observational narration.';
      } else if (candidatePOV === 'FIRST_PERSON_POV') {
        modifier = -0.003;
        povMatchScore = 0.35;
        reason = 'POV mild penalty: subjective first-person camera is too intimate for detached observation.';
      } else if (candidatePOV === 'DIRECT_ADDRESS') {
        modifier = -0.005;
        povMatchScore = 0.2;
        reason = 'POV penalty: direct address eye contact breaks objective bystander detachment.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      povMatchScore = 0.5;
      reason = 'Neutral point-of-view intent - standard perspective scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    pointOfView: candidatePOV,
    povIntent: narrationIntent,
    povMatchScore: Math.round(povMatchScore * 1000) / 1000,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Step 42: Chromatic Saturation & Color Grading Intelligence Keyword Sets & Functions
// ---------------------------------------------------------------------------

const MONOCHROME_KEYWORDS = new Set([
  'monochrome', 'grayscale', 'black-and-white', 'black-white', 'noir', 'b&w',
  'archival-bw', 'silver-halide', 'greyscale', 'monochromatic', 'achromatic'
]);

const VIBRANT_KEYWORDS = new Set([
  'vibrant', 'saturated', 'hyper-saturated', 'vivid', 'colorful', 'technicolor',
  'pop-of-color', 'punchy', 'rich-color', 'high-saturation', 'neon', 'vividly-colored'
]);

const MUTED_KEYWORDS = new Set([
  'muted', 'desaturated', 'bleach-bypass', 'faded', 'washed-out', 'pale',
  'low-saturation', 'subdued', 'faded-colors', 'matte', 'desaturate'
]);

const SEPIA_DUOTONE_KEYWORDS = new Set([
  'sepia', 'duotone', 'split-tone', 'vintage-tone', 'tinted', 'two-tone',
  'sepia-toned', 'warm-tint', 'amber-tint', 'monochrome-tint'
]);

const NATURAL_CHROMATIC_KEYWORDS = new Set([
  'natural-color', 'realistic-color', 'true-to-life', 'neutral-color',
  'standard-saturation', 'balanced-color', 'accurate-color', 'realistic'
]);

const CHROMATIC_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'agnostic', 'general', 'media', 'clip', 'asset'
]);

const MONOCHROME_INTENT_KEYWORDS = new Set([
  'monochrome', 'grayscale', 'black-and-white', 'noir', 'b&w', 'greyscale', 'black-white'
]);

const VIBRANT_INTENT_KEYWORDS = new Set([
  'vibrant', 'saturated', 'vivid', 'colorful', 'technicolor', 'pop-of-color', 'rich-color'
]);

const MUTED_INTENT_KEYWORDS = new Set([
  'muted', 'desaturated', 'bleach-bypass', 'faded', 'washed-out', 'pale', 'subdued'
]);

const SEPIA_DUOTONE_INTENT_KEYWORDS = new Set([
  'sepia', 'duotone', 'split-tone', 'vintage-tone', 'tinted', 'two-tone'
]);

const NATURAL_INTENT_KEYWORDS = new Set([
  'natural-color', 'realistic-color', 'true-to-life', 'natural', 'realistic'
]);

/**
 * Step 42: Classifies the chromatic saturation & color grading profile of a media asset:
 * - MONOCHROME_GRAYSCALE: Black and white, grayscale, noir, archival B&W
 * - VIBRANT_SATURATED: Highly saturated, vivid colors, technicolor pop, rich hues
 * - MUTED_DESATURATED: Desaturated, bleach bypass, washed-out, subdued/pale palette
 * - WARM_SEPIA_DUOTONE: Sepia-toned, duotone, split-toned, vintage monochrome tint
 * - NATURAL_BALANCED: Realistic true-to-life standard saturation
 * - CHROMATIC_AGNOSTIC: Neutral, standard, or versatile color profile
 */
export function classifyChromaticGrading(candidateAsset: MediaAsset): ChromaticGrading {
  if (!candidateAsset) return 'CHROMATIC_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'CHROMATIC_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let monoCount = 0;
  let vibCount = 0;
  let mutedCount = 0;
  let sepiaCount = 0;
  let naturalCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('black and white') || fullDescText.includes('black & white') || fullDescText.includes('monochrome') || fullDescText.includes('grayscale') || fullDescText.includes('noir style') || fullDescText.includes('silver halide')) {
    monoCount += 3;
  }
  if (fullDescText.includes('vibrant color') || fullDescText.includes('hyper saturated') || fullDescText.includes('vivid colors') || fullDescText.includes('technicolor') || fullDescText.includes('pop of color') || fullDescText.includes('richly saturated') || fullDescText.includes('bursting with color')) {
    vibCount += 3;
  }
  if (fullDescText.includes('muted tones') || fullDescText.includes('bleach bypass') || fullDescText.includes('desaturated palette') || fullDescText.includes('washed out') || fullDescText.includes('faded color') || fullDescText.includes('low saturation') || fullDescText.includes('subdued palette')) {
    mutedCount += 3;
  }
  if (fullDescText.includes('sepia toned') || fullDescText.includes('sepia tone') || fullDescText.includes('vintage sepia') || fullDescText.includes('duotone') || fullDescText.includes('split toned') || fullDescText.includes('two tone tint')) {
    sepiaCount += 3;
  }
  if (fullDescText.includes('natural color') || fullDescText.includes('realistic color') || fullDescText.includes('true to life') || fullDescText.includes('balanced saturation') || fullDescText.includes('accurate color')) {
    naturalCount += 3;
  }

  for (const w of tagList) {
    if (MONOCHROME_KEYWORDS.has(w)) monoCount++;
    if (VIBRANT_KEYWORDS.has(w)) vibCount++;
    if (MUTED_KEYWORDS.has(w)) mutedCount++;
    if (SEPIA_DUOTONE_KEYWORDS.has(w)) sepiaCount++;
    if (NATURAL_CHROMATIC_KEYWORDS.has(w)) naturalCount++;
    if (CHROMATIC_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(monoCount, vibCount, mutedCount, sepiaCount, naturalCount, agnosticCount);

  if (maxCount > 0) {
    if (monoCount === maxCount) return 'MONOCHROME_GRAYSCALE';
    if (vibCount === maxCount) return 'VIBRANT_SATURATED';
    if (mutedCount === maxCount) return 'MUTED_DESATURATED';
    if (sepiaCount === maxCount) return 'WARM_SEPIA_DUOTONE';
    if (naturalCount === maxCount) return 'NATURAL_BALANCED';
    if (agnosticCount === maxCount) return 'CHROMATIC_AGNOSTIC';
  }

  return 'CHROMATIC_AGNOSTIC';
}

/**
 * Step 42: Classifies narration chromatic saturation & color grading intent:
 * - MONOCHROME: in black and white, monochrome, grayscale, noir style, b&w imagery
 * - VIBRANT: vibrant color, vivid hues, saturated, technicolor, pop of color, bursting with color
 * - MUTED: muted tones, desaturated, bleach bypass, washed out, faded colors, subdued
 * - SEPIA_DUOTONE: sepia-toned, vintage sepia, duotone, split-toned, nostalgic tint
 * - NATURAL: natural colors, realistic palette, true to life, standard saturation
 * - NEUTRAL: general narration without chromatic grading cues
 */
export function classifyNarrationChromaticIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): ChromaticIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let monoCount = 0;
  let vibCount = 0;
  let mutedCount = 0;
  let sepiaCount = 0;
  let naturalCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('black and white') || textLower.includes('black & white') || textLower.includes('monochrome') || textLower.includes('grayscale') || textLower.includes('noir style') || textLower.includes('in b&w') || textLower.includes('shades of gray') || textLower.includes('stark monochrome')) {
    monoCount += 3;
  }
  if (textLower.includes('vibrant color') || textLower.includes('bursting with color') || textLower.includes('vivid colors') || textLower.includes('technicolor') || textLower.includes('pop of color') || textLower.includes('richly saturated') || textLower.includes('dazzling hues') || textLower.includes('intensely colorful')) {
    vibCount += 3;
  }
  if (textLower.includes('muted colors') || textLower.includes('bleak and desaturated') || textLower.includes('washed out') || textLower.includes('faded tones') || textLower.includes('low saturation') || textLower.includes('subdued colors') || textLower.includes('bleach bypass') || textLower.includes('pale and drained')) {
    mutedCount += 3;
  }
  if (textLower.includes('sepia-toned') || textLower.includes('sepia toned') || textLower.includes('vintage sepia') || textLower.includes('duotone') || textLower.includes('split-toned') || textLower.includes('warm sepia') || textLower.includes('nostalgic two-tone')) {
    sepiaCount += 3;
  }
  if (textLower.includes('natural color') || textLower.includes('true to life') || textLower.includes('realistic colors') || textLower.includes('accurate tones') || textLower.includes('natural lighting and color')) {
    naturalCount += 3;
  }

  for (const w of words) {
    if (MONOCHROME_INTENT_KEYWORDS.has(w)) monoCount++;
    if (VIBRANT_INTENT_KEYWORDS.has(w)) vibCount++;
    if (MUTED_INTENT_KEYWORDS.has(w)) mutedCount++;
    if (SEPIA_DUOTONE_INTENT_KEYWORDS.has(w)) sepiaCount++;
    if (NATURAL_INTENT_KEYWORDS.has(w)) naturalCount++;
  }

  const maxCount = Math.max(monoCount, vibCount, mutedCount, sepiaCount, naturalCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (monoCount === maxCount) return 'MONOCHROME';
  if (vibCount === maxCount) return 'VIBRANT';
  if (mutedCount === maxCount) return 'MUTED';
  if (sepiaCount === maxCount) return 'SEPIA_DUOTONE';
  if (naturalCount === maxCount) return 'NATURAL';

  return 'NEUTRAL';
}

/**
 * Step 42: Chromatic Saturation & Color Grading Intelligence.
 * Evaluates compatibility between candidate footage color grade/saturation and narration chromatic intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateChromaticModifier(
  candidateGrading: ChromaticGrading,
  narrationIntent: ChromaticIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  chromaticGrading: ChromaticGrading;
  chromaticIntent: ChromaticIntent;
  chromaticMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      chromaticGrading: candidateGrading,
      chromaticIntent: narrationIntent,
      chromaticMatchScore: 0.8,
      reason: 'Consecutive shot continuation - chromatic grading penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'MONOCHROME' && candidateGrading === 'MONOCHROME_GRAYSCALE') ||
      (narrationIntent === 'VIBRANT' && candidateGrading === 'VIBRANT_SATURATED') ||
      (narrationIntent === 'MUTED' && candidateGrading === 'MUTED_DESATURATED') ||
      (narrationIntent === 'SEPIA_DUOTONE' && candidateGrading === 'WARM_SEPIA_DUOTONE') ||
      (narrationIntent === 'NATURAL' && candidateGrading === 'NATURAL_BALANCED')
    ) {
      return {
        modifier: 0.008,
        chromaticGrading: candidateGrading,
        chromaticIntent: narrationIntent,
        chromaticMatchScore: 1.0,
        reason: 'New beat color grading introduction: chromatic saturation matches narration style.',
      };
    }
  }

  let modifier = 0.0;
  let chromaticMatchScore = 0.5;
  let reason = 'Neutral chromatic intent - standard color grading scoring.';

  switch (narrationIntent) {
    case 'MONOCHROME': {
      if (candidateGrading === 'MONOCHROME_GRAYSCALE') {
        modifier = 0.008;
        chromaticMatchScore = 1.0;
        reason = 'Chromatic bonus: monochrome black-and-white grading matches stark noir narrative.';
      } else if (candidateGrading === 'WARM_SEPIA_DUOTONE') {
        modifier = 0.003;
        chromaticMatchScore = 0.7;
        reason = 'Chromatic alignment: sepia duotone provides vintage archival monochrome aesthetic.';
      } else if (candidateGrading === 'MUTED_DESATURATED') {
        modifier = 0.002;
        chromaticMatchScore = 0.6;
        reason = 'Chromatic alignment: desaturated palette compatible with low-saturation monochrome tone.';
      } else if (candidateGrading === 'CHROMATIC_AGNOSTIC' || candidateGrading === 'NATURAL_BALANCED') {
        modifier = 0.0;
        chromaticMatchScore = 0.5;
        reason = 'Chromatic neutral: standard color profile for monochrome narrative.';
      } else if (candidateGrading === 'VIBRANT_SATURATED') {
        modifier = -0.006;
        chromaticMatchScore = 0.15;
        reason = 'Chromatic penalty: hyper-saturated colorful footage clashes with requested black-and-white style.';
      }
      break;
    }
    case 'VIBRANT': {
      if (candidateGrading === 'VIBRANT_SATURATED') {
        modifier = 0.008;
        chromaticMatchScore = 1.0;
        reason = 'Chromatic bonus: rich vibrant saturation matches colorful vivid narrative.';
      } else if (candidateGrading === 'NATURAL_BALANCED') {
        modifier = 0.003;
        chromaticMatchScore = 0.7;
        reason = 'Chromatic alignment: natural balanced color supports vivid presentation.';
      } else if (candidateGrading === 'CHROMATIC_AGNOSTIC') {
        modifier = 0.0;
        chromaticMatchScore = 0.5;
        reason = 'Chromatic neutral: standard color profile for vibrant narrative.';
      } else if (candidateGrading === 'MUTED_DESATURATED') {
        modifier = -0.005;
        chromaticMatchScore = 0.2;
        reason = 'Chromatic penalty: muted desaturated palette lacks requested vibrant saturation.';
      } else if (candidateGrading === 'WARM_SEPIA_DUOTONE') {
        modifier = -0.005;
        chromaticMatchScore = 0.2;
        reason = 'Chromatic penalty: sepia duotone tint restricts full vibrant color spectrum.';
      } else if (candidateGrading === 'MONOCHROME_GRAYSCALE') {
        modifier = -0.006;
        chromaticMatchScore = 0.15;
        reason = 'Chromatic penalty: monochrome grayscale footage completely lacks requested vibrant colors.';
      }
      break;
    }
    case 'MUTED': {
      if (candidateGrading === 'MUTED_DESATURATED') {
        modifier = 0.008;
        chromaticMatchScore = 1.0;
        reason = 'Chromatic bonus: muted desaturated palette matches bleak subdued narrative.';
      } else if (candidateGrading === 'MONOCHROME_GRAYSCALE') {
        modifier = 0.003;
        chromaticMatchScore = 0.7;
        reason = 'Chromatic alignment: monochrome palette supports somber desaturated tone.';
      } else if (candidateGrading === 'WARM_SEPIA_DUOTONE') {
        modifier = 0.002;
        chromaticMatchScore = 0.6;
        reason = 'Chromatic alignment: vintage sepia duotone complements subdued palette.';
      } else if (candidateGrading === 'CHROMATIC_AGNOSTIC' || candidateGrading === 'NATURAL_BALANCED') {
        modifier = 0.0;
        chromaticMatchScore = 0.5;
        reason = 'Chromatic neutral: standard color profile for muted narrative.';
      } else if (candidateGrading === 'VIBRANT_SATURATED') {
        modifier = -0.006;
        chromaticMatchScore = 0.15;
        reason = 'Chromatic penalty: hyper-saturated vivid colors contradict requested muted subdued mood.';
      }
      break;
    }
    case 'SEPIA_DUOTONE': {
      if (candidateGrading === 'WARM_SEPIA_DUOTONE') {
        modifier = 0.008;
        chromaticMatchScore = 1.0;
        reason = 'Chromatic bonus: warm sepia duotone grading matches vintage nostalgic narrative.';
      } else if (candidateGrading === 'MONOCHROME_GRAYSCALE') {
        modifier = 0.003;
        chromaticMatchScore = 0.7;
        reason = 'Chromatic alignment: black-and-white grading provides compatible archival tone.';
      } else if (candidateGrading === 'MUTED_DESATURATED') {
        modifier = 0.002;
        chromaticMatchScore = 0.6;
        reason = 'Chromatic alignment: desaturated tones support nostalgic mood.';
      } else if (candidateGrading === 'CHROMATIC_AGNOSTIC' || candidateGrading === 'NATURAL_BALANCED') {
        modifier = 0.0;
        chromaticMatchScore = 0.5;
        reason = 'Chromatic neutral: standard color profile for sepia duotone narrative.';
      } else if (candidateGrading === 'VIBRANT_SATURATED') {
        modifier = -0.005;
        chromaticMatchScore = 0.2;
        reason = 'Chromatic penalty: modern hyper-saturated colors clash with vintage sepia duotone theme.';
      }
      break;
    }
    case 'NATURAL': {
      if (candidateGrading === 'NATURAL_BALANCED') {
        modifier = 0.008;
        chromaticMatchScore = 1.0;
        reason = 'Chromatic bonus: natural true-to-life color grading matches realistic narrative.';
      } else if (candidateGrading === 'CHROMATIC_AGNOSTIC') {
        modifier = 0.0;
        chromaticMatchScore = 0.5;
        reason = 'Chromatic neutral: versatile color profile for realistic narrative.';
      } else if (candidateGrading === 'VIBRANT_SATURATED') {
        modifier = 0.002;
        chromaticMatchScore = 0.6;
        reason = 'Chromatic alignment: rich color acceptable for natural presentation.';
      } else if (candidateGrading === 'MUTED_DESATURATED') {
        modifier = -0.003;
        chromaticMatchScore = 0.35;
        reason = 'Chromatic mild penalty: washed-out muted palette deviates from true-to-life realism.';
      } else if (candidateGrading === 'WARM_SEPIA_DUOTONE') {
        modifier = -0.004;
        chromaticMatchScore = 0.3;
        reason = 'Chromatic penalty: stylized sepia tint obscures natural realistic color tones.';
      } else if (candidateGrading === 'MONOCHROME_GRAYSCALE') {
        modifier = -0.005;
        chromaticMatchScore = 0.2;
        reason = 'Chromatic penalty: black-and-white monochrome lacks requested natural color spectrum.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      chromaticMatchScore = 0.5;
      reason = 'Neutral chromatic intent - standard color grading scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    chromaticGrading: candidateGrading,
    chromaticIntent: narrationIntent,
    chromaticMatchScore: Math.round(chromaticMatchScore * 1000) / 1000,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Step 43: Action Trajectory & Screen Direction Intelligence Keyword Sets & Functions
// ---------------------------------------------------------------------------

const APPROACHING_KEYWORDS = new Set([
  'approaching', 'coming-forward', 'moving-towards-camera', 'moving-closer', 'advancing',
  'charging-forward', 'heading-towards-lens', 'oncoming', 'forward-motion', 'towards-viewer'
]);

const RECEDING_KEYWORDS = new Set([
  'receding', 'moving-away', 'walking-away', 'retreating', 'departing',
  'distance-fade', 'moving-into-depth', 'heading-away', 'away-from-camera', 'into-distance'
]);

const LEFT_TO_RIGHT_KEYWORDS = new Set([
  'left-to-right', 'ltr', 'crossing-right', 'moving-right', 'sweeping-right',
  'rightward-motion', 'heading-right', 'pan-right-subject', 'crossing-frame-right'
]);

const RIGHT_TO_LEFT_KEYWORDS = new Set([
  'right-to-left', 'rtl', 'crossing-left', 'moving-left', 'sweeping-left',
  'leftward-motion', 'heading-left', 'pan-left-subject', 'crossing-frame-left'
]);

const ROTATIONAL_KEYWORDS = new Set([
  'rotational', 'spinning', 'rotating', 'orbiting', 'turning-around',
  'axial-rotation', 'stationary-motion', '360-turn', 'pirouette', 'revolving'
]);

const TRAJECTORY_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'agnostic', 'general', 'media', 'clip', 'asset'
]);

const APPROACHING_INTENT_KEYWORDS = new Set([
  'approaching', 'coming-forward', 'advancing', 'moving-closer', 'heading-towards'
]);

const RECEDING_INTENT_KEYWORDS = new Set([
  'receding', 'walking-away', 'retreating', 'departing', 'moving-away'
]);

const LEFT_TO_RIGHT_INTENT_KEYWORDS = new Set([
  'left-to-right', 'crossing-right', 'moving-right', 'sweeping-right', 'rightward'
]);

const RIGHT_TO_LEFT_INTENT_KEYWORDS = new Set([
  'right-to-left', 'crossing-left', 'moving-left', 'sweeping-left', 'leftward'
]);

const ROTATIONAL_INTENT_KEYWORDS = new Set([
  'spinning', 'rotating', 'orbiting', 'turning-around', 'revolving'
]);

/**
 * Step 43: Classifies the action trajectory & screen direction of a media asset:
 * - APPROACHING_CAMERA: Subject moving forward towards the camera/viewer
 * - RECEDING_DEPTH: Subject moving away from the camera into the distance
 * - LATERAL_LEFT_TO_RIGHT: Subject/action moving left to right across the 16:9 frame
 * - LATERAL_RIGHT_TO_LEFT: Subject/action moving right to left across the 16:9 frame
 * - ROTATIONAL_AXIAL: Turning in place, axial spin, or orbiting motion
 * - TRAJECTORY_AGNOSTIC: Neutral, non-directional, or stationary footage
 */
export function classifyActionTrajectory(candidateAsset: MediaAsset): ActionTrajectory {
  if (!candidateAsset) return 'TRAJECTORY_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'TRAJECTORY_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let appCount = 0;
  let recCount = 0;
  let ltrCount = 0;
  let rtlCount = 0;
  let rotCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('approaching the camera') || fullDescText.includes('moving towards the camera') || fullDescText.includes('walking towards camera') || fullDescText.includes('coming closer') || fullDescText.includes('advancing forward') || fullDescText.includes('heading towards lens') || fullDescText.includes('rushing towards the screen')) {
    appCount += 3;
  }
  if (fullDescText.includes('walking away') || fullDescText.includes('moving away into the distance') || fullDescText.includes('receding into background') || fullDescText.includes('retreating') || fullDescText.includes('heading away from camera') || fullDescText.includes('departing into distance')) {
    recCount += 3;
  }
  if (fullDescText.includes('left to right') || fullDescText.includes('moving from left to right') || fullDescText.includes('crossing to the right') || fullDescText.includes('sweeping rightwards') || fullDescText.includes('heading right')) {
    ltrCount += 3;
  }
  if (fullDescText.includes('right to left') || fullDescText.includes('moving from right to left') || fullDescText.includes('crossing to the left') || fullDescText.includes('sweeping leftwards') || fullDescText.includes('heading left')) {
    rtlCount += 3;
  }
  if (fullDescText.includes('spinning in place') || fullDescText.includes('rotating on its axis') || fullDescText.includes('orbiting around') || fullDescText.includes('turning around in a circle') || fullDescText.includes('axial rotation') || fullDescText.includes('revolving')) {
    rotCount += 3;
  }

  for (const w of tagList) {
    if (APPROACHING_KEYWORDS.has(w)) appCount++;
    if (RECEDING_KEYWORDS.has(w)) recCount++;
    if (LEFT_TO_RIGHT_KEYWORDS.has(w)) ltrCount++;
    if (RIGHT_TO_LEFT_KEYWORDS.has(w)) rtlCount++;
    if (ROTATIONAL_KEYWORDS.has(w)) rotCount++;
    if (TRAJECTORY_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(appCount, recCount, ltrCount, rtlCount, rotCount, agnosticCount);

  if (maxCount > 0) {
    if (appCount === maxCount) return 'APPROACHING_CAMERA';
    if (recCount === maxCount) return 'RECEDING_DEPTH';
    if (ltrCount === maxCount) return 'LATERAL_LEFT_TO_RIGHT';
    if (rtlCount === maxCount) return 'LATERAL_RIGHT_TO_LEFT';
    if (rotCount === maxCount) return 'ROTATIONAL_AXIAL';
    if (agnosticCount === maxCount) return 'TRAJECTORY_AGNOSTIC';
  }

  return 'TRAJECTORY_AGNOSTIC';
}

/**
 * Step 43: Classifies narration action trajectory & screen direction intent:
 * - APPROACHING: coming towards us, advancing forward, approaching directly, rushing at the screen
 * - RECEDING: walking away, moving away into the distance, retreating, departing into the horizon
 * - LEFT_TO_RIGHT: moving from left to right, crossing to the right, sweeping rightwards, marching to the right
 * - RIGHT_TO_LEFT: moving from right to left, crossing to the left, sweeping leftwards, heading left
 * - ROTATIONAL: spinning in place, rotating on its axis, revolving around, turning in circles
 * - NEUTRAL: general narration without directional movement cues
 */
export function classifyNarrationTrajectoryIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): TrajectoryIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let appCount = 0;
  let recCount = 0;
  let ltrCount = 0;
  let rtlCount = 0;
  let rotCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('coming towards us') || textLower.includes('coming towards the camera') || textLower.includes('advancing forward') || textLower.includes('approaching directly') || textLower.includes('moving closer to us') || textLower.includes('rushing at the screen') || textLower.includes('marching forward')) {
    appCount += 3;
  }
  if (textLower.includes('walking away') || textLower.includes('moving away into the distance') || textLower.includes('retreating into the distance') || textLower.includes('departing into the sunset') || textLower.includes('heading into the horizon') || textLower.includes('leaving into the background')) {
    recCount += 3;
  }
  if (textLower.includes('left to right') || textLower.includes('moving from left to right') || textLower.includes('crossing to the right') || textLower.includes('sweeping rightwards') || textLower.includes('marching to the right') || textLower.includes('heading right')) {
    ltrCount += 3;
  }
  if (textLower.includes('right to left') || textLower.includes('moving from right to left') || textLower.includes('crossing to the left') || textLower.includes('sweeping leftwards') || textLower.includes('returning to the left') || textLower.includes('heading left')) {
    rtlCount += 3;
  }
  if (textLower.includes('spinning in place') || textLower.includes('rotating on its axis') || textLower.includes('turning around in a circle') || textLower.includes('revolving around') || textLower.includes('orbiting continuously')) {
    rotCount += 3;
  }

  for (const w of words) {
    if (APPROACHING_INTENT_KEYWORDS.has(w)) appCount++;
    if (RECEDING_INTENT_KEYWORDS.has(w)) recCount++;
    if (LEFT_TO_RIGHT_INTENT_KEYWORDS.has(w)) ltrCount++;
    if (RIGHT_TO_LEFT_INTENT_KEYWORDS.has(w)) rtlCount++;
    if (ROTATIONAL_INTENT_KEYWORDS.has(w)) rotCount++;
  }

  const maxCount = Math.max(appCount, recCount, ltrCount, rtlCount, rotCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (appCount === maxCount) return 'APPROACHING';
  if (recCount === maxCount) return 'RECEDING';
  if (ltrCount === maxCount) return 'LEFT_TO_RIGHT';
  if (rtlCount === maxCount) return 'RIGHT_TO_LEFT';
  if (rotCount === maxCount) return 'ROTATIONAL';

  return 'NEUTRAL';
}

/**
 * Step 43: Action Trajectory & Screen Direction Intelligence.
 * Evaluates compatibility between candidate footage action vector/screen direction and narration motion trajectory intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateTrajectoryModifier(
  candidateTrajectory: ActionTrajectory,
  narrationIntent: TrajectoryIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  actionTrajectory: ActionTrajectory;
  trajectoryIntent: TrajectoryIntent;
  trajectoryMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      actionTrajectory: candidateTrajectory,
      trajectoryIntent: narrationIntent,
      trajectoryMatchScore: 0.8,
      reason: 'Consecutive shot continuation - action trajectory penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'APPROACHING' && candidateTrajectory === 'APPROACHING_CAMERA') ||
      (narrationIntent === 'RECEDING' && candidateTrajectory === 'RECEDING_DEPTH') ||
      (narrationIntent === 'LEFT_TO_RIGHT' && candidateTrajectory === 'LATERAL_LEFT_TO_RIGHT') ||
      (narrationIntent === 'RIGHT_TO_LEFT' && candidateTrajectory === 'LATERAL_RIGHT_TO_LEFT') ||
      (narrationIntent === 'ROTATIONAL' && candidateTrajectory === 'ROTATIONAL_AXIAL')
    ) {
      return {
        modifier: 0.008,
        actionTrajectory: candidateTrajectory,
        trajectoryIntent: narrationIntent,
        trajectoryMatchScore: 1.0,
        reason: 'New beat motion trajectory introduction: screen direction matches narration momentum.',
      };
    }
  }

  let modifier = 0.0;
  let trajectoryMatchScore = 0.5;
  let reason = 'Neutral trajectory intent - standard motion direction scoring.';

  switch (narrationIntent) {
    case 'APPROACHING': {
      if (candidateTrajectory === 'APPROACHING_CAMERA') {
        modifier = 0.008;
        trajectoryMatchScore = 1.0;
        reason = 'Trajectory bonus: forward oncoming motion matches advancing narration momentum.';
      } else if (candidateTrajectory === 'ROTATIONAL_AXIAL') {
        modifier = 0.002;
        trajectoryMatchScore = 0.6;
        reason = 'Trajectory alignment: rotational dynamic motion compatible with active narrative.';
      } else if (candidateTrajectory === 'LATERAL_LEFT_TO_RIGHT' || candidateTrajectory === 'LATERAL_RIGHT_TO_LEFT') {
        modifier = 0.002;
        trajectoryMatchScore = 0.6;
        reason = 'Trajectory alignment: lateral traversal provides compatible dynamic movement.';
      } else if (candidateTrajectory === 'TRAJECTORY_AGNOSTIC') {
        modifier = 0.0;
        trajectoryMatchScore = 0.5;
        reason = 'Trajectory neutral: standard motion profile for approaching narrative.';
      } else if (candidateTrajectory === 'RECEDING_DEPTH') {
        modifier = -0.006;
        trajectoryMatchScore = 0.15;
        reason = 'Trajectory penalty: receding departure motion contradicts requested oncoming advance.';
      }
      break;
    }
    case 'RECEDING': {
      if (candidateTrajectory === 'RECEDING_DEPTH') {
        modifier = 0.008;
        trajectoryMatchScore = 1.0;
        reason = 'Trajectory bonus: receding motion into depth matches departure/retreat narrative.';
      } else if (candidateTrajectory === 'LATERAL_LEFT_TO_RIGHT' || candidateTrajectory === 'LATERAL_RIGHT_TO_LEFT') {
        modifier = 0.002;
        trajectoryMatchScore = 0.6;
        reason = 'Trajectory alignment: lateral movement compatible with travelling context.';
      } else if (candidateTrajectory === 'TRAJECTORY_AGNOSTIC') {
        modifier = 0.0;
        trajectoryMatchScore = 0.5;
        reason = 'Trajectory neutral: standard motion profile for receding narrative.';
      } else if (candidateTrajectory === 'APPROACHING_CAMERA') {
        modifier = -0.006;
        trajectoryMatchScore = 0.15;
        reason = 'Trajectory penalty: oncoming forward motion contradicts requested receding departure.';
      }
      break;
    }
    case 'LEFT_TO_RIGHT': {
      if (candidateTrajectory === 'LATERAL_LEFT_TO_RIGHT') {
        modifier = 0.008;
        trajectoryMatchScore = 1.0;
        reason = 'Trajectory bonus: left-to-right screen direction matches requested forward traversal.';
      } else if (candidateTrajectory === 'APPROACHING_CAMERA') {
        modifier = 0.002;
        trajectoryMatchScore = 0.6;
        reason = 'Trajectory alignment: forward motion supports advancing narrative.';
      } else if (candidateTrajectory === 'TRAJECTORY_AGNOSTIC') {
        modifier = 0.0;
        trajectoryMatchScore = 0.5;
        reason = 'Trajectory neutral: standard motion profile for left-to-right narrative.';
      } else if (candidateTrajectory === 'LATERAL_RIGHT_TO_LEFT') {
        modifier = -0.006;
        trajectoryMatchScore = 0.15;
        reason = 'Trajectory penalty: right-to-left movement contradicts requested left-to-right screen direction.';
      }
      break;
    }
    case 'RIGHT_TO_LEFT': {
      if (candidateTrajectory === 'LATERAL_RIGHT_TO_LEFT') {
        modifier = 0.008;
        trajectoryMatchScore = 1.0;
        reason = 'Trajectory bonus: right-to-left screen direction matches requested returning traversal.';
      } else if (candidateTrajectory === 'RECEDING_DEPTH') {
        modifier = 0.002;
        trajectoryMatchScore = 0.6;
        reason = 'Trajectory alignment: receding depth supports returning motion.';
      } else if (candidateTrajectory === 'TRAJECTORY_AGNOSTIC') {
        modifier = 0.0;
        trajectoryMatchScore = 0.5;
        reason = 'Trajectory neutral: standard motion profile for right-to-left narrative.';
      } else if (candidateTrajectory === 'LATERAL_LEFT_TO_RIGHT') {
        modifier = -0.006;
        trajectoryMatchScore = 0.15;
        reason = 'Trajectory penalty: left-to-right movement contradicts requested right-to-left screen direction.';
      }
      break;
    }
    case 'ROTATIONAL': {
      if (candidateTrajectory === 'ROTATIONAL_AXIAL') {
        modifier = 0.008;
        trajectoryMatchScore = 1.0;
        reason = 'Trajectory bonus: rotational axial motion matches spinning/revolving narrative.';
      } else if (candidateTrajectory === 'APPROACHING_CAMERA' || candidateTrajectory === 'RECEDING_DEPTH') {
        modifier = 0.002;
        trajectoryMatchScore = 0.6;
        reason = 'Trajectory alignment: axial depth motion compatible with rotational dynamics.';
      } else if (candidateTrajectory === 'TRAJECTORY_AGNOSTIC') {
        modifier = 0.0;
        trajectoryMatchScore = 0.5;
        reason = 'Trajectory neutral: standard motion profile for rotational narrative.';
      } else if (candidateTrajectory === 'LATERAL_LEFT_TO_RIGHT' || candidateTrajectory === 'LATERAL_RIGHT_TO_LEFT') {
        modifier = -0.004;
        trajectoryMatchScore = 0.3;
        reason = 'Trajectory penalty: linear lateral traversal diverges from requested rotational focus.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      trajectoryMatchScore = 0.5;
      reason = 'Neutral trajectory intent - standard motion direction scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    actionTrajectory: candidateTrajectory,
    trajectoryIntent: narrationIntent,
    trajectoryMatchScore: Math.round(trajectoryMatchScore * 1000) / 1000,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Step 44: Optical Lens & Focal Perspective Intelligence Keywords & Helpers
// ---------------------------------------------------------------------------

const FISHEYE_KEYWORDS = new Set([
  'fisheye', 'ultra-wide', 'ultrawide', 'barrel-distortion', 'action-cam', 'gopro',
  'curvilinear', 'panoramic-curve', '180-degree', 'bubble-lens', 'distorted-wide'
]);

const WIDE_ANGLE_KEYWORDS = new Set([
  'wide-angle', 'wide-lens', 'expansive', 'environmental', 'broad-view', 'sweeping-view',
  'architectural-lens', 'panoramic-view', 'vast-angle', '24mm', '16mm', 'wide-field'
]);

const STANDARD_NORMAL_KEYWORDS = new Set([
  'standard-lens', 'normal-lens', '50mm', 'human-eye', 'distortion-free', 'natural-perspective',
  'documentary-standard', 'rectilinear', '35mm', 'uncompressed', 'standard-focal'
]);

const TELEPHOTO_KEYWORDS = new Set([
  'telephoto', 'compressed-depth', 'long-lens', 'zoom-lens', 'distant-reach', 'compression',
  'telephoto-reach', '70-200mm', '300mm', 'spatial-compression', 'super-telephoto', 'compressed-background'
]);

const MACRO_KEYWORDS = new Set([
  'macro', 'microscopic', 'probe-lens', 'extreme-magnification', 'close-focus', 'magnified',
  'cellular', 'insect-scale', 'micro-detail', '100mm-macro', 'micro'
]);

const LENS_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'standard', 'general', 'clip', 'footage', 'stock', 'video', 'photo'
]);

const LENS_FISHEYE_INTENT_KEYWORDS = new Set([
  'fisheye', 'ultra-wide', 'ultrawide', 'action-cam', 'barrel-distortion', 'curvilinear', '360-view'
]);

const LENS_WIDE_INTENT_KEYWORDS = new Set([
  'wide-angle', 'expansive-view', 'broad-field', 'sweeping-expanse', 'wide-perspective', 'environmental-view', 'panoramic'
]);

const LENS_NORMAL_INTENT_KEYWORDS = new Set([
  'natural-perspective', 'human-eye', 'standard-lens', 'true-to-life', 'undistorted', 'documentary-perspective'
]);

const LENS_TELEPHOTO_INTENT_KEYWORDS = new Set([
  'telephoto', 'compressed-distance', 'long-lens', 'compressed-background', 'distant-observation', 'zoomed-in-distance'
]);

const LENS_MACRO_INTENT_KEYWORDS = new Set([
  'microscopic', 'macro-lens', 'extreme-magnification', 'magnified-detail', 'cellular-level', 'micro-scale'
]);

/**
 * Step 44: Classifies the optical lens & focal perspective of a media asset:
 * - FISHEYE_ULTRAWIDE: Extreme barrel distortion, action cam, curvilinear wide
 * - WIDE_ANGLE_EXPANSIVE: Broad environmental field of view, wide rectilinear lens
 * - STANDARD_NORMAL: 50mm human-eye proportion, distortion-free documentary realism
 * - TELEPHOTO_COMPRESSED: Long lens spatial compression, distant reach, flattened perspective
 * - MACRO_MICROSCOPIC: Extreme close-focus magnification, probe lens, cellular/insect scale
 * - LENS_AGNOSTIC: General footage without distinct optical lens character
 */
export function classifyOpticalLensPerspective(candidateAsset: MediaAsset): OpticalLensPerspective {
  if (!candidateAsset) return 'LENS_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'LENS_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let fisheyeCount = 0;
  let wideCount = 0;
  let normalCount = 0;
  let teleCount = 0;
  let macroCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('fisheye lens') || fullDescText.includes('ultra wide angle') || fullDescText.includes('action camera') || fullDescText.includes('barrel distortion') || fullDescText.includes('curvilinear perspective') || fullDescText.includes('gopro style')) {
    fisheyeCount += 3;
  }
  if (fullDescText.includes('wide angle lens') || fullDescText.includes('expansive field of view') || fullDescText.includes('sweeping wide perspective') || fullDescText.includes('environmental wide') || fullDescText.includes('vast expansive view')) {
    wideCount += 3;
  }
  if (fullDescText.includes('standard 50mm') || fullDescText.includes('human eye perspective') || fullDescText.includes('natural undistorted') || fullDescText.includes('true to life proportion') || fullDescText.includes('documentary standard lens')) {
    normalCount += 3;
  }
  if (fullDescText.includes('telephoto lens') || fullDescText.includes('compressed background') || fullDescText.includes('long focal length') || fullDescText.includes('compressed depth') || fullDescText.includes('distant telephoto reach') || fullDescText.includes('telephoto compression')) {
    teleCount += 3;
  }
  if (fullDescText.includes('macro lens') || fullDescText.includes('microscopic detail') || fullDescText.includes('probe lens') || fullDescText.includes('extreme magnification') || fullDescText.includes('cellular level view') || fullDescText.includes('micro detail')) {
    macroCount += 3;
  }

  for (const w of tagList) {
    if (FISHEYE_KEYWORDS.has(w)) fisheyeCount++;
    if (WIDE_ANGLE_KEYWORDS.has(w)) wideCount++;
    if (STANDARD_NORMAL_KEYWORDS.has(w)) normalCount++;
    if (TELEPHOTO_KEYWORDS.has(w)) teleCount++;
    if (MACRO_KEYWORDS.has(w)) macroCount++;
    if (LENS_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(fisheyeCount, wideCount, normalCount, teleCount, macroCount, agnosticCount);

  if (maxCount > 0) {
    if (fisheyeCount === maxCount) return 'FISHEYE_ULTRAWIDE';
    if (wideCount === maxCount) return 'WIDE_ANGLE_EXPANSIVE';
    if (normalCount === maxCount) return 'STANDARD_NORMAL';
    if (teleCount === maxCount) return 'TELEPHOTO_COMPRESSED';
    if (macroCount === maxCount) return 'MACRO_MICROSCOPIC';
    if (agnosticCount === maxCount) return 'LENS_AGNOSTIC';
  }

  return 'LENS_AGNOSTIC';
}

/**
 * Step 44: Classifies narration optical lens & focal perspective intent:
 * - FISHEYE: fisheye lens, ultra wide angle, action cam, barrel distortion
 * - WIDE: wide angle, expansive view, sweeping expanse, broad field of view
 * - NORMAL: natural perspective, human eye view, standard lens, true to life proportion
 * - TELEPHOTO: telephoto lens, compressed background, long lens observation, distant compressed view
 * - MACRO: macro lens, microscopic view, magnified detail, cellular scale
 * - NEUTRAL: general narration without optical lens cues
 */
export function classifyNarrationLensIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): LensIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let fisheyeCount = 0;
  let wideCount = 0;
  let normalCount = 0;
  let teleCount = 0;
  let macroCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('fisheye lens') || textLower.includes('ultra wide angle') || textLower.includes('action cam') || textLower.includes('distorted wide perspective') || textLower.includes('barrel distortion')) {
    fisheyeCount += 3;
  }
  if (textLower.includes('wide angle') || textLower.includes('expansive view') || textLower.includes('sweeping expanse') || textLower.includes('broad field of view') || textLower.includes('wide perspective')) {
    wideCount += 3;
  }
  if (textLower.includes('natural perspective') || textLower.includes('human eye view') || textLower.includes('standard lens') || textLower.includes('true to life proportion') || textLower.includes('documentary style view')) {
    normalCount += 3;
  }
  if (textLower.includes('telephoto lens') || textLower.includes('compressed background') || textLower.includes('long lens observation') || textLower.includes('distant compressed view') || textLower.includes('compressed distance')) {
    teleCount += 3;
  }
  if (textLower.includes('macro lens') || textLower.includes('microscopic view') || textLower.includes('magnified detail') || textLower.includes('extreme close up examination') || textLower.includes('cellular scale')) {
    macroCount += 3;
  }

  for (const w of words) {
    if (LENS_FISHEYE_INTENT_KEYWORDS.has(w)) fisheyeCount++;
    if (LENS_WIDE_INTENT_KEYWORDS.has(w)) wideCount++;
    if (LENS_NORMAL_INTENT_KEYWORDS.has(w)) normalCount++;
    if (LENS_TELEPHOTO_INTENT_KEYWORDS.has(w)) teleCount++;
    if (LENS_MACRO_INTENT_KEYWORDS.has(w)) macroCount++;
  }

  const maxCount = Math.max(fisheyeCount, wideCount, normalCount, teleCount, macroCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (fisheyeCount === maxCount) return 'FISHEYE';
  if (wideCount === maxCount) return 'WIDE';
  if (normalCount === maxCount) return 'NORMAL';
  if (teleCount === maxCount) return 'TELEPHOTO';
  if (macroCount === maxCount) return 'MACRO';

  return 'NEUTRAL';
}

/**
 * Step 44: Optical Lens & Focal Perspective Intelligence.
 * Evaluates compatibility between candidate footage optical lens character and narration focal perspective intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateLensModifier(
  candidateLens: OpticalLensPerspective,
  narrationIntent: LensIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  lensPerspective: OpticalLensPerspective;
  lensIntent: LensIntent;
  lensMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      lensPerspective: candidateLens,
      lensIntent: narrationIntent,
      lensMatchScore: 0.8,
      reason: 'Consecutive shot continuation - optical lens perspective penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'FISHEYE' && candidateLens === 'FISHEYE_ULTRAWIDE') ||
      (narrationIntent === 'WIDE' && candidateLens === 'WIDE_ANGLE_EXPANSIVE') ||
      (narrationIntent === 'NORMAL' && candidateLens === 'STANDARD_NORMAL') ||
      (narrationIntent === 'TELEPHOTO' && candidateLens === 'TELEPHOTO_COMPRESSED') ||
      (narrationIntent === 'MACRO' && candidateLens === 'MACRO_MICROSCOPIC')
    ) {
      return {
        modifier: 0.008,
        lensPerspective: candidateLens,
        lensIntent: narrationIntent,
        lensMatchScore: 1.0,
        reason: 'New beat optical lens introduction: lens perspective establishes required focal scale.',
      };
    }
  }

  let modifier = 0.0;
  let lensMatchScore = 0.5;
  let reason = 'Neutral optical lens intent - standard focal perspective scoring.';

  switch (narrationIntent) {
    case 'FISHEYE': {
      if (candidateLens === 'FISHEYE_ULTRAWIDE') {
        modifier = 0.008;
        lensMatchScore = 1.0;
        reason = 'Lens bonus: ultra-wide fisheye barrel distortion matches dynamic action-cam narrative.';
      } else if (candidateLens === 'WIDE_ANGLE_EXPANSIVE') {
        modifier = 0.003;
        lensMatchScore = 0.7;
        reason = 'Lens alignment: wide rectilinear lens compatible with expansive action context.';
      } else if (candidateLens === 'LENS_AGNOSTIC') {
        modifier = 0.0;
        lensMatchScore = 0.5;
        reason = 'Lens neutral: standard focal profile for fisheye narrative.';
      } else if (candidateLens === 'STANDARD_NORMAL') {
        modifier = -0.003;
        lensMatchScore = 0.35;
        reason = 'Lens penalty: standard perspective lacks requested ultra-wide dynamic distortion.';
      } else if (candidateLens === 'TELEPHOTO_COMPRESSED' || candidateLens === 'MACRO_MICROSCOPIC') {
        modifier = -0.006;
        lensMatchScore = 0.15;
        reason = 'Lens penalty: compressed/magnified focal view contradicts requested ultra-wide action perspective.';
      }
      break;
    }
    case 'WIDE': {
      if (candidateLens === 'WIDE_ANGLE_EXPANSIVE') {
        modifier = 0.008;
        lensMatchScore = 1.0;
        reason = 'Lens bonus: expansive wide-angle perspective matches sweeping environmental narrative.';
      } else if (candidateLens === 'FISHEYE_ULTRAWIDE') {
        modifier = 0.003;
        lensMatchScore = 0.7;
        reason = 'Lens alignment: ultra-wide perspective supports sweeping spatial coverage.';
      } else if (candidateLens === 'STANDARD_NORMAL') {
        modifier = 0.002;
        lensMatchScore = 0.6;
        reason = 'Lens alignment: standard normal lens provides clean compatible view.';
      } else if (candidateLens === 'LENS_AGNOSTIC') {
        modifier = 0.0;
        lensMatchScore = 0.5;
        reason = 'Lens neutral: standard focal profile for wide-angle narrative.';
      } else if (candidateLens === 'TELEPHOTO_COMPRESSED') {
        modifier = -0.005;
        lensMatchScore = 0.2;
        reason = 'Lens penalty: compressed telephoto view contradicts requested wide expansive environment.';
      } else if (candidateLens === 'MACRO_MICROSCOPIC') {
        modifier = -0.006;
        lensMatchScore = 0.15;
        reason = 'Lens penalty: extreme macro magnification contradicts requested sweeping wide vista.';
      }
      break;
    }
    case 'NORMAL': {
      if (candidateLens === 'STANDARD_NORMAL') {
        modifier = 0.008;
        lensMatchScore = 1.0;
        reason = 'Lens bonus: natural 50mm human-eye perspective matches documentary realism narrative.';
      } else if (candidateLens === 'WIDE_ANGLE_EXPANSIVE') {
        modifier = 0.002;
        lensMatchScore = 0.6;
        reason = 'Lens alignment: wide environmental lens provides clean unexaggerated perspective.';
      } else if (candidateLens === 'TELEPHOTO_COMPRESSED') {
        modifier = 0.002;
        lensMatchScore = 0.6;
        reason = 'Lens alignment: moderate telephoto focal length provides flattering standard perspective.';
      } else if (candidateLens === 'LENS_AGNOSTIC') {
        modifier = 0.0;
        lensMatchScore = 0.5;
        reason = 'Lens neutral: standard focal profile for normal perspective narrative.';
      } else if (candidateLens === 'FISHEYE_ULTRAWIDE') {
        modifier = -0.005;
        lensMatchScore = 0.2;
        reason = 'Lens penalty: fisheye barrel distortion contradicts requested natural documentary perspective.';
      } else if (candidateLens === 'MACRO_MICROSCOPIC') {
        modifier = -0.004;
        lensMatchScore = 0.3;
        reason = 'Lens penalty: microscopic magnification diverges from standard human-scale view.';
      }
      break;
    }
    case 'TELEPHOTO': {
      if (candidateLens === 'TELEPHOTO_COMPRESSED') {
        modifier = 0.008;
        lensMatchScore = 1.0;
        reason = 'Lens bonus: compressed telephoto perspective matches distant observation narrative.';
      } else if (candidateLens === 'STANDARD_NORMAL') {
        modifier = 0.002;
        lensMatchScore = 0.6;
        reason = 'Lens alignment: standard focal length provides clean isolated observation.';
      } else if (candidateLens === 'MACRO_MICROSCOPIC') {
        modifier = 0.002;
        lensMatchScore = 0.6;
        reason = 'Lens alignment: high magnification lens compatible with tight focused observation.';
      } else if (candidateLens === 'LENS_AGNOSTIC') {
        modifier = 0.0;
        lensMatchScore = 0.5;
        reason = 'Lens neutral: standard focal profile for telephoto narrative.';
      } else if (candidateLens === 'WIDE_ANGLE_EXPANSIVE') {
        modifier = -0.005;
        lensMatchScore = 0.2;
        reason = 'Lens penalty: expansive wide angle contradicts requested distant telephoto compression.';
      } else if (candidateLens === 'FISHEYE_ULTRAWIDE') {
        modifier = -0.006;
        lensMatchScore = 0.15;
        reason = 'Lens penalty: ultra-wide distorted perspective contradicts requested compressed telephoto focus.';
      }
      break;
    }
    case 'MACRO': {
      if (candidateLens === 'MACRO_MICROSCOPIC') {
        modifier = 0.008;
        lensMatchScore = 1.0;
        reason = 'Lens bonus: microscopic macro magnification matches detailed close-examination narrative.';
      } else if (candidateLens === 'TELEPHOTO_COMPRESSED') {
        modifier = 0.002;
        lensMatchScore = 0.6;
        reason = 'Lens alignment: long telephoto reach provides compatible tight subject isolation.';
      } else if (candidateLens === 'LENS_AGNOSTIC') {
        modifier = 0.0;
        lensMatchScore = 0.5;
        reason = 'Lens neutral: standard focal profile for macro narrative.';
      } else if (candidateLens === 'STANDARD_NORMAL') {
        modifier = -0.004;
        lensMatchScore = 0.3;
        reason = 'Lens penalty: standard perspective lacks requested microscopic level detail.';
      } else if (candidateLens === 'WIDE_ANGLE_EXPANSIVE' || candidateLens === 'FISHEYE_ULTRAWIDE') {
        modifier = -0.006;
        lensMatchScore = 0.15;
        reason = 'Lens penalty: wide expansive perspective contradicts requested microscopic close-up detail.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      lensMatchScore = 0.5;
      reason = 'Neutral optical lens intent - standard focal perspective scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    lensPerspective: candidateLens,
    lensIntent: narrationIntent,
    lensMatchScore: Math.round(lensMatchScore * 1000) / 1000,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Step 45: Visual Texture & Surface Quality Intelligence Keywords & Helpers
// ---------------------------------------------------------------------------

const TEXTURE_PRISTINE_KEYWORDS = new Set([
  'pristine', 'clean-sensor', 'razor-sharp', 'noise-free', '4k-clarity', 'crystal-clear',
  'digital-clean', 'smooth-texture', 'ultra-sharp', 'immaculate', 'flawless'
]);

const TEXTURE_FILM_GRAIN_KEYWORDS = new Set([
  'film-grain', '35mm-grain', '16mm-grain', 'celluloid', 'photochemical', 'emulsion',
  'silver-halide', 'organic-grain', 'analog-film', 'film-stock', 'grainy'
]);

const TEXTURE_ANALOG_VHS_KEYWORDS = new Set([
  'vhs', 'vhs-tape', 'analog-glitch', 'crt-scanlines', 'magnetic-tracking', 'tape-noise',
  'camcorder', 'retro-tape', 'analog-artifacts', 'cassette-look', 'glitch-texture'
]);

const TEXTURE_GRITTY_NOISE_KEYWORDS = new Set([
  'gritty', 'high-iso', 'sensor-noise', 'rough-texture', 'industrial-grit', 'heavy-noise',
  'grungy', 'raw-grain', 'tactile-grit', 'coarse-grain', 'heavy-grit'
]);

const TEXTURE_DIFFUSION_GLOW_KEYWORDS = new Set([
  'pro-mist', 'diffusion-filter', 'halation', 'bloom-glow', 'ethereal-glow', 'specular-bloom',
  'dreamy-glow', 'soft-diffusion', 'hazy-glow', 'romantic-glow', 'mist-glow'
]);

const TEXTURE_AGNOSTIC_KEYWORDS = new Set([
  'neutral', 'standard', 'general', 'clip', 'footage', 'stock', 'video', 'photo'
]);

const TEXTURE_PRISTINE_INTENT_KEYWORDS = new Set([
  'crystal-clear', 'razor-sharp', 'ultra-clean', 'noise-free', 'pristine-digital', 'immaculate-clarity'
]);

const TEXTURE_FILM_GRAIN_INTENT_KEYWORDS = new Set([
  'film-grain', '35mm-film', 'celluloid-texture', 'organic-grain', 'photochemical-look', 'cinematic-film'
]);

const TEXTURE_ANALOG_VHS_INTENT_KEYWORDS = new Set([
  'vhs-tape', 'analog-glitch', 'scanlines', 'retro-tape', 'analog-noise', 'camcorder-tape'
]);

const TEXTURE_GRITTY_NOISE_INTENT_KEYWORDS = new Set([
  'gritty-texture', 'rough-grit', 'raw-noise', 'industrial-grit', 'high-iso-noise', 'coarse-texture'
]);

const TEXTURE_DIFFUSION_GLOW_INTENT_KEYWORDS = new Set([
  'pro-mist', 'ethereal-glow', 'halation-bloom', 'dreamy-glow', 'soft-diffusion', 'romantic-haze'
]);

/**
 * Step 45: Classifies the visual texture & surface quality of a media asset:
 * - CLEAN_PRISTINE_DIGITAL: Razor sharp, noise-free, crystal clear digital sensor
 * - ORGANIC_FILM_GRAIN: Authentic 35mm/16mm celluloid film grain, photochemical texture
 * - VINTAGE_ANALOG_VHS: Retro VHS tape artifacts, CRT scanlines, analog tracking glitch
 * - GRITTY_TEXTURED_NOISE: High ISO noise, industrial grit, coarse tactile surface
 * - ETHEREAL_DIFFUSION_GLOW: Pro-mist filter, halation bloom, dreamy specular glow
 * - TEXTURE_AGNOSTIC: General footage without distinct surface texture or grain character
 */
export function classifyVisualTexture(candidateAsset: MediaAsset): VisualTexture {
  if (!candidateAsset) return 'TEXTURE_AGNOSTIC';

  if (!candidateAsset.analysis || candidateAsset.analysis.analyzed !== true) {
    return 'TEXTURE_AGNOSTIC';
  }

  const words = new Set<string>();

  // Extract from tags
  const allTags = [
    ...(candidateAsset.analysis?.tags || []),
    ...(candidateAsset.analysis?.semantic?.tags || []),
  ];
  for (const tag of allTags) {
    const tokens = tag.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
    for (const t of tokens) {
      if (t.length >= 2) words.add(t);
    }
  }

  // Extract from descriptions
  const descriptions = [
    candidateAsset.analysis?.description,
    candidateAsset.analysis?.semantic?.description,
    candidateAsset.analysis?.semantic?.temporalSummary,
    candidateAsset.name,
  ];
  let fullDescText = '';
  for (const desc of descriptions) {
    if (desc) {
      fullDescText += ' ' + desc.toLowerCase();
      const tokens = desc.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
      for (const t of tokens) {
        if (t.length >= 2) words.add(t);
      }
    }
  }

  // Keyframes
  if (candidateAsset.analysis?.keyframes) {
    for (const kf of candidateAsset.analysis.keyframes) {
      if (kf.tags) {
        for (const t of kf.tags) {
          const tokens = t.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
          for (const token of tokens) {
            if (token.length >= 2) words.add(token);
          }
        }
      }
      if (kf.description) {
        fullDescText += ' ' + kf.description.toLowerCase();
        const tokens = kf.description.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/);
        for (const token of tokens) {
          if (token.length >= 2) words.add(token);
        }
      }
    }
  }

  const tagList = Array.from(words);

  let pristineCount = 0;
  let grainCount = 0;
  let vhsCount = 0;
  let grittyCount = 0;
  let glowCount = 0;
  let agnosticCount = 0;

  if (fullDescText.includes('crystal clear') || fullDescText.includes('noise free') || fullDescText.includes('razor sharp digital') || fullDescText.includes('pristine 4k') || fullDescText.includes('ultra clean digital') || fullDescText.includes('smooth digital clarity')) {
    pristineCount += 3;
  }
  if (fullDescText.includes('35mm film grain') || fullDescText.includes('16mm film') || fullDescText.includes('organic celluloid') || fullDescText.includes('film emulsion texture') || fullDescText.includes('photochemical grain') || fullDescText.includes('authentic film grain')) {
    grainCount += 3;
  }
  if (fullDescText.includes('vhs tape') || fullDescText.includes('crt scanlines') || fullDescText.includes('analog tape tracking') || fullDescText.includes('magnetic cassette glitch') || fullDescText.includes('retro 90s camcorder') || fullDescText.includes('vhs artifacts')) {
    vhsCount += 3;
  }
  if (fullDescText.includes('gritty texture') || fullDescText.includes('high iso noise') || fullDescText.includes('rough tactile surface') || fullDescText.includes('raw industrial grit') || fullDescText.includes('heavy sensor noise') || fullDescText.includes('coarse grainy texture')) {
    grittyCount += 3;
  }
  if (fullDescText.includes('pro mist filter') || fullDescText.includes('halation bloom') || fullDescText.includes('ethereal soft glow') || fullDescText.includes('dreamy specular haze') || fullDescText.includes('soft diffusion glow') || fullDescText.includes('romantic mist glow')) {
    glowCount += 3;
  }

  for (const w of tagList) {
    if (TEXTURE_PRISTINE_KEYWORDS.has(w)) pristineCount++;
    if (TEXTURE_FILM_GRAIN_KEYWORDS.has(w)) grainCount++;
    if (TEXTURE_ANALOG_VHS_KEYWORDS.has(w)) vhsCount++;
    if (TEXTURE_GRITTY_NOISE_KEYWORDS.has(w)) grittyCount++;
    if (TEXTURE_DIFFUSION_GLOW_KEYWORDS.has(w)) glowCount++;
    if (TEXTURE_AGNOSTIC_KEYWORDS.has(w)) agnosticCount++;
  }

  const maxCount = Math.max(pristineCount, grainCount, vhsCount, grittyCount, glowCount, agnosticCount);

  if (maxCount > 0) {
    if (pristineCount === maxCount) return 'CLEAN_PRISTINE_DIGITAL';
    if (grainCount === maxCount) return 'ORGANIC_FILM_GRAIN';
    if (vhsCount === maxCount) return 'VINTAGE_ANALOG_VHS';
    if (grittyCount === maxCount) return 'GRITTY_TEXTURED_NOISE';
    if (glowCount === maxCount) return 'ETHEREAL_DIFFUSION_GLOW';
    if (agnosticCount === maxCount) return 'TEXTURE_AGNOSTIC';
  }

  return 'TEXTURE_AGNOSTIC';
}

/**
 * Step 45: Classifies narration visual texture & surface quality intent:
 * - PRISTINE_DIGITAL: crystal clear, razor sharp, noise free, ultra-clean
 * - FILM_GRAIN: film grain, 35mm film, celluloid texture, organic grain, photochemical
 * - ANALOG_VHS: vhs tape, analog glitch, crt scanlines, retro tape, camcorder
 * - GRITTY_NOISE: gritty texture, rough grit, raw noise, industrial grit, high ISO
 * - DIFFUSION_GLOW: pro mist, ethereal glow, halation bloom, dreamy soft haze
 * - NEUTRAL: general narration without visual texture cues
 */
export function classifyNarrationTextureIntent(
  narrationText: string = '',
  narrationRole?: NarrationRole
): TextureIntent {
  const textLower = (narrationText || '').toLowerCase();
  const words = textLower
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0 && !narrationRole) {
    return 'NEUTRAL';
  }

  let pristineCount = 0;
  let grainCount = 0;
  let vhsCount = 0;
  let grittyCount = 0;
  let glowCount = 0;

  // Multi-word phrase checks
  if (textLower.includes('crystal clear') || textLower.includes('razor sharp') || textLower.includes('noise free') || textLower.includes('pristine digital clarity') || textLower.includes('immaculate digital view')) {
    pristineCount += 3;
  }
  if (textLower.includes('film grain') || textLower.includes('35mm film') || textLower.includes('celluloid texture') || textLower.includes('organic grain') || textLower.includes('photochemical aesthetic')) {
    grainCount += 3;
  }
  if (textLower.includes('vhs tape') || textLower.includes('analog glitch') || textLower.includes('crt scanlines') || textLower.includes('retro tape tracking') || textLower.includes('vintage camcorder')) {
    vhsCount += 3;
  }
  if (textLower.includes('gritty texture') || textLower.includes('rough grit') || textLower.includes('raw industrial noise') || textLower.includes('unpolished coarse grain') || textLower.includes('heavy sensor noise') || textLower.includes('coarse grainy texture') || textLower.includes('coarse grain')) {
    grittyCount += 3;
  }
  if (textLower.includes('pro mist') || textLower.includes('ethereal glow') || textLower.includes('halation bloom') || textLower.includes('dreamy soft haze') || textLower.includes('romantic glow')) {
    glowCount += 3;
  }

  for (const w of words) {
    if (TEXTURE_PRISTINE_INTENT_KEYWORDS.has(w)) pristineCount++;
    if (TEXTURE_FILM_GRAIN_INTENT_KEYWORDS.has(w)) grainCount++;
    if (TEXTURE_ANALOG_VHS_INTENT_KEYWORDS.has(w)) vhsCount++;
    if (TEXTURE_GRITTY_NOISE_INTENT_KEYWORDS.has(w)) grittyCount++;
    if (TEXTURE_DIFFUSION_GLOW_INTENT_KEYWORDS.has(w)) glowCount++;
  }

  const maxCount = Math.max(pristineCount, grainCount, vhsCount, grittyCount, glowCount);
  if (maxCount === 0) return 'NEUTRAL';

  if (pristineCount === maxCount) return 'PRISTINE_DIGITAL';
  if (grainCount === maxCount) return 'FILM_GRAIN';
  if (vhsCount === maxCount) return 'ANALOG_VHS';
  if (grittyCount === maxCount) return 'GRITTY_NOISE';
  if (glowCount === maxCount) return 'DIFFUSION_GLOW';

  return 'NEUTRAL';
}

/**
 * Step 45: Visual Texture & Surface Quality Intelligence.
 * Evaluates compatibility between candidate footage visual texture character and narration surface quality intent.
 * Strictly bounded in [-0.008, +0.008].
 */
export function calculateTextureModifier(
  candidateTexture: VisualTexture,
  narrationIntent: TextureIntent,
  isConsecutiveContinuation: boolean = false,
  narrationBeatType?: NarrationBeatType
): {
  modifier: number;
  visualTexture: VisualTexture;
  textureIntent: TextureIntent;
  textureMatchScore: number;
  reason: string;
} {
  // Waive any penalties for consecutive continuation of same source
  if (isConsecutiveContinuation) {
    return {
      modifier: 0.0,
      visualTexture: candidateTexture,
      textureIntent: narrationIntent,
      textureMatchScore: 0.8,
      reason: 'Consecutive shot continuation - visual texture penalties waived.',
    };
  }

  // Handle Beat Transitions
  if (narrationBeatType === 'NEW_BEAT' && narrationIntent !== 'NEUTRAL') {
    if (
      (narrationIntent === 'PRISTINE_DIGITAL' && candidateTexture === 'CLEAN_PRISTINE_DIGITAL') ||
      (narrationIntent === 'FILM_GRAIN' && candidateTexture === 'ORGANIC_FILM_GRAIN') ||
      (narrationIntent === 'ANALOG_VHS' && candidateTexture === 'VINTAGE_ANALOG_VHS') ||
      (narrationIntent === 'GRITTY_NOISE' && candidateTexture === 'GRITTY_TEXTURED_NOISE') ||
      (narrationIntent === 'DIFFUSION_GLOW' && candidateTexture === 'ETHEREAL_DIFFUSION_GLOW')
    ) {
      return {
        modifier: 0.008,
        visualTexture: candidateTexture,
        textureIntent: narrationIntent,
        textureMatchScore: 1.0,
        reason: 'New beat visual texture introduction: surface quality establishes tactile atmosphere.',
      };
    }
  }

  let modifier = 0.0;
  let textureMatchScore = 0.5;
  let reason = 'Neutral visual texture intent - standard surface quality scoring.';

  switch (narrationIntent) {
    case 'PRISTINE_DIGITAL': {
      if (candidateTexture === 'CLEAN_PRISTINE_DIGITAL') {
        modifier = 0.008;
        textureMatchScore = 1.0;
        reason = 'Texture bonus: clean razor-sharp digital clarity matches pristine high-definition narrative.';
      } else if (candidateTexture === 'ETHEREAL_DIFFUSION_GLOW') {
        modifier = 0.002;
        textureMatchScore = 0.6;
        reason = 'Texture alignment: clean diffusion glow compatible with polished digital presentation.';
      } else if (candidateTexture === 'TEXTURE_AGNOSTIC') {
        modifier = 0.0;
        textureMatchScore = 0.5;
        reason = 'Texture neutral: standard surface profile for pristine digital narrative.';
      } else if (candidateTexture === 'ORGANIC_FILM_GRAIN') {
        modifier = -0.003;
        textureMatchScore = 0.35;
        reason = 'Texture penalty: celluloid film grain diverges from requested pristine noise-free clarity.';
      } else if (candidateTexture === 'GRITTY_TEXTURED_NOISE' || candidateTexture === 'VINTAGE_ANALOG_VHS') {
        modifier = -0.006;
        textureMatchScore = 0.15;
        reason = 'Texture penalty: heavy noise/analog artifacts contradict requested crystal-clear digital clarity.';
      }
      break;
    }
    case 'FILM_GRAIN': {
      if (candidateTexture === 'ORGANIC_FILM_GRAIN') {
        modifier = 0.008;
        textureMatchScore = 1.0;
        reason = 'Texture bonus: authentic 35mm film grain matches organic cinematic celluloid narrative.';
      } else if (candidateTexture === 'ETHEREAL_DIFFUSION_GLOW') {
        modifier = 0.003;
        textureMatchScore = 0.7;
        reason = 'Texture alignment: halation diffusion glow complements organic film aesthetic.';
      } else if (candidateTexture === 'GRITTY_TEXTURED_NOISE') {
        modifier = 0.002;
        textureMatchScore = 0.6;
        reason = 'Texture alignment: tactile grain provides compatible raw organic texture.';
      } else if (candidateTexture === 'TEXTURE_AGNOSTIC') {
        modifier = 0.0;
        textureMatchScore = 0.5;
        reason = 'Texture neutral: standard surface profile for film grain narrative.';
      } else if (candidateTexture === 'VINTAGE_ANALOG_VHS') {
        modifier = -0.004;
        textureMatchScore = 0.3;
        reason = 'Texture penalty: tape glitch artifacts diverge from classic celluloid film look.';
      } else if (candidateTexture === 'CLEAN_PRISTINE_DIGITAL') {
        modifier = -0.005;
        textureMatchScore = 0.2;
        reason = 'Texture penalty: clinical digital sharpness lacks requested organic film grain texture.';
      }
      break;
    }
    case 'ANALOG_VHS': {
      if (candidateTexture === 'VINTAGE_ANALOG_VHS') {
        modifier = 0.008;
        textureMatchScore = 1.0;
        reason = 'Texture bonus: retro VHS tape artifacts and scanlines match vintage analog narrative.';
      } else if (candidateTexture === 'GRITTY_TEXTURED_NOISE') {
        modifier = 0.002;
        textureMatchScore = 0.6;
        reason = 'Texture alignment: coarse noise texture compatible with retro lo-fi context.';
      } else if (candidateTexture === 'TEXTURE_AGNOSTIC') {
        modifier = 0.0;
        textureMatchScore = 0.5;
        reason = 'Texture neutral: standard surface profile for analog VHS narrative.';
      } else if (candidateTexture === 'ETHEREAL_DIFFUSION_GLOW') {
        modifier = -0.004;
        textureMatchScore = 0.3;
        reason = 'Texture penalty: modern soft glow diverges from requested retro magnetic tape artifacts.';
      } else if (candidateTexture === 'CLEAN_PRISTINE_DIGITAL') {
        modifier = -0.006;
        textureMatchScore = 0.15;
        reason = 'Texture penalty: ultra-clean modern digital clarity contradicts requested retro VHS look.';
      }
      break;
    }
    case 'GRITTY_NOISE': {
      if (candidateTexture === 'GRITTY_TEXTURED_NOISE') {
        modifier = 0.008;
        textureMatchScore = 1.0;
        reason = 'Texture bonus: raw sensor noise and heavy grit match industrial unpolished narrative.';
      } else if (candidateTexture === 'ORGANIC_FILM_GRAIN') {
        modifier = 0.002;
        textureMatchScore = 0.6;
        reason = 'Texture alignment: coarse celluloid grain provides compatible textured roughness.';
      } else if (candidateTexture === 'VINTAGE_ANALOG_VHS') {
        modifier = 0.002;
        textureMatchScore = 0.6;
        reason = 'Texture alignment: analog tape noise supports gritty tactile aesthetic.';
      } else if (candidateTexture === 'TEXTURE_AGNOSTIC') {
        modifier = 0.0;
        textureMatchScore = 0.5;
        reason = 'Texture neutral: standard surface profile for gritty noise narrative.';
      } else if (candidateTexture === 'ETHEREAL_DIFFUSION_GLOW') {
        modifier = -0.004;
        textureMatchScore = 0.3;
        reason = 'Texture penalty: soft dreamy diffusion contradicts requested raw gritty noise.';
      } else if (candidateTexture === 'CLEAN_PRISTINE_DIGITAL') {
        modifier = -0.006;
        textureMatchScore = 0.15;
        reason = 'Texture penalty: pristine smooth digital surface contradicts requested unpolished grit.';
      }
      break;
    }
    case 'DIFFUSION_GLOW': {
      if (candidateTexture === 'ETHEREAL_DIFFUSION_GLOW') {
        modifier = 0.008;
        textureMatchScore = 1.0;
        reason = 'Texture bonus: pro-mist halation bloom and soft glow match dreamy ethereal narrative.';
      } else if (candidateTexture === 'ORGANIC_FILM_GRAIN') {
        modifier = 0.003;
        textureMatchScore = 0.7;
        reason = 'Texture alignment: warm celluloid grain enhances soft diffusion glow.';
      } else if (candidateTexture === 'CLEAN_PRISTINE_DIGITAL') {
        modifier = 0.002;
        textureMatchScore = 0.6;
        reason = 'Texture alignment: clean highlights provide base for specular halation glow.';
      } else if (candidateTexture === 'TEXTURE_AGNOSTIC') {
        modifier = 0.0;
        textureMatchScore = 0.5;
        reason = 'Texture neutral: standard surface profile for diffusion glow narrative.';
      } else if (candidateTexture === 'GRITTY_TEXTURED_NOISE' || candidateTexture === 'VINTAGE_ANALOG_VHS') {
        modifier = -0.005;
        textureMatchScore = 0.2;
        reason = 'Texture penalty: harsh noise/glitch artifacts contradict requested soft dreamy halation.';
      }
      break;
    }
    case 'NEUTRAL':
    default: {
      modifier = 0.0;
      textureMatchScore = 0.5;
      reason = 'Neutral visual texture intent - standard surface quality scoring.';
      break;
    }
  }

  const clampedModifier = Math.max(-0.008, Math.min(0.008, Math.round(modifier * 1000) / 1000));

  return {
    modifier: clampedModifier,
    visualTexture: candidateTexture,
    textureIntent: narrationIntent,
    textureMatchScore: Math.round(textureMatchScore * 1000) / 1000,
    reason,
  };
}

/**
 * Step 46: Clamps aggregate raw visual intelligence to [-GLOBAL_VISUAL_INTELLIGENCE_BUDGET, +GLOBAL_VISUAL_INTELLIGENCE_BUDGET].
 * Ensures semantic match remains the dominant foundation during candidate selection.
 */
export function clampGlobalVisualIntelligence(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0 || Object.is(rounded, -0)) return 0;
  return Math.max(
    -GLOBAL_VISUAL_INTELLIGENCE_BUDGET,
    Math.min(GLOBAL_VISUAL_INTELLIGENCE_BUDGET, rounded)
  );
}

/**
 * Step 46: Aggregates all 18 micro-intelligence visual modifiers from Steps 28–45 and clamps within the global visual budget.
 * Preserves individual layer calculations while bounding their combined additive headroom.
 */
export function calculateAggregateVisualIntelligence(modifiers: {
  framingModifier: number;
  atmosphericModifier: number;
  motionModifier: number;
  settingModifier: number;
  densityModifier: number;
  angleModifier: number;
  timeModifier: number;
  weatherModifier: number;
  depthModifier: number;
  temporalRateModifier: number;
  mediumModifier: number;
  compositionModifier: number;
  lightingModifier: number;
  povModifier: number;
  chromaticModifier: number;
  trajectoryModifier: number;
  lensModifier: number;
  textureModifier: number;
}): {
  rawVisualIntelligence: number;
  boundedVisualIntelligence: number;
  visualIntelligenceBudget: number;
  isClamped: boolean;
} {
  const rawVisualIntelligence = Math.round(
    (modifiers.framingModifier +
      modifiers.atmosphericModifier +
      modifiers.motionModifier +
      modifiers.settingModifier +
      modifiers.densityModifier +
      modifiers.angleModifier +
      modifiers.timeModifier +
      modifiers.weatherModifier +
      modifiers.depthModifier +
      modifiers.temporalRateModifier +
      modifiers.mediumModifier +
      modifiers.compositionModifier +
      modifiers.lightingModifier +
      modifiers.povModifier +
      modifiers.chromaticModifier +
      modifiers.trajectoryModifier +
      modifiers.lensModifier +
      modifiers.textureModifier) *
      1000
  ) / 1000;

  const boundedVisualIntelligence = clampGlobalVisualIntelligence(rawVisualIntelligence);
  const isClamped = boundedVisualIntelligence !== rawVisualIntelligence;

  return {
    rawVisualIntelligence,
    boundedVisualIntelligence,
    visualIntelligenceBudget: GLOBAL_VISUAL_INTELLIGENCE_BUDGET,
    isClamped,
  };
}

/**
 * Step 47: Compares two scored candidates applying the Semantic Ranking Safety Band.
 * When semantic separation is >= VISUAL_RANKING_SEMANTIC_SAFETY_BAND (0.100),
 * preserves semantic dominance by ensuring the higher semantic candidate cannot be overtaken
 * solely by visual intelligence modifiers.
 * For candidates with semantic separation < 0.100, standard adjustedScore ranking applies.
 */
export function compareCandidatesWithSemanticProtection(
  a: { rawScore: number; adjustedScore: number; boundedVisualIntelligence?: number },
  b: { rawScore: number; adjustedScore: number; boundedVisualIntelligence?: number },
  safetyBand: number = VISUAL_RANKING_SEMANTIC_SAFETY_BAND
): number {
  const semanticDiff = Math.round((a.rawScore - b.rawScore) * 1000) / 1000;

  // If candidate A has a semantic score >= safetyBand higher than B
  if (semanticDiff >= safetyBand) {
    const nonVisualA = Math.round((a.adjustedScore - (a.boundedVisualIntelligence || 0)) * 1000) / 1000;
    const nonVisualB = Math.round((b.adjustedScore - (b.boundedVisualIntelligence || 0)) * 1000) / 1000;
    if (nonVisualA >= nonVisualB) {
      return -1; // A ranks ahead of B
    }
  }

  // Symmetrically, if candidate B has a semantic score >= safetyBand higher than A
  if (-semanticDiff >= safetyBand) {
    const nonVisualA = Math.round((a.adjustedScore - (a.boundedVisualIntelligence || 0)) * 1000) / 1000;
    const nonVisualB = Math.round((b.adjustedScore - (b.boundedVisualIntelligence || 0)) * 1000) / 1000;
    if (nonVisualB >= nonVisualA) {
      return 1; // B ranks ahead of A
    }
  }

  // Standard ranking by adjustedScore descending
  const scoreDiff = b.adjustedScore - a.adjustedScore;
  if (Math.abs(scoreDiff) > 0.0001) {
    return scoreDiff;
  }
  // Tie-breaker: raw semantic score descending
  return b.rawScore - a.rawScore;
}

/**
 * Step 48: Candidate Confidence & Selection Margin Intelligence.
 *
 * A pure, deterministic helper that evaluates how confidently the system
 * selected the top-ranked candidate over the runner-up.  It is strictly
 * observational: it never alters any score, never re-ranks candidates,
 * and never skips any existing logic.
 *
 * @param selected  - The top candidate after Step 47 protection (scoredCandidates[0]).
 * @param runnerUp  - The second candidate, if one exists (scoredCandidates[1]).
 * @returns         - A compact confidence structure with all Step 48 provenance fields.
 */
export function calculateCandidateConfidence(
  selected: { rawScore: number; adjustedScore: number; boundedVisualIntelligence?: number },
  runnerUp?: { rawScore: number; adjustedScore: number }
): {
  candidateConfidenceScore: number;
  candidateConfidenceLevel: 'HIGH' | 'MODERATE' | 'LOW';
  selectionMargin: number;
  semanticMargin: number;
  semanticSeparation: 'CLEAR' | 'CLOSE' | 'NONE';
  visualInfluence: 'NEUTRAL' | 'SUPPORTING' | 'OPPOSING';
} {
  // Selection margin: composite score gap (or selected score when running unopposed)
  const selectionMargin: number =
    runnerUp !== undefined
      ? Math.round((selected.adjustedScore - runnerUp.adjustedScore) * 1000) / 1000
      : Math.round(selected.adjustedScore * 1000) / 1000;

  // Semantic margin: raw semantic score gap (or selected raw score when running unopposed)
  const semanticMargin: number =
    runnerUp !== undefined
      ? Math.round((selected.rawScore - runnerUp.rawScore) * 1000) / 1000
      : Math.round(selected.rawScore * 1000) / 1000;

  // Confidence score: normalised selection margin, bounded to [0, 1]
  const candidateConfidenceScore: number =
    Math.round(Math.min(1, Math.max(0, selectionMargin / 0.1)) * 1000) / 1000;

  // Confidence level thresholds (selection margin based)
  const candidateConfidenceLevel: 'HIGH' | 'MODERATE' | 'LOW' =
    selectionMargin >= 0.05 ? 'HIGH' : selectionMargin >= 0.02 ? 'MODERATE' : 'LOW';

  // Semantic separation label
  const semanticSeparation: 'CLEAR' | 'CLOSE' | 'NONE' =
    semanticMargin >= 0.1 ? 'CLEAR' : semanticMargin > 0 ? 'CLOSE' : 'NONE';

  // Visual influence direction from bounded visual intelligence contribution
  const bvi = selected.boundedVisualIntelligence ?? 0;
  const visualInfluence: 'NEUTRAL' | 'SUPPORTING' | 'OPPOSING' =
    bvi === 0 ? 'NEUTRAL' : bvi > 0 ? 'SUPPORTING' : 'OPPOSING';

  return {
    candidateConfidenceScore,
    candidateConfidenceLevel,
    selectionMargin,
    semanticMargin,
    semanticSeparation,
    visualInfluence,
  };
}

/**
 * Step 47: Applies semantic ranking protection to a list of scored candidates.
 * Sorts candidates using compareCandidatesWithSemanticProtection and sets protection metadata flags.
 */
export function applySemanticRankingProtection<T extends {
  rawScore: number;
  adjustedScore: number;
  boundedVisualIntelligence?: number;
  semanticRankingProtectionApplied?: boolean;
  semanticRankingProtectionReason?: string;
}>(
  candidates: T[],
  safetyBand: number = VISUAL_RANKING_SEMANTIC_SAFETY_BAND
): T[] {
  if (candidates.length <= 1) return candidates;

  const sorted = [...candidates].sort((a, b) =>
    compareCandidatesWithSemanticProtection(a, b, safetyBand)
  );

  // Check if protection altered the top candidate relative to unprotected adjustedScore sorting
  const rawTopByAdjusted = [...candidates].sort((a, b) => {
    const diff = b.adjustedScore - a.adjustedScore;
    return Math.abs(diff) > 0.0001 ? diff : b.rawScore - a.rawScore;
  })[0];

  const protectedTop = sorted[0];
  if (protectedTop && rawTopByAdjusted && protectedTop !== rawTopByAdjusted) {
    protectedTop.semanticRankingProtectionApplied = true;
    protectedTop.semanticRankingProtectionReason = `Semantic ranking protection preserved top candidate (raw score: ${protectedTop.rawScore.toFixed(2)}) ahead of candidate with lower semantic match (raw score: ${rawTopByAdjusted.rawScore.toFixed(2)}) across >= ${safetyBand.toFixed(2)} safety band.`;
  }

  return sorted;
}

/**
 * Step 19: Comprehensive Shot-to-Shot Transition & Continuity Intelligence.
 * Evaluates candidate relative to the immediately preceding shot:
 * 1. Thematic concept & tag continuity (+0.018 to +0.030)
 * 2. Visual aspect ratio & framing compatibility (+0.005 for native 16:9 continuity)
 * 3. Same-source handling:
 *    - Static photos or nearly identical video frames: Strong repetition penalty (-0.10)
 *    - Distinct temporal moments of the same source video: Reduced penalty + continuation bonus (+0.015)
 * 4. Duplicate description penalty for different files with redundant scenes (-0.04)
 * 5. Returns deterministic continuityBonus, repetitionPenalty, reason, and isConsecutiveContinuation.
 */
export function calculateShotTransitionIntelligence(
  candidateAsset: MediaAsset,
  prevAsset: MediaAsset | null,
  prevItem: TimelineItem | null,
  preferenceWeight: number,
  reusePenaltyWeight: number,
  segmentText: string = '',
  matchedSnippet?: string
): {
  continuityBonus: number;
  repetitionPenalty: number;
  reason?: string;
  isConsecutiveContinuation: boolean;
  isRepetitionReduced: boolean;
} {
  if (!prevAsset || preferenceWeight <= 0) {
    return {
      continuityBonus: 0.0,
      repetitionPenalty: 0.0,
      isConsecutiveContinuation: false,
      isRepetitionReduced: false,
    };
  }

  // Case A: Same source asset as previous shot (Consecutive repeat)
  if (candidateAsset.id === prevAsset.id) {
    // 1. Static photo repeated consecutively is an identical duplicate
    if (candidateAsset.type !== 'video') {
      return {
        continuityBonus: 0.0,
        repetitionPenalty: reusePenaltyWeight * 1.25,
        reason: 'Reduced repetition with immediately preceding identical image shot.',
        isConsecutiveContinuation: false,
        isRepetitionReduced: true,
      };
    }

    // 2. Video asset: Check if candidate targets a distinct temporal moment
    const estimatedTiming = selectOptimalSourceStart(
      candidateAsset,
      segmentText,
      5.0,
      matchedSnippet
    );

    const prevSourceStart = prevItem ? prevItem.sourceStart : 0.0;
    const prevSourceEnd = prevItem ? prevItem.sourceStart + prevItem.duration : 5.0;
    const timeDiff = Math.abs(estimatedTiming.sourceStart - prevSourceStart);

    // If estimated timestamp is >= 3.0s away or beyond previous shot's end point
    if (timeDiff >= 3.0 || estimatedTiming.sourceStart >= prevSourceEnd - 0.5) {
      // Legitimate temporal continuation from the same video asset
      return {
        continuityBonus: preferenceWeight * 0.5, // +0.015
        repetitionPenalty: reusePenaltyWeight * 0.35, // reduced penalty
        reason: `Same source video, distinct temporal moment (@${estimatedTiming.sourceStart.toFixed(1)}s vs @${prevSourceStart.toFixed(1)}s).`,
        isConsecutiveContinuation: true,
        isRepetitionReduced: false,
      };
    } else {
      // Redundant / overlapping frame region
      return {
        continuityBonus: 0.0,
        repetitionPenalty: reusePenaltyWeight * 1.25,
        reason: 'Reduced repetition with immediately preceding video section.',
        isConsecutiveContinuation: false,
        isRepetitionReduced: true,
      };
    }
  }

  // Case B: Different source assets (Thematic continuity vs redundancy)
  const candTags = new Set(
    (candidateAsset.analysis?.semantic?.tags || candidateAsset.analysis?.tags || []).map((t) => t.toLowerCase())
  );
  const prevTags = (prevAsset.analysis?.semantic?.tags || prevAsset.analysis?.tags || []).map((t) => t.toLowerCase());

  const sharedTags = prevTags.filter((t) => candTags.has(t) && !COMMON_STOPWORDS.has(t));

  let tagBonus = 0.0;
  let reason: string | undefined = undefined;

  if (sharedTags.length >= 2) {
    tagBonus = preferenceWeight;
    reason = `Thematic visual continuity with previous shot (${sharedTags.slice(0, 2).join(', ')})`;
  } else if (sharedTags.length === 1) {
    tagBonus = preferenceWeight * 0.6;
    reason = `Thematic visual continuity with previous shot (${sharedTags[0]})`;
  }

  // Aspect ratio continuity bonus (+0.005 if both are native 16:9)
  let framingBonus = 0.0;
  const isCand16x9 = candidateAsset.aspectRatioLabel?.includes('16:9') || Math.abs((candidateAsset.width / (candidateAsset.height || 1)) - (16 / 9)) < 0.05;
  const isPrev16x9 = prevAsset.aspectRatioLabel?.includes('16:9') || Math.abs((prevAsset.width / (prevAsset.height || 1)) - (16 / 9)) < 0.05;
  if (isCand16x9 && isPrev16x9) {
    framingBonus = 0.005;
  }

  // Check for excessive duplicate scene descriptions across different files
  const prevDesc = (prevAsset.analysis?.semantic?.description || prevAsset.analysis?.description || '').toLowerCase();
  const candDesc = (candidateAsset.analysis?.semantic?.description || candidateAsset.analysis?.description || '').toLowerCase();

  let redundancyPenalty = 0.0;
  let isRepetitionReduced = false;

  if (prevDesc && candDesc && prevDesc === candDesc && sharedTags.length > 3) {
    redundancyPenalty = 0.04;
    reason = 'Penalized visual redundancy with previous scene';
    isRepetitionReduced = true;
  }

  const totalBonus = Math.min(0.035, Math.round((tagBonus + framingBonus) * 1000) / 1000);

  return {
    continuityBonus: totalBonus,
    repetitionPenalty: redundancyPenalty,
    reason,
    isConsecutiveContinuation: false,
    isRepetitionReduced,
  };
}

/**
 * Step 17: Selects the optimal starting timestamp (sourceStart) inside a video asset based on temporal keyframes.
 * 
 * Rules:
 * 1. For each keyframe k at time t_k:
 *    - Score semantic relevance to transcript segment (non-generic words overlap + matchedSnippet alignment).
 *    - Add small preference (+0.15) if k is an informative key moment (isKeyMoment).
 *    - Add small preference (+0.10) if narration has action words and k is near a recorded visual change.
 * 2. If multiple keyframes are strongly relevant (score >= 0.35), prefer the EARLIEST strongly relevant keyframe.
 * 3. Conservative fallback:
 *    - If no keyframe has sufficient confidence (top score < 0.35) or earliest strong keyframe is at 0.0s, return sourceStart = 0.0s.
 * 4. Footage duration clamping:
 *    - The selected timestamp must leave enough footage for the requested segment duration.
 *    - maxValidStart = Math.max(0, videoDuration - segmentDuration).
 *    - If selectedTime > maxValidStart:
 *      - If videoDuration > segmentDuration, clamp to maxValidStart.
 *      - If videoDuration <= segmentDuration, clamp to 0.0s.
 * 5. Photos: Never called / always returns 0.0s.
 */
export function selectOptimalSourceStart(
  asset: MediaAsset,
  segmentText: string,
  segmentDuration: number,
  matchedSnippet?: string
): {
  sourceStart: number;
  selectedTimestamp: number;
  reason?: string;
  isOptimized: boolean;
} {
  // Photos and unanalyzed assets always start at 0.0
  if (asset.type !== 'video' || !asset.analysis) {
    return { sourceStart: 0.0, selectedTimestamp: 0.0, isOptimized: false };
  }

  const nativeDuration = asset.duration || 0;
  if (nativeDuration <= 0) {
    return { sourceStart: 0.0, selectedTimestamp: 0.0, isOptimized: false };
  }

  const keyframes = asset.analysis.keyframes || [];
  const keyframeDescs = asset.analysis.semantic?.keyframeDescriptions || [];

  // Combine keyframe metadata
  const candidates: Array<{
    time: number;
    description: string;
    tags: string[];
    isKeyMoment: boolean;
    score: number;
  }> = [];

  const segmentWords = Array.from(
    new Set(
      segmentText
        .toLowerCase()
        .split(/[\s,._!?;:"'()]+/)
        .filter((w) => w.length >= 3 && !COMMON_STOPWORDS.has(w))
    )
  );

  const hasActionInNarration = segmentWords.some((w) => ACTION_KEYWORDS.has(w));
  const visualChanges = asset.analysis.semantic?.visualChanges || [];

  // Prefer keyframeDescriptions if present, otherwise raw keyframes
  if (keyframeDescs.length > 0) {
    for (const kd of keyframeDescs) {
      if (typeof kd.time !== 'number' || kd.time < 0 || kd.time >= nativeDuration) continue;
      
      const frameText = `${kd.description || ''} ${(kd.tags || []).join(' ')}`.toLowerCase();
      let matchScore = 0.0;

      // Direct word overlap (up to 0.6)
      const matchingWordsCount = segmentWords.filter((w) => frameText.includes(w)).length;
      if (segmentWords.length > 0) {
        matchScore += Math.min(0.6, (matchingWordsCount / segmentWords.length) * 0.8);
      }

      // Matched snippet alignment (up to 0.4)
      if (matchedSnippet && (kd.description.toLowerCase().includes(matchedSnippet.toLowerCase()) || matchedSnippet.toLowerCase().includes(kd.description.toLowerCase()))) {
        matchScore += 0.4;
      }

      // Key moment preference
      if (kd.isKeyMoment) {
        matchScore += 0.15;
      }

      // Action / visual change proximity (within 2s of a visual change)
      if (hasActionInNarration) {
        const isNearChange = visualChanges.some(
          (vc) => Math.abs(vc.fromTime - kd.time) <= 2.0 || Math.abs(vc.toTime - kd.time) <= 2.0
        );
        if (isNearChange) {
          matchScore += 0.10;
        }
      }

      candidates.push({
        time: kd.time,
        description: kd.description,
        tags: kd.tags || [],
        isKeyMoment: Boolean(kd.isKeyMoment),
        score: Math.round(matchScore * 100) / 100,
      });
    }
  } else if (keyframes.length > 0) {
    for (const kf of keyframes) {
      if (typeof kf.time !== 'number' || kf.time < 0 || kf.time >= nativeDuration) continue;
      const frameText = `${kf.description || ''} ${(kf.tags || []).join(' ')}`.toLowerCase();
      let matchScore = 0.0;
      const matchingWordsCount = segmentWords.filter((w) => frameText.includes(w)).length;
      if (segmentWords.length > 0) {
        matchScore += Math.min(0.6, (matchingWordsCount / segmentWords.length) * 0.8);
      }
      if (kf.isKeyMoment) {
        matchScore += 0.15;
      }
      candidates.push({
        time: kf.time,
        description: kf.description || '',
        tags: kf.tags || [],
        isKeyMoment: Boolean(kf.isKeyMoment),
        score: Math.round(matchScore * 100) / 100,
      });
    }
  }

  if (candidates.length === 0) {
    return { sourceStart: 0.0, selectedTimestamp: 0.0, isOptimized: false };
  }

  // Find candidate with highest score
  candidates.sort((a, b) => b.score - a.score);
  const bestScore = candidates[0].score;

  // Threshold for sufficient evidence: 0.35
  if (bestScore < 0.35) {
    return { sourceStart: 0.0, selectedTimestamp: 0.0, isOptimized: false };
  }

  // Filter all candidates within 0.05 of the top score (strongly relevant)
  const topCandidates = candidates.filter((c) => c.score >= Math.max(0.35, bestScore - 0.05));

  // Prefer the EARLIEST strongly relevant keyframe
  topCandidates.sort((a, b) => a.time - b.time);
  const chosen = topCandidates[0];

  if (chosen.time <= 0.0) {
    return { sourceStart: 0.0, selectedTimestamp: 0.0, isOptimized: false };
  }

  // Clamping to respect remaining footage duration
  const maxValidStart = Math.max(0, nativeDuration - segmentDuration);
  let finalSourceStart = chosen.time;
  let clampedNote = '';

  if (finalSourceStart > maxValidStart) {
    if (nativeDuration > segmentDuration) {
      finalSourceStart = Math.round(maxValidStart * 100) / 100;
      clampedNote = ` (clamped from ${chosen.time.toFixed(1)}s to leave full ${segmentDuration.toFixed(1)}s footage)`;
    } else {
      // Video is too short to offset start
      finalSourceStart = 0.0;
      return { sourceStart: 0.0, selectedTimestamp: chosen.time, isOptimized: false };
    }
  }

  finalSourceStart = Math.round(finalSourceStart * 100) / 100;

  const reason = `Started at ${finalSourceStart.toFixed(1)}s because this keyframe (@${chosen.time.toFixed(1)}s) most closely matches the narration${clampedNote}.`;

  return {
    sourceStart: finalSourceStart,
    selectedTimestamp: chosen.time,
    reason,
    isOptimized: true,
  };
}

/**
 * Step 18: Refines the screen duration of an AI-selected visual clip based on:
 * 1. Transcript segment duration (baseline)
 * 2. Available source footage (nativeDuration - sourceStart)
 * 3. Meaningful visual transitions/changes within the footage
 * 4. Media type (photo vs video)
 *
 * Strict safety constraints:
 * - Final duration <= transcript segment duration (never exceeds narration)
 * - Final duration <= availableSourceDuration (never exceeds source footage)
 * - Never loops footage, never creates fake duration
 * - Photos always cover full narration segment
 * - Normal video with sufficient footage defaults to transcript segment duration
 */
export function refineShotDuration(
  asset: MediaAsset,
  segmentDuration: number,
  sourceStart: number,
  segmentText: string
): {
  duration: number;
  originalSegmentDuration: number;
  isAdjusted: boolean;
  reason: string;
} {
  const origDur = Math.round(segmentDuration * 100) / 100;

  // Photos always cover the full narration segment
  if (asset.type !== 'video') {
    return {
      duration: origDur,
      originalSegmentDuration: origDur,
      isAdjusted: false,
      reason: 'Duration kept at narration length.',
    };
  }

  const nativeDur = asset.duration || 0;
  const availableFootage = Math.max(0, nativeDur - sourceStart);

  // 1. If source video has insufficient footage to cover full segment
  if (availableFootage < segmentDuration) {
    const clampedDur = Math.round(Math.max(0.1, availableFootage) * 100) / 100;
    return {
      duration: clampedDur,
      originalSegmentDuration: origDur,
      isAdjusted: true,
      reason: `Duration constrained to ${clampedDur.toFixed(1)}s of available source footage.`,
    };
  }

  // 2. Check if there is a meaningful visual transition/change inside the usable portion
  const visualChanges = asset.analysis?.semantic?.visualChanges || [];
  const segmentWords = segmentText.toLowerCase().split(/[\s,._!?;:"'()]+/);
  const hasActionInNarration = segmentWords.some((w) => ACTION_KEYWORDS.has(w));

  if (visualChanges.length > 0) {
    // Look for visual transitions occurring after sourceStart but within segmentDuration
    const relevantChanges = visualChanges.filter(
      (vc) => vc.fromTime >= sourceStart - 0.5 && vc.toTime <= sourceStart + segmentDuration + 0.5
    );

    if (relevantChanges.length > 0 && hasActionInNarration) {
      // Find the most significant transition
      const mainChange = relevantChanges.reduce((prev, curr) =>
        (curr.differenceScore || 0) > (prev.differenceScore || 0) ? curr : prev
      );

      // Transition relative end timestamp from sourceStart
      const relEnd = Math.max(0.5, mainChange.toTime - sourceStart);
      if (relEnd <= segmentDuration && relEnd <= availableFootage) {
        return {
          duration: origDur,
          originalSegmentDuration: origDur,
          isAdjusted: false,
          reason: `Duration encompasses recorded visual transition (ends at ${relEnd.toFixed(1)}s).`,
        };
      }
    }
  }

  // 3. Default: keep full transcript segment duration
  return {
    duration: origDur,
    originalSegmentDuration: origDur,
    isAdjusted: false,
    reason: 'Duration kept at narration length.',
  };
}

/**
 * Deterministically generates a first draft 16:9 timeline from:
 * 1. Transcript segments (Step 3)
 * 2. Semantic media understanding (Step 5)
 * 3. Semantic similarity matching (Step 6)
 * 4. Multi-signal scoring heuristics (Step 13)
 *
 * Core rule: "AI chooses WHAT to show. Human chooses HOW it is shown."
 * Leaves weak matches or unanalyzed segments unassigned as honest gaps.
 */
export async function generateDraftTimeline(
  segments: AudioSegment[],
  mediaAssets: MediaAsset[],
  options: DraftOptions = {}
): Promise<DraftResult> {
  const similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const reusePenalty = options.reusePenalty ?? DEFAULT_REUSE_PENALTY;
  const continuityPreference = options.continuityPreference ?? DEFAULT_CONTINUITY_PREFERENCE;
  const preferVideo = options.preferVideoOverImage ?? true;
  const workerUrl = options.workerUrl;

  const totalSegments = segments.length;
  const totalDuration = segments.reduce(
    (acc, seg) => Math.max(acc, seg.endTime),
    0
  );

  if (totalSegments === 0 || mediaAssets.length === 0) {
    return {
      timeline: [],
      stats: {
        totalSegments,
        assignedSegments: 0,
        unassignedSegments: totalSegments,
        totalDuration,
        assignedDuration: 0,
        unassignedDuration: totalDuration,
        uniqueMediaUsed: 0,
        mediaReuseCount: {},
        mediaUsageSummary: [],
        unassignedReasons: Object.fromEntries(segments.map((s) => [s.id, 'No media assets available in project library'])),
        unassignedDetails: segments.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: Math.round((s.endTime - s.startTime) * 100) / 100,
          text: s.text,
          reason: 'No media assets available in project library',
        })),
        warnings: ['No media assets imported to project library.'],
        coveragePercentage: 0,
        thresholdUsed: similarityThreshold,
        reusePenaltyUsed: reusePenalty,
        continuityPreferenceUsed: continuityPreference,
        generatedAt: Date.now(),
      },
      unassignedSegmentIds: segments.map((s) => s.id),
    };
  }

  // 1. Filter media assets that have valid Step 5 semantic analysis
  const validAnalyzedMedia = mediaAssets.filter((m) => {
    const hasDesc = Boolean(m.analysis?.semantic?.description || m.analysis?.description);
    const hasTags = Boolean(m.analysis?.semantic?.tags?.length || m.analysis?.tags?.length);
    const hasKeyframes = Boolean(m.analysis?.keyframes?.some((kf) => Boolean(kf.description)));
    return hasDesc || hasTags || hasKeyframes;
  });

  const unanalyzedCount = mediaAssets.length - validAnalyzedMedia.length;

  if (validAnalyzedMedia.length === 0) {
    return {
      timeline: [],
      stats: {
        totalSegments,
        assignedSegments: 0,
        unassignedSegments: totalSegments,
        totalDuration,
        assignedDuration: 0,
        unassignedDuration: totalDuration,
        uniqueMediaUsed: 0,
        mediaReuseCount: {},
        mediaUsageSummary: [],
        unassignedReasons: Object.fromEntries(segments.map((s) => [s.id, 'Media assets lack semantic analysis'])),
        unassignedDetails: segments.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: Math.round((s.endTime - s.startTime) * 100) / 100,
          text: s.text,
          reason: 'Media assets lack semantic analysis',
        })),
        warnings: [`${unanalyzedCount} media asset${unanalyzedCount === 1 ? '' : 's'} in library lacked semantic analysis.`],
        coveragePercentage: 0,
        thresholdUsed: similarityThreshold,
        reusePenaltyUsed: reusePenalty,
        continuityPreferenceUsed: continuityPreference,
        generatedAt: Date.now(),
      },
      unassignedSegmentIds: segments.map((s) => s.id),
    };
  }

  const timelineItems: TimelineItem[] = [];
  const mediaReuseCount: { [mediaId: string]: number } = {};
  const mediaTotalDuration: { [mediaId: string]: number } = {};
  const mediaConsecutiveFlag: { [mediaId: string]: boolean } = {};
  const unassignedSegmentIds: string[] = [];
  const unassignedReasons: { [segmentId: string]: string } = {};
  const unassignedDetails: UnassignedSegmentDetail[] = [];
  const warnings: string[] = [];

  let previousAssignedAsset: MediaAsset | null = null;
  let previousAssignedMediaId: string | null = null;
  let previousAssignedTimelineItem: TimelineItem | null = null;
  let previousAssignedBeatId: string | null = null;
  let recentPacingClasses: PacingClass[] = [];
  let previousSubjectTokens: string[] = [];
  let totalAssignedDuration = 0;
  let sourceStartsOptimizedCount = 0;
  let durationAdjustmentsCount = 0;
  let continuityLinksCount = 0;
  const roleCounts: { [role in NarrationRole]?: number } = {};

  // Step 20 & 21: Precompute narration roles and narration beat groupings
  const narrationRoles: NarrationRole[] = segments.map((seg, idx) => {
    const prevText = idx > 0 ? segments[idx - 1]?.text : undefined;
    const nextText = idx + 1 < segments.length ? segments[idx + 1]?.text : undefined;
    return classifyNarrationRole(seg.text, idx, segments.length, prevText, nextText).role;
  });
  const beatResults = detectNarrationBeats(segments, narrationRoles);

  // 2. Iterate through each transcript segment in chronological order
  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const segment = segments[sIdx];
    const segmentDuration = Math.max(0.1, Math.round((segment.endTime - segment.startTime) * 100) / 100);

    if (!segment.text || !segment.text.trim()) {
      unassignedSegmentIds.push(segment.id);
      unassignedReasons[segment.id] = 'Transcript segment text is empty';
      unassignedDetails.push({
        id: segment.id,
        startTime: segment.startTime,
        endTime: segment.endTime,
        duration: segmentDuration,
        text: segment.text || '',
        reason: 'Transcript segment text is empty',
      });
      continue;
    }

    try {
      // Step 20: Narration role & Step 21: Beat info
      const currentRole = narrationRoles[sIdx];
      const prevSegmentText = sIdx > 0 ? segments[sIdx - 1]?.text : undefined;
      const nextSegmentText = sIdx + 1 < segments.length ? segments[sIdx + 1]?.text : undefined;
      const narrationRoleInfo = classifyNarrationRole(
        segment.text,
        sIdx,
        segments.length,
        prevSegmentText,
        nextSegmentText
      );
      roleCounts[currentRole] = (roleCounts[currentRole] || 0) + 1;
      const currentBeatInfo = beatResults[sIdx] || {
        narrationBeatType: 'STANDALONE' as NarrationBeatType,
        beatId: 'beat-0',
        beatPosition: 1,
        beatLength: 1,
        beatReason: 'Single-segment standalone narration beat',
      };

      // Step 21 & 24: Beat boundary resets rolling pacing history
      if (currentBeatInfo.narrationBeatType === 'NEW_BEAT' || currentBeatInfo.narrationBeatType === 'STANDALONE') {
        recentPacingClasses = [];
      }

      // Step 6: Get ranked semantic candidates from local MiniLM worker
      const matchResult = await matchMediaForSegment(segment, validAnalyzedMedia, {
        workerUrl,
        topK: 15,
      });

      if (!matchResult.candidates || matchResult.candidates.length === 0) {
        unassignedSegmentIds.push(segment.id);
        unassignedReasons[segment.id] = 'No matching media found in library';
        unassignedDetails.push({
          id: segment.id,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segmentDuration,
          text: segment.text,
          reason: 'No matching media found in library',
        });
        continue;
      }

      // 3. Multi-Signal Deterministic Scoring (Step 13, 16, 19, 20, 21, 22, 23 & 24)
      const rawScoredCandidates = matchResult.candidates
        .filter((c) => c.score >= similarityThreshold)
        .map((c) => {
          const asset = validAnalyzedMedia.find((m) => m.id === c.mediaId);
          if (!asset) return null;

          // A. Raw semantic score with generic stopword attenuation
          const noiseFactor = calculateGenericNoiseDiscount(
            asset.analysis?.semantic?.description || asset.analysis?.description,
            asset.analysis?.semantic?.tags || asset.analysis?.tags
          );
          const attenuatedSemantic = c.score * noiseFactor;

          // B. Media Type Suitability (+0.03 for video if preference is active)
          let typeBonus = 0.0;
          if (preferVideo && asset.type === 'video') {
            typeBonus = 0.03;
          }

          // C. Duration Suitability
          let durationBonus = 0.0;
          if (asset.type === 'video' && typeof asset.duration === 'number') {
            if (asset.duration >= segmentDuration) {
              durationBonus = 0.02; // Full footage coverage bonus
            } else if (asset.duration < segmentDuration * 0.5 && segmentDuration > 5.0) {
              durationBonus = -0.05; // Penalty for severe footage deficiency
            }
          }

          // D. Reuse Penalty Policy
          const currentReuse = mediaReuseCount[c.mediaId] || 0;
          let calculatedReusePenalty = 0.0;
          if (currentReuse === 1) {
            calculatedReusePenalty = reusePenalty;
          } else if (currentReuse >= 2) {
            calculatedReusePenalty = reusePenalty * (1.0 + 0.5 * (currentReuse - 1));
          }

          // E. Step 19: Shot-to-Shot Transition & Continuity Intelligence
          const transitionIntel = calculateShotTransitionIntelligence(
            asset,
            previousAssignedAsset,
            previousAssignedTimelineItem,
            continuityPreference,
            reusePenalty,
            segment.text,
            c.matchedSnippet
          );

          // F. Step 16: Temporal Video Understanding Signals
          const temporal = calculateTemporalBonus(asset, segment.text, c.matchedSnippet);

          // G. Step 20: Narration Role Structural Modifier
          const roleModifier = calculateNarrationRoleModifier(
            currentRole,
            asset,
            previousAssignedAsset,
            c.score,
            temporal.isKeyMoment,
            temporal.hasVisualChange
          );

          // H. Step 21: Narration Beat Continuity Modifier (Capped within [-0.015, +0.015])
          const beatModifier = calculateNarrationBeatModifier(
            currentBeatInfo.beatId,
            currentBeatInfo.beatPosition,
            currentBeatInfo.beatLength,
            asset,
            previousAssignedAsset,
            previousAssignedBeatId
          );

          // I. Step 22: Visual Variety & Anti-Repetition Modifier (Capped within [-0.012, +0.012])
          const varietyIntel = calculateVisualVarietyModifier(
            asset,
            previousAssignedAsset,
            transitionIntel.isConsecutiveContinuation,
            transitionIntel.isRepetitionReduced
          );

          // J. Step 23: Draft Pacing & Shot Rhythm Modifier (Capped within [-0.010, +0.010])
          const pacingIntel = calculatePacingModifier(
            asset,
            previousAssignedTimelineItem,
            segment,
            currentRole,
            currentBeatInfo.narrationBeatType,
            undefined,
            transitionIntel.isConsecutiveContinuation,
            temporal.isKeyMoment,
            temporal.hasVisualChange
          );

          // K. Step 24: Narration-to-Visual Pacing Arc Intelligence (Capped within [-0.008, +0.008])
          const pacingArcIntel = calculatePacingArcModifier(
            pacingIntel.pacingClass,
            recentPacingClasses,
            currentRole,
            currentBeatInfo.narrationBeatType,
            transitionIntel.isConsecutiveContinuation
          );

          // L. Step 25: Narration Emphasis & Visual Impact Intelligence (Capped within [-0.008, +0.008])
          const visualImpactScore = calculateVisualImpactScore(asset);
          const emphasisImpactIntel = calculateEmphasisImpactModifier(
            visualImpactScore,
            currentRole,
            currentBeatInfo.narrationBeatType,
            transitionIntel.isConsecutiveContinuation
          );

          // M. Step 26: Narration-to-Visual Contrast Intelligence (Capped within [-0.008, +0.008])
          const visualState = classifyVisualState(asset, visualImpactScore);
          const contrastIntel = calculateNarrationVisualContrastModifier(
            segment.text,
            currentRole,
            visualState,
            visualImpactScore,
            temporal.hasVisualChange,
            currentBeatInfo.narrationBeatType,
            transitionIntel.isConsecutiveContinuation
          );

          // O. Step 27: Narration Entity & Subject Continuity Intelligence (Capped within [-0.008, +0.008])
          const currentSubjectTokens = extractSubjectTokens(segment.text);
          const effectiveSubjectTokens =
            (currentBeatInfo.narrationBeatType === 'CONTINUING_BEAT' || currentBeatInfo.narrationBeatType === 'BEAT_END') &&
            previousSubjectTokens.length > 0 &&
            currentSubjectTokens.length < 2
              ? Array.from(new Set([...currentSubjectTokens, ...previousSubjectTokens]))
              : currentSubjectTokens;

          const mediaSubjectMatch = calculateMediaSubjectMatch(
            effectiveSubjectTokens.length > 0 ? effectiveSubjectTokens : currentSubjectTokens,
            asset
          );

          const subjectContinuityIntel = calculateSubjectContinuityModifier(
            currentSubjectTokens,
            previousSubjectTokens,
            mediaSubjectMatch,
            currentBeatInfo.narrationBeatType,
            transitionIntel.isConsecutiveContinuation
          );

          // P. Step 28: Shot Framing & Composition Scale Intelligence (Capped within [-0.008, +0.008])
          const candidateFraming = classifyFramingScale(asset);
          const narrationIntent = classifyNarrationFramingIntent(segment.text, currentRole);
          const framingIntel = calculateFramingScaleModifier(
            candidateFraming,
            narrationIntent,
            currentRole,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // Q. Step 29: Color Mood & Atmospheric Lighting Intelligence (Capped within [-0.008, +0.008])
          const candidateTone = classifyAtmosphericTone(asset);
          const narrationAtmosphere = classifyNarrationAtmosphericIntent(segment.text);
          const atmosphericIntel = calculateAtmosphericToneModifier(
            candidateTone,
            narrationAtmosphere,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // R. Step 30: Camera Motion & Kinetic Dynamics Intelligence (Capped within [-0.008, +0.008])
          const candidateMotion = classifyCameraMotion(asset);
          const narrationMotion = classifyNarrationMotionIntent(segment.text, currentRole);
          const motionIntel = calculateMotionDynamicsModifier(
            candidateMotion,
            narrationMotion,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // S. Step 31: Spatial Environment & Scene Setting Intelligence (Capped within [-0.008, +0.008])
          const candidateSetting = classifySceneSetting(asset);
          const narrationSetting = classifyNarrationSettingIntent(segment.text, currentRole);
          const settingIntel = calculateSceneSettingModifier(
            candidateSetting,
            narrationSetting,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // T. Step 32: Human Subject Presence & Social Density Intelligence (Capped within [-0.008, +0.008])
          const candidateDensity = classifySubjectDensity(asset);
          const narrationDensity = classifyNarrationDensityIntent(segment.text, currentRole);
          const densityIntel = calculateSubjectDensityModifier(
            candidateDensity,
            narrationDensity,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // U. Step 33: Camera Angle & Vertical Perspective Intelligence (Capped within [-0.008, +0.008])
          const candidateAngle = classifyCameraAngle(asset);
          const narrationAngle = classifyNarrationAngleIntent(segment.text, currentRole);
          const angleIntel = calculateCameraAngleModifier(
            candidateAngle,
            narrationAngle,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // V. Step 34: Time of Day & Chronological Lighting Phase Intelligence (Capped within [-0.008, +0.008])
          const candidateTime = classifyTimeOfDay(asset);
          const narrationTime = classifyNarrationTimeIntent(segment.text, currentRole);
          const timeIntel = calculateTimeOfDayModifier(
            candidateTime,
            narrationTime,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // W. Step 35: Weather & Atmospheric Condition Intelligence (Capped within [-0.008, +0.008])
          const candidateWeather = classifyWeatherCondition(asset);
          const narrationWeather = classifyNarrationWeatherIntent(segment.text, currentRole);
          const weatherIntel = calculateWeatherModifier(
            candidateWeather,
            narrationWeather,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // X. Step 36: Optical Depth of Field & Focus Plane Intelligence (Capped within [-0.008, +0.008])
          const candidateDepth = classifyDepthOfField(asset);
          const narrationDepth = classifyNarrationDepthIntent(segment.text, currentRole);
          const depthIntel = calculateDepthOfFieldModifier(
            candidateDepth,
            narrationDepth,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // Y. Step 37: Temporal Motion Rate & Playback Speed Intelligence (Capped within [-0.008, +0.008])
          const candidateTemporalRate = classifyTemporalRate(asset);
          const narrationTemporalRate = classifyNarrationTemporalIntent(segment.text, currentRole);
          const temporalRateIntel = calculateTemporalRateModifier(
            candidateTemporalRate,
            narrationTemporalRate,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // Z. Step 38: Visual Medium & Render Style Intelligence (Capped within [-0.008, +0.008])
          const candidateVisualMedium = classifyVisualMedium(asset);
          const narrationVisualMedium = classifyNarrationMediumIntent(segment.text, currentRole);
          const mediumIntel = calculateVisualMediumModifier(
            candidateVisualMedium,
            narrationVisualMedium,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // AA. Step 39: Compositional Balance & Screen Alignment Intelligence (Capped within [-0.008, +0.008])
          const candidateCompositionBalance = classifyCompositionBalance(asset);
          const narrationCompositionBalance = classifyNarrationCompositionIntent(segment.text, currentRole);
          const compositionIntel = calculateCompositionBalanceModifier(
            candidateCompositionBalance,
            narrationCompositionBalance,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // BB. Step 40: Lighting Setup & Key Illumination Intelligence (Capped within [-0.008, +0.008])
          const candidateLightingSetup = classifyLightingSetup(asset);
          const narrationLightingSetup = classifyNarrationLightingIntent(segment.text, currentRole);
          const lightingIntel = calculateLightingSetupModifier(
            candidateLightingSetup,
            narrationLightingSetup,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // CC. Step 41: Camera Point-of-View & Observer Perspective Intelligence (Capped within [-0.008, +0.008])
          const candidatePOV = classifyPointOfView(asset);
          const narrationPOV = classifyNarrationPOVIntent(segment.text, currentRole);
          const povIntel = calculatePOVModifier(
            candidatePOV,
            narrationPOV,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // DD. Step 42: Chromatic Saturation & Color Grading Intelligence (Capped within [-0.008, +0.008])
          const candidateChromatic = classifyChromaticGrading(asset);
          const narrationChromatic = classifyNarrationChromaticIntent(segment.text, currentRole);
          const chromaticIntel = calculateChromaticModifier(
            candidateChromatic,
            narrationChromatic,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // EE. Step 43: Action Trajectory & Screen Direction Intelligence (Capped within [-0.008, +0.008])
          const candidateTrajectory = classifyActionTrajectory(asset);
          const narrationTrajectory = classifyNarrationTrajectoryIntent(segment.text, currentRole);
          const trajectoryIntel = calculateTrajectoryModifier(
            candidateTrajectory,
            narrationTrajectory,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // FF. Step 44: Optical Lens & Focal Perspective Intelligence (Capped within [-0.008, +0.008])
          const candidateLens = classifyOpticalLensPerspective(asset);
          const narrationLens = classifyNarrationLensIntent(segment.text, currentRole);
          const lensIntel = calculateLensModifier(
            candidateLens,
            narrationLens,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // GG. Step 45: Visual Texture & Surface Quality Intelligence (Capped within [-0.008, +0.008])
          const candidateTexture = classifyVisualTexture(asset);
          const narrationTexture = classifyNarrationTextureIntent(segment.text, currentRole);
          const textureIntel = calculateTextureModifier(
            candidateTexture,
            narrationTexture,
            transitionIntel.isConsecutiveContinuation,
            currentBeatInfo.narrationBeatType
          );

          // HH. Step 46: Global Visual Intelligence Budget & Aggregate Clamping
          const visualAggregate = calculateAggregateVisualIntelligence({
            framingModifier: framingIntel.modifier,
            atmosphericModifier: atmosphericIntel.modifier,
            motionModifier: motionIntel.modifier,
            settingModifier: settingIntel.modifier,
            densityModifier: densityIntel.modifier,
            angleModifier: angleIntel.modifier,
            timeModifier: timeIntel.modifier,
            weatherModifier: weatherIntel.modifier,
            depthModifier: depthIntel.modifier,
            temporalRateModifier: temporalRateIntel.modifier,
            mediumModifier: mediumIntel.modifier,
            compositionModifier: compositionIntel.modifier,
            lightingModifier: lightingIntel.modifier,
            povModifier: povIntel.modifier,
            chromaticModifier: chromaticIntel.modifier,
            trajectoryModifier: trajectoryIntel.modifier,
            lensModifier: lensIntel.modifier,
            textureModifier: textureIntel.modifier,
          });

          // N. Final Composite Score (Semantic is dominant, visual micro-modifiers bounded by Step 46 budget)
          const adjustedScore = Math.round(
            (attenuatedSemantic +
              typeBonus +
              durationBonus +
              transitionIntel.continuityBonus +
              temporal.totalBonus +
              roleModifier.bonus +
              beatModifier.bonus +
              varietyIntel.modifier +
              pacingIntel.modifier +
              pacingArcIntel.modifier +
              emphasisImpactIntel.modifier +
              contrastIntel.modifier +
              subjectContinuityIntel.modifier +
              visualAggregate.boundedVisualIntelligence -
              calculatedReusePenalty -
              transitionIntel.repetitionPenalty) *
              1000
          ) / 1000;

          // Build deterministic explanation
          let explanation = c.explanation || 'Semantic match';
          if (c.score >= 0.75) {
            explanation = 'Selected because transcript meaning strongly matches the analyzed scene concepts';
          } else if (transitionIntel.continuityBonus > 0) {
            explanation = 'Selected as a strong match with smooth thematic continuity with the previous shot';
          } else if (currentReuse > 0) {
            explanation = 'Selected despite prior reuse as the most semantically relevant available footage';
          } else if (c.score >= 0.50) {
            explanation = 'Selected as a solid semantic match for this voiceover section';
          } else {
            explanation = 'Selected as the closest available match above threshold (moderate confidence)';
          }

          if (temporal.reasonParts.length > 0) {
            explanation += `; ${temporal.reasonParts.join('; ')}.`;
          } else {
            explanation += '.';
          }

          return {
            ...c,
            asset,
            rawScore: c.score,
            adjustedScore,
            explanation,
            continuityBonus: transitionIntel.continuityBonus,
            continuityReason: transitionIntel.reason,
            isConsecutiveContinuation: transitionIntel.isConsecutiveContinuation,
            temporalBonus: temporal.totalBonus,
            isKeyMoment: temporal.isKeyMoment,
            hasVisualChange: temporal.hasVisualChange,
            temporalCoverageCount: temporal.temporalCoverageCount,
            reuseCount: currentReuse,
            narrationRole: currentRole,
            narrationRoleReason: narrationRoleInfo.reason,
            narrationBeatType: currentBeatInfo.narrationBeatType,
            beatId: currentBeatInfo.beatId,
            beatPosition: currentBeatInfo.beatPosition,
            beatLength: currentBeatInfo.beatLength,
            beatReason: currentBeatInfo.beatReason,
            visualVarietyModifier: varietyIntel.modifier,
            visualSimilarity: varietyIntel.visualSimilarity,
            visualVarietyReason: varietyIntel.reason,
            pacingModifier: pacingIntel.modifier,
            pacingClass: pacingIntel.pacingClass,
            pacingReason: pacingIntel.reason,
            pacingArcModifier: pacingArcIntel.modifier,
            pacingArcReason: pacingArcIntel.reason,
            visualImpactScore,
            emphasisImpactModifier: emphasisImpactIntel.modifier,
            emphasisImpactReason: emphasisImpactIntel.reason,
            visualState,
            narrationVisualContrastModifier: contrastIntel.modifier,
            narrationVisualContrastReason: contrastIntel.reason,
            subjectContinuityModifier: subjectContinuityIntel.modifier,
            subjectContinuity: subjectContinuityIntel.subjectContinuity,
            subjectContinuityReason: subjectContinuityIntel.reason,
            subjectMatchScore: subjectContinuityIntel.subjectMatchScore,
            framingScale: framingIntel.framingScale,
            framingModifier: framingIntel.modifier,
            framingReason: framingIntel.reason,
            framingMatchScore: framingIntel.framingMatchScore,
            atmosphericTone: atmosphericIntel.atmosphericTone,
            atmosphericModifier: atmosphericIntel.modifier,
            atmosphericReason: atmosphericIntel.reason,
            atmosphericMatchScore: atmosphericIntel.atmosphericMatchScore,
            cameraMotion: motionIntel.cameraMotion,
            motionModifier: motionIntel.modifier,
            motionReason: motionIntel.reason,
            motionMatchScore: motionIntel.motionMatchScore,
            sceneSetting: settingIntel.sceneSetting,
            settingModifier: settingIntel.modifier,
            settingReason: settingIntel.reason,
            settingMatchScore: settingIntel.settingMatchScore,
            subjectDensity: densityIntel.subjectDensity,
            densityModifier: densityIntel.modifier,
            densityReason: densityIntel.reason,
            densityMatchScore: densityIntel.densityMatchScore,
            cameraAngle: angleIntel.cameraAngle,
            angleModifier: angleIntel.modifier,
            angleReason: angleIntel.reason,
            angleMatchScore: angleIntel.angleMatchScore,
            timeOfDay: timeIntel.timeOfDay,
            timeModifier: timeIntel.modifier,
            timeReason: timeIntel.reason,
            timeMatchScore: timeIntel.timeMatchScore,
            weatherCondition: weatherIntel.weatherCondition,
            weatherModifier: weatherIntel.modifier,
            weatherReason: weatherIntel.reason,
            weatherMatchScore: weatherIntel.weatherMatchScore,
            depthOfField: depthIntel.depthOfField,
            depthModifier: depthIntel.modifier,
            depthReason: depthIntel.reason,
            depthMatchScore: depthIntel.depthMatchScore,
            temporalRate: temporalRateIntel.temporalRate,
            temporalModifier: temporalRateIntel.modifier,
            temporalReason: temporalRateIntel.reason,
            temporalMatchScore: temporalRateIntel.temporalMatchScore,
            visualMedium: mediumIntel.visualMedium,
            mediumModifier: mediumIntel.modifier,
            mediumReason: mediumIntel.reason,
            mediumMatchScore: mediumIntel.mediumMatchScore,
            compositionBalance: compositionIntel.compositionBalance,
            compositionModifier: compositionIntel.modifier,
            compositionReason: compositionIntel.reason,
            compositionMatchScore: compositionIntel.compositionMatchScore,
            lightingSetup: lightingIntel.lightingSetup,
            lightingModifier: lightingIntel.modifier,
            lightingReason: lightingIntel.reason,
            lightingMatchScore: lightingIntel.lightingMatchScore,
            pointOfView: povIntel.pointOfView,
            povModifier: povIntel.modifier,
            povReason: povIntel.reason,
            povMatchScore: povIntel.povMatchScore,
            chromaticGrading: chromaticIntel.chromaticGrading,
            chromaticModifier: chromaticIntel.modifier,
            chromaticReason: chromaticIntel.reason,
            chromaticMatchScore: chromaticIntel.chromaticMatchScore,
            actionTrajectory: trajectoryIntel.actionTrajectory,
            trajectoryModifier: trajectoryIntel.modifier,
            trajectoryReason: trajectoryIntel.reason,
            trajectoryMatchScore: trajectoryIntel.trajectoryMatchScore,
            lensPerspective: lensIntel.lensPerspective,
            lensModifier: lensIntel.modifier,
            lensReason: lensIntel.reason,
            lensMatchScore: lensIntel.lensMatchScore,
            visualTexture: textureIntel.visualTexture,
            textureModifier: textureIntel.modifier,
            textureReason: textureIntel.reason,
            textureMatchScore: textureIntel.textureMatchScore,
            rawVisualIntelligence: visualAggregate.rawVisualIntelligence,
            boundedVisualIntelligence: visualAggregate.boundedVisualIntelligence,
            visualIntelligenceBudget: visualAggregate.visualIntelligenceBudget,
            semanticRankingProtectionApplied: undefined as boolean | undefined,
            semanticRankingProtectionReason: undefined as string | undefined,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      const scoredCandidates = applySemanticRankingProtection(rawScoredCandidates);

      const bestCandidate = scoredCandidates[0];

      // Step 48: Candidate Confidence & Selection Margin Intelligence (observational only)
      const candidateConfidence = bestCandidate
        ? calculateCandidateConfidence(bestCandidate, scoredCandidates[1])
        : null;

      // If no candidate satisfies the threshold after evaluation, leave segment unassigned
      if (!bestCandidate || bestCandidate.adjustedScore < similarityThreshold * 0.6) {
        const topRawScore = matchResult.candidates[0]?.score || 0;
        const reason = `No candidate met similarity threshold (${topRawScore.toFixed(2)} raw vs ${similarityThreshold.toFixed(2)} min)`;
        unassignedSegmentIds.push(segment.id);
        unassignedReasons[segment.id] = reason;
        unassignedDetails.push({
          id: segment.id,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segmentDuration,
          text: segment.text,
          reason,
        });
        previousAssignedAsset = null;
        previousAssignedMediaId = null;
        previousAssignedTimelineItem = null;
        previousAssignedBeatId = null;
        recentPacingClasses = [];
        continue;
      }

      const selectedAsset = bestCandidate.asset;

      // 4. Calculate timing and valid source duration
      let itemDuration: number;
      let sourceDuration: number;
      let sourceStart = 0.0;
      let selectedTimestamp: number | undefined = undefined;
      let temporalSelectionReason: string | undefined = undefined;

      if (selectedAsset.type === 'video') {
        const nativeDur = selectedAsset.duration || segmentDuration;
        sourceDuration = nativeDur;

        // Step 17: Optimal Temporal Source-Start Selection (Media score first, sourceStart second)
        const sourceTiming = selectOptimalSourceStart(
          selectedAsset,
          segment.text,
          segmentDuration,
          bestCandidate.matchedSnippet
        );
        sourceStart = sourceTiming.sourceStart;
        if (sourceTiming.isOptimized) {
          selectedTimestamp = sourceTiming.selectedTimestamp;
          temporalSelectionReason = sourceTiming.reason;
          sourceStartsOptimizedCount++;
        }
      } else {
        // Image asset covers full segment duration
        sourceDuration = 5.0;
      }

      // Step 18: AI Draft Shot Duration Refinement (Media score -> sourceStart -> duration)
      const durationRefinement = refineShotDuration(
        selectedAsset,
        segmentDuration,
        sourceStart,
        segment.text
      );

      itemDuration = durationRefinement.duration;
      if (durationRefinement.isAdjusted) {
        durationAdjustmentsCount++;
        if (selectedAsset.type === 'video' && itemDuration < segmentDuration) {
          warnings.push(
            `"${selectedAsset.name}" footage ends before transcript segment (${itemDuration.toFixed(1)}s vs ${segmentDuration.toFixed(1)}s), leaving an uncovered gap.`
          );
        }
      }

      // Default transform: Centered 16:9 'cover' framing (Deep-cloned to guarantee strict isolation)
      const defaultTransform: TransformState = JSON.parse(
        JSON.stringify(createDefaultTransform(selectedAsset.width, selectedAsset.height))
      );

      // Provenance tracking (Step 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 & 26)
      const timelineItem: TimelineItem = {
        id: `draft_${segment.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        mediaId: selectedAsset.id,
        trackIndex: 0,
        startTime: segment.startTime,
        duration: itemDuration,
        sourceStart,
        sourceDuration,
        transform: defaultTransform,
        provenance: {
          sourceSegmentId: segment.id,
          sourceSegmentText: segment.text,
          originalScore: bestCandidate.rawScore,
          adjustedScore: bestCandidate.adjustedScore,
          explanation: bestCandidate.explanation,
          reuseCount: bestCandidate.reuseCount,
          continuityBonus: bestCandidate.continuityBonus,
          continuityReason: bestCandidate.continuityReason,
          isConsecutiveContinuation: bestCandidate.isConsecutiveContinuation,
          temporalBonus: bestCandidate.temporalBonus,
          isKeyMoment: bestCandidate.isKeyMoment,
          hasVisualChange: bestCandidate.hasVisualChange,
          temporalCoverageCount: bestCandidate.temporalCoverageCount,
          selectedSourceTimestamp: selectedTimestamp,
          temporalSelectionReason: temporalSelectionReason,
          originalSegmentDuration: durationRefinement.originalSegmentDuration,
          selectedDuration: durationRefinement.duration,
          durationAdjustmentReason: durationRefinement.reason,
          narrationRole: bestCandidate.narrationRole,
          narrationRoleReason: bestCandidate.narrationRoleReason,
          narrationBeatType: bestCandidate.narrationBeatType,
          beatId: bestCandidate.beatId,
          beatPosition: bestCandidate.beatPosition,
          beatLength: bestCandidate.beatLength,
          beatReason: bestCandidate.beatReason,
          visualVarietyModifier: bestCandidate.visualVarietyModifier,
          visualSimilarity: bestCandidate.visualSimilarity,
          visualVarietyReason: bestCandidate.visualVarietyReason,
          pacingModifier: bestCandidate.pacingModifier,
          pacingClass: bestCandidate.pacingClass,
          pacingReason: bestCandidate.pacingReason,
          pacingArcModifier: bestCandidate.pacingArcModifier,
          pacingArcReason: bestCandidate.pacingArcReason,
          visualImpactScore: bestCandidate.visualImpactScore,
          emphasisImpactModifier: bestCandidate.emphasisImpactModifier,
          emphasisImpactReason: bestCandidate.emphasisImpactReason,
          visualState: bestCandidate.visualState,
          narrationVisualContrastModifier: bestCandidate.narrationVisualContrastModifier,
          narrationVisualContrastReason: bestCandidate.narrationVisualContrastReason,
          subjectContinuityModifier: bestCandidate.subjectContinuityModifier,
          subjectContinuity: bestCandidate.subjectContinuity,
          subjectContinuityReason: bestCandidate.subjectContinuityReason,
          subjectMatchScore: bestCandidate.subjectMatchScore,
          framingScale: bestCandidate.framingScale,
          framingModifier: bestCandidate.framingModifier,
          framingReason: bestCandidate.framingReason,
          framingMatchScore: bestCandidate.framingMatchScore,
          atmosphericTone: bestCandidate.atmosphericTone,
          atmosphericModifier: bestCandidate.atmosphericModifier,
          atmosphericReason: bestCandidate.atmosphericReason,
          atmosphericMatchScore: bestCandidate.atmosphericMatchScore,
          cameraMotion: bestCandidate.cameraMotion,
          motionModifier: bestCandidate.motionModifier,
          motionReason: bestCandidate.motionReason,
          motionMatchScore: bestCandidate.motionMatchScore,
          sceneSetting: bestCandidate.sceneSetting,
          settingModifier: bestCandidate.settingModifier,
          settingReason: bestCandidate.settingReason,
          settingMatchScore: bestCandidate.settingMatchScore,
          subjectDensity: bestCandidate.subjectDensity,
          densityModifier: bestCandidate.densityModifier,
          densityReason: bestCandidate.densityReason,
          densityMatchScore: bestCandidate.densityMatchScore,
          cameraAngle: bestCandidate.cameraAngle,
          angleModifier: bestCandidate.angleModifier,
          angleReason: bestCandidate.angleReason,
          angleMatchScore: bestCandidate.angleMatchScore,
          timeOfDay: bestCandidate.timeOfDay,
          timeModifier: bestCandidate.timeModifier,
          timeReason: bestCandidate.timeReason,
          timeMatchScore: bestCandidate.timeMatchScore,
          weatherCondition: bestCandidate.weatherCondition,
          weatherModifier: bestCandidate.weatherModifier,
          weatherReason: bestCandidate.weatherReason,
          weatherMatchScore: bestCandidate.weatherMatchScore,
          depthOfField: bestCandidate.depthOfField,
          depthModifier: bestCandidate.depthModifier,
          depthReason: bestCandidate.depthReason,
          depthMatchScore: bestCandidate.depthMatchScore,
          temporalRate: bestCandidate.temporalRate,
          temporalModifier: bestCandidate.temporalModifier,
          temporalReason: bestCandidate.temporalReason,
          temporalMatchScore: bestCandidate.temporalMatchScore,
          visualMedium: bestCandidate.visualMedium,
          mediumModifier: bestCandidate.mediumModifier,
          mediumReason: bestCandidate.mediumReason,
          mediumMatchScore: bestCandidate.mediumMatchScore,
          compositionBalance: bestCandidate.compositionBalance,
          compositionModifier: bestCandidate.compositionModifier,
          compositionReason: bestCandidate.compositionReason,
          compositionMatchScore: bestCandidate.compositionMatchScore,
          lightingSetup: bestCandidate.lightingSetup,
          lightingModifier: bestCandidate.lightingModifier,
          lightingReason: bestCandidate.lightingReason,
          lightingMatchScore: bestCandidate.lightingMatchScore,
          pointOfView: bestCandidate.pointOfView,
          povModifier: bestCandidate.povModifier,
          povReason: bestCandidate.povReason,
          povMatchScore: bestCandidate.povMatchScore,
          chromaticGrading: bestCandidate.chromaticGrading,
          chromaticModifier: bestCandidate.chromaticModifier,
          chromaticReason: bestCandidate.chromaticReason,
          chromaticMatchScore: bestCandidate.chromaticMatchScore,
          actionTrajectory: bestCandidate.actionTrajectory,
          trajectoryModifier: bestCandidate.trajectoryModifier,
          trajectoryReason: bestCandidate.trajectoryReason,
          trajectoryMatchScore: bestCandidate.trajectoryMatchScore,
          lensPerspective: bestCandidate.lensPerspective,
          lensModifier: bestCandidate.lensModifier,
          lensReason: bestCandidate.lensReason,
          lensMatchScore: bestCandidate.lensMatchScore,
          visualTexture: bestCandidate.visualTexture,
          textureModifier: bestCandidate.textureModifier,
          textureReason: bestCandidate.textureReason,
          textureMatchScore: bestCandidate.textureMatchScore,
          rawVisualIntelligence: bestCandidate.rawVisualIntelligence,
          boundedVisualIntelligence: bestCandidate.boundedVisualIntelligence,
          visualIntelligenceBudget: bestCandidate.visualIntelligenceBudget,
          semanticRankingProtectionApplied: bestCandidate.semanticRankingProtectionApplied,
          semanticRankingProtectionReason: bestCandidate.semanticRankingProtectionReason,
          candidateConfidenceScore: candidateConfidence?.candidateConfidenceScore,
          candidateConfidenceLevel: candidateConfidence?.candidateConfidenceLevel,
          selectionMargin: candidateConfidence?.selectionMargin,
          semanticMargin: candidateConfidence?.semanticMargin,
          semanticSeparation: candidateConfidence?.semanticSeparation,
          visualInfluence: candidateConfidence?.visualInfluence,
          isManuallyEdited: false,
          assignedAt: Date.now(),
        },
      };

      timelineItems.push(timelineItem);
      mediaReuseCount[selectedAsset.id] = (mediaReuseCount[selectedAsset.id] || 0) + 1;
      mediaTotalDuration[selectedAsset.id] = (mediaTotalDuration[selectedAsset.id] || 0) + itemDuration;
      if (previousAssignedMediaId === selectedAsset.id) {
        mediaConsecutiveFlag[selectedAsset.id] = true;
      }
      totalAssignedDuration += itemDuration;

      if (bestCandidate.continuityBonus > 0 || bestCandidate.isConsecutiveContinuation) {
        continuityLinksCount++;
      }

      previousAssignedAsset = selectedAsset;
      previousAssignedMediaId = selectedAsset.id;
      previousAssignedTimelineItem = timelineItem;
      previousAssignedBeatId = currentBeatInfo.beatId;

      // Update subject token tracking for continuous narration
      const assignedSubjTokens = extractSubjectTokens(segment.text);
      if (currentBeatInfo.narrationBeatType === 'NEW_BEAT' || currentBeatInfo.narrationBeatType === 'STANDALONE') {
        previousSubjectTokens = assignedSubjTokens;
      } else {
        previousSubjectTokens = assignedSubjTokens.length > 0 ? assignedSubjTokens : previousSubjectTokens;
      }

      // Update rolling pacing history (up to last 3 shots)
      if (bestCandidate.pacingClass) {
        recentPacingClasses = [...recentPacingClasses.slice(-2), bestCandidate.pacingClass];
      }
    } catch (err) {
      console.warn(`Draft generation for segment ${segment.id} error:`, err);
      const reason = err instanceof Error ? err.message : 'Error matching segment';
      unassignedSegmentIds.push(segment.id);
      unassignedReasons[segment.id] = reason;
      unassignedDetails.push({
        id: segment.id,
        startTime: segment.startTime,
        endTime: segment.endTime,
        duration: segmentDuration,
        text: segment.text,
        reason,
      });
      previousAssignedAsset = null;
      previousAssignedMediaId = null;
      previousAssignedBeatId = null;
      previousAssignedTimelineItem = null;
      recentPacingClasses = [];
      previousSubjectTokens = [];
    }
  }

  const assignedSegments = timelineItems.length;
  const unassignedSegments = totalSegments - assignedSegments;
  const uniqueMediaUsed = Object.keys(mediaReuseCount).length;
  const coveragePercentage = totalSegments > 0 ? Math.round((assignedSegments / totalSegments) * 100) : 0;
  const unassignedDuration = Math.max(0, totalDuration - totalAssignedDuration);

  // Step 21: Count unique beats and segment types
  const uniqueBeatsCount = new Set(beatResults.map((b) => b.beatId)).size;
  const continuationSegmentsCount = beatResults.filter((b) => b.narrationBeatType === 'CONTINUING_BEAT' || b.narrationBeatType === 'BEAT_END').length;
  const standaloneSegmentsCount = beatResults.filter((b) => b.narrationBeatType === 'STANDALONE').length;

  // Step 22: Count visual variety metrics
  let varietyAdjustmentsCount = 0;
  let repetitionPenaltiesCount = 0;
  let visualVarietyBonusesCount = 0;
  for (const item of timelineItems) {
    const mod = item.provenance?.visualVarietyModifier ?? 0;
    if (Math.abs(mod) > 0.0001) {
      varietyAdjustmentsCount++;
      if (mod < 0) repetitionPenaltiesCount++;
      if (mod > 0) visualVarietyBonusesCount++;
    }
  }

  // Step 23, 24, 25, 26, 27, 28 & 29: Count pacing, rhythm, impact, contrast, subject continuity, framing & atmospheric metrics
  let pacingAdjustmentsCount = 0;
  let pacingArcAdjustmentsCount = 0;
  let emphasisImpactAdjustmentsCount = 0;
  let highImpactSelectionsCount = 0;
  let moderateImpactSelectionsCount = 0;
  let lowImpactSelectionsCount = 0;
  let contrastAdjustmentsCount = 0;
  let staticCompatibleSelectionsCount = 0;
  let dynamicCompatibleSelectionsCount = 0;
  let contrastWarningsCount = 0;
  let subjectContinuityAdjustmentsCount = 0;
  let highSubjectContinuitySelectionsCount = 0;
  let moderateSubjectContinuitySelectionsCount = 0;
  let lowSubjectContinuitySelectionsCount = 0;
  let framingAdjustmentsCount = 0;
  let wideFramingSelectionsCount = 0;
  let mediumFramingSelectionsCount = 0;
  let closeupFramingSelectionsCount = 0;
  let detailFramingSelectionsCount = 0;
  let framingBonusesCount = 0;
  let framingPenaltiesCount = 0;
  let atmosphericAdjustmentsCount = 0;
  let warmToneSelectionsCount = 0;
  let coolToneSelectionsCount = 0;
  let brightToneSelectionsCount = 0;
  let darkToneSelectionsCount = 0;
  let atmosphericBonusesCount = 0;
  let atmosphericPenaltiesCount = 0;
  let motionAdjustmentsCount = 0;
  let staticMotionSelectionsCount = 0;
  let dynamicMotionSelectionsCount = 0;
  let panningMotionSelectionsCount = 0;
  let zoomingMotionSelectionsCount = 0;
  let smoothMotionSelectionsCount = 0;
  let motionBonusesCount = 0;
  let motionPenaltiesCount = 0;
  let settingAdjustmentsCount = 0;
  let indoorSettingSelectionsCount = 0;
  let natureSettingSelectionsCount = 0;
  let urbanSettingSelectionsCount = 0;
  let abstractSettingSelectionsCount = 0;
  let settingBonusesCount = 0;
  let settingPenaltiesCount = 0;
  let densityAdjustmentsCount = 0;
  let soloSubjectSelectionsCount = 0;
  let duoSubjectSelectionsCount = 0;
  let groupSubjectSelectionsCount = 0;
  let crowdSubjectSelectionsCount = 0;
  let uninhabitedSelectionsCount = 0;
  let densityBonusesCount = 0;
  let densityPenaltiesCount = 0;
  let angleAdjustmentsCount = 0;
  let aerialAngleSelectionsCount = 0;
  let highAngleSelectionsCount = 0;
  let eyeLevelAngleSelectionsCount = 0;
  let lowAngleSelectionsCount = 0;
  let groundAngleSelectionsCount = 0;
  let angleBonusesCount = 0;
  let anglePenaltiesCount = 0;
  let timeAdjustmentsCount = 0;
  let daylightSelectionsCount = 0;
  let sunsetSelectionsCount = 0;
  let nightSelectionsCount = 0;
  let dawnSelectionsCount = 0;
  let timelessSelectionsCount = 0;
  let timeBonusesCount = 0;
  let timePenaltiesCount = 0;
  let weatherAdjustmentsCount = 0;
  let clearWeatherSelectionsCount = 0;
  let overcastWeatherSelectionsCount = 0;
  let rainWeatherSelectionsCount = 0;
  let snowWeatherSelectionsCount = 0;
  let fogWeatherSelectionsCount = 0;
  let weatherAgnosticSelectionsCount = 0;
  let weatherBonusesCount = 0;
  let weatherPenaltiesCount = 0;
  let depthAdjustmentsCount = 0;
  let shallowBokehSelectionsCount = 0;
  let deepFocusSelectionsCount = 0;
  let rackFocusSelectionsCount = 0;
  let softDreamySelectionsCount = 0;
  let depthAgnosticSelectionsCount = 0;
  let depthBonusesCount = 0;
  let depthPenaltiesCount = 0;
  let temporalRateAdjustmentsCount = 0;
  let realtimeSelectionsCount = 0;
  let slowMotionSelectionsCount = 0;
  let timelapseSelectionsCount = 0;
  let stopMotionSelectionsCount = 0;
  let temporalAgnosticSelectionsCount = 0;
  let temporalRateBonusesCount = 0;
  let temporalRatePenaltiesCount = 0;
  let mediumAdjustmentsCount = 0;
  let liveActionSelectionsCount = 0;
  let screencastSelectionsCount = 0;
  let animationSelectionsCount = 0;
  let cgi3dSelectionsCount = 0;
  let abstractGraphicSelectionsCount = 0;
  let mediumAgnosticSelectionsCount = 0;
  let mediumBonusesCount = 0;
  let mediumPenaltiesCount = 0;
  let compositionAdjustmentsCount = 0;
  let centeredSelectionsCount = 0;
  let leftThirdSelectionsCount = 0;
  let rightThirdSelectionsCount = 0;
  let distributedSelectionsCount = 0;
  let compositionAgnosticSelectionsCount = 0;
  let compositionBonusesCount = 0;
  let compositionPenaltiesCount = 0;
  let lightingAdjustmentsCount = 0;
  let frontalLightingSelectionsCount = 0;
  let sideLightingSelectionsCount = 0;
  let backlitSelectionsCount = 0;
  let overheadLightingSelectionsCount = 0;
  let diffuseLightingSelectionsCount = 0;
  let lightingAgnosticSelectionsCount = 0;
  let lightingBonusesCount = 0;
  let lightingPenaltiesCount = 0;
  let povAdjustmentsCount = 0;
  let firstPersonSelectionsCount = 0;
  let overTheShoulderSelectionsCount = 0;
  let directAddressSelectionsCount = 0;
  let observationalSelectionsCount = 0;
  let povAgnosticSelectionsCount = 0;
  let povBonusesCount = 0;
  let povPenaltiesCount = 0;
  let chromaticAdjustmentsCount = 0;
  let monochromeSelectionsCount = 0;
  let vibrantSelectionsCount = 0;
  let mutedSelectionsCount = 0;
  let sepiaDuotoneSelectionsCount = 0;
  let naturalChromaticSelectionsCount = 0;
  let chromaticAgnosticSelectionsCount = 0;
  let chromaticBonusesCount = 0;
  let chromaticPenaltiesCount = 0;
  let trajectoryAdjustmentsCount = 0;
  let approachingSelectionsCount = 0;
  let recedingSelectionsCount = 0;
  let leftToRightSelectionsCount = 0;
  let rightToLeftSelectionsCount = 0;
  let rotationalSelectionsCount = 0;
  let trajectoryAgnosticSelectionsCount = 0;
  let trajectoryBonusesCount = 0;
  let trajectoryPenaltiesCount = 0;
  let lensAdjustmentsCount = 0;
  let fisheyeSelectionsCount = 0;
  let wideAngleSelectionsCount = 0;
  let standardLensSelectionsCount = 0;
  let telephotoSelectionsCount = 0;
  let macroSelectionsCount = 0;
  let lensAgnosticSelectionsCount = 0;
  let lensBonusesCount = 0;
  let lensPenaltiesCount = 0;
  let textureAdjustmentsCount = 0;
  let pristineDigitalSelectionsCount = 0;
  let filmGrainSelectionsCount = 0;
  let analogVhsSelectionsCount = 0;
  let grittyNoiseSelectionsCount = 0;
  let diffusionGlowSelectionsCount = 0;
  let textureAgnosticSelectionsCount = 0;
  let textureBonusesCount = 0;
  let texturePenaltiesCount = 0;
  let visualBudgetAdjustmentsCount = 0;
  let visualBudgetClampedBonusesCount = 0;
  let visualBudgetClampedPenaltiesCount = 0;
  let semanticProtectionAdjustmentsCount = 0;
  let highConfidenceSelectionsCount = 0;
  let moderateConfidenceSelectionsCount = 0;
  let lowConfidenceSelectionsCount = 0;
  let totalSelectionMarginSum = 0;
  let quickPacingSelectionsCount = 0;
  let normalPacingSelectionsCount = 0;
  let lingeringPacingSelectionsCount = 0;
  for (const item of timelineItems) {
    if (item.provenance?.semanticRankingProtectionApplied) {
      semanticProtectionAdjustmentsCount++;
    }
    // Step 48: confidence counters
    const confLevel = item.provenance?.candidateConfidenceLevel;
    if (confLevel === 'HIGH') highConfidenceSelectionsCount++;
    else if (confLevel === 'MODERATE') moderateConfidenceSelectionsCount++;
    else lowConfidenceSelectionsCount++;
    const sm = item.provenance?.selectionMargin;
    if (typeof sm === 'number') {
      totalSelectionMarginSum += sm;
    }
    const rawVis = item.provenance?.rawVisualIntelligence ?? 0;
    const boundedVis = item.provenance?.boundedVisualIntelligence ?? 0;
    if (Math.abs(boundedVis) > 0.0001) {
      visualBudgetAdjustmentsCount++;
    }
    if (rawVis > GLOBAL_VISUAL_INTELLIGENCE_BUDGET + 0.0001) {
      visualBudgetClampedBonusesCount++;
    }
    if (rawVis < -GLOBAL_VISUAL_INTELLIGENCE_BUDGET - 0.0001) {
      visualBudgetClampedPenaltiesCount++;
    }
    const pMod = item.provenance?.pacingModifier ?? 0;
    if (Math.abs(pMod) > 0.0001) {
      pacingAdjustmentsCount++;
    }
    const paMod = item.provenance?.pacingArcModifier ?? 0;
    if (Math.abs(paMod) > 0.0001) {
      pacingArcAdjustmentsCount++;
    }
    const eiMod = item.provenance?.emphasisImpactModifier ?? 0;
    if (Math.abs(eiMod) > 0.0001) {
      emphasisImpactAdjustmentsCount++;
    }
    const impScore = item.provenance?.visualImpactScore ?? 0;
    if (impScore >= 0.70) highImpactSelectionsCount++;
    else if (impScore >= 0.40) moderateImpactSelectionsCount++;
    else lowImpactSelectionsCount++;

    const cMod = item.provenance?.narrationVisualContrastModifier ?? 0;
    if (Math.abs(cMod) > 0.0001) {
      contrastAdjustmentsCount++;
      if (cMod > 0) {
        if (item.provenance?.visualState === 'STATIC' || item.provenance?.visualState === 'STABLE') {
          staticCompatibleSelectionsCount++;
        } else {
          dynamicCompatibleSelectionsCount++;
        }
      } else if (cMod < 0) {
        contrastWarningsCount++;
      }
    }

    const scMod = item.provenance?.subjectContinuityModifier ?? 0;
    if (Math.abs(scMod) > 0.0001) {
      subjectContinuityAdjustmentsCount++;
    }
    const scLevel = item.provenance?.subjectContinuity;
    if (scLevel === 'HIGH') highSubjectContinuitySelectionsCount++;
    else if (scLevel === 'MODERATE') moderateSubjectContinuitySelectionsCount++;
    else if (scLevel === 'LOW') lowSubjectContinuitySelectionsCount++;

    const fMod = item.provenance?.framingModifier ?? 0;
    if (Math.abs(fMod) > 0.0001) {
      framingAdjustmentsCount++;
      if (fMod > 0) framingBonusesCount++;
      if (fMod < 0) framingPenaltiesCount++;
    }
    const fScale = item.provenance?.framingScale;
    if (fScale === 'WIDE') wideFramingSelectionsCount++;
    else if (fScale === 'MEDIUM') mediumFramingSelectionsCount++;
    else if (fScale === 'CLOSEUP') closeupFramingSelectionsCount++;
    else if (fScale === 'DETAIL') detailFramingSelectionsCount++;

    const aMod = item.provenance?.atmosphericModifier ?? 0;
    if (Math.abs(aMod) > 0.0001) {
      atmosphericAdjustmentsCount++;
      if (aMod > 0) atmosphericBonusesCount++;
      if (aMod < 0) atmosphericPenaltiesCount++;
    }
    const aTone = item.provenance?.atmosphericTone;
    if (aTone === 'WARM_VIBRANT') warmToneSelectionsCount++;
    else if (aTone === 'COOL_MUTED') coolToneSelectionsCount++;
    else if (aTone === 'HIGH_KEY_BRIGHT') brightToneSelectionsCount++;
    else if (aTone === 'LOW_KEY_DARK') darkToneSelectionsCount++;

    const mMod = item.provenance?.motionModifier ?? 0;
    if (Math.abs(mMod) > 0.0001) {
      motionAdjustmentsCount++;
      if (mMod > 0) motionBonusesCount++;
      if (mMod < 0) motionPenaltiesCount++;
    }
    const cMotion = item.provenance?.cameraMotion;
    if (cMotion === 'STATIC_LOCKED') staticMotionSelectionsCount++;
    else if (cMotion === 'DYNAMIC_ACTION') dynamicMotionSelectionsCount++;
    else if (cMotion === 'PANNING_SWEEP') panningMotionSelectionsCount++;
    else if (cMotion === 'ZOOMING_FOCUS') zoomingMotionSelectionsCount++;
    else if (cMotion === 'SMOOTH_FLOAT') smoothMotionSelectionsCount++;

    const sMod = item.provenance?.settingModifier ?? 0;
    if (Math.abs(sMod) > 0.0001) {
      settingAdjustmentsCount++;
      if (sMod > 0) settingBonusesCount++;
      if (sMod < 0) settingPenaltiesCount++;
    }
    const cSetting = item.provenance?.sceneSetting;
    if (cSetting === 'INDOOR_INTERIOR') indoorSettingSelectionsCount++;
    else if (cSetting === 'OUTDOOR_NATURAL') natureSettingSelectionsCount++;
    else if (cSetting === 'OUTDOOR_URBAN') urbanSettingSelectionsCount++;
    else if (cSetting === 'STUDIO_ABSTRACT') abstractSettingSelectionsCount++;

    const dMod = item.provenance?.densityModifier ?? 0;
    if (Math.abs(dMod) > 0.0001) {
      densityAdjustmentsCount++;
      if (dMod > 0) densityBonusesCount++;
      if (dMod < 0) densityPenaltiesCount++;
    }
    const sDensity = item.provenance?.subjectDensity;
    if (sDensity === 'SOLO_INDIVIDUAL') soloSubjectSelectionsCount++;
    else if (sDensity === 'DUO_INTERACTION') duoSubjectSelectionsCount++;
    else if (sDensity === 'GROUP_TEAM') groupSubjectSelectionsCount++;
    else if (sDensity === 'CROWD_AUDIENCE') crowdSubjectSelectionsCount++;
    else if (sDensity === 'UNINHABITED_OBJECT') uninhabitedSelectionsCount++;

    const angMod = item.provenance?.angleModifier ?? 0;
    if (Math.abs(angMod) > 0.0001) {
      angleAdjustmentsCount++;
      if (angMod > 0) angleBonusesCount++;
      if (angMod < 0) anglePenaltiesCount++;
    }
    const cAngle = item.provenance?.cameraAngle;
    if (cAngle === 'AERIAL_OVERHEAD') aerialAngleSelectionsCount++;
    else if (cAngle === 'HIGH_ANGLE') highAngleSelectionsCount++;
    else if (cAngle === 'EYE_LEVEL') eyeLevelAngleSelectionsCount++;
    else if (cAngle === 'LOW_ANGLE') lowAngleSelectionsCount++;
    else if (cAngle === 'GROUND_LEVEL') groundAngleSelectionsCount++;

    const tMod = item.provenance?.timeModifier ?? 0;
    if (Math.abs(tMod) > 0.0001) {
      timeAdjustmentsCount++;
      if (tMod > 0) timeBonusesCount++;
      if (tMod < 0) timePenaltiesCount++;
    }
    const cTime = item.provenance?.timeOfDay;
    if (cTime === 'DAYLIGHT_CLEAR') daylightSelectionsCount++;
    else if (cTime === 'GOLDEN_HOUR_SUNSET') sunsetSelectionsCount++;
    else if (cTime === 'NIGHT_NOCTURNAL') nightSelectionsCount++;
    else if (cTime === 'DAWN_TWILIGHT') dawnSelectionsCount++;
    else if (cTime === 'TIME_AGNOSTIC') timelessSelectionsCount++;

    const wMod = item.provenance?.weatherModifier ?? 0;
    if (Math.abs(wMod) > 0.0001) {
      weatherAdjustmentsCount++;
      if (wMod > 0) weatherBonusesCount++;
      if (wMod < 0) weatherPenaltiesCount++;
    }
    const cWeather = item.provenance?.weatherCondition;
    if (cWeather === 'CLEAR_FAIR') clearWeatherSelectionsCount++;
    else if (cWeather === 'OVERCAST_CLOUDY') overcastWeatherSelectionsCount++;
    else if (cWeather === 'RAIN_STORMY') rainWeatherSelectionsCount++;
    else if (cWeather === 'SNOW_FROST') snowWeatherSelectionsCount++;
    else if (cWeather === 'FOG_MIST') fogWeatherSelectionsCount++;
    else if (cWeather === 'WEATHER_AGNOSTIC') weatherAgnosticSelectionsCount++;

    const dOfMod = item.provenance?.depthModifier ?? 0;
    if (Math.abs(dOfMod) > 0.0001) {
      depthAdjustmentsCount++;
      if (dOfMod > 0) depthBonusesCount++;
      if (dOfMod < 0) depthPenaltiesCount++;
    }
    const cDepth = item.provenance?.depthOfField;
    if (cDepth === 'SHALLOW_BOKEH') shallowBokehSelectionsCount++;
    else if (cDepth === 'DEEP_FOCUS') deepFocusSelectionsCount++;
    else if (cDepth === 'RACK_FOCUS') rackFocusSelectionsCount++;
    else if (cDepth === 'SOFT_DREAMY') softDreamySelectionsCount++;
    else if (cDepth === 'DEPTH_AGNOSTIC') depthAgnosticSelectionsCount++;

    const tempRateMod = item.provenance?.temporalModifier ?? 0;
    if (Math.abs(tempRateMod) > 0.0001) {
      temporalRateAdjustmentsCount++;
      if (tempRateMod > 0) temporalRateBonusesCount++;
      if (tempRateMod < 0) temporalRatePenaltiesCount++;
    }
    const cTempRate = item.provenance?.temporalRate;
    if (cTempRate === 'REALTIME_STANDARD') realtimeSelectionsCount++;
    else if (cTempRate === 'SLOW_MOTION') slowMotionSelectionsCount++;
    else if (cTempRate === 'TIMELAPSE_HYPERLAPSE') timelapseSelectionsCount++;
    else if (cTempRate === 'STOP_MOTION_FREEZE') stopMotionSelectionsCount++;
    else if (cTempRate === 'TEMPORAL_AGNOSTIC') temporalAgnosticSelectionsCount++;

    const medMod = item.provenance?.mediumModifier ?? 0;
    if (Math.abs(medMod) > 0.0001) {
      mediumAdjustmentsCount++;
      if (medMod > 0) mediumBonusesCount++;
      if (medMod < 0) mediumPenaltiesCount++;
    }
    const cMedium = item.provenance?.visualMedium;
    if (cMedium === 'LIVE_ACTION_REALISM') liveActionSelectionsCount++;
    else if (cMedium === 'SCREENCAST_UI') screencastSelectionsCount++;
    else if (cMedium === 'ANIMATION_2D') animationSelectionsCount++;
    else if (cMedium === 'CGI_3D_RENDER') cgi3dSelectionsCount++;
    else if (cMedium === 'ABSTRACT_GRAPHIC') abstractGraphicSelectionsCount++;
    else if (cMedium === 'MEDIUM_AGNOSTIC') mediumAgnosticSelectionsCount++;

    const compMod = item.provenance?.compositionModifier ?? 0;
    if (Math.abs(compMod) > 0.0001) {
      compositionAdjustmentsCount++;
      if (compMod > 0) compositionBonusesCount++;
      if (compMod < 0) compositionPenaltiesCount++;
    }
    const cBalance = item.provenance?.compositionBalance;
    if (cBalance === 'CENTERED_SYMMETRIC') centeredSelectionsCount++;
    else if (cBalance === 'RULE_OF_THIRDS_LEFT') leftThirdSelectionsCount++;
    else if (cBalance === 'RULE_OF_THIRDS_RIGHT') rightThirdSelectionsCount++;
    else if (cBalance === 'DISTRIBUTED_BALANCED') distributedSelectionsCount++;
    else if (cBalance === 'COMPOSITION_AGNOSTIC') compositionAgnosticSelectionsCount++;

    const lightMod = item.provenance?.lightingModifier ?? 0;
    if (Math.abs(lightMod) > 0.0001) {
      lightingAdjustmentsCount++;
      if (lightMod > 0) lightingBonusesCount++;
      if (lightMod < 0) lightingPenaltiesCount++;
    }
    const cLighting = item.provenance?.lightingSetup;
    if (cLighting === 'FRONTAL_DIRECT') frontalLightingSelectionsCount++;
    else if (cLighting === 'SIDE_SPLIT_DRAMATIC') sideLightingSelectionsCount++;
    else if (cLighting === 'BACKLIT_SILHOUETTE') backlitSelectionsCount++;
    else if (cLighting === 'TOP_DOWN_OVERHEAD') overheadLightingSelectionsCount++;
    else if (cLighting === 'DIFFUSE_AMBIENT') diffuseLightingSelectionsCount++;
    else if (cLighting === 'LIGHTING_AGNOSTIC') lightingAgnosticSelectionsCount++;

    const povMod = item.provenance?.povModifier ?? 0;
    if (Math.abs(povMod) > 0.0001) {
      povAdjustmentsCount++;
      if (povMod > 0) povBonusesCount++;
      if (povMod < 0) povPenaltiesCount++;
    }
    const cPOV = item.provenance?.pointOfView;
    if (cPOV === 'FIRST_PERSON_POV') firstPersonSelectionsCount++;
    else if (cPOV === 'OVER_THE_SHOULDER') overTheShoulderSelectionsCount++;
    else if (cPOV === 'DIRECT_ADDRESS') directAddressSelectionsCount++;
    else if (cPOV === 'OBJECTIVE_OBSERVATIONAL') observationalSelectionsCount++;
    else if (cPOV === 'POV_AGNOSTIC') povAgnosticSelectionsCount++;

    const chromMod = item.provenance?.chromaticModifier ?? 0;
    if (Math.abs(chromMod) > 0.0001) {
      chromaticAdjustmentsCount++;
      if (chromMod > 0) chromaticBonusesCount++;
      if (chromMod < 0) chromaticPenaltiesCount++;
    }
    const cChrom = item.provenance?.chromaticGrading;
    if (cChrom === 'MONOCHROME_GRAYSCALE') monochromeSelectionsCount++;
    else if (cChrom === 'VIBRANT_SATURATED') vibrantSelectionsCount++;
    else if (cChrom === 'MUTED_DESATURATED') mutedSelectionsCount++;
    else if (cChrom === 'WARM_SEPIA_DUOTONE') sepiaDuotoneSelectionsCount++;
    else if (cChrom === 'NATURAL_BALANCED') naturalChromaticSelectionsCount++;
    else if (cChrom === 'CHROMATIC_AGNOSTIC') chromaticAgnosticSelectionsCount++;

    const trajMod = item.provenance?.trajectoryModifier ?? 0;
    if (Math.abs(trajMod) > 0.0001) {
      trajectoryAdjustmentsCount++;
      if (trajMod > 0) trajectoryBonusesCount++;
      if (trajMod < 0) trajectoryPenaltiesCount++;
    }
    const cTraj = item.provenance?.actionTrajectory;
    if (cTraj === 'APPROACHING_CAMERA') approachingSelectionsCount++;
    else if (cTraj === 'RECEDING_DEPTH') recedingSelectionsCount++;
    else if (cTraj === 'LATERAL_LEFT_TO_RIGHT') leftToRightSelectionsCount++;
    else if (cTraj === 'LATERAL_RIGHT_TO_LEFT') rightToLeftSelectionsCount++;
    else if (cTraj === 'ROTATIONAL_AXIAL') rotationalSelectionsCount++;
    else if (cTraj === 'TRAJECTORY_AGNOSTIC') trajectoryAgnosticSelectionsCount++;

    const lMod = item.provenance?.lensModifier ?? 0;
    if (Math.abs(lMod) > 0.0001) {
      lensAdjustmentsCount++;
      if (lMod > 0) lensBonusesCount++;
      if (lMod < 0) lensPenaltiesCount++;
    }
    const cLens = item.provenance?.lensPerspective;
    if (cLens === 'FISHEYE_ULTRAWIDE') fisheyeSelectionsCount++;
    else if (cLens === 'WIDE_ANGLE_EXPANSIVE') wideAngleSelectionsCount++;
    else if (cLens === 'STANDARD_NORMAL') standardLensSelectionsCount++;
    else if (cLens === 'TELEPHOTO_COMPRESSED') telephotoSelectionsCount++;
    else if (cLens === 'MACRO_MICROSCOPIC') macroSelectionsCount++;
    else if (cLens === 'LENS_AGNOSTIC') lensAgnosticSelectionsCount++;

    const texMod = item.provenance?.textureModifier ?? 0;
    if (Math.abs(texMod) > 0.0001) {
      textureAdjustmentsCount++;
      if (texMod > 0) textureBonusesCount++;
      if (texMod < 0) texturePenaltiesCount++;
    }
    const cTex = item.provenance?.visualTexture;
    if (cTex === 'CLEAN_PRISTINE_DIGITAL') pristineDigitalSelectionsCount++;
    else if (cTex === 'ORGANIC_FILM_GRAIN') filmGrainSelectionsCount++;
    else if (cTex === 'VINTAGE_ANALOG_VHS') analogVhsSelectionsCount++;
    else if (cTex === 'GRITTY_TEXTURED_NOISE') grittyNoiseSelectionsCount++;
    else if (cTex === 'ETHEREAL_DIFFUSION_GLOW') diffusionGlowSelectionsCount++;
    else if (cTex === 'TEXTURE_AGNOSTIC') textureAgnosticSelectionsCount++;

    const pClass = item.provenance?.pacingClass;
    if (pClass === 'QUICK') quickPacingSelectionsCount++;
    else if (pClass === 'LINGERING') lingeringPacingSelectionsCount++;
    else if (pClass === 'NORMAL') normalPacingSelectionsCount++;
  }

  // Generate media usage summary
  const mediaUsageSummary: MediaUsageItem[] = Object.keys(mediaReuseCount).map((mId) => {
    const asset = validAnalyzedMedia.find((m) => m.id === mId);
    return {
      mediaId: mId,
      mediaName: asset ? asset.name : 'Unknown Media',
      mediaType: asset ? asset.type : 'video',
      useCount: mediaReuseCount[mId] || 0,
      totalDuration: Math.round((mediaTotalDuration[mId] || 0) * 100) / 100,
      hasConsecutiveReuse: Boolean(mediaConsecutiveFlag[mId]),
    };
  });

  // Calculate warnings
  if (coveragePercentage < 70 && totalSegments > 0) {
    warnings.unshift(`Low coverage: ${coveragePercentage}% of narration has assigned visuals (${unassignedSegments} segment${unassignedSegments === 1 ? '' : 's'} uncovered).`);
  }
  if (unanalyzedCount > 0) {
    warnings.push(`${unanalyzedCount} media asset${unanalyzedCount === 1 ? '' : 's'} in library lacked semantic analysis and ${unanalyzedCount === 1 ? 'was' : 'were'} skipped.`);
  }
  Object.entries(mediaReuseCount).forEach(([mId, count]) => {
    if (count >= 3) {
      const asset = validAnalyzedMedia.find((m) => m.id === mId);
      warnings.push(`"${asset?.name || mId}" is reused ${count} times across the timeline.`);
    }
  });

  return {
    timeline: timelineItems,
    stats: {
      totalSegments,
      assignedSegments,
      unassignedSegments,
      totalDuration: Math.round(totalDuration * 100) / 100,
      assignedDuration: Math.round(totalAssignedDuration * 100) / 100,
      unassignedDuration: Math.round(unassignedDuration * 100) / 100,
      uniqueMediaUsed,
      mediaReuseCount,
      mediaUsageSummary,
      unassignedReasons,
      unassignedDetails,
      warnings,
      coveragePercentage,
      sourceStartsOptimized: sourceStartsOptimizedCount,
      durationAdjustmentsCount: durationAdjustmentsCount,
      continuityLinksCount: continuityLinksCount,
      roleBreakdown: roleCounts,
      beatCount: uniqueBeatsCount,
      continuationSegments: continuationSegmentsCount,
      standaloneSegments: standaloneSegmentsCount,
      varietyAdjustments: varietyAdjustmentsCount,
      repetitionPenalties: repetitionPenaltiesCount,
      visualVarietyBonuses: visualVarietyBonusesCount,
      pacingAdjustments: pacingAdjustmentsCount,
      pacingArcAdjustments: pacingArcAdjustmentsCount,
      emphasisImpactAdjustments: emphasisImpactAdjustmentsCount,
      highImpactSelections: highImpactSelectionsCount,
      moderateImpactSelections: moderateImpactSelectionsCount,
      lowImpactSelections: lowImpactSelectionsCount,
      contrastAdjustments: contrastAdjustmentsCount,
      staticCompatibleSelections: staticCompatibleSelectionsCount,
      dynamicCompatibleSelections: dynamicCompatibleSelectionsCount,
      contrastWarnings: contrastWarningsCount,
      subjectContinuityAdjustments: subjectContinuityAdjustmentsCount,
      highSubjectContinuitySelections: highSubjectContinuitySelectionsCount,
      moderateSubjectContinuitySelections: moderateSubjectContinuitySelectionsCount,
      lowSubjectContinuitySelections: lowSubjectContinuitySelectionsCount,
      framingAdjustments: framingAdjustmentsCount,
      wideFramingSelections: wideFramingSelectionsCount,
      mediumFramingSelections: mediumFramingSelectionsCount,
      closeupFramingSelections: closeupFramingSelectionsCount,
      detailFramingSelections: detailFramingSelectionsCount,
      framingBonuses: framingBonusesCount,
      framingPenalties: framingPenaltiesCount,
      atmosphericAdjustments: atmosphericAdjustmentsCount,
      warmToneSelections: warmToneSelectionsCount,
      coolToneSelections: coolToneSelectionsCount,
      brightToneSelections: brightToneSelectionsCount,
      darkToneSelections: darkToneSelectionsCount,
      atmosphericBonuses: atmosphericBonusesCount,
      atmosphericPenalties: atmosphericPenaltiesCount,
      motionAdjustments: motionAdjustmentsCount,
      staticMotionSelections: staticMotionSelectionsCount,
      dynamicMotionSelections: dynamicMotionSelectionsCount,
      panningMotionSelections: panningMotionSelectionsCount,
      zoomingMotionSelections: zoomingMotionSelectionsCount,
      smoothMotionSelections: smoothMotionSelectionsCount,
      motionBonuses: motionBonusesCount,
      motionPenalties: motionPenaltiesCount,
      settingAdjustments: settingAdjustmentsCount,
      indoorSettingSelections: indoorSettingSelectionsCount,
      natureSettingSelections: natureSettingSelectionsCount,
      urbanSettingSelections: urbanSettingSelectionsCount,
      abstractSettingSelections: abstractSettingSelectionsCount,
      settingBonuses: settingBonusesCount,
      settingPenalties: settingPenaltiesCount,
      densityAdjustments: densityAdjustmentsCount,
      soloSubjectSelections: soloSubjectSelectionsCount,
      duoSubjectSelections: duoSubjectSelectionsCount,
      groupSubjectSelections: groupSubjectSelectionsCount,
      crowdSubjectSelections: crowdSubjectSelectionsCount,
      uninhabitedSelections: uninhabitedSelectionsCount,
      densityBonuses: densityBonusesCount,
      densityPenalties: densityPenaltiesCount,
      angleAdjustments: angleAdjustmentsCount,
      aerialAngleSelections: aerialAngleSelectionsCount,
      highAngleSelections: highAngleSelectionsCount,
      eyeLevelAngleSelections: eyeLevelAngleSelectionsCount,
      lowAngleSelections: lowAngleSelectionsCount,
      groundAngleSelections: groundAngleSelectionsCount,
      angleBonuses: angleBonusesCount,
      anglePenalties: anglePenaltiesCount,
      timeAdjustments: timeAdjustmentsCount,
      daylightSelections: daylightSelectionsCount,
      sunsetSelections: sunsetSelectionsCount,
      nightSelections: nightSelectionsCount,
      dawnSelections: dawnSelectionsCount,
      timelessSelections: timelessSelectionsCount,
      timeBonuses: timeBonusesCount,
      timePenalties: timePenaltiesCount,
      weatherAdjustments: weatherAdjustmentsCount,
      clearWeatherSelections: clearWeatherSelectionsCount,
      overcastWeatherSelections: overcastWeatherSelectionsCount,
      rainWeatherSelections: rainWeatherSelectionsCount,
      snowWeatherSelections: snowWeatherSelectionsCount,
      fogWeatherSelections: fogWeatherSelectionsCount,
      weatherAgnosticSelections: weatherAgnosticSelectionsCount,
      weatherBonuses: weatherBonusesCount,
      weatherPenalties: weatherPenaltiesCount,
      depthAdjustments: depthAdjustmentsCount,
      shallowBokehSelections: shallowBokehSelectionsCount,
      deepFocusSelections: deepFocusSelectionsCount,
      rackFocusSelections: rackFocusSelectionsCount,
      softDreamySelections: softDreamySelectionsCount,
      depthAgnosticSelections: depthAgnosticSelectionsCount,
      depthBonuses: depthBonusesCount,
      depthPenalties: depthPenaltiesCount,
      temporalRateAdjustments: temporalRateAdjustmentsCount,
      realtimeSelections: realtimeSelectionsCount,
      slowMotionSelections: slowMotionSelectionsCount,
      timelapseSelections: timelapseSelectionsCount,
      stopMotionSelections: stopMotionSelectionsCount,
      temporalAgnosticSelections: temporalAgnosticSelectionsCount,
      temporalRateBonuses: temporalRateBonusesCount,
      temporalRatePenalties: temporalRatePenaltiesCount,
      mediumAdjustments: mediumAdjustmentsCount,
      liveActionSelections: liveActionSelectionsCount,
      screencastSelections: screencastSelectionsCount,
      animationSelections: animationSelectionsCount,
      cgi3dSelections: cgi3dSelectionsCount,
      abstractGraphicSelections: abstractGraphicSelectionsCount,
      mediumAgnosticSelections: mediumAgnosticSelectionsCount,
      mediumBonuses: mediumBonusesCount,
      mediumPenalties: mediumPenaltiesCount,
      compositionAdjustments: compositionAdjustmentsCount,
      centeredSelections: centeredSelectionsCount,
      leftThirdSelections: leftThirdSelectionsCount,
      rightThirdSelections: rightThirdSelectionsCount,
      distributedSelections: distributedSelectionsCount,
      compositionAgnosticSelections: compositionAgnosticSelectionsCount,
      compositionBonuses: compositionBonusesCount,
      compositionPenalties: compositionPenaltiesCount,
      lightingAdjustments: lightingAdjustmentsCount,
      frontalLightingSelections: frontalLightingSelectionsCount,
      sideLightingSelections: sideLightingSelectionsCount,
      backlitSelections: backlitSelectionsCount,
      overheadLightingSelections: overheadLightingSelectionsCount,
      diffuseLightingSelections: diffuseLightingSelectionsCount,
      lightingAgnosticSelections: lightingAgnosticSelectionsCount,
      lightingBonuses: lightingBonusesCount,
      lightingPenalties: lightingPenaltiesCount,
      povAdjustments: povAdjustmentsCount,
      firstPersonSelections: firstPersonSelectionsCount,
      overTheShoulderSelections: overTheShoulderSelectionsCount,
      directAddressSelections: directAddressSelectionsCount,
      observationalSelections: observationalSelectionsCount,
      povAgnosticSelections: povAgnosticSelectionsCount,
      povBonuses: povBonusesCount,
      povPenalties: povPenaltiesCount,
      chromaticAdjustments: chromaticAdjustmentsCount,
      monochromeSelections: monochromeSelectionsCount,
      vibrantSelections: vibrantSelectionsCount,
      mutedSelections: mutedSelectionsCount,
      sepiaDuotoneSelections: sepiaDuotoneSelectionsCount,
      naturalChromaticSelections: naturalChromaticSelectionsCount,
      chromaticAgnosticSelections: chromaticAgnosticSelectionsCount,
      chromaticBonuses: chromaticBonusesCount,
      chromaticPenalties: chromaticPenaltiesCount,
      trajectoryAdjustments: trajectoryAdjustmentsCount,
      approachingSelections: approachingSelectionsCount,
      recedingSelections: recedingSelectionsCount,
      leftToRightSelections: leftToRightSelectionsCount,
      rightToLeftSelections: rightToLeftSelectionsCount,
      rotationalSelections: rotationalSelectionsCount,
      trajectoryAgnosticSelections: trajectoryAgnosticSelectionsCount,
      trajectoryBonuses: trajectoryBonusesCount,
      trajectoryPenalties: trajectoryPenaltiesCount,
      lensAdjustments: lensAdjustmentsCount,
      fisheyeSelections: fisheyeSelectionsCount,
      wideAngleSelections: wideAngleSelectionsCount,
      standardLensSelections: standardLensSelectionsCount,
      telephotoSelections: telephotoSelectionsCount,
      macroSelections: macroSelectionsCount,
      lensAgnosticSelections: lensAgnosticSelectionsCount,
      lensBonuses: lensBonusesCount,
      lensPenalties: lensPenaltiesCount,
      textureAdjustments: textureAdjustmentsCount,
      pristineDigitalSelections: pristineDigitalSelectionsCount,
      filmGrainSelections: filmGrainSelectionsCount,
      analogVhsSelections: analogVhsSelectionsCount,
      grittyNoiseSelections: grittyNoiseSelectionsCount,
      diffusionGlowSelections: diffusionGlowSelectionsCount,
      textureAgnosticSelections: textureAgnosticSelectionsCount,
      textureBonuses: textureBonusesCount,
      texturePenalties: texturePenaltiesCount,
      visualBudgetAdjustments: visualBudgetAdjustmentsCount,
      visualBudgetClampedBonuses: visualBudgetClampedBonusesCount,
      visualBudgetClampedPenalties: visualBudgetClampedPenaltiesCount,
      visualIntelligenceBudgetUsed: GLOBAL_VISUAL_INTELLIGENCE_BUDGET,
      semanticProtectionAdjustments: semanticProtectionAdjustmentsCount,
      semanticRankingSafetyBandUsed: VISUAL_RANKING_SEMANTIC_SAFETY_BAND,
      highConfidenceSelections: highConfidenceSelectionsCount,
      moderateConfidenceSelections: moderateConfidenceSelectionsCount,
      lowConfidenceSelections: lowConfidenceSelectionsCount,
      averageSelectionMargin:
        assignedSegments > 0
          ? Math.round((totalSelectionMarginSum / assignedSegments) * 1000) / 1000
          : undefined,
      quickPacingSelections: quickPacingSelectionsCount,
      normalPacingSelections: normalPacingSelectionsCount,
      lingeringPacingSelections: lingeringPacingSelectionsCount,
      thresholdUsed: similarityThreshold,
      reusePenaltyUsed: reusePenalty,
      continuityPreferenceUsed: continuityPreference,
      generatedAt: Date.now(),
    },
    unassignedSegmentIds,
  };
}
