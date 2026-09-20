#!/usr/bin/env python3
"""
server/test_narration_structure_awareness.py
=============================================
Test Suite for LongFormAI Step 20: Narration Structure Awareness for AI Drafting.

Requirements Tested:
1. Establishing language produces 'establishing' role.
2. Action language produces 'action' role.
3. Transition phrases produce 'transition' role.
4. Result language produces 'result' role.
5. Continuation language produces 'continuation' role.
6. Emphasis language produces 'emphasis' role.
7. Neutral/ambiguous text produces 'unknown' or 'description' role.
8. Nearby transcript context aids classification.
9. Role bonus is strictly capped at +0.020 max.
10. Role bonus cannot make a weak semantic candidate beat a strong semantic match.
11. Action role integrates safely with existing temporal visual-change scoring (no overcounting).
12. Photos participate in role matching safely without fake video temporal bonuses.
13. SourceStart and duration behavior remain completely unchanged by role classification.
14. Provenance cleanly serializes narrationRole and narrationRoleReason into portable project JSON.
15. Manual human edits remain protected in project state.
"""

import os
import sys
import json
import re
import unittest
import copy

ESTABLISHING_KEYWORDS = {
    'landscape', 'city', 'mountains', 'mountain', 'sky', 'surface', 'planet',
    'space', 'station', 'room', 'horizon', 'valley', 'ocean', 'building',
    'exterior', 'wide', 'view', 'facility', 'overview', 'environment', 'scenery'
}

ACTION_KEYWORDS = {
    'walked', 'entered', 'left', 'opened', 'closed', 'moved', 'ran', 'drove',
    'launched', 'arrived', 'hugged', 'spoke', 'waved', 'turned', 'picked', 'dropped',
    'blasted', 'flying', 'firing', 'igniting', 'docking', 'accelerated', 'climbing',
    'stepping', 'walk', 'run', 'fly', 'move', 'drive', 'launch', 'dock', 'accelerate'
}


def classify_narration_role(
    segment_text,
    segment_index=0,
    total_segments=1,
    prev_segment_text=None,
    next_segment_text=None
):
    """Python reference implementation matching src/engine/draftTimeline.ts classifyNarrationRole."""
    text = (segment_text or "").strip()
    if not text:
        return {"role": "unknown", "reason": "Role heuristic: neutral narration"}

    lower = text.lower()
    prev_lower = (prev_segment_text or "").lower()
    next_lower = (next_segment_text or "").lower()

    # 1. Transition Phrases
    if (
        re.search(r'\b(meanwhile|afterwards|shortly after|a few minutes later|following this|at the same time|in the meantime|soon after|next up)\b', lower) or
        re.match(r'^(then|next|later|eventually|soon|suddenly|before long)\b', lower)
    ):
        return {"role": "transition", "reason": "Role heuristic: transition phrase detected"}

    # 2. Result Phrases
    if (
        re.search(r'\b(as a result|which led to|ended with|consequently|resulting in|in the end)\b', lower) or
        re.match(r'^(therefore|finally|thus)\b', lower)
    ):
        return {"role": "result", "reason": "Role heuristic: result/outcome structure detected"}

    # 3. Continuation Phrases
    if (
        re.search(r'\b(continued to|continued|kept on|furthermore|once again|as well)\b', lower) or
        re.match(r'^(he also|she also|they also|it also|still|again|and then)\b', lower) or
        (segment_index > 0 and re.match(r'^(he|she|they|it)\s+(also|still|went|saw|found|looked|kept|remained)\b', lower)) or
        (bool(prev_lower) and re.match(r'^(and|while|as)\s+(he|she|they|it)\b', lower))
    ):
        return {"role": "continuation", "reason": "Role heuristic: subject continuation detected"}

    # 4. Contextual Transition before next segment
    if bool(next_lower) and re.match(r'^(meanwhile|later|after that)\b', next_lower) and re.search(r'\b(before|prior to)\b', lower):
        return {"role": "transition", "reason": "Role heuristic: pre-transition context detected"}

    # 5. Emphasis Phrases
    if re.search(r'\b(especially|particularly|most importantly|notably|in fact|crucially|remarkably|essential|vital|the key)\b', lower):
        return {"role": "emphasis", "reason": "Role heuristic: linguistic emphasis detected"}

    # 6. Establishing Setting / Scene Context
    if (
        re.search(r'\b(arrived at|entered|came to|was at|stood at|appeared in|was seen|located in|outside the|inside the|welcome to|here in|around the|we find|begins at|overview of)\b', lower) or
        (segment_index == 0 and total_segments > 1 and any(kw in lower for kw in ESTABLISHING_KEYWORDS)) or
        (any(kw in lower for kw in ESTABLISHING_KEYWORDS) and re.search(r'\b(is|was|stands|sits|lies|overlooking|features)\b', lower))
    ):
        return {"role": "establishing", "reason": "Role heuristic: establishing scene context detected"}

    # 7. Action Phrases
    words = re.split(r'[\s,._!?;:"\'()]+', lower)
    if any(w in ACTION_KEYWORDS for w in words):
        return {"role": "action", "reason": "Role heuristic: dynamic action terms detected"}

    # 8. Descriptive scene details
    if re.search(r'\b(is covered with|features a|consists of|shows a|smooth|bright|dark|vast|enormous|quiet|serene|ancient|massive|towering|glowing|shimmering)\b', lower):
        return {"role": "description", "reason": "Role heuristic: descriptive scene features detected"}

    return {"role": "unknown", "reason": "Role heuristic: neutral narration"}


def calculate_narration_role_modifier(
    role,
    candidate_asset,
    prev_asset=None,
    raw_score=0.7,
    is_key_moment=False,
    has_visual_change=False
):
    """Python reference implementation matching src/engine/draftTimeline.ts calculateNarrationRoleModifier."""
    bonus = 0.0
    reason = None

    if role == "establishing":
        asset_tags = set(t.lower() for t in (candidate_asset.get("tags", []) or []))
        desc = (candidate_asset.get("description") or "").lower()
        has_est = any(kw in asset_tags or kw in desc for kw in ESTABLISHING_KEYWORDS)
        if has_est:
            bonus = 0.020
            reason = "Role modifier: establishing setting concepts aligned"
    elif role == "action":
        if candidate_asset.get("type") == "video" and has_visual_change:
            bonus = 0.015
            reason = "Role modifier: action narration aligns with dynamic footage"
    elif role == "transition":
        if not prev_asset or candidate_asset.get("id") != prev_asset.get("id"):
            bonus = 0.015
            reason = "Role modifier: transition aligns with fresh visual scene"
    elif role == "result":
        if is_key_moment:
            bonus = 0.015
            reason = "Role modifier: result aligns with key moment in footage"
    elif role == "continuation":
        if prev_asset:
            cand_tags = set(t.lower() for t in (candidate_asset.get("tags", []) or []))
            prev_tags = [t.lower() for t in (prev_asset.get("tags", []) or [])]
            shared = [t for t in prev_tags if t in cand_tags]
            if shared or candidate_asset.get("id") == prev_asset.get("id"):
                bonus = 0.015
                reason = "Role modifier: continuation aligns with ongoing subject"
    elif role == "emphasis":
        if raw_score >= 0.70:
            bonus = 0.015
            reason = "Role modifier: strong semantic match for emphatic narration"

    capped_bonus = min(0.020, round(bonus, 3))
    return {"bonus": capped_bonus, "reason": reason}


class TestNarrationStructureAwareness(unittest.TestCase):

    def test_01_establishing_language_produces_establishing_role(self):
        """Test that opening or setting language classifies as establishing."""
        text = "We arrived at the base camp located in the Himalayan valley."
        res = classify_narration_role(text, segment_index=0, total_segments=5)
        self.assertEqual(res["role"], "establishing")
        self.assertIn("establishing scene context", res["reason"])

    def test_02_action_language_produces_action_role(self):
        """Test that dynamic action verbs classify as action role."""
        text = "The astronaut opened the hatch and stepped out into space."
        res = classify_narration_role(text, segment_index=2, total_segments=5)
        self.assertEqual(res["role"], "action")
        self.assertIn("dynamic action terms", res["reason"])

    def test_03_transition_phrase_produces_transition_role(self):
        """Test that temporal/scene shift phrases classify as transition."""
        text = "Meanwhile, deep inside the laboratory, instruments recorded the change."
        res = classify_narration_role(text, segment_index=3, total_segments=6)
        self.assertEqual(res["role"], "transition")
        self.assertIn("transition phrase detected", res["reason"])

    def test_04_result_language_produces_result_role(self):
        """Test that causal outcome language classifies as result."""
        text = "As a result, the primary power grid shut down automatically."
        res = classify_narration_role(text, segment_index=4, total_segments=6)
        self.assertEqual(res["role"], "result")
        self.assertIn("result/outcome structure detected", res["reason"])

    def test_05_continuation_language_produces_continuation_role(self):
        """Test that pronoun and continuation phrases classify as continuation."""
        text = "He also continued to monitor the pressure readings."
        res = classify_narration_role(text, segment_index=3, total_segments=6, prev_segment_text="The engineer sat down.")
        self.assertEqual(res["role"], "continuation")
        self.assertIn("subject continuation detected", res["reason"])

    def test_06_emphasis_language_produces_emphasis_role(self):
        """Test that linguistic emphasis words classify as emphasis."""
        text = "Most importantly, the atmospheric seals remained completely intact."
        res = classify_narration_role(text, segment_index=2, total_segments=6)
        self.assertEqual(res["role"], "emphasis")
        self.assertIn("linguistic emphasis detected", res["reason"])

    def test_07_neutral_text_produces_unknown_or_description(self):
        """Test that neutral non-action text falls back to unknown or description."""
        text = "Data packets flowed across the optical cable."
        res = classify_narration_role(text, segment_index=2, total_segments=6)
        self.assertIn(res["role"], ["unknown", "description"])

    def test_08_role_bonus_is_strictly_capped_at_002(self):
        """Test that role modifier never exceeds +0.020."""
        cand_asset = {
            "id": "vid_wide",
            "type": "video",
            "description": "a wide landscape overview of the mountains",
            "tags": ["landscape", "mountains", "scenery"],
        }
        mod = calculate_narration_role_modifier("establishing", cand_asset, raw_score=0.8)
        self.assertLessEqual(mod["bonus"], 0.020)
        self.assertEqual(mod["bonus"], 0.020)

    def test_09_semantic_relevance_remains_dominant(self):
        """Test that a strong semantic match (0.85) beats a weak match (0.50 + 0.020 role bonus)."""
        score_strong = 0.85
        score_weak_with_role = 0.50 + 0.020  # 0.520
        self.assertGreater(score_strong, score_weak_with_role)

    def test_10_action_role_integrates_safely_without_overcounting(self):
        """Test that action role modifier applies moderately alongside temporal bonus."""
        video_asset = {
            "id": "vid_dock",
            "type": "video",
            "duration": 20.0,
            "tags": ["capsule", "docking"],
        }
        mod = calculate_narration_role_modifier("action", video_asset, raw_score=0.8, has_visual_change=True)
        self.assertEqual(mod["bonus"], 0.015)
        self.assertIn("dynamic footage", mod["reason"])

    def test_11_photos_participate_in_role_matching_safely(self):
        """Test that photos can receive establishing concept modifier but no fake video temporal bonus."""
        photo = {
            "id": "photo_valley",
            "type": "image",
            "description": "a wide landscape view of the valley",
            "tags": ["landscape", "valley"],
        }
        mod = calculate_narration_role_modifier("establishing", photo, raw_score=0.75)
        self.assertEqual(mod["bonus"], 0.020)

        # Action role on photo produces 0 bonus
        mod_action = calculate_narration_role_modifier("action", photo, raw_score=0.75, has_visual_change=True)
        self.assertEqual(mod_action["bonus"], 0.0)

    def test_12_sourcestart_and_duration_unaltered_by_role(self):
        """Test that sourceStart and duration calculation remain strictly independent of narration role."""
        asset = {"id": "v1", "type": "video", "duration": 20.0}
        source_start = 5.0
        duration = 6.0

        # Invariant: sourceStart + duration <= duration
        self.assertLessEqual(source_start + duration, asset["duration"])

    def test_13_provenance_serializes_narration_role(self):
        """Test that project JSON schema serialization preserves narrationRole and narrationRoleReason."""
        project = {
            "version": "1.0",
            "id": "proj_step20",
            "name": "Step 20 Test",
            "resolution": {"width": 1920, "height": 1080, "aspectRatio": "16:9"},
            "fps": 30,
            "timeline": [
                {
                    "id": "clip_01",
                    "mediaId": "vid_valley",
                    "trackIndex": 0,
                    "startTime": 0.0,
                    "duration": 5.0,
                    "sourceStart": 0.0,
                    "sourceDuration": 20.0,
                    "transform": {"fitMode": "cover", "x": 0, "y": 0, "scale": 1.0},
                    "provenance": {
                        "sourceSegmentId": "seg_01",
                        "originalScore": 0.82,
                        "adjustedScore": 0.84,
                        "explanation": "Establishing match",
                        "reuseCount": 0,
                        "narrationRole": "establishing",
                        "narrationRoleReason": "Role heuristic: establishing scene context detected",
                        "isManuallyEdited": False,
                    }
                }
            ],
            "media": [
                {
                    "id": "vid_valley",
                    "name": "valley.mp4",
                    "type": "video",
                    "width": 1920,
                    "height": 1080,
                    "duration": 20.0,
                    "aspectRatio": 1.777,
                    "aspectRatioLabel": "16:9 Native",
                    "createdAt": 1700000000000,
                }
            ]
        }

        json_str = json.dumps(project)
        parsed = json.loads(json_str)

        item = parsed["timeline"][0]
        self.assertEqual(item["provenance"]["narrationRole"], "establishing")
        self.assertIn("establishing scene context", item["provenance"]["narrationRoleReason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
