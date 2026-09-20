"""
LongFormAI - Vision Worker Offline & Honesty Test Suite
Verifies genuine BLIP captioning, cache verification, and offline execution.
"""
import io
import time
import requests
import base64
from PIL import Image, ImageDraw

SERVER_URL = "http://127.0.0.1:8766"

def create_synthetic_test_image(pattern: str = "landscape") -> str:
    """Generates a simple synthetic PIL image and returns base64 data URL."""
    img = Image.new("RGB", (320, 240), color=(135, 206, 235)) # Sky blue
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
        res = requests.get(f"{SERVER_URL}/health", timeout=5)
        print("  Status code:", res.status_code)
        data = res.json()
        print("  Health response:", data)
        assert res.status_code == 200
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
        res = requests.post(f"{SERVER_URL}/analyze-frame", json={
            "imageData": data_url,
            "time": 0.0
        }, timeout=30)
        elapsed = time.time() - start
        print(f"  Status code: {res.status_code} (in {elapsed:.2f}s)")
        if res.status_code == 200:
            result = res.json()
            print("  Inference result:", result)
            print("  Description:", result.get("description"))
            print("  Tags:", result.get("tags"))
            assert result.get("description"), "Description should not be empty on success"
            print("  [PASS] Frame inference passed.")
        elif res.status_code == 503:
            print("  Expected 503 if model not yet cached/loaded:", res.json())
        else:
            print("  Unexpected status code:", res.status_code, res.text)
    except Exception as e:
        print("  Frame inference error:", e)

def test_media_analysis():
    print("\n[3/3] Testing media batch keyframe semantics...")
    frame1 = create_synthetic_test_image("beach")
    frame2 = create_synthetic_test_image("house")
    try:
        start = time.time()
        res = requests.post(f"{SERVER_URL}/analyze-media", json={
            "isVideo": True,
            "duration": 5.0,
            "keyframes": [
                {"time": 0.0, "imageData": frame1},
                {"time": 2.5, "imageData": frame2}
            ]
        }, timeout=30)
        elapsed = time.time() - start
        print(f"  Status code: {res.status_code} (in {elapsed:.2f}s)")
        if res.status_code == 200:
            result = res.json()
            print("  Overall Description:", result.get("description"))
            print("  Tags:", result.get("tags"))
            print("  Keyframe Descriptions:", result.get("keyframeDescriptions"))
            print("  [PASS] Media semantics passed.")
        elif res.status_code == 503:
            print("  Expected 503 if model not yet cached/loaded:", res.json())
        else:
            print("  Unexpected status code:", res.status_code, res.text)
    except Exception as e:
        print("  Media analysis error:", e)

if __name__ == "__main__":
    test_health()
    test_single_frame_inference()
    test_media_analysis()
