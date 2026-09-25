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
  Sparkles,
  Folder,
  FolderPlus,
  FolderMinus,
  ChevronLeft,
  Edit2,
  Check,
  X,
  Layers,
  CheckSquare,
  Square,
  Tag,
} from 'lucide-react';
import { MediaAsset, MediaFolder, VoiceoverTrack } from '../types/project';
import { formatSecondsToMinutes, formatTimecode } from '../engine/schema';
import {
  getMediaFolderNames,
  getAssetsInFolder,
  getUnassignedAssets,
} from '../engine/mediaFolders';

interface MediaPanelProps {
  mediaList: MediaAsset[];
  folders?: MediaFolder[];
  activeFolderId?: string | null;
  voiceover?: VoiceoverTrack;
  selectedMediaId?: string | null;
  unlinkedCount?: number;
  onOpenRelinkModal?: () => void;
  onSelectMedia?: (id: string | null) => void;
  onUpload: (files: FileList | File[], targetFolderId?: string) => void;
  onRemove: (id: string) => void;
  onAddToTimeline: (mediaId: string) => void;
  onUploadVoiceover?: (file: File) => void;
  onRemoveVoiceover?: () => void;
  onAnalyzeMedia?: (id: string) => void;
  onCreateFolder?: (name: string) => MediaFolder | void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onAssignMediaToFolder?: (mediaId: string, folderId: string) => void;
  onRemoveMediaFromFolder?: (mediaId: string, folderId: string) => void;
  onSetMediaFolders?: (mediaId: string, folderIds: string[]) => void;
  onSetActiveFolderId?: (folderId: string | null) => void;
}

export const MediaPanel: React.FC<MediaPanelProps> = ({
  mediaList,
  folders = [],
  activeFolderId = null,
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
  onAnalyzeMedia: _onAnalyzeMedia,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onAssignMediaToFolder,
  onRemoveMediaFromFolder,
  onSetMediaFolders,
  onSetActiveFolderId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceoverInputRef = useRef<HTMLInputElement>(null);
  const folderUploadInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Local folder navigation state fallback if not controlled
  const [localActiveFolderId, setLocalActiveFolderId] = useState<string | null>(null);
  const currentFolderId = onSetActiveFolderId ? activeFolderId : localActiveFolderId;
  const setCurrentFolderId = (id: string | null) => {
    if (onSetActiveFolderId) {
      onSetActiveFolderId(id);
    } else {
      setLocalActiveFolderId(id);
    }
  };

  // Folder creation & renaming state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');

  // Multi-select state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Modal / popover for assigning a clip to multiple folders
  const [assignModalMediaId, setAssignModalMediaId] = useState<string | null>(null);
  const [assignModalSelectedFolders, setAssignModalSelectedFolders] = useState<string[]>([]);
  const [quickNewFolderName, setQuickNewFolderName] = useState('');

  // Modal for adding existing library clips to current active folder
  const [isAddExistingModalOpen, setIsAddExistingModalOpen] = useState(false);
  const [existingSelectedIds, setExistingSelectedIds] = useState<Set<string>>(new Set());

  // View mode tab at root: 'folders' or 'all'
  const [rootViewTab, setRootViewTab] = useState<'folders' | 'all'>('folders');

  const currentFolder = folders.find((f) => f.id === currentFolderId);

  // Determine media assets to display
  const displayedMedia = currentFolderId
    ? getAssetsInFolder(mediaList, currentFolderId)
    : rootViewTab === 'folders'
    ? getUnassignedAssets(mediaList)
    : mediaList;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
    setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId?: string) => {
    e.preventDefault();
    setIsDragging(false);
    setDragOverFolderId(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const firstFile = e.dataTransfer.files[0];
      if (firstFile.type.startsWith('audio/') && onUploadVoiceover && !currentFolderId && !targetFolderId) {
        onUploadVoiceover(firstFile);
      } else {
        const destFolder = targetFolderId || currentFolderId || undefined;
        onUpload(e.dataTransfer.files, destFolder);
      }
    }
  };

  const getAspectRatioLabel = (asset: MediaAsset) => {
    return asset.aspectRatioLabel || `${asset.width}:${asset.height}`;
  };

  const isVoiceoverMissing = Boolean(
    voiceover && !voiceover.file && (!voiceover.url || voiceover.url.length === 0)
  );

  const handleCreateFolderSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    if (onCreateFolder) {
      onCreateFolder(trimmed);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleRenameFolderSubmit = (folderId: string) => {
    const trimmed = renameFolderName.trim();
    if (trimmed && onRenameFolder) {
      onRenameFolder(folderId, trimmed);
    }
    setRenamingFolderId(null);
    setRenameFolderName('');
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    const confirmed = window.confirm(
      `Delete folder "${folderName}"?\n\nNote: Media files will NOT be deleted from the project.`
    );
    if (confirmed && onDeleteFolder) {
      onDeleteFolder(folderId);
      if (currentFolderId === folderId) {
        setCurrentFolderId(null);
      }
    }
  };

  const toggleAssetSelection = (assetId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const selectAllDisplayed = () => {
    setSelectedAssetIds(new Set(displayedMedia.map((m) => m.id)));
  };

  const clearSelection = () => {
    setSelectedAssetIds(new Set());
  };

  const handleBulkRemoveFromCurrentFolder = () => {
    if (!currentFolderId || !onRemoveMediaFromFolder) return;
    for (const mediaId of selectedAssetIds) {
      onRemoveMediaFromFolder(mediaId, currentFolderId);
    }
    clearSelection();
  };

  const openAssignModal = (asset: MediaAsset, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAssignModalMediaId(asset.id);
    setAssignModalSelectedFolders(asset.folderIds || []);
    setQuickNewFolderName('');
  };

  const saveAssignModal = () => {
    if (assignModalMediaId && onSetMediaFolders) {
      onSetMediaFolders(assignModalMediaId, assignModalSelectedFolders);
    }
    setAssignModalMediaId(null);
  };

  const handleQuickCreateAndAssign = () => {
    const trimmed = quickNewFolderName.trim();
    if (!trimmed || !onCreateFolder) return;
    const created = onCreateFolder(trimmed);
    if (created && typeof created === 'object' && created.id) {
      setAssignModalSelectedFolders((prev) => [...prev, created.id]);
    }
    setQuickNewFolderName('');
  };

  const handleAddExistingToCurrentFolder = () => {
    if (!currentFolderId || !onAssignMediaToFolder) return;
    for (const id of existingSelectedIds) {
      onAssignMediaToFolder(id, currentFolderId);
    }
    setIsAddExistingModalOpen(false);
    setExistingSelectedIds(new Set());
  };

  const renderMediaCard = (asset: MediaAsset, isInsideFolder: boolean) => {
    const ratioLabel = getAspectRatioLabel(asset);
    const isNative16x9 = ratioLabel === '16:9 Native';
    const isSelected = selectedMediaId === asset.id;
    const isAnalyzed = asset.analysis?.analyzed;
    const isMissing = !asset.file && (!asset.url || asset.url.length === 0);
    const isChecked = selectedAssetIds.has(asset.id);
    const folderNames = getMediaFolderNames(asset, folders);

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
        {/* Selection Checkbox (Inside Folder or Bulk) */}
        {isInsideFolder && (
          <div
            onClick={(e) => toggleAssetSelection(asset.id, e)}
            className="text-slate-400 hover:text-blue-400 p-0.5"
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-blue-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </div>
        )}

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
          <p
            className={`text-xs font-semibold truncate ${
              isMissing ? 'text-amber-200' : 'text-slate-200'
            }`}
            title={asset.name}
          >
            {asset.name}
          </p>

          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 flex-wrap">
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

            {/* Assigned Folders Badges */}
            {folderNames.map((name, idx) => (
              <span
                key={idx}
                onClick={(e) => openAssignModal(asset, e)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/40 hover:bg-amber-900/80 transition-colors"
                title={`Assigned to ${name} (Click to manage folders)`}
              >
                <Folder className="w-2.5 h-2.5 text-amber-400" />
                <span className="truncate max-w-[80px]">{name}</span>
              </span>
            ))}

            {/* Quick Folder Assign Trigger */}
            <button
              onClick={(e) => openAssignModal(asset, e)}
              className="text-[10px] text-slate-500 hover:text-amber-300 inline-flex items-center gap-0.5 px-1 rounded hover:bg-slate-800 transition-colors"
              title="Manage folders for this clip"
            >
              <Tag className="w-2.5 h-2.5" />
              <span>{folderNames.length === 0 ? '+ Folder' : ''}</span>
            </button>
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
          )}

          {/* If inside folder, option to remove from folder */}
          {isInsideFolder && currentFolderId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onRemoveMediaFromFolder) {
                  onRemoveMediaFromFolder(asset.id, currentFolderId);
                }
              }}
              className="p-1.5 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 rounded transition-colors"
              title="Remove from this folder (keeps file in library)"
            >
              <FolderMinus className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(asset.id);
            }}
            className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
            title="Delete from Project"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-editor-panel w-full select-none overflow-hidden text-slate-100">
      {/* Hidden file pickers */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files) onUpload(e.target.files, currentFolderId || undefined);
          e.target.value = '';
        }}
        multiple
        accept="video/*,image/*,audio/*"
        className="hidden"
      />
      <input
        type="file"
        ref={folderUploadInputRef}
        onChange={(e) => {
          if (e.target.files && currentFolderId) {
            onUpload(e.target.files, currentFolderId);
          }
          e.target.value = '';
        }}
        multiple
        accept="video/*,image/*"
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
                <Music className="w-4 h-4 text-purple-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">{voiceover.name}</p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {formatSecondsToMinutes(voiceover.duration)} • {voiceover.format?.toUpperCase()}
                </p>
              </div>
            </div>

            {onRemoveVoiceover && (
              <button
                onClick={onRemoveVoiceover}
                className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors"
                title="Remove Voiceover"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
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

      {/* 2. Media Folders & Visual Media Section */}
      {currentFolderId && currentFolder ? (
        /* INSIDE FOLDER VIEW */
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Folder Navigation Header */}
          <div className="p-3 border-b border-editor-panelBorder bg-editor-surface/40 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => {
                  setCurrentFolderId(null);
                  clearSelection();
                }}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>All Folders</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setRenamingFolderId(currentFolder.id);
                    setRenameFolderName(currentFolder.name);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700/50 transition-colors"
                  title="Rename Folder"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteFolder(currentFolder.id, currentFolder.name)}
                  className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-red-500/20 transition-colors"
                  title="Delete Folder"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Folder Name / Rename input */}
            {renamingFolderId === currentFolder.id ? (
              <div className="flex items-center gap-1.5 my-1">
                <input
                  type="text"
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameFolderSubmit(currentFolder.id);
                    if (e.key === 'Escape') setRenamingFolderId(null);
                  }}
                  autoFocus
                  className="flex-1 bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
                />
                <button
                  onClick={() => handleRenameFolderSubmit(currentFolder.id)}
                  className="p-1 bg-blue-600 hover:bg-blue-500 text-white rounded"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setRenamingFolderId(null)}
                  className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="font-bold text-sm text-slate-100 truncate" title={currentFolder.name}>
                    {currentFolder.name}
                  </h3>
                  <span className="text-[11px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                    {displayedMedia.length} clips
                  </span>
                </div>
              </div>
            )}

            {/* Action Bar inside Folder */}
            <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-editor-panelBorder/50">
              <div className="flex items-center gap-1.5">
                {displayedMedia.length > 0 && (
                  <button
                    onClick={selectedAssetIds.size === displayedMedia.length ? clearSelection : selectAllDisplayed}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-1.5 py-1 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50"
                  >
                    {selectedAssetIds.size === displayedMedia.length ? (
                      <CheckSquare className="w-3 h-3 text-blue-400" />
                    ) : (
                      <Square className="w-3 h-3" />
                    )}
                    <span>{selectedAssetIds.size > 0 ? `${selectedAssetIds.size} selected` : 'Select'}</span>
                  </button>
                )}

                {selectedAssetIds.size > 0 && (
                  <button
                    onClick={handleBulkRemoveFromCurrentFolder}
                    className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/60 transition-colors"
                    title="Remove selected clips from this folder"
                  >
                    <FolderMinus className="w-3 h-3" />
                    <span>Remove from folder</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setExistingSelectedIds(new Set());
                    setIsAddExistingModalOpen(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors"
                  title="Assign existing clips from project library to this folder"
                >
                  <Layers className="w-3 h-3" />
                  <span>Pick from Library</span>
                </button>
                <button
                  onClick={() => folderUploadInputRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors shadow-sm"
                  title="Upload new video/photo files directly into this folder"
                >
                  <Plus className="w-3 h-3" />
                  <span>Upload</span>
                </button>
              </div>
            </div>
          </div>

          {/* Clip List inside Folder */}
          <div
            className={`flex-1 overflow-y-auto p-3 space-y-2 transition-colors ${
              isDragging ? 'bg-blue-950/20 ring-2 ring-blue-500 ring-inset' : ''
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, currentFolder.id)}
          >
            {displayedMedia.length === 0 ? (
              <div
                onClick={() => folderUploadInputRef.current?.click()}
                className="h-44 border-2 border-dashed border-editor-panelBorder hover:border-slate-500 rounded-lg flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors bg-editor-surface/30 hover:bg-editor-surface/60"
              >
                <FolderPlus className="w-8 h-8 text-slate-500 mb-2" />
                <p className="text-xs font-semibold text-slate-300">No clips in "{currentFolder.name}"</p>
                <p className="text-[11px] text-slate-500 mt-1">Drop files here or click to upload</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExistingSelectedIds(new Set());
                    setIsAddExistingModalOpen(true);
                  }}
                  className="mt-3 px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-blue-300 rounded border border-slate-700 inline-flex items-center gap-1"
                >
                  <Layers className="w-3 h-3" />
                  <span>Pick existing clips</span>
                </button>
              </div>
            ) : (
              displayedMedia.map((asset) => renderMediaCard(asset, true))
            )}
          </div>
        </div>
      ) : (
        /* ROOT VIEW (Folders List + Unassigned / All Media) */
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-editor-panelBorder flex items-center justify-between shrink-0 bg-editor-surface/20">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-slate-200 uppercase tracking-wider">
                Media Library
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
                onClick={() => setIsCreatingFolder(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-600/30 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 rounded transition-colors shadow-sm"
                title="Create a new logical folder for celebrity / scene clips"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>+ Add Folder</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>
            </div>
          </div>

          {/* New Folder Inline Form */}
          {isCreatingFolder && (
            <form
              onSubmit={handleCreateFolderSubmit}
              className="p-3 bg-editor-surface/80 border-b border-editor-panelBorder flex flex-col gap-2 shrink-0 animate-in fade-in duration-150"
            >
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New Media Folder</span>
              </div>
              <input
                type="text"
                placeholder="Folder name (e.g. Salman Khan, Katrina Kaif, Event Footage)"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                className="w-full bg-slate-900 border border-blue-500 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded shadow transition-colors"
                >
                  Create Folder
                </button>
              </div>
            </form>
          )}

          {/* Scrollable Container with Folders & Media */}
          <div
            className={`flex-1 overflow-y-auto p-3 space-y-4 transition-colors ${
              isDragging ? 'bg-blue-950/20 ring-2 ring-blue-500 ring-inset' : ''
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e)}
          >
            {/* 1. Folders Section */}
            {folders.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                  <div className="flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-amber-400" />
                    <span>Folders ({folders.length})</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {folders.map((folder) => {
                    const folderClips = getAssetsInFolder(mediaList, folder.id);
                    const isDragTarget = dragOverFolderId === folder.id;

                    return (
                      <div
                        key={folder.id}
                        onClick={() => setCurrentFolderId(folder.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverFolderId(folder.id);
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          handleDrop(e, folder.id);
                        }}
                        className={`group relative border rounded-lg p-2.5 bg-editor-surface hover:bg-editor-surfaceHover cursor-pointer transition-all shadow-sm flex flex-col justify-between ${
                          isDragTarget
                            ? 'border-amber-400 bg-amber-950/30 ring-2 ring-amber-400'
                            : 'border-editor-panelBorder hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded bg-amber-950/60 border border-amber-700/50 flex items-center justify-center shrink-0 text-amber-400 group-hover:scale-105 transition-transform">
                              <Folder className="w-4 h-4 fill-amber-500/20 text-amber-400" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-semibold text-slate-200 truncate group-hover:text-white" title={folder.name}>
                                {folder.name}
                              </h4>
                              <p className="text-[11px] text-slate-400 font-mono">
                                {folderClips.length} {folderClips.length === 1 ? 'clip' : 'clips'}
                              </p>
                            </div>
                          </div>

                          {/* Quick Folder Actions */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingFolderId(folder.id);
                                setRenameFolderName(folder.name);
                              }}
                              className="p-1 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 rounded"
                              title="Rename folder"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(folder.id, folder.name);
                              }}
                              className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded"
                              title="Delete folder"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Thumbnail previews inside folder */}
                        {folderClips.length > 0 && (
                          <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-slate-700/30 overflow-hidden">
                            {folderClips.slice(0, 4).map((clip) => (
                              <div
                                key={clip.id}
                                className="w-8 h-6 bg-black rounded overflow-hidden shrink-0 border border-slate-700/50 relative"
                              >
                                {clip.type === 'image' ? (
                                  <img src={clip.url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <video src={clip.url} className="w-full h-full object-cover" muted preload="metadata" />
                                )}
                              </div>
                            ))}
                            {folderClips.length > 4 && (
                              <span className="text-[10px] text-slate-500 font-mono pl-1">
                                +{folderClips.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Media Clips Section (Unassigned vs All Media) */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRootViewTab('folders')}
                    className={`text-xs font-semibold uppercase tracking-wider pb-0.5 border-b-2 transition-colors ${
                      rootViewTab === 'folders'
                        ? 'text-slate-200 border-blue-500'
                        : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                  >
                    Unassigned ({getUnassignedAssets(mediaList).length})
                  </button>
                  <button
                    onClick={() => setRootViewTab('all')}
                    className={`text-xs font-semibold uppercase tracking-wider pb-0.5 border-b-2 transition-colors ${
                      rootViewTab === 'all'
                        ? 'text-slate-200 border-blue-500'
                        : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                  >
                    All Clips ({mediaList.length})
                  </button>
                </div>

                {displayedMedia.length > 0 && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    {displayedMedia.length} {displayedMedia.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>

              {displayedMedia.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="h-36 border-2 border-dashed border-editor-panelBorder hover:border-slate-500 rounded-lg flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors bg-editor-surface/30 hover:bg-editor-surface/60"
                >
                  <Upload className="w-6 h-6 text-slate-500 mb-1.5" />
                  <p className="text-xs font-medium text-slate-300">
                    {rootViewTab === 'folders' ? 'No unassigned clips' : 'Drop videos or photos here'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Click to browse local files</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedMedia.map((asset) => renderMediaCard(asset, false))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Assign Media to Multiple Folders */}
      {assignModalMediaId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          onClick={() => setAssignModalMediaId(null)}
        >
          <div
            className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-editor-panelBorder flex items-center justify-between bg-editor-surface/50">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                  Assign to Folders
                </h3>
              </div>
              <button
                onClick={() => setAssignModalMediaId(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <p className="text-xs text-slate-400">
                Clips can belong to multiple celebrity or topic folders:
              </p>

              {folders.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-xs">
                  No folders created yet. Create one below:
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {folders.map((f) => {
                    const isAssigned = assignModalSelectedFolders.includes(f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => {
                          setAssignModalSelectedFolders((prev) =>
                            isAssigned ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          );
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          isAssigned
                            ? 'bg-amber-950/40 border border-amber-600/60 text-amber-200'
                            : 'bg-editor-surface hover:bg-editor-surfaceHover border border-editor-panelBorder text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-medium truncate">{f.name}</span>
                        </div>
                        {isAssigned ? (
                          <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Quick Create Folder inside modal */}
              <div className="pt-2 border-t border-editor-panelBorder flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="New folder name..."
                  value={quickNewFolderName}
                  onChange={(e) => setQuickNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleQuickCreateAndAssign();
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleQuickCreateAndAssign}
                  disabled={!quickNewFolderName.trim()}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 disabled:opacity-50"
                >
                  + Add
                </button>
              </div>
            </div>

            <div className="p-3 border-t border-editor-panelBorder bg-editor-surface/50 flex items-center justify-end gap-2">
              <button
                onClick={() => setAssignModalMediaId(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded"
              >
                Cancel
              </button>
              <button
                onClick={saveAssignModal}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded shadow"
              >
                Save Folders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Pick Existing Library Clips to Add into Current Folder */}
      {isAddExistingModalOpen && currentFolder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          onClick={() => setIsAddExistingModalOpen(false)}
        >
          <div
            className="bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-editor-panelBorder flex items-center justify-between bg-editor-surface/50">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                  Add Clips to "{currentFolder.name}"
                </h3>
              </div>
              <button
                onClick={() => setIsAddExistingModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              <p className="text-xs text-slate-400">
                Select clips from your project to add to this folder:
              </p>

              {mediaList.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No media in the project yet. Upload some files first.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {mediaList.map((asset) => {
                    const isAlreadyInFolder = asset.folderIds?.includes(currentFolder.id);
                    const isSelected = existingSelectedIds.has(asset.id);

                    return (
                      <div
                        key={asset.id}
                        onClick={() => {
                          if (isAlreadyInFolder) return;
                          setExistingSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(asset.id)) next.delete(asset.id);
                            else next.add(asset.id);
                            return next;
                          });
                        }}
                        className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                          isAlreadyInFolder
                            ? 'opacity-50 bg-slate-900/40 border border-slate-800 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-950/40 border border-blue-500 text-white cursor-pointer'
                            : 'bg-editor-surface hover:bg-editor-surfaceHover border border-editor-panelBorder text-slate-300 cursor-pointer'
                        }`}
                      >
                        <div className="w-10 h-8 bg-black rounded overflow-hidden shrink-0 border border-slate-700/50">
                          {asset.type === 'image' ? (
                            <img src={asset.url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <video src={asset.url} className="w-full h-full object-cover" muted preload="metadata" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{asset.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {formatSecondsToMinutes(asset.duration)} • {asset.aspectRatioLabel}
                          </p>
                        </div>

                        {isAlreadyInFolder ? (
                          <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 rounded bg-slate-800">
                            Already Added
                          </span>
                        ) : isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-editor-panelBorder bg-editor-surface/50 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">
                {existingSelectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddExistingModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddExistingToCurrentFolder}
                  disabled={existingSelectedIds.size === 0}
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded shadow"
                >
                  Add to Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
