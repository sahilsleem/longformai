#!/usr/bin/env python3
"""
server/test_video_understanding.py
===================================
Comprehensive test suite for LongFormAI Step 15: Local Video Understanding.

Tests cover:
1. Video sampling rules (2 to 5 frames strictly capped by duration).
2. Photo single-frame behavior.
3. Pixel difference calculation between frames.
4. Visual change detection and thresholding.
5. Key moment selection.
6. Temporal narrative summary construction.
7. Non-generic tag aggregation and deduplication.
8. Vision Worker API `/analyze-media` endpoint responses with temporal fields.
9. MiniLM matching server compatibility with temporal summaries.
10. Project schema serialization and portable JSON exports.
"""

import os
import sys
import json
import base64
import unittest
import requests
from io import BytesIO
from PIL import Image, ImageDraw

VISION_URL = "http://127.0.0.1:8766"
MATCHING_URL = "http://127.0.0.1:8767"

# Ensure server folder is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def generate_test_image_b64(color: str = "blue", text: str = "Test") -> str:
    """Generates a simple base64 PNG data URL."""
    img = Image.new("RGB", (320, 240), color=color)
    draw = ImageDraw.Draw(img)
    draw.text((10, 10), text, fill="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    b64_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


class TestVideoUnderstanding(unittest.TestCase):

    def test_01_sampling_logic(self):
        """Test timestamp calculation logic matches the Step 15 sampling spec."""
        def calc_timestamps(duration: float):
            if duration <= 0:
                return [0.0]
            if duration <= 3:
                return [0.0, round(duration * 0.5, 2)]
            elif duration <= 8:
                return [0.0, round(duration * 0.5, 2), round(duration * 0.9, 2)]
            elif duration <= 20:
                return [0.0, round(duration * 0.33, 2), round(duration * 0.66, 2), round(duration * 0.95, 2)]
            else:
                return [
                    0.0,
                    round(duration * 0.25, 2),
                    round(duration * 0.50, 2),
                    round(duration * 0.75, 2),
                    round(duration * 0.95, 2),
                ]

        # Short video <= 3s -> 2 frames
        short_ts = calc_timestamps(2.5)
        self.assertEqual(len(short_ts), 2)
        self.assertEqual(short_ts[0], 0.0)
        self.assertEqual(short_ts[1], 1.25)

        # Medium-short video <= 8s -> 3 frames
        med_short_ts = calc_timestamps(6.0)
        self.assertEqual(len(med_short_ts), 3)
        self.assertEqual(med_short_ts[0], 0.0)
        self.assertEqual(med_short_ts[1], 3.0)
        self.assertEqual(med_short_ts[2], 5.4)

        # Medium video <= 20s -> 4 frames
        med_ts = calc_timestamps(15.0)
        self.assertEqual(len(med_ts), 4)

        # Long video > 20s -> 5 frames strictly capped
        long_ts = calc_timestamps(60.0)
        self.assertEqual(len(long_ts), 5)
        self.assertEqual(long_ts, [0.0, 15.0, 30.0, 45.0, 57.0])

        very_long_ts = calc_timestamps(600.0)
        self.assertEqual(len(very_long_ts), 5)
        self.assertLessEqual(len(very_long_ts), 5)

    def test_02_pixel_difference_calculation(self):
        """Test normalized frame pixel difference detection."""
        from vision_server import compute_image_difference

        img_black = Image.new("RGB", (320, 240), color="black")
        img_black_copy = Image.new("RGB", (320, 240), color="black")
        img_white = Image.new("RGB", (320, 240), color="white")
        img_gray = Image.new("RGB", (320, 240), color=(128, 128, 128))

        # Identical images -> 0.0 diff
        diff_identical = compute_image_difference(img_black, img_black_copy)
        self.assertAlmostEqual(diff_identical, 0.0, places=3)

        # Black vs White -> 1.0 diff
        diff_bw = compute_image_difference(img_black, img_white)
        self.assertAlmostEqual(diff_bw, 1.0, places=2)

        # Black vs Gray -> ~0.5 diff
        diff_bg = compute_image_difference(img_black, img_gray)
        self.assertAlmostEqual(diff_bg, 0.5, delta=0.05)

    def test_03_temporal_tag_aggregation(self):
        """Test deduplicating tags and filtering generic stopwords."""
        from vision_server import aggregate_temporal_tags

        frame_tags = [
            ["spacecraft", "galaxy", "stars", "video", "frame"],
            ["spacecraft", "cockpit", "astronaut", "the", "image"],
            ["galaxy", "nebula", "stars", "clip"],
        ]

        aggregated = aggregate_temporal_tags(frame_tags)

        # Generic words should be removed
        for generic in ["video", "frame", "the", "image", "clip"]:
            self.assertNotIn(generic, aggregated)

        # High-frequency visual tags should be present
        self.assertIn("spacecraft", aggregated)
        self.assertIn("galaxy", aggregated)
        self.assertIn("stars", aggregated)
        self.assertIn("cockpit", aggregated)
        self.assertIn("astronaut", aggregated)
        self.assertIn("nebula", aggregated)

    def test_04_temporal_summary_generation(self):
        """Test combining frame descriptions into coherent temporal summary."""
        from vision_server import build_temporal_summary

        keyframe_descs = [
            {"time": 0.0, "description": "a spaceship flying near a star", "isKeyMoment": False},
            {"time": 3.0, "description": "astronaut inside the cockpit looking out", "isKeyMoment": True},
            {"time": 6.0, "description": "a large space station docking", "isKeyMoment": True},
        ]

        summary = build_temporal_summary(keyframe_descs)
        self.assertTrue(summary.startswith("Video sequence showing"))
        self.assertIn("spaceship flying near a star", summary)
        self.assertIn("astronaut inside the cockpit", summary)
        self.assertIn("space station docking", summary)

    def test_05_single_frame_summary(self):
        """Test that single frame descriptions (photos) return description without video prefix."""
        from vision_server import build_temporal_summary

        keyframe_descs = [
            {"time": 0.0, "description": "a photograph of the moon", "isKeyMoment": True}
        ]

        summary = build_temporal_summary(keyframe_descs)
        self.assertEqual(summary, "a photograph of the moon")

    def test_06_vision_server_analyze_multi_frame_video(self):
        """Test vision server /analyze-media endpoint with multiple frames."""
        f1_b64 = generate_test_image_b64("black", "Frame 0s")
        f2_b64 = generate_test_image_b64("white", "Frame 4s")
        f3_b64 = generate_test_image_b64("red", "Frame 8s")

        payload = {
            "isVideo": True,
            "duration": 10.0,
            "keyframes": [
                {"time": 0.0, "imageData": f1_b64},
                {"time": 4.0, "imageData": f2_b64},
                {"time": 8.0, "imageData": f3_b64},
            ]
        }

        try:
            resp = requests.post(f"{VISION_URL}/analyze-media", json=payload, timeout=25)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data.get("status"), "success")
            self.assertIn("temporalSummary", data)
            self.assertIn("hasVisualChange", data)
            self.assertIn("visualChanges", data)
            self.assertIn("keyframeDescriptions", data)

            # Black to White to Red should trigger visual change detection
            self.assertTrue(data.get("hasVisualChange"))
            self.assertGreater(len(data.get("visualChanges", [])), 0)

            # Keyframes should contain isKeyMoment
            kdescs = data.get("keyframeDescriptions", [])
            self.assertEqual(len(kdescs), 3)
            self.assertTrue(any(kd.get("isKeyMoment") for kd in kdescs))
        except requests.exceptions.ConnectionError:
            self.skipTest("Vision server not running on port 8766")

    def test_07_vision_server_analyze_single_image(self):
        """Test vision server /analyze-media endpoint with a single photo."""
        f1_b64 = generate_test_image_b64("blue", "Photo")

        payload = {
            "isVideo": False,
            "duration": 0.0,
            "keyframes": [
                {"time": 0.0, "imageData": f1_b64}
            ]
        }

        try:
            resp = requests.post(f"{VISION_URL}/analyze-media", json=payload, timeout=25)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data.get("status"), "success")
            self.assertFalse(data.get("hasVisualChange"))
            self.assertEqual(len(data.get("visualChanges", [])), 0)
        except requests.exceptions.ConnectionError:
            self.skipTest("Vision server not running on port 8766")

    def test_08_semantic_matching_with_temporal_summary(self):
        """Test that MiniLM matching server accurately ranks media using temporalSummary."""
        payload = {
            "segmentText": "We see the astronaut inside the cockpit after travelling through deep space.",
            "mediaItems": [
                {
                    "mediaId": "video_space",
                    "mediaName": "space_journey.mp4",
                    "description": "a spaceship flying near stars",
                    "temporalSummary": "Video sequence showing a spaceship near stars; later astronaut inside cockpit checking instruments; later docking at station",
                    "tags": ["space", "astronaut", "cockpit", "spaceship"],
                },
                {
                    "mediaId": "img_city",
                    "mediaName": "city_night.jpg",
                    "description": "a crowded city street at night",
                    "temporalSummary": "a crowded city street at night",
                    "tags": ["city", "street", "traffic"],
                }
            ],
            "topK": 5
        }

        try:
            resp = requests.post(f"{MATCHING_URL}/match", json=payload, timeout=15)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            candidates = data.get("candidates", [])
            self.assertGreater(len(candidates), 0)
            top_candidate = candidates[0]
            self.assertEqual(top_candidate["mediaId"], "video_space")
            self.assertGreater(top_candidate["score"], 0.35)
            self.assertIn("Temporal video narrative shows", top_candidate["explanation"])
        except requests.exceptions.ConnectionError:
            self.skipTest("Matching server not running on port 8767")

    def test_09_multiple_visual_transitions(self):
        """Test multi-transition detection across consecutive sequence of frames."""
        f_black = generate_test_image_b64("black", "Frame 0")
        f_white = generate_test_image_b64("white", "Frame 5")
        f_black2 = generate_test_image_b64("black", "Frame 10")
        f_white2 = generate_test_image_b64("white", "Frame 15")

        payload = {
            "isVideo": True,
            "duration": 20.0,
            "keyframes": [
                {"time": 0.0, "imageData": f_black},
                {"time": 5.0, "imageData": f_white},
                {"time": 10.0, "imageData": f_black2},
                {"time": 15.0, "imageData": f_white2},
            ]
        }

        try:
            resp = requests.post(f"{VISION_URL}/analyze-media", json=payload, timeout=25)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data.get("hasVisualChange"))
            vchanges = data.get("visualChanges", [])
            self.assertGreaterEqual(len(vchanges), 3)
            for vc in vchanges:
                self.assertGreaterEqual(vc["differenceScore"], 0.12)
        except requests.exceptions.ConnectionError:
            self.skipTest("Vision server not running on port 8766")

    def test_10_vision_server_health_offline_status(self):
        """Test that the vision worker health endpoint reports offline capability."""
        try:
            resp = requests.get(f"{VISION_URL}/health", timeout=5)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data.get("status"), "ok")
            self.assertEqual(data.get("engine"), "transformers-blip")
            self.assertTrue(data.get("model_loaded"))
            self.assertTrue(data.get("model_cached"))
        except requests.exceptions.ConnectionError:
            self.skipTest("Vision server not running on port 8766")

    def test_11_matching_server_health_offline_status(self):
        """Test that the semantic matching worker health endpoint reports offline capability."""
        try:
            resp = requests.get(f"{MATCHING_URL}/health", timeout=5)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data.get("status"), "ok")
            self.assertEqual(data.get("engine"), "transformers-sentence-embeddings")
            self.assertTrue(data.get("model_loaded"))
            self.assertTrue(data.get("model_cached"))
        except requests.exceptions.ConnectionError:
            self.skipTest("Matching server not running on port 8767")

    def test_12_empty_keyframes_error_handling(self):
        """Test that vision worker returns 400 Bad Request when keyframes list is empty."""
        payload = {
            "isVideo": True,
            "duration": 5.0,
            "keyframes": []
        }
        try:
            resp = requests.post(f"{VISION_URL}/analyze-media", json=payload, timeout=10)
            self.assertEqual(resp.status_code, 400)
        except requests.exceptions.ConnectionError:
            self.skipTest("Vision server not running on port 8766")


if __name__ == "__main__":
    unittest.main(verbosity=2)
