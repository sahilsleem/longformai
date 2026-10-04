import React, { useRef } from 'react';
import {
  MoreVertical,
} from 'lucide-react';
import { LongFormProject } from '../types/project';
import {
  exportProjectToPortableJSON,
  validateAndParseProjectJSON,
} from '../engine/schema';

interface HeaderProps {
  project: LongFormProject;
  currentTime: number;
  totalDuration: number;
  isDirty?: boolean;
  isSavingLocal?: boolean;
  lastSavedTime?: number | null;
  onMarkSaved?: () => void;
  onSetProjectName?: (name: string) => void;
  onImportProject: (project: LongFormProject) => void;
  onResetProject: () => void;
  onOpenRenderModal?: () => void;
  onOpenRelinkModal?: () => void;
  unlinkedCount?: number;
  isFrameEnabled?: boolean;
  onToggleFrame?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  onImportProject,
  onSetProjectName,
  onOpenRenderModal,
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const parseResult = validateAndParseProjectJSON(content);

      if (!parseResult.isValid || !parseResult.project) {
        alert('Failed to load project.');
        return;
      }
      onImportProject(parseResult.project);
      setIsMenuOpen(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <header className="sticky top-0 h-12 bg-editor-bg border-b border-editor-panelBorder px-4 flex items-center justify-between select-none z-30">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-slate-300 hover:text-white rounded-md transition-colors"
        >
          <MoreVertical className="w-5 h-5" />
        </button>

        <div className="flex-1 flex justify-center">
          <input
            type="text"
            value={project.name || 'Untitled Project'}
            onChange={(e) => onSetProjectName?.(e.target.value)}
            className="bg-transparent text-center text-sm font-semibold text-slate-200 outline-none w-48 truncate"
          />
        </div>

        <button
          onClick={onOpenRenderModal}
          disabled={project.timeline.length === 0}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all"
        >
          <span>Export</span>
        </button>
      </header>
      
      {isMenuOpen && (
        <div className="absolute top-12 left-4 w-48 bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl p-2 z-50">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-editor-surface rounded-lg"
          >
            Open project file
          </button>
          <button
            onClick={() => {
              const jsonStr = exportProjectToPortableJSON(project);
              const blob = new Blob([jsonStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const safeName = project.name?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'longform_project';
              const a = document.createElement('a');
              a.href = url;
              a.download = `${safeName}.longform.json`;
              a.click();
              URL.revokeObjectURL(url);
              setIsMenuOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-editor-surface rounded-lg"
          >
            Back up project
          </button>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleOpenProject}
        accept=".json,.longform.json"
        className="hidden"
      />
    </>
  );
};
