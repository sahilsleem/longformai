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
  onOpenRenderModal: () => void;
  onOpenWorkerDiagnostics: () => void;
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
  onOpenRenderModal,
  onOpenWorkerDiagnostics,
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
    <div className="h-10 bg-editor-surface/80 border-b border-editor-panelBorder px-4 flex items-center justify-between text-xs select-none">
      {/* Workflow Stage Indicators */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
        {/* Step 1: Media */}
        <button
          onClick={() => onSwitchTab?.('media')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
            isMediaReady
              ? 'bg-blue-950/40 text-blue-300 border border-blue-800/40'
              : 'bg-slate-900/40 text-slate-400 border border-slate-800 hover:bg-slate-800'
          }`}
          title={isMediaReady ? `${mediaCount} media assets imported` : 'Import video and images to start'}
        >
          {isMediaReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <Film className="w-3 h-3 text-slate-500" />
          )}
          <span className="font-medium text-[11px]">1. Media</span>
          {mediaCount > 0 && (
            <span className="font-mono text-[10px] bg-blue-900/50 px-1 rounded text-blue-200">
              {mediaCount}
            </span>
          )}
        </button>

        <span className="text-slate-600">→</span>

        {/* Step 2: Transcript */}
        <button
          onClick={() => onSwitchTab?.('transcript')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
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
              ? 'Voiceover imported, needs transcription'
              : 'Import voiceover audio'
          }
        >
          {isTranscriptReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <FileText className="w-3 h-3 text-slate-500" />
          )}
          <span className="font-medium text-[11px]">2. Transcript</span>
          {segmentsCount > 0 && (
            <span className="font-mono text-[10px] bg-purple-900/50 px-1 rounded text-purple-200">
              {segmentsCount}
            </span>
          )}
        </button>

        <span className="text-slate-600">→</span>

        {/* Step 3: Visual Intelligence */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
            isAnalysisReady
              ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
              : analyzedMediaCount > 0
              ? 'bg-amber-950/40 text-amber-300 border border-amber-800/40'
              : 'bg-slate-900/40 text-slate-400 border border-slate-800'
          }`}
          title={`${analyzedMediaCount}/${mediaCount} media assets analyzed`}
        >
          {isAnalysisReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <Sparkles className="w-3 h-3 text-slate-500" />
          )}
          <span className="font-medium text-[11px]">3. Media Intelligence</span>
          {mediaCount > 0 && (
            <span className="font-mono text-[10px] bg-slate-800 px-1 rounded text-slate-300">
              {analyzedMediaCount}/{mediaCount}
            </span>
          )}
        </div>

        <span className="text-slate-600">→</span>

        {/* Step 4: AI Draft */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
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
              : 'Complete steps 1-3 first'
          }
        >
          {isDraftReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <Layers className="w-3 h-3 text-slate-500" />
          )}
          <span className="font-medium text-[11px]">4. AI Draft</span>
          {timelineClipCount > 0 && (
            <span className="font-mono text-[10px] bg-cyan-900/50 px-1 rounded text-cyan-200">
              {timelineClipCount}
            </span>
          )}
        </div>

        <span className="text-slate-600">→</span>

        {/* Step 5: Edit & Frame */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
            isDraftReady
              ? 'bg-indigo-950/40 text-indigo-300 border border-indigo-800/40'
              : 'bg-slate-900/40 text-slate-500 border border-slate-800'
          }`}
          title="Human framing & timing refinement"
        >
          <Crop className="w-3 h-3 text-slate-400" />
          <span className="font-medium text-[11px]">5. 16:9 Framing</span>
        </div>

        <span className="text-slate-600">→</span>

        {/* Step 6: Render */}
        <button
          onClick={onOpenRenderModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
          title="Open Master Video Render dialog"
        >
          <Video className="w-3 h-3 text-blue-400" />
          <span className="font-semibold text-[11px]">6. Render MP4</span>
        </button>
      </div>

      {/* Right Actions: One-Click Prepare & Worker Diagnostics */}
      <div className="flex items-center gap-2">
        {/* Preparation Progress / Action */}
        {isPreparing ? (
          <div className="flex items-center gap-2 bg-blue-950/60 border border-blue-800/60 px-3 py-1 rounded-md text-blue-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span className="text-[11px] font-medium truncate max-w-[220px]">
              {preparationMessage || 'Preparing project...'}
            </span>
            {preparationPercent !== undefined && (
              <span className="font-mono text-[10px] bg-blue-900/80 px-1.5 rounded">
                {preparationPercent}%
              </span>
            )}
          </div>
        ) : (
          <button
            onClick={onPrepareProject}
            disabled={!isMediaReady && !voiceover}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all shadow-sm ${
              !isAllIngredientsReady && (isMediaReady || voiceover)
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/40'
                : 'bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 border border-editor-panelBorder'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Automatically transcribe voiceover and analyze media in one click"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Prepare Project</span>
          </button>
        )}

        <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

        {/* Local Workers Diagnostic Button */}
        <button
          onClick={onOpenWorkerDiagnostics}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-editor-surface hover:bg-editor-surfaceHover border border-editor-panelBorder text-slate-300 text-xs transition-colors"
          title="View Local Worker Diagnostics (Whisper, BLIP, Matching, Render)"
        >
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-medium hidden sm:inline">Workers</span>
          <span
            className={`w-2 h-2 rounded-full ${
              activeWorkersCount === totalWorkersCount
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                : activeWorkersCount > 0
                ? 'bg-amber-400'
                : 'bg-rose-400'
            }`}
          />
          <span className="text-[10px] font-mono text-slate-400">
            {activeWorkersCount}/{totalWorkersCount}
          </span>
        </button>
      </div>
    </div>
  );
};
