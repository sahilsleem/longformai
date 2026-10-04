import type { LongFormProject, TimelineItem } from '../types/project';
import type { VisualTreatment, VisualMotionTreatment, VisualTypographyTreatment, VisualTransitionTreatment } from './visualStoryDirector';

export interface ResolvedRenderSegment {
  isGap: boolean;
  startTime: number;
  duration: number;
  timelineItem?: TimelineItem;
  treatment?: VisualTreatment;
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

    segments.push({
      isGap: false,
      startTime: startTime,
      duration: duration,
      timelineItem: clonedItem,
      treatment: clonedTreatment,
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

  return { segments };
}
