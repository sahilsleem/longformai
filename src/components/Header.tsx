import React, { useRef, useState } from 'react';
import {
  Film,
  Upload,
  RotateCcw,
  Monitor,
  Video,
  Save,
  AlertTriangle,
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
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <header className="h-14 bg-editor-panel border-b border-editor-panelBorder px-4 flex items-center justify-between select-none">
        {/* Brand & Project Info */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-blue-600/20 text-blue-400 px-2.5 py-1.5 rounded-md border border-blue-500/30">
            <Film className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm tracking-wide text-white">LongFormAI</span>
          </div>

          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
            Project Hail Mary
          </span>

          <div className="h-4 w-[1px] bg-slate-700 mx-1" />

          {/* Project Name editable */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={project.name}
              onChange={(e) => onSetProjectName(e.target.value)}
              className="bg-transparent hover:bg-editor-surface focus:bg-editor-surface border border-transparent focus:border-editor-panelBorder rounded px-2 py-1 text-sm font-medium text-slate-200 focus:outline-none transition-colors max-w-[200px] truncate"
              title="Click to rename project"
            />
            {isDirty && (
              <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-800 px-1.5 py-0.2 rounded font-mono">
                Unsaved
              </span>
            )}
          </div>
        </div>

        {/* Center 16:9 Standard Spec & Timecode */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-editor-surface px-3 py-1.5 rounded border border-editor-panelBorder text-xs text-slate-300">
            <Monitor className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-white">1920 × 1080</span>
            <span className="text-slate-500">|</span>
            <span className="font-mono text-blue-300 font-medium">16:9 YouTube</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{project.fps} FPS</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-sm bg-editor-surface px-3 py-1.5 rounded border border-editor-panelBorder">
            <span className="text-blue-400 font-semibold">{formatTimecode(currentTime)}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
          </div>
        </div>

        {/* Actions: Save, Load, Relink, Render Video, Reset */}
        <div className="flex items-center gap-2">
          {unlinkedCount > 0 && onOpenRelinkModal && (
            <button
              onClick={onOpenRelinkModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 rounded border border-amber-700/60 transition-colors animate-pulse"
              title={`${unlinkedCount} local media file(s) unlinked. Click to reconnect.`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Relink ({unlinkedCount})</span>
            </button>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleOpenProject}
            accept=".json,.longform.json"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 rounded border border-editor-panelBorder transition-colors"
            title="Open / Load LongFormAI Project (.longform.json)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Open Project</span>
          </button>

          <button
            onClick={handleSaveProject}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
              isDirty
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 hover:bg-blue-600/50'
                : 'bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 border-editor-panelBorder'
            }`}
            title="Save Project to portable .longform.json file"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Project</span>
          </button>

          <button
            onClick={() => (onOpenRenderModal ? onOpenRenderModal() : setIsInternalRenderModalOpen(true))}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded transition-all shadow-md shadow-blue-900/30 hover:shadow-blue-600/40"
            title="Render Final 1920x1080 MP4 Video"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Render Video</span>
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
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-editor-surface rounded transition-colors ml-1"
            title="Reset project"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

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

