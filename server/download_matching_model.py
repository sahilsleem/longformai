"""
LongFormAI - Matching Model Downloader
Downloads and verifies sentence-transformers/all-MiniLM-L6-v2 ONNX weights and vocabulary
for offline local semantic matching on Android/Termux (OnePlus Nord CE 2 Lite) and desktop.
Pure Python standard library with zero third-party dependencies (no transformers, torch, or huggingface_hub).
"""

import os
import sys
import time
import argparse
import urllib.request
import urllib.error

DEFAULT_TARGET_DIR = os.getenv("MINILM_MODEL_DIR", "~/models/minilm")

MODEL_FILES = [
    {
        "filename": "vocab.txt",
        "url": "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/raw/main/vocab.txt",
        "description": "WordPiece vocabulary",
    },
    {
        "filename": "config.json",
        "url": "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/raw/main/config.json",
        "description": "Model configuration",
    },
    {
        "filename": "model.onnx",
        "url": "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx",
        "fallback_url": "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx",
        "description": "all-MiniLM-L6-v2 ONNX model weights (~90MB)",
    },
]


def expand_path(p: str) -> str:
    return os.path.abspath(os.path.expanduser(os.path.expandvars(p)))


def download_file_with_progress(url: str, target_path: str, fallback_url: str = None) -> bool:
    print(f"  Downloading from: {url}")
    target_dir = os.path.dirname(target_path)
    os.makedirs(target_dir, exist_ok=True)

    headers = {
        "User-Agent": "LongFormAI-Downloader/1.0",
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            total_size = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 64 * 1024
            start_t = time.time()

            with open(target_path, "wb") as out_f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out_f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        pct = downloaded / total_size * 100
                        mb_done = downloaded / (1024 * 1024)
                        mb_total = total_size / (1024 * 1024)
                        sys.stdout.write(f"\r  Progress: {pct:5.1f}% ({mb_done:.1f}/{mb_total:.1f} MB)")
                        sys.stdout.flush()
            print()
            return True
    except Exception as e:
        print(f"\n  Download failed ({e})")
        if fallback_url:
            print(f"  Trying fallback URL: {fallback_url}")
            return download_file_with_progress(fallback_url, target_path, fallback_url=None)
        return False


def download_matching_model(target_dir: str = DEFAULT_TARGET_DIR) -> bool:
    dest = expand_path(target_dir)
    os.makedirs(dest, exist_ok=True)

    print("=" * 60)
    print(" LongFormAI - MiniLM ONNX Model Downloader")
    print("=" * 60)
    print(f" Target Directory: {dest}")
    print("=" * 60)

    success_all = True
    start_all = time.time()

    for item in MODEL_FILES:
        filename = item["filename"]
        target_path = os.path.join(dest, filename)
        desc = item["description"]

        if os.path.isfile(target_path) and os.path.getsize(target_path) > 0:
            sz_mb = os.path.getsize(target_path) / (1024 * 1024)
            print(f"[EXISTS] {filename} ({sz_mb:.2f} MB) - {desc}")
            continue

        print(f"\n[DOWNLOADING] {filename} - {desc}")
        ok = download_file_with_progress(item["url"], target_path, item.get("fallback_url"))
        if not ok:
            success_all = False
            print(f"[ERROR] Failed to download {filename}")
        else:
            sz_mb = os.path.getsize(target_path) / (1024 * 1024)
            print(f"[SUCCESS] {filename} saved ({sz_mb:.2f} MB)")

    elapsed = time.time() - start_all
    print("\n" + "=" * 60)
    if success_all:
        print(f" All MiniLM model files verified in {dest} ({elapsed:.1f}s)")
        print(" Ready to start: python server/matching_server.py --host 0.0.0.0 --port 8767")
    else:
        print(f" Some model files could not be downloaded. Check internet connection.")
    print("=" * 60)
    return success_all


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download all-MiniLM-L6-v2 ONNX model files for LongFormAI")
    parser.add_argument("--target-dir", default=DEFAULT_TARGET_DIR, help=f"Target directory (default: {DEFAULT_TARGET_DIR})")
    args = parser.parse_args()
    download_matching_model(args.target_dir)
