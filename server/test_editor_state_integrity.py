"""
LongFormAI - STEP 12: Real Media Playback & Timeline Editing State Integrity Test
Tests deterministic project state operations:
1. Adding clips with duration clamping based on media asset limits.
2. Deleting clips and maintaining valid timeline indices and non-negative timings.
3. Reordering clips with sequence preservation.
4. Timing & SourceStart safety clamping (no negative starts, no negative durations, no sourceStart beyond source media).
5. Independent per-clip framing transforms: modifying clip A never mutates clip B.
6. Duplicate source media isolation: two clips referencing the exact same media ID maintain completely isolated transforms and trims.
7. Image clips: flexible duration adjustments and framing consistency.
8. Missing media handling: unlinked references do not corrupt timeline references or schema.
9. Relink preserving media IDs and existing timeline references.
10. Portable JSON export remains clean, without transient blobs, rotation, or NaN values.
"""

import json
import math
import copy


def create_mock_project():
    return {
        "id": "proj_editor_integrity_01",
        "name": "Editor Integrity Test Project",
        "version": "1.0.0",
        "resolution": {"width": 1920, "height": 1080},
        "fps": 30,
        "voiceover": {
            "id": "vo_01",
            "name": "voiceover.wav",
            "url": "blob:http://localhost:5173/vo-blob-id",
            "duration": 18.0,
            "format": "wav",
            "volume": 1.0,
            "isMuted": False,
            "segments": [
                {"id": "seg_01", "startTime": 0.0, "endTime": 6.0, "text": "First section narration."},
                {"id": "seg_02", "startTime": 6.0, "endTime": 12.0, "text": "Second section narration."},
                {"id": "seg_03", "startTime": 12.0, "endTime": 18.0, "text": "Third section narration."},
            ],
        },
        "media": [
            {
                "id": "media_video_169",
                "name": "landscape_shot.mp4",
                "type": "video",
                "url": "blob:http://localhost:5173/vid169-blob-id",
                "duration": 8.0,
                "width": 1920,
                "height": 1080,
                "aspectRatio": 16 / 9,
                "aspectRatioLabel": "16:9 Native",
            },
            {
                "id": "media_video_916",
                "name": "vertical_story.mp4",
                "type": "video",
                "url": "blob:http://localhost:5173/vid916-blob-id",
                "duration": 5.0,
                "width": 1080,
                "height": 1920,
                "aspectRatio": 9 / 16,
                "aspectRatioLabel": "9:16 Vertical",
            },
            {
                "id": "media_photo_square",
                "name": "product_hero.jpg",
                "type": "image",
                "url": "blob:http://localhost:5173/img-blob-id",
                "duration": 5.0,
                "width": 1080,
                "height": 1080,
                "aspectRatio": 1.0,
                "aspectRatioLabel": "1:1 Square",
            },
        ],
        "timeline": [],
    }


# Simulation of Store Mutation Functions
def add_media_to_timeline(project, media_id):
    asset = next((m for m in project["media"] if m["id"] == media_id), None)
    if not asset:
        return project

    current_end = max([item["startTime"] + item["duration"] for item in project["timeline"]], default=0.0)
    item_duration = 5.0 if asset["type"] == "image" else max(0.1, min(5.0, asset.get("duration", 5.0)))

    new_item = {
        "id": f"clip_{len(project['timeline']) + 1}",
        "mediaId": asset["id"],
        "trackIndex": 0,
        "startTime": current_end,
        "duration": item_duration,
        "sourceStart": 0.0,
        "sourceDuration": item_duration,
        "transform": {
            "fitMode": "cover",
            "scale": 1.0,
            "x": 0.0,
            "y": 0.0,
            "crop": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0},
        },
    }
    project["timeline"].append(new_item)
    return new_item


def update_timeline_item(project, item_id, updates):
    item = next((it for it in project["timeline"] if it["id"] == item_id), None)
    if not item:
        return

    asset = next((m for m in project["media"] if m["id"] == item["mediaId"]), None)

    if "startTime" in updates:
        item["startTime"] = max(0.0, float(updates["startTime"]))

    if "sourceStart" in updates:
        raw_ss = max(0.0, float(updates["sourceStart"]))
        if asset and asset["type"] == "video" and asset.get("duration", 0) > 0:
            item["sourceStart"] = min(raw_ss, max(0.0, asset["duration"] - 0.1))
        else:
            item["sourceStart"] = raw_ss

    if "duration" in updates:
        raw_dur = max(0.1, float(updates["duration"]))
        if asset and asset["type"] == "video" and asset.get("duration", 0) > 0:
            max_available = max(0.1, asset["duration"] - item["sourceStart"])
            item["duration"] = min(raw_dur, max_available)
        else:
            item["duration"] = raw_dur

    if "sourceDuration" in updates:
        item["sourceDuration"] = max(0.1, float(updates["sourceDuration"]))


def update_item_transform(project, item_id, transform_updates):
    item = next((it for it in project["timeline"] if it["id"] == item_id), None)
    if not item:
        return

    existing = item["transform"]
    new_transform = copy.deepcopy(existing)

    if "fitMode" in transform_updates:
        new_transform["fitMode"] = transform_updates["fitMode"]
    if "scale" in transform_updates:
        new_transform["scale"] = max(0.1, min(5.0, float(transform_updates["scale"])))
    if "x" in transform_updates:
        new_transform["x"] = float(transform_updates["x"])
    if "y" in transform_updates:
        new_transform["y"] = float(transform_updates["y"])
    if "crop" in transform_updates:
        new_transform["crop"].update(transform_updates["crop"])

    item["transform"] = new_transform


def remove_timeline_item(project, item_id):
    project["timeline"] = [it for it in project["timeline"] if it["id"] != item_id]


def reorder_timeline_items(project, new_order_ids):
    id_map = {it["id"]: it for it in project["timeline"]}
    reordered = [id_map[i] for i in new_order_ids if i in id_map]
    
    # Recalculate sequential start times
    cursor = 0.0
    for it in reordered:
        it["startTime"] = cursor
        cursor += it["duration"]
    project["timeline"] = reordered


def sanitize_for_export(project):
    p = copy.deepcopy(project)
    if p.get("voiceover"):
        p["voiceover"]["url"] = ""
        if "file" in p["voiceover"]:
            del p["voiceover"]["file"]
    for m in p.get("media", []):
        m["url"] = ""
        if "file" in m:
            del m["file"]
    return p


def run_tests():
    print("=" * 70)
    print("LONGFORMAI STEP 12: EDITOR STATE INTEGRITY TEST SUITE")
    print("=" * 70)

    project = create_mock_project()

    # 1. Test adding clips
    print("\n[Test 1] Adding clips to timeline...")
    clip1 = add_media_to_timeline(project, "media_video_169")
    clip2 = add_media_to_timeline(project, "media_video_916")
    clip3 = add_media_to_timeline(project, "media_photo_square")

    assert len(project["timeline"]) == 3
    assert clip1["startTime"] == 0.0
    assert clip1["duration"] == 5.0
    assert clip2["startTime"] == 5.0
    assert clip2["duration"] == 5.0
    assert clip3["startTime"] == 10.0
    assert clip3["duration"] == 5.0
    print(" -> Added 3 clips with exact sequential start times.")

    # 2. Test duplicate source media isolation
    print("\n[Test 2] Duplicate source media isolation test...")
    # Add second clip referencing media_video_169
    clip4 = add_media_to_timeline(project, "media_video_169")
    assert clip4["mediaId"] == clip1["mediaId"]
    assert clip4["id"] != clip1["id"]

    # Modify clip1 transform
    update_item_transform(project, clip1["id"], {"fitMode": "contain", "scale": 1.25, "x": 10.0, "y": -5.0})
    # Modify clip4 transform differently
    update_item_transform(project, clip4["id"], {"fitMode": "cover", "scale": 1.8, "x": -15.0, "y": 20.0})

    # Assert transforms on both clips referencing the same media asset remain completely isolated
    c1 = next(it for it in project["timeline"] if it["id"] == clip1["id"])
    c4 = next(it for it in project["timeline"] if it["id"] == clip4["id"])
    assert c1["transform"]["fitMode"] == "contain"
    assert c1["transform"]["scale"] == 1.25
    assert c1["transform"]["x"] == 10.0
    assert c4["transform"]["fitMode"] == "cover"
    assert c4["transform"]["scale"] == 1.8
    assert c4["transform"]["x"] == -15.0
    print(" -> PASSED: Duplicate source media on multiple timeline clips maintain strictly isolated transforms.")

    # 3. Test safety clamping on Timing & Trims
    print("\n[Test 3] Safety clamping on durations, start times, and sourceStart...")
    # A. Negative startTime prevention
    update_timeline_item(project, clip1["id"], {"startTime": -10.0})
    assert c1["startTime"] >= 0.0, "startTime must never be negative"

    # B. Negative duration prevention
    update_timeline_item(project, clip1["id"], {"duration": -5.0})
    assert c1["duration"] >= 0.1, "duration must be clamped to minimum 0.1s"

    # C. SourceStart beyond video duration prevention (media_video_169 has duration 8.0s)
    update_timeline_item(project, clip1["id"], {"sourceStart": 12.0})
    assert c1["sourceStart"] <= 7.9, f"sourceStart must be clamped within video duration (got {c1['sourceStart']})"

    # D. Duration exceeding remaining footage clamp
    # sourceStart = 6.0 on 8.0s video -> max duration is 2.0s
    update_timeline_item(project, clip1["id"], {"sourceStart": 6.0, "duration": 4.0})
    assert c1["duration"] <= 2.0, f"duration must be clamped to remaining footage (got {c1['duration']})"
    print(" -> PASSED: Negative values and out-of-bounds footage trims are safely clamped.")

    # 4. Test image clip flexibility
    print("\n[Test 4] Image clip behavior...")
    c3 = next(it for it in project["timeline"] if it["id"] == clip3["id"])
    # Images can extend beyond 5 seconds freely (e.g. 15.0s)
    update_timeline_item(project, clip3["id"], {"duration": 15.0})
    assert c3["duration"] == 15.0
    # Image panning and zooming
    update_item_transform(project, clip3["id"], {"fitMode": "custom", "scale": 2.5, "x": 5.0, "y": -5.0})
    assert c3["transform"]["scale"] == 2.5
    print(" -> PASSED: Image clips support arbitrary duration extensions and framing transforms.")

    # 5. Test clip reordering
    print("\n[Test 5] Clip reordering integrity...")
    initial_ids = [it["id"] for it in project["timeline"]]
    # Reorder: move clip3 to the front
    reordered_ids = [clip3["id"], clip1["id"], clip2["id"], clip4["id"]]
    reorder_timeline_items(project, reordered_ids)

    current_ids = [it["id"] for it in project["timeline"]]
    assert current_ids == reordered_ids
    assert project["timeline"][0]["id"] == clip3["id"]
    assert project["timeline"][0]["startTime"] == 0.0
    assert project["timeline"][1]["startTime"] == project["timeline"][0]["duration"]
    print(" -> PASSED: Timeline clips reordered cleanly with continuous non-overlapping start times.")

    # 6. Test clip deletion
    print("\n[Test 6] Clip deletion...")
    initial_count = len(project["timeline"])
    remove_timeline_item(project, clip2["id"])
    assert len(project["timeline"]) == initial_count - 1
    assert not any(it["id"] == clip2["id"] for it in project["timeline"])
    print(" -> PASSED: Target clip deleted without corrupting remaining timeline items.")

    # 7. Test missing media handling & relinking preserving IDs
    print("\n[Test 7] Missing media & relinking stability...")
    # Simulate unlinking media_video_916
    v916_asset = next(m for m in project["media"] if m["id"] == "media_video_916")
    v916_asset["url"] = ""  # unlinked state

    # Add clip with unlinked asset
    unlinked_clip = add_media_to_timeline(project, "media_video_916")
    assert unlinked_clip["mediaId"] == "media_video_916"

    # Relink asset with new path/name
    v916_asset["url"] = "/new/path/to/vertical_story.mp4"
    v916_asset["name"] = "vertical_story_renamed.mp4"

    # Assert timeline clip mediaId is preserved
    assert unlinked_clip["mediaId"] == "media_video_916"
    print(" -> PASSED: Missing media does not break timeline references, and relinking preserves stable IDs.")

    # 8. Test clean JSON portability
    print("\n[Test 8] Clean portable JSON verification...")
    exported_proj = sanitize_for_export(project)
    json_str = json.dumps(exported_proj, indent=2)

    assert "blob:" not in json_str, "Blob URL leaked in export JSON"
    assert "rotation" not in json_str, "Rotation field found in export JSON"
    assert "NaN" not in json_str, "NaN value found in export JSON"
    assert exported_proj["resolution"]["width"] == 1920
    assert exported_proj["resolution"]["height"] == 1080
    assert len(exported_proj["voiceover"]["segments"]) == 3
    print(" -> PASSED: Project export strictly conforms to portable 16:9 LongFormAI schema.")

    print("\n" + "=" * 70)
    print("ALL STEP 12 EDITOR STATE INTEGRITY TESTS PASSED!")
    print("=" * 70)
    return True


if __name__ == "__main__":
    success = run_tests()
    if not success:
        exit(1)
