import React, { useRef, useEffect, useCallback } from 'react';
import { TimelineItem, MediaAsset } from '../types/project';
import { Trash2, ArrowLeftRight } from 'lucide-react';

interface TimelineProps {
  timeline: TimelineItem[];
  mediaList: MediaAsset[];
  selectedItemId: string | null;
  currentTime: number;
  totalDuration: number;
  timelineScale: number;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
  onRemoveClip: (id: string) => void;
  onReplaceClipMedia: (id: string) => void;
  onUpdateDuration: (id: string, duration: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  timeline,
  mediaList,
  selectedItemId,
  currentTime,
  totalDuration,
  timelineScale,
  onSelectClip,
  onSeek,
  onRemoveClip,
  onReplaceClipMedia,
  onUpdateDuration,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const resizingItemIdRef = useRef<string | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const initialDurationRef = useRef<number>(0);

  // Sync scroll position with playhead so playhead stays centered
  useEffect(() => {
    if (scrollContainerRef.current && !isScrubbingRef.current) {
      const container = scrollContainerRef.current;
      const centerOffset = container.clientWidth / 2;
      container.scrollLeft = currentTime * timelineScale - centerOffset;
    }
  }, [currentTime, timelineScale]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const centerOffset = container.clientWidth / 2;
      const newTime = (container.scrollLeft + centerOffset) / timelineScale;
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

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const padOffset = (scrollContainerRef.current?.clientWidth || 0) / 2;

  const handleStartResize = (e: React.PointerEvent, item: TimelineItem) => {
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
        className="overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x w-full"
      >
        <div 
          className="flex items-center h-24 relative"
          style={{ paddingLeft: `${padOffset}px`, paddingRight: `${padOffset}px` }}
        >
          {timeline.map((item) => {
            const asset = mediaList.find(m => m.id === item.mediaId);
            const isSelected = selectedItemId === item.id;
            const widthPx = Math.max(32, item.duration * timelineScale);

            return (
              <div
                key={item.id}
                onClick={() => onSelectClip(item.id)}
                style={{ width: `${widthPx}px` }}
                className={`relative h-20 shrink-0 rounded-lg overflow-hidden flex flex-col justify-between transition-all select-none cursor-pointer border-2 ${
                  isSelected ? 'border-amber-400 z-20 shadow-lg scale-105' : 'border-transparent opacity-80 hover:opacity-100 z-10 mx-[1px]'
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
                    <div className="w-1 h-6 rounded-full bg-amber-400 pointer-events-none" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Fixed Playhead */}
      <div className="absolute top-0 bottom-4 left-1/2 w-[2px] bg-amber-400 z-30 pointer-events-none -translate-x-1/2">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-transparent border-t-amber-400" />
      </div>
      
      {/* Clip Chips (Contextual Actions) */}
      {selectedItemId && (
        <div className="flex justify-center gap-6 mt-2 mb-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <button 
            onClick={() => onReplaceClipMedia(selectedItemId)}
            className="flex flex-col items-center gap-1.5 text-slate-300 hover:text-white"
          >
            <div className="w-12 h-12 rounded-full bg-editor-surface flex items-center justify-center shadow-lg border border-editor-panelBorder">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-medium tracking-wide">Replace</span>
          </button>
          
          <button 
            onClick={() => onRemoveClip(selectedItemId)}
            className="flex flex-col items-center gap-1.5 text-slate-300 hover:text-red-400"
          >
            <div className="w-12 h-12 rounded-full bg-editor-surface flex items-center justify-center shadow-lg border border-editor-panelBorder">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-[11px] font-medium tracking-wide">Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};
