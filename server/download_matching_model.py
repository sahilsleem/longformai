"""
LongFormAI - Matching Model Downloader
Downloads and verifies sentence-transformers/all-MiniLM-L6-v2 weights for offline semantic matching.
"""
import sys
import os
import time
from huggingface_hub import hf_hub_download, try_to_load_from_cache
from transformers import AutoTokenizer, AutoModel

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"

def download_matching_model():
    print(f"Checking & downloading '{MODEL_ID}' for offline local matching...")
    start = time.time()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModel.from_pretrained(MODEL_ID)
    print(f"Model and tokenizer downloaded and cached in {time.time() - start:.2f}s!")

if __name__ == "__main__":
    download_matching_model()
