"""
Tests for Step 52 - Native ONNX BLIP Vision Worker (Stdlib HTTP Server)
Zero third-party test dependencies - pure Python standard library unittest & urllib.
"""

import os
import io
import json
import socket
import threading
import tempfile
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch, MagicMock
from PIL import Image, ImageDraw

from server.vision_server import (
    CONFIG,
    BLIP_ENGINE,
    expand_path,
    resolve_model_dir,
    check_model_files_status,
    WordPieceTokenizer,
    preprocess_image,
    decode_image,
    compute_image_difference,
    extract_tags_from_text,
    aggregate_temporal_tags,
    build_temporal_summary,
    analyze_media_semantics,
    get_health_data,
    create_server,
)


def create_synthetic_test_image(color: str = "blue", text: str = "Test") -> str:
    """Generates a small test image data URL."""
    import base64
    img = Image.new("RGB", (160, 120), color=color)
    draw = ImageDraw.Draw(img)
    draw.text((10, 10), text, fill="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64_str}"


class TestTokenizerAndPreprocessing(unittest.TestCase):
    def test_expand_path(self):
        p = "~/models/blip"
        expanded = expand_path(p)
        self.assertFalse(expanded.startswith("~"))
        self.assertTrue(os.path.isabs(expanded))

    def test_wordpiece_tokenizer_decoding(self):
        tok = WordPieceTokenizer()
        tok.vocab = {
            "[PAD]": 0, "[UNK]": 100, "[CLS]": 101, "[SEP]": 102,
            "a": 1000, "man": 1001, "standing": 1002, "in": 1003,
            "water": 1004, "##fall": 1005, ".": 1006
        }
        tok.inv_vocab = {v: k for k, v in tok.vocab.items()}

        # Token IDs: "a", "man", "standing", "in", "water", "##fall", "."
        tokens = [1000, 1001, 1002, 1003, 1004, 1005, 1006]
        decoded = tok.decode(tokens, skip_special_tokens=True)
        self.assertEqual(decoded, "a man standing in waterfall.")

        # Test special tokens filtered
        tokens_with_special = [101, 1000, 1001, 102, 0]
        decoded_special = tok.decode(tokens_with_special, skip_special_tokens=True)
        self.assertEqual(decoded_special, "a man")

    def test_image_preprocessing_shape_and_range(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("NumPy not available in environment")

        img = Image.new("RGB", (200, 150), color=(100, 150, 200))
        tensor = preprocess_image(img)

        # Must be shape (1, 3, 384, 384) float32
        self.assertEqual(tensor.shape, (1, 3, 384, 384))
        self.assertEqual(tensor.dtype, np.float32)

        # Must not be all zeros or NaN
        self.assertFalse(np.isnan(tensor).any())
        self.assertTrue(np.abs(tensor).max() > 0.1)

    def test_decode_image(self):
        data_url = create_synthetic_test_image("red")
        img = decode_image(data_url)
        self.assertIsInstance(img, Image.Image)
        self.assertEqual(img.mode, "RGB")
        self.assertEqual(img.size, (160, 120))

    def test_compute_image_difference(self):
        img1 = Image.new("RGB", (100, 100), color="black")
        img2 = Image.new("RGB", (100, 100), color="white")
        img3 = Image.new("RGB", (100, 100), color="black")

        diff_identical = compute_image_difference(img1, img3)
        self.assertAlmostEqual(diff_identical, 0.0, places=3)

        diff_bw = compute_image_difference(img1, img2)
        self.assertAlmostEqual(diff_bw, 1.0, places=2)

    def test_extract_tags_and_stopwords(self):
        caption = "A photograph of an astronaut standing on the surface of mars with a spacecraft."
        tags = extract_tags_from_text(caption)
        self.assertIn("astronaut", tags)
        self.assertIn("standing", tags)
        self.assertIn("surface", tags)
        self.assertIn("mars", tags)
        self.assertIn("spacecraft", tags)
        # Stopwords removed
        for sw in ["a", "an", "of", "on", "the", "with", "photograph"]:
            self.assertNotIn(sw, tags)

    def test_temporal_tag_aggregation(self):
        tags_list = [
            ["spacecraft", "galaxy", "video", "frame"],
            ["spacecraft", "cockpit", "astronaut"],
            ["galaxy", "stars", "nebula"]
        ]
        agg = aggregate_temporal_tags(tags_list)
        self.assertNotIn("video", agg)
        self.assertNotIn("frame", agg)
        self.assertIn("spacecraft", agg)
        self.assertIn("galaxy", agg)

    def test_build_temporal_summary(self):
        descs = [
            {"time": 0.0, "description": "a rocket on the launchpad"},
            {"time": 4.0, "description": "rocket launching into the sky"},
            {"time": 8.0, "description": "rocket entering orbit"},
        ]
        summary = build_temporal_summary(descs)
        self.assertTrue(summary.startswith("Video sequence showing"))
        self.assertIn("rocket on the launchpad", summary)
        self.assertIn("rocket launching into the sky", summary)


class TestStdlibVisionEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            cls.port = s.getsockname()[1]

        cls.server = create_server("127.0.0.1", cls.port)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_01_root_test_page(self):
        req = urllib.request.Request(f"{self.base_url}/")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            self.assertIn("text/html", resp.headers.get("Content-Type", ""))
            content = resp.read().decode("utf-8")
            self.assertIn("LongFormAI Vision Worker Test", content)
            self.assertIn("ONNX BLIP", content)

    def test_02_health_endpoint_structure(self):
        req = urllib.request.Request(f"{self.base_url}/health")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["engine"], "onnx-blip")
            self.assertEqual(data["service"], "LongFormAI Local Vision Worker")
            self.assertEqual(data["model"], "Salesforce/blip-image-captioning-base")
            self.assertIn("model_loaded", data)
            self.assertIn("model_cached", data)
            self.assertIn("state", data)
            self.assertIn("device", data)
            self.assertIn("model_dir", data)

    def test_03_options_cors(self):
        req = urllib.request.Request(f"{self.base_url}/analyze-media", method="OPTIONS")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 204)
            self.assertEqual(resp.headers.get("Access-Control-Allow-Origin"), "*")
            self.assertIn("POST", resp.headers.get("Access-Control-Allow-Methods", ""))

    def test_04_analyze_frame_missing_image_data_returns_400(self):
        payload = json.dumps({"time": 0.0}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/analyze-frame",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            urllib.request.urlopen(req)
            self.fail("Expected HTTPError 400")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)
            data = json.loads(e.read().decode("utf-8"))
            self.assertIn("Missing imageData", data["detail"])

    def test_05_analyze_media_empty_keyframes_returns_400(self):
        payload = json.dumps({"isVideo": True, "duration": 5.0, "keyframes": []}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/analyze-media",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            urllib.request.urlopen(req)
            self.fail("Expected HTTPError 400")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)
            data = json.loads(e.read().decode("utf-8"))
            self.assertIn("No keyframes", data["detail"])

    def test_06_mock_engine_analyze_frame_success(self):
        orig_loaded = BLIP_ENGINE.loaded
        orig_generate = BLIP_ENGINE.generate_caption
        try:
            BLIP_ENGINE.loaded = True
            BLIP_ENGINE.generate_caption = MagicMock(return_value="A red car parked on the street.")

            f1 = create_synthetic_test_image("red", "Car")
            payload = json.dumps({"imageData": f1, "time": 1.5}).encode("utf-8")
            req = urllib.request.Request(
                f"{self.base_url}/analyze-frame",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(data["status"], "success")
                self.assertEqual(data["time"], 1.5)
                self.assertEqual(data["description"], "A red car parked on the street.")
                self.assertIn("street", data["tags"])
        finally:
            BLIP_ENGINE.loaded = orig_loaded
            BLIP_ENGINE.generate_caption = orig_generate

    def test_07_mock_engine_analyze_media_multi_frame_success(self):
        orig_loaded = BLIP_ENGINE.loaded
        orig_generate = BLIP_ENGINE.generate_caption
        try:
            BLIP_ENGINE.loaded = True
            BLIP_ENGINE.generate_caption = MagicMock(side_effect=[
                "A blue ocean with waves crashing",
                "A sandy beach with palm trees"
            ])

            f1 = create_synthetic_test_image("blue", "Ocean")
            f2 = create_synthetic_test_image("yellow", "Beach")

            payload = json.dumps({
                "isVideo": True,
                "duration": 6.0,
                "keyframes": [
                    {"time": 0.0, "imageData": f1},
                    {"time": 3.0, "imageData": f2}
                ]
            }).encode("utf-8")

            req = urllib.request.Request(
                f"{self.base_url}/analyze-media",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(data["status"], "success")
                self.assertIn("temporalSummary", data)
                self.assertIn("hasVisualChange", data)
                self.assertIn("visualChanges", data)
                self.assertIn("keyframeDescriptions", data)
                self.assertEqual(len(data["keyframeDescriptions"]), 2)
                self.assertEqual(data["modelUsed"], "Salesforce/blip-image-captioning-base")
        finally:
            BLIP_ENGINE.loaded = orig_loaded
            BLIP_ENGINE.generate_caption = orig_generate

    def test_08_real_onnx_inference_if_model_present(self):
        """Runs genuine ONNX BLIP inference if the model files are present on disk."""
        resolved_dir = resolve_model_dir()
        if not resolved_dir:
            self.skipTest("BLIP ONNX model files not found in local environment (skipped on non-runtime machine)")

        valid, err = check_model_files_status(resolved_dir)
        if not valid:
            self.skipTest(f"BLIP model files incomplete: {err}")

        # Attempt real load
        loaded = BLIP_ENGINE.load(resolved_dir)
        if not loaded:
            self.skipTest(f"Could not load ONNX model sessions: {BLIP_ENGINE.error}")

        f_test = create_synthetic_test_image("green", "RealTest")
        payload = json.dumps({"imageData": f_test, "time": 0.0}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/analyze-frame",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "success")
            self.assertTrue(len(data["description"]) > 0)
            self.assertFalse("[SEP]" in data["description"])
            self.assertFalse("[PAD]" in data["description"])

    def test_09_generate_caption_with_2d_logits_and_1d_mask(self):
        """Specifically verifies that 1D attention mask and 2D logits do NOT raise tuple index out of range."""
        try:
            import numpy as np
        except ImportError:
            self.skipTest("NumPy not installed")

        orig_loaded = BLIP_ENGINE.loaded
        orig_s0 = BLIP_ENGINE.session_0
        orig_s1 = BLIP_ENGINE.session_1
        orig_tok = BLIP_ENGINE.tokenizer

        try:
            BLIP_ENGINE.loaded = True

            # Mock session_0 matching real Android contract:
            # outputs_0[0] = encoder_attention_mask (int64, shape (1,))
            # outputs_0[1] = encoder_hidden_states (float32, shape (1, 577, 768))
            mock_s0 = MagicMock()
            inp_0 = MagicMock()
            inp_0.name = "pixel_values"
            mock_s0.get_inputs.return_value = [inp_0]
            mock_s0.run.return_value = [
                np.array([1], dtype=np.int64),              # outputs_0[0] = attention mask (int64)
                np.zeros((1, 577, 768), dtype=np.float32),  # outputs_0[1] = hidden states (float32)
            ]
            BLIP_ENGINE.session_0 = mock_s0

            # Mock session_1 returning 2D logits (1, 30524)
            mock_s1 = MagicMock()
            inp_ids = MagicMock(); inp_ids.name = "input_ids"; inp_ids.shape = [1, 'seq_len']
            inp_enc = MagicMock(); inp_enc.name = "encoder_hidden_states"; inp_enc.shape = [1, 577, 768]
            inp_msk = MagicMock(); inp_msk.name = "encoder_attention_mask"; inp_msk.shape = [1]
            mock_s1.get_inputs.return_value = [inp_ids, inp_enc, inp_msk]

            # Sequence of tokens: 1000 ("a"), 1001 ("man"), 102 (SEP)
            logits_step1 = np.zeros((1, 30524), dtype=np.float32)
            logits_step1[0, 1000] = 10.0

            logits_step2 = np.zeros((1, 30524), dtype=np.float32)
            logits_step2[0, 1001] = 10.0

            logits_step3 = np.zeros((1, 30524), dtype=np.float32)
            logits_step3[0, 102] = 10.0  # SEP token

            mock_s1.run.side_effect = [
                [logits_step1],
                [logits_step2],
                [logits_step3],
            ]
            BLIP_ENGINE.session_1 = mock_s1

            tok = WordPieceTokenizer()
            tok.vocab = {"[PAD]": 0, "[UNK]": 100, "[CLS]": 101, "[SEP]": 102, "a": 1000, "man": 1001}
            tok.inv_vocab = {v: k for k, v in tok.vocab.items()}
            BLIP_ENGINE.tokenizer = tok

            test_img = Image.new("RGB", (100, 100), color="blue")
            caption = BLIP_ENGINE.generate_caption(test_img)

            self.assertEqual(caption, "A man")
        finally:
            BLIP_ENGINE.loaded = orig_loaded
            BLIP_ENGINE.session_0 = orig_s0
            BLIP_ENGINE.session_1 = orig_s1
            BLIP_ENGINE.tokenizer = orig_tok

    def test_10_regression_encoder_output_dtype_role_mapping(self):
        """
        Step 52 Regression Test:
        Verifies the exact Android ONNX contract:
          outputs_0[0] -> encoder_attention_mask (int64)
          outputs_0[1] -> encoder_hidden_states (float32)
        Ensures that decoder input_feed receives:
          encoder_attention_mask: int64, shape (1,)
          encoder_hidden_states: float32, shape (1, 577, 768)
        """
        try:
            import numpy as np
        except ImportError:
            self.skipTest("NumPy not installed")

        orig_loaded = BLIP_ENGINE.loaded
        orig_s0 = BLIP_ENGINE.session_0
        orig_s1 = BLIP_ENGINE.session_1
        orig_tok = BLIP_ENGINE.tokenizer

        try:
            BLIP_ENGINE.loaded = True

            # Set distinct marker values and correct dtypes
            real_mask = np.array([42], dtype=np.int64)
            real_hidden = np.ones((1, 577, 768), dtype=np.float32) * 3.14

            mock_s0 = MagicMock()
            inp_0 = MagicMock(); inp_0.name = "pixel_values"
            mock_s0.get_inputs.return_value = [inp_0]
            # split_0.onnx output contract: [0] = mask (int64), [1] = hidden (float32)
            mock_s0.run.return_value = [real_mask, real_hidden]
            BLIP_ENGINE.session_0 = mock_s0

            captured_feeds = []

            def mock_decoder_run(output_names, feed_dict):
                captured_feeds.append(dict(feed_dict))
                # Return EOS immediately to finish in 1 step
                step_logits = np.zeros((1, 30524), dtype=np.float32)
                step_logits[0, 102] = 10.0  # SEP
                return [step_logits]

            mock_s1 = MagicMock()
            inp_ids = MagicMock(); inp_ids.name = "input_ids"; inp_ids.shape = [1, 'seq_len']
            inp_enc = MagicMock(); inp_enc.name = "encoder_hidden_states"; inp_enc.shape = [1, 577, 768]
            inp_msk = MagicMock(); inp_msk.name = "encoder_attention_mask"; inp_msk.shape = [1]
            mock_s1.get_inputs.return_value = [inp_ids, inp_enc, inp_msk]
            mock_s1.run.side_effect = mock_decoder_run
            BLIP_ENGINE.session_1 = mock_s1

            tok = WordPieceTokenizer()
            tok.vocab = {"[PAD]": 0, "[UNK]": 100, "[CLS]": 101, "[SEP]": 102}
            tok.inv_vocab = {v: k for k, v in tok.vocab.items()}
            BLIP_ENGINE.tokenizer = tok

            test_img = Image.new("RGB", (100, 100), color="blue")
            BLIP_ENGINE.generate_caption(test_img)

            # Assert decoder received the exact dtypes and tensor values
            self.assertEqual(len(captured_feeds), 1)
            feed = captured_feeds[0]

            self.assertIn("encoder_attention_mask", feed)
            self.assertIn("encoder_hidden_states", feed)

            # 1. Attention mask must be int64 and match outputs_0[0]
            self.assertEqual(feed["encoder_attention_mask"].dtype, np.int64)
            self.assertEqual(feed["encoder_attention_mask"].shape, (1,))
            self.assertEqual(feed["encoder_attention_mask"][0], 42)

            # 2. Encoder hidden states must be float32 and match outputs_0[1]
            self.assertEqual(feed["encoder_hidden_states"].dtype, np.float32)
            self.assertEqual(feed["encoder_hidden_states"].shape, (1, 577, 768))
            self.assertAlmostEqual(float(feed["encoder_hidden_states"][0, 0, 0]), 3.14, places=2)

        finally:
            BLIP_ENGINE.loaded = orig_loaded
            BLIP_ENGINE.session_0 = orig_s0
            BLIP_ENGINE.session_1 = orig_s1
            BLIP_ENGINE.tokenizer = orig_tok


if __name__ == "__main__":
    unittest.main()
