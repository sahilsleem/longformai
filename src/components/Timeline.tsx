import React, { useRef, useEffect, useCallback } from 'react';
import { TimelineItem, MediaAsset } from '../types/project';
import { Trash2, ArrowLeftRight, Move } from 'lucide-react';

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
  onReplaceClipMedia: (id: string) => void; // now triggers scroll
  onUpdateDuration: (id: string, duration: number) => void;
  onReframeClip: (id: string) => void; // Triggers full-screen reframe
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
  onReframeClip,
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

  const totalWidthPx = Math.max(0, totalDuration * timelineScale) + (scrollContainerRef.current?.clientWidth || 0);
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
        className="overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x"
      >
        <div 
          className="relative h-24"
          style={{ width: `${totalWidthPx}px` }}
        >
          {timeline.map((item) => {
            const asset = mediaList.find(m => m.id === item.mediaId);
            const isSelected = selectedItemId === item.id;
            const leftPx = padOffset + item.startTime * timelineScale;
            const widthPx = Math.max(32, item.duration * timelineScale);

            return (
              <div
                key={item.id}
                onClick={() => onSelectClip(item.id)}
                style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                className={`absolute top-2 bottom-2 rounded-lg overflow-hidden flex flex-col justify-between transition-all select-none cursor-pointer ${
                  isSelected ? 'ring-2 ring-amber-400 z-20 shadow-lg' : 'opacity-80 hover:opacity-100 z-10'
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
                <div
                  onPointerDown={(e) => handleStartResize(e, item)}
                  className={`absolute top-0 right-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center transition-colors z-20 ${isSelected ? 'bg-amber-400/20 hover:bg-amber-400/40' : ''}`}
                >
                  <div className={`w-1 h-6 rounded-full pointer-events-none ${isSelected ? 'bg-amber-400' : 'bg-white/50'}`} />
                </div>
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
        <div className="flex justify-center gap-4 mt-2 mb-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <button 
            onClick={() => onReframeClip(selectedItemId)}
            className="flex flex-col items-center gap-1 text-slate-300 hover:text-white"
          >
            <div className="w-10 h-10 rounded-full bg-editor-surface flex items-center justify-center shadow">
              <Move className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Reframe</span>
          </button>
          
          <button 
            onClick={() => onReplaceClipMedia(selectedItemId)}
            className="flex flex-col items-center gap-1 text-slate-300 hover:text-white"
          >
            <div className="w-10 h-10 rounded-full bg-editor-surface flex items-center justify-center shadow">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Replace</span>
          </button>
          
          <button 
            onClick={() => onRemoveClip(selectedItemId)}
            className="flex flex-col items-center gap-1 text-slate-300 hover:text-red-400"
          >
            <div className="w-10 h-10 rounded-full bg-editor-surface flex items-center justify-center shadow">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-[10px] font-medium">Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};
