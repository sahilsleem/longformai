"""
LongFormAI (Project Hail Mary) - Local FFmpeg Render Worker
Renders 1920x1080 16:9 Long-Form Master MP4s locally using FFmpeg.
Zero cloud APIs, zero external requests, 100% local and private.
Pure Python standard library HTTP server - zero third-party framework dependencies (no FastAPI, no Pydantic, no Uvicorn).
Optimized for Termux / Android / ARM64 / CPU execution on OnePlus Nord CE 2 Lite.
"""

import os
import sys
import json
import time
import uuid
import shutil
import logging
import argparse
import tempfile
import threading
import subprocess
import urllib.parse
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
try:
    from .render_engine import get_media_dimensions, render_project
except (ImportError, ValueError):
    _server_dir = os.path.dirname(os.path.abspath(__file__))
    if _server_dir not in sys.path:
        sys.path.insert(0, _server_dir)
    from render_engine import get_media_dimensions, render_project
logger = logging.getLogger("render_server")

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_EXPORTS_DIR = BASE_DIR / "exports"
DEFAULT_EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR = DEFAULT_EXPORTS_DIR

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8768

CONFIG = {
    "host": DEFAULT_HOST,
    "port": DEFAULT_PORT,
    "exports_dir": None,
}

# Job status tracker
JOBS_LOCK = threading.Lock()
JOBS_STORE: Dict[str, Dict[str, Any]] = {}


def get_exports_dir() -> Path:
    """Returns the active exports directory as a Path, creating it if needed."""
    if CONFIG.get("exports_dir"):
        target = CONFIG["exports_dir"]
    else:
        target = EXPORTS_DIR
    p = Path(target).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def check_ffmpeg_version() -> Tuple[bool, str]:
    try:
        res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
        if res.returncode == 0:
            first_line = res.stdout.splitlines()[0] if res.stdout else "ffmpeg available"
            return True, first_line
        return False, "FFmpeg returned non-zero code"
    except Exception as e:
        return False, str(e)


def get_health_data() -> Dict[str, Any]:
    ffmpeg_ok, ffmpeg_ver = check_ffmpeg_version()
    return {
        "status": "ok",
        "service": "LongFormAI Local Render Worker",
        "engine": "ffmpeg-local",
        "ffmpegAvailable": ffmpeg_ok,
        "ffmpegVersion": ffmpeg_ver,
        "exportsDir": str(get_exports_dir()),
    }


def parse_multipart_body(
    body: bytes, content_type_header: str
) -> Tuple[Dict[str, str], Dict[str, List[Dict[str, Any]]]]:
    """
    Pure Python standard-library multipart/form-data parser (Python 3.10-3.14+ compatible).
    Returns (fields_dict, files_dict) where files_dict maps field names to lists of file dicts.
    """
    import re
    fields: Dict[str, str] = {}
    files: Dict[str, List[Dict[str, Any]]] = {}

    match = re.search(r'boundary=([^;]+)', content_type_header)
    if not match:
        return fields, files

    boundary = match.group(1).strip().strip('"')
    boundary_bytes = b"--" + boundary.encode("latin1")

    parts = body.split(boundary_bytes)
    for part in parts:
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue

        if b"\r\n\r\n" in part:
            header_bytes, payload = part.split(b"\r\n\r\n", 1)
        elif b"\n\n" in part:
            header_bytes, payload = part.split(b"\n\n", 1)
        else:
            continue

        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        elif payload.endswith(b"\n"):
            payload = payload[:-1]

        header_text = header_bytes.decode("utf-8", errors="replace")
        headers = {}
        for line in header_text.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        cd = headers.get("content-disposition", "")
        name_match = re.search(r'name=(?:"([^"]+)"|([^\s;]+))', cd)
        if not name_match:
            continue
        field_name = name_match.group(1) or name_match.group(2) or ""

        filename_match = re.search(r'filename=(?:"([^"]+)"|([^\s;]+))', cd)
        if not filename_match:
            filename_match = re.search(r"filename\*=(?:UTF-8''|utf-8'')([^\s;]+)", cd)

        if filename_match:
            filename = filename_match.group(1) or (filename_match.group(2) if len(filename_match.groups()) > 1 else None) or ""
            filename = urllib.parse.unquote(filename).strip('"\'')
            file_item = {
                "filename": filename,
                "content": payload,
                "content_type": headers.get("content-type", "application/octet-stream"),
            }
            if field_name not in files:
                files[field_name] = []
            files[field_name].append(file_item)
        else:
            fields[field_name] = payload.decode("utf-8", errors="replace")

    return fields, files


def start_json_render_job(req: Dict[str, Any]) -> Dict[str, Any]:
    """Starts a render job from JSON request dictionary."""
    project_data = req.get("project")
    if not project_data or not isinstance(project_data, dict):
        raise ValueError("Invalid project data provided in JSON request.")

    media_files = req.get("mediaFiles") or {}
    voiceover_path = req.get("voiceoverPath")
    output_filename = req.get("outputFilename")

    job_id = f"job_{uuid.uuid4().hex[:10]}"
    out_name = output_filename or f"render_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    if not out_name.endswith(".mp4"):
        out_name += ".mp4"
    output_path = str(get_exports_dir() / out_name)

    with JOBS_LOCK:
        JOBS_STORE[job_id] = {
            "jobId": job_id,
            "status": "rendering",
            "progress": 0.0,
            "message": "Starting render job...",
            "result": None,
            "error": None,
            "createdAt": time.time(),
        }

    def progress_cb(pct: float, msg: str):
        with JOBS_LOCK:
            if job_id in JOBS_STORE:
                JOBS_STORE[job_id]["progress"] = round(pct, 1)
                JOBS_STORE[job_id]["message"] = msg

    def background_render():
        try:
            res = render_project(
                project_data=project_data,
                media_file_map=media_files,
                voiceover_path=voiceover_path,
                output_mp4_path=output_path,
                progress_callback=progress_cb,
            )
            res["downloadUrl"] = f"/outputs/{out_name}"
            with JOBS_LOCK:
                JOBS_STORE[job_id]["status"] = "completed"
                JOBS_STORE[job_id]["progress"] = 100.0
                JOBS_STORE[job_id]["message"] = "Render completed successfully!"
                JOBS_STORE[job_id]["result"] = res
        except Exception as e:
            logger.exception(f"Render failed for job {job_id}")
            with JOBS_LOCK:
                JOBS_STORE[job_id]["status"] = "failed"
                JOBS_STORE[job_id]["error"] = str(e)
                JOBS_STORE[job_id]["message"] = f"Render failed: {e}"

    threading.Thread(target=background_render, daemon=True).start()

    return {
        "jobId": job_id,
        "status": "rendering",
        "message": "Render job queued and running in background",
    }


def start_multipart_render_job(
    fields: Dict[str, str], files: Dict[str, List[Dict[str, Any]]]
) -> Dict[str, Any]:
    """Starts a render job from parsed multipart fields and files."""
    project_json_str = fields.get("project_json")
    if not project_json_str:
        raise ValueError("Missing required 'project_json' field in multipart payload.")

    try:
        project_data = json.loads(project_json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid project_json: {e}")

    job_id = f"job_{uuid.uuid4().hex[:10]}"
    job_temp_dir = tempfile.mkdtemp(prefix=f"render_job_{job_id}_")
    out_name = f"render_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    output_path = str(get_exports_dir() / out_name)

    # Save uploaded voiceover if present
    voiceover_path = None
    vo_list = files.get("voiceover", [])
    if vo_list:
        vo_file = vo_list[0]
        v_ext = os.path.splitext(vo_file["filename"])[1] or ".wav"
        v_save = os.path.join(job_temp_dir, f"voiceover{v_ext}")
        with open(v_save, "wb") as f:
            f.write(vo_file["content"])
        voiceover_path = v_save

    # Save uploaded media files and map to mediaId
    media_file_map: Dict[str, str] = {}
    project_media = project_data.get("media", [])
    media_name_to_id = {m.get("name"): m.get("id") for m in project_media if "name" in m and "id" in m}
    media_ids = {m.get("id"): m for m in project_media if "id" in m}

    uploaded_media = files.get("media_files", [])
    for mf in uploaded_media:
        raw_filename = mf.get("filename", "")
        if not raw_filename:
            continue
        m_filename = os.path.basename(raw_filename)
        m_save = os.path.join(job_temp_dir, m_filename)
        with open(m_save, "wb") as f:
            f.write(mf["content"])

        # Map to all possible ID aliases
        media_file_map[m_filename] = m_save
        media_file_map[raw_filename] = m_save

        for mid in media_ids:
            if m_filename == mid or m_filename.startswith(f"{mid}_") or m_filename.startswith(mid):
                media_file_map[mid] = m_save

        for mname, mid in media_name_to_id.items():
            if m_filename == mname or m_filename.endswith(mname) or m_filename.endswith(f"_{mname}"):
                media_file_map[mid] = m_save
                media_file_map[mname] = m_save

    with JOBS_LOCK:
        JOBS_STORE[job_id] = {
            "jobId": job_id,
            "status": "rendering",
            "progress": 0.0,
            "message": "Starting render job...",
            "result": None,
            "error": None,
            "createdAt": time.time(),
        }

    def progress_cb(pct: float, msg: str):
        with JOBS_LOCK:
            if job_id in JOBS_STORE:
                JOBS_STORE[job_id]["progress"] = round(pct, 1)
                JOBS_STORE[job_id]["message"] = msg

    def run_worker():
        try:
            res = render_project(
                project_data=project_data,
                media_file_map=media_file_map,
                voiceover_path=voiceover_path,
                output_mp4_path=output_path,
                progress_callback=progress_cb,
            )
            res["downloadUrl"] = f"/outputs/{out_name}"
            with JOBS_LOCK:
                JOBS_STORE[job_id]["status"] = "completed"
                JOBS_STORE[job_id]["progress"] = 100.0
                JOBS_STORE[job_id]["message"] = "Render completed successfully!"
                JOBS_STORE[job_id]["result"] = res
        except Exception as e:
            logger.exception(f"Render failed for job {job_id}")
            with JOBS_LOCK:
                JOBS_STORE[job_id]["status"] = "failed"
                JOBS_STORE[job_id]["error"] = str(e)
                JOBS_STORE[job_id]["message"] = f"Render failed: {e}"
        finally:
            try:
                shutil.rmtree(job_temp_dir, ignore_errors=True)
            except Exception:
                pass

    threading.Thread(target=run_worker, daemon=True).start()

    return {
        "jobId": job_id,
        "status": "rendering",
        "message": "Render job queued and running in background",
    }


TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LongFormAI FFmpeg Render Worker Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      line-height: 1.5;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 1.4rem; font-weight: 700; color: #38bdf8; margin-bottom: 8px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    .url-badge { display: inline-block; background: #334155; color: #94a3b8; padding: 4px 8px; border-radius: 6px; font-family: monospace; font-size: 0.85rem; margin-bottom: 16px; word-break: break-all; }
    label { display: block; font-size: 0.85rem; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; margin-top: 10px; }
    button { width: 100%; background: #2563eb; color: #ffffff; border: none; border-radius: 8px; padding: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 16px; }
    button:disabled { background: #475569; cursor: not-allowed; opacity: 0.7; }
    .status-box { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 0.9rem; }
    .status-box.loading { background: #0369a1; color: #e0f2fe; }
    .status-box.error { background: #7f1d1d; border: 1px solid #b91c1c; color: #fecaca; }
    .status-box.success { background: #064e3b; border: 1px solid #059669; color: #d1fae5; }
    .progress-bar { width: 100%; background: #334155; border-radius: 4px; height: 8px; overflow: hidden; margin-top: 8px; }
    .progress-fill { height: 100%; background: #38bdf8; width: 0%; transition: width 0.3s ease; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>LongFormAI FFmpeg Render Worker</h1>
    <div class="url-badge" id="workerUrlBadge">Worker: checking...</div>

    <div class="card">
      <div id="healthInfo">Checking FFmpeg status...</div>
      <button id="testHealthBtn" style="margin-top: 10px; background: #0f766e;">Check Worker Health</button>
    </div>

    <div class="card">
      <h2 style="font-size: 1.1rem; color: #38bdf8; margin-bottom: 8px;">Quick Render Test</h2>
      <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 12px;">Tests the local FFmpeg rendering pipeline with a synthetic test project.</p>
      <button id="renderTestBtn">Trigger Test Video Render</button>
      <div id="statusBox" class="status-box hidden">
        <div id="statusMessage"></div>
        <div class="progress-bar"><div id="progressFill" class="progress-fill"></div></div>
      </div>
    </div>
  </div>

  <script>
    const workerUrl = window.location.origin;
    document.getElementById('workerUrlBadge').textContent = 'Worker: ' + workerUrl;

    const healthInfo = document.getElementById('healthInfo');
    const testHealthBtn = document.getElementById('testHealthBtn');
    const renderTestBtn = document.getElementById('renderTestBtn');
    const statusBox = document.getElementById('statusBox');
    const statusMessage = document.getElementById('statusMessage');
    const progressFill = document.getElementById('progressFill');

    async function checkHealth() {
      try {
        const res = await fetch(`${workerUrl}/health`);
        const data = await res.json();
        healthInfo.innerHTML = `
          <strong>Status:</strong> ${data.status.toUpperCase()}<br>
          <strong>FFmpeg:</strong> ${data.ffmpegAvailable ? 'Available' : 'NOT FOUND'}<br>
          <strong>Version:</strong> <span style="font-family: monospace; font-size: 0.8rem;">${data.ffmpegVersion || 'N/A'}</span><br>
          <strong>Exports:</strong> <span style="font-family: monospace; font-size: 0.8rem;">${data.exportsDir}</span>
        `;
      } catch (err) {
        healthInfo.innerHTML = `<span style="color: #f87171;">Health check failed: ${err.message}</span>`;
      }
    }

    testHealthBtn.addEventListener('click', checkHealth);
    checkHealth();

    renderTestBtn.addEventListener('click', async () => {
      renderTestBtn.disabled = true;
      statusBox.className = 'status-box loading';
      statusBox.classList.remove('hidden');
      statusMessage.textContent = 'Submitting test project render job...';
      progressFill.style.width = '5%';

      const syntheticProject = {
        version: "1.0",
        id: "test_quick_proj",
        name: "Test Render",
        resolution: { width: 1920, height: 1080, aspectRatio: "16:9" },
        fps: 30,
        voiceover: { id: "vo_test", duration: 2.0, volume: 1.0, isMuted: false },
        timeline: [
          {
            id: "item_test_1",
            mediaId: "test_clip",
            trackIndex: 0,
            startTime: 0.0,
            duration: 2.0,
            sourceStart: 0.0,
            sourceDuration: 2.0,
            transform: { fitMode: "cover", scale: 1.0, x: 0.0, y: 0.0, crop: { x: 0, y: 0, width: 1, height: 1 } }
          }
        ],
        media: [{ id: "test_clip", name: "test_clip.mp4", type: "video", width: 1920, height: 1080 }]
      };

      try {
        const res = await fetch(`${workerUrl}/render/json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: syntheticProject })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || JSON.stringify(data));
        }

        const jobId = data.jobId;
        statusMessage.textContent = `Job queued (${jobId}). Rendering with FFmpeg...`;

        // Poll job
        while (true) {
          await new Promise(r => setTimeout(r, 600));
          const pollRes = await fetch(`${workerUrl}/jobs/${jobId}`);
          const job = await pollRes.json();
          progressFill.style.width = `${job.progress || 10}%`;
          statusMessage.textContent = `[${job.status.toUpperCase()}] ${job.message || ''} (${job.progress || 0}%)`;

          if (job.status === 'completed') {
            statusBox.className = 'status-box success';
            statusMessage.innerHTML = `<strong>Render Completed!</strong> <a href="${workerUrl}${job.result.downloadUrl}" target="_blank" style="color: #6ee7b7; text-decoration: underline;">Download MP4</a>`;
            break;
          } else if (job.status === 'failed') {
            throw new Error(job.error || 'Rendering failed.');
          }
        }
      } catch (err) {
        statusBox.className = 'status-box error';
        statusMessage.textContent = `Error: ${err.message}`;
      } finally {
        renderTestBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
"""


class RenderRequestHandler(BaseHTTPRequestHandler):
    """Standard library HTTP request handler for the local FFmpeg render worker."""

    def log_message(self, format, *args):
        pass

    def send_html_response(self, status_code: int, html_str: str):
        body = html_str.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_json_response(self, status_code: int, data: Dict[str, Any]):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith("/outputs/"):
            filename = path[len("/outputs/"):]
            safe_name = os.path.basename(filename)
            file_path = get_exports_dir() / safe_name
            if not file_path.is_file():
                self.send_response(404)
                self.end_headers()
                return

            file_size = os.path.getsize(file_path)
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
        else:
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path in ("/", "/index.html"):
            self.send_html_response(200, TEST_PAGE_HTML)
        elif path == "/health":
            self.send_json_response(200, get_health_data())
        elif path.startswith("/jobs/"):
            job_id = path[len("/jobs/"):]
            with JOBS_LOCK:
                if job_id not in JOBS_STORE:
                    self.send_json_response(404, {"detail": "Job not found"})
                    return
                job_data = JOBS_STORE[job_id]
            self.send_json_response(200, job_data)
        elif path.startswith("/outputs/"):
            filename = path[len("/outputs/"):]
            safe_name = os.path.basename(filename)
            file_path = get_exports_dir() / safe_name
            if not file_path.is_file():
                self.send_json_response(404, {"detail": "Rendered file not found"})
                return

            file_size = os.path.getsize(file_path)
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(file_size))
            self.send_header("Content-Disposition", f'inline; filename="{safe_name}"')
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()

            try:
                with open(file_path, "rb") as f:
                    shutil.copyfileobj(f, self.wfile, length=64 * 1024)
            except (ConnectionResetError, BrokenPipeError):
                pass
        else:
            self.send_json_response(404, {"detail": "Not Found"})

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            content_length = 0

        content_type = self.headers.get("Content-Type", "")

        if path == "/render/json":
            if content_length <= 0:
                self.send_json_response(400, {"detail": "No JSON payload provided."})
                return

            try:
                body_bytes = self.rfile.read(content_length)
                req_json = json.loads(body_bytes.decode("utf-8"))
            except Exception as e:
                self.send_json_response(400, {"detail": f"Malformed JSON request: {str(e)}"})
                return

            try:
                result = start_json_render_job(req_json)
                self.send_json_response(200, result)
            except ValueError as e:
                self.send_json_response(400, {"detail": str(e)})
            except Exception as e:
                logger.exception("Failed to start JSON render job")
                self.send_json_response(500, {"detail": f"Internal server error: {str(e)}"})

        elif path in ("/render/multipart", "/render"):
            if content_length <= 0:
                self.send_json_response(400, {"detail": "No multipart payload provided."})
                return

            try:
                body_bytes = self.rfile.read(content_length)
                fields, files = parse_multipart_body(body_bytes, content_type)
            except Exception as e:
                self.send_json_response(400, {"detail": f"Malformed multipart payload: {str(e)}"})
                return

            try:
                result = start_multipart_render_job(fields, files)
                self.send_json_response(200, result)
            except ValueError as e:
                self.send_json_response(400, {"detail": str(e)})
            except Exception as e:
                logger.exception("Failed to start multipart render job")
                self.send_json_response(500, {"detail": f"Internal server error: {str(e)}"})

        else:
            self.send_json_response(404, {"detail": "Not Found"})


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded standard library HTTP Server."""
    daemon_threads = True
    allow_reuse_address = True


def create_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> ThreadedHTTPServer:
    return ThreadedHTTPServer((host, port), RenderRequestHandler)


def main():
    parser = argparse.ArgumentParser(description="LongFormAI Local Render Worker (FFmpeg - stdlib HTTP)")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Host address (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port number (default: {DEFAULT_PORT})")
    parser.add_argument("--exports-dir", default=None, help="Directory for exported video files")
    args = parser.parse_args()

    if args.exports_dir:
        CONFIG["exports_dir"] = str(Path(args.exports_dir).resolve())

    exports_path = get_exports_dir()
    ffmpeg_ok, ffmpeg_ver = check_ffmpeg_version()

    print("=" * 60)
    print(" LongFormAI - Local FFmpeg Render Worker (Step 9)")
    print("=" * 60)
    print(f" Engine:          FFmpeg 1920x1080 16:9 local rendering")
    print(f" Server Runtime:  Python stdlib ThreadedHTTPServer")
    print(f" Server URL:      http://{args.host}:{args.port}")
    print(f" Test Page:       http://{args.host}:{args.port}/")
    print(f" FFmpeg Status:   {'Available' if ffmpeg_ok else 'NOT FOUND'}")
    print(f" FFmpeg Version:  {ffmpeg_ver}")
    print(f" Exports Folder:  {exports_path}")
    print("=" * 60)

    if not ffmpeg_ok:
        logger.warning("WARNING: FFmpeg is not found in system PATH. Rendering will fail.")

    server = create_server(args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down render server...")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
