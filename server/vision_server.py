"""
LongFormAI (Project Hail Mary) - Local Semantic Vision Worker
Analyzes representative image/video frames locally using vision models (Salesforce/BLIP).
Zero cloud APIs, zero external requests.
Supports complete offline inference once model is cached locally.
No fake heuristics or fallback text when model is unavailable.
"""

import os
import io
import re
import base64
import argparse
import threading
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from PIL import Image

try:
    from huggingface_hub import try_to_load_from_cache
except ImportError:
    try_to_load_from_cache = None

app = FastAPI(
    title="LongFormAI Local Vision Worker",
    version="1.1.0",
    description="Local semantic visual analysis worker with offline support and strict honesty"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Configuration
DEFAULT_MODEL_NAME = "Salesforce/blip-image-captioning-base"
DEFAULT_DEVICE = "cpu"

# Runtime State
VISION_MODEL = None
VISION_PROCESSOR = None
MODEL_LOCK = threading.Lock()
MODEL_STATE = {
    "state": "uninitialized",  # "ready", "loading", "model_not_installed", "error"
    "error": None,
    "cached": False,
    "loaded": False,
}

STOP_WORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with", "by", "of", "from",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
    "there", "this", "that", "these", "those", "it", "its", "shows", "showing", "view", "image", "picture", "photo"
}


def check_is_cached(model_name: str = DEFAULT_MODEL_NAME) -> bool:
    """Checks if the required model weights exist in the local HuggingFace cache."""
    if try_to_load_from_cache is None:
        return False
    try:
        weight_path = try_to_load_from_cache(model_name, "pytorch_model.bin")
        config_path = try_to_load_from_cache(model_name, "config.json")
        return weight_path is not None and config_path is not None
    except Exception:
        return False


def extract_tags_from_text(text: str, max_tags: int = 6) -> List[str]:
    """Extract clean semantic keywords from generated caption."""
    words = re.findall(r'[a-zA-Z]{3,}', text.lower())
    filtered = [w for w in words if w not in STOP_WORDS]
    seen = set()
    tags = []
    for w in filtered:
        if w not in seen:
            seen.add(w)
            tags.append(w)
        if len(tags) >= max_tags:
            break
    return tags


def load_vision_model(model_name: str = DEFAULT_MODEL_NAME, device: str = DEFAULT_DEVICE):
    """Loads model from local cache or offline storage."""
    global VISION_MODEL, VISION_PROCESSOR, MODEL_STATE
    with MODEL_LOCK:
        if VISION_MODEL is not None and VISION_PROCESSOR is not None:
            MODEL_STATE["state"] = "ready"
            MODEL_STATE["loaded"] = True
            MODEL_STATE["cached"] = True
            return

        is_cached = check_is_cached(model_name)
        MODEL_STATE["cached"] = is_cached

        if not is_cached:
            MODEL_STATE["state"] = "model_not_installed"
            MODEL_STATE["loaded"] = False
            MODEL_STATE["error"] = f"Model '{model_name}' is not cached locally. Run 'python server/download_model.py'."
            print(f"[LongFormAI Vision Worker] Model '{model_name}' not found in local cache.")
            return

        try:
            MODEL_STATE["state"] = "loading"
            print(f"[LongFormAI Vision Worker] Loading '{model_name}' from local cache on {device} (100% offline)...")
            from transformers import BlipProcessor, BlipForConditionalGeneration

            processor = BlipProcessor.from_pretrained(model_name, local_files_only=True)
            model = BlipForConditionalGeneration.from_pretrained(model_name, local_files_only=True).to(device)
            model.eval()

            VISION_PROCESSOR = processor
            VISION_MODEL = model
            MODEL_STATE["state"] = "ready"
            MODEL_STATE["loaded"] = True
            MODEL_STATE["error"] = None
            print(f"[LongFormAI Vision Worker] Vision model '{model_name}' loaded successfully and ready for offline inference.")
        except Exception as e:
            MODEL_STATE["state"] = "error"
            MODEL_STATE["loaded"] = False
            MODEL_STATE["error"] = str(e)
            print(f"[LongFormAI Vision Worker Error] Failed to load BLIP model: {e}")


def decode_image(image_bytes_or_base64: str) -> Image.Image:
    """Decodes data URL, base64 string, or raw image bytes into a PIL Image."""
    if image_bytes_or_base64.startswith("data:image"):
        header, base64_str = image_bytes_or_base64.split(",", 1)
        image_data = base64.b64decode(base64_str)
    else:
        try:
            image_data = base64.b64decode(image_bytes_or_base64)
        except Exception:
            raise ValueError("Invalid image base64 data")

    img = Image.open(io.BytesIO(image_data))
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def compute_image_difference(img1: Image.Image, img2: Image.Image) -> float:
    """Computes normalized mean absolute pixel difference between two images."""
    try:
        g1 = img1.convert("L").resize((64, 36), Image.Resampling.BILINEAR)
        g2 = img2.convert("L").resize((64, 36), Image.Resampling.BILINEAR)
        b1 = g1.tobytes()
        b2 = g2.tobytes()
        total_diff = sum(abs(a - b) for a, b in zip(b1, b2))
        return total_diff / (len(b1) * 255.0)
    except Exception:
        return 0.0


def run_caption_inference(pil_img: Image.Image, device: str = DEFAULT_DEVICE) -> str:
    """Runs genuine BLIP captioning inference on an image. Raises RuntimeError if model unavailable."""
    if VISION_MODEL is None or VISION_PROCESSOR is None:
        raise RuntimeError("Vision model is not loaded. Cannot run semantic captioning.")

    inputs = VISION_PROCESSOR(pil_img, return_tensors="pt").to(device)
    out = VISION_MODEL.generate(**inputs, max_new_tokens=40)
    caption = VISION_PROCESSOR.decode(out[0], skip_special_tokens=True).strip()
    return caption.capitalize() if caption else "Scene with no distinct subject."


class FrameAnalysisRequest(BaseModel):
    imageData: str
    time: Optional[float] = 0.0


class KeyframeItem(BaseModel):
    time: float
    imageData: str


class MediaSemanticRequest(BaseModel):
    isVideo: bool
    duration: Optional[float] = 0.0
    keyframes: List[KeyframeItem]


class KeyframeSemantic(BaseModel):
    time: float
    description: str
    tags: List[str]
    isKeyMoment: Optional[bool] = False


class VisualChangeSegment(BaseModel):
    fromTime: float
    toTime: float
    differenceScore: float
    description: str


class MediaSemanticResponse(BaseModel):
    status: str
    description: str
    tags: List[str]
    keyframeDescriptions: List[KeyframeSemantic]
    temporalSummary: Optional[str] = None
    hasVisualChange: Optional[bool] = False
    visualChanges: Optional[List[VisualChangeSegment]] = []
    modelUsed: str


@app.get("/health")
def health():
    is_cached = check_is_cached(DEFAULT_MODEL_NAME)
    is_loaded = VISION_MODEL is not None and VISION_PROCESSOR is not None
    state = "ready" if is_loaded else ("model_not_installed" if not is_cached else "cached_unloaded")
    if MODEL_STATE["state"] in ["loading", "error"]:
        state = MODEL_STATE["state"]

    return {
        "status": "ok",
        "service": "LongFormAI Local Vision Worker",
        "engine": "transformers-blip",
        "model": DEFAULT_MODEL_NAME,
        "device": DEFAULT_DEVICE,
        "model_loaded": is_loaded,
        "model_cached": is_cached,
        "state": state,
        "error": MODEL_STATE.get("error"),
    }


@app.post("/model/load")
def load_model_endpoint():
    """Triggers local model loading into memory."""
    load_vision_model(DEFAULT_MODEL_NAME, DEFAULT_DEVICE)
    return health()


@app.post("/analyze-frame")
async def analyze_single_frame(req: FrameAnalysisRequest):
    if VISION_MODEL is None:
        load_vision_model(DEFAULT_MODEL_NAME, DEFAULT_DEVICE)

    if VISION_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=f"Semantic analysis unavailable: {MODEL_STATE.get('error') or 'Vision model not installed or loaded'}"
        )

    try:
        img = decode_image(req.imageData)
        description = run_caption_inference(img, DEFAULT_DEVICE)
        tags = extract_tags_from_text(description)

        return {
            "status": "success",
            "time": req.time,
            "description": description,
            "tags": tags
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame analysis failed: {str(e)}")


GENERIC_STOPWORDS = {"scene", "image", "video", "person", "background", "photo", "clip", "view", "footage", "shot", "the", "a", "of", "in", "on", "and", "frame"}


def aggregate_temporal_tags(all_tags_list: List[Any]) -> List[str]:
    """Deduplicates and sorts tags across multiple frames, filtering generic stopwords."""
    tag_counts: Dict[str, int] = {}
    flattened: List[str] = []
    for item in all_tags_list:
        if isinstance(item, list):
            flattened.extend(item)
        elif isinstance(item, str):
            flattened.append(item)

    for t in flattened:
        clean_t = t.lower().strip()
        if clean_t and clean_t not in GENERIC_STOPWORDS:
            tag_counts[clean_t] = tag_counts.get(clean_t, 0) + 1

    sorted_unique = sorted(tag_counts.keys(), key=lambda t: tag_counts[t], reverse=True)[:10]
    if not sorted_unique and flattened:
        sorted_unique = [t for t in dict.fromkeys(flattened) if t.lower().strip() not in GENERIC_STOPWORDS][:8]
    return sorted_unique


def build_temporal_summary(keyframe_descs: List[Any]) -> str:
    """Builds a coherent temporal summary string from a sequence of frame descriptions."""
    if not keyframe_descs:
        return "Visual scene."

    descriptions = []
    for item in keyframe_descs:
        if isinstance(item, dict):
            descriptions.append(item.get("description", ""))
        elif hasattr(item, "description"):
            descriptions.append(item.description)
        elif isinstance(item, str):
            descriptions.append(item)

    if len(descriptions) <= 1:
        return descriptions[0] if descriptions else "Visual scene."

    distinct_moments = []
    for d in descriptions:
        cleaned = d.rstrip(".").strip()
        if cleaned and (not distinct_moments or distinct_moments[-1].lower() != cleaned.lower()):
            distinct_moments.append(cleaned)

    if len(distinct_moments) == 1:
        return f"Video showing {distinct_moments[0].lower()} throughout the clip."
    else:
        first_moment = distinct_moments[0].lower()
        subsequent = [m.lower() for m in distinct_moments[1:4]]
        combined_parts = [first_moment] + [f"later {m}" for m in subsequent]
        return f"Video sequence showing {'; '.join(combined_parts)}."


@app.post("/analyze-media", response_model=MediaSemanticResponse)
async def analyze_media_semantics(req: MediaSemanticRequest):
    if not req.keyframes:
        raise HTTPException(status_code=400, detail="No keyframes provided for semantic analysis.")

    if VISION_MODEL is None:
        load_vision_model(DEFAULT_MODEL_NAME, DEFAULT_DEVICE)

    if VISION_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=f"Semantic analysis unavailable: {MODEL_STATE.get('error') or 'Vision model not installed or loaded'}"
        )

    keyframe_results: List[KeyframeSemantic] = []
    decoded_images: List[Image.Image] = []
    all_tags: List[str] = []
    descriptions: List[str] = []

    # 1. Inference per frame
    for kf in req.keyframes:
        try:
            img = decode_image(kf.imageData)
            decoded_images.append(img)
            desc = run_caption_inference(img, DEFAULT_DEVICE)
            tags = extract_tags_from_text(desc)
            descriptions.append(desc)
            all_tags.extend(tags)

            keyframe_results.append(KeyframeSemantic(
                time=kf.time,
                description=desc,
                tags=tags,
                isKeyMoment=False
            ))
        except Exception as err:
            print(f"[Vision Worker] Frame at {kf.time}s analysis error: {err}")
            raise HTTPException(status_code=500, detail=f"Inference error on frame @ {kf.time}s: {err}")

    # 2. Temporal Visual Change Detection (Step 3)
    visual_changes: List[VisualChangeSegment] = []
    has_visual_change = False

    if req.isVideo and len(decoded_images) > 1:
        for i in range(len(decoded_images) - 1):
            diff = compute_image_difference(decoded_images[i], decoded_images[i + 1])
            t1 = req.keyframes[i].time
            t2 = req.keyframes[i + 1].time

            if diff >= 0.12:
                has_visual_change = True
                change_desc = f"Visual change detected between {t1:.1f}s and {t2:.1f}s."
                visual_changes.append(VisualChangeSegment(
                    fromTime=t1,
                    toTime=t2,
                    differenceScore=round(diff, 3),
                    description=change_desc
                ))
                # Mark succeeding keyframe as an informative moment
                if i + 1 < len(keyframe_results):
                    keyframe_results[i + 1].isKeyMoment = True

    # 3. Informative Frame Selection (Step 6)
    seen_concepts = set()
    for idx, kr in enumerate(keyframe_results):
        new_concepts = [t for t in kr.tags if t not in seen_concepts]
        if len(new_concepts) >= 2 or idx == 0:
            kr.isKeyMoment = True
        seen_concepts.update(kr.tags)

    # 4. Temporal Tag Aggregation (Step 5)
    sorted_unique_tags = aggregate_temporal_tags(all_tags)

    # 5. Temporal Semantic Summary (Step 4)
    if req.isVideo and len(descriptions) > 1:
        overall_description = build_temporal_summary(keyframe_results)
        temporal_summary = overall_description
    else:
        overall_description = descriptions[0] if descriptions else "Visual scene."
        temporal_summary = None

    return MediaSemanticResponse(
        status="success",
        description=overall_description,
        tags=sorted_unique_tags,
        keyframeDescriptions=keyframe_results,
        temporalSummary=temporal_summary,
        hasVisualChange=has_visual_change,
        visualChanges=visual_changes,
        modelUsed=DEFAULT_MODEL_NAME
    )


def main():
    global DEFAULT_MODEL_NAME, DEFAULT_DEVICE
    parser = argparse.ArgumentParser(description="LongFormAI Local Vision Worker")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8766, help="Port number (default: 8766)")
    parser.add_argument("--model", default=DEFAULT_MODEL_NAME, help="Vision model name")
    parser.add_argument("--device", default="cpu", help="Device (cpu, cuda)")
    args = parser.parse_args()

    DEFAULT_MODEL_NAME = args.model
    DEFAULT_DEVICE = args.device

    print("=" * 60)
    print(" LongFormAI - Local Vision Worker (Project Hail Mary)")
    print("=" * 60)
    print(f" Vision Engine: transformers / BLIP (100% Offline Capable)")
    print(f" Default Model: {DEFAULT_MODEL_NAME}")
    print(f" Device:        {DEFAULT_DEVICE}")
    print(f" Server URL:    http://{args.host}:{args.port}")
    print("=" * 60)

    # Attempt initial local load if cached
    load_vision_model(DEFAULT_MODEL_NAME, DEFAULT_DEVICE)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
