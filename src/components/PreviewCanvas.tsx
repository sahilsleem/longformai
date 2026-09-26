import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Grid,
  Eye,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  Crown,
} from 'lucide-react';
import { TimelineItem, MediaAsset, TransformState } from '../types/project';
import { calculatePanBounds, TARGET_ASPECT_RATIO } from '../engine/schema';
import { getBollywoodFrameDataUrl } from '../engine/frameAsset';

interface PreviewCanvasProps {
  activeItem: TimelineItem | null;
  activeAsset: MediaAsset | null;
  currentTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  totalDuration: number;
  onUpdateTransform?: (transformUpdates: Partial<TimelineItem['transform']>) => void;
  frameEnabled?: boolean;
  frameSrc?: string;
  onToggleFrame?: () => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  activeItem,
  activeAsset,
  currentTime,
  isPlaying,
  onPlayPause,
  onSeek,
  totalDuration,
  onUpdateTransform,
  frameEnabled = true,
  frameSrc = '/assets/frames/bollywood_frame_overlay.png',
  onToggleFrame,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 500,
  });

  const [showGuides, setShowGuides] = useState(true);
  const [isInteractiveDragging, setIsInteractiveDragging] = useState(false);
  const [dragFeedback, setDragFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const dragStartPos = useRef<{
    mouseX: number;
    mouseY: number;
    initialX: number;
    initialY: number;
  }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0,
  });

  const touchPinchRef = useRef<{
    initialDist: number;
    initialScale: number;
  } | null>(null);

  const [videoError, setVideoError] = useState<string | null>(null);

  // ResizeObserver to track container viewport size in real-time
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showToast = useCallback((msg: string) => {
    setDragFeedback(msg);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setDragFeedback(null);
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Reset video error when asset changes
  useEffect(() => {
    setVideoError(null);
  }, [activeAsset?.id, activeAsset?.url]);

  // Calculate local clip playback timecode
  const clipTime = activeItem
    ? Math.max(0, currentTime - activeItem.startTime + (activeItem.sourceStart || 0))
    : 0;

  // Sync video element time and playback state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeAsset || activeAsset.type !== 'video' || videoError) return;

    if (Math.abs(video.currentTime - clipTime) > 0.12) {
      video.currentTime = clipTime;
    }

    if (isPlaying && video.paused) {
      video.play().catch((err) => {
        console.warn('Video auto-play interrupted:', err);
      });
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentTime, isPlaying, clipTime, activeAsset, videoError]);

  const transform: TransformState = activeItem?.transform || {
    x: 0,
    y: 0,
    scale: 1.0,
    fitMode: 'cover',
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };

  const isNon16x9 =
    activeAsset &&
    activeAsset.aspectRatio &&
    Math.abs(activeAsset.aspectRatio - TARGET_ASPECT_RATIO) > 0.05;

  const isMissing = Boolean(
    activeAsset && !activeAsset.file && (!activeAsset.url || activeAsset.url.length === 0)
  );

  // Determine source dimensions & aspect ratio
  const sourceWidth = activeAsset?.width || (activeAsset?.aspectRatio ? activeAsset.aspectRatio * 1080 : 1920);
  const sourceHeight = activeAsset?.height || 1080;
  const sourceRatio =
    sourceWidth && sourceHeight && sourceHeight > 0
      ? sourceWidth / sourceHeight
      : TARGET_ASPECT_RATIO;

  // Available stage dimensions inside container (optimized tight padding to maximize screen usage)
  const padX = 8;
  const padY = 8;
  const availW = Math.max(120, containerSize.width - padX * 2);
  const availH = Math.max(80, containerSize.height - padY * 2);

  // Sizing the 16:9 Output Window and Full Source Media so the entire uncropped source is visible
  let frameW: number;
  let frameH: number;
  let sourceDisplayW: number;
  let sourceDisplayH: number;

  if (sourceRatio < TARGET_ASPECT_RATIO) {
    // Vertical / squarish source (e.g. 9:16, 1:1, 4:3)
    // To fit the full vertical height of the source inside availH:
    frameW = Math.min(availW, availH * sourceRatio);
    frameW = Math.max(100, frameW);
    frameH = frameW / TARGET_ASPECT_RATIO;
    sourceDisplayW = frameW;
    sourceDisplayH = frameW / sourceRatio;
  } else {
    // Horizontal / wide source (e.g. 16:9, 21:9)
    // To fit the full horizontal width of the source inside availW:
    frameH = Math.min(availH, availW / sourceRatio);
    frameH = Math.max(56.25, frameH);
    frameW = frameH * TARGET_ASPECT_RATIO;
    sourceDisplayH = frameH;
    sourceDisplayW = frameH * sourceRatio;
  }

  // Calculate pan limits strictly guaranteeing 100% video pixel coverage of 16:9 frame
  const bounds = calculatePanBounds(
    sourceWidth,
    sourceHeight,
    transform.scale || 1.0,
    transform.fitMode || 'cover'
  );

  // Direct Pointer Drag (Mouse & Touch single finger)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeItem || !onUpdateTransform || !activeAsset || isMissing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    setIsInteractiveDragging(true);
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: transform.x || 0,
      initialY: transform.y || 0,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isInteractiveDragging || !activeItem || !onUpdateTransform || !activeAsset) return;

    // Direct 1:1 screen mapping (percentage of 16:9 frame)
    const deltaX = ((e.clientX - dragStartPos.current.mouseX) / frameW) * 100;
    const deltaY = ((e.clientY - dragStartPos.current.mouseY) / frameH) * 100;

    const targetX = dragStartPos.current.initialX + deltaX;
    const targetY = dragStartPos.current.initialY + deltaY;

    // Strictly clamp pan coordinates so 16:9 frame never contains empty/black space
    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX));
    const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, targetY));

    const finalX = Math.round(clampedX * 10) / 10;
    const finalY = Math.round(clampedY * 10) / 10;

    onUpdateTransform({
      x: finalX,
      y: finalY,
    });

    showToast(`Pan: X ${finalX > 0 ? '+' : ''}${finalX}% • Y ${finalY > 0 ? '+' : ''}${finalY}%`);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isInteractiveDragging) return;
    setIsInteractiveDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Safe Zoom function with simultaneous pan bounds re-clamping to prevent black borders
  const updateZoom = useCallback(
    (targetScale: number) => {
      if (!activeItem || !onUpdateTransform || !activeAsset || isMissing) return;
      const newScale = Math.min(4.0, Math.max(1.0, Math.round(targetScale * 100) / 100));
      const newBounds = calculatePanBounds(sourceWidth, sourceHeight, newScale, 'cover');

      const clampedX = Math.max(newBounds.minX, Math.min(newBounds.maxX, transform.x || 0));
      const clampedY = Math.max(newBounds.minY, Math.min(newBounds.maxY, transform.y || 0));

      onUpdateTransform({
        scale: newScale,
        x: Math.round(clampedX * 10) / 10,
        y: Math.round(clampedY * 10) / 10,
      });

      showToast(`Zoom: ${(newScale * 100).toFixed(0)}%`);
    },
    [
      activeItem,
      onUpdateTransform,
      activeAsset,
      isMissing,
      sourceWidth,
      sourceHeight,
      transform.x,
      transform.y,
      showToast,
    ]
  );

  // Mouse wheel zoom on desktop
  const handleWheel = (e: React.WheelEvent) => {
    if (!activeItem || !onUpdateTransform || !activeAsset || isMissing) return;
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
    updateZoom((transform.scale || 1.0) + zoomDelta);
  };

  // Touch pinch zoom on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!activeItem || !onUpdateTransform || !activeAsset) return;
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
    if (!activeItem || !onUpdateTransform || !activeAsset) return;
    if (e.touches.length === 2 && touchPinchRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / Math.max(1, touchPinchRef.current.initialDist);
      updateZoom(touchPinchRef.current.initialScale * ratio);
    }
  };

  const handleTouchEnd = () => {
    touchPinchRef.current = null;
  };

  // Reset framing
  const handleResetFraming = () => {
    if (!activeItem || !onUpdateTransform) return;
    onUpdateTransform({
      x: 0,
      y: 0,
      scale: 1.0,
      fitMode: 'cover',
    });
    showToast('Framing reset');
  };

  // Pixel translations for the media element relative to the 16:9 frame center
  const panXPx = frameW * ((transform.x || 0) / 100);
  const panYPx = frameH * ((transform.y || 0) / 100);
  const scale = transform.scale || 1.0;

  return (
    <div className="flex-1 flex flex-col h-full bg-editor-bg overflow-hidden relative select-none">
      {/* Top Preview Status Bar */}
      <div className="h-9 px-2.5 sm:px-4 flex items-center justify-between border-b border-editor-panelBorder/50 bg-editor-panel/50 text-xs text-slate-400 overflow-x-auto scrollbar-none gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <span className="font-semibold text-slate-300 whitespace-nowrap text-[11px] sm:text-xs">
            16:9 Output Frame
          </span>
          {activeAsset && (
            <span className="text-slate-500 text-[10px] sm:text-[11px] truncate max-w-[140px] sm:max-w-[200px]">
              • {activeAsset.name}
            </span>
          )}
          {isMissing ? (
            <span className="flex items-center gap-1 text-[9px] sm:text-[10px] text-amber-300 bg-amber-950/80 px-1.5 sm:px-2 py-0.5 rounded border border-amber-700 whitespace-nowrap">
              <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
              Unlinked
            </span>
          ) : isNon16x9 ? (
            <span className="flex items-center gap-1 text-[9px] sm:text-[10px] text-amber-400 bg-amber-950/60 px-1.5 sm:px-2 py-0.5 rounded border border-amber-800/40 whitespace-nowrap">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Source {activeAsset?.aspectRatioLabel || 'Custom'}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {activeItem && onUpdateTransform && (
            <button
              onClick={handleResetFraming}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-[11px] text-slate-400 hover:text-slate-200 hover:bg-editor-surface transition-colors border border-slate-700/60 whitespace-nowrap"
              title="Reset clip framing to default center"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Reset</span>
            </button>
          )}

          <button
            onClick={() => setShowGuides(!showGuides)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-[11px] transition-colors whitespace-nowrap ${
              showGuides
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle 16:9 Rule-of-Thirds Guides"
          >
            <Grid className="w-3 h-3" />
            <span>Guides</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Stage: Displays the FULL original source media with 16:9 output mask over it */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center select-none ${
          activeItem && !isMissing
            ? isInteractiveDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : ''
        }`}
        style={{ touchAction: 'none' }}
        title={
          activeItem && !isMissing
            ? 'Drag source footage up/down/left/right to choose 16:9 framing • Scroll or pinch to zoom'
            : undefined
        }
      >
        {activeAsset && activeItem ? (
          /* Staging Canvas centered around the 16:9 Frame */
          <div
            className="relative flex items-center justify-center"
            style={{
              width: `${frameW}px`,
              height: `${frameH}px`,
            }}
          >
            {/* 1. SOURCE FOOTAGE LAYER (Full uncropped source media moving behind the 16:9 window) */}
            <div
              className="absolute pointer-events-none transition-transform duration-75"
              style={{
                width: `${sourceDisplayW}px`,
                height: `${sourceDisplayH}px`,
                transform: `translate(${panXPx}px, ${panYPx}px) scale(${scale})`,
                transformOrigin: 'center center',
              }}
            >
              {isMissing ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-amber-950/40 border border-amber-800/50 rounded-lg select-none">
                  <AlertCircle className="w-10 h-10 text-amber-400 mb-2 animate-pulse" />
                  <p className="text-sm font-semibold text-amber-200">Local Media File Unlinked</p>
                  <p className="text-xs font-mono text-amber-300/80 mt-1 max-w-xs truncate" title={activeAsset.name}>
                    {activeAsset.name}
                  </p>
                </div>
              ) : videoError ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 border border-slate-700 rounded-lg select-none">
                  <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-200">Browser Video Codec Unsupported</p>
                  <p className="text-xs font-mono text-slate-400 mt-1 truncate max-w-xs">{activeAsset.name}</p>
                </div>
              ) : activeAsset.type === 'video' ? (
                <video
                  ref={videoRef}
                  src={activeAsset.url}
                  onError={() => {
                    setVideoError('Video format or codec not decodable in this browser.');
                  }}
                  className="w-full h-full object-fill pointer-events-none rounded-sm shadow-lg"
                  playsInline
                  muted
                />
              ) : activeAsset.type === 'image' ? (
                <img
                  src={activeAsset.url}
                  alt={activeAsset.name}
                  className="w-full h-full object-fill pointer-events-none rounded-sm shadow-lg"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-900/60 rounded-lg border border-slate-800">
                  <span className="text-sm font-medium">Audio Track Playing</span>
                  <span className="text-xs text-slate-500 font-mono mt-1">{activeAsset.name}</span>
                </div>
              )}

              {/* Source Footage Outline & Label */}
              {isNon16x9 && (
                <div className="absolute inset-0 border border-slate-500/40 rounded-sm pointer-events-none">
                  <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-xs text-[9px] font-mono text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/60">
                    Full Source ({activeAsset.aspectRatioLabel || 'Custom'})
                  </div>
                </div>
              )}
            </div>

            {/* 2. FIXED 16:9 OUTPUT SELECTION WINDOW / MASK (Theatrical Cutout) */}
            <div
              className={`absolute inset-0 pointer-events-none border-2 rounded transition-colors ${
                isInteractiveDragging
                  ? 'border-blue-400 ring-2 ring-blue-500/50'
                  : 'border-blue-500/80 hover:border-blue-400'
              }`}
              style={{
                /* Box shadow dims the entire area outside the 16:9 rectangle by ~75% */
                boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.72)',
              }}
            >
              {/* Corner Brackets / Viewfinder Marks */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white pointer-events-none" />
              <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-white pointer-events-none" />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-white pointer-events-none" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-white pointer-events-none" />

              {/* 16:9 Rule of Thirds & Output Guides */}
              {showGuides && (
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-blue-400/20">
                  <div className="border-r border-b border-blue-400/15" />
                  <div className="border-r border-b border-blue-400/15" />
                  <div className="border-b border-blue-400/15" />
                  <div className="border-r border-b border-blue-400/15" />
                  <div className="border-r border-b border-blue-400/15" />
                  <div className="border-b border-blue-400/15" />
                  <div className="border-r border-b border-blue-400/15" />
                  <div className="border-r border-b border-blue-400/15" />
                  <div className="" />

                  {/* 16:9 Safe Action Margin */}
              {/* 16:9 Safe Action Margin */}
                  <div className="absolute inset-[5%] border border-blue-300/20 rounded pointer-events-none" />

                  {/* 16:9 Final Output Stamp */}
                  <div className="absolute top-2 left-2 bg-slate-900/85 backdrop-blur-xs px-2 py-0.5 rounded text-[10px] font-mono text-blue-300 pointer-events-none border border-blue-500/40 shadow-sm">
                    16:9 Output Window (1920 × 1080)
                  </div>
                </div>
              )}
            </div>

            {/* 3. PERSISTENT GLOBAL BROADCAST FRAME OVERLAY (Topmost Visual Layer) */}
            {frameEnabled && (
              <img
                src={frameSrc || getBollywoodFrameDataUrl()}
                alt="Bollywood Broadcast Frame"
                className="absolute inset-0 w-full h-full object-fill pointer-events-none z-20 select-none"
                draggable={false}
              />
            )}

            {/* Live Drag & Zoom Floating Toast Feedback */}
            {dragFeedback && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-blue-600/95 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-mono font-medium shadow-xl pointer-events-none border border-blue-400/50 flex items-center gap-1.5 animate-fadeIn z-30">
                <Move className="w-3 h-3" />
                <span>{dragFeedback}</span>
              </div>
            )}
          </div>
        ) : (
          /* Empty Timeline Placeholder with Frame Preview */
          <div
            className="w-full max-w-2xl aspect-video rounded-lg border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 p-6 text-center bg-slate-900/30 relative overflow-hidden"
          >
            {frameEnabled && (
              <img
                src={frameSrc || getBollywoodFrameDataUrl()}
                alt="Bollywood Broadcast Frame"
                className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10 select-none opacity-80"
                draggable={false}
              />
            )}
            <div className="relative z-20 flex flex-col items-center justify-center">
              <Eye className="w-10 h-10 mb-2 opacity-40 text-slate-400" />
              <p className="text-sm font-medium text-slate-400">No media at current timeline position</p>
              <p className="text-xs text-slate-600 mt-1 max-w-sm">
                Select any visual clip on the timeline to preview its full source and choose 16:9 framing.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Transport Controls & Quick Zoom Bar */}
      <div className="h-12 bg-editor-panel border-t border-editor-panelBorder px-3 sm:px-6 flex items-center justify-between shrink-0">
        {/* Playback Transport Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => onSeek(Math.max(0, currentTime - 1))}
            className="p-1.5 sm:p-2 hover:bg-editor-surface text-slate-300 hover:text-white rounded transition-colors"
            title="Step Back 1s (Left Arrow)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={onPlayPause}
            className="p-2 sm:p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all shadow-md active:scale-95"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
          </button>

          <button
            onClick={() => onSeek(Math.min(totalDuration, currentTime + 1))}
            className="p-1.5 sm:p-2 hover:bg-editor-surface text-slate-300 hover:text-white rounded transition-colors"
            title="Step Forward 1s (Right Arrow)"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Direct Manipulation Instruction Hint */}
        <div className="text-[11px] text-slate-400 hidden md:block">
          {activeItem ? (
            <span>💡 Drag footage to position inside 16:9 frame • Scroll wheel / pinch to zoom</span>
          ) : (
            <span>1920×1080 16:9 Long-Form Output Ready</span>
          )}
        </div>

        {/* Global Frame Toggle & Zoom Scale Adjuster */}
        <div className="flex items-center gap-2">
          {onToggleFrame && (
            <button
              onClick={onToggleFrame}
              className={`px-2 py-1 rounded transition-colors text-xs flex items-center gap-1.5 ${
                frameEnabled
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-editor-surface hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
              title={`Global Broadcast Frame: ${frameEnabled ? 'ON' : 'OFF'}`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span className="font-medium text-[11px]">Frame: {frameEnabled ? 'On' : 'Off'}</span>
            </button>
          )}

          {activeItem && onUpdateTransform ? (
            <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-slate-400 font-mono">
              <button
                onClick={() => updateZoom((transform.scale || 1.0) - 0.1)}
                className="p-1.5 hover:bg-editor-surface rounded text-slate-300"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-[40px] sm:min-w-[48px] text-center text-[11px] sm:text-xs text-blue-300">
                {Math.round((transform.scale || 1.0) * 100)}%
              </span>
              <button
                onClick={() => updateZoom((transform.scale || 1.0) + 0.1)}
                className="p-1.5 hover:bg-editor-surface rounded text-slate-300"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-xs font-mono text-slate-500">100%</div>
          )}
        </div>
      </div>
    </div>
  );
};
