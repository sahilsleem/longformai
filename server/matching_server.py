"""
LongFormAI (Project Hail Mary) - Local Semantic Matching Worker
Connects transcript segment meanings with local media semantic understanding (all-MiniLM-L6-v2).
Zero cloud APIs, zero external requests, 100% offline capable once cached.
"""

import os
import time
import argparse
import threading
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import torch
import torch.nn.functional as F

try:
    from huggingface_hub import try_to_load_from_cache
except ImportError:
    try_to_load_from_cache = None

app = FastAPI(
    title="LongFormAI Local Semantic Matching Worker",
    version="1.0.0",
    description="Local text embedding & cosine similarity matching worker"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Configuration
DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_DEVICE = "cpu"

# Model & Tokenizer Storage
MATCHING_MODEL = None
MATCHING_TOKENIZER = None
MODEL_LOCK = threading.Lock()
MODEL_STATE = {
    "state": "uninitialized",
    "error": None,
    "cached": False,
    "loaded": False,
}


def check_is_cached(model_name: str = DEFAULT_MODEL_NAME) -> bool:
    """Checks if the sentence-transformers model exists in the local HuggingFace cache."""
    if try_to_load_from_cache is None:
        return False
    try:
        safetensors = try_to_load_from_cache(model_name, "model.safetensors")
        bin_weights = try_to_load_from_cache(model_name, "pytorch_model.bin")
        config = try_to_load_from_cache(model_name, "config.json")
        has_weights = (safetensors is not None) or (bin_weights is not None)
        return has_weights and (config is not None)
    except Exception:
        return False


def mean_pooling(model_output, attention_mask):
    """Mean Pooling - Take attention mask into account for correct averaging."""
    token_embeddings = model_output[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)


def load_matching_model(model_name: str = DEFAULT_MODEL_NAME, device: str = DEFAULT_DEVICE):
    """Loads all-MiniLM-L6-v2 from local cache for offline execution."""
    global MATCHING_MODEL, MATCHING_TOKENIZER, MODEL_STATE
    with MODEL_LOCK:
        if MATCHING_MODEL is not None and MATCHING_TOKENIZER is not None:
            MODEL_STATE["state"] = "ready"
            MODEL_STATE["loaded"] = True
            MODEL_STATE["cached"] = True
            return

        is_cached = check_is_cached(model_name)
        MODEL_STATE["cached"] = is_cached

        if not is_cached:
            MODEL_STATE["state"] = "model_not_installed"
            MODEL_STATE["loaded"] = False
            MODEL_STATE["error"] = f"Model '{model_name}' not found in local cache. Run 'python server/download_matching_model.py'."
            print(f"[Matching Worker] Model '{model_name}' is not cached locally.")
            return

        try:
            MODEL_STATE["state"] = "loading"
            print(f"[Matching Worker] Loading '{model_name}' from local cache on {device} (100% offline)...")
            from transformers import AutoTokenizer, AutoModel

            tokenizer = AutoTokenizer.from_pretrained(model_name, local_files_only=True)
            model = AutoModel.from_pretrained(model_name, local_files_only=True).to(device)
            model.eval()

            MATCHING_TOKENIZER = tokenizer
            MATCHING_MODEL = model
            MODEL_STATE["state"] = "ready"
            MODEL_STATE["loaded"] = True
            MODEL_STATE["error"] = None
            print(f"[Matching Worker] Matching model '{model_name}' loaded successfully.")
        except Exception as e:
            MODEL_STATE["state"] = "error"
            MODEL_STATE["loaded"] = False
            MODEL_STATE["error"] = str(e)
            print(f"[Matching Worker Error] Failed to load matching model: {e}")


def compute_text_embedding(text: str, device: str = DEFAULT_DEVICE) -> torch.Tensor:
    """Encodes a sentence into a normalized embedding tensor."""
    if MATCHING_MODEL is None or MATCHING_TOKENIZER is None:
        raise RuntimeError("Matching model is not loaded.")

    encoded = MATCHING_TOKENIZER([text], padding=True, truncation=True, max_length=128, return_tensors="pt").to(device)
    with torch.no_grad():
        out = MATCHING_MODEL(**encoded)
        emb = mean_pooling(out, encoded["attention_mask"])
        emb = F.normalize(emb, p=2, dim=1)
    return emb[0]


def compute_batch_embeddings(texts: List[str], device: str = DEFAULT_DEVICE) -> torch.Tensor:
    """Encodes multiple sentences in a single batched tensor."""
    if MATCHING_MODEL is None or MATCHING_TOKENIZER is None:
        raise RuntimeError("Matching model is not loaded.")

    encoded = MATCHING_TOKENIZER(texts, padding=True, truncation=True, max_length=128, return_tensors="pt").to(device)
    with torch.no_grad():
        out = MATCHING_MODEL(**encoded)
        embs = mean_pooling(out, encoded["attention_mask"])
        embs = F.normalize(embs, p=2, dim=1)
    return embs


class KeyframeDescriptionItem(BaseModel):
    time: float
    description: str
    tags: Optional[List[str]] = []


class MediaMatchItem(BaseModel):
    mediaId: str
    mediaName: str
    description: Optional[str] = None
    tags: Optional[List[str]] = []
    keyframeDescriptions: Optional[List[KeyframeDescriptionItem]] = []
    temporalSummary: Optional[str] = None


class MatchRequest(BaseModel):
    segmentText: str
    mediaItems: List[MediaMatchItem]
    topK: Optional[int] = 5


class MatchCandidate(BaseModel):
    mediaId: str
    mediaName: str
    score: float
    explanation: str
    matchedSnippet: Optional[str] = None


class MatchResponse(BaseModel):
    status: str
    segmentText: str
    candidates: List[MatchCandidate]
    unavailableCount: int
    modelUsed: str


@app.get("/health")
def health():
    is_cached = check_is_cached(DEFAULT_MODEL_NAME)
    is_loaded = MATCHING_MODEL is not None and MATCHING_TOKENIZER is not None
    state = "ready" if is_loaded else ("model_not_installed" if not is_cached else "cached_unloaded")
    if MODEL_STATE["state"] in ["loading", "error"]:
        state = MODEL_STATE["state"]

    return {
        "status": "ok",
        "service": "LongFormAI Semantic Matching Worker",
        "engine": "transformers-sentence-embeddings",
        "model": DEFAULT_MODEL_NAME,
        "device": DEFAULT_DEVICE,
        "model_loaded": is_loaded,
        "model_cached": is_cached,
        "state": state,
        "error": MODEL_STATE.get("error"),
    }


@app.post("/model/load")
def load_model_endpoint():
    load_matching_model(DEFAULT_MODEL_NAME, DEFAULT_DEVICE)
    return health()


@app.post("/match", response_model=MatchResponse)
async def match_media(req: MatchRequest):
    if not req.segmentText or not req.segmentText.strip():
        raise HTTPException(status_code=400, detail="Transcript segment text cannot be empty.")

    if MATCHING_MODEL is None or MATCHING_TOKENIZER is None:
        load_matching_model(DEFAULT_MODEL_NAME, DEFAULT_DEVICE)

    if MATCHING_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=f"Semantic matching unavailable: {MODEL_STATE.get('error') or 'Matching model not installed or loaded'}"
        )

    # 1. Filter media items that have genuine Step 5 semantic analysis
    valid_items: List[MediaMatchItem] = []
    unavailable_count = 0

    for item in req.mediaItems:
        has_desc = bool(item.description and item.description.strip())
        has_tags = bool(item.tags and len(item.tags) > 0)
        has_keyframes = bool(item.keyframeDescriptions and len(item.keyframeDescriptions) > 0)
        has_temporal = bool(item.temporalSummary and item.temporalSummary.strip())

        if has_desc or has_tags or has_keyframes or has_temporal:
            valid_items.append(item)
        else:
            unavailable_count += 1

    if not valid_items:
        return MatchResponse(
            status="no_analyzed_media",
            segmentText=req.segmentText,
            candidates=[],
            unavailableCount=unavailable_count,
            modelUsed=DEFAULT_MODEL_NAME
        )

    # 2. Encode transcript segment
    segment_emb = compute_text_embedding(req.segmentText.strip(), DEFAULT_DEVICE)

    # 3. Build semantic texts from genuine Step 5 information
    candidates_scored: List[MatchCandidate] = []

    for item in valid_items:
        # Construct candidate representations to compare
        desc_text = (item.description or "").strip()
        tags_text = ", ".join(item.tags) if item.tags else ""
        combined_text = f"{desc_text}. Concepts: {tags_text}" if tags_text else desc_text

        # Compute overall embedding
        main_emb = compute_text_embedding(combined_text, DEFAULT_DEVICE)
        best_score = float(torch.dot(segment_emb, main_emb).item())
        best_explanation = f"Media description mentions: \"{desc_text}\"" if desc_text else f"Visual tags: {tags_text}"
        best_snippet = desc_text

        # Check temporal summary if present
        if item.temporalSummary and item.temporalSummary.strip():
            temp_emb = compute_text_embedding(item.temporalSummary.strip(), DEFAULT_DEVICE)
            temp_score = float(torch.dot(segment_emb, temp_emb).item())
            if temp_score > best_score:
                best_score = temp_score
                best_explanation = f"Temporal video narrative shows: \"{item.temporalSummary}\""
                best_snippet = item.temporalSummary

        # Check keyframe descriptions if video has them to see if a specific keyframe matches better
        if item.keyframeDescriptions:
            for kd in item.keyframeDescriptions:
                if kd.description:
                    kf_emb = compute_text_embedding(kd.description, DEFAULT_DEVICE)
                    kf_score = float(torch.dot(segment_emb, kf_emb).item())
                    if kf_score > best_score:
                        best_score = kf_score
                        best_explanation = f"Frame @ {kd.time:.1f}s shows: \"{kd.description}\""
                        best_snippet = kd.description

        # Normalize score between 0.00 and 1.00
        normalized_score = max(0.0, min(1.0, round(best_score, 2)))

        candidates_scored.append(MatchCandidate(
            mediaId=item.mediaId,
            mediaName=item.mediaName,
            score=normalized_score,
            explanation=best_explanation,
            matchedSnippet=best_snippet
        ))

    # 4. Sort by highest score first
    candidates_scored.sort(key=lambda c: c.score, reverse=True)
    top_k = req.topK or 5
    selected_candidates = candidates_scored[:top_k]

    return MatchResponse(
        status="success",
        segmentText=req.segmentText,
        candidates=selected_candidates,
        unavailableCount=unavailable_count,
        modelUsed=DEFAULT_MODEL_NAME
    )


def main():
    global DEFAULT_MODEL_NAME, DEFAULT_DEVICE
    parser = argparse.ArgumentParser(description="LongFormAI Local Semantic Matching Worker")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8767, help="Port number (default: 8767)")
    parser.add_argument("--model", default=DEFAULT_MODEL_NAME, help="Sentence transformers model name")
    parser.add_argument("--device", default="cpu", help="Device (cpu, cuda)")
    args = parser.parse_args()

    DEFAULT_MODEL_NAME = args.model
    DEFAULT_DEVICE = args.device

    print("=" * 60)
    print(" LongFormAI - Local Semantic Matching Worker (Step 6)")
    print("=" * 60)
    print(f" Model:      {DEFAULT_MODEL_NAME}")
    print(f" Device:     {DEFAULT_DEVICE}")
    print(f" Server URL: http://{args.host}:{args.port}")
    print("=" * 60)

    # Load if cached
    load_matching_model(DEFAULT_MODEL_NAME, DEFAULT_DEVICE)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
