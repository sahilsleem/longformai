import React, { useRef, useState } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Clock,
  Maximize2,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { MediaAsset, VoiceoverTrack } from '../types/project';
import { formatSecondsToMinutes, formatTimecode } from '../engine/schema';

interface MediaPanelProps {
  mediaList: MediaAsset[];
  voiceover?: VoiceoverTrack;
  selectedMediaId?: string | null;
  unlinkedCount?: number;
  onOpenRelinkModal?: () => void;
  onSelectMedia?: (id: string | null) => void;
  onUpload: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onAddToTimeline: (mediaId: string) => void;
  onUploadVoiceover?: (file: File) => void;
  onRemoveVoiceover?: () => void;
  onAnalyzeMedia?: (id: string) => void;
}

export const MediaPanel: React.FC<MediaPanelProps> = ({
  mediaList,
  voiceover,
  selectedMediaId,
  unlinkedCount = 0,
  onOpenRelinkModal,
  onSelectMedia,
  onUpload,
  onRemove,
  onAddToTimeline,
  onUploadVoiceover,
  onRemoveVoiceover,
  onAnalyzeMedia,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceoverInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const firstFile = e.dataTransfer.files[0];
      if (firstFile.type.startsWith('audio/') && onUploadVoiceover) {
        onUploadVoiceover(firstFile);
      } else {
        onUpload(e.dataTransfer.files);
      }
    }
  };

  const getAspectRatioLabel = (asset: MediaAsset) => {
    return asset.aspectRatioLabel || `${asset.width}:${asset.height}`;
  };

  const isVoiceoverMissing = Boolean(
    voiceover && !voiceover.file && (!voiceover.url || voiceover.url.length === 0)
  );

  return (
    <div className="flex flex-col h-full bg-editor-panel w-full select-none overflow-hidden">
      {/* Hidden file pickers */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files && onUpload(e.target.files)}
        multiple
        accept="video/*,image/*,audio/*"
        className="hidden"
      />
      <input
        type="file"
        ref={voiceoverInputRef}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onUploadVoiceover) onUploadVoiceover(f);
          e.target.value = '';
        }}
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
        className="hidden"
      />

      {/* Relink Warning Banner if unlinked files exist */}
      {unlinkedCount > 0 && onOpenRelinkModal && (
        <div className="bg-amber-950/60 border-b border-amber-800/60 px-3 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-semibold">{unlinkedCount} missing file(s)</span>
          </div>
          <button
            onClick={onOpenRelinkModal}
            className="text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-black px-2 py-0.5 rounded shadow transition-colors"
          >
            Relink All
          </button>
        </div>
      )}

      {/* 1. Voiceover Audio Section */}
      <div className="p-3 border-b border-editor-panelBorder bg-editor-surface/30 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-semibold text-xs text-purple-300 uppercase tracking-wider">
              Voiceover Audio
            </span>
          </div>

          {voiceover && (
            <span className="text-[10px] font-mono bg-purple-950/70 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800/40">
              {formatTimecode(voiceover.duration)}
            </span>
          )}
        </div>

        {voiceover ? (
          <div
            className={`border rounded-lg p-2.5 flex items-center justify-between ${
              isVoiceoverMissing
                ? 'bg-amber-950/30 border-amber-800/50'
                : 'bg-purple-950/30 border-purple-800/40'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-8 h-8 rounded border flex items-center justify-center shrink-0 ${
                  isVoiceoverMissing
                    ? 'bg-amber-900/60 border-amber-700/50'
                    : 'bg-purple-900/60 border-purple-700/50'
                }`}
              >
                <Volume2
                  className={`w-4 h-4 ${isVoiceoverMissing ? 'text-amber-300' : 'text-purple-300'}`}
                />
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold truncate ${
                    isVoiceoverMissing ? 'text-amber-200' : 'text-purple-200'
                  }`}
                  title={voiceover.name}
                >
                  {voiceover.name}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-purple-400/80 mt-0.5 font-mono">
                  <span>{voiceover.format?.toUpperCase()}</span>
                  <span>•</span>
                  <span>{formatSecondsToMinutes(voiceover.duration)}</span>
                  {isVoiceoverMissing && (
                    <span className="text-amber-400 font-bold bg-amber-950 px-1 rounded">
                      Missing
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isVoiceoverMissing && (
                <button
                  onClick={() =>
                    onOpenRelinkModal ? onOpenRelinkModal() : voiceoverInputRef.current?.click()
                  }
                  className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold rounded shadow transition-colors"
                >
                  Relink
                </button>
              )}
              {onRemoveVoiceover && (
                <button
                  onClick={onRemoveVoiceover}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-editor-surface rounded transition-colors"
                  title="Remove Voiceover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            onClick={() => voiceoverInputRef.current?.click()}
            className="border border-dashed border-purple-500/30 hover:border-purple-400 rounded-lg p-2.5 flex items-center justify-center gap-2 text-center cursor-pointer bg-purple-950/15 hover:bg-purple-950/30 transition-colors"
          >
            <Upload className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="text-left">
              <p className="text-xs font-medium text-purple-200">Import Voiceover Audio</p>
              <p className="text-[10px] text-slate-400">MP3, WAV, M4A, AAC</p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Visual Media Library Header */}
      <div className="p-3 border-b border-editor-panelBorder flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider">
            Visual Media
          </span>
          <span className="bg-editor-surface text-slate-400 text-xs px-2 py-0.5 rounded font-mono">
            {mediaList.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {unlinkedCount > 0 && onOpenRelinkModal && (
            <button
              onClick={onOpenRelinkModal}
              className="px-2 py-1 text-[11px] font-medium bg-amber-950/80 hover:bg-amber-900 text-amber-300 rounded border border-amber-700/60 transition-colors"
              title="Relink missing media files"
            >
              Relink
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop zone / Media Items List */}
      <div
        className={`flex-1 overflow-y-auto p-3 space-y-2.5 transition-colors ${
          isDragging ? 'bg-blue-950/20 ring-2 ring-blue-500 ring-inset' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {mediaList.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="h-44 border-2 border-dashed border-editor-panelBorder hover:border-slate-500 rounded-lg flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors bg-editor-surface/30 hover:bg-editor-surface/60"
          >
            <Upload className="w-7 h-7 text-slate-500 mb-2" />
            <p className="text-xs font-medium text-slate-300">Drop videos or photos here</p>
            <p className="text-[11px] text-slate-500 mt-1">or click to browse local files</p>
            <span className="mt-2.5 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
              MP4, WebM, MOV, JPG, PNG, WebP
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {mediaList.map((asset) => {
              const ratioLabel = getAspectRatioLabel(asset);
              const isNative16x9 = ratioLabel === '16:9 Native';
              const isSelected = selectedMediaId === asset.id;
              const isAnalyzed = asset.analysis?.analyzed;
              const isMissing = !asset.file && (!asset.url || asset.url.length === 0);

              return (
                <div
                  key={asset.id}
                  onClick={() => onSelectMedia && onSelectMedia(asset.id)}
                  className={`group relative border rounded-lg p-2 flex gap-2.5 items-center transition-all shadow-sm cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950/40 border-blue-400 ring-1 ring-blue-500'
                      : isMissing
                      ? 'bg-amber-950/20 border-amber-800/40 hover:bg-amber-950/30'
                      : 'bg-editor-surface hover:bg-editor-surfaceHover border-editor-panelBorder'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-12 bg-black rounded overflow-hidden relative shrink-0 flex items-center justify-center border border-slate-700/50">
                    {isMissing ? (
                      <div className="flex flex-col items-center justify-center text-amber-400">
                        <span className="text-[10px] font-mono font-bold">MISSING</span>
                      </div>
                    ) : (
                      <>
                        {asset.type === 'image' && (
                          <img
                            src={asset.url}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                        {asset.type === 'video' && (
                          <video
                            src={asset.url}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                        )}
                        {asset.type === 'audio' && (
                          <Music className="w-6 h-6 text-purple-400" />
                        )}
                      </>
                    )}

                    {/* Media Type Badge */}
                    <div className="absolute bottom-0.5 right-0.5 bg-black/80 rounded p-0.5 text-[9px] text-slate-300">
                      {asset.type === 'video' && <VideoIcon className="w-2.5 h-2.5 text-blue-400" />}
                      {asset.type === 'image' && <ImageIcon className="w-2.5 h-2.5 text-emerald-400" />}
                      {asset.type === 'audio' && <Music className="w-2.5 h-2.5 text-purple-400" />}
                    </div>

                    {/* Analyzed badge */}
                    {isAnalyzed && (
                      <div
                        className="absolute top-0.5 left-0.5 bg-blue-600 rounded-full p-0.5"
                        title="Locally Analyzed"
                      >
                        <Sparkles className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Metadata Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isMissing ? 'text-amber-200' : 'text-slate-200'}`} title={asset.name}>
                      {asset.name}
                    </p>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                      {asset.duration !== undefined && asset.duration > 0 && (
                        <span className="flex items-center gap-0.5 font-mono">
                          <Clock className="w-2.5 h-2.5" />
                          {formatSecondsToMinutes(asset.duration)}
                        </span>
                      )}

                      {isMissing ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          Unlinked
                        </span>
                      ) : (
                        ratioLabel && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                              isNative16x9
                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                                : 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                            }`}
                          >
                            {ratioLabel}
                          </span>
                        )
                      )}
                    </div>

                    {asset.width && asset.height && (
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                        <Maximize2 className="w-2.5 h-2.5" />
                        {asset.width} × {asset.height}
                      </div>
                    )}
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isMissing ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRelinkModal?.();
                        }}
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold rounded shadow transition-colors"
                        title="Relink this missing file"
                      >
                        Relink
                      </button>
                    ) : (
                      <>
                        {onAnalyzeMedia && !isAnalyzed && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnalyzeMedia(asset.id);
                            }}
                            className="p-1.5 hover:bg-blue-600/20 text-slate-400 hover:text-blue-300 rounded transition-colors"
                            title="Analyze Keyframes & Features"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToTimeline(asset.id);
                          }}
                          className="p-1.5 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white rounded border border-blue-500/30 transition-colors"
                          title="Add to Timeline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(asset.id);
                      }}
                      className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
                      title="Delete from Media Library"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {mediaList.length > 0 && (
        <div className="p-2.5 border-t border-editor-panelBorder bg-editor-surface/30 text-center shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5"
          >
            <Upload className="w-3 h-3" />
            <span>Add more videos / photos</span>
          </button>
        </div>
      )}
    </div>
  );
};
