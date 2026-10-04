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
    <div className="min-h-[44px] h-11 sm:h-10 bg-editor-surface/80 border-b border-editor-panelBorder px-2.5 sm:px-4 flex items-center justify-between text-xs select-none overflow-x-auto scrollbar-none gap-2 shrink-0">
      {/* Workflow Progression Strip: 1. Media → 2. Analyze → 3. Draft → 4. Frame → 5. Render */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 py-1">
        {/* Step 1: Media */}
        <button
          onClick={() => onSwitchTab?.('media')}
          className={`flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 text-xs font-medium ${
            isMediaReady
              ? 'bg-blue-950/50 text-blue-300 border border-blue-700/50 hover:bg-blue-900/60 active:scale-98'
              : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:bg-slate-800 active:scale-98'
          }`}
          title={isMediaReady ? `${mediaCount} media asset(s)${voiceover ? ' + voiceover audio' : ''}` : 'Import video, images, or voiceover'}
        >
          {isMediaReady ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Film className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          <span>1. Media</span>
          {isMediaReady && (
            <span className="ml-0.5 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-900/70 text-blue-200 border border-blue-700/50">
              {mediaCount}
            </span>
          )}
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 2: Prepare Project / Analyze */}
        {isPreparing ? (
          <div className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] bg-blue-950/90 border border-blue-500/80 px-3 py-1.5 rounded-md text-blue-200 shrink-0 text-xs font-medium animate-pulse shadow-sm shadow-blue-950">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
            <span className="truncate max-w-[140px] sm:max-w-[210px]">
              {preparationMessage || 'Analyzing...'}
            </span>
          </div>
        ) : isProjectPrepared ? (
          <div
            className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3 py-1.5 rounded-md bg-emerald-950/50 text-emerald-300 border border-emerald-700/50 whitespace-nowrap shrink-0 text-xs font-medium"
            title="All media and voiceover are prepared and ready for drafting"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>2. Analyzed</span>
          </div>
        ) : (
          <button
            onClick={onPrepareProject}
            disabled={!isMediaReady && !voiceover}
            className={`flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3 py-1.5 rounded-md transition-all whitespace-nowrap shrink-0 text-xs font-medium ${
              isMediaReady || voiceover
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/40 active:scale-98'
                : 'bg-slate-900/60 text-slate-500 border border-slate-800 cursor-not-allowed'
            }`}
            title="Read audio & visuals to prepare for drafting"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>2. Analyze</span>
          </button>
        )}

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 3: AI Draft */}
        {isDraftReady ? (
          <div
            className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3 py-1.5 rounded-md bg-purple-950/50 text-purple-300 border border-purple-700/50 whitespace-nowrap shrink-0 text-xs font-medium"
            title={`${timelineClipCount} clips on timeline`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>3. Draft Ready</span>
            <span className="ml-0.5 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-purple-900/70 text-purple-200 border border-purple-700/50">
              {timelineClipCount}
            </span>
          </div>
        ) : isGeneratingDraft ? (
          <div className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] bg-purple-950/80 border border-purple-600/70 px-3 py-1.5 rounded-md text-purple-200 shrink-0 text-xs font-medium animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
            <span>Drafting...</span>
          </div>
        ) : isProjectPrepared && onGenerateAIDraft ? (
          <button
            onClick={onGenerateAIDraft}
            className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors whitespace-nowrap shrink-0 text-xs shadow-sm shadow-purple-900/40 active:scale-98"
            title="Generate AI Draft timeline from prepared footage and voiceover"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>3. Generate Draft</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3 py-1.5 rounded-md bg-slate-900/60 text-slate-500 border border-slate-800 whitespace-nowrap shrink-0 text-xs font-medium"
            title="Prepare project first to enable AI Draft generation"
          >
            <Layers className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>3. Draft</span>
          </div>
        )}

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 4: Frame */}
        <div
          className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3 py-1.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700 whitespace-nowrap shrink-0 text-xs font-medium"
          title="Adjust clip framing directly in 16:9 preview (drag to pan, scroll/pinch to zoom)"
        >
          <span>4. Frame</span>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

        {/* Step 5: Render */}
        <button
          onClick={onOpenRenderModal}
          className="flex items-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors whitespace-nowrap shrink-0 text-xs shadow-md shadow-blue-900/40 active:scale-98"
          title="Render Final 1920x1080 MP4 Video"
        >
          <Video className="w-3.5 h-3.5 shrink-0" />
          <span>5. Render</span>
        </button>
      </div>
    </div>
  );
};
