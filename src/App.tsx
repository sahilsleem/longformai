import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { WorkflowBar } from './components/WorkflowBar';
import { WorkerDiagnosticsModal } from './components/WorkerDiagnosticsModal';
import { RenderModal } from './components/RenderModal';
import { RelinkModal } from './components/RelinkModal';
import { MediaPanel } from './components/MediaPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { MediaInspector } from './components/MediaInspector';
import { Timeline } from './components/Timeline';
import { useProject } from './state/useProjectStore';
import { Film, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const {
    project,
    folders,
    activeFolderId,
    setActiveFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    assignMediaToFolder,
    removeMediaFromFolder,
    setMediaFolders,
    voiceover,
    isDirty,
    markSaved,
    isHydrating,
    isSavingLocal,
    lastSavedTime,
    selectedItemId,
    selectedMediaId,
    currentlyInspectedMedia,
    currentTime,
    isPlaying,
    timelineScale,
    totalDuration,
    effectiveTimelineItem,
    effectiveMediaAsset,
    selectedMediaAsset,
    isGeneratingDraft,
    draftStats,
    draftError,
    isPreparing,
    preparationProgress,
    prepareProject,
    relinkSingleMediaAsset,
    relinkVoiceover,
    relinkMediaFiles,
    setSelectedItemId,
    setSelectedMediaId,
    setCurrentTime,
    setIsPlaying,
    setTimelineScale,
    setVoiceoverAudio,
    removeVoiceoverAudio,
    analyzeMedia,
    generateAIDraft,
    clearTimeline,
    setVoiceoverVolume,
    toggleVoiceoverMute,
    addMediaAssets,
    removeMediaAsset,
    addMediaToTimeline,
    removeTimelineItem,
    updateTimelineItem,
    replaceTimelineItemMedia,
    updateItemTransform,
    reorderTimelineItems,
    isFrameEnabled,
    toggleProjectFrame,
    importProject,
    resetProject,
    setProjectName,
  } = useProject();

  const [isRenderModalOpen, setIsRenderModalOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isRelinkModalOpen, setIsRelinkModalOpen] = useState(false);
  const [activeWorkers, setActiveWorkers] = useState(4);

  // Calculate unlinked missing files count
  const unlinkedCount =
    project.media.filter((m) => !m.file && (!m.url || m.url.length === 0)).length +
    (project.voiceover && !project.voiceover.file && (!project.voiceover.url || project.voiceover.url.length === 0)
      ? 1
      : 0);

  // Auto-prompt relink modal when an imported project has unlinked media
  const handleImportWithRelinkCheck = (imported: typeof project) => {
    importProject(imported);
    const hasUnlinked =
      imported.media.some((m) => !m.file) || (imported.voiceover && !imported.voiceover.file);
    if (hasUnlinked) {
      setTimeout(() => setIsRelinkModalOpen(true), 300);
    }
  };

  // When user selects a timeline clip
  const handleSelectTimelineClip = (id: string | null) => {
    setSelectedItemId(id);
  };

  // When user clicks a media asset in the library, select it for inspection
  const handleSelectMediaAsset = (id: string | null) => {
    setSelectedMediaId(id);
  };

  // Keyboard Shortcuts (Space to play/pause, Delete to remove clip, Arrow keys to step)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedItemId) {
          e.preventDefault();
          removeTimelineItem(selectedItemId);
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const fps = project.fps || 30;
        const frameStep = e.shiftKey ? 1.0 : 1.0 / fps;
        setCurrentTime(Math.max(0, Math.round((currentTime - frameStep) * 1000) / 1000));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const fps = project.fps || 30;
        const frameStep = e.shiftKey ? 1.0 : 1.0 / fps;
        setCurrentTime(Math.min(totalDuration, Math.round((currentTime + frameStep) * 1000) / 1000));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, selectedItemId, currentTime, totalDuration, project.fps, removeTimelineItem, setCurrentTime, setIsPlaying]);

  if (isHydrating) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-editor-bg text-slate-200 select-none">
        <div className="flex items-center gap-2 bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 mb-4 animate-pulse">
          <Film className="w-4 h-4 text-blue-400" />
          <span className="font-bold text-sm tracking-wide text-white">LongFormAI</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <span>Restoring local project…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:h-screen w-full lg:overflow-hidden flex flex-col bg-editor-bg text-slate-100 max-w-full overflow-x-hidden overflow-y-auto lg:overflow-y-hidden">
      {/* 1. Top Header */}
      <Header
        project={project}
        currentTime={currentTime}
        totalDuration={totalDuration}
        isDirty={isDirty}
        isSavingLocal={isSavingLocal}
        lastSavedTime={lastSavedTime}
        onMarkSaved={markSaved}
        onSetProjectName={setProjectName}
        onImportProject={handleImportWithRelinkCheck}
        onResetProject={resetProject}
        onOpenRenderModal={() => setIsRenderModalOpen(true)}
        onOpenRelinkModal={() => setIsRelinkModalOpen(true)}
        unlinkedCount={unlinkedCount}
        isFrameEnabled={isFrameEnabled}
        onToggleFrame={toggleProjectFrame}
      />

      {/* 2. Workflow Progression Bar */}
      <WorkflowBar
        project={project}
        isPreparing={isPreparing}
        preparationMessage={preparationProgress?.message}
        preparationPercent={preparationProgress?.percent}
        onPrepareProject={prepareProject}
        onGenerateAIDraft={generateAIDraft}
        isGeneratingDraft={isGeneratingDraft}
        onOpenRenderModal={() => setIsRenderModalOpen(true)}
        onOpenWorkerDiagnostics={() => setIsWorkerModalOpen(true)}
        onSwitchTab={() => {
          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            const el = document.getElementById('mobile-section-media');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }}
        activeWorkersCount={activeWorkers}
        totalWorkersCount={4}
      />

      {/* 3A. DESKTOP WORKSPACE (>= 1024px): 3-Column Workstation Layout */}
      <div className="hidden lg:flex flex-1 overflow-hidden min-h-0">
        {/* Left Side: Dedicated Media Library Panel */}
        <div className="flex flex-col h-full bg-editor-panel border-r border-editor-panelBorder w-80 xl:w-84 shrink-0 overflow-hidden">
          <MediaPanel
            mediaList={project.media}
            folders={folders}
            activeFolderId={activeFolderId}
            voiceover={voiceover}
            selectedMediaId={selectedMediaId}
            unlinkedCount={unlinkedCount}
            onOpenRelinkModal={() => setIsRelinkModalOpen(true)}
            onSelectMedia={handleSelectMediaAsset}
            onUpload={addMediaAssets}
            onRemove={removeMediaAsset}
            onAddToTimeline={addMediaToTimeline}
            onUploadVoiceover={setVoiceoverAudio}
            onRemoveVoiceover={removeVoiceoverAudio}
            onAnalyzeMedia={analyzeMedia}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onAssignMediaToFolder={assignMediaToFolder}
            onRemoveMediaFromFolder={removeMediaFromFolder}
            onSetMediaFolders={setMediaFolders}
            onSetActiveFolderId={setActiveFolderId}
          />
        </div>

        {/* Center: 16:9 Canvas Viewport */}
        <PreviewCanvas
          activeItem={effectiveTimelineItem}
          activeAsset={effectiveMediaAsset}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onSeek={setCurrentTime}
          totalDuration={totalDuration}
          onUpdateTransform={
            effectiveTimelineItem
              ? (updates) => updateItemTransform(effectiveTimelineItem.id, updates)
              : undefined
          }
          frameEnabled={isFrameEnabled}
          frameSrc={project.frame?.src}
          onToggleFrame={toggleProjectFrame}
        />

        {/* Right Side: Dedicated Media Intelligence Inspector */}
        <div className="flex flex-col h-full bg-editor-panel border-l border-editor-panelBorder w-76 xl:w-80 shrink-0 overflow-hidden">
          <MediaInspector
            asset={currentlyInspectedMedia || selectedMediaAsset}
            onAnalyze={analyzeMedia}
            onAddToTimeline={addMediaToTimeline}
          />
        </div>
      </div>

      {/* 3B. MOBILE & TABLET WORKSPACE (< 1024px): Dominant Preview + Timeline First, Vertical Scroll Tools Below */}
      <div className="flex lg:hidden flex-col w-full min-h-0">
        {/* 1. DOMINANT PREVIEW VIEWPORT (Top Visual Focus) */}
        <div className="w-full h-[38vh] sm:h-[44vh] min-h-[220px] max-h-[380px] shrink-0 bg-slate-950 flex flex-col">
          <PreviewCanvas
            activeItem={effectiveTimelineItem}
            activeAsset={effectiveMediaAsset}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onSeek={setCurrentTime}
            totalDuration={totalDuration}
            onUpdateTransform={
              effectiveTimelineItem
                ? (updates) => updateItemTransform(effectiveTimelineItem.id, updates)
                : undefined
            }
            frameEnabled={isFrameEnabled}
            frameSrc={project.frame?.src}
            onToggleFrame={toggleProjectFrame}
          />
        </div>

        {/* 2. MOBILE TIMELINE (Directly Under Preview) */}
        <div className="w-full shrink-0 border-t border-b border-editor-panelBorder">
          <Timeline
            timeline={project.timeline}
            mediaList={project.media}
            voiceover={voiceover}
            selectedItemId={selectedItemId}
            currentTime={currentTime}
            totalDuration={totalDuration}
            timelineScale={timelineScale}
            isGeneratingDraft={isGeneratingDraft}
            draftStats={draftStats}
            draftError={draftError}
            onSelectClip={handleSelectTimelineClip}
            onSeek={setCurrentTime}
            onRemoveClip={removeTimelineItem}
            onReplaceClipMedia={replaceTimelineItemMedia}
            onUpdateDuration={(id, dur) => updateTimelineItem(id, { duration: dur })}
            onReorder={reorderTimelineItems}
            onSetTimelineScale={setTimelineScale}
            onGenerateAIDraft={generateAIDraft}
            onClearTimeline={clearTimeline}
            onUploadVoiceover={setVoiceoverAudio}
            onRemoveVoiceover={removeVoiceoverAudio}
            onSetVoiceoverVolume={setVoiceoverVolume}
            onToggleVoiceoverMute={toggleVoiceoverMute}
          />
        </div>

        {/* 3. QUICK NAVIGATION JUMP BAR */}
        <div className="sticky top-0 z-10 bg-editor-panel/95 backdrop-blur border-b border-editor-panelBorder flex items-center px-3 py-2 gap-2 overflow-x-auto scrollbar-none shrink-0 shadow-sm">
          <a
            href="#mobile-section-media"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('mobile-section-media')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-editor-surface hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-colors shrink-0"
          >
            <Film className="w-3.5 h-3.5 text-blue-400" />
            <span>Media ({project.media.length})</span>
          </a>

          <a
            href="#mobile-section-info"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('mobile-section-info')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-editor-surface hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Media Info</span>
          </a>
        </div>

        {/* 4. VERTICALLY SCROLLABLE TOOL PANELS (Normal Height, No Squeezing) */}
        <div className="flex flex-col gap-4 p-3 bg-editor-bg pb-20">
          {/* Section 1: Media Library */}
          <div id="mobile-section-media" className="bg-editor-panel border border-editor-panelBorder rounded-xl overflow-hidden shadow-sm">
            <div className="px-3.5 py-2.5 bg-editor-surface/60 border-b border-editor-panelBorder flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Media Library</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400 bg-editor-bg px-2 py-0.5 rounded border border-slate-700/50">
                {project.media.length} {project.media.length === 1 ? 'asset' : 'assets'}
              </span>
            </div>
            <div className="min-h-[360px]">
              <MediaPanel
                mediaList={project.media}
                folders={folders}
                activeFolderId={activeFolderId}
                voiceover={voiceover}
                selectedMediaId={selectedMediaId}
                unlinkedCount={unlinkedCount}
                onOpenRelinkModal={() => setIsRelinkModalOpen(true)}
                onSelectMedia={handleSelectMediaAsset}
                onUpload={addMediaAssets}
                onRemove={removeMediaAsset}
                onAddToTimeline={addMediaToTimeline}
                onUploadVoiceover={setVoiceoverAudio}
                onRemoveVoiceover={removeVoiceoverAudio}
                onAnalyzeMedia={analyzeMedia}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={deleteFolder}
                onAssignMediaToFolder={assignMediaToFolder}
                onRemoveMediaFromFolder={removeMediaFromFolder}
                onSetMediaFolders={setMediaFolders}
                onSetActiveFolderId={setActiveFolderId}
              />
            </div>
          </div>

          {/* Section 2: Media Info & Intelligence */}
          <div id="mobile-section-info" className="bg-editor-panel border border-editor-panelBorder rounded-xl overflow-hidden shadow-sm">
            <div className="px-3.5 py-2.5 bg-editor-surface/60 border-b border-editor-panelBorder flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Media Info & Intelligence</h3>
              </div>
              {currentlyInspectedMedia || selectedMediaAsset ? (
                <span className="text-[11px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40 truncate max-w-[150px]">
                  {(currentlyInspectedMedia || selectedMediaAsset)?.name}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Select media to view
                </span>
              )}
            </div>
            <div className="min-h-[260px]">
              <MediaInspector
                asset={currentlyInspectedMedia || selectedMediaAsset}
                onAnalyze={analyzeMedia}
                onAddToTimeline={addMediaToTimeline}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Desktop Bottom Timeline (Horizontally scrollable with local overflow) */}
      <div className="hidden lg:block shrink-0">
        <Timeline
          timeline={project.timeline}
          mediaList={project.media}
          voiceover={voiceover}
          selectedItemId={selectedItemId}
          currentTime={currentTime}
          totalDuration={totalDuration}
          timelineScale={timelineScale}
          isGeneratingDraft={isGeneratingDraft}
          draftStats={draftStats}
          draftError={draftError}
          onSelectClip={handleSelectTimelineClip}
          onSeek={setCurrentTime}
          onRemoveClip={removeTimelineItem}
          onReplaceClipMedia={replaceTimelineItemMedia}
          onUpdateDuration={(id, dur) => updateTimelineItem(id, { duration: dur })}
          onReorder={reorderTimelineItems}
          onSetTimelineScale={setTimelineScale}
          onGenerateAIDraft={generateAIDraft}
          onClearTimeline={clearTimeline}
          onUploadVoiceover={setVoiceoverAudio}
          onRemoveVoiceover={removeVoiceoverAudio}
          onSetVoiceoverVolume={setVoiceoverVolume}
          onToggleVoiceoverMute={toggleVoiceoverMute}
        />
      </div>

      {/* 5. Modals */}
      <RenderModal
        isOpen={isRenderModalOpen}
        onClose={() => setIsRenderModalOpen(false)}
        project={project}
        totalDuration={totalDuration}
      />

      <WorkerDiagnosticsModal
        isOpen={isWorkerModalOpen}
        onClose={() => setIsWorkerModalOpen(false)}
        onWorkersUpdated={(active) => setActiveWorkers(active)}
      />

      <RelinkModal
        isOpen={isRelinkModalOpen}
        onClose={() => setIsRelinkModalOpen(false)}
        project={project}
        onRelinkFiles={relinkMediaFiles}
        onRelinkSingleAsset={relinkSingleMediaAsset}
        onRelinkVoiceover={relinkVoiceover}
      />
    </div>
  );
};
export default App;
