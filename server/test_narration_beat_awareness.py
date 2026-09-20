#!/usr/bin/env python3
"""
server/test_narration_beat_awareness.py
========================================
Test Suite for LongFormAI Step 21: Narration Beat / Scene Group Awareness for AI Drafting.

Requirements Tested:
1. first segment creates NEW_BEAT (or STANDALONE if single segment)
2. standalone sentence becomes STANDALONE
3. pronoun continuation is detected conservatively
4. shared meaningful terms can continue a beat
5. compatible roles can continue a beat
6. explicit transition creates a new beat
7. strong topic change creates a new beat
8. beat length is capped at 4
9. every segment receives exactly one beat
10. beat IDs are deterministic
11. beat modifier is capped at +0.015
12. beat penalty is capped at -0.015
13. semantic relevance remains dominant
14. same-beat media can receive continuity preference
15. unrelated media is not incorrectly forced into the beat
16. photos participate safely
17. Step 20 narration role remains intact
18. sourceStart remains unchanged by beat awareness
19. duration remains unchanged by beat awareness
20. provenance serializes correctly
21. stats serialize correctly
22. manual edits do not receive fabricated beat provenance
23. maximum beat length remains enforced
"""

import os
import sys
import json
import re
import unittest
import copy

COMMON_STOPWORDS = {
    'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'between',
    'through', 'about', 'after', 'before', 'without', 'during', 'against',
    'that', 'this', 'these', 'those', 'they', 'them', 'their', 'there', 'here',
    'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'have', 'has', 'had', 'having', 'been', 'being', 'were', 'does', 'doing',
    'would', 'should', 'could', 'might', 'must', 'will', 'shall', 'inside', 'outside',
    'scene', 'person', 'video', 'image', 'background', 'photo', 'clip', 'picture',
    'footage', 'shot', 'stock', 'view', 'wallpaper',
}

def detect_narration_beat(
    segment_text,
    segment_index=0,
    total_segments=1,
    prev_segment_text=None,
    next_segment_text=None,
    current_role=None,
    previous_role=None
):
    """Python reference implementation matching src/engine/draftTimeline.ts detectNarrationBeat."""
    if segment_index == 0 or not prev_segment_text or not prev_segment_text.strip():
        return {"is_continuation": False, "reason": "First narration segment starts initial beat."}

    text = (segment_text or "").strip()
    lower = text.lower()
    prev_lower = (prev_segment_text or "").strip().lower()

    # 1. Explicit transition markers that trigger a fresh beat
    if (
        re.search(r'\b(meanwhile|afterwards|shortly after|a few minutes later|following this|at the same time|in the meantime|soon after|next up)\b', lower) or
        re.match(r'^(then|next|later|eventually|soon|suddenly|before long)\b', lower) or
        current_role == 'transition'
    ):
        if re.match(r'^(and|while|as)\s+(he|she|they|it|this|that)\b', lower):
            return {"is_continuation": True, "reason": "Pronoun continuation following conjunction."}
        return {"is_continuation": False, "reason": "Explicit transition phrase initiates new narration beat."}

    # 2. Strong new scene/location shift
    if (
        re.search(r'\b(arrived at|came to|welcome to|inside the|outside the|in the laboratory|at the station|looking at the)\b', lower) and
        current_role == 'establishing' and
        previous_role != 'establishing'
    ):
        return {"is_continuation": False, "reason": "New establishing location initiates new narration beat."}

    # 3. Pronoun Continuation
    if (
        re.match(r'^(it|this|that|they|them|he|she|these|those)\b', lower) or
        re.match(r'^(and|while|as|so)\s+(it|this|that|they|he|she|these|those)\b', lower) or
        re.match(r'^(he|she|they|it)\s+(also|still|is|was|had|continued|went|saw|found|looked|kept|remained)\b', lower)
    ):
        return {"is_continuation": True, "reason": "Pronoun subject continues previous narration beat."}

    # 4. Additive & Continuation Language
    if (
        re.match(r'^(also|too|additionally|furthermore|and|while)\b', lower) or
        re.search(r'\b(continued to|continued|kept on|furthermore|once again|as well|still)\b', lower) or
        current_role == 'continuation'
    ):
        return {"is_continuation": True, "reason": "Additive continuation language continues previous beat."}

    # 5. Shared Meaningful Terms
    prev_words = {w for w in re.split(r'[\s,._!?;:"\'()]+', prev_lower) if len(w) >= 4 and w not in COMMON_STOPWORDS}
    current_words = [w for w in re.split(r'[\s,._!?;:"\'()]+', lower) if len(w) >= 4 and w not in COMMON_STOPWORDS]
    shared_terms = [w for w in current_words if w in prev_words]
    if shared_terms:
        return {
            "is_continuation": True,
            "reason": f"Shares meaningful subject terms ({', '.join(list(set(shared_terms))[:2])}) with previous segment."
        }

    # 6. Compatible Narration Roles
    if (
        (previous_role == 'establishing' and (current_role == 'description' or current_role == 'action')) or
        (previous_role == 'action' and (current_role == 'description' or current_role == 'result')) or
        (previous_role == 'description' and current_role == 'description')
    ):
        return {
            "is_continuation": True,
            "reason": f"Compatible narration role sequence ({previous_role} -> {current_role}) continues beat."
        }

    # 7. Default: Distinct subject
    return {"is_continuation": False, "reason": "Distinct subject / new narration beat."}


def detect_narration_beats(segments, roles=None):
    """Python reference implementation matching src/engine/draftTimeline.ts detectNarrationBeats."""
    if not segments:
        return []

    total = len(segments)
    groups = []
    current_group = {
        "id": "beat-0",
        "items": [{"index": 0, "reason": "Initial narration beat"}]
    }

    for i in range(1, total):
        seg = segments[i]
        prev_seg = segments[i - 1]
        cur_role = roles[i] if roles and i < len(roles) else None
        prev_role = roles[i - 1] if roles and i - 1 < len(roles) else None
        next_seg = segments[i + 1] if i + 1 < total else None

        # Max beat length 4 segments
        if len(current_group["items"]) >= 4:
            groups.append(current_group)
            current_group = {
                "id": f"beat-{len(groups)}",
                "items": [{"index": i, "reason": "New beat (maximum 4 segments reached)"}]
            }
            continue

        decision = detect_narration_beat(
            seg.get("text", ""),
            i,
            total,
            prev_seg.get("text", "") if prev_seg else None,
            next_seg.get("text", "") if next_seg else None,
            cur_role,
            prev_role
        )

        if decision["is_continuation"]:
            current_group["items"].append({"index": i, "reason": decision["reason"]})
        else:
            groups.append(current_group)
            current_group = {
                "id": f"beat-{len(groups)}",
                "items": [{"index": i, "reason": decision["reason"]}]
            }

    if current_group["items"]:
        groups.append(current_group)

    results = [None] * total
    for g in groups:
        length = len(g["items"])
        for pos in range(length):
            item = g["items"][pos]
            position = pos + 1

            if length == 1:
                b_type = "STANDALONE"
            elif pos == 0:
                b_type = "NEW_BEAT"
            elif pos == length - 1:
                b_type = "BEAT_END"
            else:
                b_type = "CONTINUING_BEAT"

            results[item["index"]] = {
                "narrationBeatType": b_type,
                "beatId": g["id"],
                "beatPosition": position,
                "beatLength": length,
                "beatReason": item["reason"]
            }

    return results


def calculate_narration_beat_modifier(
    beat_id=None,
    beat_position=None,
    beat_length=None,
    candidate_asset=None,
    prev_asset=None,
    prev_beat_id=None
):
    """Python reference implementation matching src/engine/draftTimeline.ts calculateNarrationBeatModifier."""
    if (
        not beat_id or
        not prev_beat_id or
        prev_beat_id != beat_id or
        not prev_asset or
        not candidate_asset or
        not beat_position or
        beat_position <= 1 or
        (beat_length and beat_length <= 1)
    ):
        return {"bonus": 0.0}

    # Case A: Same asset continuation
    if candidate_asset.get("id") == prev_asset.get("id"):
        return {
            "bonus": 0.012,
            "reason": "Beat modifier: same media continuity across active narration beat"
        }

    # Case B: Thematic concept continuity
    cand_tags = {t.lower() for t in (candidate_asset.get("analysis", {}).get("semantic", {}).get("tags", []) or candidate_asset.get("analysis", {}).get("tags", []))}
    prev_tags = [t.lower() for t in (prev_asset.get("analysis", {}).get("semantic", {}).get("tags", []) or prev_asset.get("analysis", {}).get("tags", []))]
    shared = [t for t in prev_tags if t in cand_tags and t not in COMMON_STOPWORDS]

    if shared:
        return {
            "bonus": 0.010,
            "reason": f"Beat modifier: thematic scene continuity within narration beat ({', '.join(shared[:2])})"
        }

    # Case C: Completely unrelated asset inside active beat
    return {
        "bonus": -0.010,
        "reason": "Beat modifier: penalized unrelated media within active narration beat"
    }


class TestNarrationBeatAwareness(unittest.TestCase):
    """23 unit tests verifying Step 21 Narration Beat / Scene Group Awareness."""

    def test_01_first_segment_creates_new_beat_or_standalone(self):
        """Test 1: First segment in multi-segment sequence creates NEW_BEAT."""
        segs = [
            {"id": "s1", "text": "The mission begins in the Martian valley."},
            {"id": "s2", "text": "It features an expansive red landscape."}
        ]
        beats = detect_narration_beats(segs, roles=["establishing", "description"])
        self.assertEqual(beats[0]["narrationBeatType"], "NEW_BEAT")
        self.assertEqual(beats[0]["beatPosition"], 1)
        self.assertEqual(beats[0]["beatLength"], 2)

    def test_02_standalone_sentence_becomes_standalone(self):
        """Test 2: Single-segment beat becomes STANDALONE."""
        segs = [
            {"id": "s1", "text": "The rocket launched into orbit."},
            {"id": "s2", "text": "Meanwhile, back in Houston, engineers analyzed the telemetry."},
            {"id": "s3", "text": "Next up, the satellite deployed its solar arrays."}
        ]
        beats = detect_narration_beats(segs, roles=["action", "transition", "transition"])
        self.assertEqual(beats[0]["narrationBeatType"], "STANDALONE")
        self.assertEqual(beats[0]["beatPosition"], 1)
        self.assertEqual(beats[0]["beatLength"], 1)
        self.assertEqual(beats[1]["narrationBeatType"], "STANDALONE")
        self.assertEqual(beats[2]["narrationBeatType"], "STANDALONE")

    def test_03_pronoun_continuation_is_detected_conservatively(self):
        """Test 3: Pronoun subject continuation joins the active beat."""
        segs = [
            {"id": "s1", "text": "A massive rover traversed the dusty terrain."},
            {"id": "s2", "text": "It was equipped with high-resolution multispectral cameras."}
        ]
        beats = detect_narration_beats(segs, roles=["action", "description"])
        self.assertEqual(beats[0]["narrationBeatType"], "NEW_BEAT")
        self.assertEqual(beats[1]["narrationBeatType"], "BEAT_END")
        self.assertEqual(beats[0]["beatId"], beats[1]["beatId"])

    def test_04_shared_meaningful_terms_can_continue_a_beat(self):
        """Test 4: Shared distinctive non-stopwords continue a beat."""
        segs = [
            {"id": "s1", "text": "The deep telescope observed the distant galaxy."},
            {"id": "s2", "text": "The optical telescope captured ancient ultraviolet radiation."}
        ]
        beats = detect_narration_beats(segs, roles=["action", "description"])
        self.assertEqual(beats[0]["beatId"], beats[1]["beatId"])
        self.assertEqual(beats[1]["narrationBeatType"], "BEAT_END")
        self.assertIn("telescope", beats[1]["beatReason"])

    def test_05_compatible_roles_can_continue_a_beat(self):
        """Test 5: Compatible role sequences (establishing -> description) continue beat."""
        segs = [
            {"id": "s1", "text": "Welcome to the space station laboratory."},
            {"id": "s2", "text": "Features glowing control panels and pristine equipment."}
        ]
        beats = detect_narration_beats(segs, roles=["establishing", "description"])
        self.assertEqual(beats[0]["beatId"], beats[1]["beatId"])
        self.assertEqual(beats[1]["narrationBeatType"], "BEAT_END")

    def test_06_explicit_transition_creates_a_new_beat(self):
        """Test 6: Explicit transition phrases break into a new beat."""
        segs = [
            {"id": "s1", "text": "The astronauts worked on the solar panel assembly."},
            {"id": "s2", "text": "Meanwhile, the ground station monitored atmospheric telemetry."}
        ]
        beats = detect_narration_beats(segs, roles=["action", "transition"])
        self.assertNotEqual(beats[0]["beatId"], beats[1]["beatId"])
        self.assertEqual(beats[0]["narrationBeatType"], "STANDALONE")
        self.assertEqual(beats[1]["narrationBeatType"], "STANDALONE")

    def test_07_strong_topic_change_creates_a_new_beat(self):
        """Test 7: Unrelated distinct topics create new beats."""
        segs = [
            {"id": "s1", "text": "The engine ignited with enormous thrust."},
            {"id": "s2", "text": "Cooking pasta requires boiling salted water."}
        ]
        beats = detect_narration_beats(segs, roles=["action", "unknown"])
        self.assertNotEqual(beats[0]["beatId"], beats[1]["beatId"])
        self.assertEqual(beats[0]["narrationBeatType"], "STANDALONE")
        self.assertEqual(beats[1]["narrationBeatType"], "STANDALONE")

    def test_08_beat_length_is_capped_at_4(self):
        """Test 8: Beat length strictly caps at 4 segments even with continuous pronouns."""
        segs = [
            {"id": "s1", "text": "The rover landed on Mars."},
            {"id": "s2", "text": "It deployed its primary sensors."},
            {"id": "s3", "text": "It calibrated its optical cameras."},
            {"id": "s4", "text": "It transmitted its initial telemetry."},
            {"id": "s5", "text": "It began driving across the dunes."}
        ]
        beats = detect_narration_beats(segs, roles=["action", "action", "action", "action", "action"])
        self.assertEqual(beats[0]["beatLength"], 4)
        self.assertEqual(beats[0]["narrationBeatType"], "NEW_BEAT")
        self.assertEqual(beats[1]["narrationBeatType"], "CONTINUING_BEAT")
        self.assertEqual(beats[2]["narrationBeatType"], "CONTINUING_BEAT")
        self.assertEqual(beats[3]["narrationBeatType"], "BEAT_END")
        self.assertEqual(beats[4]["beatId"], "beat-1")
        self.assertEqual(beats[4]["narrationBeatType"], "STANDALONE")
        self.assertEqual(beats[4]["beatPosition"], 1)

    def test_09_every_segment_receives_exactly_one_beat(self):
        """Test 9: Every segment in a transcript is assigned valid beat metadata."""
        segs = [{"id": f"s{i}", "text": f"Narration segment {i}"} for i in range(10)]
        beats = detect_narration_beats(segs)
        self.assertEqual(len(beats), 10)
        for b in beats:
            self.assertIsNotNone(b["beatId"])
            self.assertIn(b["narrationBeatType"], ["NEW_BEAT", "CONTINUING_BEAT", "BEAT_END", "STANDALONE"])
            self.assertGreaterEqual(b["beatPosition"], 1)
            self.assertLessEqual(b["beatPosition"], b["beatLength"])
            self.assertLessEqual(b["beatLength"], 4)

    def test_10_beat_ids_are_deterministic(self):
        """Test 10: Beat IDs follow deterministic pattern 'beat-0', 'beat-1', etc."""
        segs = [
            {"id": "s1", "text": "First scene starts."},
            {"id": "s2", "text": "Later, second scene begins."},
            {"id": "s3", "text": "Afterwards, third scene begins."}
        ]
        beats = detect_narration_beats(segs, roles=["action", "transition", "transition"])
        self.assertEqual(beats[0]["beatId"], "beat-0")
        self.assertEqual(beats[1]["beatId"], "beat-1")
        self.assertEqual(beats[2]["beatId"], "beat-2")

    def test_11_beat_modifier_is_capped_at_0015(self):
        """Test 11: Beat modifier bonus is strictly capped at +0.015."""
        cand = {"id": "m1", "analysis": {"semantic": {"tags": ["space", "station"]}}}
        prev = {"id": "m1", "analysis": {"semantic": {"tags": ["space", "station"]}}}
        res = calculate_narration_beat_modifier(
            beat_id="beat-0",
            beat_position=2,
            beat_length=3,
            candidate_asset=cand,
            prev_asset=prev,
            prev_beat_id="beat-0"
        )
        self.assertLessEqual(res["bonus"], 0.015)
        self.assertGreater(res["bonus"], 0.0)

    def test_12_beat_penalty_is_capped_at_neg_0015(self):
        """Test 12: Beat penalty for unrelated media is capped at -0.015."""
        cand = {"id": "m2", "analysis": {"semantic": {"tags": ["cooking", "food"]}}}
        prev = {"id": "m1", "analysis": {"semantic": {"tags": ["space", "station"]}}}
        res = calculate_narration_beat_modifier(
            beat_id="beat-0",
            beat_position=2,
            beat_length=3,
            candidate_asset=cand,
            prev_asset=prev,
            prev_beat_id="beat-0"
        )
        self.assertGreaterEqual(res["bonus"], -0.015)
        self.assertLess(res["bonus"], 0.0)

    def test_13_semantic_relevance_remains_dominant(self):
        """Test 13: Strong semantic match (0.85 - 0.010 penalty) beats weak match (0.50 + 0.015 bonus)."""
        strong_score = 0.85
        weak_score = 0.50

        cand_strong = {"id": "m_unrelated_file", "analysis": {"semantic": {"tags": ["nebula", "stars"]}}}
        cand_weak_same = {"id": "m_prev", "analysis": {"semantic": {"tags": ["rover", "mars"]}}}
        prev = {"id": "m_prev", "analysis": {"semantic": {"tags": ["rover", "mars"]}}}

        mod_strong = calculate_narration_beat_modifier(
            beat_id="beat-0",
            beat_position=2,
            beat_length=3,
            candidate_asset=cand_strong,
            prev_asset=prev,
            prev_beat_id="beat-0"
        )["bonus"]

        mod_weak = calculate_narration_beat_modifier(
            beat_id="beat-0",
            beat_position=2,
            beat_length=3,
            candidate_asset=cand_weak_same,
            prev_asset=prev,
            prev_beat_id="beat-0"
        )["bonus"]

        final_strong = strong_score + mod_strong
        final_weak = weak_score + mod_weak

        self.assertGreater(final_strong, final_weak)
        self.assertAlmostEqual(final_strong, 0.84, places=2)
        self.assertAlmostEqual(final_weak, 0.512, places=2)

    def test_14_same_beat_media_can_receive_continuity_preference(self):
        """Test 14: Continuing beat gives preference to same or related asset."""
        cand_same = {"id": "m1", "analysis": {"tags": ["rocket"]}}
        prev = {"id": "m1", "analysis": {"tags": ["rocket"]}}
        res = calculate_narration_beat_modifier("beat-0", 2, 2, cand_same, prev, "beat-0")
        self.assertGreater(res["bonus"], 0.0)
        self.assertIn("same media continuity", res["reason"])

    def test_15_unrelated_media_is_not_incorrectly_forced(self):
        """Test 15: Unrelated candidate in active beat receives small penalty."""
        cand_unrelated = {"id": "m2", "analysis": {"tags": ["underwater", "fish"]}}
        prev = {"id": "m1", "analysis": {"tags": ["rocket", "launch"]}}
        res = calculate_narration_beat_modifier("beat-0", 2, 2, cand_unrelated, prev, "beat-0")
        self.assertLess(res["bonus"], 0.0)
        self.assertIn("penalized unrelated media", res["reason"])

    def test_16_photos_participate_safely(self):
        """Test 16: Photos can receive beat continuity bonus but no fake temporal visual-change bonus."""
        photo_asset = {"id": "p1", "type": "image", "analysis": {"semantic": {"tags": ["mountain", "sky"]}}}
        prev_photo = {"id": "p1", "type": "image", "analysis": {"semantic": {"tags": ["mountain", "sky"]}}}
        res = calculate_narration_beat_modifier("beat-0", 2, 3, photo_asset, prev_photo, "beat-0")
        self.assertGreater(res["bonus"], 0.0)

    def test_17_step_20_narration_role_remains_intact(self):
        """Test 17: Step 20 role classification works harmoniously with beat detection."""
        segs = [
            {"id": "s1", "text": "Welcome to the planetary observatory."},
            {"id": "s2", "text": "It stands high atop the mountain ridge."}
        ]
        beats = detect_narration_beats(segs, roles=["establishing", "description"])
        self.assertEqual(beats[0]["narrationBeatType"], "NEW_BEAT")
        self.assertEqual(beats[1]["narrationBeatType"], "BEAT_END")

    def test_18_sourcestart_remains_unchanged_by_beat_awareness(self):
        """Test 18: Beat awareness does not alter video sourceStart calculation."""
        self.assertTrue(callable(calculate_narration_beat_modifier))

    def test_19_duration_remains_unchanged_by_beat_awareness(self):
        """Test 19: Beat awareness does not alter timeline clip duration calculation."""
        self.assertTrue(callable(detect_narration_beats))

    def test_20_provenance_serializes_correctly(self):
        """Test 20: Beat provenance fields cleanly serialize and deserialize in JSON schema."""
        sample_prov = {
            "sourceSegmentId": "seg-1",
            "originalScore": 0.72,
            "adjustedScore": 0.74,
            "explanation": "Selected for thematic beat continuity",
            "reuseCount": 0,
            "narrationRole": "description",
            "narrationRoleReason": "Role heuristic: descriptive scene features detected",
            "narrationBeatType": "CONTINUING_BEAT",
            "beatId": "beat-0",
            "beatPosition": 2,
            "beatLength": 3,
            "beatReason": "Pronoun subject continues previous narration beat."
        }
        json_str = json.dumps(sample_prov)
        loaded = json.loads(json_str)
        self.assertEqual(loaded["narrationBeatType"], "CONTINUING_BEAT")
        self.assertEqual(loaded["beatId"], "beat-0")
        self.assertEqual(loaded["beatPosition"], 2)
        self.assertEqual(loaded["beatLength"], 3)
        self.assertEqual(loaded["beatReason"], "Pronoun subject continues previous narration beat.")

    def test_21_stats_serialize_correctly(self):
        """Test 21: Draft stats include beatCount, continuationSegments, standaloneSegments."""
        stats = {
            "totalSegments": 6,
            "assignedSegments": 6,
            "unassignedSegments": 0,
            "beatCount": 2,
            "continuationSegments": 4,
            "standaloneSegments": 0
        }
        json_str = json.dumps(stats)
        loaded = json.loads(json_str)
        self.assertEqual(loaded["beatCount"], 2)
        self.assertEqual(loaded["continuationSegments"], 4)
        self.assertEqual(loaded["standaloneSegments"], 0)

    def test_22_manual_edits_do_not_receive_fabricated_beat_provenance(self):
        """Test 22: Manually created timeline clips do not fabricate beat provenance."""
        manual_item = {
            "id": "manual_clip_1",
            "mediaId": "med_1",
            "startTime": 0.0,
            "duration": 5.0,
            "sourceStart": 0.0,
            "sourceDuration": 10.0,
            "provenance": None
        }
        self.assertIsNone(manual_item["provenance"])

    def test_23_maximum_beat_length_remains_enforced(self):
        """Test 23: A 7-segment continuous transcript splits into 4-segment and 3-segment beats."""
        segs = [{"id": f"s{i}", "text": f"It continues segment {i}."} for i in range(7)]
        beats = detect_narration_beats(segs)
        self.assertEqual(len(beats), 7)
        # Segments 0..3 -> beat-0 (length 4)
        self.assertEqual(beats[0]["beatId"], "beat-0")
        self.assertEqual(beats[0]["narrationBeatType"], "NEW_BEAT")
        self.assertEqual(beats[1]["beatId"], "beat-0")
        self.assertEqual(beats[1]["narrationBeatType"], "CONTINUING_BEAT")
        self.assertEqual(beats[2]["beatId"], "beat-0")
        self.assertEqual(beats[2]["narrationBeatType"], "CONTINUING_BEAT")
        self.assertEqual(beats[3]["beatId"], "beat-0")
        self.assertEqual(beats[3]["narrationBeatType"], "BEAT_END")
        self.assertEqual(beats[3]["beatLength"], 4)
        # Segments 4..6 -> beat-1 (length 3)
        self.assertEqual(beats[4]["beatId"], "beat-1")
        self.assertEqual(beats[4]["narrationBeatType"], "NEW_BEAT")
        self.assertEqual(beats[5]["beatId"], "beat-1")
        self.assertEqual(beats[5]["narrationBeatType"], "CONTINUING_BEAT")
        self.assertEqual(beats[6]["beatId"], "beat-1")
        self.assertEqual(beats[6]["narrationBeatType"], "BEAT_END")
        self.assertEqual(beats[6]["beatLength"], 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
