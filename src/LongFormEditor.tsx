import React, { useState, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { PreviewCanvas } from './components/PreviewCanvas';
import { Timeline } from './components/Timeline';
import { RenderModal } from './components/RenderModal';
import { RelinkModal } from './components/RelinkModal';
import { useProject } from './state/useProjectStore';
import { Music, Plus, Sparkles, Loader2, Folder } from 'lucide-react';
import { pickAndroidMedia, pickAndroidVoiceover, isNativeAndroid } from './platform/androidMedia';
import { formatSecondsToMinutes } from './engine/schema';

const LongFormEditor: React.FC = () => {
  const {
    project,
    voiceover,
    isDirty,
    isHydrating,
    currentTime,
    isPlaying,
    timelineScale,
    totalDuration,
    effectiveTimelineItem,
    effectiveMediaAsset,
    isGeneratingDraft,
    isPreparing,
    preparationProgress,
    prepareProject,
    generateAIDraft,
    relinkSingleMediaAsset,
    relinkVoiceover,
    setTimelineScale,
    relinkMediaFiles,
    setSelectedItemId,
    setCurrentTime,
    setIsPlaying,
    setVoiceoverAudio,
    removeVoiceoverAudio,
    addMediaAssets,
    addNativeMediaAssets,
    addNativeVoiceover,
    addMediaToTimeline,
    removeTimelineItem,
    updateTimelineItem,
    replaceTimelineItemMedia,
    updateItemTransform,
    
    
    importProject,
    resetProject,
    setProjectName,
    folders,
    activeFolderId,
    setActiveFolderId,
    createFolder,
    deleteFolder,
    undo,
    redo,
    canUndo,
    canRedo,
    saveHistory,

  } = useProject();

  const [isRenderModalOpen, setIsRenderModalOpen] = useState(false);
  const [isRelinkModalOpen, setIsRelinkModalOpen] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [replaceModeItemId, setReplaceModeItemId] = useState<string | null>(null);
  const [folderPrompt, setFolderPrompt] = useState<{ isOpen: boolean; initialName?: string; onSubmit?: (name: string) => void }>({ isOpen: false });
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    let target = 0;
    if (isPreparing && preparationProgress) {
      target = preparationProgress.percent;
    } else if (isGeneratingDraft) {
      target = 99;
    }

    if (target > displayProgress) {
      const timer = setInterval(() => {
        setDisplayProgress(p => {
          if (p < target) return Math.min(target, p + 1);
          clearInterval(timer);
          return p;
        });
      }, 50);
      return () => clearInterval(timer);
    } else if (target === 0 && !isPreparing && !isGeneratingDraft) {
      setDisplayProgress(0);
    }
  }, [isPreparing, preparationProgress?.percent, isGeneratingDraft, displayProgress]);

  
  const footageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceoverInputRef = useRef<HTMLInputElement>(null);

  const unlinkedCount = project.media.filter((m) => !m.file && (!m.url || m.url.length === 0)).length + 
    (project.voiceover && !project.voiceover.file && (!project.voiceover.url || project.voiceover.url.length === 0) ? 1 : 0);

  const handleUploadNative = async (targetFolderId?: string) => {
    try {
      const assets = await pickAndroidMedia();
      if (assets.length > 0) await addNativeMediaAssets(assets, targetFolderId);
    } catch (e) { console.error(e); }
  };

  const handleUploadNativeVoiceover = async () => {
    try {
      const asset = await pickAndroidVoiceover();
      if (asset) await addNativeVoiceover(asset);
    } catch (e) { console.error(e); }
  };

  const handleBuildVideo = async () => {
    await prepareProject();
    await generateAIDraft();
  };

  const handleReplaceClip = (id: string) => {
    setSelectedItemId(id);
    setReplaceModeItemId(id);
    footageRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (isHydrating) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-editor-bg">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const canBuild = project.media.length > 0 && voiceover;
  const hasDraft = project.timeline.length > 0;

  return (
    <div className="min-h-screen bg-editor-bg text-slate-100 flex flex-col overflow-x-hidden overflow-y-auto">
      
      <Header
        project={project}
        currentTime={currentTime}
        totalDuration={totalDuration}
        isDirty={isDirty}
        onSetProjectName={setProjectName}
        onImportProject={importProject}
        onResetProject={resetProject}
        onOpenRenderModal={() => setIsRenderModalOpen(true)}
        unlinkedCount={unlinkedCount}
      />

      <main className="flex-1 flex flex-col w-full max-w-lg mx-auto bg-editor-bg shadow-2xl pb-24 min-h-[100vh]">
        
        {/* Video Window */}
        <div className="relative w-full aspect-video bg-black shrink-0 border-b border-editor-panelBorder">
          <PreviewCanvas
            activeItem={effectiveTimelineItem}
            activeAsset={effectiveMediaAsset}
            currentTime={currentTime}
            isPlaying={isPlaying}
            
            onSeek={setCurrentTime}
            totalDuration={totalDuration}
            onUpdateTransform={effectiveTimelineItem ? ((u) => updateItemTransform(effectiveTimelineItem.id, u)) : undefined}
          />
          {/* Build Overlay */}
          {(isGeneratingDraft || isPreparing) && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-300">
              <div className="relative mb-2">
                <Loader2 className="w-8 h-8 text-white animate-spin opacity-50 absolute inset-0 m-auto" />
                <Sparkles className="w-4 h-4 text-white absolute inset-0 m-auto animate-pulse" />
              </div>
              <h3 className="text-base font-bold tracking-tight mt-6 mb-1 drop-shadow-xl text-white">
                {isGeneratingDraft ? 'Preparing your edit' : 'Analysing assets'}
              </h3>
              <div className="flex items-center gap-2 text-white/90 bg-black/50 px-3 py-1 rounded-full mt-1 font-mono text-xs border border-white/20 shadow-lg backdrop-blur-sm">
                <div className="flex items-center gap-1 overflow-hidden">
                  <div className="truncate max-w-[120px]">
                    {isGeneratingDraft ? 'Applying AI edits' : preparationProgress?.message || 'Processing...'}
                  </div>
                </div>
                <div className="text-white font-bold text-sm ml-2">
                  {Math.round(displayProgress)}<span className="text-[10px] text-white/70">%</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Build My Video Overlay */}
          {!hasDraft && canBuild && !isGeneratingDraft && !isPreparing && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm z-20">
              <button 
                onClick={handleBuildVideo}
                className="bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold py-3 px-6 rounded-full flex items-center gap-2 shadow-xl hover:bg-white/20 active:scale-95 transition-all"
              >
                <Sparkles className="w-5 h-5 text-white" />
                Build my video
              </button>
            </div>
          )}
          {(isPreparing || isGeneratingDraft) && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 backdrop-blur-md transition-all duration-500 p-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full border-t-2 border-l-2 border-white animate-spin flex items-center justify-center bg-black/50 shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                      <Sparkles className="w-3 h-3 text-white animate-pulse" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="text-white text-sm font-bold tracking-widest shadow-sm">
                      Rendering your video
                    </div>
                    <div className="text-slate-400 text-[9px] uppercase tracking-[0.1em] font-medium">
                      {isPreparing ? 'Analyzing assets' : 'Syncing timeline'}
                    </div>
                  </div>
                  <div className="text-white font-bold text-lg font-mono ml-4">
                    {Math.round(displayProgress)}<span className="text-sm text-white/70">%</span>
                  </div>
                </div>
                <div className="w-full max-w-[200px] h-1 bg-white/10 rounded-full overflow-hidden shadow-inner mt-4">
                  <div 
                    className="h-full bg-white transition-all duration-300 ease-out shadow-[0_0_12px_rgba(255,255,255,1)]"
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
              </div>
            )}
        </div>

        {/* Timeline */}
        {hasDraft && (
          <div className="shrink-0 border-b border-editor-panelBorder">
            <Timeline
              timeline={project.timeline}
              mediaList={project.media}
              selectedItemId={effectiveTimelineItem?.id || null}
              currentTime={currentTime}
              totalDuration={totalDuration}
              timelineScale={timelineScale} isPlaying={isPlaying} onPlayPause={() => setIsPlaying(!isPlaying)} 
              onSelectClip={setSelectedItemId}
              onSeek={setCurrentTime}
              onRemoveClip={removeTimelineItem}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
              onReplaceClipMedia={handleReplaceClip}
              onUpdateDuration={(id, d) => updateTimelineItem(id, { duration: d })}
                onResizeStart={saveHistory}
              onZoom={setTimelineScale}
            />
          </div>
        )}

        {/* Padding container for content below */}
        <div className="p-4 space-y-6">
          
          {/* Voiceover Section */}
          <section>
            {voiceover ? (
              <div className="bg-editor-panel rounded-xl p-3 border border-editor-panelBorder flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200 truncate">{voiceover.name}</div>
                  <div className="text-xs text-slate-500">{formatSecondsToMinutes(voiceover.duration || 0)}</div>
                </div>
                <button 
                  onClick={removeVoiceoverAudio}
                  className="text-xs text-red-400 font-medium px-2 py-1 bg-red-400/10 rounded-md"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => isNativeAndroid() ? handleUploadNativeVoiceover() : voiceoverInputRef.current?.click()}
                className="w-full bg-editor-panel border border-dashed border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center text-slate-400 active:bg-slate-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-2">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Add voiceover</span>
              </button>
            )}
          </section>

          {/* Folders Section */}
          <section ref={footageRef}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-slate-400" />
                Folders <span className="text-slate-500 font-normal">({folders.length})</span>
              </h3>
              <button
                onClick={() => {
                  setFolderPrompt({ isOpen: true, initialName: '', onSubmit: (name) => { if (name.trim()) createFolder(name.trim()); } });
                  
                }}
                className="text-xs font-semibold text-white bg-white/10 px-3 py-1.5 rounded-full"
              >
                + New Folder
              </button>
            </div>
            
            <div className="space-y-4">
              {folders.map(folder => {
                const folderMedia = project.media.filter(m => m.folderIds?.includes(folder.id));
                return (
                  <div key={folder.id} className="bg-editor-panel border border-editor-panelBorder rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-editor-surface flex items-center justify-between border-b border-editor-panelBorder">
                      <span className="text-sm font-medium text-slate-300">{folder.name} <span className="text-slate-500 text-xs">({folderMedia.length})</span></span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => {
                          setConfirmDialog({ message: `Delete folder "${folder.name}"? Media will remain in project.`, onConfirm: () => { deleteFolder(folder.id); setConfirmDialog(null); } });
                        }} className="text-slate-500 hover:text-red-400 p-1 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <button
                          onClick={() => {
                            setActiveFolderId(folder.id);
                            isNativeAndroid() ? handleUploadNative(folder.id) : fileInputRef.current?.click();
                          }}
                          className="text-xs font-semibold text-blue-400 bg-blue-400/10 px-3 py-1.5 rounded-full hover:bg-blue-400/20 active:bg-blue-400/30 transition-colors"
                        >
                          + Add Media
                        </button>
                      </div>
                    </div>
                    <div className="p-2 grid grid-cols-3 gap-2">
                      {folderMedia.map(asset => (
                        <div 
                          key={asset.id} 
                          className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative active:scale-95 transition-transform shadow-md"
                          onClick={() => {
                            if (replaceModeItemId) {
                              replaceTimelineItemMedia(replaceModeItemId, asset.id); setReplaceModeItemId(null);
                            } else if (!hasDraft) {
                              addMediaToTimeline(asset.id);
                            }
                          }}
                        >
                          {asset.type === 'video' ? (
                            <video src={asset.url} className="w-full h-full object-cover" />
                          ) : (
                            <img src={asset.url} className="w-full h-full object-cover" />
                          )}
                          {(!asset.file && (!asset.url || asset.url.length === 0)) && (
                            <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center text-[10px] text-red-200 font-bold">MISSING</div>
                          )}
                        </div>
                      ))}
                      {folderMedia.length === 0 && (
                        <div className="col-span-3 py-8 text-center text-slate-500 text-xs">
                          Folder is empty
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Uncategorized Media */}
              {(() => {
                const uncategorized = project.media.filter(m => !m.folderIds || m.folderIds.length === 0);
                if (uncategorized.length === 0 && folders.length > 0) return null;
                return (
                  <div className="bg-editor-panel border border-editor-panelBorder rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-editor-surface flex items-center justify-between border-b border-editor-panelBorder">
                      <span className="text-sm font-medium text-slate-300">Uncategorized <span className="text-slate-500 text-xs">({uncategorized.length})</span></span>
                      <button
                        onClick={() => {
                          setActiveFolderId(null);
                          isNativeAndroid() ? handleUploadNative() : fileInputRef.current?.click();
                        }}
                        className="text-xs font-semibold text-blue-400 bg-blue-400/10 px-3 py-1.5 rounded-full hover:bg-blue-400/20 active:bg-blue-400/30 transition-colors"
                      >
                        + Add Media
                      </button>
                    </div>
                    <div className="p-2 grid grid-cols-3 gap-2">
                      {uncategorized.map(asset => (
                        <div 
                          key={asset.id} 
                          className="aspect-square bg-slate-900 rounded-lg overflow-hidden relative active:scale-95 transition-transform shadow-md"
                          onClick={() => {
                            if (replaceModeItemId) {
                              replaceTimelineItemMedia(replaceModeItemId, asset.id); setReplaceModeItemId(null);
                            } else if (!hasDraft) {
                              addMediaToTimeline(asset.id);
                            }
                          }}
                        >
                          {asset.type === 'video' ? (
                            <video src={asset.url} className="w-full h-full object-cover" />
                          ) : (
                            <img src={asset.url} className="w-full h-full object-cover" />
                          )}
                          {(!asset.file && (!asset.url || asset.url.length === 0)) && (
                            <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center text-[10px] text-red-200 font-bold">MISSING</div>
                          )}
                        </div>
                      ))}
                      {uncategorized.length === 0 && (
                        <div className="col-span-3 py-8 text-center text-slate-500 text-xs">
                          No uncategorized media
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>

          {/* Rebuild Video */}
          {hasDraft && (
            <section className="pt-8 pb-4">
              <button 
                onClick={handleBuildVideo}
                disabled={isGeneratingDraft || isPreparing}
                className="w-full py-4 bg-editor-panel border border-editor-panelBorder text-slate-300 rounded-xl font-semibold flex items-center justify-center gap-2 active:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-white" />
                {isPreparing || isGeneratingDraft ? 'Rebuilding...' : 'Rebuild video'}
              </button>
            </section>
          )}

        </div>
      </main>

      <RenderModal
        isOpen={isRenderModalOpen}
        onClose={() => setIsRenderModalOpen(false)}
        project={project}
        totalDuration={totalDuration}
        
        
        onRelink={() => setIsRelinkModalOpen(true)}
      />

      <RelinkModal
        isOpen={isRelinkModalOpen}
        onClose={() => setIsRelinkModalOpen(false)}
        project={project}
        onRelinkFiles={relinkMediaFiles}
        onRelinkSingleAsset={relinkSingleMediaAsset}
        onRelinkVoiceover={relinkVoiceover}
      />

      {confirmDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-editor-panel border border-editor-panelBorder rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-white">Confirm</h2>
            <p className="text-slate-300">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 text-slate-400 font-medium hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmDialog.onConfirm} className="px-6 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-400 transition-colors">Confirm</button>
            </div>
          </div>
        </div>
      )}
      {folderPrompt.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-editor-panel border border-editor-panelBorder rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-white">Folder Name</h2>
            <input 
              type="text"
              autoFocus
              className="bg-editor-bg border border-slate-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-white font-medium"
              placeholder="e.g. B-Roll"
              defaultValue={folderPrompt.initialName || ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = e.currentTarget.value;
                  setFolderPrompt({ isOpen: false });
                  if (folderPrompt.onSubmit) folderPrompt.onSubmit(val);
                } else if (e.key === 'Escape') {
                  setFolderPrompt({ isOpen: false });
                }
              }}
              id="folder-prompt-input"
            />
            <div className="flex justify-end gap-3 mt-2">
              <button 
                onClick={() => setFolderPrompt({ isOpen: false })}
                className="px-4 py-2 text-slate-400 font-medium hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const el = document.getElementById('folder-prompt-input') as HTMLInputElement;
                  setFolderPrompt({ isOpen: false });
                  if (folderPrompt.onSubmit) folderPrompt.onSubmit(el?.value || '');
                }}
                className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-slate-300 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden inputs */}
      <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files) addMediaAssets(e.target.files, activeFolderId || undefined); e.target.value = ''; }} multiple accept="video/*,image/*" className="hidden" />
      <input type="file" ref={voiceoverInputRef} onChange={(e) => { if (e.target.files?.[0]) setVoiceoverAudio(e.target.files[0]); e.target.value = ''; }} accept="audio/*" className="hidden" />
    </div>
  );
};

export default LongFormEditor;







