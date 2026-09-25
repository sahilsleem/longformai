import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { WorkflowBar } from './components/WorkflowBar';
import { WorkerDiagnosticsModal } from './components/WorkerDiagnosticsModal';
import { RenderModal } from './components/RenderModal';
import { RelinkModal } from './components/RelinkModal';
import { MediaPanel } from './components/MediaPanel';
import { TranscriptPanel } from './components/TranscriptPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { CropInspector } from './components/CropInspector';
import { MediaInspector } from './components/MediaInspector';
import { Timeline } from './components/Timeline';
import { useProject } from './state/useProjectStore';
import { Film, FileText, Crop, Sparkles, Monitor } from 'lucide-react';

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
    selectedItemId,
    selectedMediaId,
    currentlyInspectedMedia,
    currentTime,
    isPlaying,
    timelineScale,
    totalDuration,
    effectiveTimelineItem,
    selectedTimelineItem,
    effectiveMediaAsset,
    selectedMediaAsset,
    isTranscribing,
    transcriptionError,
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
    transcribeVoiceover,
    updateTranscriptSegmentText,
    analyzeMedia,
    analyzeAllMedia,
    generateAIDraft,
    clearTimeline,
    setVoiceoverVolume,
    toggleVoiceoverMute,
    addMediaAssets,
    removeMediaAsset,
    addMediaToTimeline,
    removeTimelineItem,
    updateTimelineItem,
    updateItemTransform,
    reorderTimelineItems,
    importProject,
    resetProject,
    setProjectName,
  } = useProject();

  const [leftTab, setLeftTab] = useState<'media' | 'transcript'>('media');
  const [rightTab, setRightTab] = useState<'framing' | 'analysis'>('framing');
  const [mobileTab, setMobileTab] = useState<'media' | 'transcript' | 'framing' | 'analysis' | 'preview-only'>('media');
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

  // Auto-switch to transcript tab when transcribing
  useEffect(() => {
    if (isTranscribing) {
      setLeftTab('transcript');
      setMobileTab('transcript');
    }
  }, [isTranscribing]);

  // When user selects a timeline clip, show framing inspector
  const handleSelectTimelineClip = (id: string | null) => {
    setSelectedItemId(id);
    if (id) {
      setRightTab('framing');
      setMobileTab('framing');
    }
  };

  // When user clicks a media asset in the library, show media analysis inspector
  const handleSelectMediaAsset = (id: string | null) => {
    setSelectedMediaId(id);
    if (id) {
      setRightTab('analysis');
      setMobileTab('analysis');
    }
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

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-editor-bg text-slate-100 max-w-full">
      {/* 1. Top Header */}
      <Header
        project={project}
        currentTime={currentTime}
        totalDuration={totalDuration}
        isDirty={isDirty}
        onMarkSaved={markSaved}
        onSetProjectName={setProjectName}
        onImportProject={handleImportWithRelinkCheck}
        onResetProject={resetProject}
        onOpenRenderModal={() => setIsRenderModalOpen(true)}
        onOpenRelinkModal={() => setIsRelinkModalOpen(true)}
        unlinkedCount={unlinkedCount}
      />

      {/* 2. Step 10 Workflow Status & Action Bar */}
      <WorkflowBar
        project={project}
        isPreparing={isPreparing}
        preparationMessage={preparationProgress?.message}
        preparationPercent={preparationProgress?.percent}
        onPrepareProject={prepareProject}
        onAnalyzeAllMedia={async () => {
          setRightTab('analysis');
          setLeftTab('media');
          setMobileTab('analysis');
          await analyzeAllMedia();
        }}
        onOpenRenderModal={() => setIsRenderModalOpen(true)}
        onOpenWorkerDiagnostics={() => setIsWorkerModalOpen(true)}
        onSwitchTab={(tab) => {
          setLeftTab(tab);
          setMobileTab(tab);
        }}
        activeWorkersCount={activeWorkers}
        totalWorkersCount={4}
      />

      {/* 3A. DESKTOP WORKSPACE (>= 1024px): 3-Column Layout */}
      <div className="hidden lg:flex flex-1 overflow-hidden min-h-0">
        {/* Left Side: Tabbed Container for Media Panel & Transcript Panel */}
        <div className="flex flex-col h-full bg-editor-panel border-r border-editor-panelBorder w-80 xl:w-84 shrink-0 overflow-hidden">
          {/* Left Tab Buttons */}
          <div className="h-10 bg-editor-panel border-b border-editor-panelBorder flex items-center px-2 gap-1 shrink-0">
            <button
              onClick={() => setLeftTab('media')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                leftTab === 'media'
                  ? 'bg-editor-surface text-blue-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-editor-surface/50'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Media Library</span>
              {project.media.length > 0 && (
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 rounded font-mono">
                  {project.media.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setLeftTab('transcript')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                leftTab === 'transcript'
                  ? 'bg-editor-surface text-purple-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-editor-surface/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Transcript</span>
              {voiceover?.segments && voiceover.segments.length > 0 && (
                <span className="text-[10px] bg-purple-950/70 text-purple-300 px-1.5 rounded font-mono border border-purple-800/40">
                  {voiceover.segments.length}
                </span>
              )}
            </button>
          </div>

          {/* Left Tab Content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === 'media' ? (
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
            ) : (
              <TranscriptPanel
                voiceover={voiceover}
                mediaAssets={project.media}
                timeline={project.timeline}
                selectedTimelineItemId={selectedItemId}
                selectedMediaId={selectedMediaId}
                unassignedReasons={draftStats?.unassignedReasons}
                onSelectMedia={handleSelectMediaAsset}
                onSelectTimelineItem={handleSelectTimelineClip}
                currentTime={currentTime}
                onSeek={setCurrentTime}
                onTranscribe={transcribeVoiceover}
                onUpdateSegmentText={updateTranscriptSegmentText}
                isTranscribing={isTranscribing}
                transcriptionError={transcriptionError}
              />
            )}
          </div>
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
        />

        {/* Right Side: Tabbed Container for 16:9 Framing Inspector & Media Intelligence Inspector */}
        <div className="flex flex-col h-full bg-editor-panel border-l border-editor-panelBorder w-76 xl:w-80 shrink-0 overflow-hidden">
          {/* Right Tab Buttons */}
          <div className="h-10 bg-editor-panel border-b border-editor-panelBorder flex items-center px-2 gap-1 shrink-0">
            <button
              onClick={() => setRightTab('framing')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rightTab === 'framing'
                  ? 'bg-editor-surface text-blue-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-editor-surface/50'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>16:9 Crop</span>
            </button>

            <button
              onClick={() => setRightTab('analysis')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                rightTab === 'analysis'
                  ? 'bg-editor-surface text-blue-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-editor-surface/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Media Info</span>
            </button>
          </div>

          {/* Right Tab Content */}
          <div className="flex-1 overflow-hidden">
            {rightTab === 'framing' ? (
              <CropInspector
                selectedItem={selectedTimelineItem}
                selectedAsset={selectedMediaAsset}
                onUpdateTransform={updateItemTransform}
                onUpdateDuration={(id, dur) => updateTimelineItem(id, { duration: dur })}
                onUpdateSourceStart={(id, srcStart) =>
                  updateTimelineItem(id, { sourceStart: srcStart })
                }
              />
            ) : (
              <MediaInspector
                asset={currentlyInspectedMedia || selectedMediaAsset}
                onAnalyze={analyzeMedia}
                onAddToTimeline={addMediaToTimeline}
              />
            )}
          </div>
        </div>
      </div>

      {/* 3B. MOBILE & TABLET WORKSPACE (< 1024px): Single-Column Layout */}
      <div className="flex lg:hidden flex-col flex-1 overflow-hidden min-h-0">
        {/* Mobile Section / Panel Tab Switcher */}
        <div className="h-10 bg-editor-panel border-b border-editor-panelBorder flex items-center px-2 gap-1 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setMobileTab('media')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mobileTab === 'media'
                ? 'bg-editor-surface text-blue-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Media</span>
            {project.media.length > 0 && (
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1 rounded font-mono">
                {project.media.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setMobileTab('transcript')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mobileTab === 'transcript'
                ? 'bg-editor-surface text-purple-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Transcript</span>
            {voiceover?.segments && voiceover.segments.length > 0 && (
              <span className="text-[10px] bg-purple-950 text-purple-300 px-1 rounded font-mono">
                {voiceover.segments.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setMobileTab('framing')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mobileTab === 'framing'
                ? 'bg-editor-surface text-blue-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>16:9 Crop</span>
          </button>

          <button
            onClick={() => setMobileTab('analysis')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mobileTab === 'analysis'
                ? 'bg-editor-surface text-blue-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Media Info</span>
          </button>

          <button
            onClick={() => setMobileTab(mobileTab === 'preview-only' ? 'media' : 'preview-only')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ml-auto ${
              mobileTab === 'preview-only'
                ? 'bg-blue-600/30 text-blue-300 font-semibold shadow-sm border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title={mobileTab === 'preview-only' ? 'Restore panels' : 'Maximize preview viewport'}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>{mobileTab === 'preview-only' ? 'Show Panels' : 'Full Preview'}</span>
          </button>
        </div>

        {/* TOP: Current Working Panel (Media, Transcript, Crop, or Media Info) */}
        {mobileTab !== 'preview-only' && (
          <div className="h-52 sm:h-64 border-b border-editor-panelBorder overflow-hidden shrink-0 flex flex-col bg-editor-panel">
            {mobileTab === 'media' && (
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
            )}
            {mobileTab === 'transcript' && (
              <TranscriptPanel
                voiceover={voiceover}
                mediaAssets={project.media}
                timeline={project.timeline}
                selectedTimelineItemId={selectedItemId}
                selectedMediaId={selectedMediaId}
                unassignedReasons={draftStats?.unassignedReasons}
                onSelectMedia={handleSelectMediaAsset}
                onSelectTimelineItem={handleSelectTimelineClip}
                currentTime={currentTime}
                onSeek={setCurrentTime}
                onTranscribe={transcribeVoiceover}
                onUpdateSegmentText={updateTranscriptSegmentText}
                isTranscribing={isTranscribing}
                transcriptionError={transcriptionError}
              />
            )}
            {mobileTab === 'framing' && (
              <CropInspector
                selectedItem={selectedTimelineItem}
                selectedAsset={selectedMediaAsset}
                onUpdateTransform={updateItemTransform}
                onUpdateDuration={(id, dur) => updateTimelineItem(id, { duration: dur })}
                onUpdateSourceStart={(id, srcStart) =>
                  updateTimelineItem(id, { sourceStart: srcStart })
                }
              />
            )}
            {mobileTab === 'analysis' && (
              <MediaInspector
                asset={currentlyInspectedMedia || selectedMediaAsset}
                onAnalyze={analyzeMedia}
                onAddToTimeline={addMediaToTimeline}
              />
            )}
          </div>
        )}

        {/* MIDDLE: 16:9 Preview Viewport */}
        <div className="flex-1 min-h-[160px] overflow-hidden flex flex-col">
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
          />
        </div>
      </div>

      {/* 4. Bottom Timeline (Horizontally scrollable with local overflow) */}
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
