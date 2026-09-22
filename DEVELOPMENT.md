# LongFormAI — Developer Guide & Architecture Reference

This document provides a technical overview of LongFormAI’s architecture, core source files, development conventions, and instructions for resuming engineering work.

---

## 1. System Architecture & Worker Network

LongFormAI operates as a distributed local application:

- **Frontend (`src/`)**: A Single-Page Application (SPA) built with React 18, TypeScript, Tailwind CSS, and Vite. Handles UI interaction, canvas rendering, playhead synchronization, timeline editing, and drafting orchestration.
- **Vision/OCR Worker (`server/vision_server.py` — Port 8766)**: Handles media keyframe extraction, BLIP-based visual captioning, tag extraction, and on-screen OCR detection.
- **Semantic Matching Worker (`server/matching_server.py` — Port 8767)**: Loads `all-MiniLM-L6-v2` to generate sentence embeddings for transcript segments and visual/OCR descriptions, computing cosine similarity and rank scores.
- **Render Worker (`server/render_server.py` & `server/render_engine.py` — Port 8768)**: Executes headless FFmpeg jobs, applying per-clip 16:9 crop coordinates, transforms, audio mixing, and stitching into a final 1080p MP4.

```
+-------------------------------------------------------------------------+
|                                FRONTEND                                 |
|   App.tsx -> useProjectStore.ts -> draftTimeline.ts -> CropInspector    |
+------------------------------------+------------------------------------+
                                     |
           +-------------------------+-------------------------+
           |                         |                         |
           v                         v                         v
+---------------------+   +---------------------+   +---------------------+
| Vision Server :8766 |   | Matching Svr :8767  |   | Render Server :8768 |
| BLIP Captioning     |   | MiniLM Embeddings   |   | FFmpeg Video Export |
| Tesseract / EasyOCR |   | Cosine Similarity   |   | Multi-clip Stitcher |
+---------------------+   +---------------------+   +---------------------+
```

---

## 2. Key Source Files & Invariants

| File | Purpose | Critical Invariants |
| :--- | :--- | :--- |
| [`src/state/useProjectStore.ts`](file:///C:/Users/Public/longformaishared/longformai/src/state/useProjectStore.ts) | Central state management & playback transport. | **Audio Playback Stability**: Uses `currentTimeRef` to track playback position. `currentTime` MUST NOT be added to the audio sync `useEffect` dependency array. `audio.play()` is triggered strictly once upon starting playback. `audio.currentTime` acts as master clock during RAF ticks. |
| [`src/engine/draftTimeline.ts`](file:///C:/Users/Public/longformaishared/longformai/src/engine/draftTimeline.ts) | AI timeline generator & multi-signal scoring engine. | **Below-Threshold Fallback**: When candidates score $< 0.30$, selects the strongest available analyzed library asset rather than leaving blank gaps. Sets `isBelowThresholdFallback: true` and `candidateConfidenceLevel: 'LOW'`. Recognizes `ocrText`, keyframe OCR, and `analyzed: true`. |
| [`src/engine/textNormalization.ts`](file:///C:/Users/Public/longformaishared/longformai/src/engine/textNormalization.ts) | Bidirectional number-to-word expansion. | Harmonizes spoken words (`one`, `seven`, `fifteen`) with digit representations (`1`, `7`, `15`) for both TS matching and Python workers. |
| [`src/engine/matching.ts`](file:///C:/Users/Public/longformaishared/longformai/src/engine/matching.ts) | Client-side interface to semantic matching worker. | Communicates with port 8767 over HTTP POST `/match`. Handles graceful fallback when matching worker is offline. |
| [`src/components/CropInspector.tsx`](file:///C:/Users/Public/longformaishared/longformai/src/components/CropInspector.tsx) | 16:9 crop framing & AI shot intelligence panel. | **Responsive & Touch Sizing**: Container adapts to mobile viewports (320px–430px). Alignment presets $\ge 44$px, mode buttons $\ge 38$px, zoom presets $\ge 36$px, reset buttons $\ge 36\times 36$px. Numeric inputs use `text-sm sm:text-xs` (prevents iOS auto-zoom). Mathematical crop calculations in `calculatePanBounds` remain untouched. |
| [`src/types/project.ts`](file:///C:/Users/Public/longformaishared/longformai/src/types/project.ts) | Core TypeScript data schemas. | Defines `LongFormProject`, `TimelineItem`, `MediaAsset`, `TransformState`, `VoiceoverTrack`, and `ShotProvenance`. |
| [`server/vision_server.py`](file:///C:/Users/Public/longformaishared/longformai/server/vision_server.py) | Python Vision & OCR microservice. | Runs BLIP image captioning and text extraction over multipart form uploads or file paths. |
| [`server/matching_server.py`](file:///C:/Users/Public/longformaishared/longformai/server/matching_server.py) | Python MiniLM sentence embedding server. | Expands OCR and caption embeddings, evaluates query-candidate cosine similarity matrices. |
| [`server/render_server.py`](file:///C:/Users/Public/longformaishared/longformai/server/render_server.py) | Python FFmpeg rendering server. | Accepts full project schema JSON and renders output video via `render_engine.py`. Supports background task polling and `/outputs/<filename>` serving. |

---

## 3. Verification & Testing Commands

Before committing or testing on mobile hardware, run the standard verification pipeline:

```bash
# 1. Type-check TypeScript codebase
npx tsc --noEmit

# 2. Run all engine and regression unit tests
npx vitest run --fileParallelism=false

# 3. Verify production compilation
npm run build

# 4. (Optional) Run Python backend unit tests
python -m unittest discover -s server -p "test_*.py" -v
```

---

## 4. Android / Termux Setup

LongFormAI workers have been validated on physical Android devices running Termux:

1. **Install Prerequisites in Termux**:
   ```bash
   pkg update && pkg install python ffmpeg libjpeg-turbo
   pip install torch torchvision transformers onnxruntime pillow numpy
   ```
2. **Start Workers**:
   ```bash
   # From the project root in Termux:
   python server/vision_server.py --host 0.0.0.0 --port 8766
   python server/matching_server.py --host 0.0.0.0 --port 8767
   python server/render_server.py --host 0.0.0.0 --port 8768
   ```
3. **Configure Frontend Host**:
   In `.env.local` or via the in-app Diagnostics Modal, set the worker host IP (e.g. `192.168.1.X` or `localhost`).

---

## 5. Known Limitations & Recommended Refactoring Areas

### ⚠️ Long-Project Drafting Bottleneck
The drafting engine in [`src/engine/draftTimeline.ts`](file:///C:/Users/Public/longformaishared/longformai/src/engine/draftTimeline.ts) currently exhibits severe performance degradation on projects exceeding ~2 minutes in duration.

### Recommended Next Steps for Investigation:
1. **Candidate Pool Caching**: Cache candidate evaluation scores and MiniLM query embeddings rather than repeatedly requesting scores across adjacent segments.
2. **Batch Matching API**: Upgrade `server/matching_server.py` to accept all transcript segments and all media candidates in a single batch matrix computation rather than sequential per-segment HTTP requests.
3. **Drafting Profiler**: Instrument `console.time` checkpoints throughout `generateDraftTimeline` to measure time spent in candidate filtering, HTTP matching, fallback evaluation, and provenance formatting.
