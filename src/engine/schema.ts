import { LongFormProject, TransformState, CropRect } from '../types/project';

export const TARGET_ASPECT_RATIO = 16 / 9; // ~1.7777777777777777
export const DEFAULT_CANVAS_WIDTH = 1920;
export const DEFAULT_CANVAS_HEIGHT = 1080;

/**
 * Classifies an aspect ratio into standard video editing labels.
 */
export function classifyAspectRatio(width: number, height: number): { ratio: number; label: string } {
  if (!width || !height || height === 0) {
    return { ratio: TARGET_ASPECT_RATIO, label: '16:9 Native' };
  }

  const ratio = width / height;

  if (Math.abs(ratio - 16 / 9) < 0.04) {
    return { ratio, label: '16:9 Native' };
  }
  if (Math.abs(ratio - 9 / 16) < 0.04) {
    return { ratio, label: '9:16 Vertical' };
  }
  if (Math.abs(ratio - 1) < 0.04) {
    return { ratio, label: '1:1 Square' };
  }
  if (Math.abs(ratio - 4 / 3) < 0.04) {
    return { ratio, label: '4:3 Standard' };
  }
  if (Math.abs(ratio - 21 / 9) < 0.1 || ratio > 2.0) {
    return { ratio, label: '21:9 Ultrawide' };
  }

  return { ratio, label: `${width}:${height}` };
}

/**
 * Calculates initial 16:9 normalized crop box for a given media aspect ratio.
 */
export function calculateDefault16x9Crop(mediaWidth?: number, mediaHeight?: number): CropRect {
  if (!mediaWidth || !mediaHeight) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const mediaRatio = mediaWidth / mediaHeight;

  if (Math.abs(mediaRatio - TARGET_ASPECT_RATIO) < 0.01) {
    return { x: 0, y: 0, width: 1, height: 1 };
  } else if (mediaRatio > TARGET_ASPECT_RATIO) {
    const cropWidth = TARGET_ASPECT_RATIO / mediaRatio;
    const cropX = (1 - cropWidth) / 2;
    return {
      x: Math.max(0, cropX),
      y: 0,
      width: Math.min(1, cropWidth),
      height: 1,
    };
  } else {
    const cropHeight = mediaRatio / TARGET_ASPECT_RATIO;
    const cropY = (1 - cropHeight) / 2;
    return {
      x: 0,
      y: Math.max(0, cropY),
      width: 1,
      height: Math.min(1, cropHeight),
    };
  }
}

/**
 * Calculates allowable pan limits to ensure no invalid empty/black borders
 * are exposed in 'cover' fit mode.
 */
export function calculatePanBounds(
  mediaWidth: number,
  mediaHeight: number,
  scale: number,
  fitMode: 'cover' | 'contain' | 'custom'
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (fitMode !== 'cover') {
    return { minX: -50, maxX: 50, minY: -50, maxY: 50 };
  }

  const sourceRatio = (mediaWidth && mediaHeight) ? mediaWidth / mediaHeight : TARGET_ASPECT_RATIO;

  let excessX = 0;
  let excessY = 0;

  if (sourceRatio >= TARGET_ASPECT_RATIO) {
    const widthMultiplier = (sourceRatio / TARGET_ASPECT_RATIO) * scale;
    excessX = Math.max(0, (widthMultiplier - 1) / 2) * 100;
    excessY = Math.max(0, (scale - 1) / 2) * 100;
  } else {
    const heightMultiplier = (TARGET_ASPECT_RATIO / sourceRatio) * scale;
    excessX = Math.max(0, (scale - 1) / 2) * 100;
    excessY = Math.max(0, (heightMultiplier - 1) / 2) * 100;
  }

  return {
    minX: -Math.max(5, excessX),
    maxX: Math.max(5, excessX),
    minY: -Math.max(5, excessY),
    maxY: Math.max(5, excessY),
  };
}

export function createDefaultTransform(mediaWidth?: number, mediaHeight?: number): TransformState {
  const defaultCrop = calculateDefault16x9Crop(mediaWidth, mediaHeight);
  return {
    x: 0,
    y: 0,
    scale: 1.0,
    fitMode: 'cover',
    crop: defaultCrop,
  };
}

export function createInitialProject(name: string = 'Untitled LongForm Project'): LongFormProject {
  return {
    version: '1.0',
    id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name,
    resolution: {
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
    },
    fps: 30,
    timeline: [],
    media: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Portable JSON Export: Serializes project metadata into a clean portable format.
 * Strips all browser-only File objects, blob: URLs, and base64 imageData thumbnails to ensure portability.
 */
export function exportProjectToPortableJSON(project: LongFormProject): string {
  const sanitizedMedia = project.media.map((m) => {
    // Sanitize local analysis to strip large base64 imageData strings while preserving timestamps & stats
    const sanitizedAnalysis = m.analysis
      ? {
          analyzed: m.analysis.analyzed,
          description: m.analysis.description,
          tags: m.analysis.tags,
          duration: m.analysis.duration,
          visualFeatures: m.analysis.visualFeatures,
          semantic: m.analysis.semantic
            ? {
                analyzed: m.analysis.semantic.analyzed,
                description: m.analysis.semantic.description,
                tags: m.analysis.semantic.tags,
                temporalSummary: m.analysis.semantic.temporalSummary,
                hasVisualChange: m.analysis.semantic.hasVisualChange,
                visualChanges: m.analysis.semantic.visualChanges,
                keyframeDescriptions: m.analysis.semantic.keyframeDescriptions,
                modelUsed: m.analysis.semantic.modelUsed,
                analyzedAt: m.analysis.semantic.analyzedAt,
              }
            : undefined,
          keyframes: m.analysis.keyframes?.map((kf) => ({
            time: kf.time,
            description: kf.description,
            tags: kf.tags,
            isKeyMoment: kf.isKeyMoment,
            // imageData is stripped for portable export
          })),
          analyzedAt: m.analysis.analyzedAt,
        }
      : undefined;

    return {
      id: m.id,
      name: m.name,
      type: m.type,
      width: m.width,
      height: m.height,
      duration: m.duration,
      aspectRatio: m.aspectRatio,
      aspectRatioLabel: m.aspectRatioLabel,
      size: m.size,
      analysis: sanitizedAnalysis,
      createdAt: m.createdAt,
    };
  });

  const sanitizedTimeline = project.timeline.map((item) => ({
    id: item.id,
    mediaId: item.mediaId,
    trackIndex: item.trackIndex,
    startTime: item.startTime,
    duration: item.duration,
    sourceStart: item.sourceStart,
    sourceDuration: item.sourceDuration,
    transform: {
      x: item.transform.x,
      y: item.transform.y,
      scale: item.transform.scale,
      fitMode: item.transform.fitMode,
      crop: { ...item.transform.crop },
    },
    provenance: item.provenance
      ? {
          sourceSegmentId: item.provenance.sourceSegmentId,
          sourceSegmentText: item.provenance.sourceSegmentText,
          originalScore: item.provenance.originalScore,
          adjustedScore: item.provenance.adjustedScore,
          explanation: item.provenance.explanation,
          reuseCount: item.provenance.reuseCount,
          continuityBonus: item.provenance.continuityBonus,
          temporalBonus: item.provenance.temporalBonus,
          isKeyMoment: item.provenance.isKeyMoment,
          hasVisualChange: item.provenance.hasVisualChange,
          temporalCoverageCount: item.provenance.temporalCoverageCount,
          selectedSourceTimestamp: item.provenance.selectedSourceTimestamp,
          temporalSelectionReason: item.provenance.temporalSelectionReason,
          originalSegmentDuration: item.provenance.originalSegmentDuration,
          selectedDuration: item.provenance.selectedDuration,
          durationAdjustmentReason: item.provenance.durationAdjustmentReason,
          continuityReason: item.provenance.continuityReason,
          isConsecutiveContinuation: item.provenance.isConsecutiveContinuation ? true : undefined,
          narrationRole: item.provenance.narrationRole,
          narrationRoleReason: item.provenance.narrationRoleReason,
          narrationBeatType: item.provenance.narrationBeatType,
          beatId: item.provenance.beatId,
          beatPosition: item.provenance.beatPosition,
          beatLength: item.provenance.beatLength,
          beatReason: item.provenance.beatReason,
          visualVarietyModifier: item.provenance.visualVarietyModifier,
          visualSimilarity: item.provenance.visualSimilarity,
          visualVarietyReason: item.provenance.visualVarietyReason,
          pacingModifier: item.provenance.pacingModifier,
          pacingClass: item.provenance.pacingClass,
          pacingReason: item.provenance.pacingReason,
          pacingArcModifier: item.provenance.pacingArcModifier,
          pacingArcReason: item.provenance.pacingArcReason,
          visualImpactScore: item.provenance.visualImpactScore,
          emphasisImpactModifier: item.provenance.emphasisImpactModifier,
          emphasisImpactReason: item.provenance.emphasisImpactReason,
          visualState: item.provenance.visualState,
          narrationVisualContrastModifier: item.provenance.narrationVisualContrastModifier,
          narrationVisualContrastReason: item.provenance.narrationVisualContrastReason,
          subjectContinuityModifier: item.provenance.subjectContinuityModifier,
          subjectContinuity: item.provenance.subjectContinuity,
          subjectContinuityReason: item.provenance.subjectContinuityReason,
          subjectMatchScore: item.provenance.subjectMatchScore,
          framingScale: item.provenance.framingScale,
          framingModifier: item.provenance.framingModifier,
          framingReason: item.provenance.framingReason,
          framingMatchScore: item.provenance.framingMatchScore,
          atmosphericTone: item.provenance.atmosphericTone,
          atmosphericModifier: item.provenance.atmosphericModifier,
          atmosphericReason: item.provenance.atmosphericReason,
          atmosphericMatchScore: item.provenance.atmosphericMatchScore,
          cameraMotion: item.provenance.cameraMotion,
          motionModifier: item.provenance.motionModifier,
          motionReason: item.provenance.motionReason,
          motionMatchScore: item.provenance.motionMatchScore,
          sceneSetting: item.provenance.sceneSetting,
          settingModifier: item.provenance.settingModifier,
          settingReason: item.provenance.settingReason,
          settingMatchScore: item.provenance.settingMatchScore,
          subjectDensity: item.provenance.subjectDensity,
          densityModifier: item.provenance.densityModifier,
          densityReason: item.provenance.densityReason,
          densityMatchScore: item.provenance.densityMatchScore,
          cameraAngle: item.provenance.cameraAngle,
          angleModifier: item.provenance.angleModifier,
          angleReason: item.provenance.angleReason,
          angleMatchScore: item.provenance.angleMatchScore,
          timeOfDay: item.provenance.timeOfDay,
          timeModifier: item.provenance.timeModifier,
          timeReason: item.provenance.timeReason,
          timeMatchScore: item.provenance.timeMatchScore,
          weatherCondition: item.provenance.weatherCondition,
          weatherModifier: item.provenance.weatherModifier,
          weatherReason: item.provenance.weatherReason,
          weatherMatchScore: item.provenance.weatherMatchScore,
          depthOfField: item.provenance.depthOfField,
          depthModifier: item.provenance.depthModifier,
          depthReason: item.provenance.depthReason,
          depthMatchScore: item.provenance.depthMatchScore,
          temporalRate: item.provenance.temporalRate,
          temporalModifier: item.provenance.temporalModifier,
          temporalReason: item.provenance.temporalReason,
          temporalMatchScore: item.provenance.temporalMatchScore,
          visualMedium: item.provenance.visualMedium,
          mediumModifier: item.provenance.mediumModifier,
          mediumReason: item.provenance.mediumReason,
          mediumMatchScore: item.provenance.mediumMatchScore,
          compositionBalance: item.provenance.compositionBalance,
          compositionModifier: item.provenance.compositionModifier,
          compositionReason: item.provenance.compositionReason,
          compositionMatchScore: item.provenance.compositionMatchScore,
          lightingSetup: item.provenance.lightingSetup,
          lightingModifier: item.provenance.lightingModifier,
          lightingReason: item.provenance.lightingReason,
          lightingMatchScore: item.provenance.lightingMatchScore,
          pointOfView: item.provenance.pointOfView,
          povModifier: item.provenance.povModifier,
          povReason: item.provenance.povReason,
          povMatchScore: item.provenance.povMatchScore,
          chromaticGrading: item.provenance.chromaticGrading,
          chromaticModifier: item.provenance.chromaticModifier,
          chromaticReason: item.provenance.chromaticReason,
          chromaticMatchScore: item.provenance.chromaticMatchScore,
          actionTrajectory: item.provenance.actionTrajectory,
          trajectoryModifier: item.provenance.trajectoryModifier,
          trajectoryReason: item.provenance.trajectoryReason,
          trajectoryMatchScore: item.provenance.trajectoryMatchScore,
          lensPerspective: item.provenance.lensPerspective,
          lensModifier: item.provenance.lensModifier,
          lensReason: item.provenance.lensReason,
          lensMatchScore: item.provenance.lensMatchScore,
          visualTexture: item.provenance.visualTexture,
          textureModifier: item.provenance.textureModifier,
          textureReason: item.provenance.textureReason,
          textureMatchScore: item.provenance.textureMatchScore,
          rawVisualIntelligence: item.provenance.rawVisualIntelligence,
          boundedVisualIntelligence: item.provenance.boundedVisualIntelligence,
          visualIntelligenceBudget: item.provenance.visualIntelligenceBudget,
          semanticRankingProtectionApplied: item.provenance.semanticRankingProtectionApplied !== undefined ? Boolean(item.provenance.semanticRankingProtectionApplied) : undefined,
          semanticRankingProtectionReason: item.provenance.semanticRankingProtectionReason,
          candidateConfidenceScore: item.provenance.candidateConfidenceScore,
          candidateConfidenceLevel: item.provenance.candidateConfidenceLevel,
          selectionMargin: item.provenance.selectionMargin,
          semanticMargin: item.provenance.semanticMargin,
          semanticSeparation: item.provenance.semanticSeparation,
          visualInfluence: item.provenance.visualInfluence,
          matchConfidence: item.provenance.matchConfidence,
          matchCertainty: item.provenance.matchCertainty,
          gapReason: item.provenance.gapReason,
          candidatePoolSize: typeof item.provenance.candidatePoolSize === 'number' ? item.provenance.candidatePoolSize : undefined,
          viableCandidateCount: typeof item.provenance.viableCandidateCount === 'number' ? item.provenance.viableCandidateCount : undefined,
          selectedCandidateRank: typeof item.provenance.selectedCandidateRank === 'number' ? item.provenance.selectedCandidateRank : undefined,
          candidateDiversity: item.provenance.candidateDiversity,
          candidateDiversityContext: item.provenance.candidateDiversityContext,
          isManuallyEdited: Boolean(item.provenance.isManuallyEdited),
          assignedAt: item.provenance.assignedAt,
        }
      : undefined,
  }));

  const sanitizedVoiceover = project.voiceover
    ? {
        id: project.voiceover.id,
        name: project.voiceover.name,
        type: 'audio' as const,
        duration: project.voiceover.duration,
        size: project.voiceover.size,
        format: project.voiceover.format,
        volume: project.voiceover.volume,
        isMuted: project.voiceover.isMuted,
        waveformData: project.voiceover.waveformData,
        segments: (project.voiceover.segments || []).map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          text: s.text,
          confidence: s.confidence,
          speaker: s.speaker,
          words: s.words?.map((w) => ({
            word: w.word,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
          })),
          matchedMediaId: s.matchedMediaId,
        })),
        createdAt: project.voiceover.createdAt,
      }
    : undefined;

  const exportable = {
    schemaVersion: '1.0.0',
    generator: 'LongFormAI (Project Hail Mary)',
    exportedAt: new Date().toISOString(),
    project: {
      version: project.version,
      id: project.id,
      name: project.name,
      description: project.description,
      resolution: project.resolution,
      fps: project.fps,
      media: sanitizedMedia,
      timeline: sanitizedTimeline,
      voiceover: sanitizedVoiceover,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  };

  return JSON.stringify(exportable, null, 2);
}

export interface ParseProjectResult {
  isValid: boolean;
  project?: LongFormProject;
  errors: string[];
}

/**
 * Robust JSON Schema Validator and Deserializer for LongFormAI projects.
 * Enforces strict validation to prevent malformed, corrupted, or incompatible files from loading.
 */
export function validateAndParseProjectJSON(jsonString: string): ParseProjectResult {
  const errors: string[] = [];

  let rawData: any;
  try {
    rawData = JSON.parse(jsonString);
  } catch (e: any) {
    return { isValid: false, errors: [`Invalid JSON format: ${e.message || 'Parse error'}`] };
  }

  if (!rawData || typeof rawData !== 'object') {
    return { isValid: false, errors: ['Project JSON must be a valid JSON object.'] };
  }

  // Extract root project object (supports both direct project object and wrapped export schema)
  const proj = rawData.project || (rawData.version === '1.0' ? rawData : null);
  if (!proj) {
    return { isValid: false, errors: ['Missing root "project" definition or unrecognized schema version.'] };
  }

  if (proj.version !== '1.0') {
    errors.push(`Unsupported project version "${proj.version}". Expected "1.0".`);
  }

  if (!proj.id || typeof proj.id !== 'string') {
    errors.push('Missing or invalid project "id".');
  }

  if (!proj.resolution || proj.resolution.width !== 1920 || proj.resolution.height !== 1080) {
    errors.push('Project resolution must be 1920x1080 (16:9).');
  }

  if (typeof proj.fps !== 'number' || proj.fps <= 0) {
    errors.push('Invalid project FPS.');
  }

  // Validate Media Assets
  if (!Array.isArray(proj.media)) {
    errors.push('Project "media" must be an array.');
  }

  const mediaIds = new Set<string>();
  const parsedMedia: LongFormProject['media'] = [];

  if (Array.isArray(proj.media)) {
    for (let i = 0; i < proj.media.length; i++) {
      const m = proj.media[i];
      const prefix = `Media #${i + 1}`;

      if (!m.id || typeof m.id !== 'string') {
        errors.push(`${prefix}: Missing or invalid media ID.`);
        continue;
      }
      if (!m.name || typeof m.name !== 'string') {
        errors.push(`${prefix}: Missing filename.`);
      }
      if (!['video', 'image', 'audio'].includes(m.type)) {
        errors.push(`${prefix}: Invalid media type "${m.type}".`);
      }
      if (typeof m.width !== 'number' || m.width <= 0 || isNaN(m.width)) {
        errors.push(`${prefix}: Invalid width (${m.width}).`);
      }
      if (typeof m.height !== 'number' || m.height <= 0 || isNaN(m.height)) {
        errors.push(`${prefix}: Invalid height (${m.height}).`);
      }
      if (typeof m.duration !== 'number' || m.duration < 0 || isNaN(m.duration)) {
        errors.push(`${prefix}: Invalid duration (${m.duration}).`);
      }

      mediaIds.add(m.id);

      parsedMedia.push({
        id: m.id,
        name: m.name,
        type: m.type,
        url: '', // Clean reset for local relinking in browser session
        width: m.width || 1920,
        height: m.height || 1080,
        duration: m.duration || 0,
        aspectRatio: m.aspectRatio || (m.width && m.height ? m.width / m.height : TARGET_ASPECT_RATIO),
        aspectRatioLabel: m.aspectRatioLabel || classifyAspectRatio(m.width, m.height).label,
        size: typeof m.size === 'number' ? m.size : undefined,
        analysis: m.analysis,
        createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
      });
    }
  }

  // Validate Voiceover Track (if present)
  let parsedVoiceover: LongFormProject['voiceover'] = undefined;
  if (proj.voiceover) {
    const vo = proj.voiceover;
    if (typeof vo.duration !== 'number' || vo.duration <= 0 || isNaN(vo.duration)) {
      errors.push('Voiceover has invalid duration.');
    }

    const parsedSegments: NonNullable<LongFormProject['voiceover']>['segments'] = [];
    if (Array.isArray(vo.segments)) {
      for (let s = 0; s < vo.segments.length; s++) {
        const seg = vo.segments[s];
        const segPrefix = `Transcript segment #${s + 1}`;

        if (typeof seg.startTime !== 'number' || seg.startTime < 0 || isNaN(seg.startTime)) {
          errors.push(`${segPrefix}: Invalid startTime.`);
        }
        if (typeof seg.endTime !== 'number' || seg.endTime < seg.startTime || isNaN(seg.endTime)) {
          errors.push(`${segPrefix}: Invalid endTime.`);
        }
        if (typeof seg.text !== 'string') {
          errors.push(`${segPrefix}: Missing or invalid text.`);
        }

        parsedSegments.push({
          id: seg.id || `seg_${s}_${Date.now()}`,
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: seg.text || '',
          confidence: typeof seg.confidence === 'number' ? seg.confidence : undefined,
          speaker: typeof seg.speaker === 'string' ? seg.speaker : undefined,
          words: Array.isArray(seg.words) ? seg.words : undefined,
          matchedMediaId: typeof seg.matchedMediaId === 'string' ? seg.matchedMediaId : undefined,
        });
      }
    }

    parsedVoiceover = {
      id: vo.id || `vo_${Date.now()}`,
      name: vo.name || 'voiceover.wav',
      type: 'audio',
      url: '', // Clean reset for local relinking
      duration: vo.duration || 0,
      size: typeof vo.size === 'number' ? vo.size : undefined,
      format: vo.format || 'audio',
      volume: typeof vo.volume === 'number' ? Math.max(0, Math.min(1, vo.volume)) : 1.0,
      isMuted: Boolean(vo.isMuted),
      waveformData: Array.isArray(vo.waveformData) ? vo.waveformData : undefined,
      segments: parsedSegments,
      createdAt: typeof vo.createdAt === 'number' ? vo.createdAt : Date.now(),
    };
  }

  // Validate Timeline Items
  if (!Array.isArray(proj.timeline)) {
    errors.push('Project "timeline" must be an array.');
  }

  const parsedTimeline: LongFormProject['timeline'] = [];
  if (Array.isArray(proj.timeline)) {
    for (let t = 0; t < proj.timeline.length; t++) {
      const item = proj.timeline[t];
      const tPrefix = `Timeline clip #${t + 1}`;

      if (!item.id || typeof item.id !== 'string') {
        errors.push(`${tPrefix}: Missing item ID.`);
      }
      if (!item.mediaId || !mediaIds.has(item.mediaId)) {
        errors.push(`${tPrefix}: References missing media asset (ID: ${item.mediaId}).`);
      }
      if (typeof item.startTime !== 'number' || item.startTime < 0 || isNaN(item.startTime)) {
        errors.push(`${tPrefix}: Invalid startTime.`);
      }
      if (typeof item.duration !== 'number' || item.duration <= 0 || isNaN(item.duration)) {
        errors.push(`${tPrefix}: Invalid duration.`);
      }
      if (typeof item.sourceStart !== 'number' || item.sourceStart < 0 || isNaN(item.sourceStart)) {
        errors.push(`${tPrefix}: Invalid sourceStart.`);
      }

      // Check transform
      const tf = item.transform || {};
      if ('rotation' in tf && tf.rotation !== 0 && tf.rotation !== undefined) {
        errors.push(`${tPrefix}: Legacy rotation property is not allowed.`);
      }
      if (tf.scale !== undefined && (typeof tf.scale !== 'number' || tf.scale < 0.1 || isNaN(tf.scale))) {
        errors.push(`${tPrefix}: Invalid scale.`);
      }
      if (tf.fitMode !== undefined && !['cover', 'contain', 'custom'].includes(tf.fitMode)) {
        errors.push(`${tPrefix}: Invalid fitMode "${tf.fitMode}".`);
      }

      let parsedProvenance = undefined;
      if (item.provenance && typeof item.provenance === 'object') {
        const p = item.provenance;
        if (typeof p.sourceSegmentId === 'string' && typeof p.originalScore === 'number') {
          parsedProvenance = {
            sourceSegmentId: p.sourceSegmentId,
            sourceSegmentText: typeof p.sourceSegmentText === 'string' ? p.sourceSegmentText : undefined,
            originalScore: p.originalScore,
            adjustedScore: typeof p.adjustedScore === 'number' ? p.adjustedScore : p.originalScore,
            explanation: typeof p.explanation === 'string' ? p.explanation : 'Semantic match',
            reuseCount: typeof p.reuseCount === 'number' ? p.reuseCount : 0,
            continuityBonus: typeof p.continuityBonus === 'number' ? p.continuityBonus : undefined,
            temporalBonus: typeof p.temporalBonus === 'number' ? p.temporalBonus : undefined,
            isKeyMoment: typeof p.isKeyMoment === 'boolean' ? p.isKeyMoment : undefined,
            hasVisualChange: typeof p.hasVisualChange === 'boolean' ? p.hasVisualChange : undefined,
            temporalCoverageCount: typeof p.temporalCoverageCount === 'number' ? p.temporalCoverageCount : undefined,
            selectedSourceTimestamp: typeof p.selectedSourceTimestamp === 'number' ? p.selectedSourceTimestamp : undefined,
            temporalSelectionReason: typeof p.temporalSelectionReason === 'string' ? p.temporalSelectionReason : undefined,
            originalSegmentDuration: typeof p.originalSegmentDuration === 'number' ? p.originalSegmentDuration : undefined,
            selectedDuration: typeof p.selectedDuration === 'number' ? p.selectedDuration : undefined,
            durationAdjustmentReason: typeof p.durationAdjustmentReason === 'string' ? p.durationAdjustmentReason : undefined,
            continuityReason: typeof p.continuityReason === 'string' ? p.continuityReason : undefined,
            isConsecutiveContinuation: typeof p.isConsecutiveContinuation === 'boolean' ? p.isConsecutiveContinuation : undefined,
            narrationRole: ['establishing', 'action', 'description', 'transition', 'result', 'continuation', 'emphasis', 'unknown'].includes(p.narrationRole) ? p.narrationRole : undefined,
            narrationRoleReason: typeof p.narrationRoleReason === 'string' ? p.narrationRoleReason : undefined,
            narrationBeatType: ['NEW_BEAT', 'CONTINUING_BEAT', 'BEAT_END', 'STANDALONE'].includes(p.narrationBeatType) ? p.narrationBeatType : undefined,
            beatId: typeof p.beatId === 'string' ? p.beatId : undefined,
            beatPosition: typeof p.beatPosition === 'number' ? p.beatPosition : undefined,
            beatLength: typeof p.beatLength === 'number' ? p.beatLength : undefined,
            beatReason: typeof p.beatReason === 'string' ? p.beatReason : undefined,
            visualVarietyModifier: typeof p.visualVarietyModifier === 'number' ? p.visualVarietyModifier : undefined,
            visualSimilarity: typeof p.visualSimilarity === 'number' ? p.visualSimilarity : undefined,
            visualVarietyReason: typeof p.visualVarietyReason === 'string' ? p.visualVarietyReason : undefined,
            pacingModifier: typeof p.pacingModifier === 'number' ? p.pacingModifier : undefined,
            pacingClass: ['QUICK', 'NORMAL', 'LINGERING'].includes(p.pacingClass) ? p.pacingClass : undefined,
            pacingReason: typeof p.pacingReason === 'string' ? p.pacingReason : undefined,
            pacingArcModifier: typeof p.pacingArcModifier === 'number' ? p.pacingArcModifier : undefined,
            pacingArcReason: typeof p.pacingArcReason === 'string' ? p.pacingArcReason : undefined,
            visualImpactScore: typeof p.visualImpactScore === 'number' ? p.visualImpactScore : undefined,
            emphasisImpactModifier: typeof p.emphasisImpactModifier === 'number' ? p.emphasisImpactModifier : undefined,
            emphasisImpactReason: typeof p.emphasisImpactReason === 'string' ? p.emphasisImpactReason : undefined,
            visualState: ['STATIC', 'STABLE', 'DYNAMIC', 'HIGH_IMPACT'].includes(p.visualState) ? p.visualState : undefined,
            narrationVisualContrastModifier: typeof p.narrationVisualContrastModifier === 'number' ? p.narrationVisualContrastModifier : undefined,
            narrationVisualContrastReason: typeof p.narrationVisualContrastReason === 'string' ? p.narrationVisualContrastReason : undefined,
            subjectContinuityModifier: typeof p.subjectContinuityModifier === 'number' ? p.subjectContinuityModifier : undefined,
            subjectContinuity: ['HIGH', 'MODERATE', 'LOW'].includes(p.subjectContinuity) ? p.subjectContinuity : undefined,
            subjectContinuityReason: typeof p.subjectContinuityReason === 'string' ? p.subjectContinuityReason : undefined,
            subjectMatchScore: typeof p.subjectMatchScore === 'number' ? p.subjectMatchScore : undefined,
            framingScale: ['WIDE', 'MEDIUM', 'CLOSEUP', 'DETAIL', 'STANDARD'].includes(p.framingScale) ? p.framingScale : undefined,
            framingModifier: typeof p.framingModifier === 'number' ? p.framingModifier : undefined,
            framingReason: typeof p.framingReason === 'string' ? p.framingReason : undefined,
            framingMatchScore: typeof p.framingMatchScore === 'number' ? p.framingMatchScore : undefined,
            atmosphericTone: ['WARM_VIBRANT', 'COOL_MUTED', 'HIGH_KEY_BRIGHT', 'LOW_KEY_DARK', 'NEUTRAL_BALANCED'].includes(p.atmosphericTone) ? p.atmosphericTone : undefined,
            atmosphericModifier: typeof p.atmosphericModifier === 'number' ? p.atmosphericModifier : undefined,
            atmosphericReason: typeof p.atmosphericReason === 'string' ? p.atmosphericReason : undefined,
            atmosphericMatchScore: typeof p.atmosphericMatchScore === 'number' ? p.atmosphericMatchScore : undefined,
            cameraMotion: ['STATIC_LOCKED', 'PANNING_SWEEP', 'ZOOMING_FOCUS', 'DYNAMIC_ACTION', 'SMOOTH_FLOAT'].includes(p.cameraMotion) ? p.cameraMotion : undefined,
            motionModifier: typeof p.motionModifier === 'number' ? p.motionModifier : undefined,
            motionReason: typeof p.motionReason === 'string' ? p.motionReason : undefined,
            motionMatchScore: typeof p.motionMatchScore === 'number' ? p.motionMatchScore : undefined,
            sceneSetting: ['INDOOR_INTERIOR', 'OUTDOOR_NATURAL', 'OUTDOOR_URBAN', 'STUDIO_ABSTRACT', 'NEUTRAL_SETTING'].includes(p.sceneSetting) ? p.sceneSetting : undefined,
            settingModifier: typeof p.settingModifier === 'number' ? p.settingModifier : undefined,
            settingReason: typeof p.settingReason === 'string' ? p.settingReason : undefined,
            settingMatchScore: typeof p.settingMatchScore === 'number' ? p.settingMatchScore : undefined,
            subjectDensity: ['SOLO_INDIVIDUAL', 'DUO_INTERACTION', 'GROUP_TEAM', 'CROWD_AUDIENCE', 'UNINHABITED_OBJECT'].includes(p.subjectDensity) ? p.subjectDensity : undefined,
            densityModifier: typeof p.densityModifier === 'number' ? p.densityModifier : undefined,
            densityReason: typeof p.densityReason === 'string' ? p.densityReason : undefined,
            densityMatchScore: typeof p.densityMatchScore === 'number' ? p.densityMatchScore : undefined,
            cameraAngle: ['AERIAL_OVERHEAD', 'HIGH_ANGLE', 'EYE_LEVEL', 'LOW_ANGLE', 'GROUND_LEVEL'].includes(p.cameraAngle) ? p.cameraAngle : undefined,
            angleModifier: typeof p.angleModifier === 'number' ? p.angleModifier : undefined,
            angleReason: typeof p.angleReason === 'string' ? p.angleReason : undefined,
            angleMatchScore: typeof p.angleMatchScore === 'number' ? p.angleMatchScore : undefined,
            timeOfDay: ['DAYLIGHT_CLEAR', 'GOLDEN_HOUR_SUNSET', 'NIGHT_NOCTURNAL', 'DAWN_TWILIGHT', 'TIME_AGNOSTIC'].includes(p.timeOfDay) ? p.timeOfDay : undefined,
            timeModifier: typeof p.timeModifier === 'number' ? p.timeModifier : undefined,
            timeReason: typeof p.timeReason === 'string' ? p.timeReason : undefined,
            timeMatchScore: typeof p.timeMatchScore === 'number' ? p.timeMatchScore : undefined,
            weatherCondition: ['CLEAR_FAIR', 'OVERCAST_CLOUDY', 'RAIN_STORMY', 'SNOW_FROST', 'FOG_MIST', 'WEATHER_AGNOSTIC'].includes(p.weatherCondition) ? p.weatherCondition : undefined,
            weatherModifier: typeof p.weatherModifier === 'number' ? p.weatherModifier : undefined,
            weatherReason: typeof p.weatherReason === 'string' ? p.weatherReason : undefined,
            weatherMatchScore: typeof p.weatherMatchScore === 'number' ? p.weatherMatchScore : undefined,
            depthOfField: ['SHALLOW_BOKEH', 'DEEP_FOCUS', 'RACK_FOCUS', 'SOFT_DREAMY', 'DEPTH_AGNOSTIC'].includes(p.depthOfField) ? p.depthOfField : undefined,
            depthModifier: typeof p.depthModifier === 'number' ? p.depthModifier : undefined,
            depthReason: typeof p.depthReason === 'string' ? p.depthReason : undefined,
            depthMatchScore: typeof p.depthMatchScore === 'number' ? p.depthMatchScore : undefined,
            temporalRate: ['REALTIME_STANDARD', 'SLOW_MOTION', 'TIMELAPSE_HYPERLAPSE', 'STOP_MOTION_FREEZE', 'TEMPORAL_AGNOSTIC'].includes(p.temporalRate) ? p.temporalRate : undefined,
            temporalModifier: typeof p.temporalModifier === 'number' ? p.temporalModifier : undefined,
            temporalReason: typeof p.temporalReason === 'string' ? p.temporalReason : undefined,
            temporalMatchScore: typeof p.temporalMatchScore === 'number' ? p.temporalMatchScore : undefined,
            visualMedium: ['LIVE_ACTION_REALISM', 'SCREENCAST_UI', 'ANIMATION_2D', 'CGI_3D_RENDER', 'ABSTRACT_GRAPHIC', 'MEDIUM_AGNOSTIC'].includes(p.visualMedium) ? p.visualMedium : undefined,
            mediumModifier: typeof p.mediumModifier === 'number' ? p.mediumModifier : undefined,
            mediumReason: typeof p.mediumReason === 'string' ? p.mediumReason : undefined,
            mediumMatchScore: typeof p.mediumMatchScore === 'number' ? p.mediumMatchScore : undefined,
            compositionBalance: ['CENTERED_SYMMETRIC', 'RULE_OF_THIRDS_LEFT', 'RULE_OF_THIRDS_RIGHT', 'DISTRIBUTED_BALANCED', 'COMPOSITION_AGNOSTIC'].includes(p.compositionBalance) ? p.compositionBalance : undefined,
            compositionModifier: typeof p.compositionModifier === 'number' ? p.compositionModifier : undefined,
            compositionReason: typeof p.compositionReason === 'string' ? p.compositionReason : undefined,
            compositionMatchScore: typeof p.compositionMatchScore === 'number' ? p.compositionMatchScore : undefined,
            lightingSetup: ['FRONTAL_DIRECT', 'SIDE_SPLIT_DRAMATIC', 'BACKLIT_SILHOUETTE', 'TOP_DOWN_OVERHEAD', 'DIFFUSE_AMBIENT', 'LIGHTING_AGNOSTIC'].includes(p.lightingSetup) ? p.lightingSetup : undefined,
            lightingModifier: typeof p.lightingModifier === 'number' ? p.lightingModifier : undefined,
            lightingReason: typeof p.lightingReason === 'string' ? p.lightingReason : undefined,
            lightingMatchScore: typeof p.lightingMatchScore === 'number' ? p.lightingMatchScore : undefined,
            pointOfView: ['FIRST_PERSON_POV', 'OVER_THE_SHOULDER', 'DIRECT_ADDRESS', 'OBJECTIVE_OBSERVATIONAL', 'POV_AGNOSTIC'].includes(p.pointOfView) ? p.pointOfView : undefined,
            povModifier: typeof p.povModifier === 'number' ? p.povModifier : undefined,
            povReason: typeof p.povReason === 'string' ? p.povReason : undefined,
            povMatchScore: typeof p.povMatchScore === 'number' ? p.povMatchScore : undefined,
            chromaticGrading: ['MONOCHROME_GRAYSCALE', 'VIBRANT_SATURATED', 'MUTED_DESATURATED', 'WARM_SEPIA_DUOTONE', 'NATURAL_BALANCED', 'CHROMATIC_AGNOSTIC'].includes(p.chromaticGrading) ? p.chromaticGrading : undefined,
            chromaticModifier: typeof p.chromaticModifier === 'number' ? p.chromaticModifier : undefined,
            chromaticReason: typeof p.chromaticReason === 'string' ? p.chromaticReason : undefined,
            chromaticMatchScore: typeof p.chromaticMatchScore === 'number' ? p.chromaticMatchScore : undefined,
            actionTrajectory: ['APPROACHING_CAMERA', 'RECEDING_DEPTH', 'LATERAL_LEFT_TO_RIGHT', 'LATERAL_RIGHT_TO_LEFT', 'ROTATIONAL_AXIAL', 'TRAJECTORY_AGNOSTIC'].includes(p.actionTrajectory) ? p.actionTrajectory : undefined,
            trajectoryModifier: typeof p.trajectoryModifier === 'number' ? p.trajectoryModifier : undefined,
            trajectoryReason: typeof p.trajectoryReason === 'string' ? p.trajectoryReason : undefined,
            trajectoryMatchScore: typeof p.trajectoryMatchScore === 'number' ? p.trajectoryMatchScore : undefined,
            lensPerspective: ['FISHEYE_ULTRAWIDE', 'WIDE_ANGLE_EXPANSIVE', 'STANDARD_NORMAL', 'TELEPHOTO_COMPRESSED', 'MACRO_MICROSCOPIC', 'LENS_AGNOSTIC'].includes(p.lensPerspective) ? p.lensPerspective : undefined,
            lensModifier: typeof p.lensModifier === 'number' ? p.lensModifier : undefined,
            lensReason: typeof p.lensReason === 'string' ? p.lensReason : undefined,
            lensMatchScore: typeof p.lensMatchScore === 'number' ? p.lensMatchScore : undefined,
            visualTexture: ['CLEAN_PRISTINE_DIGITAL', 'ORGANIC_FILM_GRAIN', 'VINTAGE_ANALOG_VHS', 'GRITTY_TEXTURED_NOISE', 'ETHEREAL_DIFFUSION_GLOW', 'TEXTURE_AGNOSTIC'].includes(p.visualTexture) ? p.visualTexture : undefined,
            textureModifier: typeof p.textureModifier === 'number' ? p.textureModifier : undefined,
            textureReason: typeof p.textureReason === 'string' ? p.textureReason : undefined,
            textureMatchScore: typeof p.textureMatchScore === 'number' ? p.textureMatchScore : undefined,
            rawVisualIntelligence: typeof p.rawVisualIntelligence === 'number' ? p.rawVisualIntelligence : undefined,
            boundedVisualIntelligence: typeof p.boundedVisualIntelligence === 'number' ? p.boundedVisualIntelligence : undefined,
            visualIntelligenceBudget: typeof p.visualIntelligenceBudget === 'number' ? p.visualIntelligenceBudget : undefined,
            semanticRankingProtectionApplied: typeof p.semanticRankingProtectionApplied === 'boolean' ? p.semanticRankingProtectionApplied : undefined,
            semanticRankingProtectionReason: typeof p.semanticRankingProtectionReason === 'string' ? p.semanticRankingProtectionReason : undefined,
            candidateConfidenceScore: typeof p.candidateConfidenceScore === 'number' ? p.candidateConfidenceScore : undefined,
            candidateConfidenceLevel: (p.candidateConfidenceLevel === 'HIGH' || p.candidateConfidenceLevel === 'MODERATE' || p.candidateConfidenceLevel === 'LOW') ? p.candidateConfidenceLevel : undefined,
            selectionMargin: typeof p.selectionMargin === 'number' ? p.selectionMargin : undefined,
            semanticMargin: typeof p.semanticMargin === 'number' ? p.semanticMargin : undefined,
            semanticSeparation: (p.semanticSeparation === 'CLEAR' || p.semanticSeparation === 'CLOSE' || p.semanticSeparation === 'NONE') ? p.semanticSeparation : undefined,
            visualInfluence: (p.visualInfluence === 'NEUTRAL' || p.visualInfluence === 'SUPPORTING' || p.visualInfluence === 'OPPOSING') ? p.visualInfluence : undefined,
            matchConfidence: (['STRONG', 'ACCEPTABLE', 'UNCERTAIN', 'NO_MATCH'] as const).includes(p.matchConfidence) ? p.matchConfidence : undefined,
            matchCertainty: (['HIGH_CERTAINTY', 'MODERATE_CERTAINTY', 'LOW_CERTAINTY'] as const).includes(p.matchCertainty) ? p.matchCertainty : undefined,
            gapReason: (['NO_CANDIDATE', 'BELOW_EXISTING_THRESHOLD', 'EMPTY_TRANSCRIPT', 'UNAVAILABLE_MEDIA', 'UNKNOWN'] as const).includes(p.gapReason) ? p.gapReason : undefined,
            candidatePoolSize: typeof p.candidatePoolSize === 'number' ? p.candidatePoolSize : undefined,
            viableCandidateCount: typeof p.viableCandidateCount === 'number' ? p.viableCandidateCount : undefined,
            selectedCandidateRank: typeof p.selectedCandidateRank === 'number' ? p.selectedCandidateRank : undefined,
            candidateDiversity: (['BROAD', 'MODERATE', 'LIMITED', 'NONE'] as const).includes(p.candidateDiversity) ? p.candidateDiversity : undefined,
            candidateDiversityContext: (['SUPPORTED', 'CONSTRAINED', 'UNAVAILABLE'] as const).includes(p.candidateDiversityContext) ? p.candidateDiversityContext : undefined,
            isManuallyEdited: Boolean(p.isManuallyEdited),
            assignedAt: typeof p.assignedAt === 'number' ? p.assignedAt : undefined,
          };
        }
      }

      parsedTimeline.push({
        id: item.id || `clip_${t}_${Date.now()}`,
        mediaId: item.mediaId,
        trackIndex: typeof item.trackIndex === 'number' ? item.trackIndex : 0,
        startTime: item.startTime || 0,
        duration: item.duration || 5,
        sourceStart: item.sourceStart || 0,
        sourceDuration: item.sourceDuration || 5,
        transform: {
          x: typeof tf.x === 'number' && !isNaN(tf.x) ? tf.x : 0,
          y: typeof tf.y === 'number' && !isNaN(tf.y) ? tf.y : 0,
          scale: typeof tf.scale === 'number' && !isNaN(tf.scale) ? tf.scale : 1.0,
          fitMode: tf.fitMode || 'cover',
          crop: tf.crop || { x: 0, y: 0, width: 1, height: 1 },
        },
        provenance: parsedProvenance,
      });
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const validatedProject: LongFormProject = {
    version: '1.0',
    id: proj.id,
    name: proj.name || 'Untitled Project',
    description: proj.description,
    resolution: {
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
    },
    fps: proj.fps || 30,
    media: parsedMedia,
    voiceover: parsedVoiceover,
    timeline: parsedTimeline,
    createdAt: proj.createdAt || new Date().toISOString(),
    updatedAt: proj.updatedAt || new Date().toISOString(),
  };

  return {
    isValid: true,
    project: validatedProject,
    errors: [],
  };
}

export function formatTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
}

export function formatSecondsToMinutes(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

