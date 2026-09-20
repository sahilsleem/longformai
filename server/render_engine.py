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


def get_media_dimensions(file_path: str) -> Tuple[int, int, float]:
    """
    Uses ffprobe to inspect exact width, height, and duration of a video or image file.
    """
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration:format=duration",
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
        
        w = int(streams[0].get("width", TARGET_WIDTH))
        h = int(streams[0].get("height", TARGET_HEIGHT))
        
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
        logger.warning(f"ffprobe failed for {file_path}: {e}. Defaulting to 1920x1080.")
        return TARGET_WIDTH, TARGET_HEIGHT, 0.0


def calculate_clip_geometry(
    src_width: int,
    src_height: int,
    fit_mode: str,
    scale: float,
    pan_x: float,
    pan_y: float,
) -> Tuple[int, int, int, int]:
    """
    Calculates the exact scaled dimensions (w, h) and top-left placement coordinates (x, y)
    relative to a 1920x1080 canvas for the specified fit mode, scale multiplier, and pan offsets.
    
    Returns:
        (scaled_w, scaled_h, pos_x, pos_y)
    """
    if src_width <= 0 or src_height <= 0:
        src_width, src_height = TARGET_WIDTH, TARGET_HEIGHT
        
    src_ratio = src_width / src_height
    
    if fit_mode == "contain":
        if src_ratio >= TARGET_ASPECT:
            base_scale = TARGET_WIDTH / src_width
        else:
            base_scale = TARGET_HEIGHT / src_height
    else:
        # 'cover' or 'custom'
        if src_ratio >= TARGET_ASPECT:
            base_scale = TARGET_HEIGHT / src_height
        else:
            base_scale = TARGET_WIDTH / src_width
            
    total_scale = max(0.1, base_scale * max(0.1, scale))
    
    # Calculate scaled dimensions (must be even integers for H.264)
    scaled_w = max(2, int(round((src_width * total_scale) / 2.0) * 2))
    scaled_h = max(2, int(round((src_height * total_scale) / 2.0) * 2))
    
    # Center placement plus pan offsets
    delta_x = TARGET_WIDTH * (pan_x / 100.0)
    delta_y = TARGET_HEIGHT * (pan_y / 100.0)
    
    pos_x = int(round((TARGET_WIDTH - scaled_w) / 2.0 + delta_x))
    pos_y = int(round((TARGET_HEIGHT - scaled_h) / 2.0 + delta_y))
    
    return scaled_w, scaled_h, pos_x, pos_y


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
            seg_out = os.path.join(temp_dir, f"seg_{idx:04d}.ts")
            rendered_segment_paths.append(seg_out)
            
            if seg["is_gap"]:
                dur = seg["duration"]
                if progress_callback:
                    pct = 10.0 + (idx / total_segments) * 60.0
                    progress_callback(pct, f"Rendering gap segment {idx+1}/{total_segments} ({dur:.2f}s)...")
                    
                # Render neutral 16:9 black video segment
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-f", "lavfi",
                    "-i", f"color=c=black:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={TARGET_FPS}:d={dur}",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p",
                    "-r", str(TARGET_FPS),
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
                
                if progress_callback:
                    pct = 10.0 + (idx / total_segments) * 60.0
                    progress_callback(pct, f"Rendering clip {idx+1}/{total_segments} ({dur:.2f}s)...")
                    
                if not media_path or not os.path.isfile(media_path):
                    logger.warning(f"Media file missing for ID {media_id}. Rendering black filler.")
                    # Render black filler for missing media
                    cmd = [
                        "ffmpeg",
                        "-y",
                        "-f", "lavfi",
                        "-i", f"color=c=black:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={TARGET_FPS}:d={dur}",
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-pix_fmt", "yuv420p",
                        "-r", str(TARGET_FPS),
                        seg_out,
                    ]
                    subprocess.run(cmd, check=True, capture_output=True)
                    continue
                    
                transform = item.get("transform", {})
                fit_mode = transform.get("fitMode", "cover")
                scale = float(transform.get("scale", 1.0))
                pan_x = float(transform.get("x", 0.0))
                pan_y = float(transform.get("y", 0.0))
                source_start = max(0.0, float(item.get("sourceStart", 0.0)))
                
                src_w, src_h, _ = get_media_dimensions(media_path)
                scaled_w, scaled_h, pos_x, pos_y = calculate_clip_geometry(
                    src_w, src_h, fit_mode, scale, pan_x, pan_y
                )
                
                is_image = any(media_path.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"])
                
                # Compose filter_complex for this segment:
                # 1. Base 1920x1080 black canvas of length dur
                # 2. Scale media to scaled_w x scaled_h
                # 3. Overlay scaled media at pos_x, pos_y onto black canvas
                filter_str = (
                    f"color=c=black:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={TARGET_FPS}:d={dur}[bg];"
                    f"[0:v]scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=disable,fps={TARGET_FPS},setpts=PTS-STARTPTS[scaled];"
                    f"[bg][scaled]overlay=x={pos_x}:y={pos_y}:shortest=1[outv]"
                )
                
                cmd = ["ffmpeg", "-y"]
                if is_image:
                    cmd += ["-loop", "1", "-t", str(dur), "-i", media_path]
                else:
                    cmd += ["-ss", str(source_start), "-t", str(dur), "-i", media_path]
                    
                cmd += [
                    "-filter_complex", filter_str,
                    "-map", "[outv]",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p",
                    "-r", str(TARGET_FPS),
                    "-t", str(dur),
                    seg_out,
                ]
                
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode != 0:
                    logger.error(f"FFmpeg error rendering segment {idx}: {res.stderr}")
                    # Fallback to black screen on error to prevent total failure
                    fb_cmd = [
                        "ffmpeg", "-y", "-f", "lavfi",
                        "-i", f"color=c=black:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={TARGET_FPS}:d={dur}",
                        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", str(TARGET_FPS),
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
                
        # Prepare final FFmpeg assembly command
        final_cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
        ]
        
        has_valid_voiceover = bool(voiceover_path and os.path.isfile(voiceover_path))
        
        if has_valid_voiceover:
            final_cmd += [
                "-i", voiceover_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
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
        else:
            # Generate silent audio track
            final_cmd += [
                "-f", "lavfi",
                "-i", f"anullsrc=r=44100:cl=stereo:d={total_duration}",
                "-map", "0:v:0",
                "-map", "1:a:0",
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
