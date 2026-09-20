"""
LongFormAI (Project Hail Mary) - Local Transcription Worker
Uses faster-whisper locally with zero cloud APIs or external services.
"""

import os
import tempfile
import argparse
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from faster_whisper import WhisperModel

# Initialize FastAPI application
app = FastAPI(
    title="LongFormAI Local Transcription Worker",
    version="1.0.0",
    description="Local speech-to-text worker powered by faster-whisper"
)

# Enable CORS for local web interface
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache to avoid reloading on each request
MODEL_CACHE = {}
DEFAULT_MODEL_SIZE = "base"
DEFAULT_DEVICE = "cpu"
DEFAULT_COMPUTE_TYPE = "int8"

def get_whisper_model(
    model_size: str = DEFAULT_MODEL_SIZE,
    device: str = DEFAULT_DEVICE,
    compute_type: str = DEFAULT_COMPUTE_TYPE
) -> WhisperModel:
    cache_key = f"{model_size}_{device}_{compute_type}"
    if cache_key not in MODEL_CACHE:
        print(f"[LongFormAI Worker] Loading local faster-whisper model '{model_size}' on {device} ({compute_type})...")
        MODEL_CACHE[cache_key] = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type
        )
        print(f"[LongFormAI Worker] Model '{model_size}' loaded successfully.")
    return MODEL_CACHE[cache_key]


class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float
    confidence: Optional[float] = None


class TranscriptSegment(BaseModel):
    id: str
    start: float
    end: float
    text: str
    confidence: Optional[float] = None
    words: Optional[List[WordTimestamp]] = None


class TranscriptionResponse(BaseModel):
    status: str
    duration: float
    language: str
    model: str
    segments: List[TranscriptSegment]


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "LongFormAI Local Transcription Worker",
        "engine": "faster-whisper",
        "default_model": DEFAULT_MODEL_SIZE,
        "default_device": DEFAULT_DEVICE,
        "compute_type": DEFAULT_COMPUTE_TYPE,
    }


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    model_size: Optional[str] = Form(DEFAULT_MODEL_SIZE),
    language: Optional[str] = Form(None),
    word_timestamps: Optional[bool] = Form(True),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No audio file provided.")

    # Write uploaded audio to a temporary file
    suffix = os.path.splitext(file.filename)[1] or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_path = tmp_file.name
        content = await file.read()
        tmp_file.write(content)

    try:
        whisper_model = get_whisper_model(
            model_size=model_size or DEFAULT_MODEL_SIZE,
            device=DEFAULT_DEVICE,
            compute_type=DEFAULT_COMPUTE_TYPE
        )

        segments_generator, info = whisper_model.transcribe(
            tmp_path,
            language=language if language and language != "auto" else None,
            word_timestamps=word_timestamps,
            beam_size=5,
            vad_filter=True, # Voice activity detection to trim silence
        )

        transcript_segments: List[TranscriptSegment] = []
        for i, segment in enumerate(segments_generator):
            words = []
            if segment.words:
                for w in segment.words:
                    words.append(WordTimestamp(
                        word=w.word.strip(),
                        start=round(w.start, 2),
                        end=round(w.end, 2),
                        confidence=round(w.probability, 2) if hasattr(w, "probability") else None,
                    ))

            transcript_segments.append(TranscriptSegment(
                id=f"seg_{i+1}_{int(segment.start*100)}",
                start=round(segment.start, 2),
                end=round(segment.end, 2),
                text=segment.text.strip(),
                confidence=round(segment.avg_logprob, 2) if hasattr(segment, "avg_logprob") else None,
                words=words if words else None,
            ))

        return TranscriptionResponse(
            status="success",
            duration=round(info.duration, 2),
            language=info.language,
            model=model_size or DEFAULT_MODEL_SIZE,
            segments=transcript_segments
        )

    except Exception as e:
        print(f"[LongFormAI Worker Error] Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Local transcription failed: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="LongFormAI Local Transcription Worker")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port number (default: 8765)")
    parser.add_argument("--model", default="base", help="Whisper model size (tiny, base, small, medium)")
    parser.add_argument("--device", default="cpu", help="Device to run on (cpu, cuda)")
    args = parser.parse_args()

    global DEFAULT_MODEL_SIZE, DEFAULT_DEVICE
    DEFAULT_MODEL_SIZE = args.model
    DEFAULT_DEVICE = args.device

    print("=" * 60)
    print(" LongFormAI - Local Transcription Worker (Project Hail Mary)")
    print("=" * 60)
    print(f" Engine:        faster-whisper")
    print(f" Default Model: {DEFAULT_MODEL_SIZE}")
    print(f" Device:        {DEFAULT_DEVICE}")
    print(f" Server URL:    http://{args.host}:{args.port}")
    print("=" * 60)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
