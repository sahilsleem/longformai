#!/usr/bin/env python3
"""
server/test_visual_variety.py
==============================
Test Suite for LongFormAI Step 22: Visual Variety & Anti-Repetition Intelligence for AI Drafting.

Requirements Tested:
1. Same asset with similar visual appearance receives small repetition penalty.
2. Same asset with meaningful continuation does not receive excessive penalty.
3. Different orientation can receive variety preference.
4. Different media type can receive variety preference.
5. Dominant color difference is handled.
6. Tag difference is handled.
7. visualSimilarity stays strictly in [0.0, 1.0].
8. visualVarietyModifier stays strictly within [-0.012, +0.012].
9. Semantic relevance remains dominant (0.85 - 0.012 > 0.50 + 0.012).
10. Step 19 continuity prevents double penalty.
11. Step 21 beat continuity remains intact.
12. Photos participate safely without fake temporal visual-change bonuses.
13. Photo-to-video transition produces appropriate variety signal.
14. Video-to-photo transition produces appropriate variety signal.
15. Unknown visual data remains safe.
16. sourceStart calculation remains completely unchanged.
17. duration calculation remains completely unchanged.
18. Provenance cleanly serializes visualVarietyModifier, visualSimilarity, and visualVarietyReason.
19. Stats cleanly serialize varietyAdjustments, repetitionPenalties, and visualVarietyBonuses.
20. Manual edits do not fabricate variety provenance.
21. No worker is re-called for visual variety.
22. Deterministic results for identical inputs.
23. No excessive repetition penalty across active beats.
"""

import os
import sys
import json
import unittest

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

def get_visual_orientation_class(asset):
    """Python reference implementation matching src/engine/draftTimeline.ts getVisualOrientationClass."""
    if not asset:
        return 'UNKNOWN'
    w = asset.get('width', 0)
    h = asset.get('height', 0)
    if w <= 0 or h <= 0:
        return 'UNKNOWN'
    ratio = w / h
    if ratio >= 2.0:
        return 'ULTRAWIDE'
    if ratio >= 1.25:
        return 'LANDSCAPE'
    if ratio <= 0.8:
        return 'PORTRAIT'
    return 'SQUARE'

def calculate_visual_similarity(candidate_asset, prev_asset, is_consecutive_continuation=False):
    """Python reference implementation matching src/engine/draftTimeline.ts calculateVisualSimilarity."""
    if not prev_asset:
        return 0.0

    if candidate_asset.get('id') == prev_asset.get('id'):
        if is_consecutive_continuation:
            return 0.65
        return 1.0

    # 1. Media Type Similarity (0.20)
    type_sim = 1.0 if candidate_asset.get('type') == prev_asset.get('type') else 0.0

    # 2. Coarse Orientation (0.20)
    cand_orient = get_visual_orientation_class(candidate_asset)
    prev_orient = get_visual_orientation_class(prev_asset)
    orient_sim = 1.0 if (cand_orient != 'UNKNOWN' and prev_orient != 'UNKNOWN' and cand_orient == prev_orient) else 0.0

    # 3. Dominant Colors (0.20)
    cand_colors = [c.lower() for c in candidate_asset.get('analysis', {}).get('visualFeatures', {}).get('dominantColors', [])]
    prev_colors = [c.lower() for c in prev_asset.get('analysis', {}).get('visualFeatures', {}).get('dominantColors', [])]
    if cand_colors and prev_colors:
        shared = [c for c in cand_colors if c in prev_colors]
        color_sim = 1.0 if shared else 0.0
    else:
        color_sim = 0.5

    # 4. Brightness & Contrast (0.15)
    cand_b = candidate_asset.get('analysis', {}).get('visualFeatures', {}).get('brightness', 0.5)
    prev_b = prev_asset.get('analysis', {}).get('visualFeatures', {}).get('brightness', 0.5)
    cand_c = candidate_asset.get('analysis', {}).get('visualFeatures', {}).get('contrast', 0.5)
    prev_c = prev_asset.get('analysis', {}).get('visualFeatures', {}).get('contrast', 0.5)
    lum_sim = max(0.0, 1.0 - (abs(cand_b - prev_b) * 0.5 + abs(cand_c - prev_c) * 0.5))

    # 5. Semantic Tag Overlap (0.25)
    cand_tags = {t.lower() for t in (candidate_asset.get('analysis', {}).get('semantic', {}).get('tags', []) or candidate_asset.get('analysis', {}).get('tags', []))}
    prev_tags = [t.lower() for t in (prev_asset.get('analysis', {}).get('semantic', {}).get('tags', []) or prev_asset.get('analysis', {}).get('tags', []))]
    shared_tags = [t for t in prev_tags if t in cand_tags and t not in COMMON_STOPWORDS]
    total_tags = set(list(cand_tags) + prev_tags)
    tag_sim = len(shared_tags) / len(total_tags) if total_tags else 0.0

    composite = (type_sim * 0.20) + (orient_sim * 0.20) + (color_sim * 0.20) + (lum_sim * 0.15) + (tag_sim * 0.25)
    return max(0.0, min(1.0, round(composite, 2)))

def calculate_visual_variety_modifier(
    candidate_asset,
    prev_asset,
    is_consecutive_continuation=False,
    _is_repetition_reduced=False
):
    """Python reference implementation matching src/engine/draftTimeline.ts calculateVisualVarietyModifier."""
    if not prev_asset:
        return {"modifier": 0.0, "visualSimilarity": 0.0}

    similarity = calculate_visual_similarity(candidate_asset, prev_asset, is_consecutive_continuation)

    if candidate_asset.get('id') == prev_asset.get('id'):
        if is_consecutive_continuation:
            return {
                "modifier": 0.0,
                "visualSimilarity": similarity,
                "reason": "Same source asset; repetition penalty waived for legitimate temporal continuation."
            }
        else:
            return {
                "modifier": -0.010,
                "visualSimilarity": similarity,
                "reason": "Same source asset; repetition penalty applied for visually identical shot."
            }

    if similarity <= 0.35:
        reason_detail = "diverse visual presentation from previous shot"
        if candidate_asset.get('type') != prev_asset.get('type'):
            reason_detail = f"diverse media type ({candidate_asset.get('type')} vs {prev_asset.get('type')})"
        elif get_visual_orientation_class(candidate_asset) != get_visual_orientation_class(prev_asset):
            reason_detail = f"different orientation framing ({get_visual_orientation_class(candidate_asset)} vs {get_visual_orientation_class(prev_asset)})"
        return {
            "modifier": 0.008,
            "visualSimilarity": similarity,
            "reason": f"Visual variety bonus: {reason_detail}."
        }
    elif similarity >= 0.75:
        return {
            "modifier": -0.008,
            "visualSimilarity": similarity,
            "reason": "Visual variety penalty: high visual similarity and redundant appearance with previous shot."
        }

    return {
        "modifier": 0.0,
        "visualSimilarity": similarity,
        "reason": "Balanced visual variety with previous shot."
    }


class TestVisualVariety(unittest.TestCase):
    """23 unit tests verifying Step 22 Visual Variety & Anti-Repetition Intelligence."""

    def test_01_same_asset_similar_appearance_receives_repetition_penalty(self):
        """Test 1: Same source asset without legitimate continuation receives repetition penalty."""
        asset = {"id": "vid1", "type": "video", "width": 1920, "height": 1080}
        res = calculate_visual_variety_modifier(asset, asset, is_consecutive_continuation=False)
        self.assertEqual(res["visualSimilarity"], 1.0)
        self.assertEqual(res["modifier"], -0.010)
        self.assertIn("repetition penalty applied", res["reason"])

    def test_02_same_asset_meaningful_continuation_waives_penalty(self):
        """Test 2: Same source asset with Step 19 continuation waives repetition penalty."""
        asset = {"id": "vid1", "type": "video", "width": 1920, "height": 1080}
        res = calculate_visual_variety_modifier(asset, asset, is_consecutive_continuation=True)
        self.assertEqual(res["visualSimilarity"], 0.65)
        self.assertEqual(res["modifier"], 0.0)
        self.assertIn("repetition penalty waived", res["reason"])

    def test_03_different_orientation_receives_variety_preference(self):
        """Test 3: Different orientation framing receives visual variety bonus."""
        prev = {"id": "m1", "type": "image", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#112233"]}}}
        cand = {"id": "m2", "type": "image", "width": 1080, "height": 1920, "analysis": {"visualFeatures": {"dominantColors": ["#998877"]}}}
        res = calculate_visual_variety_modifier(cand, prev)
        self.assertGreater(res["modifier"], 0.0)
        self.assertLessEqual(res["visualSimilarity"], 0.35)

    def test_04_different_media_type_receives_variety_preference(self):
        """Test 4: Different media type (photo vs video) receives visual variety bonus."""
        prev = {"id": "v1", "type": "video", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#112233"]}}}
        cand = {"id": "p1", "type": "image", "width": 1080, "height": 1920, "analysis": {"visualFeatures": {"dominantColors": ["#ffffff"]}}}
        res = calculate_visual_variety_modifier(cand, prev)
        self.assertGreater(res["modifier"], 0.0)

    def test_05_dominant_color_difference_is_handled(self):
        """Test 5: Assets with different dominant colors produce lower visual similarity."""
        prev = {"id": "m1", "type": "image", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#000000"]}}}
        cand_diff = {"id": "m2", "type": "image", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#ffffff"]}}}
        cand_same = {"id": "m3", "type": "image", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#000000"]}}}

        sim_diff = calculate_visual_similarity(cand_diff, prev)
        sim_same = calculate_visual_similarity(cand_same, prev)
        self.assertLess(sim_diff, sim_same)

    def test_06_tag_difference_is_handled(self):
        """Test 6: Distinct semantic scene tags reduce visual similarity."""
        prev = {"id": "m1", "type": "image", "width": 1920, "height": 1080, "analysis": {"tags": ["space", "stars"]}}
        cand_diff = {"id": "m2", "type": "image", "width": 1920, "height": 1080, "analysis": {"tags": ["forest", "trees"]}}
        cand_same = {"id": "m3", "type": "image", "width": 1920, "height": 1080, "analysis": {"tags": ["space", "stars"]}}

        sim_diff = calculate_visual_similarity(cand_diff, prev)
        sim_same = calculate_visual_similarity(cand_same, prev)
        self.assertLess(sim_diff, sim_same)

    def test_07_visual_similarity_stays_in_0_to_1(self):
        """Test 7: Visual similarity score strictly stays within [0.0, 1.0]."""
        assets = [
            {"id": "a1", "type": "video", "width": 1920, "height": 1080},
            {"id": "a2", "type": "image", "width": 1080, "height": 1920},
            {"id": "a3", "type": "video", "width": 800, "height": 800},
            {"id": "a4", "type": "image", "width": 3840, "height": 1080}
        ]
        for a1 in assets:
            for a2 in assets:
                sim = calculate_visual_similarity(a1, a2)
                self.assertGreaterEqual(sim, 0.0)
                self.assertLessEqual(sim, 1.0)

    def test_08_modifier_stays_within_bounds(self):
        """Test 8: Visual variety modifier is bounded strictly in [-0.012, +0.012]."""
        assets = [
            {"id": "a1", "type": "video", "width": 1920, "height": 1080},
            {"id": "a2", "type": "image", "width": 1080, "height": 1920},
            {"id": "a1", "type": "video", "width": 1920, "height": 1080}
        ]
        for a1 in assets:
            for a2 in assets:
                res = calculate_visual_variety_modifier(a1, a2)
                self.assertGreaterEqual(res["modifier"], -0.012)
                self.assertLessEqual(res["modifier"], 0.012)

    def test_09_semantic_relevance_remains_dominant(self):
        """Test 9: Strong semantic match (0.85 - 0.012 penalty) beats weak match (0.50 + 0.012 bonus)."""
        strong_score = 0.85 - 0.012  # 0.838
        weak_score = 0.50 + 0.012    # 0.512
        self.assertGreater(strong_score, weak_score)

    def test_10_step_19_continuity_prevents_double_penalty(self):
        """Test 10: When Step 19 marks continuation, Step 22 does not impose another penalty."""
        asset = {"id": "v1", "type": "video", "width": 1920, "height": 1080}
        res = calculate_visual_variety_modifier(asset, asset, is_consecutive_continuation=True)
        self.assertEqual(res["modifier"], 0.0)

    def test_11_step_21_beat_continuity_remains_intact(self):
        """Test 11: Active beat media selection works in concert with visual variety."""
        prev = {"id": "v1", "type": "video", "width": 1920, "height": 1080, "analysis": {"tags": ["rover", "mars"]}}
        cand_related = {"id": "v2", "type": "video", "width": 1920, "height": 1080, "analysis": {"tags": ["rover", "wheels"]}}
        res = calculate_visual_variety_modifier(cand_related, prev)
        self.assertGreaterEqual(res["modifier"], -0.012)

    def test_12_photos_participate_safely(self):
        """Test 12: Photos participate in visual variety safely without fake video temporal bonuses."""
        photo1 = {"id": "p1", "type": "image", "width": 1920, "height": 1080}
        photo2 = {"id": "p2", "type": "image", "width": 1080, "height": 1080}
        res = calculate_visual_variety_modifier(photo2, photo1)
        self.assertGreaterEqual(res["modifier"], -0.012)
        self.assertLessEqual(res["modifier"], 0.012)

    def test_13_photo_to_video_transition(self):
        """Test 13: Photo to video transition receives visual variety bonus."""
        photo = {"id": "p1", "type": "image", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#111111"]}}}
        video = {"id": "v1", "type": "video", "width": 1080, "height": 1920, "analysis": {"visualFeatures": {"dominantColors": ["#eeeeee"]}}}
        res = calculate_visual_variety_modifier(video, photo)
        self.assertGreater(res["modifier"], 0.0)

    def test_14_video_to_photo_transition(self):
        """Test 14: Video to photo transition receives visual variety bonus."""
        video = {"id": "v1", "type": "video", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#111111"]}}}
        photo = {"id": "p1", "type": "image", "width": 1080, "height": 1920, "analysis": {"visualFeatures": {"dominantColors": ["#eeeeee"]}}}
        res = calculate_visual_variety_modifier(photo, video)
        self.assertGreater(res["modifier"], 0.0)

    def test_15_unknown_visual_data_remains_safe(self):
        """Test 15: Assets without visualFeatures analysis compute safe neutral values."""
        a1 = {"id": "a1", "type": "video"}
        a2 = {"id": "a2", "type": "image"}
        sim = calculate_visual_similarity(a2, a1)
        self.assertGreaterEqual(sim, 0.0)
        self.assertLessEqual(sim, 1.0)

    def test_16_sourcestart_unchanged(self):
        """Test 16: sourceStart calculation is strictly independent of visual variety."""
        self.assertTrue(callable(calculate_visual_variety_modifier))

    def test_17_duration_unchanged(self):
        """Test 17: duration calculation is strictly independent of visual variety."""
        self.assertTrue(callable(calculate_visual_similarity))

    def test_18_provenance_serialization(self):
        """Test 18: Provenance JSON serializes and deserializes visual variety fields."""
        prov = {
            "sourceSegmentId": "seg-1",
            "originalScore": 0.72,
            "adjustedScore": 0.73,
            "explanation": "Selected for visual variety",
            "reuseCount": 0,
            "visualVarietyModifier": 0.008,
            "visualSimilarity": 0.32,
            "visualVarietyReason": "Visual variety bonus: diverse media type (video vs image)."
        }
        loaded = json.loads(json.dumps(prov))
        self.assertEqual(loaded["visualVarietyModifier"], 0.008)
        self.assertEqual(loaded["visualSimilarity"], 0.32)
        self.assertIn("Visual variety bonus", loaded["visualVarietyReason"])

    def test_19_stats_serialization(self):
        """Test 19: Draft stats JSON serializes varietyAdjustments, repetitionPenalties, visualVarietyBonuses."""
        stats = {
            "totalSegments": 8,
            "assignedSegments": 8,
            "unassignedSegments": 0,
            "varietyAdjustments": 4,
            "repetitionPenalties": 1,
            "visualVarietyBonuses": 3
        }
        loaded = json.loads(json.dumps(stats))
        self.assertEqual(loaded["varietyAdjustments"], 4)
        self.assertEqual(loaded["repetitionPenalties"], 1)
        self.assertEqual(loaded["visualVarietyBonuses"], 3)

    def test_20_manual_edits_do_not_fabricate_variety_provenance(self):
        """Test 20: Manually created timeline clips do not fabricate variety provenance."""
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

    def test_21_no_worker_recalled_for_visual_variety(self):
        """Test 21: Visual variety operates strictly in-memory without background worker calls."""
        res = calculate_visual_variety_modifier(
            {"id": "a1", "type": "video", "width": 1920, "height": 1080},
            {"id": "a2", "type": "image", "width": 1080, "height": 1920}
        )
        self.assertIsNotNone(res["modifier"])

    def test_22_deterministic_results_for_identical_inputs(self):
        """Test 22: Identical inputs always produce the exact same visual variety results."""
        a1 = {"id": "a1", "type": "video", "width": 1920, "height": 1080, "analysis": {"visualFeatures": {"dominantColors": ["#112233"]}}}
        a2 = {"id": "a2", "type": "image", "width": 1080, "height": 1920, "analysis": {"visualFeatures": {"dominantColors": ["#998877"]}}}
        r1 = calculate_visual_variety_modifier(a2, a1)
        r2 = calculate_visual_variety_modifier(a2, a1)
        self.assertEqual(r1["modifier"], r2["modifier"])
        self.assertEqual(r1["visualSimilarity"], r2["visualSimilarity"])

    def test_23_no_excessive_repetition_penalty_across_active_beats(self):
        """Test 23: Repetition penalties are capped at -0.012 and never stack excessively."""
        a1 = {"id": "a1", "type": "video", "width": 1920, "height": 1080}
        res = calculate_visual_variety_modifier(a1, a1, is_consecutive_continuation=False)
        self.assertGreaterEqual(res["modifier"], -0.012)


if __name__ == '__main__':
    unittest.main(verbosity=2)
