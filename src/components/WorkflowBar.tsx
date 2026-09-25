import React from 'react';
import {
  Film,
  FileText,
  Sparkles,
  Layers,
  Crop,
  Video,
  CheckCircle2,
  Loader2,
  Cpu,
} from 'lucide-react';
import { LongFormProject } from '../types/project';

export interface WorkflowBarProps {
  project: LongFormProject;
  isPreparing: boolean;
  preparationMessage?: string;
  preparationPercent?: number;
  onPrepareProject: () => void;
  onAnalyzeAllMedia?: () => void;
  onOpenRenderModal: () => void;
  onOpenWorkerDiagnostics: () => void;
  onOpenFramingEditor?: () => void;
  onSwitchTab?: (tab: 'media' | 'transcript') => void;
  activeWorkersCount?: number;
  totalWorkersCount?: number;
}

export const WorkflowBar: React.FC<WorkflowBarProps> = ({
  project,
  isPreparing,
  preparationMessage,
  preparationPercent,
  onPrepareProject,
  onAnalyzeAllMedia: _onAnalyzeAllMedia,
  onOpenRenderModal,
  onOpenWorkerDiagnostics,
  onOpenFramingEditor,
  onSwitchTab,
  activeWorkersCount = 4,
  totalWorkersCount = 4,
}) => {
  // Stage calculations based on genuine state (no fake completion)
  const mediaCount = project.media.length;
  const isMediaReady = mediaCount > 0;

  const voiceover = project.voiceover;
  const segmentsCount = voiceover?.segments?.length || 0;
  const isTranscriptReady = Boolean(voiceover && segmentsCount > 0);

  const analyzedMediaCount = project.media.filter((m) => m.analysis?.analyzed).length;
  const isAnalysisReady = isMediaReady && analyzedMediaCount === mediaCount;

  const timelineClipCount = project.timeline.length;
  const isDraftReady = timelineClipCount > 0;

  const isAllIngredientsReady = isMediaReady && isTranscriptReady && isAnalysisReady;

  return (
    <div className="h-9 sm:h-9 bg-editor-surface/60 border-b border-editor-panelBorder px-2 sm:px-4 flex items-center justify-between text-xs select-none overflow-x-auto scrollbar-none gap-2 shrink-0">
      {/* Workflow Progression Strip */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 py-0.5">
        {/* Step 1: Media */}
        <button
          onClick={() => onSwitchTab?.('media')}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 text-[11px] ${
            isMediaReady
              ? 'bg-blue-950/40 text-blue-300 border border-blue-800/40'
              : 'bg-slate-900/40 text-slate-400 border border-slate-800 hover:bg-slate-800'
          }`}
          title={isMediaReady ? `${mediaCount} media assets (${analyzedMediaCount} analyzed)` : 'Import video and images to start'}
        >
          {isMediaReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <Film className="w-3 h-3 text-slate-500 shrink-0" />
          )}
          <span className="font-medium">1. Media</span>
          {mediaCount > 0 && (
            <span className="font-mono text-[10px] bg-blue-900/50 px-1 rounded text-blue-200">
              {mediaCount}
            </span>
          )}
        </button>

        <span className="text-slate-600 text-[10px] shrink-0">→</span>

        {/* Step 2: Transcript */}
        <button
          onClick={() => onSwitchTab?.('transcript')}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 text-[11px] ${
            isTranscriptReady
              ? 'bg-purple-950/40 text-purple-300 border border-purple-800/40'
              : voiceover
              ? 'bg-amber-950/40 text-amber-300 border border-amber-800/40'
              : 'bg-slate-900/40 text-slate-400 border border-slate-800 hover:bg-slate-800'
          }`}
          title={
            isTranscriptReady
              ? `${segmentsCount} transcript segments generated`
              : voiceover
              ? 'Voiceover imported, ready for transcription'
              : 'Import voiceover audio'
          }
        >
          {isTranscriptReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
          )}
          <span className="font-medium">2. Transcript</span>
          {segmentsCount > 0 && (
            <span className="font-mono text-[10px] bg-purple-900/50 px-1 rounded text-purple-200">
              {segmentsCount}
            </span>
          )}
        </button>

        <span className="text-slate-600 text-[10px] shrink-0">→</span>

        {/* Step 3: AI Draft */}
        <div
          className={`flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded whitespace-nowrap shrink-0 text-[11px] ${
            isDraftReady
              ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800/40'
              : isAllIngredientsReady
              ? 'bg-slate-800 text-slate-300 border border-slate-700'
              : 'bg-slate-900/40 text-slate-500 border border-slate-800'
          }`}
          title={
            isDraftReady
              ? `${timelineClipCount} clips on timeline`
              : isAllIngredientsReady
              ? 'Ready to generate AI Draft'
              : 'Import media & transcript first'
          }
        >
          {isDraftReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <Layers className="w-3 h-3 text-slate-500 shrink-0" />
          )}
          <span className="font-medium">3. AI Draft</span>
          {timelineClipCount > 0 && (
            <span className="font-mono text-[10px] bg-cyan-900/50 px-1 rounded text-cyan-200">
              {timelineClipCount}
            </span>
          )}
        </div>

        <span className="text-slate-600 text-[10px] shrink-0">→</span>

        {/* Step 4: Framing */}
        <button
          onClick={onOpenFramingEditor}
          disabled={timelineClipCount === 0}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded whitespace-nowrap shrink-0 transition-colors text-[11px] ${
            timelineClipCount > 0
              ? 'bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-700/60 cursor-pointer shadow-xs active:bg-indigo-800'
              : 'bg-slate-900/40 text-slate-500 border border-slate-800 cursor-not-allowed'
          }`}
          title={
            timelineClipCount > 0
              ? 'Preview and adjust 16:9 Framing for selected footage'
              : 'Generate AI Draft or add clips to timeline first'
          }
        >
          <Crop className={`w-3 h-3 ${timelineClipCount > 0 ? 'text-indigo-400' : 'text-slate-500'} shrink-0`} />
          <span className="font-medium">4. Framing</span>
        </button>

        <span className="text-slate-600 text-[10px] shrink-0">→</span>

        {/* Step 5: Render */}
        <button
          onClick={onOpenRenderModal}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors whitespace-nowrap shrink-0 text-[11px]"
          title="Open Video Render dialog"
        >
          <Video className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="font-semibold">5. Render</span>
        </button>
      </div>

      {/* Right Actions: Auto Prepare & Worker Status */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 py-0.5">
        {/* Preparation Progress / Action */}
        {isPreparing ? (
          <div className="flex items-center gap-1.5 bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded text-blue-300 shrink-0 text-[11px]">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400 shrink-0" />
            <span className="truncate max-w-[100px] sm:max-w-[180px]">
              {preparationMessage || 'Preparing...'}
            </span>
            {preparationPercent !== undefined && (
              <span className="font-mono text-[9px] bg-blue-900/80 px-1 rounded">
                {preparationPercent}%
              </span>
            )}
          </div>
        ) : (
          <button
            onClick={onPrepareProject}
            disabled={!isMediaReady && !voiceover}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all shadow-xs shrink-0 ${
              !isAllIngredientsReady && (isMediaReady || voiceover)
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/40'
                : 'bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 border border-editor-panelBorder'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Automatically transcribe voiceover and analyze media in one click"
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Auto Prepare</span>
            <span className="sm:hidden">Prepare</span>
          </button>
        )}

        <div className="h-3.5 w-[1px] bg-slate-700/60 mx-0.5 shrink-0" />

        {/* Local Workers Diagnostic Button */}
        <button
          onClick={onOpenWorkerDiagnostics}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-editor-surface hover:bg-editor-surfaceHover border border-editor-panelBorder text-slate-400 text-[11px] transition-colors shrink-0"
          title="View Local Worker Diagnostics (Whisper, Vision, Matching, Render)"
        >
          <Cpu className="w-3 h-3 text-blue-400 shrink-0" />
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              activeWorkersCount === totalWorkersCount
                ? 'bg-emerald-400'
                : activeWorkersCount > 0
                ? 'bg-amber-400'
                : 'bg-rose-400'
            }`}
          />
          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
            {activeWorkersCount}/{totalWorkersCount}
          </span>
        </button>
      </div>
    </div>
  );
};
