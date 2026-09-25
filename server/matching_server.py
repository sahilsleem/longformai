"""
LongFormAI (Project Hail Mary) - Local Semantic Matching Worker
Connects transcript segment meanings with local media semantic understanding (all-MiniLM-L6-v2).
Uses native ONNX Runtime locally with zero cloud APIs or external services.
Pure Python standard library HTTP server - zero third-party framework dependencies (no FastAPI, no Pydantic, no Uvicorn, no Transformers).
Optimized for Termux / Android / ARM64 / CPU / XNNPACK execution on OnePlus Nord CE 2 Lite.
"""

import os
import sys
import json
import time
import re
import argparse
import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Optional, List, Dict, Any, Tuple

try:
    import numpy as np
except ImportError:
    np = None

try:
    import onnxruntime as ort
except ImportError:
    ort = None


# Global Configuration
DEFAULT_MODEL_DIR = os.getenv("MINILM_MODEL_DIR", "~/models/minilm")
DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8767
DEFAULT_DEVICE = "cpu"

CONFIG = {
    "model_dir": DEFAULT_MODEL_DIR,
    "model_name": DEFAULT_MODEL_NAME,
    "device": DEFAULT_DEVICE,
}


def expand_path(p: str) -> str:
    """Expands ~ and environment variables, returning absolute path."""
    return os.path.abspath(os.path.expanduser(os.path.expandvars(p)))


def resolve_model_dir(custom_dir: Optional[str] = None) -> Optional[str]:
    """Finds the all-MiniLM-L6-v2 ONNX model directory."""
    candidates = []
    if custom_dir:
        candidates.append(custom_dir)
    if CONFIG["model_dir"]:
        candidates.append(CONFIG["model_dir"])

    candidates.extend([
        "~/models/minilm",
        "models/minilm",
        "/data/data/com.termux/files/home/models/minilm",
        "~/models/matching",
        "models/matching",
    ])

    for c in candidates:
        exp = expand_path(c)
        if os.path.isdir(exp):
            # Check for model.onnx (or onnx/model.onnx) and vocab.txt
            has_onnx = (
                os.path.isfile(os.path.join(exp, "model.onnx")) or
                os.path.isfile(os.path.join(exp, "onnx", "model.onnx")) or
                os.path.isfile(os.path.join(exp, "model_optimized.onnx")) or
                os.path.isfile(os.path.join(exp, "all-MiniLM-L6-v2.onnx"))
            )
            has_vocab = os.path.isfile(os.path.join(exp, "vocab.txt"))
            if has_onnx and has_vocab:
                return exp

    return None


def check_model_files_status(model_dir: Optional[str]) -> Tuple[bool, Optional[str]]:
    """Checks if all required MiniLM ONNX model files are present."""
    if not model_dir:
        return False, "MiniLM model directory not found. Expected model.onnx and vocab.txt in ~/models/minilm."

    exp_dir = expand_path(model_dir)
    if not os.path.isdir(exp_dir):
        return False, f"Directory does not exist: {exp_dir}"

    has_onnx = (
        os.path.isfile(os.path.join(exp_dir, "model.onnx")) or
        os.path.isfile(os.path.join(exp_dir, "onnx", "model.onnx")) or
        os.path.isfile(os.path.join(exp_dir, "model_optimized.onnx")) or
        os.path.isfile(os.path.join(exp_dir, "all-MiniLM-L6-v2.onnx"))
    )
    has_vocab = os.path.isfile(os.path.join(exp_dir, "vocab.txt"))

    if not has_onnx:
        return False, f"Missing model.onnx in {exp_dir}."
    if not has_vocab:
        return False, f"Missing vocab.txt in {exp_dir}."

    return True, None


class BertWordPieceTokenizer:
    """Lightweight pure-Python WordPiece tokenizer for BERT / MiniLM."""
    def __init__(self):
        self.vocab: Dict[str, int] = {}
        self.inv_vocab: Dict[int, str] = {}
        self.pad_token = "[PAD]"
        self.unk_token = "[UNK]"
        self.cls_token = "[CLS]"
        self.sep_token = "[SEP]"
        self.pad_token_id = 0
        self.unk_token_id = 100
        self.cls_token_id = 101
        self.sep_token_id = 102
        self.max_input_chars_per_word = 100

    def load_vocab(self, vocab_file: str):
        if not os.path.isfile(vocab_file):
            raise FileNotFoundError(f"vocab.txt not found at {vocab_file}")

        self.vocab = {}
        self.inv_vocab = {}
        with open(vocab_file, "r", encoding="utf-8") as f:
            for idx, line in enumerate(f):
                token = line.rstrip("\r\n")
                self.vocab[token] = idx
                self.inv_vocab[idx] = token

        self.pad_token_id = self.vocab.get(self.pad_token, 0)
        self.unk_token_id = self.vocab.get(self.unk_token, 100)
        self.cls_token_id = self.vocab.get(self.cls_token, 101)
        self.sep_token_id = self.vocab.get(self.sep_token, 102)

    def _tokenize_word(self, word: str) -> List[str]:
        if len(word) > self.max_input_chars_per_word:
            return [self.unk_token]
        is_bad = False
        start = 0
        sub_tokens = []
        while start < len(word):
            end = len(word)
            cur_substr = None
            while start < end:
                substr = word[start:end]
                if start > 0:
                    substr = "##" + substr
                if substr in self.vocab:
                    cur_substr = substr
                    break
                end -= 1
            if cur_substr is None:
                is_bad = True
                break
            sub_tokens.append(cur_substr)
            start = end
        if is_bad:
            return [self.unk_token]
        return sub_tokens

    def tokenize(self, text: str) -> List[int]:
        """Tokenizes text into a list of token IDs including [CLS] and [SEP]."""
        text = text.lower().strip()
        words = re.findall(r'\w+|[^\w\s]', text, re.UNICODE)
        tokens = [self.cls_token]
        for word in words:
            tokens.extend(self._tokenize_word(word))
        tokens.append(self.sep_token)
        return [self.vocab.get(t, self.unk_token_id) for t in tokens]

    def encode(self, text: str, max_length: int = 128) -> Dict[str, "np.ndarray"]:
        """Encodes single text into padded numpy arrays."""
        if np is None:
            raise RuntimeError("NumPy is required for tokenizer encoding.")

        token_ids = self.tokenize(text)[:max_length]
        pad_len = max_length - len(token_ids)
        input_ids = token_ids + [self.pad_token_id] * pad_len
        attention_mask = [1] * len(token_ids) + [0] * pad_len
        token_type_ids = [0] * max_length

        return {
            "input_ids": np.array([input_ids], dtype=np.int64),
            "attention_mask": np.array([attention_mask], dtype=np.int64),
            "token_type_ids": np.array([token_type_ids], dtype=np.int64),
        }


class OnnxMiniLMEngine:
    """Self-contained ONNX Runtime MiniLM inference engine with LRU embedding caching."""
    def __init__(self):
        self.model_dir: Optional[str] = None
        self.session: Optional[Any] = None
        self.tokenizer = BertWordPieceTokenizer()
        self.selected_provider: str = "cpu"
        self.loaded: bool = False
        self.error: Optional[str] = None
        self.lock = threading.Lock()
        self.embedding_cache: Dict[str, Any] = {}

    def get_providers(self) -> List[str]:
        if ort is None:
            return ["CPUExecutionProvider"]
        available = ort.get_available_providers()
        providers = []
        if "XnnpackExecutionProvider" in available:
            providers.append("XnnpackExecutionProvider")
        if "CPUExecutionProvider" in available:
            providers.append("CPUExecutionProvider")
        return providers or ["CPUExecutionProvider"]

    def load(self, model_dir_path: str, device: str = DEFAULT_DEVICE) -> bool:
        with self.lock:
            if self.loaded and self.session is not None:
                return True

            if ort is None or np is None:
                self.error = "onnxruntime and numpy packages are required for ONNX MiniLM inference."
                self.loaded = False
                return False

            exp_dir = expand_path(model_dir_path)
            valid, err = check_model_files_status(exp_dir)
            if not valid:
                self.error = err
                self.loaded = False
                return False

            try:
                # Identify ONNX file
                onnx_candidates = [
                    os.path.join(exp_dir, "model.onnx"),
                    os.path.join(exp_dir, "onnx", "model.onnx"),
                    os.path.join(exp_dir, "model_optimized.onnx"),
                    os.path.join(exp_dir, "all-MiniLM-L6-v2.onnx"),
                ]
                model_onnx_path = next(p for p in onnx_candidates if os.path.isfile(p))
                vocab_path = os.path.join(exp_dir, "vocab.txt")

                # Load Tokenizer
                self.tokenizer.load_vocab(vocab_path)

                # Set up ONNX Session
                providers = self.get_providers()
                sess_options = ort.SessionOptions()
                sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                sess_options.intra_op_num_threads = 4

                self.session = ort.InferenceSession(model_onnx_path, sess_options=sess_options, providers=providers)
                self.selected_provider = self.session.get_providers()[0] if self.session.get_providers() else "CPUExecutionProvider"
                self.model_dir = exp_dir
                self.loaded = True
                self.error = None
                return True

            except Exception as e:
                self.loaded = False
                self.error = str(e)
                print(f"[LongFormAI Matching Worker Error] Failed to load ONNX MiniLM: {e}")
                return False

    def compute_embedding(self, text: str, max_length: int = 128) -> "np.ndarray":
        """Encodes text into a unit-normalized 1D embedding vector of shape (384,)."""
        if not self.loaded or self.session is None:
            raise RuntimeError(f"MiniLM model is not loaded: {self.error or 'Session uninitialized'}")

        cache_key = f"{text}_{max_length}"
        with self.lock:
            if cache_key in self.embedding_cache:
                return self.embedding_cache[cache_key]

        encoded = self.tokenizer.encode(text, max_length=max_length)
        input_feed = {}
        for inp in self.session.get_inputs():
            name = inp.name
            name_lower = name.lower()
            if "input_ids" in name_lower:
                input_feed[name] = encoded["input_ids"]
            elif "attention_mask" in name_lower or "mask" in name_lower:
                input_feed[name] = encoded["attention_mask"]
            elif "token_type_ids" in name_lower or "token_type" in name_lower or "segment" in name_lower:
                input_feed[name] = encoded["token_type_ids"]
            else:
                input_feed[name] = encoded["input_ids"]

        outputs = self.session.run(None, input_feed)
        raw_output = outputs[0]

        # If 3D token embeddings (1, seq_len, 384): perform mean pooling with attention mask
        if raw_output.ndim == 3:
            token_embeddings = raw_output
            mask = encoded["attention_mask"]  # (1, seq_len)
            mask_expanded = np.expand_dims(mask, axis=-1).astype(np.float32)  # (1, seq_len, 1)
            sum_embeddings = np.sum(token_embeddings * mask_expanded, axis=1)  # (1, 384)
            sum_mask = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
            mean_pooled = sum_embeddings / sum_mask  # (1, 384)
            norm = np.linalg.norm(mean_pooled, axis=1, keepdims=True)
            norm = np.clip(norm, a_min=1e-9, a_max=None)
            normalized_emb = (mean_pooled / norm)[0]
        else:
            # If already 2D pooled sentence embedding (1, 384)
            sentence_embedding = raw_output.reshape(1, -1)
            norm = np.linalg.norm(sentence_embedding, axis=1, keepdims=True)
            norm = np.clip(norm, a_min=1e-9, a_max=None)
            normalized_emb = (sentence_embedding / norm)[0]

        with self.lock:
            if len(self.embedding_cache) >= 10000:
                self.embedding_cache.clear()
            self.embedding_cache[cache_key] = normalized_emb

        return normalized_emb


# Global Singleton Engine
MINILM_ENGINE = OnnxMiniLMEngine()


def get_health_data() -> Dict[str, Any]:
    resolved_dir = resolve_model_dir()
    is_cached, _ = check_model_files_status(resolved_dir)
    is_loaded = MINILM_ENGINE.loaded

    state = "ready" if is_loaded else ("cached_unloaded" if is_cached else "model_not_installed")
    if MINILM_ENGINE.error:
        state = "error"

    return {
        "status": "ok",
        "service": "LongFormAI Semantic Matching Worker",
        "engine": "onnx-all-MiniLM-L6-v2",
        "model": CONFIG["model_name"],
        "device": CONFIG["device"],
        "model_loaded": is_loaded,
        "model_cached": is_cached,
        "state": state,
        "error": MINILM_ENGINE.error,
        "model_dir": resolved_dir or CONFIG["model_dir"],
        "provider": MINILM_ENGINE.selected_provider if is_loaded else None,
    }


NUMBER_WORD_TO_DIGIT: Dict[str, str] = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14",
    "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18", "nineteen": "19",
    "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50", "sixty": "60",
    "seventy": "70", "eighty": "80", "ninety": "90", "hundred": "100",
    "first": "1", "second": "2", "third": "3", "fourth": "4", "fifth": "5",
    "sixth": "6", "seventh": "7", "eighth": "8", "ninth": "9", "tenth": "10",
    "eleventh": "11", "twelfth": "12", "thirteenth": "13", "fourteenth": "14",
    "fifteenth": "15", "sixteenth": "16", "seventeenth": "17", "eighteenth": "18",
    "nineteenth": "19", "twentieth": "20",
}

DIGIT_TO_NUMBER_WORD: Dict[str, str] = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
    "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen",
    "15": "fifteen", "16": "sixteen", "17": "seventeen", "18": "eighteen", "19": "nineteen",
    "20": "twenty", "30": "thirty", "40": "forty", "50": "fifty", "60": "sixty",
    "70": "seventy", "80": "eighty", "90": "ninety", "100": "hundred",
}


def expand_numeric_text(text: str) -> str:
    """Expands text with complementary digit and number word representations for semantic embedding."""
    if not text or not str(text).strip():
        return ""
    trimmed = str(text).strip()
    words = re.findall(r'[a-zA-Z0-9]+', trimmed.lower())
    additions = []
    for w in words:
        if w in NUMBER_WORD_TO_DIGIT:
            additions.append(NUMBER_WORD_TO_DIGIT[w])
        elif w in DIGIT_TO_NUMBER_WORD:
            additions.append(DIGIT_TO_NUMBER_WORD[w])
    if additions:
        unique_additions = list(dict.fromkeys(additions))
        return f"{trimmed}. Concepts: {', '.join(unique_additions)}"
    return trimmed


def filter_valid_media_items(media_items: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    valid_items: List[Dict[str, Any]] = []
    unavailable_count = 0

    for item in media_items:
        desc = item.get("description", "")
        ocr_text = item.get("ocrText", "")
        tags = item.get("tags", [])
        keyframes = item.get("keyframeDescriptions", [])
        temporal = item.get("temporalSummary", "")

        has_desc = bool(desc and str(desc).strip())
        has_ocr = bool(ocr_text and str(ocr_text).strip())
        has_tags = bool(tags and len(tags) > 0)
        has_keyframes = bool(keyframes and len(keyframes) > 0)
        has_temporal = bool(temporal and str(temporal).strip())

        if has_desc or has_ocr or has_tags or has_keyframes or has_temporal:
            valid_items.append(item)
        else:
            unavailable_count += 1

    return valid_items, unavailable_count


def prepare_media_items(valid_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    prepared: List[Dict[str, Any]] = []

    for item in valid_items:
        desc_text = str(item.get("description", "") or "").strip()
        ocr_text = str(item.get("ocrText", "") or "").strip()
        tags_list = item.get("tags") or []
        tags_text = ", ".join(tags_list) if tags_list else ""

        # Build combined semantic description incorporating OCR text
        parts = []
        if desc_text:
            parts.append(desc_text)
        if ocr_text:
            parts.append(f"Visible text: {ocr_text}")
        if tags_text:
            parts.append(f"Concepts: {tags_text}")

        combined_raw = ". ".join(parts) if parts else (desc_text or ocr_text)
        combined_text = expand_numeric_text(combined_raw)
        main_emb = MINILM_ENGINE.compute_embedding(combined_text)

        if ocr_text:
            main_explanation = f'Visible text: "{ocr_text}"; Description: "{desc_text}"' if desc_text else f'Visible text: "{ocr_text}"'
        else:
            main_explanation = f'Media description mentions: "{desc_text}"' if desc_text else f"Visual tags: {tags_text}"
        main_snippet = ocr_text or desc_text

        # OCR embedding
        ocr_emb = None
        ocr_explanation = ""
        ocr_snippet = ""
        if ocr_text:
            ocr_expanded = expand_numeric_text(f"Visible text: {ocr_text}")
            ocr_emb = MINILM_ENGINE.compute_embedding(ocr_expanded)
            ocr_explanation = f'Visible on-screen text matches: "{ocr_text}"'
            ocr_snippet = ocr_text

        # Temporal summary embedding
        temp_emb = None
        temp_explanation = ""
        temp_snippet = ""
        temporal_sum = item.get("temporalSummary")
        if temporal_sum and str(temporal_sum).strip():
            temp_emb = MINILM_ENGINE.compute_embedding(str(temporal_sum).strip())
            temp_explanation = f'Temporal video narrative shows: "{temporal_sum}"'
            temp_snippet = str(temporal_sum)

        # Keyframe embeddings
        keyframes_prepared: List[Tuple[np.ndarray, str, str]] = []
        keyframes = item.get("keyframeDescriptions") or []
        for kd in keyframes:
            kf_desc = kd.get("description", "")
            kf_ocr = kd.get("ocrText", "")
            kf_time = float(kd.get("time", 0.0))

            kf_parts = []
            if kf_desc:
                kf_parts.append(kf_desc)
            if kf_ocr:
                kf_parts.append(f"Visible text: {kf_ocr}")
            if kf_parts:
                kf_combined = expand_numeric_text(". ".join(kf_parts))
                kf_emb = MINILM_ENGINE.compute_embedding(kf_combined)
                kf_exp = f'Frame @ {kf_time:.1f}s shows: "{kf_desc or kf_ocr}"'
                kf_snip = kf_ocr or kf_desc
                keyframes_prepared.append((kf_emb, kf_exp, kf_snip))

        prepared.append({
            "mediaId": item.get("mediaId", ""),
            "mediaName": item.get("mediaName", ""),
            "main_emb": main_emb,
            "main_explanation": main_explanation,
            "main_snippet": main_snippet,
            "ocr_emb": ocr_emb,
            "ocr_explanation": ocr_explanation,
            "ocr_snippet": ocr_snippet,
            "temp_emb": temp_emb,
            "temp_explanation": temp_explanation,
            "temp_snippet": temp_snippet,
            "keyframes": keyframes_prepared,
        })

    return prepared


def score_segment_against_prepared_media(
    segment_emb: "np.ndarray",
    prepared_items: List[Dict[str, Any]],
    top_k: int = 5
) -> List[Dict[str, Any]]:
    candidates_scored: List[Dict[str, Any]] = []

    for p in prepared_items:
        best_score = float(np.dot(segment_emb, p["main_emb"]))
        best_explanation = p["main_explanation"]
        best_snippet = p["main_snippet"]

        if p.get("ocr_emb") is not None:
            ocr_score = float(np.dot(segment_emb, p["ocr_emb"]))
            if ocr_score > best_score:
                best_score = ocr_score
                best_explanation = p["ocr_explanation"]
                best_snippet = p["ocr_snippet"]

        if p.get("temp_emb") is not None:
            temp_score = float(np.dot(segment_emb, p["temp_emb"]))
            if temp_score > best_score:
                best_score = temp_score
                best_explanation = p["temp_explanation"]
                best_snippet = p["temp_snippet"]

        for kf_emb, kf_exp, kf_snip in p.get("keyframes", []):
            kf_score = float(np.dot(segment_emb, kf_emb))
            if kf_score > best_score:
                best_score = kf_score
                best_explanation = kf_exp
                best_snippet = kf_snip

        # Normalize score between 0.00 and 1.00
        normalized_score = max(0.0, min(1.0, round(best_score, 2)))

        candidates_scored.append({
            "mediaId": p["mediaId"],
            "mediaName": p["mediaName"],
            "score": normalized_score,
            "explanation": best_explanation,
            "matchedSnippet": best_snippet or None
        })

    # Sort by highest score first
    candidates_scored.sort(key=lambda c: c["score"], reverse=True)
    limit = top_k or 5
    return candidates_scored[:limit]


def match_media_items(
    segment_text: str,
    media_items: List[Dict[str, Any]],
    top_k: int = 5
) -> Dict[str, Any]:
    """Matches a transcript segment against media items using genuine Step 5 semantic analysis."""
    if not segment_text or not segment_text.strip():
        raise ValueError("Transcript segment text cannot be empty.")

    # Lazy-load ONNX model if not already loaded
    if not MINILM_ENGINE.loaded:
        resolved_dir = resolve_model_dir()
        if resolved_dir:
            MINILM_ENGINE.load(resolved_dir, CONFIG["device"])

    if not MINILM_ENGINE.loaded:
        raise RuntimeError(
            f"Semantic matching unavailable: {MINILM_ENGINE.error or 'Matching model not installed or loaded'}"
        )

    valid_items, unavailable_count = filter_valid_media_items(media_items)

    if not valid_items:
        return {
            "status": "no_analyzed_media",
            "segmentText": segment_text,
            "candidates": [],
            "unavailableCount": unavailable_count,
            "modelUsed": CONFIG["model_name"]
        }

    # 2. Encode transcript segment with numeric expansion
    expanded_segment = expand_numeric_text(segment_text.strip())
    segment_emb = MINILM_ENGINE.compute_embedding(expanded_segment)

    # 3. Prepare media items and score
    prepared_items = prepare_media_items(valid_items)
    selected_candidates = score_segment_against_prepared_media(segment_emb, prepared_items, top_k=top_k)

    return {
        "status": "success",
        "segmentText": segment_text,
        "candidates": selected_candidates,
        "unavailableCount": unavailable_count,
        "modelUsed": CONFIG["model_name"]
    }


def match_batch_segments(
    segments: List[Dict[str, Any]],
    media_items: List[Dict[str, Any]],
    top_k: int = 5
) -> Dict[str, Any]:
    """Batch-matches multiple transcript segments against media items in a single call."""
    if not segments:
        return {
            "status": "success",
            "results": [],
            "unavailableCount": 0,
            "modelUsed": CONFIG["model_name"]
        }

    # Lazy-load ONNX model if not already loaded
    if not MINILM_ENGINE.loaded:
        resolved_dir = resolve_model_dir()
        if resolved_dir:
            MINILM_ENGINE.load(resolved_dir, CONFIG["device"])

    if not MINILM_ENGINE.loaded:
        raise RuntimeError(
            f"Semantic matching unavailable: {MINILM_ENGINE.error or 'Matching model not installed or loaded'}"
        )

    valid_items, unavailable_count = filter_valid_media_items(media_items)

    if not valid_items:
        return {
            "status": "no_analyzed_media",
            "results": [
                {
                    "segmentId": seg.get("id", ""),
                    "segmentText": seg.get("text", ""),
                    "candidates": []
                }
                for seg in segments
            ],
            "unavailableCount": unavailable_count,
            "modelUsed": CONFIG["model_name"]
        }

    # Prepare media items once across all segments
    prepared_items = prepare_media_items(valid_items)
    results: List[Dict[str, Any]] = []

    for seg in segments:
        seg_id = seg.get("id", "")
        seg_text = seg.get("text", "")
        if not seg_text or not str(seg_text).strip():
            results.append({
                "segmentId": seg_id,
                "segmentText": seg_text,
                "candidates": []
            })
            continue

        expanded = expand_numeric_text(str(seg_text).strip())
        seg_emb = MINILM_ENGINE.compute_embedding(expanded)
        candidates = score_segment_against_prepared_media(seg_emb, prepared_items, top_k=top_k)
        results.append({
            "segmentId": seg_id,
            "segmentText": seg_text,
            "candidates": candidates
        })

    return {
        "status": "success",
        "results": results,
        "unavailableCount": unavailable_count,
        "modelUsed": CONFIG["model_name"]
    }


TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LongFormAI Semantic Matching Test</title>
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
    label:first-of-type { margin-top: 0; }
    textarea { width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #f8fafc; font-size: 0.95rem; font-family: inherit; resize: vertical; min-height: 70px; }
    button[type="submit"] { width: 100%; background: #2563eb; color: #ffffff; border: none; border-radius: 8px; padding: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 16px; }
    button:disabled { background: #475569; cursor: not-allowed; opacity: 0.7; }
    .status-box { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 0.9rem; }
    .status-box.loading { background: #0369a1; color: #e0f2fe; }
    .status-box.error { background: #7f1d1d; border: 1px solid #b91c1c; color: #fecaca; }
    .status-box.success { background: #064e3b; border: 1px solid #059669; color: #d1fae5; }
    .candidate-card { background: #0f172a; border-left: 3px solid #38bdf8; padding: 10px; margin-top: 8px; border-radius: 0 6px 6px 0; }
    .candidate-score { font-family: monospace; font-weight: bold; color: #10b981; float: right; font-size: 1rem; }
    .candidate-name { font-weight: 600; font-size: 0.95rem; color: #f8fafc; }
    .candidate-exp { font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>LongFormAI Semantic Matching Test</h1>
    <div class="url-badge" id="workerUrlBadge">Worker: checking...</div>

    <div class="card">
      <form id="matchForm">
        <label for="segmentInput">Voiceover Transcript Segment:</label>
        <textarea id="segmentInput" placeholder="e.g. She walks along the beach during sunset.">She walks along the beach during sunset.</textarea>
        <button type="submit" id="submitBtn">Run ONNX MiniLM Semantic Match</button>
      </form>
      <div id="statusBox" class="status-box hidden"></div>
    </div>

    <div id="resultsCard" class="card hidden">
      <h2 style="font-size: 1.1rem; color: #38bdf8; margin-bottom: 8px;">Match Candidates</h2>
      <div id="candidatesList"></div>
    </div>
  </div>

  <script>
    const workerUrl = window.location.origin;
    document.getElementById('workerUrlBadge').textContent = 'Worker: ' + workerUrl;

    const form = document.getElementById('matchForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusBox = document.getElementById('statusBox');
    const resultsCard = document.getElementById('resultsCard');
    const candidatesList = document.getElementById('candidatesList');

    const sampleMediaItems = [
      {
        mediaId: "media-beach",
        mediaName: "beach_walk.mp4",
        description: "A person walking on a sandy beach under an orange sunset sky",
        tags: ["beach", "sand", "person", "walking", "sunset", "ocean"],
        keyframeDescriptions: [
          { time: 0.0, description: "A person walking on a sandy beach", tags: ["beach", "walking"] },
          { time: 3.0, description: "Orange sunset over the ocean", tags: ["sunset", "ocean"] }
        ]
      },
      {
        mediaId: "media-kitchen",
        mediaName: "cooking_pasta.mp4",
        description: "A chef chopping vegetables and cooking pasta in a kitchen",
        tags: ["kitchen", "cooking", "chef", "food", "vegetables"],
        keyframeDescriptions: []
      },
      {
        mediaId: "media-city",
        mediaName: "city_traffic.jpg",
        description: "Busy city street with cars and skyscrapers at daytime",
        tags: ["city", "street", "cars", "traffic", "buildings"],
        keyframeDescriptions: []
      }
    ];

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('segmentInput').value.trim();
      if (!text) { alert('Please enter transcript text.'); return; }

      submitBtn.disabled = true;
      statusBox.className = 'status-box loading';
      statusBox.textContent = 'Computing ONNX MiniLM cosine embeddings on device...';
      statusBox.classList.remove('hidden');
      resultsCard.classList.add('hidden');

      const start = performance.now();
      try {
        const res = await fetch(`${workerUrl}/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segmentText: text, mediaItems: sampleMediaItems, topK: 3 })
        });
        const elapsed = ((performance.now() - start) / 1000).toFixed(2);
        const data = await res.json();

        if (!res.ok) {
          statusBox.className = 'status-box error';
          statusBox.textContent = `Error (HTTP ${res.status}): ${data.detail || JSON.stringify(data)}`;
          submitBtn.disabled = false;
          return;
        }

        statusBox.className = 'status-box success';
        statusBox.textContent = `Matched ${data.candidates.length} candidates in ${elapsed}s! (Model: ${data.modelUsed})`;

        candidatesList.innerHTML = '';
        (data.candidates || []).forEach((c, idx) => {
          const div = document.createElement('div');
          div.className = 'candidate-card';
          div.innerHTML = `
            <span class="candidate-score">${(c.score * 100).toFixed(0)}%</span>
            <div class="candidate-name">#${idx + 1} ${c.mediaName}</div>
            <div class="candidate-exp">${c.explanation}</div>
          `;
          candidatesList.appendChild(div);
        });

        resultsCard.classList.remove('hidden');
      } catch (err) {
        statusBox.className = 'status-box error';
        statusBox.textContent = `Network Error: ${err.message}`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
"""


class MatchingRequestHandler(BaseHTTPRequestHandler):
    """Standard library HTTP request handler for the semantic matching worker."""
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
            self.send_json_response(200, get_health_data())
        else:
            self.send_json_response(404, {"detail": "Not Found"})

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)

        if parsed_url.path == "/model/load":
            resolved_dir = resolve_model_dir()
            if resolved_dir:
                MINILM_ENGINE.load(resolved_dir, CONFIG["device"])
            self.send_json_response(200, get_health_data())
            return

        # Read JSON body
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            content_length = 0

        if content_length <= 0:
            self.send_json_response(400, {"detail": "No JSON payload provided."})
            return

        try:
            body_bytes = self.rfile.read(content_length)
            payload = json.loads(body_bytes.decode("utf-8"))
        except Exception as e:
            self.send_json_response(400, {"detail": f"Malformed JSON request: {str(e)}"})
            return

        if parsed_url.path in ("/match/batch", "/batch-match", "/match-batch"):
            segments = payload.get("segments", [])
            media_items = payload.get("mediaItems", [])
            top_k = payload.get("topK", 5)

            if not isinstance(segments, list):
                self.send_json_response(400, {"detail": "segments must be a list."})
                return

            if not isinstance(media_items, list):
                self.send_json_response(400, {"detail": "mediaItems must be a list."})
                return

            try:
                result = match_batch_segments(segments, media_items, top_k=top_k)
                self.send_json_response(200, result)
            except RuntimeError as e:
                self.send_json_response(503, {"detail": str(e)})
            except ValueError as e:
                self.send_json_response(400, {"detail": str(e)})
            except Exception as e:
                print(f"[Matching Worker Error] Batch match failed: {e}")
                self.send_json_response(500, {"detail": f"Batch semantic matching failed: {str(e)}"})
            return

        if parsed_url.path == "/match":
            segment_text = payload.get("segmentText", "")
            media_items = payload.get("mediaItems", [])
            top_k = payload.get("topK", 5)

            if not segment_text or not str(segment_text).strip():
                self.send_json_response(400, {"detail": "Transcript segment text cannot be empty."})
                return

            if not isinstance(media_items, list):
                self.send_json_response(400, {"detail": "mediaItems must be a list."})
                return

            try:
                result = match_media_items(segment_text, media_items, top_k=top_k)
                self.send_json_response(200, result)
            except RuntimeError as e:
                self.send_json_response(503, {"detail": str(e)})
            except ValueError as e:
                self.send_json_response(400, {"detail": str(e)})
            except Exception as e:
                print(f"[Matching Worker Error] Match failed: {e}")
                self.send_json_response(500, {"detail": f"Semantic matching failed: {str(e)}"})
        else:
            self.send_json_response(404, {"detail": "Not Found"})


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded standard library HTTP Server."""
    daemon_threads = True
    allow_reuse_address = True


def create_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> ThreadedHTTPServer:
    return ThreadedHTTPServer((host, port), MatchingRequestHandler)


def main():
    global DEFAULT_DEVICE
    parser = argparse.ArgumentParser(description="LongFormAI Local Semantic Matching Worker (all-MiniLM-L6-v2 - ONNX / stdlib HTTP)")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Host address (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port number (default: {DEFAULT_PORT})")
    parser.add_argument("--model-dir", "--model", dest="model_dir", default=None, help="Path to MiniLM ONNX model directory (default: ~/models/minilm)")
    parser.add_argument("--device", default=DEFAULT_DEVICE, help="Device (cpu, cuda)")
    args = parser.parse_args()

    if args.model_dir:
        CONFIG["model_dir"] = args.model_dir
    if args.device:
        CONFIG["device"] = args.device

    resolved_dir = resolve_model_dir(args.model_dir)
    is_cached, _ = check_model_files_status(resolved_dir)

    print("=" * 60)
    print(" LongFormAI - Local Semantic Matching Worker (Step 6)")
    print("=" * 60)
    print(f" Engine:          onnx-all-MiniLM-L6-v2 (native)")
    print(f" Server Runtime:  Python stdlib ThreadedHTTPServer")
    print(f" Model Dir:       {resolved_dir or CONFIG['model_dir']} {'[CACHED]' if is_cached else '[NOT FOUND]'}")
    print(f" Device:          {CONFIG['device']}")
    print(f" Providers:       {', '.join(MINILM_ENGINE.get_providers())}")
    print(f" Test Page:       http://{args.host}:{args.port}/")
    print(f" Server URL:      http://{args.host}:{args.port}")
    print("=" * 60)

    # Attempt eager load if model files exist
    if resolved_dir and is_cached:
        print("[Matching Worker] Loading MiniLM ONNX session into memory...")
        MINILM_ENGINE.load(resolved_dir, CONFIG["device"])
        if MINILM_ENGINE.loaded:
            print(f"[Matching Worker] MiniLM ONNX loaded successfully ({MINILM_ENGINE.selected_provider}). Ready for inference.")
        else:
            print(f"[Matching Worker Warning] Could not load ONNX model: {MINILM_ENGINE.error}")

    server = create_server(args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down matching server...")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
