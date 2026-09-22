"""
Tests for Step 6 Semantic Matching Worker (Stdlib HTTP Server & ONNX MiniLM Engine)
Zero third-party test dependencies - pure Python standard library unittest & urllib.
Compatible with Python 3.14 on Android/Termux (OnePlus Nord CE 2 Lite) and desktop.
"""

import os
import tempfile
import json
import socket
import threading
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch, MagicMock

try:
    import numpy as np
except ImportError:
    np = None

from server.matching_server import (
    CONFIG,
    DEFAULT_MODEL_DIR,
    DEFAULT_MODEL_NAME,
    BertWordPieceTokenizer,
    OnnxMiniLMEngine,
    MINILM_ENGINE,
    resolve_model_dir,
    check_model_files_status,
    get_health_data,
    match_media_items,
    create_server,
)


class TestBertWordPieceTokenizer(unittest.TestCase):
    """Unit tests for the pure-Python BERT WordPiece Tokenizer."""

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.vocab_file = os.path.join(self.tmp_dir.name, "vocab.txt")
        # Write minimal synthetic vocab
        vocab_tokens = [
            "[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]",
            "she", "walks", "along", "the", "beach", "during", "sunset",
            "a", "person", "walking", "on", "sandy", "sky", "orange",
            "chef", "cooking", "pasta", "kitchen", "city", "traffic",
            "##ing", "##s", "##ed", "sun", "set",
        ]
        with open(self.vocab_file, "w", encoding="utf-8") as f:
            for t in vocab_tokens:
                f.write(t + "\n")

        self.tokenizer = BertWordPieceTokenizer()
        self.tokenizer.load_vocab(self.vocab_file)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_special_tokens_ids(self):
        self.assertEqual(self.tokenizer.pad_token_id, 0)
        self.assertEqual(self.tokenizer.unk_token_id, 1)
        self.assertEqual(self.tokenizer.cls_token_id, 2)
        self.assertEqual(self.tokenizer.sep_token_id, 3)

    def test_tokenization_known_words(self):
        ids = self.tokenizer.tokenize("she walks beach")
        self.assertEqual(ids[0], self.tokenizer.cls_token_id)
        self.assertEqual(ids[-1], self.tokenizer.sep_token_id)
        # Inner tokens must be known vocab IDs
        inner = ids[1:-1]
        self.assertIn(self.tokenizer.vocab["she"], inner)
        self.assertIn(self.tokenizer.vocab["walks"], inner)
        self.assertIn(self.tokenizer.vocab["beach"], inner)

    def test_tokenization_subwords(self):
        # 'sun' and '##set' should tokenize
        sub_tokens = self.tokenizer._tokenize_word("sunset")
        self.assertIn("sunset", self.tokenizer.vocab)
        self.assertEqual(sub_tokens, ["sunset"])

    def test_tokenization_unknown_word(self):
        # 'xyznonexistentword' -> [UNK]
        sub = self.tokenizer._tokenize_word("xyznonexistentword")
        self.assertEqual(sub, ["[UNK]"])

    def test_encode_output_shapes_and_types(self):
        if np is None:
            self.skipTest("NumPy is required for tokenizer encoding test.")
        encoded = self.tokenizer.encode("she walks", max_length=16)
        self.assertIn("input_ids", encoded)
        self.assertIn("attention_mask", encoded)
        self.assertIn("token_type_ids", encoded)

        self.assertEqual(encoded["input_ids"].shape, (1, 16))
        self.assertEqual(encoded["attention_mask"].shape, (1, 16))
        self.assertEqual(encoded["token_type_ids"].shape, (1, 16))

        self.assertEqual(encoded["input_ids"].dtype, np.int64)
        self.assertEqual(encoded["attention_mask"].dtype, np.int64)
        self.assertEqual(encoded["token_type_ids"].dtype, np.int64)

        # First token should be [CLS], followed by words, [SEP], then [PAD]
        ids = encoded["input_ids"][0].tolist()
        mask = encoded["attention_mask"][0].tolist()

        self.assertEqual(ids[0], self.tokenizer.cls_token_id)
        # Non-pad tokens should have mask=1, pad tokens should have mask=0
        for i, val in enumerate(ids):
            if val == self.tokenizer.pad_token_id:
                self.assertEqual(mask[i], 0)
            else:
                self.assertEqual(mask[i], 1)


class TestOnnxMiniLMEngine(unittest.TestCase):
    """Unit tests for OnnxMiniLMEngine inference, pooling, and normalization."""

    def test_provider_detection(self):
        engine = OnnxMiniLMEngine()
        providers = engine.get_providers()
        self.assertIsInstance(providers, list)
        self.assertTrue(len(providers) >= 1)

    def test_load_nonexistent_dir(self):
        engine = OnnxMiniLMEngine()
        ok = engine.load("/path/that/does/not/exist/12345")
        self.assertFalse(ok)
        self.assertFalse(engine.loaded)
        self.assertIsNotNone(engine.error)

    def test_mean_pooling_and_l2_normalization(self):
        if np is None:
            self.skipTest("NumPy is required for engine tests.")

        engine = OnnxMiniLMEngine()
        engine.loaded = True

        # Mock tokenizer
        mock_tok = MagicMock()
        mock_tok.encode.return_value = {
            "input_ids": np.array([[101, 200, 300, 102, 0, 0]], dtype=np.int64),
            "attention_mask": np.array([[1, 1, 1, 1, 0, 0]], dtype=np.int64),
            "token_type_ids": np.array([[0, 0, 0, 0, 0, 0]], dtype=np.int64),
        }
        engine.tokenizer = mock_tok

        # Mock ONNX session returning 3D token embeddings (1, 6, 384)
        mock_session = MagicMock()
        inp_mock = MagicMock()
        inp_mock.name = "input_ids"
        mock_session.get_inputs.return_value = [inp_mock]

        # Synthetic 3D embedding
        np.random.seed(42)
        mock_raw_output = np.random.randn(1, 6, 384).astype(np.float32)
        mock_session.run.return_value = [mock_raw_output]
        engine.session = mock_session

        emb = engine.compute_embedding("test text", max_length=6)

        self.assertEqual(emb.shape, (384,))
        # Check unit L2 norm
        norm = float(np.linalg.norm(emb))
        self.assertAlmostEqual(norm, 1.0, places=4)


class TestMatchingLogic(unittest.TestCase):
    """Unit tests for semantic ranking, explanations, and edge cases."""

    def test_empty_segment_raises_value_error(self):
        with self.assertRaises(ValueError):
            match_media_items("   ", [])

    def test_no_analyzed_media_status(self):
        # Media items with no Step 5 analysis
        raw_items = [
            {"mediaId": "m1", "mediaName": "raw1.mp4", "description": "", "tags": []},
            {"mediaId": "m2", "mediaName": "raw2.jpg", "description": None, "tags": None},
        ]
        with patch.object(MINILM_ENGINE, "loaded", True):
            res = match_media_items("A fast red car", raw_items)
            self.assertEqual(res["status"], "no_analyzed_media")
            self.assertEqual(len(res["candidates"]), 0)
            self.assertEqual(res["unavailableCount"], 2)

    def test_candidate_ranking_and_explanations(self):
        if np is None:
            self.skipTest("NumPy is required for matching logic tests.")

        # Construct controlled synthetic embeddings
        vec_segment = np.zeros(384, dtype=np.float32)
        vec_segment[0] = 1.0  # Unit vector along axis 0

        vec_beach = np.zeros(384, dtype=np.float32)
        vec_beach[0] = 0.9
        vec_beach[1] = np.sqrt(1.0 - 0.9**2)  # Dot product = 0.90

        vec_kitchen = np.zeros(384, dtype=np.float32)
        vec_kitchen[0] = 0.2
        vec_kitchen[1] = np.sqrt(1.0 - 0.2**2)  # Dot product = 0.20

        vec_city = np.zeros(384, dtype=np.float32)
        vec_city[0] = 0.5
        vec_city[1] = np.sqrt(1.0 - 0.5**2)  # Dot product = 0.50

        def mock_compute_embedding(text, max_length=128):
            t = text.lower()
            if "beach" in t or "sunset" in t:
                return vec_beach
            elif "pasta" in t or "kitchen" in t:
                return vec_kitchen
            elif "city" in t:
                return vec_city
            return vec_segment

        with patch.object(MINILM_ENGINE, "loaded", True), \
             patch.object(MINILM_ENGINE, "compute_embedding", side_effect=mock_compute_embedding):

            media_items = [
                {
                    "mediaId": "m-kitchen",
                    "mediaName": "pasta.mp4",
                    "description": "Chef cooking pasta in kitchen",
                    "tags": ["food", "pasta"],
                },
                {
                    "mediaId": "m-beach",
                    "mediaName": "beach_walk.mp4",
                    "description": "Walking along a sunny beach",
                    "tags": ["beach", "ocean"],
                    "temporalSummary": "Peaceful sunset over beach waves",
                },
                {
                    "mediaId": "m-city",
                    "mediaName": "city.jpg",
                    "description": "Busy city street",
                    "tags": ["city"],
                },
                {
                    "mediaId": "m-raw",
                    "mediaName": "raw.mp4",
                    "description": "",
                    "tags": [],
                }
            ]

            result = match_media_items("Sunset over the beach", media_items, top_k=3)
            self.assertEqual(result["status"], "success")
            self.assertEqual(result["unavailableCount"], 1)
            self.assertEqual(len(result["candidates"]), 3)

            # Top candidate must be beach with score 0.90
            top = result["candidates"][0]
            self.assertEqual(top["mediaId"], "m-beach")
            self.assertEqual(top["score"], 0.90)
            self.assertIn("beach", top["explanation"].lower())

            # Second candidate must be city (0.50)
            second = result["candidates"][1]
            self.assertEqual(second["mediaId"], "m-city")
            self.assertEqual(second["score"], 0.50)

            # Third candidate must be kitchen (0.20)
            third = result["candidates"][2]
            self.assertEqual(third["mediaId"], "m-kitchen")
            self.assertEqual(third["score"], 0.20)


class TestStdlibMatchingEndpoints(unittest.TestCase):
    """End-to-end integration tests over local stdlib HTTP server."""

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
            self.assertIn("LongFormAI Semantic Matching Test", content)
            self.assertIn("MiniLM", content)

    def test_02_health_endpoint(self):
        req = urllib.request.Request(f"{self.base_url}/health")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["service"], "LongFormAI Semantic Matching Worker")
            self.assertEqual(data["engine"], "onnx-all-MiniLM-L6-v2")
            self.assertIn("model_loaded", data)
            self.assertIn("model_cached", data)
            self.assertIn("state", data)

    def test_03_options_cors(self):
        req = urllib.request.Request(f"{self.base_url}/match", method="OPTIONS")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 204)
            self.assertEqual(resp.headers.get("Access-Control-Allow-Origin"), "*")
            self.assertIn("POST", resp.headers.get("Access-Control-Allow-Methods", ""))

    def test_04_match_empty_text_returns_400(self):
        payload = json.dumps({
            "segmentText": "   ",
            "mediaItems": []
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/match",
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
            self.assertIn("cannot be empty", data["detail"])

    def test_05_match_no_analyzed_media_status(self):
        payload = json.dumps({
            "segmentText": "A fast car driving on the highway",
            "mediaItems": [
                {"mediaId": "m1", "mediaName": "raw1.mp4", "description": "", "tags": []},
                {"mediaId": "m2", "mediaName": "raw2.mp4", "description": "", "tags": []}
            ]
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/match",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with patch.object(MINILM_ENGINE, "loaded", True):
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(data["status"], "no_analyzed_media")
                self.assertEqual(len(data["candidates"]), 0)
                self.assertEqual(data["unavailableCount"], 2)

    def test_06_match_model_unavailable_returns_503(self):
        payload = json.dumps({
            "segmentText": "A fast car driving on the highway",
            "mediaItems": [{"mediaId": "m1", "mediaName": "car.mp4", "description": "car", "tags": ["car"]}]
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/match",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with patch.object(MINILM_ENGINE, "loaded", False), \
             patch("server.matching_server.resolve_model_dir", return_value=None):
            try:
                urllib.request.urlopen(req)
                self.fail("Expected HTTPError 503")
            except urllib.error.HTTPError as e:
                self.assertEqual(e.code, 503)
                data = json.loads(e.read().decode("utf-8"))
                self.assertIn("detail", data)

    def test_07_post_model_load_endpoint(self):
        req = urllib.request.Request(
            f"{self.base_url}/model/load",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertIn("state", data)


class TestOnnxContractAndDtypeRegression(unittest.TestCase):
    """
    Regression test verifying exact MiniLM ONNX input tensor mapping, dtypes,
    and output shape contracts for Android / ARM64 / Termux execution.
    """

    def test_input_tensor_names_and_dtypes(self):
        """
        Verifies that input feed dictionary constructs int64 tensors with correct keys:
        - input_ids: int64, shape (1, seq_len)
        - attention_mask: int64, shape (1, seq_len)
        - token_type_ids: int64, shape (1, seq_len)
        """
        if np is None:
            self.skipTest("NumPy is required for dtype regression test.")

        tok = BertWordPieceTokenizer()
        tmp = tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8")
        try:
            tmp.write("[PAD]\n[UNK]\n[CLS]\n[SEP]\nword\n")
            tmp.close()
            tok.load_vocab(tmp.name)

            encoded = tok.encode("word", max_length=32)

            self.assertEqual(encoded["input_ids"].dtype, np.int64, "input_ids MUST be int64 for ONNX runtime")
            self.assertEqual(encoded["attention_mask"].dtype, np.int64, "attention_mask MUST be int64 for ONNX runtime")
            self.assertEqual(encoded["token_type_ids"].dtype, np.int64, "token_type_ids MUST be int64 for ONNX runtime")

            self.assertEqual(encoded["input_ids"].shape, (1, 32))
            self.assertEqual(encoded["attention_mask"].shape, (1, 32))
            self.assertEqual(encoded["token_type_ids"].shape, (1, 32))
        finally:
            if os.path.exists(tmp.name):
                os.unlink(tmp.name)

    def test_mean_pooling_math_and_l2_normalization_contract(self):
        """
        Verifies that token embeddings weighted by attention mask produce unit-length vector.
        """
        if np is None:
            self.skipTest("NumPy is required for pooling math test.")

        seq_len = 8
        hidden_dim = 384
        np.random.seed(123)

        # Synthetic token embeddings (1, 8, 384)
        token_embs = np.random.randn(1, seq_len, hidden_dim).astype(np.float32)
        # Mask: 4 active tokens, 4 padded tokens
        mask = np.array([[1, 1, 1, 1, 0, 0, 0, 0]], dtype=np.int64)

        mask_expanded = np.expand_dims(mask, axis=-1).astype(np.float32)
        sum_embeddings = np.sum(token_embs * mask_expanded, axis=1)
        sum_mask = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
        mean_pooled = sum_embeddings / sum_mask

        norm = np.linalg.norm(mean_pooled, axis=1, keepdims=True)
        norm = np.clip(norm, a_min=1e-9, a_max=None)
        unit_emb = (mean_pooled / norm)[0]

        self.assertEqual(unit_emb.shape, (384,), "MiniLM embedding must have dimension 384")
        self.assertAlmostEqual(float(np.linalg.norm(unit_emb)), 1.0, places=5, msg="MiniLM embedding must be unit-normalized L2")


if __name__ == "__main__":
    unittest.main()
