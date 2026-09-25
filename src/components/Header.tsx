import React, { useRef, useState } from 'react';
import {
  Film,
  Upload,
  RotateCcw,
  Monitor,
  Video,
  Save,
  AlertTriangle,
  MoreVertical,
  X,
  Clock,
} from 'lucide-react';
import { LongFormProject } from '../types/project';
import {
  exportProjectToPortableJSON,
  formatTimecode,
  validateAndParseProjectJSON,
} from '../engine/schema';
import { RenderModal } from './RenderModal';

interface HeaderProps {
  project: LongFormProject;
  currentTime: number;
  totalDuration: number;
  isDirty?: boolean;
  onMarkSaved?: () => void;
  onSetProjectName: (name: string) => void;
  onImportProject: (project: LongFormProject) => void;
  onResetProject: () => void;
  onOpenRenderModal?: () => void;
  onOpenRelinkModal?: () => void;
  unlinkedCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  currentTime,
  totalDuration,
  isDirty = false,
  onMarkSaved,
  onSetProjectName,
  onImportProject,
  onResetProject,
  onOpenRenderModal,
  onOpenRelinkModal,
  unlinkedCount = 0,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isInternalRenderModalOpen, setIsInternalRenderModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSaveProject = () => {
    const jsonStr = exportProjectToPortableJSON(project);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeName = project.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'longform_project';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.longform.json`;
    a.click();
    URL.revokeObjectURL(url);
    onMarkSaved?.();
    setIsMobileMenuOpen(false);
  };

  const handleOpenProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isDirty) {
      const confirmDiscard = window.confirm(
        'You have unsaved changes in your current project.\n\nAre you sure you want to load another project and discard unsaved changes?'
      );
      if (!confirmDiscard) {
        e.target.value = '';
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const parseResult = validateAndParseProjectJSON(content);

      if (!parseResult.isValid || !parseResult.project) {
        const errList = parseResult.errors.join('\n• ');
        alert(`Failed to load project:\n\n• ${errList}`);
        return;
      }

      onImportProject(parseResult.project);
      setIsMobileMenuOpen(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTriggerRender = () => {
    setIsMobileMenuOpen(false);
    if (onOpenRenderModal) {
      onOpenRenderModal();
    } else {
      setIsInternalRenderModalOpen(true);
    }
  };

  return (
    <>
      <header className="h-12 bg-editor-panel border-b border-editor-panelBorder px-3 sm:px-4 flex items-center justify-between select-none relative z-30 shrink-0">
        {/* Brand & Project Info */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 bg-blue-600/20 text-blue-400 px-2 py-1 rounded-md border border-blue-500/30 shrink-0">
            <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-bold text-xs sm:text-sm tracking-wide text-white">LongFormAI</span>
          </div>

          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 hidden sm:inline-block shrink-0">
            16:9 Master
          </span>

          <div className="h-3.5 w-[1px] bg-slate-700 mx-0.5 hidden sm:block shrink-0" />

          {/* Project Name editable */}
          <div className="flex items-center gap-1 min-w-0">
            <input
              type="text"
              value={project.name}
              onChange={(e) => onSetProjectName(e.target.value)}
              className="bg-transparent hover:bg-editor-surface focus:bg-editor-surface border border-transparent focus:border-editor-panelBorder rounded px-1.5 py-0.5 text-xs font-medium text-slate-200 focus:outline-none transition-colors w-28 sm:w-36 md:w-44 truncate"
              title="Click to rename project"
            />
            {isDirty && (
              <span className="text-[9px] bg-amber-950 text-amber-400 border border-amber-800 px-1 py-0.2 rounded font-mono shrink-0">
                Unsaved
              </span>
            )}
          </div>
        </div>

        {/* Desktop Center: 16:9 Spec & Timecode */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 bg-editor-surface px-2.5 py-1 rounded border border-editor-panelBorder text-xs text-slate-300">
            <Monitor className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-white">1920 × 1080</span>
            <span className="text-slate-500">|</span>
            <span className="font-mono text-blue-300 font-medium">16:9 YouTube</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{project.fps} FPS</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs bg-editor-surface px-2.5 py-1 rounded border border-editor-panelBorder">
            <span className="text-blue-400 font-semibold">{formatTimecode(currentTime)}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleOpenProject}
          accept=".json,.longform.json"
          className="hidden"
        />

        {/* Desktop Action Buttons */}
        <div className="hidden md:flex items-center gap-1.5">
          {unlinkedCount > 0 && onOpenRelinkModal && (
            <button
              onClick={onOpenRelinkModal}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 rounded border border-amber-700/60 transition-colors animate-pulse"
              title={`${unlinkedCount} local media file(s) unlinked. Click to reconnect.`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Relink ({unlinkedCount})</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 rounded border border-editor-panelBorder transition-colors"
            title="Open / Load LongFormAI Project (.longform.json)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Open</span>
          </button>

          <button
            onClick={handleSaveProject}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
              isDirty
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 hover:bg-blue-600/50'
                : 'bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 border-editor-panelBorder'
            }`}
            title="Save Project to portable .longform.json file"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          <button
            onClick={handleTriggerRender}
            className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded transition-all shadow-sm shadow-blue-900/30 hover:shadow-blue-600/40"
            title="Render Final 1920x1080 MP4 Video"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Render</span>
          </button>

          <button
            onClick={() => {
              if (
                isDirty &&
                !confirm('You have unsaved changes in this project. Reset timeline and media?')
              ) {
                return;
              } else if (!isDirty && !confirm('Reset project timeline and media?')) {
                return;
              }
              onResetProject();
            }}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-editor-surface rounded transition-colors ml-0.5"
            title="Reset project"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Header Controls: Render + Menu button */}
        <div className="flex md:hidden items-center gap-1">
          {unlinkedCount > 0 && onOpenRelinkModal && (
            <button
              onClick={onOpenRelinkModal}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-amber-950/80 text-amber-300 rounded border border-amber-700/60 animate-pulse"
              title={`${unlinkedCount} unlinked file(s)`}
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>{unlinkedCount}</span>
            </button>
          )}

          <button
            onClick={handleTriggerRender}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded shadow-sm"
            title="Render Final Video"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Render</span>
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-editor-surface rounded transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="More Options"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <MoreVertical className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer / Dropdown Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-12 bg-editor-panel/95 backdrop-blur-md border-b border-editor-panelBorder z-40 p-3.5 shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150 select-none">
          {/* Status specs */}
          <div className="flex items-center justify-between p-2.5 rounded bg-editor-surface border border-editor-panelBorder text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold text-white">1920×1080 (16:9)</span>
              <span className="text-slate-500">·</span>
              <span>{project.fps} FPS</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[11px] text-blue-300">
              <Clock className="w-3 h-3" />
              <span>{formatTimecode(currentTime)} / {formatTimecode(totalDuration)}</span>
            </div>
          </div>

          {/* Action grid */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="flex items-center justify-center gap-2 p-3 bg-editor-surface hover:bg-editor-surfaceHover rounded-lg border border-editor-panelBorder text-xs font-medium text-slate-200"
            >
              <Upload className="w-4 h-4 text-blue-400" />
              <span>Open Project</span>
            </button>

            <button
              onClick={handleSaveProject}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-xs font-medium ${
                isDirty
                  ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                  : 'bg-editor-surface hover:bg-editor-surfaceHover text-slate-200 border-editor-panelBorder'
              }`}
            >
              <Save className="w-4 h-4 text-blue-400" />
              <span>Save Project</span>
            </button>
          </div>

          {unlinkedCount > 0 && onOpenRelinkModal && (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenRelinkModal();
              }}
              className="w-full flex items-center justify-center gap-2 p-2.5 bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 rounded-lg border border-amber-700/60 text-xs font-semibold"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Relink Missing Media Files ({unlinkedCount})</span>
            </button>
          )}

          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              if (
                isDirty &&
                !confirm('You have unsaved changes in this project. Reset timeline and media?')
              ) {
                return;
              } else if (!isDirty && !confirm('Reset project timeline and media?')) {
                return;
              }
              onResetProject();
            }}
            className="w-full flex items-center justify-center gap-2 p-2 text-red-400 hover:bg-red-950/30 rounded-lg text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Project to Empty State</span>
          </button>
        </div>
      )}

      {!onOpenRenderModal && (
        <RenderModal
          isOpen={isInternalRenderModalOpen}
          onClose={() => setIsInternalRenderModalOpen(false)}
          project={project}
          totalDuration={totalDuration}
        />
      )}
    </>
  );
};
