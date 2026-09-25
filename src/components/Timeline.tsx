import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Film,
  Music,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
  Upload,
  Loader2,
  Sliders,
  AlertTriangle,
  X,
  Info,
  FileText,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  Crop,
} from 'lucide-react';
import { TimelineItem, MediaAsset, VoiceoverTrack, AudioSegment } from '../types/project';
import { formatTimecode } from '../engine/schema';
import { DraftStats, DraftOptions } from '../engine/draftTimeline';

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
  onUpdateDuration: (id: string, duration: number) => void;
  onReorder: (newTimeline: TimelineItem[]) => void;
  onSetTimelineScale: (scale: number) => void;
  onGenerateAIDraft?: (options?: DraftOptions) => void;
  onClearTimeline?: () => void;
  onOpenFramingEditor?: (itemId?: string) => void;
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
  onUpdateDuration,
  onReorder,
  onSetTimelineScale,
  onGenerateAIDraft,
  onClearTimeline,
  onOpenFramingEditor,
  onUploadVoiceover,
  onRemoveVoiceover,
  onSetVoiceoverVolume,
  onToggleVoiceoverMute,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [resizingItemId, setResizingItemId] = useState<string | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const initialDurationRef = useRef<number>(0);

  // AI Draft Modal State
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewTab, setReviewTab] = useState<'overview' | 'usage' | 'gaps'>('overview');
  const [inspectedGap, setInspectedGap] = useState<AudioSegment | null>(null);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.30);
  const [reusePenalty, setReusePenalty] = useState<number>(0.08);
  const [continuityPreference, setContinuityPreference] = useState<number>(0.03);

  const getAsset = (mediaId: string) => mediaList.find((m) => m.id === mediaId);

  // Time ruler ticks
  const maxTime = Math.max(30, totalDuration + 15);
  const tickStep = timelineScale < 18 ? 10 : timelineScale < 35 ? 5 : 1;
  const ticks = [];
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
    setIsScrubbing(true);
  };

  const handleTimelineTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const clickX = touch.clientX - rect.left + scrollContainerRef.current.scrollLeft;
    const newTime = Math.max(0, clickX / timelineScale);
    onSeek(newTime);
    setIsScrubbing(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isScrubbing && scrollContainerRef.current) {
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
        const newTime = Math.max(0, clickX / timelineScale);
        onSeek(newTime);
      } else if (resizingItemId) {
        const deltaX = e.clientX - resizeStartXRef.current;
        const deltaSec = deltaX / timelineScale;
        const newDuration = Math.max(0.5, initialDurationRef.current + deltaSec);
        onUpdateDuration(resizingItemId, Math.round(newDuration * 10) / 10);
      }
    },
    [isScrubbing, resizingItemId, timelineScale, onSeek, onUpdateDuration]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isScrubbing && scrollContainerRef.current && e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const clickX = touch.clientX - rect.left + scrollContainerRef.current.scrollLeft;
        const newTime = Math.max(0, clickX / timelineScale);
        onSeek(newTime);
      }
    },
    [isScrubbing, timelineScale, onSeek]
  );

  const handleMouseUp = useCallback(() => {
    setIsScrubbing(false);
    setResizingItemId(null);
  }, []);

  useEffect(() => {
    if (isScrubbing || resizingItemId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isScrubbing, resizingItemId, handleMouseMove, handleTouchMove, handleMouseUp]);

  // Reorder shift
  const handleMoveClip = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= timeline.length) return;

    const newItems = [...timeline];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);
    onReorder(newItems);
  };

  const handleStartResize = (e: React.MouseEvent, item: TimelineItem) => {
    e.stopPropagation();
    setResizingItemId(item.id);
    resizeStartXRef.current = e.clientX;
    initialDurationRef.current = item.duration;
  };

  const handleAudioFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadVoiceover) {
      onUploadVoiceover(file);
    }
    e.target.value = '';
  };

  const handleTriggerGenerateDraft = () => {
    if (onGenerateAIDraft) {
      onGenerateAIDraft({
        similarityThreshold,
        reusePenalty,
        continuityPreference,
      });
      setShowDraftModal(false);
    }
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
    <div className="h-56 sm:h-64 lg:h-72 bg-editor-panel border-t border-editor-panelBorder flex flex-col shrink-0 select-none relative">
      <input
        type="file"
        ref={audioInputRef}
        onChange={handleAudioFileInput}
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
        className="hidden"
      />

      {/* AI Draft Review & Settings Modal */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl max-w-md w-full max-h-[92vh] sm:max-h-[85vh] p-4 sm:p-5 space-y-4 overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-editor-panelBorder pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-sm text-slate-100 uppercase tracking-wider">
                  Generate AI Draft Timeline
                </h3>
              </div>
              <button
                onClick={() => setShowDraftModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-editor-surface"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Principle & Notice */}
            <div className="space-y-2 text-xs text-slate-300">
              <div className="p-2.5 rounded bg-purple-950/40 border border-purple-800/40 text-purple-200 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-purple-400" />
                  <span>Principle: AI chooses WHAT, you choose HOW.</span>
                </p>
                <p className="text-[11px] text-purple-300/90 leading-relaxed">
                  The AI matches your analyzed photos and videos to transcript segments based on semantic similarity. You remain fully in control to drag, crop, zoom, and re-time afterward.
                </p>
              </div>

              {timeline.length > 0 && (
                <div className="p-2 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300 text-[11px] flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>Generating a new draft will replace the current visual timeline clips.</span>
                </div>
              )}
            </div>

            {/* Config Sliders */}
            <div className="space-y-3 bg-editor-surface/50 p-3 rounded-lg border border-editor-panelBorder text-xs">
              {/* 1. Similarity Threshold */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-purple-400" />
                    <span>Minimum Semantic Similarity:</span>
                  </span>
                  <span className="font-mono text-purple-300 font-semibold">{similarityThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.15"
                  max="0.65"
                  step="0.05"
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.15 (Permissive)</span>
                  <span>0.30 (Recommended)</span>
                  <span>0.65 (Strict)</span>
                </div>
              </div>

              {/* 2. Reuse Penalty */}
              <div className="space-y-1 pt-2 border-t border-editor-panelBorder/50">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Media Reuse Penalty:</span>
                  <span className="font-mono text-purple-300 font-semibold">{reusePenalty.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="0.20"
                  step="0.02"
                  value={reusePenalty}
                  onChange={(e) => setReusePenalty(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.00 (Repeat freely)</span>
                  <span>0.08 (Balanced)</span>
                  <span>0.20 (Prefer diversity)</span>
                </div>
              </div>

              {/* 3. Continuity Preference */}
              <div className="space-y-1 pt-2 border-t border-editor-panelBorder/50">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Visual Continuity Preference:</span>
                  <span className="font-mono text-purple-300 font-semibold">{continuityPreference.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="0.08"
                  step="0.01"
                  value={continuityPreference}
                  onChange={(e) => setContinuityPreference(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.00 (Off)</span>
                  <span>0.03 (Gentle flow)</span>
                  <span>0.08 (Strong flow)</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDraftModal(false)}
                className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-editor-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerGenerateDraft}
                disabled={isGeneratingDraft}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow transition-all"
              >
                {isGeneratingDraft ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating Draft...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Draft</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Controls Header */}
      <div className="h-10 border-b border-editor-panelBorder px-4 flex items-center justify-between bg-editor-panel">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Timeline</span>
          </div>

          <span className="text-[11px] text-slate-400 bg-editor-surface px-2 py-0.5 rounded border border-editor-panelBorder">
            {timeline.length} {timeline.length === 1 ? 'clip' : 'clips'}
          </span>

          {/* AI Draft Trigger Button */}
          {onGenerateAIDraft && (
            <button
              onClick={() => setShowDraftModal(true)}
              disabled={isGeneratingDraft || !voiceover?.segments || voiceover.segments.length === 0}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                isGeneratingDraft
                  ? 'bg-purple-950 text-purple-300 cursor-wait border border-purple-800'
                  : !voiceover?.segments || voiceover.segments.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
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

          {/* AI Draft Review & Shot Intelligence Modal (Step 14) */}
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
                          <span className="text-[10px] text-slate-500">of narration</span>
                        </div>
                      </div>

                      {/* Secondary Stats */}
                      <div className="bg-editor-surface/40 rounded-lg p-3 border border-editor-panelBorder text-xs grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Unique Media:</span>
                          <span className="font-mono text-slate-200 font-medium">{draftStats.uniqueMediaUsed} assets</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Reused Media:</span>
                          <span className="font-mono text-slate-200 font-medium">
                            {Object.values(draftStats.mediaReuseCount).filter((c) => c > 1).length} reused
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Source Starts:</span>
                          <span className="font-mono text-emerald-300 font-medium">
                            {draftStats.sourceStartsOptimized || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Duration Refined:</span>
                          <span className="font-mono text-cyan-300 font-medium">
                            {draftStats.durationAdjustmentsCount || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Continuity Links:</span>
                          <span className="font-mono text-teal-300 font-medium">
                            {draftStats.continuityLinksCount || 0} links
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Narration Beats:</span>
                          <span className="font-mono text-violet-300 font-medium">
                            {draftStats.beatCount || 0} beats
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Continuations:</span>
                          <span className="font-mono text-indigo-300 font-medium">
                            {draftStats.continuationSegments || 0} segs
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Variety Adjustments:</span>
                          <span className="font-mono text-amber-300 font-medium">
                            {draftStats.varietyAdjustments || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Pacing Adjustments:</span>
                          <span className="font-mono text-fuchsia-300 font-medium">
                            {draftStats.pacingAdjustments || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Pacing Arc:</span>
                          <span className="font-mono text-lime-300 font-medium">
                            {draftStats.pacingArcAdjustments || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Impact Adjustments:</span>
                          <span className="font-mono text-amber-300 font-medium">
                            {draftStats.emphasisImpactAdjustments || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Contrast Adjustments:</span>
                          <span className="font-mono text-emerald-300 font-medium">
                            {draftStats.contrastAdjustments || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Subject Continuity:</span>
                          <span className="font-mono text-cyan-300 font-medium">
                            {draftStats.subjectContinuityAdjustments || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Subj HIGH / MOD:</span>
                          <span className="font-mono text-cyan-300 font-medium">
                            {draftStats.highSubjectContinuitySelections || 0} / {draftStats.moderateSubjectContinuitySelections || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Subj LOW:</span>
                          <span className="font-mono text-slate-400 font-medium">
                            {draftStats.lowSubjectContinuitySelections || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Quick / Lingering:</span>
                          <span className="font-mono text-sky-300 font-medium">
                            {draftStats.quickPacingSelections || 0} / {draftStats.lingeringPacingSelections || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Repetition Penalties:</span>
                          <span className="font-mono text-orange-300 font-medium">
                            {draftStats.repetitionPenalties || 0} clips
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Threshold:</span>
                          <span className="font-mono text-purple-300 font-medium">{draftStats.thresholdUsed.toFixed(2)} min</span>
                        </div>
                      </div>

                      {/* Warnings Section (Factual) */}
                      {draftStats.warnings && draftStats.warnings.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
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

          {/* Inspected Gap Popover Modal (Step 6) */}
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

          {/* Quick Adjust 16:9 Framing Action */}
          {timeline.length > 0 && onOpenFramingEditor && (
            <button
              onClick={() => onOpenFramingEditor(selectedItemId || undefined)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                selectedItemId
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white ring-1 ring-indigo-400/50'
                  : 'bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/50'
              }`}
              title="Open direct touch/drag 16:9 Framing Editor"
            >
              <Crop className="w-3.5 h-3.5 text-indigo-300" />
              <span className="hidden sm:inline">Adjust Framing</span>
              <span className="sm:hidden">Framing</span>
            </button>
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

      {/* Main Tracks Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Track Labels Column */}
        <div className="w-24 sm:w-32 md:w-40 bg-editor-panel border-r border-editor-panelBorder shrink-0 flex flex-col justify-start pt-6 z-10 select-none">
          {/* 1. Voiceover Track Header */}
          <div className="h-16 px-2 sm:px-3 flex flex-col justify-center border-b border-editor-panelBorder/60 bg-editor-surface/25">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-purple-300 font-medium truncate">
                <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">Voiceover</span>
              </div>

              {voiceover && onToggleVoiceoverMute && (
                <button
                  onClick={onToggleVoiceoverMute}
                  className={`p-1 rounded transition-colors ${
                    voiceover.isMuted
                      ? 'text-red-400 bg-red-950/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-editor-surface'
                  }`}
                  title={voiceover.isMuted ? 'Unmute Audio' : 'Mute Audio'}
                >
                  {voiceover.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              )}
            </div>

            {voiceover ? (
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="font-mono text-purple-300 truncate max-w-[60px] sm:max-w-[90px]" title={voiceover.name}>
                    {voiceover.name}
                  </span>
                  {onRemoveVoiceover && (
                    <button
                      onClick={onRemoveVoiceover}
                      className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                      title="Remove Voiceover"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                {/* Volume slider */}
                {onSetVoiceoverVolume && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[9px] text-slate-500 font-mono hidden sm:inline">Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={voiceover.isMuted ? 0 : voiceover.volume}
                      onChange={(e) => onSetVoiceoverVolume(parseFloat(e.target.value))}
                      className="w-full h-1 bg-editor-surface rounded appearance-none cursor-pointer"
                      title={`Volume: ${Math.round((voiceover.isMuted ? 0 : voiceover.volume) * 100)}%`}
                    />
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => audioInputRef.current?.click()}
                className="mt-1 text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors truncate"
              >
                <Upload className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">Audio</span>
              </button>
            )}
          </div>

          {/* 2. Video / Photo Track Header */}
          <div className="h-16 px-2 sm:px-3 flex items-center justify-between border-b border-editor-panelBorder/50 bg-editor-surface/15">
            <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-slate-300 font-medium truncate">
              <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">Video</span>
            </div>
            <span className="text-[9px] text-slate-400 font-mono bg-slate-800 px-1 py-0.5 rounded hidden sm:inline">16:9</span>
          </div>
        </div>

        {/* Scrollable Tracks & Time Ruler Container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-editor-trackBg flex flex-col cursor-crosshair"
          onMouseDown={handleTimelineMouseDown}
          onTouchStart={handleTimelineTouchStart}
        >
          {/* Time Ruler */}
          <div
            ref={rulerRef}
            className="h-6 border-b border-editor-panelBorder relative bg-editor-panel shrink-0"
            style={{ width: `${totalWidthPx}px` }}
          >
            {ticks.map((sec) => (
              <div
                key={sec}
                className="absolute top-0 bottom-0 border-l border-slate-700 flex items-end pl-1 pb-0.5"
                style={{ left: `${sec * timelineScale}px` }}
              >
                <span className="text-[9px] font-mono text-slate-400 pointer-events-none">
                  {sec}s
                </span>
              </div>
            ))}
          </div>

          {/* 1. Voiceover Audio Track */}
          <div
            className="h-16 relative border-b border-editor-panelBorder/60 bg-purple-950/10 py-1.5 px-0"
            style={{ width: `${totalWidthPx}px` }}
          >
            {voiceover ? (
              <div
                style={{
                  width: `${voiceover.duration * timelineScale}px`,
                }}
                className="absolute top-1.5 bottom-1.5 left-0 rounded-md border border-purple-500/40 bg-purple-900/40 overflow-hidden shadow flex flex-col justify-between p-1.5 relative group"
              >
                {/* Voiceover Header & Duration */}
                <div className="flex items-center justify-between gap-1 z-10 pointer-events-none">
                  <span className="font-semibold text-[11px] text-purple-200 truncate flex items-center gap-1">
                    <Music className="w-3 h-3 text-purple-400" />
                    {voiceover.name}
                  </span>
                  <span className="font-mono text-[10px] text-purple-300 bg-black/60 px-1.5 py-0.2 rounded shrink-0">
                    {formatTimecode(voiceover.duration)}
                  </span>
                </div>

                {/* True Waveform Peak Visualization */}
                <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-60 group-hover:opacity-80 transition-opacity">
                  {voiceover.waveformData && voiceover.waveformData.length > 0 ? (
                    voiceover.waveformData.map((peak, idx) => (
                      <div
                        key={idx}
                        className="w-[1.5px] bg-purple-300 rounded-full shrink-0"
                        style={{
                          height: `${Math.max(12, peak * 70)}%`,
                          marginRight: '1px',
                        }}
                      />
                    ))
                  ) : (
                    <div className="w-full h-0.5 bg-purple-400/40" />
                  )}
                </div>

                <div className="text-[9px] text-purple-400/80 font-mono z-10 pointer-events-none">
                  Voiceover Master Track ({voiceover.segments?.length || 0} segments)
                </div>
              </div>
            ) : (
              <div
                onClick={() => audioInputRef.current?.click()}
                className="h-full border border-dashed border-purple-500/30 hover:border-purple-400/70 rounded-md mx-2 flex items-center justify-center gap-2 text-xs text-purple-400 hover:text-purple-300 cursor-pointer bg-purple-950/20 hover:bg-purple-950/40 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Voiceover Audio (MP3, WAV, M4A, AAC) — Backbone of Long-Form Timeline</span>
              </div>
            )}
          </div>

          {/* 2. Video / Photo Track */}
          <div
            className="h-16 relative border-b border-editor-panelBorder/60 bg-editor-surface/10 py-1.5 px-0"
            style={{ width: `${totalWidthPx}px` }}
          >
            {timeline.length === 0 ? (
              <div className="absolute inset-0 flex items-center pl-6 text-xs text-slate-500 pointer-events-none">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500/50" />
                  Visual timeline ready. Click "Generate AI Draft" or add clips manually.
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
                      className="absolute top-1.5 bottom-1.5 rounded border border-dashed border-amber-600/40 hover:border-amber-400 bg-amber-950/10 hover:bg-amber-950/30 flex items-center justify-center px-1 cursor-pointer z-0 transition-colors group"
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
                  const widthPx = item.duration * timelineScale;
                  const leftPx = item.startTime * timelineScale;

                  return (
                    <div
                      key={item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClip(item.id);
                        onSeek(item.startTime);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onSelectClip(item.id);
                        onOpenFramingEditor?.(item.id);
                      }}
                      style={{
                        left: `${leftPx}px`,
                        width: `${Math.max(28, widthPx)}px`,
                      }}
                      className={`absolute top-1.5 bottom-1.5 rounded-md border text-xs overflow-hidden cursor-pointer transition-all flex flex-col justify-between p-1.5 group z-10 ${
                        isSelected
                          ? 'bg-blue-900/70 border-blue-400 ring-2 ring-blue-500 shadow-xl'
                          : 'bg-editor-clipBg hover:bg-slate-700/60 border-editor-clipBorder'
                      }`}
                      title="Click to select • Double-click to adjust 16:9 framing"
                    >
                      {/* Clip Top Bar */}
                      <div className="flex items-center justify-between gap-1 pointer-events-none">
                        <span className="font-semibold text-[11px] text-slate-100 truncate">
                          {asset ? asset.name : 'Unknown Media'}
                        </span>
                        <span className="font-mono text-[10px] text-blue-300 bg-black/50 px-1 rounded shrink-0">
                          {item.duration.toFixed(1)}s
                        </span>
                      </div>

                      {/* Clip Bottom Controls */}
                      <div className="flex items-center justify-between gap-1 opacity-80 group-hover:opacity-100">
                        <div className="flex items-center gap-0.5">
                          {index > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveClip(index, 'left');
                              }}
                              className="p-0.5 hover:bg-black/50 text-slate-400 hover:text-white rounded"
                              title="Move Earlier"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                          )}
                          {index < timeline.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveClip(index, 'right');
                              }}
                              className="p-0.5 hover:bg-black/50 text-slate-400 hover:text-white rounded"
                              title="Move Later"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5">
                          {onOpenFramingEditor && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectClip(item.id);
                                onOpenFramingEditor(item.id);
                              }}
                              className={`p-0.5 rounded transition-colors ${
                                isSelected
                                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                  : 'hover:bg-indigo-600/40 text-slate-300 hover:text-indigo-200'
                              }`}
                              title="Adjust 16:9 Framing"
                            >
                              <Crop className="w-3 h-3" />
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveClip(item.id);
                            }}
                            className="p-0.5 hover:bg-red-600/40 text-slate-400 hover:text-red-300 rounded transition-colors"
                            title="Remove Clip from Timeline"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Right Resize Handle */}
                      <div
                        onMouseDown={(e) => handleStartResize(e, item)}
                        className="absolute top-0 right-0 bottom-0 w-3 bg-blue-500/0 hover:bg-blue-400/80 cursor-ew-resize rounded-r flex items-center justify-center transition-colors"
                        title="Drag to adjust clip duration"
                      >
                        <div className="w-0.5 h-4 bg-white/50 rounded-full pointer-events-none" />
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
            <div className="w-3 h-3.5 bg-red-500 -ml-[5px] -mt-[1px] rounded-b shadow-md flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
