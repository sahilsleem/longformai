# LongFormAI — Known Limitations & Diagnostic Notes

This document records the current known limitations, performance bottlenecks, and validation notes for the LongFormAI codebase.

---

## 1. Long-Project AI Drafting Performance & Scaling Bottleneck

### Description
While short test projects (15–30 seconds, 3–5 segments) complete the AI draft generation stage swiftly, longer projects (e.g., ~2.5 minutes with ~18–64 transcript segments and multiple 30-second source assets) can remain in the "Drafting" state for an extended duration.

### Technical Analysis
- **Transcription**: Works as expected (local Whisper base/small models extract timed segments).
- **Media Intelligence**: Works as expected (BLIP captioning, keyframe feature extraction, OCR).
- **Drafting Stall**: The stall occurs inside `generateDraftTimeline` in [`src/engine/draftTimeline.ts`](file:///C:/Users/Public/longformaishared/longformai/src/engine/draftTimeline.ts).
- **Potential Causes**:
  1. *Sequential HTTP Matching Calls*: Sending individual candidate matching requests over HTTP per segment rather than batched matrix embeddings.
  2. *Repeated Fallback Scoring*: Multi-signal evaluation (visual variety, pacing modifiers, subject continuity, reuse penalties) executed repeatedly across large media candidate arrays.
  3. *Un-cached Feature Vectors*: Re-evaluating text normalization and string parsing on every candidate evaluation loop.

### Recommended Resume Action
Profile the execution time of each sub-routine within `generateDraftTimeline` on a 2.5-minute dataset using `console.time`/`console.timeEnd` before altering semantic scoring weights.

---

## 2. Editor Audio Playback Synchronization

### Status: Fixed in Current Codebase (Regression Testing Recommended)
- **Previous Issue**: Rapid audio chopping, micro-restarts, and echoing caused by `currentTime` being in the React `useEffect` dependency array, triggering teardown/re-execution 60–120 times/sec during `requestAnimationFrame` ticks.
- **Current Fix**: Resolved in [`src/state/useProjectStore.ts`](file:///C:/Users/Public/longformaishared/longformai/src/state/useProjectStore.ts) using `currentTimeRef` and treating `audio.currentTime` as the authoritative playback clock.
- **Note**: Exported video MP4 audio was always rendered correctly by the FFmpeg worker. Future frontend changes should ensure `currentTime` is never reintroduced into the audio player dependency array.

---

## 3. Media Selection Semantic Accuracy vs. Fallback

### Clarification
- **Fallback Coverage**: The below-threshold fallback system guarantees that if usable media assets exist in the library, LongFormAI will **never intentionally produce a blank segment/gap** on the timeline simply because candidate similarity was $< 0.30$.
- **Accuracy Distinction**: Selecting the "best available" fallback candidate guarantees visual coverage, but does **not** mean semantic match accuracy is perfect. For example, if BLIP captions an image generically without detecting key graphic symbols, semantic matching may pick a secondary candidate.
- **Note**: The integration of bidirectional OCR numeric normalization (`1` ↔ `one`, `7` ↔ `seven`, `15` ↔ `fifteen`) substantially improves recognition of graphic text, but complex imagery may still require human adjustment via the Framing & Provenance Inspector.

---

## 4. Mobile Framing & Viewport Responsiveness

### Status: Verified (320px – 1366px+)
- **Improvements**: [`src/components/CropInspector.tsx`](file:///C:/Users/Public/longformaishared/longformai/src/components/CropInspector.tsx) contains responsive touch targets ($\ge 44$px alignment, $\ge 38$px framing modes, $\ge 36$px scale/reset buttons), `min-h-[40px]` inputs to avoid mobile browser auto-zoom, and `break-words`/`truncate` containers to avoid horizontal overflow.
- **Note**: When making future layout changes in [`src/App.tsx`](file:///C:/Users/Public/longformaishared/longformai/src/App.tsx) or modal components, continue testing across 320px, 360px, 390px, 430px, and tablet widths to ensure touch usability is maintained.
