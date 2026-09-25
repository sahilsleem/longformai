import React from 'react';
import {
  Sliders,
  Crop,
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
import { TimelineItem, MediaAsset } from '../types/project';
import { TARGET_ASPECT_RATIO, calculatePanBounds, createDefaultTransform } from '../engine/schema';

interface CropInspectorProps {
  selectedItem: TimelineItem | null;
  selectedAsset: MediaAsset | null;
  onUpdateTransform: (itemId: string, updates: Partial<TimelineItem['transform']>) => void;
  onUpdateDuration: (itemId: string, duration: number) => void;
  onUpdateSourceStart: (itemId: string, sourceStart: number) => void;
}

export const CropInspector: React.FC<CropInspectorProps> = ({
  selectedItem,
  selectedAsset,
  onUpdateTransform,
  onUpdateDuration,
  onUpdateSourceStart,
}) => {
  if (!selectedItem || !selectedAsset) {
    return (
      <div className="w-full h-full bg-editor-panel p-4 sm:p-6 flex flex-col items-center justify-center text-center text-slate-500 select-none">
        <Sliders className="w-8 h-8 sm:w-9 sm:h-9 mb-2.5 opacity-30 text-slate-400" />
        <p className="text-xs font-semibold text-slate-300">No Clip Selected</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
          Select any visual clip on the timeline to preview and directly frame it on the 16:9 canvas.
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
            Framing & Shot Info
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
        {/* Direct In-Canvas Framing Hint */}
        <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-2.5 text-xs text-blue-200 flex items-start gap-2">
          <Crop className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-semibold block text-blue-300 mb-0.5">Direct 16:9 Canvas Framing</span>
            Drag footage with mouse or finger in the main preview to choose framing. Scroll or pinch to zoom.
          </div>
        </div>

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

        {/* Quick Alignment Shortcuts */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
            Quick Alignment
          </label>
          <div className="grid grid-cols-5 gap-1">
            <button
              onClick={() => setPresetPan(0, 0)}
              className="min-h-[40px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Center</span>
            </button>
            <button
              onClick={() => setPresetPan(0, bounds.maxY)}
              className="min-h-[40px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Top (Frame Upper Area)"
            >
              <ArrowUp className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Top</span>
            </button>
            <button
              onClick={() => setPresetPan(0, bounds.minY)}
              className="min-h-[40px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Bottom (Frame Lower Area)"
            >
              <ArrowDown className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Bottom</span>
            </button>
            <button
              onClick={() => setPresetPan(bounds.maxX, 0)}
              className="min-h-[40px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Left (Frame Left Area)"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Left</span>
            </button>
            <button
              onClick={() => setPresetPan(bounds.minX, 0)}
              className="min-h-[40px] sm:min-h-0 py-2 sm:py-1 rounded bg-editor-surface hover:bg-editor-surfaceHover active:bg-slate-700 border border-editor-panelBorder text-[10px] text-slate-300 flex flex-col items-center justify-center gap-0.5 touch-manipulation"
              title="Align Right (Frame Right Area)"
            >
              <ArrowRight className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-blue-400" />
              <span>Right</span>
            </button>
          </div>
        </div>

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
          </div>
        ) : (
          <div className="bg-editor-surface/40 rounded-lg p-2.5 border border-editor-panelBorder text-xs text-slate-400 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Manually Placed Timeline Clip</span>
          </div>
        )}

        <div className="h-[1px] bg-editor-panelBorder" />

        {/* Clip Duration & Trim Controls */}
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
