"""
Tests for Step 51 - whisper.cpp Local Transcription Backend (Stdlib HTTP Server)
Zero third-party dependencies - pure Python standard library unittest & urllib.
"""

import os
import json
import socket
import threading
import tempfile
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch, MagicMock

from server.transcribe_server import (
    CONFIG,
    expand_path,
    resolve_binary_path,
    resolve_model_path,
    parse_timestamp_str,
    extract_time_seconds,
    parse_whisper_json,
    parse_multipart_body,
    BinaryNotFoundError,
    ModelNotFoundError,
    run_transcription,
    create_server,
)


class TestWhisperCppHelpers(unittest.TestCase):
    def test_expand_path(self):
        p = "~/whisper.cpp/models/ggml-base.bin"
        expanded = expand_path(p)
        self.assertFalse(expanded.startswith("~"))
        self.assertTrue(os.path.isabs(expanded))

    def test_parse_timestamp_str(self):
        self.assertAlmostEqual(parse_timestamp_str("00:01:23,450"), 83.45)
        self.assertAlmostEqual(parse_timestamp_str("01:23.450"), 83.45)
        self.assertAlmostEqual(parse_timestamp_str("12.5"), 12.5)
        self.assertAlmostEqual(parse_timestamp_str("00:00:00,000"), 0.0)
        self.assertAlmostEqual(parse_timestamp_str("invalid"), 0.0)

    def test_extract_time_seconds(self):
        self.assertAlmostEqual(extract_time_seconds(1200), 1.2)
        self.assertAlmostEqual(extract_time_seconds(5.5), 5.5)
        self.assertAlmostEqual(extract_time_seconds("00:00:05,200"), 5.2)
        self.assertAlmostEqual(extract_time_seconds(None), 0.0)

    def test_parse_whisper_json_offsets_format(self):
        sample_json = {
            "result": {"language": "en"},
            "transcription": [
                {
                    "offsets": {"from": 0, "to": 2500},
                    "text": "Hello world and welcome.",
                    "tokens": [
                        {"text": "Hello", "offsets": {"from": 0, "to": 600}, "p": 0.95},
                        {"text": "world", "offsets": {"from": 600, "to": 1200}, "p": 0.98},
                        {"text": "and", "offsets": {"from": 1200, "to": 1500}, "p": 0.90},
                        {"text": "welcome.", "offsets": {"from": 1500, "to": 2500}, "p": 0.92},
                    ]
                },
                {
                    "offsets": {"from": 2500, "to": 4800},
                    "text": "This is a test of whisper cpp.",
                    "tokens": [
                        {"text": "This", "offsets": {"from": 2500, "to": 2900}, "p": 0.88},
                        {"text": "is", "offsets": {"from": 2900, "to": 3100}, "p": 0.91},
                    ]
                }
            ]
        }

        resp = parse_whisper_json(sample_json, requested_model="base")
        self.assertEqual(resp["status"], "success")
        self.assertEqual(resp["language"], "en")
        self.assertEqual(resp["model"], "base")
        self.assertEqual(resp["duration"], 4.8)
        self.assertEqual(len(resp["segments"]), 2)

        seg1 = resp["segments"][0]
        self.assertEqual(seg1["id"], "seg_1_0")
        self.assertEqual(seg1["start"], 0.0)
        self.assertEqual(seg1["end"], 2.5)
        self.assertEqual(seg1["text"], "Hello world and welcome.")
        self.assertAlmostEqual(seg1["confidence"], 0.94, places=2)
        self.assertEqual(len(seg1["words"]), 4)
        self.assertEqual(seg1["words"][0]["word"], "Hello")
        self.assertEqual(seg1["words"][0]["start"], 0.0)
        self.assertEqual(seg1["words"][0]["end"], 0.6)
        self.assertEqual(seg1["words"][0]["confidence"], 0.95)

        seg2 = resp["segments"][1]
        self.assertEqual(seg2["id"], "seg_2_250")
        self.assertEqual(seg2["start"], 2.5)
        self.assertEqual(seg2["end"], 4.8)

    def test_parse_whisper_json_timestamps_format(self):
        sample_json = {
            "result": {"language": "es"},
            "transcription": [
                {
                    "timestamps": {"from": "00:00:01,000", "to": "00:00:03,500"},
                    "text": "Hola mundo",
                    "p": 0.91,
                    "tokens": [
                        {"text": "Hola", "timestamps": {"from": "00:00:01,000", "to": "00:00:02,000"}, "p": 0.92},
                        {"text": "mundo", "timestamps": {"from": "00:00:02,000", "to": "00:00:03,500"}, "p": 0.90},
                    ]
                }
            ]
        }

        resp = parse_whisper_json(sample_json, requested_model="tiny")
        self.assertEqual(resp["status"], "success")
        self.assertEqual(resp["language"], "es")
        self.assertEqual(resp["duration"], 3.5)
        self.assertEqual(len(resp["segments"]), 1)
        self.assertEqual(resp["segments"][0]["start"], 1.0)
        self.assertEqual(resp["segments"][0]["end"], 3.5)
        self.assertEqual(resp["segments"][0]["text"], "Hola mundo")

    def test_parse_multipart_body(self):
        boundary = "---------------------------974767299852498929531610575"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="model_size"\r\n\r\n'
            f"base\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="language"\r\n\r\n'
            f"en\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="test.mp3"\r\n'
            f"Content-Type: audio/mpeg\r\n\r\n"
            f"FAKEMUSICBYTES\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        ct = f"multipart/form-data; boundary={boundary}"
        fields, files = parse_multipart_body(body, ct)

        self.assertEqual(fields.get("model_size"), "base")
        self.assertEqual(fields.get("language"), "en")
        self.assertIn("file", files)
        self.assertEqual(files["file"]["filename"], "test.mp3")
        self.assertEqual(files["file"]["content"], b"FAKEMUSICBYTES")


class TestStdlibHttpServerEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Pick an available port
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

    def test_root_test_page(self):
        req = urllib.request.Request(f"{self.base_url}/")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            self.assertIn("text/html", resp.headers.get("Content-Type", ""))
            content = resp.read().decode("utf-8")
            self.assertIn("LongFormAI Transcription Test", content)
            self.assertIn("input type=\"file\"", content)
            self.assertIn("Transcribe Audio", content)

    def test_health_endpoint(self):
        req = urllib.request.Request(f"{self.base_url}/health")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["engine"], "whisper.cpp")
            self.assertIn("binary_available", data)
            self.assertIn("model_available", data)
            self.assertIn("threads", data)
            self.assertIn("device", data)
            self.assertEqual(data["default_device"], "cpu")

    def test_options_cors(self):
        req = urllib.request.Request(f"{self.base_url}/transcribe", method="OPTIONS")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 204)
            self.assertEqual(resp.headers.get("Access-Control-Allow-Origin"), "*")

    def test_transcribe_missing_file_returns_400(self):
        boundary = "BoundaryTest123"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="model_size"\r\n\r\n'
            f"base\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/transcribe",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        try:
            urllib.request.urlopen(req)
            self.fail("Expected HTTPError 400")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)
            data = json.loads(e.read().decode("utf-8"))
            self.assertIn("No audio file provided", data["detail"])

    def test_transcribe_missing_binary_returns_503(self):
        boundary = "BoundaryTest456"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="test.mp3"\r\n'
            f"Content-Type: audio/mpeg\r\n\r\n"
            f"AUDIODATA\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/transcribe",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )

        with patch("server.transcribe_server.resolve_binary_path", return_value=None):
            try:
                urllib.request.urlopen(req)
                self.fail("Expected HTTPError 503")
            except urllib.error.HTTPError as e:
                self.assertEqual(e.code, 503)
                data = json.loads(e.read().decode("utf-8"))
                self.assertIn("whisper.cpp binary not found", data["detail"])

    @patch("server.transcribe_server.convert_audio_to_wav")
    @patch("subprocess.run")
    @patch("server.transcribe_server.resolve_model_path", return_value="/mock/models/ggml-base.bin")
    @patch("server.transcribe_server.resolve_binary_path", return_value="/mock/bin/whisper-cli")
    def test_transcribe_successful_flow(self, mock_bin, mock_model, mock_subproc, mock_convert):
        def side_effect_run(cmd, stdout=None, stderr=None, text=True, check=False):
            of_idx = cmd.index("-of")
            prefix = cmd[of_idx + 1]
            json_path = f"{prefix}.json"
            sample_data = {
                "result": {"language": "en"},
                "transcription": [
                    {
                        "offsets": {"from": 0, "to": 3000},
                        "text": "Whisper cpp transcription successful via stdlib.",
                        "tokens": [
                            {"text": "Whisper", "offsets": {"from": 0, "to": 800}, "p": 0.99},
                            {"text": "cpp", "offsets": {"from": 800, "to": 1200}, "p": 0.97},
                            {"text": "transcription", "offsets": {"from": 1200, "to": 2200}, "p": 0.95},
                            {"text": "successful", "offsets": {"from": 2200, "to": 2700}, "p": 0.96},
                            {"text": "via", "offsets": {"from": 2700, "to": 2800}, "p": 0.92},
                            {"text": "stdlib.", "offsets": {"from": 2800, "to": 3000}, "p": 0.94},
                        ]
                    }
                ]
            }
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(sample_data, f)

            mock_res = MagicMock()
            mock_res.returncode = 0
            mock_res.stdout = "OK"
            mock_res.stderr = ""
            return mock_res

        mock_subproc.side_effect = side_effect_run

        boundary = "BoundaryTest789"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="model_size"\r\n\r\n'
            f"base\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="language"\r\n\r\n'
            f"en\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="voiceover.mp3"\r\n'
            f"Content-Type: audio/mpeg\r\n\r\n"
            f"REALFAKEMUSICBYTES\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/transcribe",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )

        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["language"], "en")
            self.assertEqual(data["duration"], 3.0)
            self.assertEqual(len(data["segments"]), 1)
            self.assertEqual(data["segments"][0]["text"], "Whisper cpp transcription successful via stdlib.")
            self.assertEqual(len(data["segments"][0]["words"]), 6)
            self.assertEqual(data["segments"][0]["words"][0]["word"], "Whisper")


if __name__ == "__main__":
    unittest.main()
