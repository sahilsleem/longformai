import type { LongFormProject, TimelineItem } from '../types/project';
import type { VisualTreatment, VisualMotionTreatment, VisualTypographyTreatment, VisualTransitionTreatment } from './visualStoryDirector';

export interface ResolvedTypographyOverlay {
  type: 'EMPHASIS_TEXT' | 'CONTEXT_LABEL' | 'FULLSCREEN_TEXT';
  text: string;
  startTime: number;
  endTime: number;
}

export interface ResolvedTransitionPlan {
  type: 'HARD_CUT' | 'CROSSFADE';
  duration: number;
  offset: number;
}

export interface ResolvedRenderSegment {
  isGap: boolean;
  startTime: number;
  duration: number;
  timelineItem?: TimelineItem;
  treatment?: VisualTreatment;
  typographyOverlay?: ResolvedTypographyOverlay;
  tailHandle?: number;
  transitionPlan?: ResolvedTransitionPlan;
}

export interface ResolvedRenderPlan {
  segments: ResolvedRenderSegment[];
}

/**
 * Creates a safe fallback treatment when none is provided or when
 * it is invalid.
 */
function createFallbackTreatment(): VisualTreatment {
  return {
    motion: 'NORMAL_CLIP' as VisualMotionTreatment,
    typography: 'NONE' as VisualTypographyTreatment,
    transition: 'HARD_CUT' as VisualTransitionTreatment,
    reason: 'Fallback treatment',
  };
}

/**
 * Resolves a LongFormProject into a sequential, gap-aware render plan.
 * This translates the editorial decision layer into a deterministic
 * execution plan without performing any rendering or side-effects.
 * 
 * @param project The LongFormProject to resolve.
 * @returns A ResolvedRenderPlan containing ordered segments with gaps explicitly injected.
 */
export function resolveRenderPlan(project: LongFormProject): ResolvedRenderPlan {
  const segments: ResolvedRenderSegment[] = [];
  const timelineItems = project.timeline || [];
  const treatments = project.visualTreatmentPlan?.treatments || {};
  const voiceoverTrack = project.voiceover;

  // Determine total project duration
  let voiceoverDuration = 0.0;
  if (voiceoverTrack) {
    voiceoverDuration = voiceoverTrack.duration || 0.0;
  }

  let maxTimelineEnd = 0.0;
  for (const item of timelineItems) {
    const end = (item.startTime || 0.0) + (item.duration || 0.0);
    if (end > maxTimelineEnd) {
      maxTimelineEnd = end;
    }
  }

  let totalDuration = Math.max(voiceoverDuration, maxTimelineEnd);
  if (totalDuration <= 0.0) {
    totalDuration = 5.0; // Default fallback
  }

  // Sort by startTime
  const sortedItems = [...timelineItems].sort((a, b) => {
    const startA = Math.max(0, a.startTime || 0);
    const startB = Math.max(0, b.startTime || 0);
    return startA - startB;
  });

  let currentTime = 0.0;

  for (const item of sortedItems) {
    const startTime = Math.max(0.0, item.startTime || 0.0);
    const duration = item.duration || 0.0;
    
    if (duration <= 0.0) {
      continue;
    }

    // Gap injection threshold matches Python renderer
    const gapDuration = startTime - currentTime;
    if (gapDuration > 0.04) {
      segments.push({
        isGap: true,
        startTime: currentTime,
        duration: gapDuration,
      });
      currentTime += gapDuration;
    }

    // Resolve treatment
    let treatment = treatments[item.id];
    if (!treatment) {
      treatment = createFallbackTreatment();
    } else {
      // Defensive check for valid treatment fields
      if (!treatment.motion || !treatment.typography || !treatment.transition) {
        treatment = {
          ...createFallbackTreatment(),
          ...treatment,
        };
      }
    }

    // Deep clone timelineItem and treatment to ensure immutability
    const clonedItem = JSON.parse(JSON.stringify(item));
    const clonedTreatment = JSON.parse(JSON.stringify(treatment));

    // Resolve typography overlay (Stage 3C: EMPHASIS_TEXT, CONTEXT_LABEL; Stage 4A: FULLSCREEN_TEXT)
    let typographyOverlay: ResolvedTypographyOverlay | undefined;
    const typoType = treatment.typography;
    const rawText = (treatment.text || '').trim();

    if ((typoType === 'EMPHASIS_TEXT' || typoType === 'CONTEXT_LABEL' || typoType === 'FULLSCREEN_TEXT') && rawText.length > 0) {
      let tStart: number;
      let tEnd: number;

      if (treatment.textTiming) {
        const rawStart = treatment.textTiming.start !== undefined ? treatment.textTiming.start : 0;
        const rawEnd = treatment.textTiming.end !== undefined ? treatment.textTiming.end : duration;
        tStart = Math.max(0, Math.min(duration, rawStart));
        tEnd = Math.max(tStart, Math.min(duration, rawEnd));
      } else {
        if (typoType === 'EMPHASIS_TEXT') {
          tStart = 0;
          tEnd = Math.min(duration, 1.0);
        } else if (typoType === 'CONTEXT_LABEL') {
          tStart = Math.min(0.3, duration);
          tEnd = Math.min(duration, Math.max(tStart, 2.5));
        } else {
          // FULLSCREEN_TEXT spans the full segment duration by default
          tStart = 0;
          tEnd = duration;
        }
      }

      if (tEnd > tStart) {
        typographyOverlay = {
          type: typoType,
          text: rawText,
          startTime: Number(tStart.toFixed(2)),
          endTime: Number(tEnd.toFixed(2)),
        };
      }
    }

    segments.push({
      isGap: false,
      startTime: startTime,
      duration: duration,
      timelineItem: clonedItem,
      treatment: clonedTreatment,
      ...(typographyOverlay ? { typographyOverlay } : {}),
    });
    
    currentTime = startTime + duration;
  }

  // Check for trailing gap until total_duration
  const trailingGap = totalDuration - currentTime;
  if (trailingGap > 0.04) {
    segments.push({
      isGap: true,
      startTime: currentTime,
      duration: trailingGap,
    });
    currentTime += trailingGap;
  }

  // If timeline was empty, render a single black gap for total duration
  if (segments.length === 0) {
    segments.push({
      isGap: true,
      startTime: 0,
      duration: totalDuration,
    });
  }

  // Stage 3D: Resolve transitions across adjacent segments
  for (let i = 1; i < segments.length; i++) {
    const curr = segments[i];
    const prev = segments[i - 1];
    const treatment = curr.treatment;

    if (!treatment || treatment.transition !== 'CROSSFADE') {
      continue;
    }

    // Guardrail 1: Neither segment can be a gap
    if (prev.isGap || curr.isGap) {
      continue;
    }

    // Guardrail 2: Both segments must have duration >= 1.0s
    if (prev.duration < 1.0 || curr.duration < 1.0) {
      continue;
    }

    // Guardrail 3: Transition duration must be positive
    const requestedDuration = treatment.transitionDuration !== undefined ? treatment.transitionDuration : 0.5;
    if (requestedDuration <= 0) {
      continue;
    }

    // Guardrail 4: Transition duration must be smaller than usable duration
    const maxAllowedT = Math.min(prev.duration - 0.5, curr.duration - 0.5);
    if (maxAllowedT < 0.1) {
      continue;
    }
    const tDur = Math.min(requestedDuration, maxAllowedT);
    if (tDur <= 0) {
      continue;
    }

    // Guardrail 5: Consecutive crossfade safety
    // Do not allow a segment to participate in two CROSSFADE operations
    // unless there is clearly sufficient body duration between them (at least 1.0s).
    if (prev.transitionPlan && prev.transitionPlan.type === 'CROSSFADE') {
      const incomingT = prev.transitionPlan.duration;
      if (prev.duration - incomingT < 1.0) {
        continue;
      }
    }

    // All safety conditions passed: assign tailHandle and transitionPlan
    const roundedTDur = Number(tDur.toFixed(2));
    const offset = Number(prev.duration.toFixed(2));

    prev.tailHandle = roundedTDur;
    curr.transitionPlan = {
      type: 'CROSSFADE',
      duration: roundedTDur,
      offset: offset,
    };
  }

  return { segments };
}
