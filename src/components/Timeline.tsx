import React, { useRef, useEffect, useCallback } from 'react';
import { TimelineItem, MediaAsset } from '../types/project';
import { Trash2, ArrowLeftRight, Play, Pause, Undo2, Redo2 } from 'lucide-react';

interface TimelineProps {
  timeline: TimelineItem[];
  mediaList: MediaAsset[];
  selectedItemId: string | null;
  currentTime: number;
  totalDuration: number;
  timelineScale: number;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
  onRemoveClip: (id: string) => void;
  onReplaceClipMedia: (id: string) => void;
  onUpdateDuration: (id: string, duration: number) => void;
    onResizeStart?: () => void;
  onZoom?: (scale: number) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
  }

export const Timeline: React.FC<TimelineProps> = ({
  timeline,
  mediaList,
  selectedItemId,
  currentTime,
  totalDuration,
  timelineScale,
  isPlaying,
  onPlayPause,
  onSelectClip,
  onSeek,
  onRemoveClip,
  onReplaceClipMedia,
  onUpdateDuration,
      onResizeStart,
      onZoom,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const resizingItemIdRef = useRef<string | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const initialDurationRef = useRef<number>(0);
  const touchPinchRef = useRef<{ initialDist: number; initialScale: number } | null>(null);

  // Sync scroll position with playhead so playhead stays centered
  useEffect(() => {
    if (scrollContainerRef.current && !isScrubbingRef.current) {
      const container = scrollContainerRef.current;

      container.scrollLeft = currentTime * timelineScale;
    }
  }, [currentTime, timelineScale]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const newTime = container.scrollLeft / timelineScale;
      if (Math.abs(newTime - currentTime) > 0.1 && isScrubbingRef.current) {
        onSeek(Math.max(0, newTime));
      }
    }
  };

  const handlePointerDown = () => {
    isScrubbingRef.current = true;
  };

  const handlePointerUp = () => {
    isScrubbingRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && onZoom) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchPinchRef.current = { initialDist: dist, initialScale: timelineScale };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchPinchRef.current && onZoom) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const ratio = dist / Math.max(1, touchPinchRef.current.initialDist);
      const newScale = Math.min(200, Math.max(20, touchPinchRef.current.initialScale * ratio));
      onZoom(newScale);
    }
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const padOffset = (scrollContainerRef.current?.clientWidth || 0) / 2;

  const handleStartResize = (e: React.PointerEvent, item: TimelineItem) => {
      if (onResizeStart) onResizeStart();
    e.stopPropagation();
    resizingItemIdRef.current = item.id;
    resizeStartXRef.current = e.clientX;
    initialDurationRef.current = item.duration;
  };

  const handleGlobalPointerMove = useCallback((e: PointerEvent) => {
    if (resizingItemIdRef.current) {
      const deltaX = e.clientX - resizeStartXRef.current;
      const deltaSec = deltaX / timelineScale;
      const newDuration = Math.max(0.5, initialDurationRef.current + deltaSec);
      onUpdateDuration(resizingItemIdRef.current, Math.round(newDuration * 10) / 10);
    }
  }, [timelineScale, onUpdateDuration]);

  const handleGlobalPointerUp = useCallback(() => {
    if (resizingItemIdRef.current) {
      resizingItemIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [handleGlobalPointerMove, handleGlobalPointerUp]);

  if (timeline.length === 0) return null;

  return (
    <div className="flex flex-col relative select-none bg-editor-bg pb-4">
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x w-full"
      >
        <div 
          className="flex flex-col relative w-max"
          style={{ paddingLeft: `${padOffset}px`, paddingRight: `${padOffset}px`, paddingTop: '8px', paddingBottom: '8px' }}
        >
          {/* Time Ruler */}
          <div className="h-4 relative w-full mb-1">
            {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-l border-slate-700 flex items-end pb-0.5" style={{ left: i * timelineScale }}>
                <span className="text-[9px] text-slate-500 ml-1 font-mono leading-none">{i}s</span>
              </div>
            ))}
          </div>

          {/* Clips Row */}
          <div className="flex items-center h-20">
            {timeline.map((item) => {
              const asset = mediaList.find(m => m.id === item.mediaId);
              const isSelected = selectedItemId === item.id;
              const widthPx = Math.max(24, item.duration * timelineScale);

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectClip(item.id)}
                  style={{ width: `${widthPx}px` }}
                  className={`relative h-full shrink-0 overflow-hidden flex flex-col justify-between transition-all select-none cursor-pointer border-y-2 border-l border-r border-r-black ${
                    isSelected ? 'border-white z-20 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-y-transparent border-l-transparent opacity-80 hover:opacity-100 z-10'
                  }`}
                >
                {asset && (
                  <>
                    {asset.type === 'video' ? (
                      <video src={asset.url} className="absolute inset-0 w-full h-full object-cover pointer-events-none" preload="metadata" muted />
                    ) : (
                      <img src={asset.url} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                    )}
                    <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                  </>
                )}
                
                {/* Right Resize Handle */}
                {isSelected && (
                  <div
                    onPointerDown={(e) => handleStartResize(e, item)}
                    className="absolute top-0 right-0 bottom-0 w-6 cursor-ew-resize flex items-center justify-center transition-colors z-30 bg-black/40"
                  >
                    <div className="w-1 h-6 rounded-full bg-white pointer-events-none" />
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>
      
      {/* Fixed Playhead */}
      <div className="absolute top-0 left-1/2 w-[2px] h-[116px] bg-white z-30 pointer-events-none -translate-x-1/2">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-white" />
      </div>
      
      {/* Action Toolbar */}
      <div className="flex justify-center gap-4 mt-2 mb-2 animate-in fade-in slide-in-from-top-2 duration-150">
        
        {/* Undo */}
        <button onClick={onUndo} disabled={!canUndo} className={`flex flex-col items-center gap-1.5 transition-colors ${canUndo ? 'text-slate-300 hover:text-white' : 'text-slate-600 opacity-50 cursor-not-allowed'}`}>
            <div className="w-12 h-12 rounded-full bg-editor-surface flex items-center justify-center shadow-lg border border-editor-panelBorder">
              <Undo2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-medium tracking-wide">Undo</span>
          </button>

        {/* Replace */}
        <button 
          onClick={() => selectedItemId && onReplaceClipMedia(selectedItemId)}
          className={`flex flex-col items-center gap-1.5 transition-colors ${selectedItemId ? 'text-slate-300 hover:text-white' : 'text-slate-600 opacity-50 cursor-not-allowed'}`}
          disabled={!selectedItemId}
        >
          <div className="w-12 h-12 rounded-full bg-editor-surface flex items-center justify-center shadow-lg border border-editor-panelBorder">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium tracking-wide">Replace</span>
        </button>
        
        {/* Play/Pause */}
        <button 
          onClick={onPlayPause}
          className="flex flex-col items-center gap-1.5 text-white hover:text-white -mt-1 mx-2"
        >
          <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg border border-slate-300/30 pl-1">
            {isPlaying ? <Pause className="w-7 h-7 ml-[-4px]" /> : <Play className="w-7 h-7" />}
          </div>
          <span className="text-[11px] font-medium tracking-wide">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        {/* Delete */}
        <button 
          onClick={() => selectedItemId && onRemoveClip(selectedItemId)}
          className={`flex flex-col items-center gap-1.5 transition-colors ${selectedItemId ? 'text-slate-300 hover:text-red-400' : 'text-slate-600 opacity-50 cursor-not-allowed'}`}
          disabled={!selectedItemId}
        >
          <div className="w-12 h-12 rounded-full bg-editor-surface flex items-center justify-center shadow-lg border border-editor-panelBorder">
            <Trash2 className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium tracking-wide">Delete</span>
        </button>

        {/* Redo */}
        <button onClick={onRedo} disabled={!canRedo} className={`flex flex-col items-center gap-1.5 transition-colors ${canRedo ? 'text-slate-300 hover:text-white' : 'text-slate-600 opacity-50 cursor-not-allowed'}`}>
            <div className="w-12 h-12 rounded-full bg-editor-surface flex items-center justify-center shadow-lg border border-editor-panelBorder">
              <Redo2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-medium tracking-wide">Redo</span>
          </button>

      </div>
    </div>
  );
};
