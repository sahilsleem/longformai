"""
LongFormAI - Model Downloader
Downloads and verifies model weights for offline inference.
"""
import sys
import os
import time
from huggingface_hub import hf_hub_download, try_to_load_from_cache

MODEL_ID = "Salesforce/blip-image-captioning-base"
FILES = [
    "config.json",
    "preprocessor_config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
    "pytorch_model.bin"
]

def download_blip():
    print(f"Checking & downloading '{MODEL_ID}' for offline local inference...")
    for filename in FILES:
        cached = try_to_load_from_cache(MODEL_ID, filename)
        if cached and os.path.exists(cached):
            size_mb = os.path.getsize(cached) / (1024 * 1024)
            print(f"  [OK] {filename} (cached: {size_mb:.2f} MB)")
        else:
            print(f"  [DOWNLOADING] {filename}...")
            start = time.time()
            path = hf_hub_download(repo_id=MODEL_ID, filename=filename)
            size_mb = os.path.getsize(path) / (1024 * 1024)
            print(f"  [DONE] {filename} ({size_mb:.2f} MB in {time.time() - start:.1f}s)")

    print("\nAll files verified in local cache!")

if __name__ == "__main__":
    download_blip()
