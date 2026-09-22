import React, { useRef, useState } from 'react';
import {
  Link2,
  AlertTriangle,
  CheckCircle2,
  Upload,
  X,
  FileVideo,
  FileImage,
  Music,
  HardDrive,
  Layers,
} from 'lucide-react';
import { LongFormProject, MediaAsset, TimelineItem, VoiceoverTrack } from '../types/project';
import { formatSecondsToMinutes } from '../engine/schema';

interface RelinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: LongFormProject;
  mediaList?: MediaAsset[];
  voiceover?: VoiceoverTrack;
  timeline?: TimelineItem[];
  onRelinkFiles: (files: FileList | File[]) => Promise<void> | void;
  onRelinkSingleAsset: (mediaId: string, file: File) => Promise<void> | void;
  onRelinkVoiceover: (file: File) => Promise<void> | void;
}

export const RelinkModal: React.FC<RelinkModalProps> = ({
  isOpen,
  onClose,
  project,
  mediaList,
  voiceover,
  timeline,
  onRelinkFiles,
  onRelinkSingleAsset,
  onRelinkVoiceover,
}) => {
  const effectiveMediaList = mediaList || project?.media || [];
  const effectiveVoiceover = voiceover !== undefined ? voiceover : project?.voiceover;
  const effectiveTimeline = timeline || project?.timeline || [];

  const batchInputRef = useRef<HTMLInputElement>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);
  const voiceoverInputRef = useRef<HTMLInputElement>(null);

  const [targetRelinkId, setTargetRelinkId] = useState<string | null>(null);
  const [relinkSuccessMsg, setRelinkSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Determine missing items (an asset is unlinked if it has no local File object and no valid blob url)
  const unlinkedMedia = effectiveMediaList.filter((m) => !m.file && (!m.url || m.url.length === 0));
  const isVoiceoverUnlinked = Boolean(
    effectiveVoiceover &&
      !effectiveVoiceover.file &&
      (!effectiveVoiceover.url || effectiveVoiceover.url.length === 0)
  );

  const totalUnlinkedCount = unlinkedMedia.length + (isVoiceoverUnlinked ? 1 : 0);

  const handleBatchSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onRelinkFiles(e.target.files);
      setRelinkSuccessMsg(`Processed ${e.target.files.length} candidate file(s) for relinking.`);
      setTimeout(() => setRelinkSuccessMsg(null), 3500);
      e.target.value = '';
    }
  };

  const handleSingleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && targetRelinkId) {
      onRelinkSingleAsset(targetRelinkId, file);
      setRelinkSuccessMsg(`Successfully relinked "${file.name}"!`);
      setTimeout(() => setRelinkSuccessMsg(null), 3000);
      setTargetRelinkId(null);
      e.target.value = '';
    }
  };

  const handleVoiceoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onRelinkVoiceover(file);
      setRelinkSuccessMsg(`Successfully relinked voiceover audio "${file.name}"!`);
      setTimeout(() => setRelinkSuccessMsg(null), 3000);
      e.target.value = '';
    }
  };

  const getClipUsages = (mediaId: string) => {
    return effectiveTimeline
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.mediaId === mediaId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh]">
        {/* Hidden inputs */}
        <input
          type="file"
          ref={batchInputRef}
          onChange={handleBatchSelect}
          multiple
          accept="video/*,image/*,audio/*"
          className="hidden"
        />
        <input
          type="file"
          ref={singleInputRef}
          onChange={handleSingleSelect}
          accept="video/*,image/*"
          className="hidden"
        />
        <input
          type="file"
          ref={voiceoverInputRef}
          onChange={handleVoiceoverSelect}
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
          className="hidden"
        />

        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-editor-panelBorder flex items-center justify-between bg-editor-surface/50 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-white truncate">Media Relinking Manager</h2>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                Restore local file references without losing timeline edits, framing, or transcripts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-editor-surface transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Status Alert */}
          {totalUnlinkedCount > 0 ? (
            <div className="p-3.5 bg-amber-950/40 border border-amber-800/40 rounded-lg flex items-start justify-between gap-3 text-xs text-amber-300">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-200">
                    {totalUnlinkedCount} Local Media File{totalUnlinkedCount === 1 ? '' : 's'} Unlinked
                  </span>
                  <p className="mt-0.5 text-amber-300/80 leading-relaxed">
                    This project was imported from portable JSON. Select your local folder or files to reconnect them.
                    All transcripts, clip timings, and 16:9 framing transforms will be preserved exactly.
                  </p>
                </div>
              </div>

              <button
                onClick={() => batchInputRef.current?.click()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium text-xs shrink-0 transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Locate Files</span>
              </button>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/40 rounded-lg flex items-center gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold text-emerald-200">All Project Media Successfully Linked</span>
                <p className="text-emerald-400/80 text-[11px] mt-0.5">
                  All {effectiveMediaList.length} media assets and voiceover track are ready in memory.
                </p>
              </div>
            </div>
          )}

          {relinkSuccessMsg && (
            <div className="p-2.5 bg-blue-950/60 border border-blue-700/50 rounded-lg text-xs text-blue-300 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              <span>{relinkSuccessMsg}</span>
            </div>
          )}

          {/* Voiceover Section */}
          {effectiveVoiceover && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-purple-400" />
                <span>Voiceover Track</span>
              </div>

              <div
                className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                  isVoiceoverUnlinked
                    ? 'bg-amber-950/20 border-amber-800/50'
                    : 'bg-editor-surface border-editor-panelBorder'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded bg-purple-900/50 border border-purple-700/50 flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4 text-purple-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white truncate" title={effectiveVoiceover.name}>
                        {effectiveVoiceover.name}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                          isVoiceoverUnlinked
                            ? 'bg-amber-900/60 text-amber-200 border border-amber-700/50'
                            : 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/50'
                        }`}
                      >
                        {isVoiceoverUnlinked ? 'File Missing' : 'Linked'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                      <span>{formatSecondsToMinutes(effectiveVoiceover.duration)}</span>
                      <span>•</span>
                      <span>{effectiveVoiceover.segments?.length || 0} transcript segments preserved</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => voiceoverInputRef.current?.click()}
                  className="px-2.5 py-1 text-[11px] font-medium bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded transition-colors"
                >
                  {isVoiceoverUnlinked ? 'Locate Audio' : 'Replace Audio'}
                </button>
              </div>
            </div>
          )}

          {/* Visual Media Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 uppercase tracking-wider">
                Visual Media Assets ({effectiveMediaList.length})
              </span>
              <button
                onClick={() => batchInputRef.current?.click()}
                className="text-blue-400 hover:text-blue-300 text-[11px] underline"
              >
                Batch Auto-Relink Files
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {effectiveMediaList.map((asset) => {
                const isUnlinked = !asset.file && (!asset.url || asset.url.length === 0);
                const usages = getClipUsages(asset.id);

                return (
                  <div
                    key={asset.id}
                    className={`p-2.5 rounded-lg border flex items-center justify-between text-xs gap-3 ${
                      isUnlinked
                        ? 'bg-amber-950/15 border-amber-800/40'
                        : 'bg-editor-surface border-editor-panelBorder'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-400">
                        {asset.type === 'video' ? (
                          <FileVideo className="w-4 h-4 text-blue-400" />
                        ) : (
                          <FileImage className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 truncate" title={asset.name}>
                            {asset.name}
                          </span>
                          <span
                            className={`text-[9px] font-medium px-1.5 py-0.2 rounded font-mono ${
                              isUnlinked
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {isUnlinked ? 'Missing' : 'Linked'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>
                            {asset.width}×{asset.height}
                          </span>
                          <span>•</span>
                          <span>{asset.aspectRatioLabel}</span>
                          {asset.duration > 0 && (
                            <>
                              <span>•</span>
                              <span>{formatSecondsToMinutes(asset.duration)}</span>
                            </>
                          )}
                          {usages.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-blue-300 flex items-center gap-0.5">
                                <Layers className="w-2.5 h-2.5" />
                                {usages.length} timeline {usages.length === 1 ? 'clip' : 'clips'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setTargetRelinkId(asset.id);
                        singleInputRef.current?.click();
                      }}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors shrink-0 ${
                        isUnlinked
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-editor-surfaceHover text-slate-300 hover:text-white border border-slate-700'
                      }`}
                    >
                      {isUnlinked ? 'Relink' : 'Replace'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-editor-panelBorder bg-editor-surface/30 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[10px] sm:text-[11px] text-slate-500 flex items-center gap-1.5 min-w-0">
            <HardDrive className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Files remain local in browser memory</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
