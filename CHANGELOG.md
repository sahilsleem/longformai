# LongFormAI — Changelog & Milestone Archive

All notable technical milestones, engine improvements, and fixes for the LongFormAI project are documented here.

---

## [Current Development Milestone] — Local-First AI Video Assembly Checkpoint

### Core Architecture & State Management
- **Audio Playback Synchronization Overhaul**: Fixed editor audio chopping and micro-restarts by introducing `currentTimeRef` in [`useProjectStore.ts`](file:///C:/Users/Public/longformaishared/longformai/src/state/useProjectStore.ts), removing `currentTime` from the `useEffect` dependency list, and using `audio.currentTime` as the master clock during playback animation frames.
- **Relink & Media Asset Resolution**: Added project media relinking workflows for seamless migration across working directories and mobile devices without losing timeline positioning or clip transforms.

### AI Drafting & Media Intelligence Engine
- **Below-Threshold Media Fallback**: Implemented robust fallback candidate evaluation in [`draftTimeline.ts`](file:///C:/Users/Public/longformaishared/longformai/src/engine/draftTimeline.ts). If all candidates score below the $0.30$ semantic threshold, the engine evaluates available library assets to select the best available match rather than creating blank timeline gaps.
- **Analyzed Media Retention**: Expanded valid analyzed media detection to include assets with OCR text, keyframe OCR detections, temporal narrative summaries, and completed analysis flags.
- **Bidirectional OCR & Numeric Normalization**: Added [`textNormalization.ts`](file:///C:/Users/Public/longformaishared/longformai/src/engine/textNormalization.ts) and expanded `server/matching_server.py` to normalize digit strings and spoken word numbers bidirectionally (`1` ↔ `one`, `7` ↔ `seven`, `15` ↔ `fifteen`).
- **Multi-Signal Visual Modifiers**: Enhanced candidate ranking with pacing intelligence, visual variety penalties, narrative beat awareness, visual impact weighting, and subject continuity scoring.
- **AI Shot Provenance UI**: Added detailed rationale displays in [`CropInspector.tsx`](file:///C:/Users/Public/longformaishared/longformai/src/components/CropInspector.tsx) displaying match confidence, raw vs. adjusted scores, pacing arcs, and human-readable selection reasoning.

### Responsive UI & Mobile Touch Experience
- **Adaptive Workspace**: Overhauled [`App.tsx`](file:///C:/Users/Public/longformaishared/longformai/src/App.tsx) with a responsive single-column layout for mobile and tablet devices ($< 1024$px) featuring a tabbed panel switcher (Media, Transcript, 16:9 Crop, Media Info, Full Preview) while preserving the 3-column desktop layout ($\ge 1024$px).
- **16:9 Crop & Framing Touch Optimization**: Updated [`CropInspector.tsx`](file:///C:/Users/Public/longformaishared/longformai/src/components/CropInspector.tsx) with touch-friendly controls: $\ge 44$px alignment presets, $\ge 38$px framing modes, $\ge 36$px scale and reset targets, `accent-blue-500` sliders with `touch-manipulation`, and mobile input sizing (`text-sm sm:text-xs`) to prevent browser auto-zoom.

### Backend Microservices & Android / Termux Execution
- **Vision/OCR Worker (`:8766`)**: Implemented BLIP visual captioning and OCR extraction endpoint.
- **Semantic Matching Worker (`:8767`)**: Implemented `all-MiniLM-L6-v2` cosine matching microservice with Android Termux CPU/XNNPACK compatibility.
- **FFmpeg Render Worker (`:8768`)**: Implemented package-safe server execution supporting both direct invocation (`python server/render_server.py`) and module execution (`python -m server.render_server`), with multipart JSON upload, background rendering, and `/outputs/<filename>` serving.

### Verification & Automated Test Suite
- **Engine Unit Tests**: Expanded Vitest test coverage to **27 test files and 928 unit tests**, all passing.
- **TypeScript Integrity**: Verified `0` type errors across the entire codebase via `npx tsc --noEmit`.
- **Production Build**: Verified clean production asset compilation via `npm run build`.
