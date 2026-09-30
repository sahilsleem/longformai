import { TimelineItem, ProjectFrameConfig } from '../types/project';

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const TARGET_FPS = 30;

export interface RenderSegmentPlan {
  timelineItem?: TimelineItem;
  mediaPath?: string;
  isImage?: boolean;
  duration: number;
  outPath: string;
  width?: number;
  height?: number;
}

export interface RenderConcatPlan {
  concatListPath: string;
  voiceoverPath?: string;
  totalDuration: number;
  outPath: string;
  frameConfig?: ProjectFrameConfig;
  overlayAssetPath?: string;
}

/**
 * Builds the FFmpeg command array for rendering a single segment (or gap).
 * Does not execute anything. Produces string[] equivalent to Python render_engine.py.
 */
export function buildSegmentCommand(plan: RenderSegmentPlan): string[] {
  // If no media is provided, generate a black gap
  if (!plan.timelineItem || !plan.mediaPath) {
    return [
      "ffmpeg", "-y", "-f", "lavfi",
      "-i", `color=c=black:s=${TARGET_WIDTH}x${TARGET_HEIGHT}:r=${TARGET_FPS}:d=${plan.duration}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", `${TARGET_FPS}`,
      "-avoid_negative_ts", "make_zero", "-movflags", "+faststart",
      plan.outPath
    ];
  }

  const item = plan.timelineItem;
  const dur = plan.duration;
  const transform = item.transform || {};
  const scale = transform.scale !== undefined ? transform.scale : 1.0;
  const pan_x = transform.x !== undefined ? transform.x : 0.0;
  const pan_y = transform.y !== undefined ? transform.y : 0.0;
  const source_start = item.sourceStart ? Math.max(0.0, item.sourceStart) : 0.0;
  
  const src_w = plan.width || TARGET_WIDTH;
  const src_h = plan.height || TARGET_HEIGHT;

  // calculate_clip_geometry
  const base_scale = Math.max(TARGET_WIDTH / src_w, TARGET_HEIGHT / src_h);
  const user_scale = Math.max(1.0, scale);
  const total_scale = base_scale * user_scale;

  // scaled dimensions must be even integers for H.264
  const scaled_w = Math.max(2, Math.round((src_w * total_scale) / 2.0) * 2);
  const scaled_h = Math.max(2, Math.round((src_h * total_scale) / 2.0) * 2);

  const delta_x = TARGET_WIDTH * (pan_x / 100.0);
  const delta_y = TARGET_HEIGHT * (pan_y / 100.0);

  const raw_crop_x = Math.round((scaled_w - TARGET_WIDTH) / 2.0 - delta_x);
  const raw_crop_y = Math.round((scaled_h - TARGET_HEIGHT) / 2.0 - delta_y);

  const crop_x = Math.max(0, Math.min(Math.max(0, scaled_w - TARGET_WIDTH), raw_crop_x));
  const crop_y = Math.max(0, Math.min(Math.max(0, scaled_h - TARGET_HEIGHT), raw_crop_y));

  let filter_str = "";
  if (scaled_w >= TARGET_WIDTH && scaled_h >= TARGET_HEIGHT) {
    filter_str = `[0:v]scale=${scaled_w}:${scaled_h}:force_original_aspect_ratio=disable,crop=${TARGET_WIDTH}:${TARGET_HEIGHT}:${crop_x}:${crop_y},setsar=1,fps=${TARGET_FPS},setpts=PTS-STARTPTS[outv]`;
  } else {
    filter_str = `[0:v]scale=${scaled_w}:${scaled_h}:force_original_aspect_ratio=disable,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${TARGET_FPS},setpts=PTS-STARTPTS[outv]`;
  }

  const cmd: string[] = ["ffmpeg", "-y"];
  if (plan.isImage) {
    cmd.push("-loop", "1", "-t", `${dur}`, "-i", plan.mediaPath);
  } else {
    if (source_start > 0.0) {
      cmd.push("-ss", `${source_start}`);
    }
    cmd.push("-i", plan.mediaPath);
  }

  cmd.push(
    "-filter_complex", filter_str,
    "-map", "[outv]",
    "-an",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-r", `${TARGET_FPS}`,
    "-t", `${dur}`,
    "-avoid_negative_ts", "make_zero",
    "-movflags", "+faststart",
    plan.outPath
  );
  
  return cmd;
}

/**
 * Builds the final FFmpeg command array that concatenates all segments and merges audio.
 */
export function buildConcatCommand(plan: RenderConcatPlan): string[] {
  const final_cmd: string[] = [
    "ffmpeg",
    "-y",
    "-fflags", "+genpts",
    "-f", "concat",
    "-safe", "0",
    "-i", plan.concatListPath,
  ];

  if (plan.voiceoverPath) {
    final_cmd.push("-i", plan.voiceoverPath);
  } else {
    final_cmd.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${plan.totalDuration}`);
  }

  const frameEnabled = plan.frameConfig?.enabled ?? true;
  const applyOverlay = frameEnabled && !!plan.overlayAssetPath;

  if (applyOverlay) {
    final_cmd.push(
      "-i", plan.overlayAssetPath!,
      "-filter_complex", "[2:v]scale=1920:1080:flags=lanczos[frame_overlay];[0:v][frame_overlay]overlay=0:0[outv]",
      "-map", "[outv]",
      "-map", "1:a:0"
    );
  } else {
    final_cmd.push(
      "-map", "0:v:0",
      "-map", "1:a:0"
    );
  }

  final_cmd.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-r", `${TARGET_FPS}`,
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    "-ac", "2",
    "-t", `${plan.totalDuration}`,
    "-movflags", "+faststart",
    plan.outPath
  );

  return final_cmd;
}
