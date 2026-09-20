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
import { Film, FileText, Crop, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const {
    project,
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
    }
  }, [isTranscribing]);

  // When user selects a timeline clip, show framing inspector
  const handleSelectTimelineClip = (id: string | null) => {
    setSelectedItemId(id);
    if (id) {
      setRightTab('framing');
    }
  };

  // When user clicks a media asset in the library, show media analysis inspector
  const handleSelectMediaAsset = (id: string | null) => {
    setSelectedMediaId(id);
    if (id) {
      setRightTab('analysis');
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
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-editor-bg text-slate-100">
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
        onOpenRenderModal={() => setIsRenderModalOpen(true)}
        onOpenWorkerDiagnostics={() => setIsWorkerModalOpen(true)}
        onSwitchTab={(tab) => setLeftTab(tab)}
        activeWorkersCount={activeWorkers}
        totalWorkersCount={4}
      />

      {/* 3. Middle Editor Workspace: Left (Media/Transcript), Center (16:9 Preview), Right (Framing/Analysis Inspector) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Tabbed Container for Media Panel & Transcript Panel */}
        <div className="flex flex-col h-full bg-editor-panel border-r border-editor-panelBorder w-84 shrink-0">
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
        <div className="flex flex-col h-full bg-editor-panel border-l border-editor-panelBorder w-80 shrink-0">
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

      {/* 3. Bottom Timeline */}
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

      {/* 4. Modals */}
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
