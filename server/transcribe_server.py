"""
LongFormAI (Project Hail Mary) - Local Transcription Worker
Uses native whisper.cpp locally with zero cloud APIs or external services.
Pure Python standard library HTTP server - zero third-party dependencies (no FastAPI, no Pydantic, no Rust).
Optimized for Termux / Android / ARM64 / CPU execution.
"""

import os
import sys
import json
import re
import shutil
import tempfile
import argparse
import subprocess
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Optional, List, Dict, Any, Tuple


# Configuration defaults
DEFAULT_BIN_PATH = os.getenv("WHISPER_CPP_BIN", "~/whisper.cpp/build/bin/whisper-cli")
DEFAULT_MODEL_PATH = os.getenv("WHISPER_CPP_MODEL", "~/whisper.cpp/models/ggml-base.bin")
DEFAULT_THREADS = int(os.getenv("WHISPER_THREADS", "4"))
DEFAULT_DEVICE = "cpu"

CONFIG = {
    "bin_path": DEFAULT_BIN_PATH,
    "model_path": DEFAULT_MODEL_PATH,
    "threads": DEFAULT_THREADS,
    "device": DEFAULT_DEVICE,
}

TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LongFormAI Transcription Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      line-height: 1.5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 8px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .url-badge {
      display: inline-block;
      background: #334155;
      color: #94a3b8;
      padding: 4px 8px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
      margin-bottom: 16px;
      word-break: break-all;
    }
    label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 6px;
      margin-top: 12px;
    }
    label:first-of-type { margin-top: 0; }
    input[type="file"], select, input[type="text"] {
      width: 100%;
      padding: 10px;
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 6px;
      color: #f8fafc;
      font-size: 0.95rem;
    }
    input[type="file"]::file-selector-button {
      background: #38bdf8;
      border: none;
      color: #0f172a;
      padding: 6px 12px;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      margin-right: 10px;
    }
    button {
      width: 100%;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;
      transition: background 0.2s;
    }
    button:hover:not(:disabled) { background: #1d4ed8; }
    button:disabled {
      background: #475569;
      cursor: not-allowed;
      opacity: 0.7;
    }
    .status-box {
      margin-top: 12px;
      padding: 12px;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .status-box.loading {
      background: #0369a1;
      color: #e0f2fe;
    }
    .status-box.error {
      background: #7f1d1d;
      border: 1px solid #b91c1c;
      color: #fecaca;
    }
    .status-box.success {
      background: #064e3b;
      border: 1px solid #059669;
      color: #d1fae5;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }
    .meta-item {
      background: #0f172a;
      padding: 8px;
      border-radius: 6px;
      font-size: 0.85rem;
    }
    .meta-item span {
      display: block;
      color: #94a3b8;
      font-size: 0.75rem;
    }
    .segment {
      background: #0f172a;
      border-left: 3px solid #38bdf8;
      padding: 10px;
      margin-top: 8px;
      border-radius: 0 6px 6px 0;
    }
    .seg-time {
      font-family: monospace;
      font-size: 0.75rem;
      color: #38bdf8;
      margin-bottom: 4px;
    }
    .seg-text {
      font-size: 0.95rem;
      color: #f1f5f9;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>LongFormAI Transcription Test</h1>
    <div class="url-badge" id="workerUrlBadge">Worker: checking...</div>

    <div class="card">
      <form id="transcribeForm">
        <label for="audioFile">Audio File (e.g. sample.m4a, .mp3, .wav):</label>
        <input type="file" id="audioFile" name="file" accept="audio/*" required>

        <label for="modelSize">Model Size:</label>
        <select id="modelSize" name="model_size">
          <option value="base" selected>base (Default)</option>
          <option value="tiny">tiny (Fastest)</option>
          <option value="small">small</option>
          <option value="medium">medium</option>
        </select>

        <label for="language">Language (Optional):</label>
        <input type="text" id="language" name="language" placeholder="auto (or en, es, fr...)" value="auto">

        <button type="submit" id="submitBtn">Transcribe Audio</button>
      </form>

      <div id="statusBox" class="status-box hidden"></div>
    </div>

    <div id="resultsCard" class="card hidden">
      <h2 style="font-size: 1.1rem; color: #38bdf8; margin-bottom: 8px;">Results</h2>
      <div class="meta-grid">
        <div class="meta-item"><span>HTTP Status</span><strong id="resHttp">-</strong></div>
        <div class="meta-item"><span>Result Status</span><strong id="resStatus">-</strong></div>
        <div class="meta-item"><span>Model</span><strong id="resModel">-</strong></div>
        <div class="meta-item"><span>Language</span><strong id="resLang">-</strong></div>
        <div class="meta-item" style="grid-column: span 2;"><span>Duration</span><strong id="resDuration">-</strong></div>
      </div>

      <h3 style="font-size: 0.95rem; color: #cbd5e1; margin-top: 16px; margin-bottom: 6px;">Segments (<span id="segCount">0</span>)</h3>
      <div id="segmentsList"></div>
    </div>
  </div>

  <script>
    const workerUrl = window.location.origin;
    document.getElementById('workerUrlBadge').textContent = 'Worker: ' + workerUrl;

    const form = document.getElementById('transcribeForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusBox = document.getElementById('statusBox');
    const resultsCard = document.getElementById('resultsCard');
    const segmentsList = document.getElementById('segmentsList');

    function formatTime(secs) {
      const m = Math.floor(secs / 60);
      const s = (secs % 60).toFixed(2);
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('audioFile');
      if (!fileInput.files || !fileInput.files[0]) {
        alert('Please select an audio file.');
        return;
      }

      const file = fileInput.files[0];
      const modelSize = document.getElementById('modelSize').value;
      const language = document.getElementById('language').value.trim();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('model_size', modelSize);
      if (language && language !== 'auto') {
        formData.append('language', language);
      }

      submitBtn.disabled = true;
      statusBox.className = 'status-box loading';
      statusBox.textContent = `Uploading "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB) and transcribing with whisper.cpp...`;
      statusBox.classList.remove('hidden');
      resultsCard.classList.add('hidden');
      segmentsList.innerHTML = '';

      const startTime = performance.now();

      try {
        const res = await fetch(`${workerUrl}/transcribe`, {
          method: 'POST',
          body: formData
        });

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        const data = await res.json();

        if (!res.ok) {
          statusBox.className = 'status-box error';
          statusBox.textContent = `Transcription failed (HTTP ${res.status}): ${data.detail || JSON.stringify(data)}`;
          submitBtn.disabled = false;
          return;
        }

        statusBox.className = 'status-box success';
        statusBox.textContent = `Transcription completed successfully in ${elapsed}s!`;

        document.getElementById('resHttp').textContent = `${res.status} OK`;
        document.getElementById('resStatus').textContent = data.status;
        document.getElementById('resModel').textContent = data.model;
        document.getElementById('resLang').textContent = data.language;
        document.getElementById('resDuration').textContent = `${data.duration}s (${formatTime(data.duration)})`;

        const segments = data.segments || [];
        document.getElementById('segCount').textContent = segments.length;

        if (segments.length === 0) {
          segmentsList.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 8px;">No speech detected in audio.</div>';
        } else {
          segments.forEach((seg) => {
            const segEl = document.createElement('div');
            segEl.className = 'segment';
            const timeSpan = `${formatTime(seg.start)} -> ${formatTime(seg.end)} [${seg.id}]`;
            const conf = seg.confidence !== null && seg.confidence !== undefined ? ` (conf: ${seg.confidence})` : '';
            segEl.innerHTML = `<div class="seg-time">${timeSpan}${conf}</div><div class="seg-text">${seg.text}</div>`;
            segmentsList.appendChild(segEl);
          });
        }

        resultsCard.classList.remove('hidden');
      } catch (err) {
        statusBox.className = 'status-box error';
        statusBox.textContent = `Network / Request Error: ${err.message}`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
"""


class BinaryNotFoundError(Exception):
    """Raised when whisper-cli binary cannot be found."""
    pass


class ModelNotFoundError(Exception):
    """Raised when ggml model file cannot be found."""
    pass


def expand_path(p: str) -> str:
    """Expands ~ and environment variables, returning absolute path."""
    return os.path.abspath(os.path.expanduser(os.path.expandvars(p)))


def resolve_binary_path(custom_bin: Optional[str] = None) -> Optional[str]:
    """
    Finds the whisper-cli executable.
    Checks custom path, configured path, PATH environment, and common Termux/Linux locations.
    """
    candidates = []
    if custom_bin:
        candidates.append(custom_bin)
    if CONFIG["bin_path"]:
        candidates.append(CONFIG["bin_path"])

    # Common binary paths
    candidates.extend([
        "~/whisper.cpp/build/bin/whisper-cli",
        "~/whisper.cpp/main",
        "~/whisper.cpp/whisper-cli",
        "/data/data/com.termux/files/home/whisper.cpp/build/bin/whisper-cli",
        "/data/data/com.termux/files/home/whisper.cpp/main",
        "/usr/local/bin/whisper-cli",
        "/usr/bin/whisper-cli",
    ])

    for c in candidates:
        exp = expand_path(c)
        if os.path.isfile(exp) and os.access(exp, os.X_OK if hasattr(os, "X_OK") else os.R_OK):
            return exp

    # Check system PATH
    which_cli = shutil.which("whisper-cli") or shutil.which("whisper-cpp") or shutil.which("main")
    if which_cli:
        return os.path.abspath(which_cli)

    return None


def resolve_model_path(custom_model_or_size: Optional[str] = None) -> Optional[str]:
    """
    Finds the ggml model file.
    Accepts full path or size shortcut (e.g., 'tiny', 'base', 'small', 'medium').
    """
    target = custom_model_or_size or CONFIG["model_path"]
    candidates = []

    # If it looks like a size name, generate candidate paths
    if target in ["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large", "large-v3"]:
        size = target
        candidates.extend([
            f"~/whisper.cpp/models/ggml-{size}.bin",
            f"models/ggml-{size}.bin",
            f"/data/data/com.termux/files/home/whisper.cpp/models/ggml-{size}.bin",
        ])
    else:
        candidates.append(target)

    # Add default fallbacks
    candidates.extend([
        CONFIG["model_path"],
        "~/whisper.cpp/models/ggml-base.bin",
        "models/ggml-base.bin",
        "/data/data/com.termux/files/home/whisper.cpp/models/ggml-base.bin",
    ])

    for c in candidates:
        exp = expand_path(c)
        if os.path.isfile(exp):
            return exp

    return None


def parse_timestamp_str(ts_str: str) -> float:
    """
    Parses timestamp string like '00:01:23,450' or '01:23.450' or '12.34' into seconds.
    """
    ts_str = ts_str.strip().replace(",", ".")
    parts = ts_str.split(":")
    try:
        if len(parts) == 3:
            return float(parts[0]) * 3600.0 + float(parts[1]) * 60.0 + float(parts[2])
        elif len(parts) == 2:
            return float(parts[0]) * 60.0 + float(parts[1])
        elif len(parts) == 1:
            return float(parts[0])
    except ValueError:
        pass
    return 0.0


def extract_time_seconds(val: Any) -> float:
    """Extracts seconds from integer/float (milliseconds or seconds) or timestamp string."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val) / 1000.0 if val > 100000 or (isinstance(val, int) and val > 600) else float(val)
    if isinstance(val, str):
        return parse_timestamp_str(val)
    return 0.0


def parse_whisper_json(data: Dict[str, Any], requested_model: str) -> Dict[str, Any]:
    """
    Parses whisper.cpp JSON output into standardized dictionary matching TranscriptionResponse schema.
    """
    result_meta = data.get("result", {})
    language = result_meta.get("language") or data.get("model", {}).get("language") or "en"

    raw_segments = data.get("transcription", [])
    segments: List[Dict[str, Any]] = []
    max_end_time = 0.0

    for i, seg in enumerate(raw_segments):
        text = seg.get("text", "").strip()

        # Parse segment start and end
        start = 0.0
        end = 0.0

        if "offsets" in seg and isinstance(seg["offsets"], dict):
            start = seg["offsets"].get("from", 0) / 1000.0
            end = seg["offsets"].get("to", 0) / 1000.0
        elif "timestamps" in seg and isinstance(seg["timestamps"], dict):
            start = parse_timestamp_str(str(seg["timestamps"].get("from", "0")))
            end = parse_timestamp_str(str(seg["timestamps"].get("to", "0")))
        elif "t0" in seg and "t1" in seg:
            start = float(seg["t0"]) * 0.01
            end = float(seg["t1"]) * 0.01

        start = round(start, 2)
        end = round(end, 2)
        if end > max_end_time:
            max_end_time = end

        # Parse word/token timestamps
        words: List[Dict[str, Any]] = []
        tokens = seg.get("tokens", []) or seg.get("words", [])
        token_probs = []

        for tok in tokens:
            tok_text = tok.get("text", "").strip()
            if not tok_text:
                continue

            tok_start = start
            tok_end = end
            if "offsets" in tok and isinstance(tok["offsets"], dict):
                tok_start = tok["offsets"].get("from", 0) / 1000.0
                tok_end = tok["offsets"].get("to", 0) / 1000.0
            elif "timestamps" in tok and isinstance(tok["timestamps"], dict):
                tok_start = parse_timestamp_str(str(tok["timestamps"].get("from", "0")))
                tok_end = parse_timestamp_str(str(tok["timestamps"].get("to", "0")))
            elif "t0" in tok and "t1" in tok:
                tok_start = float(tok["t0"]) * 0.01
                tok_end = float(tok["t1"]) * 0.01

            prob = tok.get("p") if "p" in tok else tok.get("prob")
            confidence = round(float(prob), 2) if prob is not None else None
            if confidence is not None:
                token_probs.append(confidence)

            words.append({
                "word": tok_text,
                "start": round(tok_start, 2),
                "end": round(tok_end, 2),
                "confidence": confidence,
            })

        seg_confidence = None
        if token_probs:
            seg_confidence = round(sum(token_probs) / len(token_probs), 2)
        elif "confidence" in seg:
            seg_confidence = round(float(seg["confidence"]), 2)
        elif "p" in seg:
            seg_confidence = round(float(seg["p"]), 2)

        seg_id = f"seg_{i+1}_{int(start*100)}"

        segments.append({
            "id": seg_id,
            "start": start,
            "end": end,
            "text": text,
            "confidence": seg_confidence,
            "words": words if words else None,
        })

    return {
        "status": "success",
        "duration": round(max_end_time, 2),
        "language": language,
        "model": requested_model,
        "segments": segments,
    }


def convert_audio_to_wav(input_path: str, output_wav_path: str) -> None:
    """Converts any audio file to 16kHz mono 16-bit PCM WAV required by whisper.cpp."""
    ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", input_path,
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        output_wav_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if res.returncode != 0:
            err_msg = res.stderr.decode("utf-8", errors="replace")
            raise RuntimeError(f"FFmpeg audio conversion failed: {err_msg}")
    except FileNotFoundError:
        if input_path.lower().endswith(".wav"):
            shutil.copyfile(input_path, output_wav_path)
        else:
            raise RuntimeError("ffmpeg not found in PATH. ffmpeg is required to convert audio to 16kHz WAV for whisper.cpp.")


def run_transcription(
    audio_bytes: bytes,
    filename: str,
    model_size: str = "base",
    language: Optional[str] = None,
    word_timestamps: bool = True,
) -> Dict[str, Any]:
    """
    Executes native whisper.cpp transcription on provided audio bytes.
    """
    bin_path = resolve_binary_path()
    if not bin_path:
        raise BinaryNotFoundError(
            f"whisper.cpp binary not found. Expected at '{CONFIG['bin_path']}' or in PATH."
        )

    model_path = resolve_model_path(model_size)
    if not model_path:
        raise ModelNotFoundError(
            f"whisper.cpp ggml model not found. Expected at '{CONFIG['model_path']}' or for size '{model_size}'."
        )

    with tempfile.TemporaryDirectory() as temp_dir:
        suffix = os.path.splitext(filename)[1] or ".mp3"
        raw_audio_path = os.path.join(temp_dir, f"input_raw{suffix}")
        wav_path = os.path.join(temp_dir, "input_16k.wav")
        out_prefix = os.path.join(temp_dir, "whisper_out")

        with open(raw_audio_path, "wb") as f:
            f.write(audio_bytes)

        convert_audio_to_wav(raw_audio_path, wav_path)

        cmd = [
            bin_path,
            "-m", model_path,
            "-f", wav_path,
            "-t", str(CONFIG["threads"]),
            "-oj",
            "-of", out_prefix,
        ]

        if language and language.lower() not in ["auto", ""]:
            cmd.extend(["-l", language.lower()])
        else:
            cmd.extend(["-l", "auto"])

        if word_timestamps:
            cmd.append("-ml")
            cmd.append("1")

        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False
        )

        if res.returncode != 0:
            raise RuntimeError(
                f"whisper-cli execution failed (code {res.returncode}): {res.stderr[:500]}"
            )

        expected_json = f"{out_prefix}.json"
        alt_json = f"{wav_path}.json"

        json_file_to_read = None
        if os.path.isfile(expected_json):
            json_file_to_read = expected_json
        elif os.path.isfile(alt_json):
            json_file_to_read = alt_json

        if not json_file_to_read:
            raise RuntimeError("whisper-cli completed but did not produce output JSON file.")

        with open(json_file_to_read, "r", encoding="utf-8") as jf:
            data = json.load(jf)

        return parse_whisper_json(data, requested_model=model_size or "base")


def parse_multipart_body(body: bytes, content_type_header: str) -> Tuple[Dict[str, str], Dict[str, Dict[str, Any]]]:
    """
    Pure Python standard-library multipart/form-data parser (Python 3.10-3.14+ compatible).
    Returns (fields_dict, files_dict).
    """
    fields: Dict[str, str] = {}
    files: Dict[str, Dict[str, Any]] = {}

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
        name_match = re.search(r'name="([^"]+)"', cd)
        if not name_match:
            continue
        field_name = name_match.group(1)

        filename_match = re.search(r'filename="([^"]+)"', cd)
        if filename_match:
            filename = filename_match.group(1)
            files[field_name] = {
                "filename": filename,
                "content": payload,
                "content_type": headers.get("content-type", "application/octet-stream"),
            }
        else:
            fields[field_name] = payload.decode("utf-8", errors="replace")

    return fields, files


class TranscriptionRequestHandler(BaseHTTPRequestHandler):
    """
    Standard library HTTP request handler for the transcription worker.
    """
    def log_message(self, format, *args):
        pass

    def send_html_response(self, status_code: int, html_str: str):
        body = html_str.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_json_response(self, status_code: int, data: Dict[str, Any]):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path in ("/", "/index.html"):
            self.send_html_response(200, TEST_PAGE_HTML)
        elif parsed_url.path == "/health":
            bin_path = resolve_binary_path()
            model_path = resolve_model_path()
            bin_ok = bool(bin_path and os.path.isfile(bin_path))
            model_ok = bool(model_path and os.path.isfile(model_path))

            health_data = {
                "status": "ok",
                "service": "LongFormAI Local Transcription Worker",
                "engine": "whisper.cpp",
                "binary_path": bin_path or CONFIG["bin_path"],
                "binary_available": bin_ok,
                "model_path": model_path or CONFIG["model_path"],
                "model_available": model_ok,
                "threads": CONFIG["threads"],
                "device": CONFIG["device"],
                "default_model": os.path.basename(model_path) if model_path else "base",
                "default_device": CONFIG["device"],
            }
            self.send_json_response(200, health_data)
        else:
            self.send_json_response(404, {"detail": "Not Found"})

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path != "/transcribe":
            self.send_json_response(404, {"detail": "Not Found"})
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self.send_json_response(400, {"detail": "Expected multipart/form-data Content-Type"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            content_length = 0

        if content_length <= 0:
            self.send_json_response(400, {"detail": "No audio file provided."})
            return

        body = self.rfile.read(content_length)
        fields, files = parse_multipart_body(body, content_type)

        audio_file = files.get("file")
        if not audio_file or not audio_file.get("content"):
            self.send_json_response(400, {"detail": "No audio file provided."})
            return

        model_size = fields.get("model_size") or fields.get("model") or "base"
        language = fields.get("language")
        word_timestamps = fields.get("word_timestamps", "true").lower() in ("true", "1", "yes")

        try:
            result = run_transcription(
                audio_bytes=audio_file["content"],
                filename=audio_file.get("filename", "voiceover.mp3"),
                model_size=model_size,
                language=language,
                word_timestamps=word_timestamps
            )
            self.send_json_response(200, result)
        except BinaryNotFoundError as e:
            self.send_json_response(503, {"detail": str(e)})
        except ModelNotFoundError as e:
            self.send_json_response(503, {"detail": str(e)})
        except Exception as e:
            print(f"[LongFormAI whisper.cpp Error]: {e}")
            self.send_json_response(500, {"detail": f"Local transcription failed: {str(e)}"})


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded standard library HTTP Server."""
    daemon_threads = True
    allow_reuse_address = True


def create_server(host: str = "127.0.0.1", port: int = 8765) -> ThreadedHTTPServer:
    return ThreadedHTTPServer((host, port), TranscriptionRequestHandler)


def main():
    parser = argparse.ArgumentParser(description="LongFormAI Local Transcription Worker (whisper.cpp - stdlib HTTP)")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port number (default: 8765)")
    parser.add_argument("--bin", "--whisper-bin", dest="whisper_bin", default=None, help="Path to whisper-cli binary")
    parser.add_argument("--model", "--whisper-model", dest="whisper_model", default=None, help="Path to ggml model file or model size")
    parser.add_argument("--threads", type=int, default=None, help="Number of CPU threads (default: 4)")
    parser.add_argument("--device", default="cpu", help="Device (default: cpu)")
    args = parser.parse_args()

    if args.whisper_bin:
        CONFIG["bin_path"] = args.whisper_bin
    if args.whisper_model:
        CONFIG["model_path"] = args.whisper_model
    if args.threads:
        CONFIG["threads"] = args.threads
    if args.device:
        CONFIG["device"] = args.device

    resolved_bin = resolve_binary_path()
    resolved_model = resolve_model_path()

    print("=" * 60)
    print(" LongFormAI - Local Transcription Worker (Project Hail Mary)")
    print("=" * 60)
    print(f" Engine:          whisper.cpp (native)")
    print(f" Server Runtime:  Python stdlib ThreadedHTTPServer")
    print(f" Test Page:       http://{args.host}:{args.port}/")
    print(f" Binary Path:     {resolved_bin or CONFIG['bin_path']} {'[OK]' if resolved_bin else '[NOT FOUND]'}")
    print(f" Model Path:      {resolved_model or CONFIG['model_path']} {'[OK]' if resolved_model else '[NOT FOUND]'}")
    print(f" Threads:         {CONFIG['threads']}")
    print(f" Device:          {CONFIG['device']}")
    print(f" Server URL:      http://{args.host}:{args.port}")
    print("=" * 60)

    server = create_server(args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
