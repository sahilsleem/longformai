import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { TimelineItem, MediaAsset, TransformState } from '../types/project';
import { calculatePanBounds, TARGET_ASPECT_RATIO, formatTimecode } from '../engine/schema';

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
  totalDuration,
  onUpdateTransform,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });
  const [showOverlay, setShowOverlay] = useState(true);
  const [isInteractiveDragging, setIsInteractiveDragging] = useState(false);
  const dragStartPos = useRef({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });
  const touchPinchRef = useRef<{ initialDist: number; initialScale: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clipTime = activeItem ? Math.max(0, currentTime - activeItem.startTime + (activeItem.sourceStart || 0)) : 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeAsset || activeAsset.type !== 'video') return;
    if (Math.abs(video.currentTime - clipTime) > 0.12) {
      video.currentTime = clipTime;
    }
    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentTime, isPlaying, clipTime, activeAsset]);

  const transform: TransformState = activeItem?.transform || { x: 0, y: 0, scale: 1.0, fitMode: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } };
  const sourceWidth = activeAsset?.width || (activeAsset?.aspectRatio ? activeAsset.aspectRatio * 1080 : 1920);
  const sourceHeight = activeAsset?.height || 1080;
  const sourceRatio = sourceWidth && sourceHeight > 0 ? sourceWidth / sourceHeight : TARGET_ASPECT_RATIO;

  let frameW = containerSize.width;
  let frameH = frameW / TARGET_ASPECT_RATIO;
  
  if (frameH > containerSize.height && containerSize.height > 0) {
    frameH = containerSize.height;
    frameW = frameH * TARGET_ASPECT_RATIO;
  }

  let sourceDisplayW, sourceDisplayH;
  if (sourceRatio < TARGET_ASPECT_RATIO) {
    sourceDisplayW = frameW;
    sourceDisplayH = frameW / sourceRatio;
  } else {
    sourceDisplayH = frameH;
    sourceDisplayW = frameH * sourceRatio;
  }

  const bounds = calculatePanBounds(sourceWidth, sourceHeight, transform.scale || 1.0, transform.fitMode || 'cover');

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!activeItem || !onUpdateTransform) {
      if (e.target === containerRef.current || e.currentTarget === containerRef.current) {
        setShowOverlay(!showOverlay);
      }
      return;
    }
    setIsInteractiveDragging(true);
    dragStartPos.current = { mouseX: e.clientX, mouseY: e.clientY, initialX: transform.x || 0, initialY: transform.y || 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isInteractiveDragging || !activeItem || !onUpdateTransform) return;
    const deltaX = ((e.clientX - dragStartPos.current.mouseX) / frameW) * 100;
    const deltaY = ((e.clientY - dragStartPos.current.mouseY) / frameH) * 100;
    
    const targetX = dragStartPos.current.initialX + deltaX;
    const targetY = dragStartPos.current.initialY + deltaY;
    
    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX));
    const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, targetY));
    
    onUpdateTransform({ x: Math.round(clampedX * 10) / 10, y: Math.round(clampedY * 10) / 10 });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isInteractiveDragging) return;
    setIsInteractiveDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    // Distinguish click from drag
    const moveDist = Math.hypot(e.clientX - dragStartPos.current.mouseX, e.clientY - dragStartPos.current.mouseY);
    if (moveDist < 5) {
      setShowOverlay(!showOverlay);
    }
  };

  const updateZoom = useCallback((targetScale: number) => {
    if (!activeItem || !onUpdateTransform) return;
    const newScale = Math.min(4.0, Math.max(1.0, Math.round(targetScale * 100) / 100));
    const newBounds = calculatePanBounds(sourceWidth, sourceHeight, newScale, 'cover');
    const clampedX = Math.max(newBounds.minX, Math.min(newBounds.maxX, transform.x || 0));
    const clampedY = Math.max(newBounds.minY, Math.min(newBounds.maxY, transform.y || 0));
    onUpdateTransform({ scale: newScale, x: Math.round(clampedX * 10) / 10, y: Math.round(clampedY * 10) / 10 });
  }, [activeItem, onUpdateTransform, sourceWidth, sourceHeight, transform]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!activeItem || !onUpdateTransform) return;
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchPinchRef.current = { initialDist: dist, initialScale: transform.scale || 1.0 };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchPinchRef.current || !activeItem || !onUpdateTransform) return;
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const ratio = dist / Math.max(1, touchPinchRef.current.initialDist);
      updateZoom(touchPinchRef.current.initialScale * ratio);
    }
  };

  const panXPx = frameW * ((transform.x || 0) / 100);
  const panYPx = frameH * ((transform.y || 0) / 100);

  return (
    <div 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className={`w-full aspect-video bg-black flex items-center justify-center relative overflow-hidden select-none ${onUpdateTransform ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ touchAction: 'none' }}
    >
      {activeAsset && activeItem ? (
        <div style={{ width: `${frameW}px`, height: `${frameH}px` }} className="relative flex items-center justify-center overflow-hidden">
          <div
            className="absolute pointer-events-none"
            style={{
              width: `${sourceDisplayW}px`, height: `${sourceDisplayH}px`,
              transform: `translate(${panXPx}px, ${panYPx}px) scale(${transform.scale || 1.0})`,
              transformOrigin: 'center center'
            }}
          >
            {activeAsset.type === 'video' ? (
              <video ref={videoRef} src={activeAsset.url} className="w-full h-full object-fill pointer-events-none" playsInline muted />
            ) : activeAsset.type === 'image' ? (
              <img src={activeAsset.url} className="w-full h-full object-fill pointer-events-none" draggable={false} />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="text-slate-600 text-sm">Add your footage and voiceover below</div>
      )}

      {/* Play/Pause Overlay */}
      {showOverlay && activeAsset && (
        <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center pointer-events-none z-10 transition-opacity duration-200">
          <button 
            onClick={(e) => { e.stopPropagation(); onPlayPause(); }}
            className="w-12 h-12 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white pointer-events-auto transition-colors"
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </button>
          <div className="absolute bottom-3 left-3 text-white text-xs font-mono drop-shadow-md">
            {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
          </div>
        </div>
      )}
    </div>
  );
};
