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
} from 'lucide-react';
import { TimelineItem, MediaAsset, TransformState } from '../types/project';
import { calculatePanBounds, TARGET_ASPECT_RATIO } from '../engine/schema';

interface PreviewCanvasProps {
  activeItem: TimelineItem | null;
  activeAsset: MediaAsset | null;
  currentTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  totalDuration: number;
  onUpdateTransform?: (transformUpdates: Partial<TimelineItem['transform']>) => void;
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
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

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

    const rect = frameRef.current?.getBoundingClientRect();
    const boxWidth = rect?.width || 800;
    const boxHeight = rect?.height || 450;

    // Direct 1:1 screen mapping (percentage of 16:9 frame)
    const deltaX = ((e.clientX - dragStartPos.current.mouseX) / boxWidth) * 100;
    const deltaY = ((e.clientY - dragStartPos.current.mouseY) / boxHeight) * 100;

    const bounds = calculatePanBounds(
      activeAsset.width,
      activeAsset.height,
      transform.scale || 1.0,
      transform.fitMode || 'cover'
    );

    const targetX = dragStartPos.current.initialX + deltaX;
    const targetY = dragStartPos.current.initialY + deltaY;

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

  // Mouse wheel zoom on desktop
  const handleWheel = (e: React.WheelEvent) => {
    if (!activeItem || !onUpdateTransform || !activeAsset || isMissing) return;
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
    const newScale = Math.min(4.0, Math.max(1.0, (transform.scale || 1.0) + zoomDelta));
    const rounded = Math.round(newScale * 100) / 100;

    onUpdateTransform({
      scale: rounded,
    });
    showToast(`Zoom: ${(rounded * 100).toFixed(0)}%`);
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
      const newScale = Math.min(4.0, Math.max(1.0, touchPinchRef.current.initialScale * ratio));
      const rounded = Math.round(newScale * 100) / 100;

      onUpdateTransform({
        scale: rounded,
      });
      showToast(`Zoom: ${(rounded * 100).toFixed(0)}%`);
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

  return (
    <div className="flex-1 flex flex-col h-full bg-editor-bg overflow-hidden relative select-none">
      {/* Top Preview Status Bar */}
      <div className="h-9 px-2.5 sm:px-4 flex items-center justify-between border-b border-editor-panelBorder/50 bg-editor-panel/50 text-xs text-slate-400 overflow-x-auto scrollbar-none gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <span className="font-semibold text-slate-300 whitespace-nowrap text-[11px] sm:text-xs">16:9 Frame</span>
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
              Framed ({activeAsset?.aspectRatioLabel})
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {activeItem && onUpdateTransform && (
            <button
              onClick={handleResetFraming}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-[11px] text-slate-400 hover:text-slate-200 hover:bg-editor-surface transition-colors border border-slate-700/60 whitespace-nowrap"
              title="Reset clip framing to default center (16:9)"
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

      {/* Main Preview Container with Dimmed Surround & Fixed 16:9 Output Viewport */}
      <div
        ref={containerRef}
        className="flex-1 p-2 sm:p-4 md:p-6 flex items-center justify-center relative overflow-hidden bg-slate-950/90"
      >
        {/* Fixed 16:9 YouTube Master Frame */}
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`w-full max-w-4xl aspect-video bg-black rounded-lg shadow-2xl relative overflow-hidden border-2 border-slate-700/80 flex items-center justify-center select-none ${
            activeItem && !isMissing
              ? isInteractiveDragging
                ? 'cursor-grabbing border-blue-500/80 ring-2 ring-blue-500/40 shadow-blue-900/30'
                : 'cursor-grab hover:border-slate-500'
              : ''
          }`}
          style={{ touchAction: 'none' }}
          title={
            activeItem && !isMissing
              ? 'Drag to reposition footage inside 16:9 frame • Scroll or pinch to zoom'
              : undefined
          }
        >
          {/* Active Footage Inside the Fixed 16:9 Frame */}
          {activeAsset && activeItem ? (
            <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-black pointer-events-none">
              {isMissing ? (
                <div className="flex flex-col items-center justify-center p-6 text-center bg-amber-950/30 border border-amber-800/50 rounded-xl max-w-md mx-4 select-none">
                  <AlertCircle className="w-10 h-10 text-amber-400 mb-2 animate-pulse" />
                  <p className="text-sm font-semibold text-amber-200">Local Media File Unlinked</p>
                  <p className="text-xs font-mono text-amber-300/80 mt-1 max-w-xs truncate" title={activeAsset.name}>
                    {activeAsset.name}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                    Relink this file using the Relink Manager to preview and frame footage.
                  </p>
                </div>
              ) : videoError ? (
                <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 border border-slate-700 rounded-xl max-w-md mx-4 select-none">
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
                  className={`w-full h-full pointer-events-none transition-transform duration-75 ${
                    transform.fitMode === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                  style={{
                    transform: `translate(${transform.x || 0}%, ${transform.y || 0}%) scale(${transform.scale || 1.0})`,
                    transformOrigin: 'center center',
                  }}
                  playsInline
                  muted
                />
              ) : activeAsset.type === 'image' ? (
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
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <span className="text-sm font-medium">Audio Track Playing</span>
                  <span className="text-xs text-slate-500 font-mono mt-1">{activeAsset.name}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <Eye className="w-10 h-10 mb-2 opacity-40 text-slate-400" />
              <p className="text-sm font-medium text-slate-400">No media at current timeline position</p>
              <p className="text-xs text-slate-600 mt-1 max-w-sm">
                Select any visual clip on the timeline to preview and directly frame it.
              </p>
            </div>
          )}

          {/* 16:9 Rule of Thirds & Output Frame Guides */}
          {showGuides && (
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-blue-500/20">
              <div className="border-r border-b border-blue-500/15" />
              <div className="border-r border-b border-blue-500/15" />
              <div className="border-b border-blue-500/15" />
              <div className="border-r border-b border-blue-500/15" />
              <div className="border-r border-b border-blue-500/15" />
              <div className="border-b border-blue-500/15" />
              <div className="border-r border-b border-blue-500/15" />
              <div className="border-r border-b border-blue-500/15" />
              <div className="" />

              {/* 16:9 Safe Area Guide */}
              <div className="absolute inset-[5%] border border-blue-400/20 rounded pointer-events-none" />

              {/* 1920x1080 16:9 Final Output Stamp */}
              <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 pointer-events-none border border-slate-700/50">
                1920 × 1080 (16:9 Final Frame)
              </div>
            </div>
          )}

          {/* Live Drag & Zoom Floating Toast Feedback */}
          {activeItem && dragFeedback && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-mono font-medium shadow-lg pointer-events-none border border-blue-400/50 flex items-center gap-1.5 animate-fadeIn z-20">
              <Move className="w-3 h-3" />
              <span>{dragFeedback}</span>
            </div>
          )}
        </div>
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
            className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shadow-md"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
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

        {/* Zoom Scale Adjuster */}
        {activeItem && onUpdateTransform ? (
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-slate-400 font-mono">
            <button
              onClick={() =>
                onUpdateTransform({
                  scale: Math.max(1.0, Math.round(((transform.scale || 1.0) - 0.1) * 10) / 10),
                })
              }
              className="p-1.5 hover:bg-editor-surface rounded text-slate-300"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[40px] sm:min-w-[48px] text-center text-[11px] sm:text-xs text-blue-300">
              {Math.round((transform.scale || 1.0) * 100)}%
            </span>
            <button
              onClick={() =>
                onUpdateTransform({
                  scale: Math.min(4.0, Math.round(((transform.scale || 1.0) + 0.1) * 10) / 10),
                })
              }
              className="p-1.5 hover:bg-editor-surface rounded text-slate-300"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-mono">100% Fit</div>
        )}
      </div>
    </div>
  );
};
