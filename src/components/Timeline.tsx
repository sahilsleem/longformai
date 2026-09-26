import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Film,
  Music,
  Trash2,
  ZoomIn,
  ZoomOut,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
  Upload,
  Loader2,
  AlertTriangle,
  X,
  Info,
  FileText,
  Clock,
  CheckCircle2,
  Image as ImageIcon,
  ArrowLeftRight,
} from 'lucide-react';
import { TimelineItem, MediaAsset, VoiceoverTrack, AudioSegment } from '../types/project';
import { formatTimecode } from '../engine/schema';
import { DraftStats, DraftOptions } from '../engine/draftTimeline';
import { ReplaceMediaModal } from './ReplaceMediaModal';

interface TimelineProps {
  timeline: TimelineItem[];
  mediaList: MediaAsset[];
  voiceover?: VoiceoverTrack;
  selectedItemId: string | null;
  currentTime: number;
  totalDuration: number;
  timelineScale: number; // pixels per second
  isGeneratingDraft?: boolean;
  draftStats?: DraftStats | null;
  draftError?: string | null;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
  onRemoveClip: (id: string) => void;
  onReplaceClipMedia?: (id: string, newMediaId: string) => void;
  onUpdateDuration: (id: string, duration: number) => void;
  onReorder: (newTimeline: TimelineItem[]) => void;
  onSetTimelineScale: (scale: number) => void;
  onGenerateAIDraft?: (options?: DraftOptions) => void;
  onClearTimeline?: () => void;
  onUploadVoiceover?: (file: File) => void;
  onRemoveVoiceover?: () => void;
  onSetVoiceoverVolume?: (vol: number) => void;
  onToggleVoiceoverMute?: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  timeline,
  mediaList,
  voiceover,
  selectedItemId,
  currentTime,
  totalDuration,
  timelineScale,
  isGeneratingDraft = false,
  draftStats,
  draftError,
  onSelectClip,
  onSeek,
  onRemoveClip,
  onReplaceClipMedia,
  onUpdateDuration,
  onReorder,
  onSetTimelineScale,
  onGenerateAIDraft,
  onClearTimeline,
  onUploadVoiceover,
  onRemoveVoiceover,
  onToggleVoiceoverMute,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const isScrubbingRef = useRef(false);

  const resizingItemIdRef = useRef<string | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const initialDurationRef = useRef<number>(0);

  // Replace media modal state
  const [replacingClipId, setReplacingClipId] = useState<string | null>(null);

  // Direct manipulation drag-to-reorder state
  const [dragState, setDragState] = useState<{
    itemId: string;
    sourceIndex: number;
    startX: number;
    targetIndex: number;
    isDragging: boolean;
  } | null>(null);
  const dragStateRef = useRef<{
    itemId: string;
    sourceIndex: number;
    startX: number;
    targetIndex: number;
    isDragging: boolean;
  } | null>(null);

  // AI Draft Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewTab, setReviewTab] = useState<'overview' | 'usage' | 'gaps'>('overview');
  const [inspectedGap, setInspectedGap] = useState<AudioSegment | null>(null);

  const getAsset = (mediaId: string) => mediaList.find((m) => m.id === mediaId);

  // Time ruler ticks
  const maxTime = Math.max(30, totalDuration + 15);
  const tickStep = timelineScale < 18 ? 10 : timelineScale < 35 ? 5 : 1;
  const ticks: number[] = [];
  for (let s = 0; s <= maxTime; s += tickStep) {
    ticks.push(s);
  }

  // Handle ruler / timeline scrubbing (Mouse & Touch)
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
    const newTime = Math.max(0, clickX / timelineScale);
    onSeek(newTime);
    isScrubbingRef.current = true;
  };

  const handleTimelineTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const clickX = touch.clientX - rect.left + scrollContainerRef.current.scrollLeft;
    const newTime = Math.max(0, clickX / timelineScale);
    onSeek(newTime);
    isScrubbingRef.current = true;
  };

  // Direct Pointer Down on a Clip
  const handleClipPointerDown = (
    e: React.PointerEvent,
    item: TimelineItem,
    index: number
  ) => {
    if (e.button !== 0) return;
    const state = {
      itemId: item.id,
      sourceIndex: index,
      startX: e.clientX,
      targetIndex: index,
      isDragging: false,
    };
    dragStateRef.current = state;
    setDragState(state);
  };

  const handleStartResize = (e: React.PointerEvent, item: TimelineItem) => {
    e.stopPropagation();
    resizingItemIdRef.current = item.id;
    resizeStartXRef.current = e.clientX;
    initialDurationRef.current = item.duration;
    dragStateRef.current = null;
    setDragState(null);
  };

  // Global Pointer / Mouse / Touch Movement Handler
  const handleGlobalPointerMove = useCallback(
    (clientX: number) => {
      // 1. Resizing clip duration
      if (resizingItemIdRef.current) {
        const deltaX = clientX - resizeStartXRef.current;
        const deltaSec = deltaX / timelineScale;
        const newDuration = Math.max(0.5, initialDurationRef.current + deltaSec);
        onUpdateDuration(resizingItemIdRef.current, Math.round(newDuration * 10) / 10);
        return;
      }

      // 2. Dragging clip to reorder
      if (dragStateRef.current) {
        const current = dragStateRef.current;
        const deltaX = clientX - current.startX;

        if (Math.abs(deltaX) > 6 || current.isDragging) {
          if (scrollContainerRef.current) {
            const containerRect = scrollContainerRef.current.getBoundingClientRect();
            const scrollLeft = scrollContainerRef.current.scrollLeft;
            const pointerTime = Math.max(0, (clientX - containerRect.left + scrollLeft) / timelineScale);

            let targetIdx = timeline.length - 1;
            for (let i = 0; i < timeline.length; i++) {
              const itm = timeline[i];
              if (pointerTime < itm.startTime + itm.duration / 2) {
                targetIdx = i;
                break;
              }
            }
            targetIdx = Math.max(0, Math.min(timeline.length - 1, targetIdx));

            const updated = {
              ...current,
              targetIndex: targetIdx,
              isDragging: true,
            };
            dragStateRef.current = updated;
            setDragState(updated);
          }
        }
        return;
      }

      // 3. Ruler / Timeline Scrubbing
      if (isScrubbingRef.current && scrollContainerRef.current) {
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const clickX = clientX - rect.left + scrollContainerRef.current.scrollLeft;
        const newTime = Math.max(0, clickX / timelineScale);
        onSeek(newTime);
      }
    },
    [timeline, timelineScale, onSeek, onUpdateDuration]
  );

  const handleGlobalPointerUp = useCallback(() => {
    // 1. End Resizing
    if (resizingItemIdRef.current) {
      resizingItemIdRef.current = null;
    }

    // 2. End Drag Reordering or Handle Tap Selection
    if (dragStateRef.current) {
      const current = dragStateRef.current;
      if (current.isDragging) {
        if (current.targetIndex !== current.sourceIndex) {
          const newItems = [...timeline];
          const [moved] = newItems.splice(current.sourceIndex, 1);
          newItems.splice(current.targetIndex, 0, moved);
          onReorder(newItems);
        }
      } else {
        // Quick tap / click without drag
        onSelectClip(current.itemId);
        const itm = timeline[current.sourceIndex];
        if (itm) {
          onSeek(itm.startTime);
        }
      }
      dragStateRef.current = null;
      setDragState(null);
    }

    // 3. End Scrubbing
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
    }
  }, [timeline, onReorder, onSelectClip, onSeek]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleGlobalPointerMove(e.clientX);
    const onMouseUp = () => handleGlobalPointerUp();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleGlobalPointerMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => handleGlobalPointerUp();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleGlobalPointerMove, handleGlobalPointerUp]);

  const handleAudioFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadVoiceover) {
      onUploadVoiceover(file);
    }
    e.target.value = '';
  };

  const totalWidthPx = Math.max(maxTime * timelineScale, (voiceover?.duration || 0) * timelineScale + 100);

  // Find unassigned transcript segments that have no overlapping visual timeline clip
  const unassignedSegments = (voiceover?.segments || []).filter((seg) => {
    const hasClip = timeline.some(
      (item) => item.startTime < seg.endTime && item.startTime + item.duration > seg.startTime
    );
    return !hasClip;
  });

  return (
    <div className="h-44 sm:h-52 lg:h-56 bg-editor-panel border-t border-editor-panelBorder flex flex-col shrink-0 select-none relative">
      <input
        type="file"
        ref={audioInputRef}
        onChange={handleAudioFileInput}
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
        className="hidden"
      />

      {/* Timeline Controls Header */}
      <div className="h-9 border-b border-editor-panelBorder px-3 sm:px-4 flex items-center justify-between bg-editor-panel shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Timeline</span>
          </div>

          <span className="text-[10px] text-slate-400 bg-editor-surface px-1.5 py-0.5 rounded border border-editor-panelBorder">
            {timeline.length} {timeline.length === 1 ? 'clip' : 'clips'}
          </span>

          {/* AI Draft Trigger Button */}
          {onGenerateAIDraft && (
            <button
              onClick={() => onGenerateAIDraft()}
              disabled={isGeneratingDraft || !voiceover?.segments || voiceover.segments.length === 0}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded text-xs font-medium transition-all ${
                isGeneratingDraft
                  ? 'bg-purple-950 text-purple-300 cursor-wait border border-purple-800'
                  : !voiceover?.segments || voiceover.segments.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-xs'
              }`}
              title={
                !voiceover?.segments || voiceover.segments.length === 0
                  ? 'Transcribe your voiceover first to generate an AI draft'
                  : 'Generate a first draft visual timeline from your transcript and media'
              }
            >
              {isGeneratingDraft ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Drafting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  <span>Generate AI Draft</span>
                </>
              )}
            </button>
          )}

          {/* Draft Summary Stats Badge & Review Button */}
          {draftStats && (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                onClick={() => setShowReviewModal(true)}
                className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-medium bg-purple-950/80 hover:bg-purple-900 text-purple-200 px-2 sm:px-2.5 py-1 rounded border border-purple-800/50 shadow-sm transition-colors whitespace-nowrap"
                title="Review AI Draft Statistics, Warnings & Shot Provenance"
              >
                <FileText className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="hidden sm:inline">Review Draft ({draftStats.coveragePercentage}%)</span>
                <span className="sm:hidden">Review ({draftStats.coveragePercentage}%)</span>
              </button>

              <div className="hidden xl:flex items-center gap-1 text-[10px] font-mono bg-editor-surface text-slate-300 px-2 py-1 rounded border border-editor-panelBorder">
                <span>
                  {draftStats.assignedSegments}/{draftStats.totalSegments} assigned
                </span>
                {draftStats.unassignedSegments > 0 && (
                  <span className="text-amber-300">· {draftStats.unassignedSegments} gaps</span>
                )}
                <span>· {draftStats.uniqueMediaUsed} media</span>
              </div>
            </div>
          )}

          {/* Clear Timeline Action */}
          {timeline.length > 0 && onClearTimeline && (
            <button
              onClick={() => {
                if (window.confirm('Clear all visual clips from the timeline?')) {
                  onClearTimeline();
                }
              }}
              className="text-slate-500 hover:text-red-400 text-[11px] flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-editor-surface"
              title="Clear all clips"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          {/* Draft Error Banner */}
          {draftError && (
            <span className="text-[10px] text-red-400 truncate max-w-xs" title={draftError}>
              {draftError}
            </span>
          )}
        </div>

        {/* Timeline Zoom Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            <span className="font-mono text-slate-300 font-semibold">{formatTimecode(totalDuration)}</span>
          </span>

          <button
            onClick={() => onSetTimelineScale(Math.max(10, timelineScale - 5))}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-editor-surface rounded transition-colors"
            title="Zoom Out Timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <input
            type="range"
            min="10"
            max="60"
            value={timelineScale}
            onChange={(e) => onSetTimelineScale(Number(e.target.value))}
            className="w-14 sm:w-20 h-1 bg-editor-surface rounded-lg appearance-none cursor-pointer"
            title="Timeline Scale"
          />

          <button
            onClick={() => onSetTimelineScale(Math.min(60, timelineScale + 5))}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-editor-surface rounded transition-colors"
            title="Zoom In Timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Continuous Horizontal Timeline Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Scrollable Tracks & Time Ruler Container (Begins directly with actual content tracks) */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-editor-trackBg flex flex-col cursor-crosshair select-none"
          onMouseDown={handleTimelineMouseDown}
          onTouchStart={handleTimelineTouchStart}
        >
          {/* 1. Time Ruler */}
          <div
            ref={rulerRef}
            className="h-5 border-b border-editor-panelBorder relative bg-editor-panel shrink-0"
            style={{ width: `${totalWidthPx}px` }}
          >
            {ticks.map((sec) => (
              <div
                key={sec}
                className="absolute top-0 bottom-0 border-l border-slate-700/80 flex items-end pl-1 pb-0.5"
                style={{ left: `${sec * timelineScale}px` }}
              >
                <span className="text-[9px] font-mono text-slate-400 pointer-events-none select-none">
                  {sec}s
                </span>
              </div>
            ))}
          </div>

          {/* 2. Voiceover Audio Waveform Track */}
          <div
            className="h-10 sm:h-12 relative border-b border-purple-900/30 bg-purple-950/20 py-1 shrink-0"
            style={{ width: `${totalWidthPx}px` }}
          >
            {voiceover ? (
              <div
                style={{
                  width: `${voiceover.duration * timelineScale}px`,
                }}
                className="h-full relative rounded bg-purple-900/40 border border-purple-700/40 overflow-hidden flex items-center px-2 group shadow-xs"
              >
                {/* True Waveform Peak Visualization */}
                <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-70 group-hover:opacity-90 transition-opacity">
                  {voiceover.waveformData && voiceover.waveformData.length > 0 ? (
                    voiceover.waveformData.map((peak, idx) => (
                      <div
                        key={idx}
                        className="w-[1.5px] bg-purple-300 rounded-full shrink-0"
                        style={{
                          height: `${Math.max(14, peak * 80)}%`,
                          marginRight: '1px',
                        }}
                      />
                    ))
                  ) : (
                    <div className="w-full h-0.5 bg-purple-400/40" />
                  )}
                </div>

                {/* Voiceover Name & Duration */}
                <div className="relative z-10 flex items-center gap-2 max-w-full pointer-events-none">
                  <Music className="w-3 h-3 text-purple-400 shrink-0" />
                  <span className="font-mono text-[10px] text-purple-200 truncate max-w-[120px] sm:max-w-[200px]">
                    {voiceover.name}
                  </span>
                  <span className="font-mono text-[9px] text-purple-300/80 bg-black/60 px-1 py-0.2 rounded shrink-0">
                    {formatTimecode(voiceover.duration)}
                  </span>

                  {onToggleVoiceoverMute && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVoiceoverMute();
                      }}
                      className={`pointer-events-auto p-1 rounded transition-colors ${
                        voiceover.isMuted
                          ? 'text-red-400 bg-red-950/80 border border-red-800/60'
                          : 'text-purple-300 hover:text-white bg-black/40 hover:bg-black/70'
                      }`}
                      title={voiceover.isMuted ? 'Unmute Audio' : 'Mute Audio'}
                    >
                      {voiceover.isMuted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                    </button>
                  )}

                  {onRemoveVoiceover && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveVoiceover();
                      }}
                      className="pointer-events-auto p-1 rounded text-purple-300 hover:text-red-400 bg-black/40 hover:bg-black/70 transition-colors"
                      title="Remove Voiceover"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                onClick={() => audioInputRef.current?.click()}
                className="h-full border border-dashed border-purple-500/30 hover:border-purple-400/70 rounded mx-2 flex items-center justify-center gap-2 text-xs text-purple-400 hover:text-purple-300 cursor-pointer bg-purple-950/20 hover:bg-purple-950/40 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Voiceover Audio (MP3, WAV, M4A, AAC)</span>
              </div>
            )}
          </div>

          {/* 3. Video / Photo Continuous Media Track */}
          <div
            className="flex-1 min-h-[64px] sm:min-h-[76px] relative bg-editor-surface/10 py-1"
            style={{ width: `${totalWidthPx}px` }}
          >
            {timeline.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 text-slate-500 pointer-events-none">
                <Sparkles className="w-5 h-5 text-blue-500/50 mb-1.5" />
                <span className="text-[11px] sm:text-xs">
                  Visual timeline ready. <br className="sm:hidden" />
                  Click <strong>Generate Draft</strong> or add clips from Media Library.
                </span>
              </div>
            ) : (
              <>
                {/* Visual Gap Indicators for Unassigned Segments */}
                {unassignedSegments.map((seg) => {
                  const leftPx = seg.startTime * timelineScale;
                  const widthPx = Math.max(16, (seg.endTime - seg.startTime) * timelineScale);
                  const reason = draftStats?.unassignedReasons?.[seg.id] || 'No matching media above threshold';
                  return (
                    <div
                      key={`unassigned_${seg.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(seg.startTime);
                        onSelectClip(null);
                        setInspectedGap(seg);
                      }}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                      }}
                      className="absolute top-1 bottom-1 rounded border border-dashed border-amber-600/40 hover:border-amber-400 bg-amber-950/15 hover:bg-amber-950/30 flex items-center justify-center px-1 cursor-pointer z-0 transition-colors group"
                      title={`Uncovered Gap (${(seg.endTime - seg.startTime).toFixed(1)}s): ${reason}. Click to inspect.`}
                    >
                      <span className="text-[9px] font-mono text-amber-500/80 group-hover:text-amber-300 truncate text-center pointer-events-none">
                        Unassigned Gap
                      </span>
                    </div>
                  );
                })}

                {/* Active Timeline Clips */}
                {timeline.map((item, index) => {
                  const asset = getAsset(item.mediaId);
                  const isSelected = selectedItemId === item.id;
                  const isBeingDragged = dragState?.isDragging && dragState.itemId === item.id;
                  const isDropTarget = dragState?.isDragging && dragState.targetIndex === index && dragState.sourceIndex !== index;
                  const widthPx = Math.max(32, item.duration * timelineScale);
                  const leftPx = item.startTime * timelineScale;

                  return (
                    <div
                      key={item.id}
                      onPointerDown={(e) => handleClipPointerDown(e, item, index)}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                      }}
                      className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-grab active:cursor-grabbing transition-all flex flex-col justify-between p-1 select-none ${
                        isBeingDragged
                          ? 'opacity-60 scale-[0.98] ring-2 ring-purple-400 z-30 shadow-2xl'
                          : isDropTarget
                          ? 'ring-2 ring-blue-400 brightness-110 z-20'
                          : isSelected
                          ? 'border-2 border-white ring-2 ring-blue-500/60 shadow-lg z-20'
                          : 'border border-slate-700/60 hover:border-slate-500 bg-slate-900/90 z-10'
                      }`}
                      title={asset ? `${asset.name} (${item.duration.toFixed(1)}s)` : 'Timeline Clip'}
                    >
                      {/* Background Visual Thumbnail (Modern mobile editor filmstrip appearance) */}
                      {asset && (
                        <>
                          {asset.type === 'video' ? (
                            <video
                              src={asset.url}
                              className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-40 group-hover:opacity-60"
                              preload="metadata"
                              muted
                            />
                          ) : asset.type === 'image' ? (
                            <img
                              src={asset.url}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-40 group-hover:opacity-60"
                            />
                          ) : null}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/60 pointer-events-none" />
                        </>
                      )}

                      {/* Clip Top Info Bar */}
                      <div className="flex items-center justify-between gap-1 pointer-events-none relative z-10">
                        <span className="font-semibold text-[10px] sm:text-[11px] text-slate-100 truncate">
                          {asset ? asset.name : 'Clip'}
                        </span>
                        <span className="font-mono text-[9px] sm:text-[10px] text-blue-300 bg-black/70 px-1 py-0.2 rounded shrink-0">
                          {item.duration.toFixed(1)}s
                        </span>
                      </div>

                      {/* Contextual Action Buttons (Visible when selected) */}
                      {isSelected && (
                        <div className="flex items-center justify-end gap-1 relative z-20">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplacingClipId(item.id);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-600/90 hover:bg-blue-500 text-white rounded text-[10px] sm:text-[11px] font-medium shadow-xs transition-all hover:scale-105 active:scale-95"
                            title="Replace visual media"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            <span>Replace</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveClip(item.id);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-1.5 bg-red-600/90 hover:bg-red-500 text-white rounded shadow-xs transition-all hover:scale-105 active:scale-95"
                            title="Remove Clip from Timeline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Right Resize / Trim Handle */}
                      <div
                        onPointerDown={(e) => handleStartResize(e, item)}
                        className={`absolute top-0 right-0 bottom-0 w-3.5 cursor-ew-resize rounded-r flex items-center justify-center transition-colors z-20 touch-none ${
                          isSelected ? 'bg-white/25 hover:bg-white/40' : 'bg-transparent hover:bg-white/20'
                        }`}
                        title="Drag to trim duration"
                      >
                        <div className={`w-0.5 h-5 rounded-full pointer-events-none ${isSelected ? 'bg-white' : 'bg-white/50'}`} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Red Playhead Line & Scrub Knob */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none"
            style={{ left: `${currentTime * timelineScale}px` }}
          >
            <div className="w-3 h-3.5 bg-red-500 -ml-[5px] -mt-[1px] rounded-b shadow-md flex items-center justify-center pointer-events-auto cursor-ew-resize">
              <div className="w-1 h-1 bg-white rounded-full pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* AI Draft Review & Shot Intelligence Modal */}
      {showReviewModal && draftStats && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-editor-panelBorder bg-editor-surface/30 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400 shrink-0" />
                <div>
                  <h3 className="font-semibold text-xs sm:text-sm text-slate-100 uppercase tracking-wider">
                    AI Draft Review & Shot Intelligence
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-400">
                    Measurable project metrics and shot selection provenance
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded hover:bg-editor-surface"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs Switcher */}
            <div className="flex items-center gap-1 px-3 sm:px-4 pt-2.5 sm:pt-3 border-b border-editor-panelBorder/70 bg-editor-panel text-xs overflow-x-auto scrollbar-none shrink-0">
              <button
                onClick={() => setReviewTab('overview')}
                className={`px-3 py-1.5 rounded-t-md font-medium transition-colors ${
                  reviewTab === 'overview'
                    ? 'bg-editor-surface text-purple-300 border-t border-x border-editor-panelBorder font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Overview & Facts
              </button>

              <button
                onClick={() => setReviewTab('usage')}
                className={`px-3 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1.5 ${
                  reviewTab === 'usage'
                    ? 'bg-editor-surface text-purple-300 border-t border-x border-editor-panelBorder font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Media Usage</span>
                <span className="bg-purple-950/80 text-purple-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                  {draftStats.mediaUsageSummary?.length || draftStats.uniqueMediaUsed}
                </span>
              </button>

              <button
                onClick={() => setReviewTab('gaps')}
                className={`px-3 py-1.5 rounded-t-md font-medium transition-colors flex items-center gap-1.5 ${
                  reviewTab === 'gaps'
                    ? 'bg-editor-surface text-purple-300 border-t border-x border-editor-panelBorder font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Unassigned Gaps</span>
                {draftStats.unassignedSegments > 0 && (
                  <span className="bg-amber-950/80 text-amber-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                    {draftStats.unassignedSegments}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* TAB 1: OVERVIEW & STATS */}
              {reviewTab === 'overview' && (
                <div className="space-y-4">
                  {/* Metric Fact Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-editor-surface/60 rounded-lg p-2.5 border border-editor-panelBorder">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Duration</span>
                      <span className="font-mono text-sm text-slate-100 font-bold mt-0.5 block">
                        {formatTimecode(draftStats.totalDuration)}
                      </span>
                      <span className="text-[10px] text-slate-500">{draftStats.totalDuration.toFixed(1)}s audio</span>
                    </div>

                    <div className="bg-editor-surface/60 rounded-lg p-2.5 border border-editor-panelBorder">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Assigned Visuals</span>
                      <span className="font-mono text-sm text-emerald-400 font-bold mt-0.5 block">
                        {formatTimecode(draftStats.assignedDuration)}
                      </span>
                      <span className="text-[10px] text-emerald-500/80">{draftStats.assignedSegments} shots</span>
                    </div>

                    <div className="bg-editor-surface/60 rounded-lg p-2.5 border border-editor-panelBorder">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Uncovered Gaps</span>
                      <span className="font-mono text-sm text-amber-400 font-bold mt-0.5 block">
                        {formatTimecode(draftStats.unassignedDuration)}
                      </span>
                      <span className="text-[10px] text-amber-500/80">{draftStats.unassignedSegments} segments</span>
                    </div>

                    <div className="bg-editor-surface/60 rounded-lg p-2.5 border border-editor-panelBorder">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Coverage</span>
                      <span className="font-mono text-sm text-purple-300 font-bold mt-0.5 block">
                        {draftStats.coveragePercentage}%
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {draftStats.assignedSegments}/{draftStats.totalSegments} segments
                      </span>
                    </div>
                  </div>

                  {/* Observations */}
                  {draftStats.warnings && draftStats.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Actionable Draft Observations</span>
                      </h4>
                      <div className="space-y-1.5">
                        {draftStats.warnings.map((warning, wIdx) => (
                          <div
                            key={wIdx}
                            className="p-2.5 rounded bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 flex items-start gap-2"
                          >
                            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{warning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: MEDIA USAGE BREAKDOWN */}
              {reviewTab === 'usage' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Assets utilized across current draft timeline:</span>
                    <span className="font-mono text-slate-300">{draftStats.mediaUsageSummary?.length || 0} total</span>
                  </div>

                  <div className="space-y-2">
                    {(draftStats.mediaUsageSummary || []).map((usage) => (
                      <div
                        key={usage.mediaId}
                        className="bg-editor-surface/60 rounded-lg p-2.5 border border-editor-panelBorder flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {usage.mediaType === 'video' ? (
                            <Film className="w-4 h-4 text-blue-400 shrink-0" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-200 truncate">{usage.mediaName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              Total timeline coverage: {usage.totalDuration.toFixed(1)}s
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                            {usage.useCount} {usage.useCount === 1 ? 'shot' : 'shots'}
                          </span>

                          {usage.hasConsecutiveReuse && (
                            <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/40 px-1.5 py-0.5 rounded">
                              Consecutive repeat
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: UNASSIGNED GAPS */}
              {reviewTab === 'gaps' && (
                <div className="space-y-3">
                  {draftStats.unassignedDetails && draftStats.unassignedDetails.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400">
                        The following transcript segments have no assigned visual media:
                      </p>
                      {draftStats.unassignedDetails.map((gap) => (
                        <div
                          key={gap.id}
                          className="bg-editor-surface/60 rounded-lg p-3 border border-editor-panelBorder space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] text-purple-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-purple-400" />
                              <span>{formatTimecode(gap.startTime)} — {formatTimecode(gap.endTime)}</span>
                              <span className="text-slate-500">({gap.duration.toFixed(1)}s)</span>
                            </span>

                            <button
                              onClick={() => {
                                onSeek(gap.startTime);
                                setShowReviewModal(false);
                              }}
                              className="text-[10px] px-2 py-0.5 bg-editor-surface hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                            >
                              Seek to Gap
                            </button>
                          </div>

                          <p className="text-slate-200 italic">"{gap.text}"</p>

                          <div className="bg-black/40 rounded p-1.5 border border-slate-800 text-[11px] text-amber-300/90 flex items-start gap-1.5">
                            <Info className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <span>Reason: {gap.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-1" />
                      <p className="font-semibold text-slate-200">100% Visual Coverage</p>
                      <p className="text-slate-500">Every transcript segment has an assigned media clip.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-editor-panelBorder bg-editor-panel flex justify-end">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition-colors"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspected Gap Popover Modal */}
      {inspectedGap && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-editor-panelBorder pb-2.5">
              <div className="flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <h4 className="font-semibold text-xs text-slate-200 uppercase tracking-wider">
                  Uncovered Timeline Gap
                </h4>
              </div>
              <button
                onClick={() => setInspectedGap(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-editor-surface"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p className="text-[11px] text-slate-400">
                Nothing was selected for this part of the voiceover narration:
              </p>

              <div className="bg-black/30 p-2.5 rounded border border-slate-800 space-y-1">
                <div className="font-mono text-[10px] text-purple-300">
                  {formatTimecode(inspectedGap.startTime)} — {formatTimecode(inspectedGap.endTime)} ({(inspectedGap.endTime - inspectedGap.startTime).toFixed(1)}s)
                </div>
                <p className="text-slate-200 italic">"{inspectedGap.text}"</p>
              </div>

              <div className="bg-amber-950/30 p-2 rounded border border-amber-800/40 text-[11px] text-amber-200 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  {draftStats?.unassignedReasons?.[inspectedGap.id] ||
                    'No matching media scored above similarity threshold.'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-editor-panelBorder/50">
              <button
                onClick={() => {
                  onSeek(inspectedGap.startTime);
                  setInspectedGap(null);
                }}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium"
              >
                Seek Playhead Here
              </button>
              <button
                onClick={() => setInspectedGap(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replace Visual Media Modal */}
      <ReplaceMediaModal
        isOpen={!!replacingClipId}
        onClose={() => setReplacingClipId(null)}
        mediaList={mediaList}
        currentMediaId={timeline.find((t) => t.id === replacingClipId)?.mediaId}
        onSelectMedia={(newMediaId) => {
          if (replacingClipId && onReplaceClipMedia) {
            onReplaceClipMedia(replacingClipId, newMediaId);
          }
          setReplacingClipId(null);
        }}
      />
    </div>
  );
};
