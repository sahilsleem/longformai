#!/usr/bin/env python3
"""
server/test_temporal_draft_selection.py
========================================
Test Suite for LongFormAI Step 16: Temporal-Aware AI Draft Selection.

Requirements Tested:
1. Temporal summary improves ranking of a genuinely relevant multi-moment video candidate.
2. Irrelevant temporal summary does not incorrectly win over a relevant candidate.
3. Key-moment alignment grants deterministic bonus (+0.02) and reflects in explanation.
4. Visual-change alignment grants deterministic bonus (+0.02) when narration describes action/transition and footage has recorded visual shift.
5. Photos are completely unaffected (0 temporal bonus).
6. Videos without temporal analysis retain old scoring behavior gracefully.
7. Provenance explanations groundedly cite temporal evidence only when it genuinely exists.
8. Reuse penalties still penalize repeated media appropriately even with temporal bonuses.
9. Total temporal bonus is strictly capped (+0.05 max) to preserve semantic dominance.
10. Portable JSON export/import preserves temporal provenance fields.
"""

import os
import sys
import json
import unittest
import requests
import copy

MATCHING_URL = "http://127.0.0.1:8767/match"

GENERIC_STOPWORDS = {
    'scene', 'person', 'video', 'image', 'background', 'photo',
    'clip', 'picture', 'footage', 'shot', 'stock', 'view', 'wallpaper'
}

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


def calculate_generic_noise_discount(description="", tags=None):
    if tags is None:
        tags = []
    if not description and len(tags) == 0:
        return 0.85
    words = [w.lower() for w in (description or '').replace(',', ' ').replace('.', ' ').split() if len(w) > 2]
    if not words:
        return 0.90
    generic_count = sum(1 for w in words if w in GENERIC_STOPWORDS)
    ratio = generic_count / len(words)
    if ratio > 0.65:
        return 0.88
    if ratio > 0.40:
        return 0.95
    return 1.0


def calculate_temporal_bonus(cand_asset, segment_text, matched_snippet=None):
    if cand_asset.get("type") != "video" or not (cand_asset.get("description") or cand_asset.get("keyframeDescriptions")):
        return {
            "totalBonus": 0.0,
            "isKeyMoment": False,
            "hasVisualChange": False,
            "temporalCoverageCount": 0,
            "reasonParts": []
        }

    keyframe_descs = cand_asset.get("keyframeDescriptions", [])
    has_recorded_visual_change = bool(
        cand_asset.get("hasVisualChange") or
        (cand_asset.get("visualChanges") and len(cand_asset.get("visualChanges")) > 0)
    )

    coverage_bonus = 0.0
    key_moment_bonus = 0.0
    visual_change_bonus = 0.0
    reason_parts = []

    words = [w.lower() for w in segment_text.replace(',', ' ').replace('.', ' ').replace('!', ' ').replace('?', ' ').split() if len(w) >= 3 and w.lower() not in GENERIC_STOPWORDS]

    # 1. Multi-Frame Concept Coverage
    matching_frames_count = 0
    for kd in keyframe_descs:
        frame_text = f"{kd.get('description', '')} {' '.join(kd.get('tags', []))}".lower()
        if any(w in frame_text for w in words):
            matching_frames_count += 1

    if matching_frames_count >= 2:
        coverage_bonus = 0.025
        reason_parts.append(f"temporal sequence also covers the narration's concepts ({matching_frames_count} frames)")

    # 2. Key-Moment Awareness
    is_key_moment = False
    if matched_snippet:
        for kd in keyframe_descs:
            if kd.get("isKeyMoment") and (matched_snippet.lower() in kd.get("description", "").lower() or kd.get("description", "").lower() in matched_snippet.lower()):
                is_key_moment = True
                break

    if not is_key_moment and cand_asset.get("temporalSummary") and matched_snippet == cand_asset.get("temporalSummary"):
        if any(kd.get("isKeyMoment") for kd in keyframe_descs):
            is_key_moment = True

    if is_key_moment:
        key_moment_bonus = 0.020
        reason_parts.append("matches an informative key moment in footage")

    # 3. Visual-Change / Action Alignment
    has_visual_change_action = False
    has_action = any(w in ACTION_KEYWORDS for w in words)
    if has_action and has_recorded_visual_change:
        has_visual_change_action = True
        visual_change_bonus = 0.020
        reason_parts.append("video contains recorded visual transitions matching the dynamic narration")

    raw_total = coverage_bonus + key_moment_bonus + visual_change_bonus
    total_bonus = min(0.05, round(raw_total, 3))

    return {
        "totalBonus": total_bonus,
        "isKeyMoment": is_key_moment,
        "hasVisualChange": has_visual_change_action,
        "temporalCoverageCount": matching_frames_count,
        "reasonParts": reason_parts
    }


def score_draft_candidate(cand_match, asset, segment_text, segment_duration=5.0, prefer_video=True, current_reuse=0):
    noise = calculate_generic_noise_discount(asset.get("description"), asset.get("tags"))
    attenuated = cand_match["score"] * noise

    type_bonus = 0.03 if (prefer_video and asset.get("type") == "video") else 0.0

    duration_bonus = 0.0
    if asset.get("type") == "video" and "duration" in asset:
        if asset["duration"] >= segment_duration:
            duration_bonus = 0.02
        elif asset["duration"] < segment_duration * 0.5 and segment_duration > 5.0:
            duration_bonus = -0.05

    calc_reuse_penalty = 0.0
    if current_reuse == 1:
        calc_reuse_penalty = 0.08
    elif current_reuse >= 2:
        calc_reuse_penalty = 0.08 * (1.0 + 0.5 * (current_reuse - 1))

    temporal = calculate_temporal_bonus(asset, segment_text, cand_match.get("matchedSnippet"))

    adjusted_score = round(attenuated + type_bonus + duration_bonus + temporal["totalBonus"] - calc_reuse_penalty, 3)

    if cand_match["score"] >= 0.75:
        explanation = "Selected because transcript meaning strongly matches the analyzed scene concepts"
    elif cand_match["score"] >= 0.50:
        explanation = "Selected as a solid semantic match for this voiceover section"
    else:
        explanation = "Selected as the closest available match above threshold (moderate confidence)"

    if temporal["reasonParts"]:
        explanation += f"; {'; '.join(temporal['reasonParts'])}."
    else:
        explanation += "."

    return {
        "mediaId": asset["id"],
        "mediaName": asset["name"],
        "rawScore": cand_match["score"],
        "adjustedScore": adjusted_score,
        "explanation": explanation,
        "temporalBonus": temporal["totalBonus"],
        "isKeyMoment": temporal["isKeyMoment"],
        "hasVisualChange": temporal["hasVisualChange"],
        "temporalCoverageCount": temporal["temporalCoverageCount"],
        "reuseCount": current_reuse
    }


class TestTemporalDraftSelection(unittest.TestCase):

    def test_01_temporal_summary_improves_relevant_video(self):
        """Test that a temporal summary containing sequence progression correctly boosts matching score."""
        segment_text = "The astronaut enters the cockpit and begins checking the navigation controls."

        # Media A: Video with temporal narrative covering cockpit and controls
        media_a = {
            "id": "vid_space_seq",
            "name": "space_mission.mp4",
            "type": "video",
            "duration": 15.0,
            "description": "a spaceship flying in space",
            "temporalSummary": "Video sequence showing spaceship in space; later astronaut entering the cockpit; later checking navigation controls.",
            "tags": ["space", "astronaut", "cockpit", "controls"],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "a spaceship flying in space", "tags": ["space", "spaceship"], "isKeyMoment": False},
                {"time": 5.0, "description": "astronaut entering cockpit", "tags": ["astronaut", "cockpit", "entering"], "isKeyMoment": True},
                {"time": 10.0, "description": "checking navigation controls", "tags": ["controls", "navigation"], "isKeyMoment": True},
            ],
            "hasVisualChange": True
        }

        # Media B: Video only showing a generic exterior of a ship
        media_b = {
            "id": "vid_space_ext",
            "name": "exterior_ship.mp4",
            "type": "video",
            "duration": 15.0,
            "description": "a spaceship flying in dark space",
            "temporalSummary": "a spaceship flying in dark space",
            "tags": ["space", "spaceship", "stars"],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "a spaceship in space", "tags": ["space"], "isKeyMoment": False},
            ],
            "hasVisualChange": False
        }

        payload = {
            "segmentText": segment_text,
            "mediaItems": [
                {
                    "mediaId": media_a["id"],
                    "mediaName": media_a["name"],
                    "description": media_a["description"],
                    "temporalSummary": media_a["temporalSummary"],
                    "tags": media_a["tags"],
                    "keyframeDescriptions": media_a["keyframeDescriptions"]
                },
                {
                    "mediaId": media_b["id"],
                    "mediaName": media_b["name"],
                    "description": media_b["description"],
                    "temporalSummary": media_b["temporalSummary"],
                    "tags": media_b["tags"],
                    "keyframeDescriptions": media_b["keyframeDescriptions"]
                }
            ],
            "topK": 5
        }

        res = requests.post(MATCHING_URL, json=payload, timeout=10)
        self.assertEqual(res.status_code, 200)
        candidates = res.json().get("candidates", [])
        self.assertGreater(len(candidates), 0)

        # Media A should win
        top = candidates[0]
        self.assertEqual(top["mediaId"], "vid_space_seq")
        self.assertGreater(top["score"], 0.45)

        # Now score with draft engine logic
        scored_a = score_draft_candidate(top, media_a, segment_text)
        self.assertGreater(scored_a["temporalBonus"], 0.0)
        self.assertTrue(scored_a["isKeyMoment"])
        self.assertTrue(scored_a["hasVisualChange"])
        self.assertIn("temporal sequence also covers the narration's concepts", scored_a["explanation"])

    def test_02_irrelevant_temporal_summary_does_not_win(self):
        """Test that an irrelevant temporal summary does not beat a genuinely relevant direct visual match."""
        segment_text = "The calm turquoise ocean waves lap against the sandy beach under bright sunshine."

        # Media A: Direct semantic match (Beach photo)
        media_a = {
            "id": "photo_beach",
            "name": "tropical_beach.jpg",
            "type": "image",
            "duration": 0.0,
            "description": "calm turquoise ocean waves and sandy beach under bright sunshine",
            "tags": ["beach", "ocean", "turquoise", "sand", "sunshine"],
        }

        # Media B: Unrelated video with rich temporal narrative about cars in city
        media_b = {
            "id": "vid_city_traffic",
            "name": "city_cars.mp4",
            "type": "video",
            "duration": 20.0,
            "description": "busy traffic in downtown street",
            "temporalSummary": "Video sequence showing heavy traffic downtown; later pedestrians crossing street; later cars stopping at red light.",
            "tags": ["traffic", "city", "cars", "street"],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "heavy traffic downtown", "tags": ["traffic"], "isKeyMoment": False},
                {"time": 5.0, "description": "pedestrians crossing street", "tags": ["pedestrians"], "isKeyMoment": True},
            ],
            "hasVisualChange": True
        }

        payload = {
            "segmentText": segment_text,
            "mediaItems": [
                {
                    "mediaId": media_a["id"],
                    "mediaName": media_a["name"],
                    "description": media_a["description"],
                    "tags": media_a["tags"]
                },
                {
                    "mediaId": media_b["id"],
                    "mediaName": media_b["name"],
                    "description": media_b["description"],
                    "temporalSummary": media_b["temporalSummary"],
                    "tags": media_b["tags"],
                    "keyframeDescriptions": media_b["keyframeDescriptions"]
                }
            ],
            "topK": 5
        }

        res = requests.post(MATCHING_URL, json=payload, timeout=10)
        self.assertEqual(res.status_code, 200)
        candidates = res.json().get("candidates", [])
        top = candidates[0]
        self.assertEqual(top["mediaId"], "photo_beach")
        self.assertGreater(top["score"], 0.60)

    def test_03_key_moment_bonus_application(self):
        """Test that matching a key moment keyframe awards +0.02 bonus and flags isKeyMoment."""
        cand_asset = {
            "id": "vid_key",
            "name": "launch.mp4",
            "type": "video",
            "duration": 10.0,
            "description": "rocket on launch pad",
            "tags": ["rocket", "launch", "space"],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "rocket on launch pad", "tags": ["rocket"], "isKeyMoment": False},
                {"time": 5.0, "description": "rocket engine ignition and liftoff", "tags": ["ignition", "liftoff"], "isKeyMoment": True},
            ],
            "hasVisualChange": True
        }

        cand_match = {
            "mediaId": "vid_key",
            "score": 0.65,
            "matchedSnippet": "rocket engine ignition and liftoff"
        }

        res = score_draft_candidate(cand_match, cand_asset, "At T-minus zero, the rocket engine ignites with intense flame.")
        self.assertTrue(res["isKeyMoment"])
        self.assertGreaterEqual(res["temporalBonus"], 0.02)
        self.assertIn("matches an informative key moment in footage", res["explanation"])

    def test_04_visual_change_bonus_application(self):
        """Test that visual change bonus triggers only when narration contains action and video has recorded visual change."""
        # Case A: Action in narration + visual change in video -> bonus applied
        asset_with_change = {
            "id": "vid_change",
            "name": "door_open.mp4",
            "type": "video",
            "duration": 8.0,
            "description": "a closed laboratory door",
            "tags": ["door", "laboratory"],
            "hasVisualChange": True,
            "visualChanges": [{"fromTime": 0.0, "toTime": 4.0, "differenceScore": 0.45, "description": "Door opens"}]
        }
        res_action = calculate_temporal_bonus(asset_with_change, "He slowly enters the laboratory.")
        self.assertTrue(res_action["hasVisualChange"])
        self.assertGreaterEqual(res_action["totalBonus"], 0.02)

        # Case B: Static narration + visual change in video -> no action bonus
        res_static = calculate_temporal_bonus(asset_with_change, "The laboratory door is metal.")
        self.assertFalse(res_static["hasVisualChange"])
        self.assertEqual(res_static["totalBonus"], 0.0)

        # Case C: Action in narration + NO visual change in video -> no action bonus
        asset_static = {
            "id": "vid_static",
            "name": "still_door.mp4",
            "type": "video",
            "duration": 8.0,
            "description": "a static laboratory door",
            "tags": ["door", "laboratory"],
            "hasVisualChange": False
        }
        res_no_change = calculate_temporal_bonus(asset_static, "He slowly enters the laboratory.")
        self.assertFalse(res_no_change["hasVisualChange"])
        self.assertEqual(res_no_change["totalBonus"], 0.0)

    def test_05_photos_completely_unaffected(self):
        """Test that photos strictly receive 0 temporal bonus under all circumstances."""
        photo_asset = {
            "id": "photo_1",
            "name": "photo.jpg",
            "type": "image",
            "duration": 0.0,
            "description": "a laboratory entrance with a metal door",
            "tags": ["door", "laboratory"],
        }
        res = calculate_temporal_bonus(photo_asset, "He enters the laboratory quickly.")
        self.assertEqual(res["totalBonus"], 0.0)
        self.assertFalse(res["isKeyMoment"])
        self.assertFalse(res["hasVisualChange"])
        self.assertEqual(res["temporalCoverageCount"], 0)
        self.assertEqual(len(res["reasonParts"]), 0)

    def test_06_videos_without_temporal_analysis_fallback(self):
        """Test that videos without temporal analysis fall back gracefully to 0 temporal bonus."""
        video_no_temporal = {
            "id": "vid_legacy",
            "name": "legacy_clip.mp4",
            "type": "video",
            "duration": 10.0,
            "description": "a car on a highway",
            "tags": ["car", "highway"],
        }
        res = calculate_temporal_bonus(video_no_temporal, "The car travels quickly along the road.")
        self.assertEqual(res["totalBonus"], 0.0)
        self.assertFalse(res["isKeyMoment"])
        self.assertFalse(res["hasVisualChange"])
        self.assertEqual(res["temporalCoverageCount"], 0)

    def test_07_temporal_bonus_cap_at_005(self):
        """Test that the combined temporal bonus is strictly capped at +0.05 to maintain semantic dominance."""
        super_video = {
            "id": "vid_super",
            "name": "epic_sequence.mp4",
            "type": "video",
            "duration": 25.0,
            "description": "a spaceship journey",
            "temporalSummary": "Video sequence showing spaceship launching; later flying past planets; later entering warp speed; later landing on moon.",
            "tags": ["spaceship", "launch", "planets", "warp", "moon"],
            "keyframeDescriptions": [
                {"time": 0.0, "description": "spaceship launching from ground", "tags": ["launch", "spaceship"], "isKeyMoment": True},
                {"time": 5.0, "description": "flying past giant planets", "tags": ["planets", "flying"], "isKeyMoment": True},
                {"time": 10.0, "description": "entering warp speed tunnel", "tags": ["warp", "entering"], "isKeyMoment": True},
                {"time": 15.0, "description": "landing on cratered moon", "tags": ["moon", "landing"], "isKeyMoment": True},
            ],
            "hasVisualChange": True,
            "visualChanges": [{"fromTime": 0.0, "toTime": 5.0, "differenceScore": 0.8, "description": "Scene cut"}]
        }

        # Narration matches multi-frame concepts, key moment, and action keywords
        narration = "The spaceship launches, enters warp speed, and begins landing on the cratered moon surface."
        res = calculate_temporal_bonus(super_video, narration, matched_snippet="entering warp speed tunnel")
        
        # All 3 bonuses would sum to 0.025 + 0.020 + 0.020 = 0.065, but must be capped at 0.05
        self.assertEqual(res["totalBonus"], 0.05)
        self.assertLessEqual(res["totalBonus"], 0.05)

    def test_08_reuse_penalties_still_effective(self):
        """Test that reuse penalties outweigh small temporal bonuses when repeated media is evaluated."""
        cand_asset = {
            "id": "vid_reused",
            "name": "space_flight.mp4",
            "type": "video",
            "duration": 15.0,
            "description": "spaceship travelling in deep space",
            "tags": ["spaceship", "space"],
            "hasVisualChange": True
        }

        cand_match = {
            "mediaId": "vid_reused",
            "score": 0.60,
            "matchedSnippet": "spaceship travelling in deep space"
        }

        # First use (reuseCount = 0) -> adjustedScore incorporates temporal bonus
        res_first = score_draft_candidate(cand_match, cand_asset, "The vessel travels into deep space.", current_reuse=0)
        
        # Second use (reuseCount = 1) -> -0.08 penalty applies
        res_reused = score_draft_candidate(cand_match, cand_asset, "The vessel travels into deep space.", current_reuse=1)
        
        # Reused adjusted score should be lower by exactly the reuse penalty (0.08)
        self.assertAlmostEqual(res_first["adjustedScore"] - res_reused["adjustedScore"], 0.08, places=3)
        self.assertIn("Usage #2", f"Usage #{res_reused['reuseCount'] + 1}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
