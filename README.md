# LongFormAI

**LongFormAI** is a local AI-assisted video editing and media drafting workspace designed to turn voiceover narration and a user-provided media library into structured, multi-clip 16:9 video timelines with zero external cloud dependencies.

---

## Status

> [!NOTE]
> **Experimental / Development Checkpoint Archive**  
> LongFormAI is an experimental research and development prototype. It is **not production-ready**. This repository captures the current development checkpoint so that development can resume or be handed off cleanly.

---

## What It Does

LongFormAI implements an end-to-end, local-first workflow for assembling long-form videos:

1. **Voiceover Ingestion & Peak Waveform Extraction**: Ingests spoken audio and generates waveform data for precise timeline scrubbing.
2. **Local Transcription**: Extracts timed transcript segments using local Whisper speech-to-text models.
3. **Media Intelligence & Vision Analysis**: Processes user media (images and video footage) to extract dimensions, aspect ratios, keyframe thumbnails, visual features, and on-screen text.
4. **On-Screen OCR & Bidirectional Numeric Normalization**: Detects on-screen numbers and graphic text, harmonizing digits and spoken numbers (e.g. `1` ↔ `one`, `7` ↔ `seven`, `15` ↔ `fifteen`).
5. **Local Semantic Matching**: Evaluates semantic similarity between transcript segment narration and media visual/OCR features using local sentence embeddings (MiniLM).
6. **Multi-Signal AI Timeline Drafting**: Assembles draft timelines balancing semantic relevance, visual variety, narrative beat structure, subject continuity, pacing arcs, and reuse penalties.
7. **Below-Threshold Media Fallback Selection**: If no library asset meets the standard semantic confidence threshold ($0.30$), the draft engine evaluates all available analyzed media to choose the best available candidate rather than leaving blank gaps on the timeline.
8. **AI Shot Provenance & Rationales**: Inspects why each shot was placed, presenting similarity scores, match confidence levels, pacing classifications, and human-readable selection reasons.
9. **Responsive 16:9 Framing & Crop Inspector**: Fine-tunes independent per-clip framing (`cover`, `contain`, `custom`), 2D pan offsets, zoom scales, duration, and in-point trims across desktop, tablet, and mobile viewports.
10. **Local Headless FFmpeg Rendering**: Exports 1920×1080 @ 30 FPS MP4 videos via a standalone render worker with real-time progress tracking.

---

## System Architecture

LongFormAI is decoupled into a responsive web-based editing frontend and three lightweight, local Python workers:

```
                      +-----------------------------+
                      |   LongFormAI Web Frontend   |
                      |   (React / TypeScript /     |
                      |    Vite / Tailwind CSS)     |
                      +--------------+--------------+
                                     |
              +----------------------+----------------------+
              |                      |                      |
              v                      v                      v
     +-----------------+    +-----------------+    +-----------------+
     | Vision / OCR    |    | Semantic        |    | FFmpeg Render   |
     | Worker          |    | Matching Worker |    | Worker          |
     | (BLIP / OCR)    |    | (all-MiniLM-L6) |    | (Video Builder) |
     | Port: 8766      |    | Port: 8767      |    | Port: 8768      |
     +-----------------+    +-----------------+    +-----------------+
```

---

## Local Development & Setup

### Prerequisites

- **Node.js**: v18.0+ / npm v9.0+
- **Python**: 3.9+ (with `torch`, `transformers`, `onnxruntime`, `Pillow`, `numpy`)
- **FFmpeg**: Installed and available in your system `$PATH` (or Termux environment)

### 1. Frontend Setup

```bash
# Clone the repository
git clone <repository-url>
cd longformai

# Install dependencies
npm install

# Start local Vite development server
npm run dev
```

### 2. Local Worker Startup Commands

Workers can run on the same machine or on a secondary device on the local network (e.g., Android phone via Termux):

```bash
# Vision & OCR Worker (BLIP captioning + visual feature extraction)
python server/vision_server.py --host 0.0.0.0 --port 8766

# Semantic Matching Worker (MiniLM sentence embedding cosine matching)
python server/matching_server.py --host 0.0.0.0 --port 8767

# FFmpeg Render Server (Multi-clip video export)
python server/render_server.py --host 0.0.0.0 --port 8768
```

---

## Android / Termux Environment

LongFormAI’s local workers have been tested on real Android hardware (e.g., OnePlus Nord CE 2 Lite) running Termux:

- **Vision Worker**: `python server/vision_server.py --host 0.0.0.0 --port 8766 --model-dir ~/models/blip`
- **Matching Worker**: `python server/matching_server.py --host 0.0.0.0 --port 8767`
- **Render Worker**: `python server/render_server.py --host 0.0.0.0 --port 8768`

> [!NOTE]
> When running on Android via Termux, ONNX Runtime may output an `Unsupported platform (android)` notice. The MiniLM matching worker will automatically and successfully utilize the CPU/XNNPACK execution provider fallback.

---

## Verification & Test Suite

The codebase maintains rigorous automated test coverage across both frontend engine logic and backend server endpoints:

```bash
# 1. Type-check TypeScript codebase (0 errors)
npx tsc --noEmit

# 2. Run engine unit tests (27 test files, 928 unit tests)
npx vitest run --fileParallelism=false

# 3. Compile production bundle
npm run build
```

---

## Known Limitations

> [!WARNING]
> **Long-Project Drafting Performance & Scaling**:
> LongFormAI’s timeline drafting pipeline currently exhibits severe performance and scaling limitations on longer projects. Short test projects (a few clips) complete drafting swiftly; however, projects around ~2.5 minutes with multiple ~30-second source assets can remain in the "Drafting" stage for an extended duration.
> 
> Future investigation should profile candidate generation, matching request frequency per transcript segment, duplicate media evaluation, and embedding caching before undertaking full accuracy calibration.

See [KNOWN_ISSUES.md](file:///C:/Users/Public/longformaishared/longformai/KNOWN_ISSUES.md) for full technical details.

---

## Future Roadmap

1. **Profile Long-Project Drafting**: Trace the bottleneck causing extended drafting times on projects $\ge 2.5$ minutes.
2. **Embedding & Analysis Caching**: Avoid redundant inference and network requests by caching clip embeddings locally.
3. **Batch Matching Requests**: Consolidate segment matching calls instead of sending single-candidate queries.
4. **Candidate Pruning**: Optimize the candidate pool before scoring downstream visual modifiers.
5. **Worker Communication Profiling**: Benchmark JSON payload serialization overhead across Wi-Fi between the editor and mobile workers.
6. **Accuracy & Semantic Scoring Refinement**: Re-evaluate multi-candidate ranking once the drafting pipeline scaling is optimized.

---

## License

Internal research and development archive.
