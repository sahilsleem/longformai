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
  Move,
} from 'lucide-react';
import { TimelineItem, MediaAsset } from '../types/project';
import { calculatePanBounds } from '../engine/schema';

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
  const [showGuides, setShowGuides] = useState(true);
  const [isInteractiveDragging, setIsInteractiveDragging] = useState(false);
  const [dragFeedback, setDragFeedback] = useState<string | null>(null);

  const dragStartPos = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0,
  });

  const touchStartDist = useRef<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

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

    // Only seek video if difference is significant to avoid stutter during continuous playback
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

  const transform = activeItem?.transform || {
    x: 0,
    y: 0,
    scale: 1.0,
    fitMode: 'cover',
    crop: { x: 0, y: 0, width: 1, height: 1 },
  };

  // Direct mouse drag on 16:9 canvas to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!activeItem || !onUpdateTransform || e.button !== 0) return;
    setIsInteractiveDragging(true);
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: transform.x || 0,
      initialY: transform.y || 0,
    };
    setDragFeedback(`X: ${(transform.x || 0).toFixed(0)}% | Y: ${(transform.y || 0).toFixed(0)}%`);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isInteractiveDragging || !activeItem || !onUpdateTransform || !activeAsset) return;

      const deltaX = (e.clientX - dragStartPos.current.mouseX) * 0.22;
      const deltaY = (e.clientY - dragStartPos.current.mouseY) * 0.22;

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

      setDragFeedback(`Pan X: ${finalX.toFixed(1)}% | Y: ${finalY.toFixed(1)}%`);
    },
    [isInteractiveDragging, activeItem, onUpdateTransform, activeAsset, transform.scale, transform.fitMode]
  );

  const handleMouseUp = useCallback(() => {
    setIsInteractiveDragging(false);
    setTimeout(() => setDragFeedback(null), 800);
  }, []);

  useEffect(() => {
    if (isInteractiveDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isInteractiveDragging, handleMouseMove, handleMouseUp]);

  // Direct mouse wheel zoom on 16:9 canvas
  const handleWheel = (e: React.WheelEvent) => {
    if (!activeItem || !onUpdateTransform) return;
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
    const newScale = Math.min(4.0, Math.max(1.0, (transform.scale || 1.0) + zoomDelta));
    const rounded = Math.round(newScale * 100) / 100;
    
    onUpdateTransform({
      scale: rounded,
    });
    setDragFeedback(`Zoom: ${(rounded * 100).toFixed(0)}%`);
    setTimeout(() => setDragFeedback(null), 1200);
  };

  // Touch drag & pinch zoom support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!activeItem || !onUpdateTransform) return;
    if (e.touches.length === 1) {
      setIsInteractiveDragging(true);
      dragStartPos.current = {
        mouseX: e.touches[0].clientX,
        mouseY: e.touches[0].clientY,
        initialX: transform.x || 0,
        initialY: transform.y || 0,
      };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDist.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!activeItem || !onUpdateTransform || !activeAsset) return;
    if (e.touches.length === 1 && isInteractiveDragging) {
      const deltaX = (e.touches[0].clientX - dragStartPos.current.mouseX) * 0.22;
      const deltaY = (e.touches[0].clientY - dragStartPos.current.mouseY) * 0.22;

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

      onUpdateTransform({
        x: Math.round(clampedX * 10) / 10,
        y: Math.round(clampedY * 10) / 10,
      });
    } else if (e.touches.length === 2 && touchStartDist.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchStartDist.current;
      const newScale = Math.min(4.0, Math.max(1.0, (transform.scale || 1.0) * factor));
      onUpdateTransform({
        scale: Math.round(newScale * 100) / 100,
      });
      touchStartDist.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsInteractiveDragging(false);
    touchStartDist.current = null;
    setTimeout(() => setDragFeedback(null), 800);
  };

  const isNon16x9 =
    activeAsset &&
    activeAsset.aspectRatio &&
    Math.abs(activeAsset.aspectRatio - 16 / 9) > 0.05;

  const isMissing = Boolean(
    activeAsset && !activeAsset.file && (!activeAsset.url || activeAsset.url.length === 0)
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-editor-bg overflow-hidden relative select-none">
      {/* Top Preview Status Bar */}
      <div className="h-9 px-4 flex items-center justify-between border-b border-editor-panelBorder/50 bg-editor-panel/50 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-300">16:9 Canvas Viewport</span>
          {activeAsset && (
            <span className="text-slate-500 text-[11px] truncate max-w-[180px]">
              • {activeAsset.name}
            </span>
          )}
          {isMissing ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              File Unlinked
            </span>
          ) : isNon16x9 ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
              <AlertCircle className="w-3 h-3" />
              Framed to 16:9 ({activeAsset?.aspectRatioLabel})
            </span>
          ) : null}
          {transform.fitMode && (
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">
              {transform.fitMode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuides(!showGuides)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              showGuides
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle 16:9 Framing / Rule-of-Thirds Guides"
          >
            <Grid className="w-3 h-3" />
            <span>Guides</span>
          </button>
        </div>
      </div>

      {/* Main 16:9 Preview Viewport */}
      <div
        ref={containerRef}
        className="flex-1 p-6 flex items-center justify-center relative overflow-hidden"
      >
        {/* The 16:9 Aspect Ratio Box (Represents 1920x1080 Output Frame) */}
        <div
          className={`w-full max-w-4xl aspect-video bg-black rounded-lg shadow-2xl relative overflow-hidden border border-slate-700/60 flex items-center justify-center ${
            activeItem && !isMissing ? (isInteractiveDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
          onMouseDown={activeItem && !isMissing ? handleMouseDown : undefined}
          onWheel={activeItem && !isMissing ? handleWheel : undefined}
          onTouchStart={activeItem && !isMissing ? handleTouchStart : undefined}
          onTouchMove={activeItem && !isMissing ? handleTouchMove : undefined}
          onTouchEnd={handleTouchEnd}
          title={activeItem && !isMissing ? 'Click & Drag to pan 16:9 framing • Scroll to Zoom' : undefined}
        >
          {/* Active Item Media Rendering */}
          {activeAsset && activeItem ? (
            <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-black">
              {isMissing ? (
                <div className="flex flex-col items-center justify-center p-6 text-center bg-amber-950/30 border border-amber-800/50 rounded-xl max-w-md mx-4 select-none">
                  <AlertCircle className="w-10 h-10 text-amber-400 mb-2 animate-pulse" />
                  <p className="text-sm font-semibold text-amber-200">Local Media File Unlinked</p>
                  <p className="text-xs font-mono text-amber-300/80 mt-1 max-w-xs truncate" title={activeAsset.name}>
                    {activeAsset.name}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                    This file reference was imported from project JSON. Relink the local file using the Relink Manager to preview and edit footage.
                  </p>
                </div>
              ) : videoError ? (
                <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 border border-slate-700 rounded-xl max-w-md mx-4 select-none">
                  <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-200">Browser Video Codec Unsupported</p>
                  <p className="text-xs font-mono text-slate-400 mt-1 truncate max-w-xs">{activeAsset.name}</p>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    The browser cannot decode this video stream directly. The file remains intact and local FFmpeg rendering will decode it normally.
                  </p>
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
            /* Empty State / Unassigned visual gap */
            <div className="flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <Eye className="w-10 h-10 mb-2 opacity-40 text-slate-400" />
              <p className="text-sm font-medium text-slate-400">No media at current timeline position</p>
              <p className="text-xs text-slate-600 mt-1 max-w-sm">
                Unassigned visual gap. Add media from the Media Library or select a clip in the timeline.
              </p>
            </div>
          )}

          {/* 16:9 Framing / Rule of Thirds Overlays */}
          {showGuides && (
            <div className="absolute inset-0 pointer-events-none border border-blue-500/20 grid grid-cols-3 grid-rows-3">
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

              {/* 1920x1080 Stamp */}
              <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 pointer-events-none border border-slate-700/50">
                1920 × 1080 (16:9)
              </div>
            </div>
          )}

          {/* Live Drag & Zoom Feedback Toast */}
          {activeItem && dragFeedback && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-mono font-medium shadow-lg pointer-events-none border border-blue-400/50 flex items-center gap-1.5 animate-fadeIn">
              <Move className="w-3 h-3" />
              <span>{dragFeedback}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Transport Controls Bar */}
      <div className="h-12 bg-editor-panel border-t border-editor-panelBorder px-6 flex items-center justify-between">
        {/* Playback Transport Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSeek(Math.max(0, currentTime - 1))}
            className="p-1.5 hover:bg-editor-surface text-slate-300 hover:text-white rounded transition-colors"
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
            className="p-1.5 hover:bg-editor-surface text-slate-300 hover:text-white rounded transition-colors"
            title="Step Forward 1s (Right Arrow)"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Framing Guide Hint */}
        <div className="text-[11px] text-slate-400 hidden sm:block">
          {activeItem ? (
            <span>💡 Click & drag canvas to pan 16:9 frame • Scroll wheel to zoom</span>
          ) : (
            <span>1920×1080 16:9 Long-Form Canvas Ready</span>
          )}
        </div>

        {/* Zoom Quick Adjuster */}
        {activeItem && onUpdateTransform ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <button
              onClick={() =>
                onUpdateTransform({ scale: Math.max(1.0, Math.round(((transform.scale || 1.0) - 0.1) * 10) / 10) })
              }
              className="p-1 hover:bg-editor-surface rounded text-slate-300"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[48px] text-center">
              {Math.round((transform.scale || 1.0) * 100)}%
            </span>
            <button
              onClick={() =>
                onUpdateTransform({ scale: Math.min(4.0, Math.round(((transform.scale || 1.0) + 0.1) * 10) / 10) })
              }
              className="p-1 hover:bg-editor-surface rounded text-slate-300"
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
