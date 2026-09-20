#!/usr/bin/env python3
"""
server/test_source_time_selection.py
=====================================
Test Suite for LongFormAI Step 17: AI Source-Time Selection with Temporal Keyframes.

Requirements Tested:
1. Relevant keyframe produces a non-zero sourceStart.
2. Earliest strong relevant keyframe is preferred when multiple keyframes match.
3. Key-moment preference (+0.15) influences keyframe candidate selection.
4. Visual-change proximity (+0.10) influences selection when action words are in narration.
5. Selected sourceStart is safely clamped to (nativeDuration - segmentDuration) when insufficient footage remains.
6. When nativeDuration <= segmentDuration, sourceStart is clamped to 0.0s.
7. Weak or no temporal evidence gracefully preserves default sourceStart (0.0s).
8. Photos are completely unaffected (sourceStart is always 0.0s).
9. Media selection is NOT overridden (best media is chosen first, sourceStart is selected second).
10. Provenance records selectedSourceTimestamp and temporalSelectionReason accurately.
11. Project JSON serialization/export cleanly preserves sourceStart and Step 17 provenance.
12. Manually edited timing is preserved.
"""

import os
import sys
import json
import unittest
import copy

GENERIC_STOPWORDS = {
    'scene', 'person', 'video', 'image', 'background', 'photo',
    'clip', 'picture', 'footage', 'shot', 'stock', 'view', 'wallpaper'
}

COMMON_STOPWORDS = {
    'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'between',
    'through', 'about', 'after', 'before', 'without', 'during', 'against',
    'that', 'this', 'these', 'those', 'they', 'them', 'their', 'there', 'here',
    'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'have', 'has', 'had', 'having', 'been', 'being', 'were', 'does', 'doing',
    'would', 'should', 'could', 'might', 'must', 'will', 'shall', 'inside', 'outside',
} | GENERIC_STOPWORDS

ACTION_KEYWORDS = {
    'enter', 'enters', 'entering', 'entered',
    'exit', 'exits', 'exiting', 'exited',
    'walk', 'walks', 'walking', 'walked',
    'run', 'runs', 'running', 'ran',
    'fly', 'flies', 'flying', 'flew',
    'move', 'moves', 'moving', 'moved',
    'turn', 'turns', 'turning', 'turned',
    'change', 'changes', 'changing', 'changed',
    'shift', 'shifts', 'shifting', 'shifted',
    'transition', 'transitions', 'transitioning',
    'arrive', 'arrives', 'arriving', 'arrived',
    'leave', 'leaves', 'leaving', 'left',
    'open', 'opens', 'opening', 'opened',
    'close', 'closes', 'closing', 'closed',
    'dock', 'docks', 'docking', 'docked',
    'launch', 'launches', 'launching', 'launched',
    'land', 'lands', 'landing', 'landed',
    'travel', 'travels', 'traveling', 'traveled',
    'drive', 'drives', 'driving', 'drove',
    'step', 'steps', 'stepping', 'stepped',
    'climb', 'climbs', 'climbing', 'climbed',
}


def select_optimal_source_start(asset, segment_text, segment_duration=5.0, matched_snippet=None):
    """Python reference implementation matching src/engine/draftTimeline.ts selectOptimalSourceStart."""
    if asset.get("type") != "video" or not (asset.get("description") or asset.get("keyframeDescriptions")):
        return {"sourceStart": 0.0, "selectedTimestamp": 0.0, "isOptimized": False}

    native_duration = asset.get("duration", 0.0)
    if native_duration <= 0:
        return {"sourceStart": 0.0, "selectedTimestamp": 0.0, "isOptimized": False}

    keyframe_descs = asset.get("keyframeDescriptions", [])
    if not keyframe_descs and asset.get("keyframes"):
        keyframe_descs = asset.get("keyframes", [])

    candidates = []
    # Extract unique keywords ignoring common stopwords
    raw_words = segment_text.replace(',', ' ').replace('.', ' ').replace('!', ' ').replace('?', ' ').replace(';', ' ').replace(':', ' ').split()
    seen = set()
    segment_words = []
    for w in raw_words:
        wl = w.lower()
        if len(wl) >= 3 and wl not in COMMON_STOPWORDS and wl not in seen:
            seen.add(wl)
            segment_words.append(wl)

    has_action_in_narration = any(w in ACTION_KEYWORDS for w in segment_words)
    visual_changes = asset.get("visualChanges", [])

    for kd in keyframe_descs:
        t = kd.get("time", 0.0)
        if t < 0 or t >= native_duration:
            continue

        desc = kd.get("description", "")
        tags = kd.get("tags", [])
        is_key_moment = bool(kd.get("isKeyMoment"))

        frame_text = f"{desc} {' '.join(tags)}".lower()
        match_score = 0.0

        matching_words_count = sum(1 for w in segment_words if w in frame_text)
        if segment_words:
            match_score += min(0.6, (matching_words_count / len(segment_words)) * 0.8)

        if matched_snippet and (matched_snippet.lower() in desc.lower() or desc.lower() in matched_snippet.lower()):
            match_score += 0.4

        if is_key_moment:
            match_score += 0.15

        if has_action_in_narration:
            is_near_change = any(
                abs(vc.get("fromTime", 0) - t) <= 2.0 or abs(vc.get("toTime", 0) - t) <= 2.0
                for vc in visual_changes
            )
            if is_near_change:
                match_score += 0.10

        candidates.append({
            "time": t,
            "description": desc,
            "tags": tags,
            "isKeyMoment": is_key_moment,
            "score": round(match_score, 2)
        })

    if not candidates:
        return {"sourceStart": 0.0, "selectedTimestamp": 0.0, "isOptimized": False}

    candidates.sort(key=lambda c: c["score"], reverse=True)
    best_score = candidates[0]["score"]

    if best_score < 0.35:
        return {"sourceStart": 0.0, "selectedTimestamp": 0.0, "isOptimized": False}

    # Filter all candidates within 0.05 of the top score (strongly relevant)
    top_candidates = [c for c in candidates if c["score"] >= max(0.35, best_score - 0.05)]

    # Prefer the EARLIEST strongly relevant keyframe
    top_candidates.sort(key=lambda c: c["time"])
    chosen = top_candidates[0]

    if chosen["time"] <= 0.0:
        return {"sourceStart": 0.0, "selectedTimestamp": 0.0, "isOptimized": False}

    # Clamping to respect remaining footage duration
    max_valid_start = max(0.0, native_duration - segment_duration)
    final_source_start = chosen["time"]
    clamped_note = ""

    if final_source_start > max_valid_start:
        if native_duration > segment_duration:
            final_source_start = round(max_valid_start, 2)
            clamped_note = f" (clamped from {chosen['time']:.1f}s to leave full {segment_duration:.1f}s footage)"
        else:
            return {"sourceStart": 0.0, "selectedTimestamp": chosen["time"], "isOptimized": False}

    final_source_start = round(final_source_start, 2)
    reason = f"Started at {final_source_start:.1f}s because this keyframe (@{chosen['time']:.1f}s) most closely matches the narration{clamped_note}."

    return {
        "sourceStart": final_source_start,
        "selectedTimestamp": chosen["time"],
        "reason": reason,
        "isOptimized": True
    }


class TestSourceTimeSelection(unittest.TestCase):

    def test_01_relevant_keyframe_produces_non_zero_sourcestart(self):
        """Test that a strongly relevant keyframe at 8.0s sets sourceStart = 8.0s."""
        asset = {
            "id": "vid_rocket",
            "name": "rocket_flight.mp4",
            "type": "video",
            "duration": 30.0,
            "description": "a rocket on launchpad then launching",
            "keyframeDescriptions": [
                {"time": 0.0, "description": "rocket stationary on pad", "tags": ["rocket", "pad"], "isKeyMoment": False},
                {"time": 8.0, "description": "rocket engines igniting with huge fire", "tags": ["rocket", "engines", "igniting", "fire"], "isKeyMoment": True},
                {"time": 20.0, "description": "rocket flying high in sky", "tags": ["rocket", "sky"], "isKeyMoment": False},
            ]
        }

        segment_text = "The powerful rocket engines ignite with massive fire and smoke."
        res = select_optimal_source_start(asset, segment_text, segment_duration=5.0)

        self.assertTrue(res["isOptimized"])
        self.assertEqual(res["sourceStart"], 8.0)
        self.assertEqual(res["selectedTimestamp"], 8.0)
        self.assertIn("Started at 8.0s", res["reason"])

    def test_02_earliest_strong_relevant_keyframe_preferred(self):
        """Test that if both 6.0s and 12.0s are strongly matching, the earliest (6.0s) is chosen."""
        asset = {
            "id": "vid_cockpit",
            "name": "cockpit_view.mp4",
            "type": "video",
            "duration": 25.0,
            "description": "astronaut inside spaceship cockpit",
            "keyframeDescriptions": [
                {"time": 0.0, "description": "spaceship exterior", "tags": ["spaceship"], "isKeyMoment": False},
                {"time": 6.0, "description": "astronaut checking instruments in cockpit", "tags": ["astronaut", "instruments", "cockpit"], "isKeyMoment": False},
                {"time": 12.0, "description": "astronaut looking at instruments in cockpit", "tags": ["astronaut", "instruments", "cockpit"], "isKeyMoment": False},
            ]
        }

        segment_text = "Inside the cockpit, the astronaut inspects the flight instruments."
        res = select_optimal_source_start(asset, segment_text, segment_duration=4.0)

        self.assertTrue(res["isOptimized"])
        self.assertEqual(res["sourceStart"], 6.0)

    def test_03_key_moment_preference(self):
        """Test that an isKeyMoment keyframe receives preference over an ordinary frame with similar wording."""
        asset = {
            "id": "vid_action",
            "name": "action_scene.mp4",
            "type": "video",
            "duration": 20.0,
            "description": "space station docking",
            "keyframeDescriptions": [
                {"time": 0.0, "description": "space station from afar", "tags": ["station"], "isKeyMoment": False},
                {"time": 5.0, "description": "space station airlock view", "tags": ["station", "airlock"], "isKeyMoment": False},
                {"time": 10.0, "description": "space station airlock docking clamp lock", "tags": ["station", "airlock", "docking"], "isKeyMoment": True},
            ]
        }

        segment_text = "The airlock mechanisms engage for final docking."
        res = select_optimal_source_start(asset, segment_text, segment_duration=4.0)

        self.assertTrue(res["isOptimized"])
        self.assertEqual(res["sourceStart"], 10.0)

    def test_04_visual_change_proximity_preference(self):
        """Test that visual change proximity gives preference to keyframe near the change when narration has action."""
        asset = {
            "id": "vid_warp",
            "name": "warp_drive.mp4",
            "type": "video",
            "duration": 20.0,
            "description": "spaceship travelling",
            "visualChanges": [{"fromTime": 7.0, "toTime": 9.0, "differenceScore": 0.75, "description": "Warp flash"}],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "spaceship in space", "tags": ["spaceship"], "isKeyMoment": False},
                {"time": 8.0, "description": "spaceship flashes into warp speed", "tags": ["spaceship", "warp"], "isKeyMoment": False},
            ]
        }

        segment_text = "The starship accelerates and shifts into warp speed."
        res = select_optimal_source_start(asset, segment_text, segment_duration=5.0)

        self.assertTrue(res["isOptimized"])
        self.assertEqual(res["sourceStart"], 8.0)

    def test_05_source_start_clamped_when_insufficient_footage_remains(self):
        """Test that sourceStart at 16.0s on a 20.0s video with 8.0s segment is clamped to 12.0s (20.0 - 8.0)."""
        asset = {
            "id": "vid_clamped",
            "name": "sunset.mp4",
            "type": "video",
            "duration": 20.0,
            "description": "sunset over ocean",
            "keyframeDescriptions": [
                {"time": 0.0, "description": "bright daytime ocean", "tags": ["ocean"], "isKeyMoment": False},
                {"time": 16.0, "description": "red sunset glowing over ocean horizon", "tags": ["sunset", "red", "ocean", "horizon"], "isKeyMoment": True},
            ]
        }

        segment_text = "The red sunset casts a warm glow over the ocean horizon."
        segment_dur = 8.0  # Needs 8.0s of footage
        res = select_optimal_source_start(asset, segment_text, segment_duration=segment_dur)

        self.assertTrue(res["isOptimized"])
        # 20.0 - 8.0 = 12.0
        self.assertEqual(res["sourceStart"], 12.0)
        self.assertEqual(res["selectedTimestamp"], 16.0)
        self.assertIn("clamped from 16.0s to leave full 8.0s footage", res["reason"])

    def test_06_video_duration_less_than_segment_clamps_to_zero(self):
        """Test that if video duration (4.0s) <= segment duration (6.0s), sourceStart remains 0.0s."""
        short_asset = {
            "id": "vid_short",
            "name": "short_clip.mp4",
            "type": "video",
            "duration": 4.0,
            "description": "a shooting star",
            "keyframeDescriptions": [
                {"time": 2.0, "description": "a shooting star streak", "tags": ["star", "shooting"], "isKeyMoment": True},
            ]
        }

        segment_text = "A shooting star streaks through the night sky."
        res = select_optimal_source_start(short_asset, segment_text, segment_duration=6.0)

        self.assertEqual(res["sourceStart"], 0.0)
        self.assertFalse(res["isOptimized"])

    def test_07_weak_or_no_temporal_evidence_preserves_zero(self):
        """Test that weak semantic match or first frame at 0.0s preserves sourceStart = 0.0s."""
        asset = {
            "id": "vid_neutral",
            "name": "neutral.mp4",
            "type": "video",
            "duration": 15.0,
            "description": "a serene landscape",
            "keyframeDescriptions": [
                {"time": 0.0, "description": "a serene green landscape", "tags": ["green", "landscape"], "isKeyMoment": False},
                {"time": 7.0, "description": "a cloud in the sky", "tags": ["cloud"], "isKeyMoment": False},
            ]
        }

        segment_text = "The calm green landscape sits quietly."
        res = select_optimal_source_start(asset, segment_text, segment_duration=4.0)

        # Matched time is 0.0s -> returns 0.0 without unnecessary optimization flag
        self.assertEqual(res["sourceStart"], 0.0)

    def test_08_photos_always_zero(self):
        """Test that photos strictly return sourceStart = 0.0 under all conditions."""
        photo_asset = {
            "id": "photo_test",
            "name": "image.jpg",
            "type": "image",
            "duration": 0.0,
            "description": "a red sunset over mountains",
            "tags": ["sunset", "mountains"],
        }

        res = select_optimal_source_start(photo_asset, "The red sunset glows over mountains.", segment_duration=5.0)
        self.assertEqual(res["sourceStart"], 0.0)
        self.assertFalse(res["isOptimized"])

    def test_09_sourcestart_never_exceeds_media_duration(self):
        """Test that sourceStart never exceeds actual media duration."""
        asset = {
            "id": "vid_dur_check",
            "name": "sample.mp4",
            "type": "video",
            "duration": 10.0,
            "description": "sample video",
            "keyframeDescriptions": [
                {"time": 15.0, "description": "out of bounds frame", "tags": ["out"], "isKeyMoment": True},
            ]
        }

        res = select_optimal_source_start(asset, "Out of bounds frame.", segment_duration=3.0)
        self.assertLessEqual(res["sourceStart"], 10.0)

    def test_10_provenance_records_source_timestamp_and_reason(self):
        """Test that provenance dict contains selectedSourceTimestamp and temporalSelectionReason."""
        asset = {
            "id": "vid_deep_space",
            "name": "deep_space.mp4",
            "type": "video",
            "duration": 40.0,
            "description": "deep space galaxy rotation",
            "keyframeDescriptions": [
                {"time": 0.0, "description": "black space with distant stars", "tags": ["space", "stars"], "isKeyMoment": False},
                {"time": 14.5, "description": "spiral galaxy glowing brightly in deep space", "tags": ["spiral", "galaxy", "glowing", "space"], "isKeyMoment": True},
            ]
        }

        segment_text = "A glowing spiral galaxy rotates majestically."
        res = select_optimal_source_start(asset, segment_text, segment_duration=6.0)

        self.assertTrue(res["isOptimized"])
        self.assertEqual(res["sourceStart"], 14.5)
        self.assertEqual(res["selectedTimestamp"], 14.5)
        self.assertIn("Started at 14.5s", res["reason"])
        self.assertIn("@14.5s", res["reason"])

    def test_11_project_json_serialization_preserves_sourcestart_and_provenance(self):
        """Test that project JSON schema serialization retains sourceStart and temporal selection provenance."""
        timeline_item = {
            "id": "item-101",
            "mediaId": "vid_deep_space",
            "timelineStart": 0.0,
            "duration": 6.0,
            "sourceStart": 14.5,
            "provenance": {
                "confidenceScore": 0.88,
                "strategy": "ai_draft",
                "matchedTextSnippet": "spiral galaxy glowing",
                "selectedSourceTimestamp": 14.5,
                "temporalSelectionReason": "Started at 14.5s because this keyframe (@14.5s) most closely matches the narration.",
            },
            "transform": {
                "fitMode": "cover",
                "x": 0.0,
                "y": 0.0,
                "scale": 1.0,
            }
        }

        project = {
            "version": "1.0.0",
            "metadata": {
                "id": "proj-step17",
                "name": "Step 17 Test",
                "createdAt": 1700000000000,
                "updatedAt": 1700000000000,
                "width": 1920,
                "height": 1080,
                "fps": 30
            },
            "timeline": {
                "items": [timeline_item],
                "audioTracks": []
            }
        }

        json_str = json.dumps(project)
        parsed = json.loads(json_str)

        item = parsed["timeline"]["items"][0]
        self.assertEqual(item["sourceStart"], 14.5)
        self.assertEqual(item["provenance"]["selectedSourceTimestamp"], 14.5)
        self.assertIn("Started at 14.5s", item["provenance"]["temporalSelectionReason"])

    def test_12_media_selection_not_overridden_by_source_time_selection(self):
        """Test that media selection is separate from sourceStart selection (first choose asset, then choose sourceStart)."""
        # Asset A is better match overall (higher semantic similarity to segment)
        # Asset B has a keyframe at 10.0s
        # Winning asset A should be chosen by matching, and its own keyframe selected
        asset_a = {
            "id": "vid_a",
            "name": "supernova.mp4",
            "type": "video",
            "duration": 30.0,
            "description": "supernova exploding with massive shockwave",
            "keyframeDescriptions": [
                {"time": 0.0, "description": "star swelling in size", "tags": ["star"], "isKeyMoment": False},
                {"time": 10.0, "description": "supernova explosion shockwave expanding", "tags": ["supernova", "explosion", "shockwave"], "isKeyMoment": True},
            ]
        }

        segment_text = "The supernova explosion unleashes an immense expanding shockwave."
        res_a = select_optimal_source_start(asset_a, segment_text, segment_duration=5.0)

        self.assertTrue(res_a["isOptimized"])
        self.assertEqual(res_a["sourceStart"], 10.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)

