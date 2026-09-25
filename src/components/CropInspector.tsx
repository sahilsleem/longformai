import React from 'react';
import {
  Sliders,
  Crop,
  Move,
  ZoomIn,
  RotateCcw,
  Clock,
  Scissors,
  AlignCenter,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileText,
  User,
  Bot,
} from 'lucide-react';
import { TimelineItem, MediaAsset, FitMode } from '../types/project';
import { TARGET_ASPECT_RATIO, calculatePanBounds, createDefaultTransform } from '../engine/schema';

interface CropInspectorProps {
  selectedItem: TimelineItem | null;
  selectedAsset: MediaAsset | null;
  onUpdateTransform: (itemId: string, updates: Partial<TimelineItem['transform']>) => void;
  onUpdateDuration: (itemId: string, duration: number) => void;
  onUpdateSourceStart: (itemId: string, sourceStart: number) => void;
  onOpenFramingEditor?: () => void;
}

export const CropInspector: React.FC<CropInspectorProps> = ({
  selectedItem,
  selectedAsset,
  onUpdateTransform,
  onUpdateDuration,
  onUpdateSourceStart,
  onOpenFramingEditor,
}) => {
  if (!selectedItem || !selectedAsset) {
    return (
      <div className="w-full h-full bg-editor-panel p-4 sm:p-6 flex flex-col items-center justify-center text-center text-slate-500 select-none">
        <Sliders className="w-8 h-8 sm:w-9 sm:h-9 mb-2.5 opacity-30 text-slate-400" />
        <p className="text-xs font-semibold text-slate-300">No Clip Selected</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
          Select any media block on the timeline to inspect its AI draft intelligence and adjust its independent 16:9 framing.
        </p>
      </div>
    );
  }

  const transform = selectedItem.transform || createDefaultTransform(selectedAsset.width, selectedAsset.height);
  const sourceWidth = selectedAsset.width || 1920;
  const sourceHeight = selectedAsset.height || 1080;
  const sourceRatio = sourceWidth / sourceHeight;
  const isNative16x9 = Math.abs(sourceRatio - TARGET_ASPECT_RATIO) < 0.05;
  const prov = selectedItem.provenance;

  const bounds = calculatePanBounds(
    sourceWidth,
    sourceHeight,
    transform.scale || 1.0,
    transform.fitMode || 'cover'
  );

  const handleResetCrop = () => {
    onUpdateTransform(selectedItem.id, {
      x: 0,
      y: 0,
      scale: 1.0,
      fitMode: 'cover',
    });
  };

  const setPresetPan = (x: number, y: number) => {
    onUpdateTransform(selectedItem.id, {
      x: Math.round(Math.max(bounds.minX, Math.min(bounds.maxX, x)) * 10) / 10,
      y: Math.round(Math.max(bounds.minY, Math.min(bounds.maxY, y)) * 10) / 10,
    });
  };

  // Match confidence classification
  const getMatchLabel = (score: number) => {
    if (score >= 0.70) return { label: 'Strong Match', color: 'text-emerald-300 bg-emerald-950/60 border-emerald-800/40' };
    if (score >= 0.50) return { label: 'Moderate Match', color: 'text-blue-300 bg-blue-950/60 border-blue-800/40' };
    return { label: 'Fair Match', color: 'text-amber-300 bg-amber-950/60 border-amber-800/40' };
  };

  return (
    <div className="w-full h-full bg-editor-panel flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="p-2.5 sm:p-3 border-b border-editor-panelBorder flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Crop className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider truncate">
            Shot & Framing Inspector
          </span>
        </div>

        <button
          onClick={handleResetCrop}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 active:bg-slate-700 px-2.5 py-1 sm:py-0.5 rounded hover:bg-editor-surface transition-colors border border-slate-700/60 shrink-0 touch-manipulation min-h-[32px] sm:min-h-0"
          title="Reset framing to default centered cover"
        >
          <RotateCcw className="w-3 h-3 text-slate-400" />
          <span>Reset</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 sm:space-y-4">
        {/* AI Shot Intelligence Card (Step 14) */}
        {prov ? (
          <div className="bg-gradient-to-br from-purple-950/30 to-slate-900/60 rounded-lg p-2.5 sm:p-3 border border-purple-800/40 space-y-2 sm:space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-purple-200 uppercase tracking-wider flex items-center gap-1.5 truncate">
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">AI Shot Intelligence</span>
              </span>

              {prov.isManuallyEdited ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-950/80 text-blue-300 border border-blue-800/50 flex items-center gap-1 shrink-0">
                  <User className="w-2.5 h-2.5 text-blue-400" />
                  <span>Human Edited</span>
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-950/80 text-purple-300 border border-purple-800/50 flex items-center gap-1 shrink-0">
                  <Bot className="w-2.5 h-2.5 text-purple-400" />
                  <span>AI Proposal</span>
                </span>
              )}
            </div>

            {/* Transcript Quote */}
            {prov.sourceSegmentText && (
              <div className="bg-black/30 rounded p-2 border border-slate-800 space-y-1">
                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                  <FileText className="w-3 h-3 text-purple-400 shrink-0" />
                  <span>Narration Line:</span>
                </div>
                <p className="text-xs text-slate-200 italic line-clamp-3 break-words">
                  "{prov.sourceSegmentText}"
                </p>
              </div>
            )}

            {/* Match Metrics */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-editor-surface/60 rounded p-1.5 border border-editor-panelBorder min-w-0">
                <span className="text-[10px] text-slate-400 block truncate">Match Status:</span>
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border mt-0.5 truncate max-w-full ${getMatchLabel(prov.originalScore).color}`}>
                  {getMatchLabel(prov.originalScore).label}
                </span>
              </div>

              <div className="bg-editor-surface/60 rounded p-1.5 border border-editor-panelBorder min-w-0">
                <span className="text-[10px] text-slate-400 block truncate">Similarity Score:</span>
                <span className="font-mono text-xs text-slate-200 font-semibold mt-0.5 block truncate">
                  {prov.originalScore.toFixed(2)}
                  {prov.adjustedScore !== prov.originalScore && (
                    <span className="text-[10px] text-slate-400 font-normal ml-1">
                      (adj {prov.adjustedScore.toFixed(2)})
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Why explanation */}
            {prov.explanation && (
              <div className="text-[11px] text-slate-300 bg-editor-surface/40 p-2 rounded border border-editor-panelBorder/70 leading-relaxed break-words">
                <span className="text-slate-400 font-medium block text-[10px] mb-0.5">Why Selected:</span>
                {prov.explanation}
              </div>
            )}

            {/* Reuse, Continuity & Temporal Tags */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {prov.reuseCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/50 text-amber-300 border border-amber-800/40">
                  Reused media (Usage #{prov.reuseCount + 1})
                </span>
              )}
              {prov.narrationRole && prov.narrationRole !== 'unknown' && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950/60 text-rose-200 border border-rose-700/50 font-mono capitalize cursor-help"
                  title={prov.narrationRoleReason || `Role: ${prov.narrationRole}`}
                >
                  Role: {prov.narrationRole}
                </span>
              )}
              {prov.narrationBeatType && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] bg-violet-950/60 text-violet-200 border border-violet-700/50 font-mono cursor-help"
                  title={prov.beatReason || `Beat: ${prov.beatPosition || 1} / ${prov.beatLength || 1}`}
                >
                  Beat: {prov.beatPosition || 1}/{prov.beatLength || 1} ({prov.narrationBeatType === 'STANDALONE' ? 'Solo' : prov.narrationBeatType === 'NEW_BEAT' ? 'Start' : prov.narrationBeatType === 'CONTINUING_BEAT' ? 'Cont' : 'End'})
                </span>
              )}
              {prov.isConsecutiveContinuation && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-teal-950/60 text-teal-200 border border-teal-700/50 font-mono">
                  Same Source (Continuation)
                </span>
              )}
              {prov.continuityBonus && prov.continuityBonus > 0 && !prov.isConsecutiveContinuation && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/50 text-emerald-300 border border-emerald-800/40">
                  + Flow link
                </span>
              )}
              {prov.isKeyMoment && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950/60 text-purple-200 border border-purple-700/50 font-mono">
                  ★ Key Moment
                </span>
              )}
              {prov.hasVisualChange && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950/60 text-indigo-200 border border-indigo-700/50 font-mono">
                  Visual Shift
                </span>
              )}
              {prov.temporalCoverageCount && prov.temporalCoverageCount >= 2 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-950/60 text-blue-200 border border-blue-700/50 font-mono">
                  Multi-Frame ({prov.temporalCoverageCount} frames)
                </span>
              )}
              {typeof prov.selectedSourceTimestamp === 'number' && prov.selectedSourceTimestamp > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-200 border border-emerald-700/50 font-mono cursor-help"
                  title={prov.temporalSelectionReason || `AI started clip at ${prov.selectedSourceTimestamp.toFixed(1)}s`}
                >
                  Start @ {prov.selectedSourceTimestamp.toFixed(1)}s
                </span>
              )}
              {typeof prov.visualVarietyModifier === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help border ${
                    prov.visualVarietyModifier > 0
                      ? 'bg-amber-950/60 text-amber-200 border-amber-700/50'
                      : prov.visualVarietyModifier < 0
                      ? 'bg-orange-950/60 text-orange-200 border-orange-700/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title={prov.visualVarietyReason || `Visual Variety: ${prov.visualVarietyModifier.toFixed(3)} (Similarity: ${(prov.visualSimilarity || 0).toFixed(2)})`}
                >
                  Variety: {prov.visualVarietyModifier >= 0 ? '+' : ''}{prov.visualVarietyModifier.toFixed(3)} (Sim {(prov.visualSimilarity || 0).toFixed(2)})
                </span>
              )}
              {prov.pacingClass && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help border ${
                    prov.pacingClass === 'QUICK'
                      ? 'bg-fuchsia-950/60 text-fuchsia-200 border-fuchsia-700/50'
                      : prov.pacingClass === 'LINGERING'
                      ? 'bg-sky-950/60 text-sky-200 border-sky-700/50'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                  title={prov.pacingReason || `Pacing: ${prov.pacingClass} (${typeof prov.pacingModifier === 'number' ? (prov.pacingModifier >= 0 ? '+' : '') + prov.pacingModifier.toFixed(3) : ''})`}
                >
                  Pacing: {prov.pacingClass} {typeof prov.pacingModifier === 'number' ? `(${prov.pacingModifier >= 0 ? '+' : ''}${prov.pacingModifier.toFixed(3)})` : ''}
                </span>
              )}
              {typeof prov.pacingArcModifier === 'number' && Math.abs(prov.pacingArcModifier) > 0.0001 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help border ${
                    prov.pacingArcModifier > 0
                      ? 'bg-lime-950/60 text-lime-200 border-lime-700/50'
                      : 'bg-rose-950/60 text-rose-200 border-rose-700/50'
                  }`}
                  title={prov.pacingArcReason || `Pacing Arc: ${prov.pacingArcModifier >= 0 ? '+' : ''}${prov.pacingArcModifier.toFixed(3)}`}
                >
                  Arc: {prov.pacingArcModifier >= 0 ? '+' : ''}{prov.pacingArcModifier.toFixed(3)}
                </span>
              )}
              {typeof prov.visualImpactScore === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help border ${
                    prov.visualImpactScore >= 0.70
                      ? 'bg-amber-950/60 text-amber-200 border-amber-700/50'
                      : prov.visualImpactScore >= 0.40
                      ? 'bg-blue-950/60 text-blue-200 border-blue-700/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title={prov.emphasisImpactReason || `Visual Impact: ${prov.visualImpactScore >= 0.70 ? 'HIGH' : prov.visualImpactScore >= 0.40 ? 'MODERATE' : 'LOW'} (${prov.visualImpactScore.toFixed(2)})`}
                >
                  Impact: {prov.visualImpactScore >= 0.70 ? 'HIGH' : prov.visualImpactScore >= 0.40 ? 'MODERATE' : 'LOW'}
                </span>
              )}
              {typeof prov.narrationVisualContrastModifier === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help border ${
                    prov.narrationVisualContrastModifier > 0
                      ? 'bg-emerald-950/60 text-emerald-200 border-emerald-700/50'
                      : prov.narrationVisualContrastModifier < 0
                      ? 'bg-rose-950/60 text-rose-200 border-rose-700/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title={prov.narrationVisualContrastReason || `Contrast: ${prov.narrationVisualContrastModifier > 0 ? 'MATCH' : prov.narrationVisualContrastModifier < 0 ? 'MISMATCH' : 'NEUTRAL'} (${prov.visualState || 'STATIC'})`}
                >
                  Contrast: {prov.narrationVisualContrastModifier > 0 ? 'MATCH' : prov.narrationVisualContrastModifier < 0 ? 'MISMATCH' : 'NEUTRAL'}
                </span>
              )}
              {prov.subjectContinuity && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help border ${
                    prov.subjectContinuity === 'HIGH'
                      ? 'bg-cyan-950/60 text-cyan-200 border-cyan-700/50'
                      : prov.subjectContinuity === 'MODERATE'
                      ? 'bg-sky-950/60 text-sky-200 border-sky-700/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title={prov.subjectContinuityReason || `Subject Continuity: ${prov.subjectContinuity} (Match: ${((prov.subjectMatchScore ?? 0) * 100).toFixed(0)}%)`}
                >
                  Subject: {prov.subjectContinuity} {typeof prov.subjectMatchScore === 'number' ? `(${((prov.subjectMatchScore) * 100).toFixed(0)}%)` : ''}
                </span>
              )}
            </div>

            {/* AI Source Start & Duration Refinement Explanation */}
            {prov.temporalSelectionReason && (
              <div className="text-[10px] text-emerald-300/90 bg-emerald-950/20 px-2 py-1 rounded border border-emerald-800/30 italic break-words">
                {prov.temporalSelectionReason}
              </div>
            )}
            {prov.durationAdjustmentReason && prov.originalSegmentDuration && Math.abs(prov.originalSegmentDuration - (prov.selectedDuration || selectedItem.duration)) > 0.05 && (
              <div className="text-[10px] text-cyan-300/90 bg-cyan-950/20 px-2 py-1 rounded border border-cyan-800/30 italic break-words">
                {prov.durationAdjustmentReason}
              </div>
            )}
            {prov.continuityReason && (
              <div className="text-[10px] text-teal-300/90 bg-teal-950/20 px-2 py-1 rounded border border-teal-800/30 italic break-words">
                {prov.continuityReason}
              </div>
            )}
            {prov.narrationRoleReason && prov.narrationRole && prov.narrationRole !== 'unknown' && (
              <div className="text-[10px] text-rose-300/90 bg-rose-950/20 px-2 py-1 rounded border border-rose-800/30 italic break-words">
                {prov.narrationRoleReason}
              </div>
            )}
            {prov.beatReason && prov.narrationBeatType && (
              <div className="text-[10px] text-violet-300/90 bg-violet-950/20 px-2 py-1 rounded border border-violet-800/30 italic break-words">
                Beat {prov.beatPosition || 1}/{prov.beatLength || 1} ({prov.narrationBeatType === 'STANDALONE' ? 'Standalone beat' : prov.narrationBeatType === 'NEW_BEAT' ? 'New beat start' : prov.narrationBeatType === 'CONTINUING_BEAT' ? 'Continuing beat' : 'Beat conclusion'}): {prov.beatReason}
              </div>
            )}
            {prov.visualVarietyReason && (
              <div className="text-[10px] text-amber-300/90 bg-amber-950/20 px-2 py-1 rounded border border-amber-800/30 italic break-words">
                {prov.visualVarietyReason}
              </div>
            )}
            {prov.pacingReason && (
              <div className="text-[10px] text-fuchsia-300/90 bg-fuchsia-950/20 px-2 py-1 rounded border border-fuchsia-800/30 italic break-words">
                {prov.pacingReason}
              </div>
            )}
            {prov.pacingArcReason && (
              <div className="text-[10px] text-lime-300/90 bg-lime-950/20 px-2 py-1 rounded border border-lime-800/30 italic break-words">
                {prov.pacingArcReason}
              </div>
            )}
            {prov.emphasisImpactReason && (
              <div className="text-[10px] text-amber-300/90 bg-amber-950/20 px-2 py-1 rounded border border-amber-800/30 italic break-words">
                {prov.emphasisImpactReason}
              </div>
            )}
            {prov.narrationVisualContrastReason && (
              <div className="text-[10px] text-emerald-300/90 bg-emerald-950/20 px-2 py-1 rounded border border-emerald-800/30 italic break-words">
                {prov.narrationVisualContrastReason}
              </div>
            )}
            {prov.subjectContinuityReason && (
              <div className="text-[10px] text-cyan-300/90 bg-cyan-950/20 px-2 py-1 rounded border border-cyan-800/30 italic break-words">
                {prov.subjectContinuityReason}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-editor-surface/40 rounded-lg p-2.5 border border-editor-panelBorder text-xs text-slate-400 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Manually Placed Timeline Clip</span>
          </div>
        )}

        {/* Source Asset Info Card */}
        <div className="bg-editor-surface rounded-lg p-2.5 sm:p-3 border border-editor-panelBorder space-y-1">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-xs font-semibold text-slate-200 truncate flex-1 min-w-0" title={selectedAsset.name}>
              {selectedAsset.name}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-medium shrink-0 ${
                isNative16x9
                  ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-800/40'
                  : 'text-amber-300 bg-amber-950/60 border border-amber-800/40'
              }`}
            >
              {selectedAsset.aspectRatioLabel || `${sourceWidth}×${sourceHeight}`}
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center justify-between gap-1 pt-1">
            <span>Dimensions: {sourceWidth} × {sourceHeight}</span>
            <span>{selectedAsset.type.toUpperCase()}</span>
          </div>
        </div>

        {/* Direct Touch / Drag Framing Editor Action Button */}
        {onOpenFramingEditor && (
          <button
            onClick={onOpenFramingEditor}
            className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer border border-indigo-400/40"
            title="Open direct touch & drag framing editor"
          >
            <Crop className="w-4 h-4" />
            <span>Open Direct 16:9 Framing Editor</span>
          </button>
        )}

        {/* 1. Fit Mode Switcher */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
            Framing Mode
          </label>
          <div className="grid grid-cols-3 gap-1 bg-editor-surface p-1 rounded-lg border border-editor-panelBorder">
            {(['cover', 'contain', 'custom'] as FitMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onUpdateTransform(selectedItem.id, { fitMode: mode })}
                className={`min-h-[38px] sm:min-h-0 py-2 sm:py-1 text-xs font-medium rounded capitalize transition-colors touch-manipulation flex items-center justify-center ${
                  transform.fitMode === mode
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200 active:bg-slate-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 leading-normal">
            {transform.fitMode === 'cover'
              ? 'Fills the 16:9 canvas edge-to-edge. Aspect ratio preserved.'
              : transform.fitMode === 'contain'
              ? 'Shows entire source media with letterbox / pillarbox bars.'
              : 'Freeform custom framing and zoom.'}
          </p>
        </div>

        {/* 2. Quick Alignment & Presets */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
            Quick Alignment
          </label>
          <div className="grid grid-cols-5 gap-1">
            <button
              onClick={() => setPresetPan(0, 0)}
              className="min-h-[44px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Center</span>
            </button>
            <button
              onClick={() => setPresetPan(0, bounds.minY)}
              className="min-h-[44px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Top"
            >
              <ArrowUp className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Top</span>
            </button>
            <button
              onClick={() => setPresetPan(0, bounds.maxY)}
              className="min-h-[44px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Bottom"
            >
              <ArrowDown className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Bottom</span>
            </button>
            <button
              onClick={() => setPresetPan(bounds.minX, 0)}
              className="min-h-[44px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Left"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Left</span>
            </button>
            <button
              onClick={() => setPresetPan(bounds.maxX, 0)}
              className="min-h-[44px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Right"
            >
              <ArrowRight className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Right</span>
            </button>
          </div>
        </div>

        {/* 3. Pan Sliders */}
        <div className="space-y-3 bg-editor-surface/40 p-2.5 sm:p-3 rounded-lg border border-editor-panelBorder">
          {/* Horizontal Pan (X) Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-slate-400" />
                <span>Pan X</span>
              </span>
              <span className="font-mono text-blue-400 text-[11px]">{(transform.x || 0).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={Math.floor(bounds.minX)}
                max={Math.ceil(bounds.maxX)}
                step="0.5"
                value={transform.x || 0}
                onChange={(e) =>
                  onUpdateTransform(selectedItem.id, { x: parseFloat(e.target.value) })
                }
                className="flex-1 h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer touch-manipulation accent-blue-500"
              />
              <button
                onClick={() => onUpdateTransform(selectedItem.id, { x: 0 })}
                className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center text-[11px] sm:text-[9px] font-mono text-slate-400 hover:text-slate-200 active:bg-slate-700 px-2 sm:px-1 py-1 sm:py-0.5 rounded bg-editor-surface sm:bg-transparent border border-slate-700 sm:border-transparent touch-manipulation"
                title="Reset X"
              >
                0%
              </button>
            </div>
          </div>

          {/* Vertical Pan (Y) Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-slate-400 rotate-90" />
                <span>Pan Y</span>
              </span>
              <span className="font-mono text-blue-400 text-[11px]">{(transform.y || 0).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={Math.floor(bounds.minY)}
                max={Math.ceil(bounds.maxY)}
                step="0.5"
                value={transform.y || 0}
                onChange={(e) =>
                  onUpdateTransform(selectedItem.id, { y: parseFloat(e.target.value) })
                }
                className="flex-1 h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer touch-manipulation accent-blue-500"
              />
              <button
                onClick={() => onUpdateTransform(selectedItem.id, { y: 0 })}
                className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center text-[11px] sm:text-[9px] font-mono text-slate-400 hover:text-slate-200 active:bg-slate-700 px-2 sm:px-1 py-1 sm:py-0.5 rounded bg-editor-surface sm:bg-transparent border border-slate-700 sm:border-transparent touch-manipulation"
                title="Reset Y"
              >
                0%
              </button>
            </div>
          </div>
        </div>

        {/* 4. Zoom Scale & Presets */}
        <div className="space-y-2 bg-editor-surface/40 p-2.5 sm:p-3 rounded-lg border border-editor-panelBorder">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <ZoomIn className="w-3.5 h-3.5 text-slate-400" />
              <span>Zoom Scale</span>
            </span>
            <span className="font-mono text-blue-400 text-[11px]">{Math.round((transform.scale || 1.0) * 100)}%</span>
          </div>

          <input
            type="range"
            min="1.0"
            max="4.0"
            step="0.05"
            value={transform.scale || 1.0}
            onChange={(e) =>
              onUpdateTransform(selectedItem.id, { scale: parseFloat(e.target.value) })
            }
            className="w-full h-2 sm:h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer touch-manipulation accent-blue-500"
          />

          <div className="grid grid-cols-4 gap-1 pt-1">
            {[1.0, 1.25, 1.5, 2.0].map((presetScale) => (
              <button
                key={presetScale}
                onClick={() => onUpdateTransform(selectedItem.id, { scale: presetScale })}
                className={`min-h-[36px] sm:min-h-0 py-1.5 sm:py-0.5 rounded text-xs sm:text-[10px] font-mono transition-colors touch-manipulation flex items-center justify-center ${
                  Math.abs((transform.scale || 1.0) - presetScale) < 0.04
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300'
                }`}
              >
                {presetScale}x
              </button>
            ))}
          </div>
        </div>

        <div className="h-[1px] bg-editor-panelBorder" />

        {/* 6. Clip Duration & Trim Controls */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
            Timing & Source Trim
          </label>

          {/* Duration */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-300 gap-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Timeline Duration</span>
              </span>
              <span className="font-mono text-slate-400 text-xs">
                {selectedItem.duration.toFixed(1)}s
                {prov?.originalSegmentDuration && Math.abs(prov.originalSegmentDuration - selectedItem.duration) > 0.05 && (
                  <span className="text-[10px] text-cyan-400 ml-1">
                    (Narration: {prov.originalSegmentDuration.toFixed(1)}s)
                  </span>
                )}
              </span>
            </div>
            <input
              type="number"
              min="0.5"
              max="3600"
              step="0.5"
              value={selectedItem.duration}
              onChange={(e) =>
                onUpdateDuration(
                  selectedItem.id,
                  Math.max(0.5, parseFloat(e.target.value) || 1)
                )
              }
              className="w-full bg-editor-surface border border-editor-panelBorder rounded px-3 py-2 sm:py-1 text-sm sm:text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 min-h-[40px] sm:min-h-0"
            />
            {prov?.durationAdjustmentReason && prov.originalSegmentDuration && Math.abs(prov.originalSegmentDuration - selectedItem.duration) > 0.05 && (
              <p className="text-[10px] text-cyan-400/90 italic pt-0.5 break-words">
                {prov.durationAdjustmentReason}
              </p>
            )}
          </div>

          {/* Source Trim In-Point for Videos */}
          {selectedAsset.type === 'video' && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-300 gap-1">
                <span className="flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-slate-400" />
                  <span>Start Trim In-Point</span>
                </span>
                <span className="font-mono text-slate-400 text-xs">
                  {selectedItem.sourceStart.toFixed(1)}s
                </span>
              </div>
              <input
                type="number"
                min="0"
                max={Math.max(0, (selectedAsset.duration || 10) - 0.5)}
                step="0.5"
                value={selectedItem.sourceStart}
                onChange={(e) =>
                  onUpdateSourceStart(
                    selectedItem.id,
                    Math.max(0, parseFloat(e.target.value) || 0)
                  )
                }
                className="w-full bg-editor-surface border border-editor-panelBorder rounded px-3 py-2 sm:py-1 text-sm sm:text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 min-h-[40px] sm:min-h-0"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
