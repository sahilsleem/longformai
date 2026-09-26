"""
LongFormAI Render Engine
Local FFmpeg-based video rendering engine for 1920x1080 16:9 Long-Form timelines.
"""

import json
import logging
import math
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("render_engine")

TARGET_WIDTH = 1920
TARGET_HEIGHT = 1080
TARGET_FPS = 30
TARGET_ASPECT = 16.0 / 9.0


def get_media_dimensions(
    file_path: str,
    fallback_w: Optional[int] = None,
    fallback_h: Optional[int] = None,
) -> Tuple[int, int, float]:
    """
    Uses ffprobe to inspect exact width, height (accounting for video display rotation),
    and duration of a video or image file. Falls back to client-provided dimensions if ffprobe is unavailable.
    """
    if not file_path or not os.path.isfile(file_path):
        w = fallback_w if fallback_w and fallback_w > 0 else TARGET_WIDTH
        h = fallback_h if fallback_h and fallback_h > 0 else TARGET_HEIGHT
        return w, h, 0.0

    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration,tags,side_data_list:format=duration",
        "-of",
        "json",
        file_path,
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        streams = data.get("streams", [])
        if not streams:
            raise ValueError(f"No video streams found in {file_path}")

        raw_w = int(streams[0].get("width", 0))
        raw_h = int(streams[0].get("height", 0))

        if raw_w <= 0 or raw_h <= 0:
            if fallback_w and fallback_h and fallback_w > 0 and fallback_h > 0:
                raw_w, raw_h = fallback_w, fallback_h
            else:
                raw_w, raw_h = TARGET_WIDTH, TARGET_HEIGHT

        # Check for rotation tags / displaymatrix (e.g. mobile 9:16 portrait video stored as 1920x1080)
        rotation = 0
        tags = streams[0].get("tags", {})
        if "rotate" in tags:
            try:
                rotation = abs(int(float(tags["rotate"])))
            except (ValueError, TypeError):
                rotation = 0

        for sd in streams[0].get("side_data_list", []):
            if "rotation" in sd:
                try:
                    rotation = abs(int(float(sd["rotation"])))
                except (ValueError, TypeError):
                    pass

        # If rotated 90 or 270 degrees, display width and height are inverted
        if rotation in (90, 270):
            w, h = raw_h, raw_w
        else:
            w, h = raw_w, raw_h

        duration = 0.0
        if "duration" in streams[0] and streams[0]["duration"] is not None:
            try:
                duration = float(streams[0]["duration"])
            except (ValueError, TypeError):
                duration = 0.0
        elif "format" in data and "duration" in data["format"]:
            try:
                duration = float(data["format"]["duration"])
            except (ValueError, TypeError):
                duration = 0.0

        return w, h, duration
    except Exception as e:
        logger.warning(f"ffprobe inspection for {file_path} had issue: {e}.")
        w = fallback_w if fallback_w and fallback_w > 0 else TARGET_WIDTH
        h = fallback_h if fallback_h and fallback_h > 0 else TARGET_HEIGHT
        return w, h, 0.0


def calculate_clip_geometry(
    src_width: int,
    src_height: int,
    fit_mode: str = "cover",
    scale: float = 1.0,
    pan_x: float = 0.0,
    pan_y: float = 0.0,
) -> Tuple[int, int, int, int]:
    """
    Calculates the exact scaled dimensions (scaled_w, scaled_h) and top-left placement coordinates (pos_x, pos_y)
    relative to a 1920x1080 canvas for the specified fit mode, scale multiplier, and pan offsets.
    
    Guarantees 100% aspect ratio preservation (uniform scaling factor applied to both W and H)
    and mathematical parity with PreviewCanvas.tsx.
    
    Returns:
        (scaled_w, scaled_h, pos_x, pos_y)
    """
    if src_width <= 0 or src_height <= 0:
        src_width, src_height = TARGET_WIDTH, TARGET_HEIGHT

    # Base scale factor: uniform scale to ensure the source completely covers the 16:9 output window
    # (Identical to PreviewCanvas.tsx: sourceRatio < 16/9 fills 1920 width; sourceRatio >= 16/9 fills 1080 height)
    base_scale = max(TARGET_WIDTH / src_width, TARGET_HEIGHT / src_height)

    # Apply user zoom multiplier uniformly to both dimensions
    user_scale = max(1.0, float(scale) if scale else 1.0)
    total_scale = base_scale * user_scale

    # Calculate scaled dimensions (must be even integers for H.264 encoding)
    scaled_w = max(2, int(round((src_width * total_scale) / 2.0) * 2))
    scaled_h = max(2, int(round((src_height * total_scale) / 2.0) * 2))

    # Center placement plus pan offsets (pan_x / pan_y are percentages of the 16:9 output frame)
    delta_x = TARGET_WIDTH * (float(pan_x or 0.0) / 100.0)
    delta_y = TARGET_HEIGHT * (float(pan_y or 0.0) / 100.0)

    pos_x = int(round((TARGET_WIDTH - scaled_w) / 2.0 + delta_x))
    pos_y = int(round((TARGET_HEIGHT - scaled_h) / 2.0 + delta_y))

    return scaled_w, scaled_h, pos_x, pos_y


def calculate_clip_crop_params(
    src_width: int,
    src_height: int,
    scale: float = 1.0,
    pan_x: float = 0.0,
    pan_y: float = 0.0,
) -> Dict[str, int]:
    """
    Calculates scaled dimensions and crop coordinates for direct scale+crop filter generation.
    """
    scaled_w, scaled_h, pos_x, pos_y = calculate_clip_geometry(
        src_width, src_height, fit_mode="cover", scale=scale, pan_x=pan_x, pan_y=pan_y
    )
    delta_x = TARGET_WIDTH * (float(pan_x or 0.0) / 100.0)
    delta_y = TARGET_HEIGHT * (float(pan_y or 0.0) / 100.0)

    raw_crop_x = int(round((scaled_w - TARGET_WIDTH) / 2.0 - delta_x))
    raw_crop_y = int(round((scaled_h - TARGET_HEIGHT) / 2.0 - delta_y))

    crop_x = max(0, min(max(0, scaled_w - TARGET_WIDTH), raw_crop_x))
    crop_y = max(0, min(max(0, scaled_h - TARGET_HEIGHT), raw_crop_y))

    return {
        "scaled_w": scaled_w,
        "scaled_h": scaled_h,
        "pos_x": pos_x,
        "pos_y": pos_y,
        "crop_x": crop_x,
        "crop_y": crop_y,
    }


def render_project(
    project_data: Dict[str, Any],
    media_file_map: Dict[str, str],
    voiceover_path: Optional[str],
    output_mp4_path: str,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> Dict[str, Any]:
    """
    Renders a complete LongFormAI project into a 1920x1080 30fps MP4 video.
    
    Args:
        project_data: The project dictionary containing timeline, media assets, etc.
        media_file_map: Dictionary mapping media asset IDs to local file paths.
        voiceover_path: Optional path to the master voiceover audio file.
        output_mp4_path: Path where the rendered MP4 will be saved.
        progress_callback: Optional callback reporting (percentage 0-100, message).
        
    Returns:
        Dict with render metadata and status.
    """
    if progress_callback:
        progress_callback(5.0, "Preparing timeline and verifying media files...")
        
    timeline_items: List[Dict[str, Any]] = project_data.get("timeline", [])
    voiceover_info: Optional[Dict[str, Any]] = project_data.get("voiceover")
    
    # Determine total timeline duration
    voiceover_duration = 0.0
    if voiceover_path and os.path.isfile(voiceover_path):
        _, _, v_dur = get_media_dimensions(voiceover_path)
        voiceover_duration = v_dur
        
    if voiceover_duration <= 0.0 and voiceover_info:
        voiceover_duration = float(voiceover_info.get("duration", 0.0))
        
    max_timeline_end = 0.0
    for item in timeline_items:
        end_time = float(item.get("startTime", 0.0)) + float(item.get("duration", 0.0))
        if end_time > max_timeline_end:
            max_timeline_end = end_time
            
    total_duration = max(voiceover_duration, max_timeline_end)
    if total_duration <= 0.0:
        total_duration = 5.0  # Default fallback duration if timeline is completely empty
        
    # Sort timeline items chronologically
    sorted_items = sorted(timeline_items, key=lambda x: float(x.get("startTime", 0.0)))
    
    # Create temp directory for intermediate shot renders
    temp_dir = tempfile.mkdtemp(prefix="longform_render_")
    rendered_segment_paths: List[str] = []
    
    try:
        current_time = 0.0
        segment_index = 0
        
        # Build segments list including gaps
        segments_to_render = []
        
        for item in sorted_items:
            start_time = max(0.0, float(item.get("startTime", 0.0)))
            duration = float(item.get("duration", 0.0))
            if duration <= 0.0:
                continue
                
            # Check for unassigned gap before this item
            gap_duration = start_time - current_time
            if gap_duration > 0.04:  # At least ~1 frame at 30fps
                segments_to_render.append({
                    "is_gap": True,
                    "duration": gap_duration,
                })
                current_time += gap_duration
                
            segments_to_render.append({
                "is_gap": False,
                "item": item,
                "duration": duration,
            })
            current_time = start_time + duration
            
        # Check for trailing gap until total_duration
        trailing_gap = total_duration - current_time
        if trailing_gap > 0.04:
            segments_to_render.append({
                "is_gap": True,
                "duration": trailing_gap,
            })
            current_time += trailing_gap
            
        # If timeline was empty, render a single black gap for total duration
        if not segments_to_render:
            segments_to_render.append({
                "is_gap": True,
                "duration": total_duration,
            })
            
        total_segments = len(segments_to_render)
        
        for idx, seg in enumerate(segments_to_render):
            seg_out = os.path.join(temp_dir, f"seg_{idx:04d}.mp4")
            rendered_segment_paths.append(seg_out)
            
            if seg["is_gap"]:
                dur = seg["duration"]
                if progress_callback:
                    pct = 10.0 + (idx / total_segments) * 60.0
                    progress_callback(pct, f"Rendering gap segment {idx+1}/{total_segments} ({dur:.2f}s)...")
                    
                # Render neutral 16:9 black video segment with zero-based timestamp
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-f", "lavfi",
                    "-i", f"color=c=black:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={TARGET_FPS}:d={dur}",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p",
                    "-r", str(TARGET_FPS),
                    "-avoid_negative_ts", "make_zero",
                    "-movflags", "+faststart",
                    seg_out,
                ]
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode != 0:
                    raise RuntimeError(f"FFmpeg failed rendering black gap: {res.stderr}")
            else:
                item = seg["item"]
                dur = seg["duration"]
                media_id = item.get("mediaId", "")
                media_path = media_file_map.get(media_id)
                if not media_path or not os.path.isfile(media_path):
                    # Try resilient matching across keys
                    for k, v in media_file_map.items():
                        if v and os.path.isfile(v):
                            if k == media_id or k.startswith(f"{media_id}_") or media_id.startswith(f"{k}_") or k.startswith(media_id) or media_id.startswith(k):
                                media_path = v
                                break
                
                if progress_callback:
                    pct = 10.0 + (idx / total_segments) * 60.0
                    progress_callback(pct, f"Rendering clip {idx+1}/{total_segments} ({dur:.2f}s)...")
                    
                if not media_path or not os.path.isfile(media_path):
                    logger.warning(f"Media file missing for ID {media_id}. Rendering black filler.")
                    cmd = [
                        "ffmpeg",
                        "-y",
                        "-f", "lavfi",
                        "-i", f"color=c=black:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={TARGET_FPS}:d={dur}",
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-pix_fmt", "yuv420p",
                        "-r", str(TARGET_FPS),
                        "-avoid_negative_ts", "make_zero",
                        "-movflags", "+faststart",
                        seg_out,
                    ]
                    subprocess.run(cmd, check=True, capture_output=True)
                    continue
                    
                transform = item.get("transform", {})
                scale = float(transform.get("scale", 1.0))
                pan_x = float(transform.get("x", 0.0))
                pan_y = float(transform.get("y", 0.0))
                source_start = max(0.0, float(item.get("sourceStart", 0.0)))
                
                # Fetch client metadata fallback if available
                media_meta = next(
                    (m for m in project_data.get("media", []) if m.get("id") == media_id),
                    None
                )
                fb_w = media_meta.get("width") if media_meta else None
                fb_h = media_meta.get("height") if media_meta else None
                
                src_w, src_h, _ = get_media_dimensions(media_path, fallback_w=fb_w, fallback_h=fb_h)
                crop_params = calculate_clip_crop_params(
                    src_w, src_h, scale=scale, pan_x=pan_x, pan_y=pan_y
                )
                scaled_w = crop_params["scaled_w"]
                scaled_h = crop_params["scaled_h"]
                crop_x = crop_params["crop_x"]
                crop_y = crop_params["crop_y"]
                
                is_image = any(media_path.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"])
                
                # Direct Scale & Crop Filter with setsar=1:
                # 1. Scale footage uniformly to scaled_w x scaled_h (preserving source aspect ratio)
                # 2. Crop exactly 1920x1080 at (crop_x, crop_y)
                # 3. Force setsar=1 (square pixels) to prevent anamorphic distortion
                # 4. Standardize fps and pts
                if scaled_w >= TARGET_WIDTH and scaled_h >= TARGET_HEIGHT:
                    filter_str = (
                        f"[0:v]scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=disable,"
                        f"crop={TARGET_WIDTH}:{TARGET_HEIGHT}:{crop_x}:{crop_y},"
                        f"setsar=1,fps={TARGET_FPS},setpts=PTS-STARTPTS[outv]"
                    )
                else:
                    filter_str = (
                        f"[0:v]scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=disable,"
                        f"pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,"
                        f"setsar=1,fps={TARGET_FPS},setpts=PTS-STARTPTS[outv]"
                    )
                
                cmd = ["ffmpeg", "-y"]
                if is_image:
                    cmd += ["-loop", "1", "-t", str(dur), "-i", media_path]
                else:
                    if source_start > 0.0:
                        cmd += ["-ss", str(source_start)]
                    cmd += ["-i", media_path]
                    
                cmd += [
                    "-filter_complex", filter_str,
                    "-map", "[outv]",
                    "-an",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p",
                    "-r", str(TARGET_FPS),
                    "-t", str(dur),
                    "-avoid_negative_ts", "make_zero",
                    "-movflags", "+faststart",
                    seg_out,
                ]
                
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode != 0:
                    logger.error(f"FFmpeg error rendering segment {idx} for media {media_id} ({media_path}):\nReturn code: {res.returncode}\nStderr:\n{res.stderr}")
                    # Fallback to black screen on error to prevent total failure
                    fb_cmd = [
                        "ffmpeg", "-y", "-f", "lavfi",
                        "-i", f"color=c=black:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={TARGET_FPS}:d={dur}",
                        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", str(TARGET_FPS),
                        "-avoid_negative_ts", "make_zero", "-movflags", "+faststart",
                        seg_out,
                    ]
                    subprocess.run(fb_cmd, check=True, capture_output=True)
                    
        # Step 2: Concatenate all video segments and merge with voiceover audio
        if progress_callback:
            progress_callback(75.0, "Concatenating video segments and syncing voiceover audio...")
            
        concat_list_path = os.path.join(temp_dir, "concat_list.txt")
        with open(concat_list_path, "w", encoding="utf-8") as f:
            for p in rendered_segment_paths:
                # Escape backslashes for ffmpeg concat file
                norm_p = os.path.abspath(p).replace("\\", "/")
                f.write(f"file '{norm_p}'\n")
                
        # Check if project frame overlay is enabled
        frame_config = project_data.get("frame") if isinstance(project_data, dict) else None
        frame_enabled = True
        if frame_config is not None and isinstance(frame_config, dict):
            frame_enabled = bool(frame_config.get("enabled", True))
            
        overlay_asset_path = ""
        if frame_config and isinstance(frame_config, dict) and frame_config.get("overlay_path"):
            cand = frame_config["overlay_path"]
            if os.path.isfile(cand) and os.path.getsize(cand) > 1000:
                try:
                    with open(cand, "rb") as pf:
                        if pf.read(8) == b"\x89PNG\r\n\x1a\n":
                            overlay_asset_path = cand
                except Exception:
                    pass
                
        if not overlay_asset_path:
            server_asset = os.path.join(os.path.dirname(__file__), "assets", "bollywood_frame_overlay.png")
            if os.path.isfile(server_asset):
                overlay_asset_path = server_asset
            else:
                alt_overlay = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "frames", "bollywood_frame_overlay.png")
                if os.path.isfile(alt_overlay):
                    overlay_asset_path = alt_overlay

        if frame_enabled and (not overlay_asset_path or not os.path.isfile(overlay_asset_path)):
            error_msg = "[FRAME DEBUG ENGINE] Frame overlay is enabled, but no valid frame asset PNG exists on server or in upload."
            logger.error(error_msg)
            raise RuntimeError("Persistent frame is enabled, but the frame overlay asset could not be loaded or verified.")
                
        apply_frame_overlay = frame_enabled and bool(overlay_asset_path and os.path.isfile(overlay_asset_path))
        if apply_frame_overlay:
            logger.info(f"[FRAME DEBUG ENGINE] Applying persistent frame overlay from: {overlay_asset_path} (size: {os.path.getsize(overlay_asset_path)} bytes)")
        else:
            logger.info("[FRAME DEBUG ENGINE] Frame overlay is disabled by project configuration.")
                
        # Prepare final FFmpeg assembly command with +genpts to ensure seamless timeline progression
        final_cmd = [
            "ffmpeg",
            "-y",
            "-fflags", "+genpts",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
        ]
        
        has_valid_voiceover = bool(voiceover_path and os.path.isfile(voiceover_path))
        if has_valid_voiceover:
            final_cmd += ["-i", voiceover_path]
        else:
            final_cmd += ["-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={total_duration}"]
            
        if apply_frame_overlay:
            final_cmd += [
                "-i", overlay_asset_path,
                "-filter_complex", "[0:v][2:v]overlay=0:0[outv]",
                "-map", "[outv]",
                "-map", "1:a:0",
            ]
        else:
            final_cmd += [
                "-map", "0:v:0",
                "-map", "1:a:0",
            ]
            
        final_cmd += [
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-r", str(TARGET_FPS),
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "44100",
            "-ac", "2",
            "-t", str(total_duration),
            "-movflags", "+faststart",
            output_mp4_path,
        ]
            
        if progress_callback:
            progress_callback(85.0, "Encoding master 1920x1080 MP4 with H.264 & AAC...")
            
        final_res = subprocess.run(final_cmd, capture_output=True, text=True)
        if final_res.returncode != 0:
            raise RuntimeError(f"Final FFmpeg assembly failed: {final_res.stderr}")
            
        if progress_callback:
            progress_callback(100.0, "Render complete!")
            
        # Verify rendered file
        out_w, out_h, out_dur = get_media_dimensions(output_mp4_path)
        file_size = os.path.getsize(output_mp4_path) if os.path.isfile(output_mp4_path) else 0
        
        return {
            "success": True,
            "outputPath": output_mp4_path,
            "filename": os.path.basename(output_mp4_path),
            "width": out_w,
            "height": out_h,
            "fps": TARGET_FPS,
            "duration": round(out_dur, 2),
            "sizeBytes": file_size,
            "aspectRatio": "16:9",
            "videoCodec": "h264 (yuv420p)",
            "audioCodec": "aac (44.1kHz, 192kbps)",
        }
    finally:
        # Cleanup temporary segment directory
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            logger.warning(f"Failed to cleanup temp dir {temp_dir}: {e}")
