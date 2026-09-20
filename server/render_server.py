"""
LongFormAI (Project Hail Mary) - Local FFmpeg Render Worker
Renders 1920x1080 16:9 Long-Form Master MP4s locally using FFmpeg.
Zero cloud APIs, zero external requests, 100% local and private.
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from render_engine import get_media_dimensions, render_project

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("render_server")

BASE_DIR = Path(__file__).resolve().parent
EXPORTS_DIR = BASE_DIR / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="LongFormAI Local Render Worker",
    version="1.0.0",
    description="Local FFmpeg rendering engine for 1920x1080 16:9 MP4s"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Job status tracker
JOBS_LOCK = threading.Lock()
JOBS_STORE: Dict[str, Dict[str, Any]] = {}


def check_ffmpeg_version() -> Tuple[bool, str]:
    try:
        res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
        if res.returncode == 0:
            first_line = res.stdout.splitlines()[0] if res.stdout else "ffmpeg available"
            return True, first_line
        return False, "FFmpeg returned non-zero code"
    except Exception as e:
        return False, str(e)


@app.get("/health")
def health():
    ffmpeg_ok, ffmpeg_ver = check_ffmpeg_version()
    return {
        "status": "ok",
        "service": "LongFormAI Local Render Worker",
        "engine": "ffmpeg-local",
        "ffmpegAvailable": ffmpeg_ok,
        "ffmpegVersion": ffmpeg_ver,
        "exportsDir": str(EXPORTS_DIR),
    }


class RenderJsonRequest(BaseModel):
    project: Dict[str, Any]
    mediaFiles: Optional[Dict[str, str]] = {}
    voiceoverPath: Optional[str] = None
    outputFilename: Optional[str] = None


@app.post("/render/json")
def render_from_json(req: RenderJsonRequest):
    """
    Renders video when media files and voiceover are already local paths on disk.
    """
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    out_name = req.outputFilename or f"render_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    if not out_name.endswith(".mp4"):
        out_name += ".mp4"
    output_path = str(EXPORTS_DIR / out_name)

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
                project_data=req.project,
                media_file_map=req.mediaFiles or {},
                voiceover_path=req.voiceoverPath,
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


@app.post("/render")
async def render_from_form(
    project_json: str = Form(...),
    voiceover: Optional[UploadFile] = File(None),
):
    """
    Accepts project JSON string and optional uploaded voiceover and media files.
    """
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    try:
        project_data = json.loads(project_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project_json: {e}")

    job_temp_dir = tempfile.mkdtemp(prefix=f"render_job_{job_id}_")
    out_name = f"render_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    output_path = str(EXPORTS_DIR / out_name)

    # Save voiceover if uploaded
    voiceover_path = None
    if voiceover and voiceover.filename:
        v_ext = os.path.splitext(voiceover.filename)[1] or ".wav"
        v_save = os.path.join(job_temp_dir, f"voiceover{v_ext}")
        with open(v_save, "wb") as f:
            content = await voiceover.read()
            f.write(content)
        voiceover_path = v_save

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

    # Execute render synchronously in thread pool or background thread
    def run_worker():
        try:
            res = render_project(
                project_data=project_data,
                media_file_map={},
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


@app.post("/render/multipart")
async def render_multipart(
    project_json: str = Form(...),
    voiceover: Optional[UploadFile] = File(None),
    media_files: List[UploadFile] = File([]),
):
    """
    Accepts multipart upload containing:
    - project_json
    - voiceover audio file
    - list of media_files with original filenames or mediaId prefixes
    """
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    try:
        project_data = json.loads(project_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project_json: {e}")

    job_temp_dir = tempfile.mkdtemp(prefix=f"render_job_{job_id}_")
    out_name = f"render_{int(time.time())}_{uuid.uuid4().hex[:6]}.mp4"
    output_path = str(EXPORTS_DIR / out_name)

    # Save uploaded voiceover
    voiceover_path = None
    if voiceover and voiceover.filename:
        v_ext = os.path.splitext(voiceover.filename)[1] or ".wav"
        v_save = os.path.join(job_temp_dir, f"voiceover{v_ext}")
        with open(v_save, "wb") as f:
            content = await voiceover.read()
            f.write(content)
        voiceover_path = v_save

    # Save uploaded media files and map them to mediaId
    media_file_map: Dict[str, str] = {}
    
    # Also index media assets in project by id and name
    project_media = project_data.get("media", [])
    media_name_to_id = {m.get("name"): m.get("id") for m in project_media if "name" in m and "id" in m}
    media_ids = {m.get("id"): m for m in project_media if "id" in m}

    for mf in media_files:
        if not mf.filename:
            continue
        m_filename = mf.filename
        m_save = os.path.join(job_temp_dir, m_filename)
        with open(m_save, "wb") as f:
            content = await mf.read()
            f.write(content)
            
        # Match by exact id or filename
        matched_id = None
        if m_filename in media_ids:
            matched_id = m_filename
        elif m_filename in media_name_to_id:
            matched_id = media_name_to_id[m_filename]
        else:
            # Check if filename starts with id_
            for mid in media_ids:
                if m_filename.startswith(mid):
                    matched_id = mid
                    break
                    
        if matched_id:
            media_file_map[matched_id] = m_save
        else:
            # Fallback: store by filename as key too
            media_file_map[m_filename] = m_save

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


@app.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    with JOBS_LOCK:
        if job_id not in JOBS_STORE:
            raise HTTPException(status_code=404, detail="Job not found")
        return JOBS_STORE[job_id]


@app.get("/outputs/{filename}")
def get_rendered_video(filename: str):
    # Sanitize filename
    safe_name = os.path.basename(filename)
    file_path = EXPORTS_DIR / safe_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Rendered file not found")
    return FileResponse(
        str(file_path),
        media_type="video/mp4",
        filename=safe_name,
    )


def main():
    parser = argparse.ArgumentParser(description="LongFormAI Local Render Worker")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8768, help="Port number (default: 8768)")
    args = parser.parse_args()

    ffmpeg_ok, ffmpeg_ver = check_ffmpeg_version()

    print("=" * 60)
    print(" LongFormAI - Local FFmpeg Render Worker (Step 9)")
    print("=" * 60)
    print(f" Server URL:      http://{args.host}:{args.port}")
    print(f" FFmpeg Status:   {'Available' if ffmpeg_ok else 'NOT FOUND'}")
    print(f" FFmpeg Version:  {ffmpeg_ver}")
    print(f" Exports Folder:  {EXPORTS_DIR}")
    print("=" * 60)

    if not ffmpeg_ok:
        logger.warning("WARNING: FFmpeg is not found in system PATH. Rendering will fail.")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
