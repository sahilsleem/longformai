"""
Test Suite for LongFormAI Render Engine
Tests end-to-end rendering across various aspect ratios, zoom/pan framing, gaps, and voiceover audio.
"""

import json
import os
import subprocess
import tempfile
try:
    from server.render_engine import (
        get_media_dimensions,
        calculate_clip_geometry,
        calculate_clip_crop_params,
        render_project,
        TARGET_WIDTH,
        TARGET_HEIGHT,
        TARGET_ASPECT,
    )
except ImportError:
    from render_engine import (
        get_media_dimensions,
        calculate_clip_geometry,
        calculate_clip_crop_params,
        render_project,
        TARGET_WIDTH,
        TARGET_HEIGHT,
        TARGET_ASPECT,
    )


def test_geometry_calculations():
    """
    Unit tests for calculate_clip_geometry and calculate_clip_crop_params across all aspect ratios.
    """
    print("Testing geometry and aspect ratio preservation calculations...")

    # Test A: Native 16:9 (1920x1080)
    g_16_9 = calculate_clip_crop_params(1920, 1080, scale=1.0, pan_x=0.0, pan_y=0.0)
    assert g_16_9["scaled_w"] == 1920, f"Expected 1920, got {g_16_9['scaled_w']}"
    assert g_16_9["scaled_h"] == 1080, f"Expected 1080, got {g_16_9['scaled_h']}"
    assert g_16_9["crop_x"] == 0, f"Expected 0, got {g_16_9['crop_x']}"
    assert g_16_9["crop_y"] == 0, f"Expected 0, got {g_16_9['crop_y']}"

    # Test B: Square 1:1 (1000x1000)
    g_1_1 = calculate_clip_crop_params(1000, 1000, scale=1.0, pan_x=0.0, pan_y=0.0)
    assert g_1_1["scaled_w"] == 1920, f"Expected 1920, got {g_1_1['scaled_w']}"
    assert g_1_1["scaled_h"] == 1920, f"Expected 1920, got {g_1_1['scaled_h']}"
    assert g_1_1["crop_x"] == 0
    assert g_1_1["crop_y"] == 420  # (1920 - 1080) / 2

    # Test C: Portrait 9:16 (1080x1920)
    g_9_16 = calculate_clip_crop_params(1080, 1920, scale=1.0, pan_x=0.0, pan_y=0.0)
    assert g_9_16["scaled_w"] == 1920, f"Expected 1920, got {g_9_16['scaled_w']}"
    assert g_9_16["scaled_h"] == 3414, f"Expected 3414, got {g_9_16['scaled_h']}"
    assert g_9_16["crop_x"] == 0
    assert g_9_16["crop_y"] == 1167  # (3414 - 1080) / 2

    # Test D: 4:3 (1440x1080)
    g_4_3 = calculate_clip_crop_params(1440, 1080, scale=1.0, pan_x=0.0, pan_y=0.0)
    assert g_4_3["scaled_w"] == 1920
    assert g_4_3["scaled_h"] == 1440
    assert g_4_3["crop_x"] == 0
    assert g_4_3["crop_y"] == 180  # (1440 - 1080) / 2

    # Test E: Ultrawide 21:9 (2560x1080)
    g_21_9 = calculate_clip_crop_params(2560, 1080, scale=1.0, pan_x=0.0, pan_y=0.0)
    assert g_21_9["scaled_w"] == 2560
    assert g_21_9["scaled_h"] == 1080
    assert g_21_9["crop_x"] == 320  # (2560 - 1920) / 2
    assert g_21_9["crop_y"] == 0

    print(" Geometry calculations strictly preserve aspect ratio and PreviewCanvas fidelity!")


def generate_synthetic_assets(test_dir: str):
    """
    Creates synthetic video, image, and audio files for testing.
    """
    assets = {}
    
    # 1. 16:9 Native Video (1920x1080, 5 seconds, test pattern)
    v_16_9 = os.path.join(test_dir, "test_16_9.mp4")
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "testsrc=size=1920x1080:rate=30:duration=5",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        v_16_9
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assets["v_16_9"] = v_16_9

    # 2. 9:16 Vertical Video (1080x1920, 4 seconds, blue color)
    v_9_16 = os.path.join(test_dir, "test_9_16.mp4")
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=blue:size=1080x1920:rate=30:duration=4",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        v_9_16
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assets["v_9_16"] = v_9_16

    # 3. 1:1 Square Image (1000x1000, red color)
    img_1_1 = os.path.join(test_dir, "test_1_1.png")
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=red:size=1000x1000:duration=1",
        "-vframes", "1",
        img_1_1
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assets["img_1_1"] = img_1_1

    # 4. 4:3 Standard Image (1440x1080, yellow color)
    img_4_3 = os.path.join(test_dir, "test_4_3.png")
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=yellow:size=1440x1080:duration=1",
        "-vframes", "1",
        img_4_3
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assets["img_4_3"] = img_4_3

    # 5. 21:9 Ultrawide Image (2560x1080, green color)
    img_21_9 = os.path.join(test_dir, "test_21_9.png")
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=green:size=2560x1080:duration=1",
        "-vframes", "1",
        img_21_9
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assets["img_21_9"] = img_21_9

    # 6. Voiceover Audio (440Hz sine wave, 20 seconds, stereo 44.1kHz)
    vo_audio = os.path.join(test_dir, "voiceover.wav")
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "sine=frequency=440:sample_rate=44100:duration=20",
        "-c:a", "pcm_s16le",
        vo_audio
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assets["vo_audio"] = vo_audio

    return assets


def run_tests():
    test_geometry_calculations()

    test_dir = tempfile.mkdtemp(prefix="longform_test_")
    print(f"Creating test environment in {test_dir}...")
    
    try:
        assets = generate_synthetic_assets(test_dir)
        print("Generated synthetic test media assets successfully.")

        # Construct a realistic LongForm project timeline covering 16:9 -> 1:1 -> 9:16 -> 4:3 -> 21:9
        # 0.0s - 3.0s: 16:9 Video
        # 3.0s - 6.0s: 9:16 Vertical Video (centered 16:9 cover)
        # 6.0s - 7.5s: UNASSIGNED GAP (Neutral black canvas while voiceover continues)
        # 7.5s - 11.0s: 1:1 Square Image (zoom 1.5x, pan x=10%, y=-5%)
        # 11.0s - 14.0s: 4:3 Standard Image (cover)
        # 14.0s - 18.0s: 21:9 Ultrawide Image (cover)
        # Total Voiceover: 20.0s
        project = {
            "version": "1.0",
            "id": "test_proj_001",
            "name": "Aspect Ratio Fidelity Verification Project",
            "resolution": {
                "width": 1920,
                "height": 1080,
                "aspectRatio": "16:9"
            },
            "fps": 30,
            "voiceover": {
                "id": "vo_1",
                "name": "voiceover.wav",
                "duration": 20.0,
                "volume": 1.0,
                "isMuted": False
            },
            "timeline": [
                {
                    "id": "item_1",
                    "mediaId": "med_16_9",
                    "trackIndex": 0,
                    "startTime": 0.0,
                    "duration": 3.0,
                    "sourceStart": 0.0,
                    "sourceDuration": 5.0,
                    "transform": {
                        "fitMode": "cover",
                        "scale": 1.0,
                        "x": 0.0,
                        "y": 0.0,
                    }
                },
                {
                    "id": "item_2",
                    "mediaId": "med_9_16",
                    "trackIndex": 0,
                    "startTime": 3.0,
                    "duration": 3.0,
                    "sourceStart": 0.5,
                    "sourceDuration": 4.0,
                    "transform": {
                        "fitMode": "cover",
                        "scale": 1.0,
                        "x": 0.0,
                        "y": 0.0,
                    }
                },
                # Note: Gap from 6.0s to 7.5s (1.5s unassigned gap)
                {
                    "id": "item_3",
                    "mediaId": "med_1_1",
                    "trackIndex": 0,
                    "startTime": 7.5,
                    "duration": 3.5,
                    "sourceStart": 0.0,
                    "sourceDuration": 5.0,
                    "transform": {
                        "fitMode": "cover",
                        "scale": 1.5,
                        "x": 10.0,
                        "y": -5.0,
                    }
                },
                {
                    "id": "item_4",
                    "mediaId": "med_4_3",
                    "trackIndex": 0,
                    "startTime": 11.0,
                    "duration": 3.0,
                    "sourceStart": 0.0,
                    "sourceDuration": 5.0,
                    "transform": {
                        "fitMode": "cover",
                        "scale": 1.0,
                        "x": 0.0,
                        "y": 0.0,
                    }
                },
                {
                    "id": "item_5",
                    "mediaId": "med_21_9",
                    "trackIndex": 0,
                    "startTime": 14.0,
                    "duration": 4.0,
                    "sourceStart": 0.0,
                    "sourceDuration": 5.0,
                    "transform": {
                        "fitMode": "cover",
                        "scale": 1.0,
                        "x": 0.0,
                        "y": 0.0,
                    }
                }
            ],
            "media": [
                {"id": "med_16_9", "name": "test_16_9.mp4", "type": "video", "width": 1920, "height": 1080},
                {"id": "med_9_16", "name": "test_9_16.mp4", "type": "video", "width": 1080, "height": 1920},
                {"id": "med_1_1", "name": "test_1_1.png", "type": "image", "width": 1000, "height": 1000},
                {"id": "med_4_3", "name": "test_4_3.png", "type": "image", "width": 1440, "height": 1080},
                {"id": "med_21_9", "name": "test_21_9.png", "type": "image", "width": 2560, "height": 1080},
            ]
        }

        media_map = {
            "med_16_9": assets["v_16_9"],
            "med_9_16": assets["v_9_16"],
            "med_1_1": assets["img_1_1"],
            "med_4_3": assets["img_4_3"],
            "med_21_9": assets["img_21_9"],
        }

        output_mp4 = os.path.join(test_dir, "output_rendered.mp4")

        def on_progress(pct, msg):
            print(f"  [Progress {pct:.1f}%] {msg}")

        print("\nStarting video rendering...")
        result = render_project(
            project_data=project,
            media_file_map=media_map,
            voiceover_path=assets["vo_audio"],
            output_mp4_path=output_mp4,
            progress_callback=on_progress
        )

        print(f"\nRender result: {json.dumps(result, indent=2)}")

        # Verification with ffprobe
        print("\nVerifying rendered MP4 with ffprobe...")
        probe_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration,size",
            "-of", "json",
            output_mp4
        ]
        probe_res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
        probe_data = json.loads(probe_res.stdout)
        print(f"Probe data:\n{json.dumps(probe_data, indent=2)}")

        # Assertions
        streams = probe_data["streams"]
        v_stream = next(s for s in streams if s["codec_type"] == "video")
        a_stream = next(s for s in streams if s["codec_type"] == "audio")

        assert v_stream["width"] == 1920, f"Expected 1920 width, got {v_stream['width']}"
        assert v_stream["height"] == 1080, f"Expected 1080 height, got {v_stream['height']}"
        assert v_stream["codec_name"] == "h264", f"Expected h264 codec, got {v_stream['codec_name']}"
        assert a_stream["codec_name"] == "aac", f"Expected aac codec, got {a_stream['codec_name']}"
        assert int(a_stream["sample_rate"]) == 44100, f"Expected 44100Hz audio, got {a_stream['sample_rate']}"

        total_dur = float(probe_data["format"]["duration"])
        assert abs(total_dur - 20.0) < 0.3, f"Expected ~20.0s duration, got {total_dur}s"

        print("\n ALL RENDERING FIDELITY VERIFICATIONS PASSED SUCCESSFULLY!")

    finally:
        import shutil
        shutil.rmtree(test_dir, ignore_errors=True)

if __name__ == "__main__":
    run_tests()

