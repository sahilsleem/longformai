import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Clock,
  Edit2,
  Check,
  Image as ImageIcon,
  Film,
  ArrowRight,
  Sparkle,
} from 'lucide-react';
import { VoiceoverTrack, AudioSegment, MediaAsset, SegmentMatchResult, TimelineItem } from '../types/project';
import { formatTimecode } from '../engine/schema';
import {
  checkMatchingWorkerHealth,
  matchMediaForSegment,
  MatchingWorkerStatus,
} from '../engine/matching';

interface TranscriptPanelProps {
  voiceover?: VoiceoverTrack;
  mediaAssets?: MediaAsset[];
  timeline?: TimelineItem[];
  selectedTimelineItemId?: string | null;
  currentTime: number;
  selectedMediaId?: string | null;
  unassignedReasons?: { [segmentId: string]: string };
  onSeek: (time: number) => void;
  onSelectMedia?: (mediaId: string) => void;
  onSelectTimelineItem?: (itemId: string | null) => void;
  onTranscribe: (options: { modelSize: 'tiny' | 'base' | 'small' }) => Promise<void>;
  onUpdateSegmentText?: (segmentId: string, newText: string) => void;
  isTranscribing: boolean;
  transcriptionError: string | null;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  voiceover,
  mediaAssets = [],
  timeline = [],
  selectedTimelineItemId,
  currentTime,
  selectedMediaId,
  unassignedReasons = {},
  onSeek,
  onSelectMedia,
  onSelectTimelineItem,
  onTranscribe,
  onUpdateSegmentText,
  isTranscribing,
  transcriptionError,
}) => {
  const [matchingWorkerStatus, setMatchingWorkerStatus] = useState<MatchingWorkerStatus>({ online: false });
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  
  // Selected segment for suggestions
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<{ [segmentId: string]: SegmentMatchResult }>({});
  const [isMatching, setIsMatching] = useState<{ [segmentId: string]: boolean }>({});

  const activeSegmentRef = useRef<HTMLDivElement | null>(null);

  // Periodically check local workers health
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const mStatus = await checkMatchingWorkerHealth();
      if (mounted) {
        setMatchingWorkerStatus(mStatus);
      }
    };
    check();
    const interval = setInterval(check, 6000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const segments = voiceover?.segments || [];

  // Find the active segment at playhead timestamp
  const activeSegmentIndex = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  );

  // Default selected segment to active playhead segment if not explicitly set
  useEffect(() => {
    if (activeSegmentIndex >= 0 && segments[activeSegmentIndex]) {
      if (!selectedSegmentId) {
        setSelectedSegmentId(segments[activeSegmentIndex].id);
      }
    }
  }, [activeSegmentIndex, segments, selectedSegmentId]);

  // Sync selection from timeline
  useEffect(() => {
    if (selectedTimelineItemId && timeline.length > 0) {
      const selectedClip = timeline.find((t) => t.id === selectedTimelineItemId);
      if (selectedClip) {
        // Match by provenance sourceSegmentId or time range
        const matchingSeg = segments.find(
          (s) => (selectedClip.provenance?.sourceSegmentId && s.id === selectedClip.provenance.sourceSegmentId) ||
                 (selectedClip.startTime >= s.startTime && selectedClip.startTime < s.endTime)
        );
        if (matchingSeg && matchingSeg.id !== selectedSegmentId) {
          setSelectedSegmentId(matchingSeg.id);
        }
      }
    }
  }, [selectedTimelineItemId, timeline, segments]);

  // Trigger semantic matching on demand for a segment
  const handleFetchMatches = async (segment: AudioSegment, force: boolean = false) => {
    if (isMatching[segment.id]) return;
    setIsMatching((prev) => ({ ...prev, [segment.id]: true }));
    try {
      const res = await matchMediaForSegment(segment, mediaAssets, { forceRefresh: force });
      setMatchResults((prev) => ({ ...prev, [segment.id]: res }));
    } catch (err) {
      console.warn('Matching error:', err);
    } finally {
      setIsMatching((prev) => ({ ...prev, [segment.id]: false }));
    }
  };

  const handleSelectSegment = (segment: AudioSegment) => {
    setSelectedSegmentId(segment.id);
    onSeek(segment.startTime);

    // Link to corresponding timeline clip if one exists
    const assignedClip = timeline.find(
      (t) => (t.provenance?.sourceSegmentId && t.provenance.sourceSegmentId === segment.id) ||
             (t.startTime < segment.endTime && t.startTime + t.duration > segment.startTime)
    );
    if (assignedClip && onSelectTimelineItem) {
      onSelectTimelineItem(assignedClip.id);
    } else if (onSelectTimelineItem) {
      onSelectTimelineItem(null);
    }

    // On-demand fetch if not already cached
    if (!matchResults[segment.id]) {
      handleFetchMatches(segment);
    }
  };

  const handleStartEditing = (segment: AudioSegment) => {
    setEditingSegmentId(segment.id);
    setEditingText(segment.text || '');
  };

  const handleSaveEditing = (segmentId: string) => {
    if (onUpdateSegmentText) {
      onUpdateSegmentText(segmentId, editingText.trim());
    }
    setEditingSegmentId(null);
  };

  const handleCopyAll = () => {
    const fullText = segments.map((s) => s.text).join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const analyzedMediaCount = mediaAssets.filter(
    (m) => Boolean(m.analysis?.semantic?.description || (m.analysis?.tags && m.analysis.tags.length > 0))
  ).length;

  return (
    <div className="flex flex-col h-full bg-editor-panel w-full select-none overflow-hidden">
      {/* Panel Header */}
      <div className="p-3 border-b border-editor-panelBorder flex items-center justify-between bg-editor-panel shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider">
            Transcript & Matches
          </span>
          {segments.length > 0 && (
            <span className="bg-editor-surface text-purple-300 text-xs px-2 py-0.5 rounded font-mono border border-editor-panelBorder">
              {segments.length}
            </span>
          )}
        </div>

        {/* Worker Status Badges */}
        <div className="flex items-center gap-1.5">
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border ${
              matchingWorkerStatus.online
                ? 'bg-purple-950/60 text-purple-300 border-purple-800/40'
                : 'bg-slate-800/80 text-slate-400 border-slate-700'
            }`}
            title={
              matchingWorkerStatus.online
                ? `Matching worker ready (${matchingWorkerStatus.defaultModel})`
                : 'Matching worker offline (port 8767)'
            }
          >
            <Sparkle className={`w-2 h-2 ${matchingWorkerStatus.online ? 'text-purple-400' : 'text-slate-500'}`} />
            <span>{matchingWorkerStatus.online ? 'Matcher Ready' : 'Matcher Offline'}</span>
          </div>
        </div>
      </div>

      {/* Transcription Control Bar */}
      <div className="p-3 border-b border-editor-panelBorder bg-editor-surface/30 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            {segments.length > 0 ? (
              <span>{segments.length} segments timestamped</span>
            ) : voiceover ? (
              <span>Voiceover audio loaded</span>
            ) : (
              <span>Import voiceover to begin</span>
            )}
          </div>

          {/* Transcribe Button */}
          <button
            onClick={() => onTranscribe({ modelSize: 'base' })}
            disabled={!voiceover || isTranscribing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded shadow transition-all ${
              !voiceover
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : isTranscribing
                ? 'bg-purple-900 text-purple-200 cursor-wait'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {isTranscribing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Transcribing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                <span>{segments.length > 0 ? 'Re-Transcribe' : 'Transcribe'}</span>
              </>
            )}
          </button>
        </div>

        {/* Error Banner */}
        {transcriptionError && (
          <div className="p-2 rounded bg-red-950/50 border border-red-800/40 text-[10px] text-red-300 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-tight">{transcriptionError}</span>
          </div>
        )}
      </div>

      {/* Transcript Segments & Suggestions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {segments.length === 0 ? (
          <div className="h-48 border border-dashed border-editor-panelBorder rounded-lg flex flex-col items-center justify-center p-4 text-center text-slate-500">
            <FileText className="w-8 h-8 mb-2 opacity-30 text-purple-400" />
            <p className="text-xs font-medium text-slate-400">No Transcript Yet</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
              {voiceover
                ? 'Click "Transcribe" above to generate timestamped segments from your voiceover.'
                : 'Import a voiceover audio file first to start transcription.'}
            </p>
          </div>
        ) : (
          <>
            {/* Quick Actions Header */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1">
              <span>{segments.length} Timestamped Segments</span>
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                title="Copy Full Transcript Text"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>

            {/* Segments Cards */}
            <div className="space-y-2">
              {segments.map((segment, idx) => {
                const isPlaybackActive = idx === activeSegmentIndex;
                const isSelected = selectedSegmentId === segment.id;
                const isEditing = editingSegmentId === segment.id;
                const segmentMatches = matchResults[segment.id];
                const matchingInProgress = isMatching[segment.id];

                const assignedClip = timeline.find(
                  (t) => (t.provenance?.sourceSegmentId && t.provenance.sourceSegmentId === segment.id) ||
                         (t.startTime < segment.endTime && t.startTime + t.duration > segment.startTime)
                );
                const assignedAsset = assignedClip ? mediaAssets.find((m) => m.id === assignedClip.mediaId) : null;
                const gapReason = unassignedReasons[segment.id];

                return (
                  <div
                    key={segment.id}
                    ref={isPlaybackActive ? activeSegmentRef : null}
                    onClick={() => handleSelectSegment(segment)}
                    className={`p-2.5 rounded-lg border text-xs transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-editor-surface border-purple-500 ring-1 ring-purple-500/50 shadow-md'
                        : isPlaybackActive
                        ? 'bg-purple-950/30 border-purple-700/60'
                        : 'bg-editor-surface/60 hover:bg-editor-surface border-editor-panelBorder'
                    }`}
                  >
                    {/* Segment Header: Time Range + Edit */}
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1 font-mono text-[10px] text-purple-300">
                        <Clock className="w-2.5 h-2.5 text-purple-400" />
                        <span>
                          {formatTimecode(segment.startTime)} — {formatTimecode(segment.endTime)}
                        </span>
                        {isPlaybackActive && (
                          <span className="bg-purple-600 text-[8px] font-sans text-white px-1 rounded uppercase font-bold tracking-wider">
                            Playing
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveEditing(segment.id);
                            }}
                            className="p-0.5 text-emerald-400 hover:bg-emerald-950/60 rounded"
                            title="Save"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditing(segment);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-200 transition-opacity"
                            title="Edit Segment Text"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Segment Text */}
                    {isEditing ? (
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveEditing(segment.id);
                          }
                        }}
                        rows={2}
                        className="w-full bg-slate-900 border border-purple-500 rounded p-1.5 text-xs text-slate-100 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <p
                        className={`text-slate-200 leading-relaxed ${
                          isSelected ? 'font-medium text-white' : ''
                        }`}
                      >
                        "{segment.text}"
                      </p>
                    )}

                    {/* Timeline Assignment / Gap Indicator */}
                    {timeline.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-editor-panelBorder/50 flex items-center justify-between text-[10px]">
                        {assignedClip && assignedAsset ? (
                          <div className="flex items-center gap-1.5 text-blue-300 truncate max-w-full">
                            {assignedAsset.type === 'video' ? (
                              <Film className="w-3 h-3 text-blue-400 shrink-0" />
                            ) : (
                              <ImageIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                            )}
                            <span className="truncate font-mono">{assignedAsset.name}</span>
                            <span className="text-slate-500 font-mono">({assignedClip.duration.toFixed(1)}s)</span>
                            {assignedClip.provenance && (
                              <span className="bg-purple-950/80 text-purple-300 px-1 rounded text-[9px] font-mono shrink-0">
                                {assignedClip.provenance.originalScore.toFixed(2)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-400/80 font-mono text-[9px] truncate">
                            <span className="px-1 py-0.2 rounded bg-amber-950/40 border border-dashed border-amber-800/40">
                              Uncovered Gap
                            </span>
                            <span className="text-slate-500 truncate">{gapReason || 'No match >= threshold'}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. MEDIA SUGGESTIONS SECTION (WHEN SEGMENT IS SELECTED) */}
                    {isSelected && (
                      <div
                        className="mt-3 pt-2.5 border-t border-editor-panelBorder/70 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                              Media Suggestions
                            </span>
                          </div>

                          <button
                            onClick={() => handleFetchMatches(segment, true)}
                            disabled={matchingInProgress}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/40 transition-colors"
                            title="Recalculate semantic match scores"
                          >
                            {matchingInProgress ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-purple-300" />
                            ) : (
                              <Sparkles className="w-2.5 h-2.5" />
                            )}
                            <span>{matchingInProgress ? 'Matching...' : 'Find Matches'}</span>
                          </button>
                        </div>

                        {/* Loading State */}
                        {matchingInProgress ? (
                          <div className="p-3 bg-slate-900/60 rounded border border-slate-800 flex items-center justify-center gap-2 text-slate-400 text-[11px]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                            <span>Computing text & media embeddings...</span>
                          </div>
                        ) : segmentMatches?.error ? (
                          <div className="p-2 rounded bg-amber-950/40 border border-amber-800/40 text-[10px] text-amber-300 flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>{segmentMatches.error}</span>
                          </div>
                        ) : analyzedMediaCount === 0 ? (
                          <div className="p-2.5 bg-slate-900/40 rounded border border-dashed border-editor-panelBorder text-center text-slate-400 text-[10px] space-y-1">
                            <p className="font-medium text-slate-300">No Analyzed Media Available</p>
                            <p className="text-slate-500">
                              Click on your media in the Media Library and select "Analyze" to extract semantic descriptions before matching.
                            </p>
                          </div>
                        ) : segmentMatches?.candidates && segmentMatches.candidates.length > 0 ? (
                          <div className="space-y-1.5">
                            {segmentMatches.candidates.map((candidate, rankIdx) => {
                              const asset = mediaAssets.find((m) => m.id === candidate.mediaId);
                              const isAssetSelected = selectedMediaId === candidate.mediaId;

                              // Score color classification
                              const scorePercent = Math.round(candidate.score * 100);
                              const scoreColorClass =
                                candidate.score >= 0.55
                                  ? 'text-emerald-400 border-emerald-800/50 bg-emerald-950/60'
                                  : candidate.score >= 0.35
                                  ? 'text-blue-400 border-blue-800/50 bg-blue-950/60'
                                  : 'text-slate-400 border-slate-700 bg-slate-900/60';

                              return (
                                <div
                                  key={candidate.mediaId}
                                  onClick={() => onSelectMedia && onSelectMedia(candidate.mediaId)}
                                  className={`p-2 rounded bg-black/40 border transition-all cursor-pointer ${
                                    isAssetSelected
                                      ? 'border-blue-500 bg-blue-950/30'
                                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                                  }`}
                                  title="Click to highlight and inspect this media in the library (does not change timeline)"
                                >
                                  {/* Candidate Header */}
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[10px] font-mono text-purple-400 font-bold shrink-0">
                                        #{rankIdx + 1}
                                      </span>
                                      {asset?.type === 'video' ? (
                                        <Film className="w-3 h-3 text-blue-400 shrink-0" />
                                      ) : (
                                        <ImageIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                                      )}
                                      <span className="text-[11px] font-semibold text-slate-200 truncate" title={candidate.mediaName}>
                                        {candidate.mediaName}
                                      </span>
                                    </div>

                                    {/* Semantic Match Score */}
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-medium border ${scoreColorClass}`}
                                    >
                                      Semantic match: {candidate.score.toFixed(2)}
                                    </span>
                                  </div>

                                  {/* Grounded Explanation */}
                                  <p className="text-[10px] text-slate-400 italic leading-snug pl-4 border-l border-slate-800 mb-1.5">
                                    "{candidate.explanation}"
                                  </p>

                                  {/* Highlight / Select Action */}
                                  <div className="flex items-center justify-between text-[9px] text-slate-500 pl-4">
                                    <span>{scorePercent}% similarity score</span>
                                    <span className="flex items-center gap-0.5 text-blue-400 hover:underline">
                                      <span>Inspect media</span>
                                      <ArrowRight className="w-2.5 h-2.5" />
                                    </span>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Unanalyzed Media Notice if any */}
                            {segmentMatches.unavailableCount > 0 && (
                              <div className="text-[9px] text-slate-500 text-right pr-1">
                                <span>{segmentMatches.unavailableCount} unanalyzed media excluded</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-2.5 bg-slate-900/40 rounded border border-dashed border-editor-panelBorder text-center text-slate-500 text-[10px]">
                            {segmentMatches
                              ? 'No meaningful matches found for this segment.'
                              : 'Click "Find Matches" to rank supplied media for this segment.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
