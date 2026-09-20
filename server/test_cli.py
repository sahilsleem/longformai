import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

def test_ffmpeg_overlay():
    print("Testing ffmpeg installation...")
    res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
    print("FFmpeg version line:", res.stdout.splitlines()[0] if res.stdout else "Not found")
    assert res.returncode == 0

if __name__ == "__main__":
    test_ffmpeg_overlay()
