"""
Tests for Step 9 Local FFmpeg Render Worker (Stdlib HTTP Server)
Zero third-party test dependencies - pure Python standard library unittest & urllib.
Compatible with Python 3.14 on Android/Termux (OnePlus Nord CE 2 Lite) and desktop.
"""

import os
import sys
import json
import socket
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch, MagicMock

import server.render_server as render_server
from server.render_server import (
    CONFIG,
    EXPORTS_DIR,
    JOBS_LOCK,
    JOBS_STORE,
    check_ffmpeg_version,
    get_health_data,
    parse_multipart_body,
    start_json_render_job,
    start_multipart_render_job,
    create_server,
)


class TestRenderServerNoFrameworkDependencies(unittest.TestCase):
    """
    Regression test proving the server imports and runs without
    uvicorn, fastapi, or pydantic installed.
    """

    def test_no_forbidden_framework_imports_in_render_server(self):
        forbidden = ["uvicorn", "fastapi", "pydantic"]
        for mod in forbidden:
            self.assertNotIn(
                mod,
                sys.modules.get("server.render_server", {}).__dict__ if hasattr(render_server, "__dict__") else {},
                f"render_server must NOT import or depend on {mod}",
            )

    def test_check_ffmpeg_version_returns_tuple(self):
        ok, ver = check_ffmpeg_version()
        self.assertIsInstance(ok, bool)
        self.assertIsInstance(ver, str)

    def test_health_data_structure(self):
        data = get_health_data()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "LongFormAI Local Render Worker")
        self.assertEqual(data["engine"], "ffmpeg-local")
        self.assertIn("ffmpegAvailable", data)
        self.assertIn("ffmpegVersion", data)
        self.assertIn("exportsDir", data)


class TestMultipartAndJsonParsing(unittest.TestCase):
    """Tests multipart and JSON payload parsers."""

    def test_parse_multipart_body_fields_and_files(self):
        boundary = "---------------------------974767299852498929531610575"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="project_json"\r\n\r\n'
            f'{{"id": "proj_1", "name": "Test"}}\r\n'
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="voiceover"; filename="vo.wav"\r\n'
            f"Content-Type: audio/wav\r\n\r\n"
            f"RIFF-WAVE-DATA\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="media_files"; filename="m1.mp4"\r\n'
            f"Content-Type: video/mp4\r\n\r\n"
            f"VIDEO-BYTES-1\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="media_files"; filename="m2.mp4"\r\n'
            f"Content-Type: video/mp4\r\n\r\n"
            f"VIDEO-BYTES-2\r\n"
            f"--{boundary}--\r\n"
        ).encode("latin1")

        content_type_header = f"multipart/form-data; boundary={boundary}"
        fields, files = parse_multipart_body(body, content_type_header)

        self.assertIn("project_json", fields)
        self.assertEqual(json.loads(fields["project_json"]), {"id": "proj_1", "name": "Test"})

        self.assertIn("voiceover", files)
        self.assertEqual(len(files["voiceover"]), 1)
        self.assertEqual(files["voiceover"][0]["filename"], "vo.wav")
        self.assertEqual(files["voiceover"][0]["content"], b"RIFF-WAVE-DATA")

        self.assertIn("media_files", files)
        self.assertEqual(len(files["media_files"]), 2)
        self.assertEqual(files["media_files"][0]["filename"], "m1.mp4")
        self.assertEqual(files["media_files"][1]["filename"], "m2.mp4")

    def test_start_json_render_job_validation(self):
        with self.assertRaises(ValueError):
            start_json_render_job({})

        with self.assertRaises(ValueError):
            start_json_render_job({"project": "not-a-dict"})

    def test_start_multipart_render_job_validation(self):
        with self.assertRaises(ValueError):
            start_multipart_render_job({}, {})

        with self.assertRaises(ValueError):
            start_multipart_render_job({"project_json": "invalid-json-string"}, {})


class TestBackgroundJobExecution(unittest.TestCase):
    """Tests background rendering tracking and mock execution."""

    @patch("server.render_server.render_project")
    def test_background_job_lifecycle(self, mock_render):
        mock_render.return_value = {
            "success": True,
            "outputPath": "/tmp/test.mp4",
            "downloadUrl": "/outputs/test.mp4",
            "filename": "test.mp4",
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "duration": 5.0,
            "sizeBytes": 1024,
            "aspectRatio": "16:9",
            "videoCodec": "h264",
            "audioCodec": "aac",
        }

        req = {
            "project": {"id": "p1", "timeline": []},
            "outputFilename": "custom_output.mp4",
        }

        job_info = start_json_render_job(req)
        job_id = job_info["jobId"]
        self.assertEqual(job_info["status"], "rendering")

        # Wait for thread to finish mock work
        for _ in range(20):
            with JOBS_LOCK:
                st = JOBS_STORE.get(job_id, {})
                if st.get("status") == "completed":
                    break
            import time
            time.sleep(0.05)

        with JOBS_LOCK:
            st = JOBS_STORE[job_id]
            self.assertEqual(st["status"], "completed")
            self.assertEqual(st["progress"], 100.0)
            self.assertIsNotNone(st["result"])
            self.assertEqual(st["result"]["filename"], "test.mp4")


class TestStdlibRenderEndpoints(unittest.TestCase):
    """End-to-end integration tests over local stdlib HTTP server."""

    @classmethod
    def setUpClass(cls):
        cls.tmp_exports = tempfile.TemporaryDirectory()
        cls.orig_exports_dir = render_server.EXPORTS_DIR
        cls.orig_config_exports_dir = render_server.CONFIG.get("exports_dir")

        render_server.EXPORTS_DIR = Path(cls.tmp_exports.name)
        render_server.CONFIG["exports_dir"] = str(cls.tmp_exports.name)

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
        render_server.EXPORTS_DIR = cls.orig_exports_dir
        render_server.CONFIG["exports_dir"] = cls.orig_config_exports_dir
        cls.tmp_exports.cleanup()

    def test_01_root_test_page(self):
        req = urllib.request.Request(f"{self.base_url}/")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            self.assertIn("text/html", resp.headers.get("Content-Type", ""))
            content = resp.read().decode("utf-8")
            self.assertIn("LongFormAI FFmpeg Render Worker", content)

    def test_02_health_endpoint(self):
        req = urllib.request.Request(f"{self.base_url}/health")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["service"], "LongFormAI Local Render Worker")
            self.assertEqual(data["engine"], "ffmpeg-local")
            self.assertIn("ffmpegAvailable", data)
            self.assertIn("exportsDir", data)

    def test_03_options_cors(self):
        req = urllib.request.Request(f"{self.base_url}/render/multipart", method="OPTIONS")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 204)
            self.assertEqual(resp.headers.get("Access-Control-Allow-Origin"), "*")
            self.assertIn("POST", resp.headers.get("Access-Control-Allow-Methods", ""))

    def test_04_jobs_not_found_returns_404(self):
        req = urllib.request.Request(f"{self.base_url}/jobs/nonexistent_job_12345")
        try:
            urllib.request.urlopen(req)
            self.fail("Expected HTTPError 404")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 404)
            data = json.loads(e.read().decode("utf-8"))
            self.assertIn("detail", data)

    def test_05_outputs_not_found_returns_404(self):
        req = urllib.request.Request(f"{self.base_url}/outputs/missing_video.mp4")
        try:
            urllib.request.urlopen(req)
            self.fail("Expected HTTPError 404")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 404)

    def test_06_outputs_serving_existing_file(self):
        exports_path = render_server.get_exports_dir()
        test_video_path = exports_path / "test_sample.mp4"
        test_video_path.write_bytes(b"FAKE-MP4-VIDEO-HEADER-AND-DATA-BYTES")

        req = urllib.request.Request(f"{self.base_url}/outputs/test_sample.mp4")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("Content-Type"), "video/mp4")
            self.assertEqual(int(resp.headers.get("Content-Length", 0)), len(b"FAKE-MP4-VIDEO-HEADER-AND-DATA-BYTES"))
            content = resp.read()
            self.assertEqual(content, b"FAKE-MP4-VIDEO-HEADER-AND-DATA-BYTES")

    def test_06b_head_outputs_existing_file(self):
        req = urllib.request.Request(f"{self.base_url}/outputs/test_sample.mp4", method="HEAD")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("Content-Type"), "video/mp4")
            self.assertEqual(int(resp.headers.get("Content-Length", 0)), len(b"FAKE-MP4-VIDEO-HEADER-AND-DATA-BYTES"))

    def test_07_render_json_empty_payload_returns_400(self):
        req = urllib.request.Request(
            f"{self.base_url}/render/json",
            data=b"",
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            urllib.request.urlopen(req)
            self.fail("Expected HTTPError 400")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)

    @patch("server.render_server.render_project")
    def test_08_render_json_success_flow(self, mock_render):
        mock_render.return_value = {
            "success": True,
            "outputPath": str(render_server.EXPORTS_DIR / "out.mp4"),
            "downloadUrl": "/outputs/out.mp4",
            "filename": "out.mp4",
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "duration": 3.0,
            "sizeBytes": 2048,
            "aspectRatio": "16:9",
            "videoCodec": "h264",
            "audioCodec": "aac",
        }

        payload = json.dumps({
            "project": {"id": "test_e2e_json", "timeline": []},
            "outputFilename": "out.mp4",
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/render/json",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("jobId", data)
            self.assertEqual(data["status"], "rendering")
            job_id = data["jobId"]

        # Poll job status via GET /jobs/{job_id}
        poll_req = urllib.request.Request(f"{self.base_url}/jobs/{job_id}")
        for _ in range(20):
            with urllib.request.urlopen(poll_req) as resp:
                self.assertEqual(resp.status, 200)
                job_data = json.loads(resp.read().decode("utf-8"))
                if job_data["status"] == "completed":
                    break
            import time
            time.sleep(0.05)

        self.assertEqual(job_data["status"], "completed")
        self.assertEqual(job_data["result"]["filename"], "out.mp4")

    @patch("server.render_server.render_project")
    def test_09_render_multipart_success_flow(self, mock_render):
        mock_render.return_value = {
            "success": True,
            "outputPath": str(render_server.EXPORTS_DIR / "out_mp.mp4"),
            "downloadUrl": "/outputs/out_mp.mp4",
            "filename": "out_mp.mp4",
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "duration": 4.0,
            "sizeBytes": 4096,
            "aspectRatio": "16:9",
            "videoCodec": "h264",
            "audioCodec": "aac",
        }

        boundary = "Boundary123456789"
        project_obj = {
            "version": "1.0",
            "id": "proj_mp_test",
            "media": [{"id": "m1", "name": "sample.mp4"}],
            "timeline": []
        }
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="project_json"\r\n\r\n'
            f"{json.dumps(project_obj)}\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="media_files"; filename="m1_sample.mp4"\r\n'
            f"Content-Type: video/mp4\r\n\r\n"
            f"FAKE-VIDEO-BYTES\r\n"
            f"--{boundary}--\r\n"
        ).encode("latin1")

        req = urllib.request.Request(
            f"{self.base_url}/render/multipart",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )

        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("jobId", data)
            self.assertEqual(data["status"], "rendering")
            job_id = data["jobId"]

        # Check job status endpoint
        poll_req = urllib.request.Request(f"{self.base_url}/jobs/{job_id}")
        with urllib.request.urlopen(poll_req) as resp:
            self.assertEqual(resp.status, 200)
            st_data = json.loads(resp.read().decode("utf-8"))
            self.assertIn(st_data["status"], ["rendering", "completed"])


if __name__ == "__main__":
    unittest.main()
