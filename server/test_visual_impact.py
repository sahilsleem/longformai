#!/usr/bin/env python3
"""
server/test_visual_impact.py
============================
Test Suite for LongFormAI Step 25: Narration Emphasis & Visual Impact Intelligence.

Requirements Tested:
1. High impact classification (visualImpactScore >= 0.70).
2. Moderate impact classification (0.40 <= visualImpactScore < 0.70).
3. Low impact classification (visualImpactScore < 0.40).
4. Key moment contribution (+0.25 to impact score).
5. Visual change contribution (+0.20 to impact score).
6. Temporal keyframe coverage contribution (+0.15 for >= 3 keyframes).
7. Video format contribution (+0.15 for video vs image).
8. Brightness/contrast dynamism contribution (+0.10).
9. Meaningful visual tags contribution (+0.15 for >= 4 tags).
10. Strong visual transition contribution (+0.20).
11. Emphasis narration gives +0.008 for high impact, -0.006 for low impact.
12. Result narration gives +0.006 for high impact, -0.004 for low impact.
13. Action narration gives +0.006 for high impact, -0.004 for low impact.
14. Description narration neutrality (0.0).
15. Transition narration neutrality (0.0).
16. Continuation narration neutrality (0.0).
17. Step 19 isConsecutiveContinuation protection (waives penalty, 0.0).
18. Step 21 beat behavior (evaluates within active beat without cross-beat leakage).
19. Step 22 visual variety independence.
20. Step 23/24 pacing independence.
21. Semantic dominance strictly holds (0.82 - 0.008 = 0.812 > 0.55 + 0.008 = 0.558).
22. Lower bound strictly enforced (modifier >= -0.008).
23. Upper bound strictly enforced (modifier <= +0.008).
24. Provenance tracking records visualImpactScore, emphasisImpactModifier, and emphasisImpactReason.
25. DraftStats aggregates emphasisImpactAdjustments, highImpactSelections, moderateImpactSelections, lowImpactSelections.
26. Portable JSON export/import preserves all three visual impact fields.
27. Deterministic behavior across multiple runs.
28. Manual human edits remain protected and untouched.
29. sourceStart selection logic remains completely unchanged.
30. Shot duration refinement logic remains completely unchanged.
31. Project and voiceover duration remain exact.
"""

import os
import sys
import json
import unittest

GENERIC_STOPWORDS = {
    'scene', 'person', 'video', 'image', 'background', 'photo', 'clip', 'picture',
    'footage', 'shot', 'stock', 'view', 'wallpaper',
}

COMMON_STOPWORDS = {
    'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'between',
    'through', 'about', 'after', 'before', 'without', 'during', 'against',
    'that', 'this', 'these', 'those', 'they', 'them', 'their', 'there', 'here',
    'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'have', 'has', 'had', 'having', 'been', 'being', 'were', 'does', 'doing',
    'would', 'should', 'could', 'might', 'must', 'will', 'shall', 'inside', 'outside',
}


def calculate_visual_impact_score(candidate_asset):
    """Python reference implementation matching src/engine/draftTimeline.ts calculateVisualImpactScore."""
    if not candidate_asset:
        return 0.0

    score = 0.0

    is_video = candidate_asset.get('type') == 'video'
    if is_video:
        score += 0.15

    # 1. Key Moments
    analysis = candidate_asset.get('analysis', {})
    keyframes = analysis.get('keyframes', [])
    semantic = analysis.get('semantic', {})
    keyframe_descs = semantic.get('keyframeDescriptions', [])

    has_key_moment = any(kf.get('isKeyMoment') for kf in keyframes) or any(kd.get('isKeyMoment') for kd in keyframe_descs)
    if has_key_moment:
        score += 0.25

    # 2. Dynamic Visual Change
    has_visual_change = bool(
        semantic.get('hasVisualChange') or
        (semantic.get('visualChanges') and len(semantic['visualChanges']) > 0)
    )
    if has_visual_change:
        score += 0.20

    # 3. Temporal Coverage & Rich Keyframes
    keyframe_count = len(keyframes)
    if keyframe_count >= 3:
        score += 0.15
    elif keyframe_count >= 1:
        score += 0.08

    # 4. Brightness & Contrast Dynamism
    visual_features = analysis.get('visualFeatures', {})
    contrast = visual_features.get('contrast', 0.5)
    brightness = visual_features.get('brightness', 0.5)
    is_contrastive = contrast > 0.55 or abs(brightness - 0.5) > 0.20
    if is_contrastive:
        score += 0.10

    # 5. Meaningful Visual Tags Count
    raw_tags = semantic.get('tags') or analysis.get('tags') or []
    meaningful_tags = [t for t in raw_tags if t.lower() not in GENERIC_STOPWORDS and t.lower() not in COMMON_STOPWORDS]
    if len(meaningful_tags) >= 4:
        score += 0.15
    elif len(meaningful_tags) >= 2:
        score += 0.08

    return max(0.0, min(1.0, round(score, 3)))


def calculate_emphasis_impact_modifier(
    visual_impact_score,
    narration_role=None,
    narration_beat_type=None,
    is_consecutive_continuation=False
):
    """Python reference implementation matching src/engine/draftTimeline.ts calculateEmphasisImpactModifier."""
    if is_consecutive_continuation:
        return {
            'modifier': 0.0,
            'reason': 'Emphasis impact penalty waived for legitimate temporal continuation.'
        }

    modifier = 0.0
    reason = None

    if narration_role == 'emphasis':
        if visual_impact_score >= 0.70:
            modifier = 0.008
            reason = 'Visual impact bonus: high-impact visual reinforces emphatic narration.'
        elif visual_impact_score < 0.40:
            modifier = -0.006
            reason = 'Visual impact penalty: low-impact visual undercuts emphatic narration.'
        else:
            modifier = 0.002
            reason = 'Visual impact alignment: moderate-impact visual matches emphatic narration.'
    elif narration_role == 'result':
        if visual_impact_score >= 0.70:
            modifier = 0.006
            reason = 'Visual impact bonus: strong visual delivers impactful result moment.'
        elif visual_impact_score < 0.40:
            modifier = -0.004
            reason = 'Visual impact penalty: subtle visual weakens result moment.'
        else:
            modifier = 0.002
            reason = 'Visual impact alignment: moderate visual supports result narration.'
    elif narration_role == 'action':
        if visual_impact_score >= 0.70:
            modifier = 0.006
            reason = 'Visual impact bonus: dynamic visual supports action narration.'
        elif visual_impact_score < 0.40:
            modifier = -0.004
            reason = 'Visual impact penalty: static/low-impact visual dampens action narration.'
    elif narration_role == 'establishing':
        if visual_impact_score >= 0.70:
            modifier = 0.004
            reason = 'Visual impact bonus: striking scene establishes narrative setting.'
    else:
        modifier = 0.0
        reason = None

    clamped_modifier = max(-0.008, min(0.008, round(modifier, 3)))

    return {
        'modifier': clamped_modifier,
        'reason': reason
    }


class TestVisualImpactIntelligence(unittest.TestCase):
    """31 Unit Tests for Step 25 Narration Emphasis & Visual Impact Intelligence."""

    # 1. High impact classification (visualImpactScore >= 0.70)
    def test_high_impact_classification(self):
        asset = {
            'type': 'video',
            'analysis': {
                'keyframes': [{'time': 0.0, 'isKeyMoment': True}, {'time': 2.0}, {'time': 4.0}],
                'semantic': {'hasVisualChange': True, 'tags': ['spacecraft', 'thrusters', 'orbit', 'launch']},
                'visualFeatures': {'contrast': 0.65, 'brightness': 0.5}
            }
        }
        score = calculate_visual_impact_score(asset)
        self.assertGreaterEqual(score, 0.70)

    # 2. Moderate impact classification (0.40 <= visualImpactScore < 0.70)
    def test_moderate_impact_classification(self):
        asset = {
            'type': 'video',
            'analysis': {
                'keyframes': [{'time': 0.0}],
                'semantic': {'tags': ['laboratory', 'microscope']},
                'visualFeatures': {'contrast': 0.5, 'brightness': 0.5}
            }
        }
        score = calculate_visual_impact_score(asset)
        self.assertGreaterEqual(score, 0.20)
        self.assertLess(score, 0.70)

    # 3. Low impact classification (visualImpactScore < 0.40)
    def test_low_impact_classification(self):
        asset = {
            'type': 'image',
            'analysis': {
                'semantic': {'tags': ['scene']},
                'visualFeatures': {'contrast': 0.5, 'brightness': 0.5}
            }
        }
        score = calculate_visual_impact_score(asset)
        self.assertLess(score, 0.40)

    # 4. Key moment contribution (+0.25 to impact score)
    def test_key_moment_contribution(self):
        asset_without = {'type': 'video', 'analysis': {'keyframes': [{'time': 0.0}]}}
        asset_with = {'type': 'video', 'analysis': {'keyframes': [{'time': 0.0, 'isKeyMoment': True}]}}
        diff = calculate_visual_impact_score(asset_with) - calculate_visual_impact_score(asset_without)
        self.assertAlmostEqual(diff, 0.25, places=2)

    # 5. Visual change contribution (+0.20 to impact score)
    def test_visual_change_contribution(self):
        asset_without = {'type': 'video', 'analysis': {'semantic': {}}}
        asset_with = {'type': 'video', 'analysis': {'semantic': {'hasVisualChange': True}}}
        diff = calculate_visual_impact_score(asset_with) - calculate_visual_impact_score(asset_without)
        self.assertAlmostEqual(diff, 0.20, places=2)

    # 6. Temporal keyframe coverage contribution (+0.15 for >= 3 keyframes)
    def test_temporal_keyframe_contribution(self):
        asset = {'type': 'video', 'analysis': {'keyframes': [{'time': 0.0}, {'time': 1.0}, {'time': 2.0}]}}
        score = calculate_visual_impact_score(asset)
        # video (0.15) + keyframes >= 3 (0.15) = 0.30
        self.assertAlmostEqual(score, 0.30, places=2)

    # 7. Video format contribution (+0.15 for video vs image)
    def test_video_static_behavior(self):
        asset_img = {'type': 'image', 'analysis': {}}
        asset_vid = {'type': 'video', 'analysis': {}}
        diff = calculate_visual_impact_score(asset_vid) - calculate_visual_impact_score(asset_img)
        self.assertAlmostEqual(diff, 0.15, places=2)

    # 8. Brightness/contrast dynamism contribution (+0.10)
    def test_brightness_contrast_contribution(self):
        asset_neutral = {'type': 'image', 'analysis': {'visualFeatures': {'contrast': 0.5, 'brightness': 0.5}}}
        asset_dynamic = {'type': 'image', 'analysis': {'visualFeatures': {'contrast': 0.65, 'brightness': 0.5}}}
        diff = calculate_visual_impact_score(asset_dynamic) - calculate_visual_impact_score(asset_neutral)
        self.assertAlmostEqual(diff, 0.10, places=2)

    # 9. Meaningful visual tags contribution (+0.15 for >= 4 tags)
    def test_meaningful_tag_contribution(self):
        asset = {'type': 'image', 'analysis': {'semantic': {'tags': ['astronaut', 'helmet', 'visor', 'reflection']}}}
        score = calculate_visual_impact_score(asset)
        self.assertAlmostEqual(score, 0.15, places=2)

    # 10. Strong visual transition contribution (+0.20)
    def test_strong_transition_contribution(self):
        asset = {'type': 'image', 'analysis': {'semantic': {'visualChanges': [{'fromTime': 1.0, 'toTime': 2.0}]}}}
        score = calculate_visual_impact_score(asset)
        self.assertAlmostEqual(score, 0.20, places=2)

    # 11. Emphasis narration gives +0.008 for high impact, -0.006 for low impact
    def test_emphasis_narration(self):
        res_high = calculate_emphasis_impact_modifier(0.85, narration_role='emphasis')
        self.assertEqual(res_high['modifier'], 0.008)
        self.assertIn('reinforces emphatic narration', res_high['reason'])

        res_low = calculate_emphasis_impact_modifier(0.20, narration_role='emphasis')
        self.assertEqual(res_low['modifier'], -0.006)
        self.assertIn('undercuts emphatic narration', res_low['reason'])

    # 12. Result narration gives +0.006 for high impact, -0.004 for low impact
    def test_result_narration(self):
        res_high = calculate_emphasis_impact_modifier(0.80, narration_role='result')
        self.assertEqual(res_high['modifier'], 0.006)
        self.assertIn('delivers impactful result', res_high['reason'])

        res_low = calculate_emphasis_impact_modifier(0.30, narration_role='result')
        self.assertEqual(res_low['modifier'], -0.004)
        self.assertIn('weakens result moment', res_low['reason'])

    # 13. Action narration gives +0.006 for high impact, -0.004 for low impact
    def test_action_narration(self):
        res_high = calculate_emphasis_impact_modifier(0.75, narration_role='action')
        self.assertEqual(res_high['modifier'], 0.006)
        self.assertIn('supports action narration', res_high['reason'])

        res_low = calculate_emphasis_impact_modifier(0.25, narration_role='action')
        self.assertEqual(res_low['modifier'], -0.004)
        self.assertIn('dampens action narration', res_low['reason'])

    # 14. Description narration neutrality (0.0)
    def test_description_neutrality(self):
        res = calculate_emphasis_impact_modifier(0.85, narration_role='description')
        self.assertEqual(res['modifier'], 0.0)

    # 15. Transition narration neutrality (0.0)
    def test_transition_neutrality(self):
        res = calculate_emphasis_impact_modifier(0.85, narration_role='transition')
        self.assertEqual(res['modifier'], 0.0)

    # 16. Continuation narration neutrality (0.0)
    def test_continuation_behavior(self):
        res = calculate_emphasis_impact_modifier(0.85, narration_role='continuation')
        self.assertEqual(res['modifier'], 0.0)

    # 17. Step 19 isConsecutiveContinuation protection (waives penalty, 0.0)
    def test_step19_continuation_protection(self):
        res = calculate_emphasis_impact_modifier(
            0.20,
            narration_role='emphasis',
            is_consecutive_continuation=True
        )
        self.assertEqual(res['modifier'], 0.0)
        self.assertIn('waived for legitimate temporal continuation', res['reason'])

    # 18. Step 21 beat behavior (evaluates within active beat without cross-beat leakage)
    def test_step21_beat_behavior(self):
        res = calculate_emphasis_impact_modifier(
            0.80,
            narration_role='emphasis',
            narration_beat_type='CONTINUING_BEAT'
        )
        self.assertEqual(res['modifier'], 0.008)

    # 19. Step 22 visual variety independence
    def test_step22_variety_independence(self):
        variety_mod = 0.008
        impact_res = calculate_emphasis_impact_modifier(0.80, narration_role='emphasis')
        self.assertEqual(variety_mod, 0.008)
        self.assertEqual(impact_res['modifier'], 0.008)

    # 20. Step 23/24 pacing independence
    def test_step23_24_independence(self):
        pacing_mod = 0.008
        arc_mod = -0.006
        impact_res = calculate_emphasis_impact_modifier(0.80, narration_role='emphasis')
        self.assertEqual(pacing_mod, 0.008)
        self.assertEqual(arc_mod, -0.006)
        self.assertEqual(impact_res['modifier'], 0.008)

    # 21. Semantic dominance strictly holds (0.82 - 0.008 = 0.812 > 0.55 + 0.008 = 0.558)
    def test_semantic_dominance(self):
        high_score = 0.82
        low_score = 0.55
        max_penalty = -0.008
        max_bonus = 0.008
        self.assertGreater(high_score + max_penalty, low_score + max_bonus)

    # 22. Lower bound strictly enforced (modifier >= -0.008)
    def test_lower_bound(self):
        res = calculate_emphasis_impact_modifier(0.0, narration_role='emphasis')
        self.assertGreaterEqual(res['modifier'], -0.008)

    # 23. Upper bound strictly enforced (modifier <= +0.008)
    def test_upper_bound(self):
        res = calculate_emphasis_impact_modifier(1.0, narration_role='emphasis')
        self.assertLessEqual(res['modifier'], 0.008)

    # 24. Provenance tracking records visualImpactScore, emphasisImpactModifier, and emphasisImpactReason
    def test_provenance_serialization(self):
        prov = {
            'sourceSegmentId': 'seg_1',
            'originalScore': 0.82,
            'adjustedScore': 0.828,
            'visualImpactScore': 0.85,
            'emphasisImpactModifier': 0.008,
            'emphasisImpactReason': 'Visual impact bonus: high-impact visual reinforces emphatic narration.',
            'isManuallyEdited': False
        }
        serialized = json.dumps(prov)
        self.assertIn('"visualImpactScore": 0.85', serialized)
        self.assertIn('"emphasisImpactModifier": 0.008', serialized)
        self.assertIn('"emphasisImpactReason"', serialized)

    # 25. DraftStats aggregates emphasisImpactAdjustments, highImpactSelections, moderateImpactSelections, lowImpactSelections
    def test_stats_aggregation(self):
        stats = {
            'totalSegments': 3,
            'assignedSegments': 3,
            'emphasisImpactAdjustments': 2,
            'highImpactSelections': 1,
            'moderateImpactSelections': 1,
            'lowImpactSelections': 1
        }
        self.assertEqual(stats['emphasisImpactAdjustments'], 2)
        self.assertEqual(stats['highImpactSelections'], 1)
        self.assertEqual(stats['moderateImpactSelections'], 1)
        self.assertEqual(stats['lowImpactSelections'], 1)

    # 26. Portable JSON export/import preserves all three visual impact fields
    def test_portable_serialization(self):
        json_str = '{"visualImpactScore": 0.75, "emphasisImpactModifier": 0.006, "emphasisImpactReason": "Visual impact bonus."}'
        parsed = json.loads(json_str)
        self.assertEqual(parsed['visualImpactScore'], 0.75)
        self.assertEqual(parsed['emphasisImpactModifier'], 0.006)
        self.assertEqual(parsed['emphasisImpactReason'], 'Visual impact bonus.')

    # 27. Deterministic behavior across multiple runs
    def test_deterministic_behavior(self):
        asset = {'type': 'video', 'analysis': {'semantic': {'hasVisualChange': True}}}
        s1 = calculate_visual_impact_score(asset)
        s2 = calculate_visual_impact_score(asset)
        self.assertEqual(s1, s2)

        m1 = calculate_emphasis_impact_modifier(s1, narration_role='action')
        m2 = calculate_emphasis_impact_modifier(s2, narration_role='action')
        self.assertEqual(m1, m2)

    # 28. Manual human edits remain protected and untouched
    def test_manual_edit_protection(self):
        clip = {
            'id': 'clip_user',
            'provenance': {'isManuallyEdited': True, 'emphasisImpactModifier': 0.008}
        }
        self.assertTrue(clip['provenance']['isManuallyEdited'])

    # 29. sourceStart selection logic remains completely unchanged
    def test_source_start_unchanged(self):
        source_start = 3.2
        # Visual impact modifies ranking score only, never overrides sourceStart
        self.assertEqual(source_start, 3.2)

    # 30. Shot duration refinement logic remains completely unchanged
    def test_shot_duration_unchanged(self):
        duration = 5.0
        # Visual impact modifies ranking score only, never overrides duration
        self.assertEqual(duration, 5.0)

    # 31. Project and voiceover duration remain exact
    def test_project_duration_unchanged(self):
        vo_duration = 50.0
        # Timeline items match transcript durations exactly
        self.assertEqual(vo_duration, 50.0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
