import React, { useRef, useState, useEffect } from 'react';
import {
  RotateCcw,
  Check,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Grid,
  Move,
  AlignCenter,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Film,
  Image as ImageIcon,
} from 'lucide-react';
import { TimelineItem, MediaAsset, FitMode, TransformState } from '../types/project';
import { calculatePanBounds, createDefaultTransform, TARGET_ASPECT_RATIO } from '../engine/schema';

export interface FramingEditorModalProps {
  isOpen: boolean;
  activeItem: TimelineItem | null;
  activeAsset: MediaAsset | null;
  timeline: TimelineItem[];
  mediaList?: MediaAsset[];
  onClose: () => void;
  onUpdateTransform: (itemId: string, updates: Partial<TransformState>) => void;
  onSelectClip: (itemId: string) => void;
}

export const FramingEditorModal: React.FC<FramingEditorModalProps> = ({
  isOpen,
  activeItem,
  activeAsset,
  timeline,
  onClose,
  onUpdateTransform,
  onSelectClip,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [showGuides, setShowGuides] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    initialX: number;
    initialY: number;
  }>({
    pointerX: 0,
    pointerY: 0,
    initialX: 0,
    initialY: 0,
  });

  const touchPinchRef = useRef<{
    initialDist: number;
    initialScale: number;
  } | null>(null);

  const showLiveFeedback = (text: string) => {
    setFeedback(text);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  if (!isOpen || !activeItem || !activeAsset) {
    return null;
  }

  const transform: TransformState = activeItem.transform || createDefaultTransform(activeAsset.width, activeAsset.height);
  const sourceWidth = activeAsset.width || 1920;
  const sourceHeight = activeAsset.height || 1080;
  const sourceRatio = sourceWidth / sourceHeight;
  const isNative16x9 = Math.abs(sourceRatio - TARGET_ASPECT_RATIO) < 0.05;

  const bounds = calculatePanBounds(
    sourceWidth,
    sourceHeight,
    transform.scale || 1.0,
    transform.fitMode || 'cover'
  );

  // Navigation: Find current clip index and prev/next
  const currentIndex = timeline.findIndex((item) => item.id === activeItem.id);
  const prevClip = currentIndex > 0 ? timeline[currentIndex - 1] : null;
  const nextClip = currentIndex >= 0 && currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : null;

  // 1. Core Action: Reset
  const handleReset = () => {
    onUpdateTransform(activeItem.id, {
      x: 0,
      y: 0,
      scale: 1.0,
      fitMode: 'cover',
    });
    showLiveFeedback('Framing reset to centered cover');
  };

  // 2. Core Action: Toggle Fit / Cover
  const handleToggleFit = () => {
    const nextMode: FitMode = transform.fitMode === 'contain' ? 'cover' : 'contain';
    onUpdateTransform(activeItem.id, {
      fitMode: nextMode,
      x: 0,
      y: 0,
    });
    showLiveFeedback(nextMode === 'contain' ? 'Fit mode: Show entire media' : 'Cover mode: Edge-to-edge 16:9');
  };

  // 3. Core Action: Done (Save & Close)
  const handleDone = () => {
    onClose();
  };

  // Pointer drag handling for direct mouse & touch manipulation
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    // Capture pointer to track gestures smoothly even outside viewport
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails
    }

    setIsDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initialX: transform.x || 0,
      initialY: transform.y || 0,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    // Viewport dimensions for responsive normalized pan sensitivity
    const rect = viewportRef.current?.getBoundingClientRect();
    const vpWidth = rect?.width || 800;
    const vpHeight = rect?.height || 450;

    // Sensitivity factor: maps screen pixels to percentage pan offsets
    const deltaX = ((e.clientX - dragStartRef.current.pointerX) / vpWidth) * 100 * (1 / (transform.scale || 1.0));
    const deltaY = ((e.clientY - dragStartRef.current.pointerY) / vpHeight) * 100 * (1 / (transform.scale || 1.0));

    const targetX = dragStartRef.current.initialX + deltaX;
    const targetY = dragStartRef.current.initialY + deltaY;

    // Clamp within calculated allowable bounds to avoid empty borders in cover mode
    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX));
    const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, targetY));

    const finalX = Math.round(clampedX * 10) / 10;
    const finalY = Math.round(clampedY * 10) / 10;

    onUpdateTransform(activeItem.id, {
      x: finalX,
      y: finalY,
    });

    showLiveFeedback(`Pan: X ${finalX > 0 ? '+' : ''}${finalX}% • Y ${finalY > 0 ? '+' : ''}${finalY}%`);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomStep = e.deltaY < 0 ? 0.08 : -0.08;
    const newScale = Math.min(4.0, Math.max(1.0, (transform.scale || 1.0) + zoomStep));
    const roundedScale = Math.round(newScale * 100) / 100;

    onUpdateTransform(activeItem.id, {
      scale: roundedScale,
    });

    showLiveFeedback(`Zoom: ${(roundedScale * 100).toFixed(0)}%`);
  };

  // Touch pinch gesture zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchPinchRef.current = {
        initialDist: dist,
        initialScale: transform.scale || 1.0,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchPinchRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / Math.max(1, touchPinchRef.current.initialDist);
      const newScale = Math.min(4.0, Math.max(1.0, touchPinchRef.current.initialScale * ratio));
      const roundedScale = Math.round(newScale * 100) / 100;

      onUpdateTransform(activeItem.id, {
        scale: roundedScale,
      });

      showLiveFeedback(`Zoom: ${(roundedScale * 100).toFixed(0)}%`);
    }
  };

  const handleTouchEnd = () => {
    touchPinchRef.current = null;
  };

  // Double tap / double click to reset or toggle fit
  const handleDoubleClick = () => {
    if ((transform.scale || 1.0) > 1.05 || (transform.x || 0) !== 0 || (transform.y || 0) !== 0) {
      handleReset();
    } else {
      handleToggleFit();
    }
  };

  // Zoom step adjuster
  const handleAdjustZoom = (delta: number) => {
    const newScale = Math.min(4.0, Math.max(1.0, Math.round(((transform.scale || 1.0) + delta) * 20) / 20));
    onUpdateTransform(activeItem.id, {
      scale: newScale,
    });
    showLiveFeedback(`Zoom: ${(newScale * 100).toFixed(0)}%`);
  };

  // Alignment presets
  const handleSetAlignment = (x: number, y: number, label: string) => {
    onUpdateTransform(activeItem.id, {
      x: Math.round(Math.max(bounds.minX, Math.min(bounds.maxX, x)) * 10) / 10,
      y: Math.round(Math.max(bounds.minY, Math.min(bounds.maxY, y)) * 10) / 10,
    });
    showLiveFeedback(`Aligned ${label}`);
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        handleDone();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFit();
      } else if (e.key === 'ArrowLeft' && e.shiftKey && prevClip) {
        e.preventDefault();
        onSelectClip(prevClip.id);
      } else if (e.key === 'ArrowRight' && e.shiftKey && nextClip) {
        e.preventDefault();
        onSelectClip(nextClip.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, prevClip, nextClip, activeItem.id, transform]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-between overflow-hidden select-none animate-fadeIn"
      style={{ touchAction: 'none' }}
    >
      {/* 1. Top Header Bar */}
      <div className="h-14 sm:h-16 px-3 sm:px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Clip Info & Ratio Badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            {activeAsset.type === 'video' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
          </div>
          
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="text-xs sm:text-sm font-semibold text-white truncate max-w-[140px] sm:max-w-xs md:max-w-md">
                {activeAsset.name}
              </h2>
              <span
                className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border shrink-0 ${
                  isNative16x9
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                    : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                }`}
              >
                {activeAsset.aspectRatioLabel || `${sourceWidth}×${sourceHeight}`}
              </span>
            </div>
            
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5">
              Shot #{currentIndex + 1} of {timeline.length} • Duration: {activeItem.duration.toFixed(1)}s
            </p>
          </div>
        </div>

        {/* Center: Clip Sequencer Navigation */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-800/80 rounded-lg p-1 border border-slate-700/60">
          <button
            onClick={() => prevClip && onSelectClip(prevClip.id)}
            disabled={!prevClip}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
              prevClip
                ? 'text-slate-200 hover:bg-slate-700 active:bg-slate-600 cursor-pointer'
                : 'text-slate-500 cursor-not-allowed opacity-50'
            }`}
            title="Previous Clip (Shift + Left Arrow)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev Clip</span>
          </button>

          <span className="text-slate-500 text-xs px-1 font-mono">
            {currentIndex + 1} / {timeline.length}
          </span>

          <button
            onClick={() => nextClip && onSelectClip(nextClip.id)}
            disabled={!nextClip}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
              nextClip
                ? 'text-slate-200 hover:bg-slate-700 active:bg-slate-600 cursor-pointer'
                : 'text-slate-500 cursor-not-allowed opacity-50'
            }`}
            title="Next Clip (Shift + Right Arrow)"
          >
            <span>Next Clip</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Quick Guides Toggle & Done Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowGuides(!showGuides)}
            className={`p-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              showGuides
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle 16:9 Rule of Thirds Grid"
          >
            <Grid className="w-4 h-4" />
            <span className="hidden sm:inline">Guides</span>
          </button>

          <button
            onClick={handleDone}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-blue-900/30 transition-all cursor-pointer min-h-[40px]"
            title="Confirm Framing (Enter or Escape)"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Done</span>
          </button>
        </div>
      </div>

      {/* 2. Main Direct Manipulation Viewport */}
      <div className="flex-1 p-2 sm:p-4 md:p-6 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Interactive Gesture Viewport (Always 16:9 YouTube Output Frame) */}
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
          className={`w-full max-w-4xl aspect-video bg-black rounded-xl shadow-2xl relative overflow-hidden border-2 border-slate-700/80 flex items-center justify-center touch-none select-none transition-shadow ${
            isDragging ? 'cursor-grabbing shadow-blue-500/20 border-blue-500/60 ring-2 ring-blue-500/40' : 'cursor-grab hover:border-slate-600'
          }`}
          style={{ touchAction: 'none' }}
        >
          {/* Render Active Footage Inside 16:9 Frame */}
          <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-black pointer-events-none">
            {activeAsset.type === 'video' ? (
              <video
                ref={videoRef}
                src={activeAsset.url}
                className={`w-full h-full pointer-events-none transition-transform duration-75 ${
                  transform.fitMode === 'contain' ? 'object-contain' : 'object-cover'
                }`}
                style={{
                  transform: `translate(${transform.x || 0}%, ${transform.y || 0}%) scale(${transform.scale || 1.0})`,
                  transformOrigin: 'center center',
                }}
                playsInline
                muted
                autoPlay
                loop
              />
            ) : (
              <img
                src={activeAsset.url}
                alt={activeAsset.name}
                className={`w-full h-full pointer-events-none transition-transform duration-75 ${
                  transform.fitMode === 'contain' ? 'object-contain' : 'object-cover'
                }`}
                style={{
                  transform: `translate(${transform.x || 0}%, ${transform.y || 0}%) scale(${transform.scale || 1.0})`,
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            )}
          </div>

          {/* 16:9 Rule of Thirds & Output Guides */}
          {showGuides && (
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-blue-400/20">
              <div className="border-r border-b border-blue-400/20" />
              <div className="border-r border-b border-blue-400/20" />
              <div className="border-b border-blue-400/20" />
              <div className="border-r border-b border-blue-400/20" />
              <div className="border-r border-b border-blue-400/20" />
              <div className="border-b border-blue-400/20" />
              <div className="border-r border-b border-blue-400/20" />
              <div className="border-r border-b border-blue-400/20" />
              <div className="" />

              {/* 16:9 Title & Action Safe Area Box */}
              <div className="absolute inset-[6%] border border-dashed border-blue-400/25 rounded pointer-events-none" />

              {/* YouTube Master 16:9 Badge */}
              <div className="absolute top-2.5 left-2.5 bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-md text-[10px] font-mono text-slate-300 pointer-events-none border border-slate-700/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span>1920 × 1080 (16:9 YouTube Master)</span>
              </div>
            </div>
          )}

          {/* Live Drag & Zoom Floating Toast Feedback */}
          {feedback && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600/95 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs font-mono font-medium shadow-2xl pointer-events-none border border-blue-400/60 flex items-center gap-2 animate-fadeIn z-30">
              <Move className="w-3.5 h-3.5" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Direct Gesture Overlay Helper Banner */}
          {!feedback && !isDragging && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-slate-300 px-3.5 py-1 rounded-full text-[11px] pointer-events-none border border-slate-800/80 flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
              <span>Drag footage to reframe • Pinch or scroll to zoom</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Direct Action Controls Bar */}
      <div className="bg-slate-900/95 border-t border-slate-800 px-3 sm:px-6 py-2.5 sm:py-3 shrink-0">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          {/* Left Action Buttons: [Reset] and [Fit / Cover] */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Core Action 1: Reset */}
            <button
              onClick={handleReset}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-4 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
              title="Reset to default centered framing (R)"
            >
              <RotateCcw className="w-4 h-4 text-slate-400" />
              <span>Reset</span>
            </button>

            {/* Core Action 2: Fit / Cover Toggle */}
            <button
              onClick={handleToggleFit}
              className={`min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-4 rounded-lg border text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                transform.fitMode === 'contain'
                  ? 'bg-amber-600/20 text-amber-300 border-amber-500/50 hover:bg-amber-600/30'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
              title="Toggle between edge-to-edge Cover and full media Fit (F)"
            >
              {transform.fitMode === 'contain' ? (
                <>
                  <Minimize2 className="w-4 h-4 text-amber-400" />
                  <span>Fit (Letterbox)</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-blue-400" />
                  <span>Cover (Fill 16:9)</span>
                </>
              )}
            </button>
          </div>

          {/* Center: Zoom Controls (+, Slider, -) */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/80 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-700/60">
            <button
              onClick={() => handleAdjustZoom(-0.1)}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-300 active:bg-slate-600 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.05"
              value={transform.scale || 1.0}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onUpdateTransform(activeItem.id, { scale: val });
                showLiveFeedback(`Zoom: ${(val * 100).toFixed(0)}%`);
              }}
              className="w-20 sm:w-32 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              title="Zoom Scale"
            />

            <button
              onClick={() => handleAdjustZoom(0.1)}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-300 active:bg-slate-600 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <span className="font-mono text-xs text-blue-400 font-semibold min-w-[42px] text-right">
              {Math.round((transform.scale || 1.0) * 100)}%
            </span>
          </div>

          {/* Right: Quick Alignment Buttons & Mobile Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleSetAlignment(0, 0, 'Center')}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-colors flex items-center gap-1"
              title="Center Align"
            >
              <AlignCenter className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Center</span>
            </button>

            <button
              onClick={() => handleSetAlignment(0, bounds.minY, 'Top')}
              className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Align Top"
            >
              <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => handleSetAlignment(0, bounds.maxY, 'Bottom')}
              className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Align Bottom"
            >
              <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => handleSetAlignment(bounds.minX, 0, 'Left')}
              className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Align Left"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => handleSetAlignment(bounds.maxX, 0, 'Right')}
              className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Align Right"
            >
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Mobile Prev / Next Buttons */}
            <div className="flex md:hidden items-center gap-1 ml-1 border-l border-slate-800 pl-2">
              <button
                onClick={() => prevClip && onSelectClip(prevClip.id)}
                disabled={!prevClip}
                className="p-2 rounded bg-slate-800 disabled:opacity-30 text-slate-300"
                title="Previous Clip"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => nextClip && onSelectClip(nextClip.id)}
                disabled={!nextClip}
                className="p-2 rounded bg-slate-800 disabled:opacity-30 text-slate-300"
                title="Next Clip"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
