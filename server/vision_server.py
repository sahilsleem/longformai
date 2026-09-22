"""
LongFormAI (Project Hail Mary) - Local Semantic Vision Worker
Uses native ONNX Runtime BLIP model locally with zero cloud APIs or external services.
Pure Python standard library HTTP server - zero third-party framework dependencies (no FastAPI, no Pydantic, no Uvicorn, no Transformers).
Optimized for Termux / Android / ARM64 / CPU / XNNPACK execution on OnePlus Nord CE 2 Lite.
"""

import os
import io
import sys
import json
import re
import base64
import argparse
import subprocess
import shutil
import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Optional, List, Dict, Any, Tuple

from PIL import Image

try:
    import numpy as np
except ImportError:
    np = None

try:
    import onnxruntime as ort
except ImportError:
    ort = None


# Configuration Defaults
DEFAULT_MODEL_DIR = os.getenv("BLIP_MODEL_DIR", "~/models/blip")
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8766
DEFAULT_DEVICE = "cpu"

CONFIG = {
    "model_dir": DEFAULT_MODEL_DIR,
    "device": DEFAULT_DEVICE,
    "model_name": "Salesforce/blip-image-captioning-base",
}

# Image Preprocessing Constants for BLIP
BLIP_IMAGE_SIZE = (384, 384)
BLIP_MEAN = [0.48145466, 0.4578275, 0.40821073]
BLIP_STD = [0.26862954, 0.26130258, 0.27577711]

# Special Token IDs for BLIP
PAD_TOKEN_ID = 0
UNK_TOKEN_ID = 100
CLS_TOKEN_ID = 101
SEP_TOKEN_ID = 102
EOS_TOKEN_ID = 2
DEFAULT_BOS_TOKEN_ID = 30522  # Standard BLIP prompt start token ID

STOP_WORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with", "by", "of", "from",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
    "there", "this", "that", "these", "those", "it", "its", "shows", "showing", "view", "image", "picture", "photo"
}

GENERIC_STOPWORDS = {
    "scene", "image", "video", "person", "background", "photo", "clip", "view", "footage", "shot",
    "the", "a", "of", "in", "on", "and", "frame"
}


def expand_path(p: str) -> str:
    """Expands ~ and environment variables, returning absolute path."""
    return os.path.abspath(os.path.expanduser(os.path.expandvars(p)))


def resolve_model_dir(custom_dir: Optional[str] = None) -> Optional[str]:
    """Finds the BLIP ONNX model directory."""
    candidates = []
    if custom_dir:
        candidates.append(custom_dir)
    if CONFIG["model_dir"]:
        candidates.append(CONFIG["model_dir"])

    candidates.extend([
        "~/models/blip",
        "models/blip",
        "/data/data/com.termux/files/home/models/blip",
    ])

    for c in candidates:
        exp = expand_path(c)
        if os.path.isdir(exp):
            split0 = os.path.join(exp, "split_0.onnx")
            split1 = os.path.join(exp, "split_1.onnx")
            if os.path.isfile(split0) and os.path.isfile(split1):
                return exp
    return None


def check_model_files_status(model_dir: Optional[str]) -> Tuple[bool, Optional[str]]:
    """Checks if all required model files are present."""
    if not model_dir:
        return False, "Model directory not found. Expected split_0.onnx and split_1.onnx in ~/models/blip."

    exp_dir = expand_path(model_dir)
    if not os.path.isdir(exp_dir):
        return False, f"Directory does not exist: {exp_dir}"

    required_files = ["split_0.onnx", "split_1.onnx", "vocab.txt"]
    missing = [f for f in required_files if not os.path.isfile(os.path.join(exp_dir, f))]
    if missing:
        return False, f"Missing required model files in {exp_dir}: {', '.join(missing)}"

    return True, None


class WordPieceTokenizer:
    """Lightweight pure-Python WordPiece tokenizer for BLIP."""
    def __init__(self):
        self.vocab: Dict[str, int] = {}
        self.inv_vocab: Dict[int, str] = {}
        self.bos_token_id = DEFAULT_BOS_TOKEN_ID

    def load_vocab(self, vocab_file: str, model_config_file: Optional[str] = None):
        if not os.path.isfile(vocab_file):
            raise FileNotFoundError(f"vocab.txt not found at {vocab_file}")

        self.vocab = {}
        self.inv_vocab = {}
        with open(vocab_file, "r", encoding="utf-8") as f:
            for idx, line in enumerate(f):
                token = line.rstrip("\n\r")
                self.vocab[token] = idx
                self.inv_vocab[idx] = token

        # Read bos_token_id from model_config.json if available
        if model_config_file and os.path.isfile(model_config_file):
            try:
                with open(model_config_file, "r", encoding="utf-8") as cf:
                    cfg = json.load(cf)
                    if "text_config" in cfg and "bos_token_id" in cfg["text_config"]:
                        self.bos_token_id = cfg["text_config"]["bos_token_id"]
                    elif "bos_token_id" in cfg:
                        self.bos_token_id = cfg["bos_token_id"]
            except Exception:
                pass

    def decode(self, token_ids: List[int], skip_special_tokens: bool = True) -> str:
        """Decodes token IDs to clean string text."""
        words: List[str] = []
        special_ids = {PAD_TOKEN_ID, UNK_TOKEN_ID, CLS_TOKEN_ID, SEP_TOKEN_ID, EOS_TOKEN_ID, self.bos_token_id}

        for tid in token_ids:
            if skip_special_tokens and tid in special_ids:
                continue

            token = self.inv_vocab.get(tid, "")
            if not token:
                continue

            if token.startswith("##"):
                if words:
                    words[-1] = words[-1] + token[2:]
                else:
                    words.append(token[2:])
            else:
                words.append(token)

        text = " ".join(words)
        # Clean spacing around punctuation
        text = re.sub(r'\s+([,.:;!?"\'])', r'\1', text)
        return text.strip()


def preprocess_image(pil_img: Image.Image) -> "np.ndarray":
    """Preprocesses a PIL Image into a normalized float32 tensor of shape (1, 3, 384, 384)."""
    if np is None:
        raise RuntimeError("NumPy is required for ONNX image preprocessing.")

    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")

    # High quality resize to 384x384
    resample = getattr(Image, "Resampling", Image).BICUBIC
    img_resized = pil_img.resize(BLIP_IMAGE_SIZE, resample=resample)

    # Convert to float32 [0, 1]
    arr = np.array(img_resized, dtype=np.float32) / 255.0

    # Normalize with BLIP mean and std
    mean = np.array(BLIP_MEAN, dtype=np.float32)
    std = np.array(BLIP_STD, dtype=np.float32)
    norm = (arr - mean) / std

    # Transpose HWC (384, 384, 3) to CHW (3, 384, 384) and add batch dim -> (1, 3, 384, 384)
    tensor = np.transpose(norm, (2, 0, 1))[np.newaxis, :, :, :].astype(np.float32)
    return tensor


class OnnxBlipEngine:
    """Self-contained ONNX Runtime BLIP inference engine."""
    def __init__(self):
        self.model_dir: Optional[str] = None
        self.session_0: Optional[Any] = None  # vision encoder
        self.session_1: Optional[Any] = None  # text decoder
        self.tokenizer = WordPieceTokenizer()
        self.selected_provider: str = "cpu"
        self.loaded: bool = False
        self.error: Optional[str] = None
        self.lock = threading.Lock()

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
            if self.loaded and self.session_0 is not None and self.session_1 is not None:
                return True

            if ort is None or np is None:
                self.error = "onnxruntime and numpy packages are required for ONNX BLIP inference."
                self.loaded = False
                return False

            exp_dir = expand_path(model_dir_path)
            valid, err = check_model_files_status(exp_dir)
            if not valid:
                self.error = err
                self.loaded = False
                return False

            try:
                split0_path = os.path.join(exp_dir, "split_0.onnx")
                split1_path = os.path.join(exp_dir, "split_1.onnx")
                vocab_path = os.path.join(exp_dir, "vocab.txt")
                config_path = os.path.join(exp_dir, "model_config.json")

                # Load Tokenizer
                self.tokenizer.load_vocab(vocab_path, config_path)

                # Set up ONNX Sessions
                providers = self.get_providers()
                sess_options = ort.SessionOptions()
                sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                sess_options.intra_op_num_threads = 4

                self.session_0 = ort.InferenceSession(split0_path, sess_options=sess_options, providers=providers)
                self.session_1 = ort.InferenceSession(split1_path, sess_options=sess_options, providers=providers)

                self.selected_provider = self.session_0.get_providers()[0] if self.session_0.get_providers() else "CPUExecutionProvider"
                self.model_dir = exp_dir
                self.loaded = True
                self.error = None
                return True

            except Exception as e:
                self.loaded = False
                self.error = str(e)
                print(f"[LongFormAI Vision Worker Error] Failed to load ONNX BLIP sessions: {e}")
                return False

    def generate_caption(self, pil_img: Image.Image, max_length: int = 20) -> str:
        """Runs two-stage BLIP inference on the image and returns a caption string."""
        if not self.loaded or self.session_0 is None or self.session_1 is None:
            raise RuntimeError(f"Vision model is not loaded: {self.error or 'Sessions uninitialized'}")

        # 1. Vision Encoder (split_0.onnx)
        pixel_values = preprocess_image(pil_img)
        input_name_0 = self.session_0.get_inputs()[0].name
        # split_0.onnx outputs:
        # outputs_0[0] = encoder_attention_mask (int64)
        # outputs_0[1] = encoder_hidden_states (float32)
        if len(outputs_0) > 1:
            encoder_attention_mask = outputs_0[0]
            encoder_hidden_states = outputs_0[1]
        else:
            encoder_attention_mask = np.array([1], dtype=np.int64)
            encoder_hidden_states = outputs_0[0]

        # 2. Text Decoder (split_1.onnx)
        current_input_ids = np.array([[self.tokenizer.bos_token_id]], dtype=np.int64)
        generated_token_ids = []

        sess1_inputs = {inp.name: inp for inp in self.session_1.get_inputs()}

        for step in range(max_length):
            input_feed = {}
            for name, inp in sess1_inputs.items():
                name_lower = name.lower()
                if "encoder" in name_lower and ("mask" in name_lower or "attention" in name_lower):
                    input_feed[name] = encoder_attention_mask
                elif "encoder" in name_lower or "hidden" in name_lower:
                    input_feed[name] = encoder_hidden_states
                elif "input_ids" in name_lower:
                    input_feed[name] = current_input_ids
                elif "attention_mask" in name_lower:
                    input_feed[name] = np.ones((1, current_input_ids.shape[1]), dtype=np.int64)
                else:
                    # Fallback assignment by matching dimensions
                    inp_shape = inp.shape or []
                    if len(inp_shape) == 3:
                        input_feed[name] = encoder_hidden_states
                    elif len(inp_shape) == 1:
                        input_feed[name] = encoder_attention_mask
                    else:
                        input_feed[name] = current_input_ids

            outputs_1 = self.session_1.run(None, input_feed)
            logits = outputs_1[0]

            # Safely extract last token logits across any dimensional structure (2D or 3D)
            if logits.ndim == 3:
                last_logits = logits[0, -1, :]
            elif logits.ndim == 2:
                last_logits = logits[-1, :]
            elif logits.ndim == 1:
                last_logits = logits
            else:
                last_logits = logits.reshape(-1, logits.shape[-1])[-1]

            next_token_id = int(np.argmax(last_logits))

            # Stop on EOS or SEP
            if next_token_id in (EOS_TOKEN_ID, SEP_TOKEN_ID):
                break

            generated_token_ids.append(next_token_id)
            current_input_ids = np.concatenate(
                [current_input_ids, np.array([[next_token_id]], dtype=np.int64)],
                axis=1
            )

        caption = self.tokenizer.decode(generated_token_ids, skip_special_tokens=True).strip()
        if not caption:
            caption = "Scene with no distinct subject."

        return caption[0].upper() + caption[1:] if len(caption) > 1 else caption.capitalize()


# Global Singleton Engine
BLIP_ENGINE = OnnxBlipEngine()


def decode_image(image_bytes_or_base64: str) -> Image.Image:
    """Decodes data URL or base64 string into a PIL Image."""
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
        resample = getattr(Image, "Resampling", Image).BILINEAR
        g1 = img1.convert("L").resize((64, 36), resample=resample)
        g2 = img2.convert("L").resize((64, 36), resample=resample)
        b1 = g1.tobytes()
        b2 = g2.tobytes()
        total_diff = sum(abs(a - b) for a, b in zip(b1, b2))
        return total_diff / (len(b1) * 255.0)
    except Exception:
        return 0.0


def find_tesseract_binary() -> Optional[str]:
    """Finds the local native tesseract binary on Termux / Linux / Windows."""
    candidates = [
        os.getenv("TESSERACT_PATH"),
        "/data/data/com.termux/files/usr/bin/tesseract",
        "/data/data/com.termux/files/home/../usr/bin/tesseract",
        "tesseract",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for c in candidates:
        if c:
            if os.path.isabs(c) and os.path.isfile(c):
                return c
            which_path = shutil.which(c)
            if which_path:
                return which_path
    return None


def run_local_ocr(pil_img: Image.Image) -> Tuple[Optional[str], Optional[float]]:
    """
    Extracts visible text from image using local native Tesseract OCR if available.
    Returns (cleaned_text, confidence) or (None, None) gracefully on any error or missing binary.
    """
    tess_bin = find_tesseract_binary()
    if not tess_bin:
        return None, None

    try:
        # Convert PIL Image to PNG bytes
        img_byte_arr = io.BytesIO()
        pil_img.save(img_byte_arr, format='PNG')
        img_bytes = img_byte_arr.getvalue()

        # Run tesseract with psm 6 (uniform block of text)
        proc = subprocess.run(
            [tess_bin, "stdin", "stdout", "--oem", "1", "-l", "eng", "--psm", "6"],
            input=img_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5.0,
            check=False
        )

        if proc.returncode == 0:
            text = proc.stdout.decode("utf-8", errors="replace").strip()
            clean_text = re.sub(r'[\r\n]+', ' ', text).strip()
            if clean_text:
                return clean_text, 0.90

        # Try psm 11 (sparse text / isolated numbers) if psm 6 returned empty
        proc2 = subprocess.run(
            [tess_bin, "stdin", "stdout", "--oem", "1", "-l", "eng", "--psm", "11"],
            input=img_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5.0,
            check=False
        )
        if proc2.returncode == 0:
            text2 = proc2.stdout.decode("utf-8", errors="replace").strip()
            clean_text2 = re.sub(r'[\r\n]+', ' ', text2).strip()
            if clean_text2:
                return clean_text2, 0.85

        return None, None
    except Exception:
        return None, None


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


def get_health_data() -> Dict[str, Any]:
    resolved_dir = resolve_model_dir()
    is_cached, _ = check_model_files_status(resolved_dir)
    is_loaded = BLIP_ENGINE.loaded

    state = "ready" if is_loaded else ("cached_unloaded" if is_cached else "model_not_installed")
    if BLIP_ENGINE.error:
        state = "error"

    tess_path = find_tesseract_binary()

    return {
        "status": "ok",
        "service": "LongFormAI Local Vision Worker",
        "engine": "onnx-blip",
        "ocr_engine": "tesseract" if tess_path else "none",
        "ocr_available": bool(tess_path),
        "model": CONFIG["model_name"],
        "device": CONFIG["device"],
        "model_loaded": is_loaded,
        "model_cached": is_cached,
        "state": state,
        "error": BLIP_ENGINE.error,
        "model_dir": resolved_dir or CONFIG["model_dir"],
        "provider": BLIP_ENGINE.selected_provider if is_loaded else None,
    }


def analyze_media_semantics(
    keyframes: List[Dict[str, Any]],
    is_video: bool = False,
    duration: float = 0.0
) -> Dict[str, Any]:
    """Analyzes a set of representative keyframes with the ONNX BLIP model, native OCR, and temporal intelligence."""
    if not keyframes:
        raise ValueError("No keyframes provided for semantic analysis.")

    # Lazy-load if not already loaded
    if not BLIP_ENGINE.loaded:
        resolved_dir = resolve_model_dir()
        if resolved_dir:
            BLIP_ENGINE.load(resolved_dir, CONFIG["device"])

    if not BLIP_ENGINE.loaded:
        raise RuntimeError(f"Semantic analysis unavailable: {BLIP_ENGINE.error or 'Vision model not installed or loaded'}")

    keyframe_results: List[Dict[str, Any]] = []
    decoded_images: List[Image.Image] = []
    all_tags: List[str] = []
    descriptions: List[str] = []
    all_ocr_texts: List[str] = []

    # 1. Inference per frame
    for kf in keyframes:
        img_data = kf.get("imageData", "")
        kf_time = float(kf.get("time", 0.0))
        img = decode_image(img_data)
        decoded_images.append(img)

        desc = BLIP_ENGINE.generate_caption(img)
        tags = extract_tags_from_text(desc)

        # Run local native OCR
        ocr_text, ocr_conf = run_local_ocr(img)
        if ocr_text:
            all_ocr_texts.append(ocr_text)
            ocr_tokens = re.findall(r'[a-zA-Z0-9]+', ocr_text)
            for tok in ocr_tokens:
                lower_tok = tok.lower()
                if lower_tok not in STOP_WORDS and lower_tok not in tags:
                    tags.append(lower_tok)

        descriptions.append(desc)
        all_tags.extend(tags)

        keyframe_results.append({
            "time": kf_time,
            "description": desc,
            "tags": tags,
            "ocrText": ocr_text,
            "ocrConfidence": ocr_conf,
            "isKeyMoment": False,
        })

    # 2. Temporal Visual Change Detection
    visual_changes: List[Dict[str, Any]] = []
    has_visual_change = False

    if is_video and len(decoded_images) > 1:
        for i in range(len(decoded_images) - 1):
            diff = compute_image_difference(decoded_images[i], decoded_images[i + 1])
            t1 = float(keyframes[i].get("time", 0.0))
            t2 = float(keyframes[i + 1].get("time", 0.0))

            if diff >= 0.12:
                has_visual_change = True
                change_desc = f"Visual change detected between {t1:.1f}s and {t2:.1f}s."
                visual_changes.append({
                    "fromTime": t1,
                    "toTime": t2,
                    "differenceScore": round(diff, 3),
                    "description": change_desc,
                })
                if i + 1 < len(keyframe_results):
                    keyframe_results[i + 1]["isKeyMoment"] = True

    # 3. Informative Frame Selection
    seen_concepts = set()
    for idx, kr in enumerate(keyframe_results):
        new_concepts = [t for t in kr["tags"] if t not in seen_concepts]
        if len(new_concepts) >= 2 or idx == 0:
            kr["isKeyMoment"] = True
        seen_concepts.update(kr["tags"])

    # 4. Temporal Tag Aggregation
    sorted_unique_tags = aggregate_temporal_tags(all_tags)

    # 5. Temporal Semantic Summary
    if is_video and len(descriptions) > 1:
        overall_description = build_temporal_summary(keyframe_results)
        temporal_summary = overall_description
    else:
        overall_description = descriptions[0] if descriptions else "Visual scene."
        temporal_summary = None

    combined_ocr = " ".join(dict.fromkeys(all_ocr_texts)).strip() if all_ocr_texts else None

    return {
        "status": "success",
        "description": overall_description,
        "tags": sorted_unique_tags,
        "ocrText": combined_ocr,
        "ocrConfidence": 0.90 if combined_ocr else None,
        "keyframeDescriptions": keyframe_results,
        "temporalSummary": temporal_summary,
        "hasVisualChange": has_visual_change,
        "visualChanges": visual_changes,
        "modelUsed": CONFIG["model_name"],
    }


TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LongFormAI Vision Worker Test</title>
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
    .mode-select { display: flex; gap: 8px; margin-bottom: 12px; }
    .mode-btn { flex: 1; padding: 8px; background: #0f172a; border: 1px solid #334155; color: #94a3b8; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
    .mode-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }
    label { display: block; font-size: 0.85rem; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; margin-top: 10px; }
    input[type="file"] { width: 100%; padding: 10px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #f8fafc; font-size: 0.95rem; }
    input[type="file"]::file-selector-button { background: #38bdf8; border: none; color: #0f172a; padding: 6px 12px; border-radius: 4px; font-weight: 600; cursor: pointer; margin-right: 10px; }
    button[type="submit"] { width: 100%; background: #2563eb; color: #ffffff; border: none; border-radius: 8px; padding: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 16px; }
    button:disabled { background: #475569; cursor: not-allowed; opacity: 0.7; }
    .status-box { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 0.9rem; }
    .status-box.loading { background: #0369a1; color: #e0f2fe; }
    .status-box.error { background: #7f1d1d; border: 1px solid #b91c1c; color: #fecaca; }
    .status-box.success { background: #064e3b; border: 1px solid #059669; color: #d1fae5; }
    .preview-grid { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .preview-thumb { width: 100px; height: 75px; object-fit: cover; border-radius: 4px; border: 1px solid #475569; }
    .tag { display: inline-block; background: #0284c7; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin: 2px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .meta-item { background: #0f172a; padding: 8px; border-radius: 6px; font-size: 0.85rem; }
    .meta-item span { display: block; color: #94a3b8; font-size: 0.75rem; }
    .kf-item { background: #0f172a; border-left: 3px solid #38bdf8; padding: 10px; margin-top: 8px; border-radius: 0 6px 6px 0; }
    .kf-item.key-moment { border-left-color: #f59e0b; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>LongFormAI Vision Worker Test</h1>
    <div class="url-badge" id="workerUrlBadge">Worker: checking...</div>

    <div class="card">
      <div class="mode-select">
        <button type="button" class="mode-btn active" id="singleModeBtn">Single Frame</button>
        <button type="button" class="mode-btn" id="multiModeBtn">Multi-Keyframe Media</button>
      </div>

      <form id="visionForm">
        <label id="fileLabel" for="imageFile">Select Image Frame:</label>
        <input type="file" id="imageFile" accept="image/*" required>
        <div id="previewContainer" class="preview-grid hidden"></div>
        <button type="submit" id="submitBtn">Analyze with ONNX BLIP</button>
      </form>
      <div id="statusBox" class="status-box hidden"></div>
    </div>

    <div id="resultsCard" class="card hidden">
      <h2 style="font-size: 1.1rem; color: #38bdf8; margin-bottom: 8px;">Analysis Results</h2>
      
      <div id="singleResultSection">
        <p id="captionText" style="font-size: 1.05rem; font-weight: 600; color: #f8fafc; margin-bottom: 8px;"></p>
      </div>

      <div id="multiResultSection" class="hidden">
        <div class="meta-grid">
          <div class="meta-item"><span>Visual Change Detected</span><strong id="hasChangeVal">-</strong></div>
          <div class="meta-item"><span>Model Used</span><strong id="modelUsedVal">-</strong></div>
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 0.75rem; color: #94a3b8; display: block;">Temporal Summary:</span>
          <p id="temporalSummaryText" style="font-size: 0.95rem; color: #f8fafc; font-style: italic;"></p>
        </div>
        <h3 style="font-size: 0.85rem; color: #cbd5e1; margin-top: 14px; margin-bottom: 6px;">Keyframes (<span id="kfCount">0</span>):</h3>
        <div id="keyframesList"></div>
      </div>

      <div style="margin-top: 14px;">
        <span style="font-size: 0.75rem; color: #94a3b8; display: block; margin-bottom: 4px;">Semantic Tags:</span>
        <div id="tagsList"></div>
      </div>
    </div>
  </div>

  <script>
    const workerUrl = window.location.origin;
    document.getElementById('workerUrlBadge').textContent = 'Worker: ' + workerUrl;

    let isMulti = false;
    const fileInput = document.getElementById('imageFile');
    const previewContainer = document.getElementById('previewContainer');
    const form = document.getElementById('visionForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusBox = document.getElementById('statusBox');
    const resultsCard = document.getElementById('resultsCard');
    const singleResult = document.getElementById('singleResultSection');
    const multiResult = document.getElementById('multiResultSection');
    const captionText = document.getElementById('captionText');
    const tagsList = document.getElementById('tagsList');
    const singleModeBtn = document.getElementById('singleModeBtn');
    const multiModeBtn = document.getElementById('multiModeBtn');
    const fileLabel = document.getElementById('fileLabel');

    singleModeBtn.onclick = () => {
      isMulti = false;
      singleModeBtn.classList.add('active');
      multiModeBtn.classList.remove('active');
      fileInput.removeAttribute('multiple');
      fileLabel.textContent = 'Select Image Frame:';
      previewContainer.innerHTML = '';
      loadedFrames = [];
    };

    multiModeBtn.onclick = () => {
      isMulti = true;
      multiModeBtn.classList.add('active');
      singleModeBtn.classList.remove('active');
      fileInput.setAttribute('multiple', 'true');
      fileLabel.textContent = 'Select 2 to 5 Keyframe Images:';
      previewContainer.innerHTML = '';
      loadedFrames = [];
    };

    let loadedFrames = [];

    fileInput.addEventListener('change', async () => {
      previewContainer.innerHTML = '';
      loadedFrames = [];
      const files = Array.from(fileInput.files || []);
      if (files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const b64 = await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = (e) => res(e.target.result);
          reader.readAsDataURL(file);
        });
        loadedFrames.push({ time: i * 2.5, imageData: b64, name: file.name });
        const img = document.createElement('img');
        img.src = b64;
        img.className = 'preview-thumb';
        previewContainer.appendChild(img);
      }
      previewContainer.classList.remove('hidden');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loadedFrames.length === 0) { alert('Please select image(s).'); return; }

      submitBtn.disabled = true;
      statusBox.className = 'status-box loading';
      statusBox.textContent = isMulti
        ? `Running ONNX BLIP multi-keyframe analysis (${loadedFrames.length} frames)...`
        : 'Running ONNX BLIP captioning on device...';
      statusBox.classList.remove('hidden');
      resultsCard.classList.add('hidden');

      const start = performance.now();
      try {
        let res, data;
        if (!isMulti) {
          res = await fetch(`${workerUrl}/analyze-frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData: loadedFrames[0].imageData, time: 0.0 })
          });
          data = await res.json();
        } else {
          res = await fetch(`${workerUrl}/analyze-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isVideo: true,
              duration: loadedFrames.length * 2.5,
              keyframes: loadedFrames.map(f => ({ time: f.time, imageData: f.imageData }))
            })
          });
          data = await res.json();
        }

        const elapsed = ((performance.now() - start) / 1000).toFixed(2);
        if (!res.ok) {
          statusBox.className = 'status-box error';
          statusBox.textContent = `Error (HTTP ${res.status}): ${data.detail || JSON.stringify(data)}`;
          submitBtn.disabled = false;
          return;
        }

        statusBox.className = 'status-box success';
        statusBox.textContent = `Analysis completed in ${elapsed}s!`;

        tagsList.innerHTML = '';
        (data.tags || []).forEach(t => {
          const tagSpan = document.createElement('span');
          tagSpan.className = 'tag';
          tagSpan.textContent = t;
          tagsList.appendChild(tagSpan);
        });

        if (!isMulti) {
          singleResult.classList.remove('hidden');
          multiResult.classList.add('hidden');
          captionText.textContent = data.description;
        } else {
          singleResult.classList.add('hidden');
          multiResult.classList.remove('hidden');
          document.getElementById('hasChangeVal').textContent = data.hasVisualChange ? 'Yes' : 'No';
          document.getElementById('modelUsedVal').textContent = data.modelUsed || 'BLIP ONNX';
          document.getElementById('temporalSummaryText').textContent = data.temporalSummary || data.description;
          document.getElementById('kfCount').textContent = (data.keyframeDescriptions || []).length;

          const kfList = document.getElementById('keyframesList');
          kfList.innerHTML = '';
          (data.keyframeDescriptions || []).forEach(kd => {
            const kfEl = document.createElement('div');
            kfEl.className = 'kf-item' + (kd.isKeyMoment ? ' key-moment' : '');
            kfEl.innerHTML = `<div style="font-size:0.75rem; color:#38bdf8; font-family:monospace;">@ ${kd.time}s ${kd.isKeyMoment ? '★ Key Moment' : ''}</div><div style="font-size:0.9rem; color:#f8fafc; margin-top:2px;">${kd.description}</div>`;
            kfList.appendChild(kfEl);
          });
        }

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


class VisionRequestHandler(BaseHTTPRequestHandler):
    """Standard library HTTP request handler for the local vision worker."""
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
                BLIP_ENGINE.load(resolved_dir, CONFIG["device"])
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

        if parsed_url.path == "/analyze-frame":
            image_data = payload.get("imageData")
            time_val = float(payload.get("time", 0.0))

            if not image_data:
                self.send_json_response(400, {"detail": "Missing imageData in request."})
                return

            if not BLIP_ENGINE.loaded:
                resolved_dir = resolve_model_dir()
                if resolved_dir:
                    BLIP_ENGINE.load(resolved_dir, CONFIG["device"])

            if not BLIP_ENGINE.loaded:
                self.send_json_response(
                    503,
                    {"detail": f"Semantic analysis unavailable: {BLIP_ENGINE.error or 'Vision model not installed or loaded'}"}
                )
                return

            try:
                img = decode_image(image_data)
                description = BLIP_ENGINE.generate_caption(img)
                tags = extract_tags_from_text(description)
                self.send_json_response(200, {
                    "status": "success",
                    "time": time_val,
                    "description": description,
                    "tags": tags
                })
            except Exception as e:
                print(f"[LongFormAI Vision Worker] Frame analysis error: {e}")
                self.send_json_response(500, {"detail": f"Frame analysis failed: {str(e)}"})

        elif parsed_url.path == "/analyze-media":
            keyframes = payload.get("keyframes", [])
            is_video = bool(payload.get("isVideo", False))
            duration = float(payload.get("duration", 0.0))

            if not keyframes or not isinstance(keyframes, list):
                self.send_json_response(400, {"detail": "No keyframes provided for semantic analysis."})
                return

            try:
                result = analyze_media_semantics(keyframes, is_video=is_video, duration=duration)
                self.send_json_response(200, result)
            except RuntimeError as e:
                self.send_json_response(503, {"detail": str(e)})
            except ValueError as e:
                self.send_json_response(400, {"detail": str(e)})
            except Exception as e:
                print(f"[LongFormAI Vision Worker] Media analysis error: {e}")
                self.send_json_response(500, {"detail": f"Media analysis failed: {str(e)}"})

        else:
            self.send_json_response(404, {"detail": "Not Found"})


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded standard library HTTP Server."""
    daemon_threads = True
    allow_reuse_address = True


def create_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> ThreadedHTTPServer:
    return ThreadedHTTPServer((host, port), VisionRequestHandler)


def main():
    global DEFAULT_DEVICE
    parser = argparse.ArgumentParser(description="LongFormAI Local Vision Worker (ONNX BLIP - stdlib HTTP)")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Host address (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port number (default: {DEFAULT_PORT})")
    parser.add_argument("--model-dir", "--model", dest="model_dir", default=None, help="Path to BLIP ONNX model directory (default: ~/models/blip)")
    parser.add_argument("--device", default=DEFAULT_DEVICE, help="Device (cpu, cuda)")
    args = parser.parse_args()

    if args.model_dir:
        CONFIG["model_dir"] = args.model_dir
    if args.device:
        CONFIG["device"] = args.device

    resolved_dir = resolve_model_dir(args.model_dir)
    is_cached, _ = check_model_files_status(resolved_dir)

    print("=" * 60)
    print(" LongFormAI - Local Vision Worker (Project Hail Mary)")
    print("=" * 60)
    print(f" Engine:          onnx-blip (native)")
    print(f" Server Runtime:  Python stdlib ThreadedHTTPServer")
    print(f" Model Dir:       {resolved_dir or CONFIG['model_dir']} {'[CACHED]' if is_cached else '[NOT FOUND]'}")
    print(f" Device:          {CONFIG['device']}")
    print(f" Providers:       {', '.join(BLIP_ENGINE.get_providers())}")
    print(f" Test Page:       http://{args.host}:{args.port}/")
    print(f" Server URL:      http://{args.host}:{args.port}")
    print("=" * 60)

    # Attempt eager load if model files exist
    if resolved_dir and is_cached:
        print("[LongFormAI Vision Worker] Loading ONNX BLIP sessions into memory...")
        BLIP_ENGINE.load(resolved_dir, CONFIG["device"])
        if BLIP_ENGINE.loaded:
            print(f"[LongFormAI Vision Worker] BLIP ONNX loaded successfully ({BLIP_ENGINE.selected_provider}). Ready for inference.")
        else:
            print(f"[LongFormAI Vision Worker Warning] Could not load ONNX model: {BLIP_ENGINE.error}")

    server = create_server(args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down vision server...")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
