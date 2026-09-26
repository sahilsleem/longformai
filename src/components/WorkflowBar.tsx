import React from 'react';
import {
  Film,
  Sparkles,
  Layers,
  Video,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { LongFormProject } from '../types/project';

export interface WorkflowBarProps {
  project: LongFormProject;
  isPreparing: boolean;
  preparationMessage?: string;
  onPrepareProject: () => void;
  onGenerateAIDraft?: () => void;
  isGeneratingDraft?: boolean;
  onOpenRenderModal: () => void;
  onSwitchTab?: (tab: 'media') => void;
}

export const WorkflowBar: React.FC<WorkflowBarProps> = ({
  project,
  isPreparing,
  preparationMessage,
  onPrepareProject,
  onGenerateAIDraft,
  isGeneratingDraft = false,
  onOpenRenderModal,
  onSwitchTab,
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
      <div className="flex items-center gap-1 sm:gap-2 shrink-0 py-0.5">
        {/* Step 1: Media */}
        <button
          onClick={() => onSwitchTab?.('media')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0 text-[11px] font-medium ${
            isMediaReady
              ? 'bg-blue-950/40 text-blue-300 border border-blue-800/40 hover:bg-blue-900/50'
              : 'bg-slate-900/40 text-slate-400 border border-slate-800 hover:bg-slate-800'
          }`}
          title={isMediaReady ? `${mediaCount} media asset(s)${voiceover ? ' + voiceover audio' : ''}` : 'Import video, images, or voiceover'}
        >
          {isMediaReady ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Film className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          <span>Media</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 2: Prepare Project */}
        {isPreparing ? (
          <div className="flex items-center gap-1.5 bg-blue-950/80 border border-blue-600/70 px-2.5 py-1 rounded text-blue-200 shrink-0 text-[11px] font-medium animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-[190px]">
              {preparationMessage || 'Analyzing...'}
            </span>
          </div>
        ) : isProjectPrepared ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 whitespace-nowrap shrink-0 text-[11px] font-medium"
            title="All media and voiceover are prepared and ready for drafting"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Analyzed</span>
          </div>
        ) : (
          <button
            onClick={onPrepareProject}
            disabled={!isMediaReady && !voiceover}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all whitespace-nowrap shrink-0 text-[11px] font-medium ${
              isMediaReady || voiceover
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                : 'bg-slate-900/40 text-slate-500 border border-slate-800 cursor-not-allowed'
            }`}
            title="Read audio & visuals to prepare for drafting"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Analyze Content</span>
          </button>
        )}

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 3: AI Draft */}
        {isDraftReady ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-950/40 text-purple-300 border border-purple-800/40 whitespace-nowrap shrink-0 text-[11px] font-medium"
            title={`${timelineClipCount} clips on timeline`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Draft Ready</span>
          </div>
        ) : isGeneratingDraft ? (
          <div className="flex items-center gap-1.5 bg-purple-950/60 border border-purple-800/60 px-2.5 py-1 rounded text-purple-300 shrink-0 text-[11px] font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
            <span>Drafting...</span>
          </div>
        ) : isProjectPrepared && onGenerateAIDraft ? (
          <button
            onClick={onGenerateAIDraft}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors whitespace-nowrap shrink-0 text-[11px] shadow-xs"
            title="Generate AI Draft timeline from prepared footage and voiceover"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Generate Draft</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/40 text-slate-500 border border-slate-800 whitespace-nowrap shrink-0 text-[11px] font-medium"
            title="Prepare project first to enable AI Draft generation"
          >
            <Layers className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>Draft</span>
          </div>
        )}

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 4: Frame */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap shrink-0 text-[11px] font-medium"
          title="Adjust clip framing directly in 16:9 preview (drag to pan, scroll/pinch to zoom)"
        >
          <span>Frame</span>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 5: Render */}
        <button
          onClick={onOpenRenderModal}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors whitespace-nowrap shrink-0 text-[11px] shadow-sm"
          title="Render Final 1920x1080 MP4 Video"
        >
          <Video className="w-3.5 h-3.5 shrink-0" />
          <span>Render</span>
        </button>
      </div>

    </div>
  );
};
