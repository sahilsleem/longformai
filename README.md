# LongFormAI (Project Hail Mary)

**LongFormAI** is a modular, local-first video editing environment designed specifically for **16:9 YouTube long-form video creation** (1920×1080 standard).

## Project Overview

- **Target Output**: 16:9 1920×1080 @ 30 FPS.
- **Local-First**: Zero cloud dependencies, zero external APIs, client-side only.
- **Portable Architecture**: Core timeline and transform state are decoupled from the UI and exportable as standard portable JSON schemas ready for headless rendering workers (e.g., FFmpeg CLI on another machine or Android worker).

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```

### 3. Build Production Bundle
```bash
npm run build
```

## Features in this Foundation Build

1. **16:9 Video Canvas Viewport**:
   - 1920×1080 preview workspace with 16:9 guide lines and rule-of-thirds grid.
   - Interactive on-canvas pan dragging.
2. **Media Library Panel**:
   - Upload multiple local videos and photos.
   - Automatic detection of aspect ratios (16:9 native, 9:16 vertical, 1:1, 4:3) and dimensions.
   - One-click addition to the timeline.
3. **16:9 Framing & Crop Inspector**:
   - Visual 16:9 crop box mini-map over source dimensions.
   - Framing modes: `cover`, `contain`, and `custom`.
   - Sliders for Horizontal Pan (X), Vertical Pan (Y), and Zoom Scale.
   - Duration and video start-trim adjusters.
4. **Multi-Clip Timeline**:
   - Scrollable & zoomable time ruler with playhead scrubbing.
   - Reordering clips earlier/later, deleting clips, and adjusting duration.
   - Spacebar shortcut for Play/Pause.
   - Reserved track slot for future voiceover audio file.
5. **Portable Schema Import/Export**:
   - Export full project schema to `_longform_project.json` for external renderers.
