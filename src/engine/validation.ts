import { LongFormProject } from '../types/project';

export interface ValidationIssue {
  type: 'error' | 'warning';
  field: string;
  message: string;
}

export interface ProjectValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
}

/**
 * Validates a LongFormAI project to ensure all rendering preconditions and integrity constraints are satisfied.
 */
export function validateProjectForRender(project: LongFormProject): ProjectValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Resolution & Framerate Validation
  if (!project.resolution || project.resolution.width !== 1920 || project.resolution.height !== 1080) {
    errors.push('Output resolution must be exactly 1920×1080 (16:9).');
  }
  if (!project.fps || project.fps !== 30) {
    warnings.push(`Project FPS is set to ${project.fps || 'undefined'}. Defaulting to 30 FPS.`);
  }

  // 2. Voiceover Validation
  if (!project.voiceover) {
    warnings.push('No voiceover track found. Output will be rendered with silent audio.');
  } else {
    if (!project.voiceover.duration || project.voiceover.duration <= 0) {
      errors.push('Voiceover track has invalid duration (0s).');
    }
  }

  // 3. Media Assets Validation
  const mediaMap = new Map<string, typeof project.media[0]>();
  for (const media of project.media) {
    if (!media.id) {
      errors.push('Found media asset with missing ID.');
      continue;
    }
    mediaMap.set(media.id, media);
    if (!media.width || !media.height || media.width <= 0 || media.height <= 0) {
      errors.push(`Media asset "${media.name}" has invalid dimensions (${media.width}x${media.height}).`);
    }
  }

  // 4. Timeline Validation
  if (!project.timeline || project.timeline.length === 0) {
    if (!project.voiceover) {
      errors.push('Timeline is completely empty and no voiceover track exists.');
    } else {
      warnings.push('Timeline contains no video clips. Output will be rendered as a neutral 16:9 canvas with voiceover.');
    }
  }

  // Check each timeline item
  for (let i = 0; i < project.timeline.length; i++) {
    const item = project.timeline[i];
    const prefix = `Clip #${i + 1} (${item.id})`;

    if (!item.mediaId) {
      errors.push(`${prefix}: Missing mediaId reference.`);
      continue;
    }

    const asset = mediaMap.get(item.mediaId);
    if (!asset) {
      errors.push(`${prefix}: References missing media asset (ID: ${item.mediaId}).`);
    }

    if (item.startTime < 0 || isNaN(item.startTime)) {
      errors.push(`${prefix}: Invalid startTime (${item.startTime}). Must be >= 0.`);
    }

    if (item.duration <= 0 || isNaN(item.duration)) {
      errors.push(`${prefix}: Invalid duration (${item.duration}s). Must be > 0.`);
    }

    if (item.sourceStart < 0 || isNaN(item.sourceStart)) {
      errors.push(`${prefix}: Invalid sourceStart (${item.sourceStart}s). Must be >= 0.`);
    }

    // Transform validation
    if (item.transform) {
      const { fitMode, scale, x, y } = item.transform;
      if (!['cover', 'contain', 'custom'].includes(fitMode)) {
        errors.push(`${prefix}: Invalid fitMode "${fitMode}".`);
      }
      if (scale < 0.1 || isNaN(scale)) {
        errors.push(`${prefix}: Invalid scale (${scale}). Must be >= 0.1.`);
      }
      if (isNaN(x) || isNaN(y)) {
        errors.push(`${prefix}: Pan offsets contain NaN values.`);
      }
      // Check for legacy rotation property
      if ('rotation' in item.transform && (item.transform as any).rotation !== 0 && (item.transform as any).rotation !== undefined) {
        errors.push(`${prefix}: Legacy rotation property detected. Rotation is not supported in LongFormAI framing.`);
      }
    } else {
      errors.push(`${prefix}: Missing transform configuration.`);
    }
  }

  const isValid = errors.length === 0;
  let summary = 'Project is valid and ready for master video rendering.';
  if (!isValid) {
    summary = `Validation failed with ${errors.length} error(s). Please resolve them before rendering.`;
  } else if (warnings.length > 0) {
    summary = `Project is valid with ${warnings.length} warning(s).`;
  }

  return {
    isValid,
    errors,
    warnings,
    summary,
  };
}
