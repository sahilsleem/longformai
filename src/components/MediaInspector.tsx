import React from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
} from 'lucide-react';
import { MediaAsset } from '../types/project';
import { formatSecondsToMinutes } from '../engine/schema';

interface MediaInspectorProps {
  asset: MediaAsset | null;
  onAnalyze: (mediaId: string) => void;
  onAddToTimeline: (mediaId: string) => void;
}

export const MediaInspector: React.FC<MediaInspectorProps> = ({
  asset,
  onAnalyze,
  onAddToTimeline,
}) => {

  if (!asset) {
    return (
      <div className="w-full h-full bg-editor-panel p-6 flex flex-col items-center justify-center text-center text-slate-500 select-none">
        <Eye className="w-9 h-9 mb-2.5 opacity-30 text-slate-400" />
        <p className="text-xs font-semibold text-slate-300">No Media Selected</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-[210px] leading-relaxed">
          Click on any video or photo in the Media Library to inspect metadata, extract keyframes, and run local semantic analysis.
        </p>
      </div>
    );
  }

  const analysis = asset.analysis;
  const isAnalyzing = analysis?.analyzing || false;
  const isAnalyzed = analysis?.analyzed || false;
  const semantic = analysis?.semantic;



  return (
    <div className="w-full h-full bg-editor-panel flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-editor-panelBorder flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider truncate">
            Media Intelligence
          </span>
        </div>

        {/* Analyze Button */}
        <button
          onClick={() => onAnalyze(asset.id)}
          disabled={isAnalyzing}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded shadow-sm transition-all ${
            isAnalyzing
              ? 'bg-blue-950 text-blue-300 cursor-wait'
              : isAnalyzed
              ? 'bg-editor-surface hover:bg-editor-surfaceHover text-blue-300 border border-editor-panelBorder'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Analyzing visuals...</span>
            </>
          ) : isAnalyzed ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Re-Analyze</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              <span>Analyze</span>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Selected Asset Header Card */}
        <div className="bg-editor-surface rounded-lg p-3 border border-editor-panelBorder space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 truncate max-w-[170px]" title={asset.name}>
              {asset.name}
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {asset.type}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono pt-1 border-t border-editor-panelBorder/50">
            <div className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-500" />
              <span className="truncate">{asset.aspectRatioLabel}</span>
            </div>
            {asset.type === 'video' && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>{formatSecondsToMinutes(asset.duration)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 1. SEMANTIC ANALYSIS SECTION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
              Semantic Understanding
            </label>
            {semantic?.analyzed && semantic?.description ? (
              <span className="text-[9px] bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/40 font-mono">
                Visual analysis complete
              </span>
            ) : isAnalyzed && !semantic?.analyzed ? (
              <span className="text-[9px] bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/40 font-mono">
                Semantic analysis unavailable
              </span>
            ) : null}
          </div>

          {semantic?.analyzed && semantic?.description ? (
            <div className="bg-editor-surface rounded-lg p-3 border border-editor-panelBorder space-y-2.5">
              {/* Overall Scene Description */}
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                  Primary Scene Description
                </span>
                <p className="text-xs text-slate-100 leading-relaxed font-normal italic bg-slate-900/60 p-2 rounded border border-slate-800">
                  "{semantic.description}"
                </p>
              </div>

            </div>
          ) : (
            <div className="bg-editor-surface/40 border border-dashed border-editor-panelBorder rounded-lg p-3 text-center text-slate-500 text-[11px] space-y-1">
              <p className="text-slate-400 font-medium">
                {isAnalyzed ? 'Semantic analysis unavailable' : 'Visual concepts not generated yet'}
              </p>
              <p className="text-slate-500 text-[10px]">
                {isAnalyzed
                  ? analysis?.error || 'Local vision model could not infer scene concepts.'
                  : 'Click "Analyze" above to run the local vision model and extract scene interpretations.'}
              </p>
            </div>
          )}
        </div>

        {/* Error banner if any */}
        {analysis?.error && (
          <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/40 text-[10px] text-amber-300 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{analysis.error}</span>
          </div>
        )}

        {/* Add to Timeline Action */}
        <button
          onClick={() => onAddToTimeline(asset.id)}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold transition-colors shadow"
        >
          Add to Timeline
        </button>
      </div>
    </div>
  );
};
