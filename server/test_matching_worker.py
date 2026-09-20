"""
LongFormAI - Semantic Matching Worker Test Suite
Tests /health, /match, cosine similarity ranking, grounded explanations, and exclusions.
"""
import requests
import json

SERVER_URL = "http://127.0.0.1:8767"

def test_matching_health():
    print("[1/3] Testing matching worker /health endpoint...")
    res = requests.get(f"{SERVER_URL}/health", timeout=5)
    print("  Status code:", res.status_code)
    data = res.json()
    print("  Response:", data)
    assert res.status_code == 200
    assert data["model_cached"] is True
    assert data["model_loaded"] is True
    assert data["state"] == "ready"
    print("  [PASS] Health check verified.")

def test_semantic_matching():
    print("\n[2/3] Testing semantic matching with sample media...")
    
    transcript_segment = "She walks along the beach during sunset."
    
    media_items = [
        {
            "mediaId": "media-beach",
            "mediaName": "beach_walk.mp4",
            "description": "A person walking on a sandy beach under an orange sky",
            "tags": ["beach", "sand", "person", "walking", "sunset", "ocean"],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "A person walking on a sandy beach", "tags": ["beach", "walking"]},
                {"time": 3.0, "description": "Orange sunset over the ocean", "tags": ["sunset", "ocean"]}
            ]
        },
        {
            "mediaId": "media-kitchen",
            "mediaName": "cooking_pasta.mp4",
            "description": "A chef chopping vegetables and cooking pasta in a kitchen",
            "tags": ["kitchen", "cooking", "chef", "food", "vegetables"],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "Chopping onions on a board", "tags": ["kitchen", "onions"]}
            ]
        },
        {
            "mediaId": "media-city",
            "mediaName": "city_traffic.jpg",
            "description": "Busy city street with cars and skyscrapers at daytime",
            "tags": ["city", "street", "cars", "traffic", "buildings"],
            "keyframeDescriptions": []
        },
        {
            "mediaId": "media-unanalyzed",
            "mediaName": "raw_footage.mp4",
            "description": "",
            "tags": [],
            "keyframeDescriptions": []
        }
    ]

    res = requests.post(f"{SERVER_URL}/match", json={
        "segmentText": transcript_segment,
        "mediaItems": media_items,
        "topK": 3
    }, timeout=10)

    print("  Status code:", res.status_code)
    assert res.status_code == 200
    result = res.json()
    print(f"  Transcript: \"{transcript_segment}\"")
    print(f"  Unavailable unanalyzed items: {result['unavailableCount']}")
    assert result["unavailableCount"] == 1, "Unanalyzed media should be counted as unavailable"
    
    candidates = result["candidates"]
    print(f"  Returned candidates count: {len(candidates)}")
    for idx, c in enumerate(candidates):
        print(f"    #{idx+1} {c['mediaName']} -> Score: {c['score']} | Explanation: {c['explanation']}")

    # Verification: Top candidate should be the beach media with highest score
    top = candidates[0]
    assert top["mediaId"] == "media-beach", f"Expected beach media to rank first, got {top['mediaId']}"
    assert top["score"] >= 0.55, f"Expected high match score (>=0.55) for beach, got {top['score']}"
    assert "beach" in top["explanation"].lower() or "walking" in top["explanation"].lower(), "Explanation must ground in beach concepts"
    print("  [PASS] Semantic ranking and grounded explanation verified!")

def test_offline_edge_cases():
    print("\n[3/3] Testing edge cases (empty segment, all unanalyzed)...")
    # Empty segment
    res_empty = requests.post(f"{SERVER_URL}/match", json={
        "segmentText": "   ",
        "mediaItems": []
    }, timeout=5)
    assert res_empty.status_code == 400
    print("  [PASS] Empty text rejected with HTTP 400.")

    # All unanalyzed
    res_none = requests.post(f"{SERVER_URL}/match", json={
        "segmentText": "A fast car driving on highway",
        "mediaItems": [
            {"mediaId": "1", "mediaName": "un1.mp4", "description": "", "tags": []}
        ]
    }, timeout=5)
    assert res_none.status_code == 200
    assert res_none.json()["status"] == "no_analyzed_media"
    assert len(res_none.json()["candidates"]) == 0
    print("  [PASS] Unanalyzed media cleanly reported with status='no_analyzed_media'.")

if __name__ == "__main__":
    test_matching_health()
    test_semantic_matching()
    test_offline_edge_cases()
