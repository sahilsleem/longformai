import React from 'react';
import {
  Film,
  Sparkles,
  Layers,
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
  onGenerateAIDraft?: () => void;
  isGeneratingDraft?: boolean;
  onOpenRenderModal: () => void;
  onOpenWorkerDiagnostics: () => void;
  onSwitchTab?: (tab: 'media') => void;
  activeWorkersCount?: number;
  totalWorkersCount?: number;
}

export const WorkflowBar: React.FC<WorkflowBarProps> = ({
  project,
  isPreparing,
  preparationMessage,
  preparationPercent,
  onPrepareProject,
  onGenerateAIDraft,
  isGeneratingDraft = false,
  onOpenRenderModal,
  onOpenWorkerDiagnostics,
  onSwitchTab,
  activeWorkersCount = 4,
  totalWorkersCount = 4,
}) => {
  // Genuine ingredient & preparation states
  const mediaCount = project.media.length;
  const isMediaReady = mediaCount > 0;

  const voiceover = project.voiceover;
  const isVoiceoverTranscribed = Boolean(voiceover && voiceover.segments && voiceover.segments.length > 0);

  const analyzedMediaCount = project.media.filter((m) => m.analysis?.analyzed).length;
  const isMediaAnalyzed = isMediaReady && analyzedMediaCount === mediaCount;

  // Project is prepared when visual media is analyzed and voiceover (if present) is transcribed
  const isProjectPrepared = isMediaReady && isMediaAnalyzed && (!voiceover || isVoiceoverTranscribed);

  const timelineClipCount = project.timeline.length;
  const isDraftReady = timelineClipCount > 0;

  return (
    <div className="h-9 sm:h-9 bg-editor-surface/60 border-b border-editor-panelBorder px-2 sm:px-4 flex items-center justify-between text-xs select-none overflow-x-auto scrollbar-none gap-2 shrink-0">
      {/* Workflow Progression Strip: Media → Prepare → Draft → Framing → Render */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 py-0.5">
        {/* Step 1: Media */}
        <button
          onClick={() => onSwitchTab?.('media')}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 text-[11px] ${
            isMediaReady
              ? 'bg-blue-950/40 text-blue-300 border border-blue-800/40 hover:bg-blue-900/50'
              : 'bg-slate-900/40 text-slate-400 border border-slate-800 hover:bg-slate-800'
          }`}
          title={isMediaReady ? `${mediaCount} media asset(s)${voiceover ? ' + voiceover audio' : ''}` : 'Import video, images, or voiceover'}
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

        {/* Step 2: Prepare Project */}
        {isPreparing ? (
          <div className="flex items-center gap-1.5 bg-blue-950/80 border border-blue-600/70 px-2 py-0.5 rounded text-blue-200 shrink-0 text-[11px] animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400 shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-[190px] font-medium">
              {preparationMessage || 'Preparing...'}
            </span>
            {preparationPercent !== undefined && (
              <span className="font-mono text-[9px] bg-blue-900/90 px-1 rounded text-blue-200">
                {preparationPercent}%
              </span>
            )}
          </div>
        ) : isProjectPrepared ? (
          <div
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 whitespace-nowrap shrink-0 text-[11px]"
            title="All media and voiceover are prepared and ready for drafting"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="font-medium">2. Project Ready</span>
          </div>
        ) : (
          <button
            onClick={onPrepareProject}
            disabled={!isMediaReady && !voiceover}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded transition-all whitespace-nowrap shrink-0 text-[11px] font-medium ${
              isMediaReady || voiceover
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xs'
                : 'bg-slate-900/40 text-slate-500 border border-slate-800 cursor-not-allowed'
            }`}
            title="Prepare media and voiceover for AI drafting"
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>2. Prepare Project</span>
          </button>
        )}

        <span className="text-slate-600 text-[10px] shrink-0">→</span>

        {/* Step 3: AI Draft */}
        {isDraftReady ? (
          <div
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/40 whitespace-nowrap shrink-0 text-[11px]"
            title={`${timelineClipCount} clips on timeline`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="font-medium">3. Draft Ready</span>
            <span className="font-mono text-[10px] bg-purple-900/50 px-1 rounded text-purple-200">
              {timelineClipCount}
            </span>
          </div>
        ) : isGeneratingDraft ? (
          <div className="flex items-center gap-1.5 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded text-purple-300 shrink-0 text-[11px]">
            <Loader2 className="w-3 h-3 animate-spin text-purple-400 shrink-0" />
            <span>Drafting...</span>
          </div>
        ) : isProjectPrepared && onGenerateAIDraft ? (
          <button
            onClick={onGenerateAIDraft}
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors whitespace-nowrap shrink-0 text-[11px] shadow-xs"
            title="Generate AI Draft timeline from prepared footage and voiceover"
          >
            <Layers className="w-3 h-3 shrink-0" />
            <span>3. Generate Draft</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded bg-slate-900/40 text-slate-500 border border-slate-800 whitespace-nowrap shrink-0 text-[11px]"
            title="Prepare project first to enable AI Draft generation"
          >
            <Layers className="w-3 h-3 text-slate-600 shrink-0" />
            <span>3. Draft</span>
          </div>
        )}

        <span className="text-slate-600 text-[10px] shrink-0">→</span>

        {/* Step 4: Frame */}
        <div
          className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded bg-blue-950/30 text-blue-300 border border-blue-800/30 whitespace-nowrap shrink-0 text-[11px]"
          title="Adjust clip framing directly in 16:9 preview (drag to pan, scroll/pinch to zoom)"
        >
          <span className="font-medium">4. Frame</span>
        </div>

        <span className="text-slate-600 text-[10px] shrink-0">→</span>

        {/* Step 5: Render */}
        <button
          onClick={onOpenRenderModal}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors whitespace-nowrap shrink-0 text-[11px] shadow-xs"
          title="Render Final 1920x1080 MP4 Video"
        >
          <Video className="w-3 h-3 shrink-0" />
          <span className="font-semibold">5. Render</span>
        </button>
      </div>

      {/* Right Actions: System Diagnostics */}
      <div className="flex items-center gap-1.5 shrink-0 py-0.5">
        <button
          onClick={onOpenWorkerDiagnostics}
          className="p-1 rounded bg-editor-surface hover:bg-editor-surfaceHover border border-editor-panelBorder text-slate-400 hover:text-slate-200 transition-colors shrink-0 flex items-center gap-1 text-[11px]"
          title="System & Worker Diagnostics"
        >
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              activeWorkersCount === totalWorkersCount
                ? 'bg-emerald-400'
                : activeWorkersCount > 0
                ? 'bg-amber-400'
                : 'bg-rose-400'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
