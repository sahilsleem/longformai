"""
Test Suite for LongFormAI Render Server API
Tests health check, background job polling, file uploads, and output retrieval.
"""

import json
import os
import shutil
import subprocess
import tempfile
import time
import requests
from render_engine import get_media_dimensions

SERVER_URL = "http://127.0.0.1:8768"

def test_api():
    print("Testing Render Server API on", SERVER_URL)
    # 1. Health check
    res = requests.get(f"{SERVER_URL}/health")
    assert res.status_code == 200
    health_data = res.json()
    print("Health response:", json.dumps(health_data, indent=2))
    assert health_data["status"] == "ok"
    assert health_data["ffmpegAvailable"] is True

    # 2. Create synthetic test media
    test_dir = tempfile.mkdtemp(prefix="longform_api_test_")
    try:
        # 16:9 video (3s)
        v_path = os.path.join(test_dir, "clip.mp4")
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "testsrc=size=1920x1080:rate=30:duration=3",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            v_path
        ], check=True, capture_output=True)

        # Audio (3s)
        a_path = os.path.join(test_dir, "voiceover.wav")
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "sine=frequency=500:sample_rate=44100:duration=3",
            "-c:a", "pcm_s16le",
            a_path
        ], check=True, capture_output=True)

        project = {
            "version": "1.0",
            "id": "api_test_proj",
            "name": "API Render Verification",
            "resolution": {"width": 1920, "height": 1080, "aspectRatio": "16:9"},
            "fps": 30,
            "voiceover": {"id": "vo_1", "duration": 3.0, "volume": 1.0, "isMuted": False},
            "timeline": [
                {
                    "id": "item_1",
                    "mediaId": "clip_1",
                    "trackIndex": 0,
                    "startTime": 0.0,
                    "duration": 3.0,
                    "sourceStart": 0.0,
                    "sourceDuration": 3.0,
                    "transform": {"fitMode": "cover", "scale": 1.0, "x": 0.0, "y": 0.0, "crop": {"x": 0, "y": 0, "width": 1, "height": 1}}
                }
            ],
            "media": [{"id": "clip_1", "name": "clip.mp4", "type": "video", "width": 1920, "height": 1080}]
        }

        # 3. Post multipart render
        with open(v_path, "rb") as vf, open(a_path, "rb") as af:
            files = [
                ("media_files", ("clip_1.mp4", vf, "video/mp4")),
                ("voiceover", ("voiceover.wav", af, "audio/wav")),
            ]
            data = {
                "project_json": json.dumps(project),
            }
            render_res = requests.post(f"{SERVER_URL}/render/multipart", data=data, files=files)

        assert render_res.status_code == 200
        job_info = render_res.json()
        job_id = job_info["jobId"]
        print(f"Queued render job: {job_id}")

        # 4. Poll job status
        for _ in range(30):
            time.sleep(0.5)
            status_res = requests.get(f"{SERVER_URL}/jobs/{job_id}")
            assert status_res.status_code == 200
            status_data = status_res.json()
            print(f"  Job {job_id}: {status_data['status']} - {status_data['progress']}% ({status_data['message']})")
            if status_data["status"] == "completed":
                break
            elif status_data["status"] == "failed":
                raise RuntimeError(f"Job failed: {status_data.get('error')}")

        assert status_data["status"] == "completed"
        res_info = status_data["result"]
        download_url = res_info["downloadUrl"]
        print(f"Render completed. Download URL: {download_url}")

        # 5. Download rendered file
        download_res = requests.get(f"{SERVER_URL}{download_url}")
        assert download_res.status_code == 200
        assert len(download_res.content) > 10000

        print("\n ALL RENDER SERVER API TESTS PASSED SUCCESSFULLY!")

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)

if __name__ == "__main__":
    test_api()
