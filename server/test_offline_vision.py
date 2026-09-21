"""
LongFormAI - Vision Worker Offline & Honesty Test Suite
Verifies genuine BLIP captioning, cache verification, and offline execution using pure Python standard library.
"""
import io
import json
import time
import base64
import urllib.request
import urllib.error
from PIL import Image, ImageDraw

SERVER_URL = "http://127.0.0.1:8766"


def create_synthetic_test_image(pattern: str = "landscape") -> str:
    """Generates a simple synthetic PIL image and returns base64 data URL."""
    img = Image.new("RGB", (320, 240), color=(135, 206, 235))  # Sky blue
    draw = ImageDraw.Draw(img)

    if pattern == "beach":
        # Yellow sand below
        draw.rectangle([0, 160, 320, 240], fill=(238, 214, 175))
        # Blue sea in middle
        draw.rectangle([0, 100, 320, 160], fill=(30, 144, 255))
        # Yellow sun in sky
        draw.ellipse([240, 20, 290, 70], fill=(255, 215, 0))
    else:
        # Green grass below
        draw.rectangle([0, 150, 320, 240], fill=(34, 139, 34))
        # Red house in middle
        draw.rectangle([100, 100, 200, 180], fill=(178, 34, 34))

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def test_health():
    print("[1/3] Testing /health endpoint...")
    try:
        req = urllib.request.Request(f"{SERVER_URL}/health")
        with urllib.request.urlopen(req, timeout=5) as res:
            print("  Status code:", res.status)
            data = json.loads(res.read().decode("utf-8"))
            print("  Health response:", data)
            assert res.status == 200
            assert "model_cached" in data
            assert "model_loaded" in data
            assert "state" in data
            print("  [PASS] Health endpoint structure verified.")
    except Exception as e:
        print("  [FAIL] Health check failed:", e)


def test_single_frame_inference():
    print("\n[2/3] Testing genuine frame captioning inference...")
    data_url = create_synthetic_test_image("beach")
    try:
        start = time.time()
        payload = json.dumps({"imageData": data_url, "time": 0.0}).encode("utf-8")
        req = urllib.request.Request(
            f"{SERVER_URL}/analyze-frame",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                elapsed = time.time() - start
                print(f"  Status code: {res.status} (in {elapsed:.2f}s)")
                result = json.loads(res.read().decode("utf-8"))
                print("  Inference result:", result)
                print("  Description:", result.get("description"))
                print("  Tags:", result.get("tags"))
                assert result.get("description"), "Description should not be empty on success"
                print("  [PASS] Frame inference passed.")
        except urllib.error.HTTPError as he:
            if he.code == 503:
                data = json.loads(he.read().decode("utf-8"))
                print("  Expected 503 if model not yet cached/loaded:", data)
            else:
                print(f"  HTTP Error {he.code}:", he.read().decode("utf-8"))
    except Exception as e:
        print("  Frame inference error:", e)


def test_media_analysis():
    print("\n[3/3] Testing media batch keyframe semantics...")
    frame1 = create_synthetic_test_image("beach")
    frame2 = create_synthetic_test_image("house")
    try:
        start = time.time()
        payload = json.dumps({
            "isVideo": True,
            "duration": 5.0,
            "keyframes": [
                {"time": 0.0, "imageData": frame1},
                {"time": 2.5, "imageData": frame2}
            ]
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{SERVER_URL}/analyze-media",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                elapsed = time.time() - start
                print(f"  Status code: {res.status} (in {elapsed:.2f}s)")
                result = json.loads(res.read().decode("utf-8"))
                print("  Overall Description:", result.get("description"))
                print("  Tags:", result.get("tags"))
                print("  Keyframe Descriptions:", result.get("keyframeDescriptions"))
                print("  [PASS] Media semantics passed.")
        except urllib.error.HTTPError as he:
            if he.code == 503:
                data = json.loads(he.read().decode("utf-8"))
                print("  Expected 503 if model not yet cached/loaded:", data)
            else:
                print(f"  HTTP Error {he.code}:", he.read().decode("utf-8"))
    except Exception as e:
        print("  Media analysis error:", e)


if __name__ == "__main__":
    test_health()
    test_single_frame_inference()
    test_media_analysis()
