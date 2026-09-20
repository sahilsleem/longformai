"""
LongFormAI - Multi-Worker Diagnostic Verification Suite
Checks all 4 local workers: Whisper (8765), BLIP Vision (8766), Semantic Matching (8767), FFmpeg Render (8768).
"""
import requests

def check_worker(name, port, expected_keys):
    url = f"http://127.0.0.1:{port}/health"
    try:
        res = requests.get(url, timeout=3)
        if res.status_code == 200:
            data = res.json()
            print(f"[OK] {name} (Port {port}): ONLINE")
            print(f"     Details: {data}")
            return True
        else:
            print(f"[FAIL] {name} (Port {port}): HTTP {res.status_code}")
            return False
    except Exception as e:
        print(f"[OFFLINE] {name} (Port {port}): {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print(" LongFormAI Local Worker Diagnostic")
    print("=" * 60)
    w1 = check_worker("Whisper Transcription Worker", 8765, ["engine", "default_model"])
    w2 = check_worker("BLIP Semantic Vision Worker", 8766, ["engine", "model_cached", "model_loaded"])
    w3 = check_worker("Semantic Matching Worker", 8767, ["engine", "model_cached", "model_loaded"])
    w4 = check_worker("FFmpeg Master Render Worker", 8768, ["engine", "ffmpegAvailable"])
    print("=" * 60)
    if w1 and w2 and w3 and w4:
        print("ALL 4 LOCAL WORKERS ARE RUNNING AND HEALTHY!")
    else:
        print("Some workers need attention.")
