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

  onOpenRenderModal,
  onResetProject,
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
    <header className="relative h-14 bg-editor-bg border-b border-editor-panelBorder px-4 flex items-center justify-end select-none z-30">
      <div className="relative">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`p-2 rounded-full transition-colors ${isMenuOpen ? 'bg-editor-surface text-white' : 'text-slate-400 hover:bg-editor-surface hover:text-slate-200'}`}
        >
          <MoreVertical className="w-5 h-5" />
        </button>

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
            <div className="absolute top-full right-0 mt-2 w-48 bg-editor-panel border border-editor-panelBorder rounded-xl shadow-2xl py-1 z-50 overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  onOpenRenderModal?.();
                  setIsMenuOpen(false);
                }}
                disabled={project.timeline.length === 0}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-amber-400 hover:bg-editor-surface disabled:opacity-50 transition-colors"
              >
                Export Video
              </button>
              <div className="h-px w-full bg-editor-panelBorder my-1" />
              <button
                onClick={() => { fileInputRef.current?.click(); setIsMenuOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-editor-surface hover:text-white transition-colors"
              >
                Open project
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
                className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-editor-surface hover:text-white transition-colors"
              >
                Back up project
              </button>
              <div className="h-px w-full bg-editor-panelBorder my-1" />
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to reset the project? All media and edits will be lost.')) {
                    onResetProject();
                    setIsMenuOpen(false);
                  }
                }}
                className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-400/10 transition-colors font-medium"
              >
                Reset project
              </button>
            </div>
          </>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleOpenProject}
        accept=".json,.longform.json"
        className="hidden"
      />
    </header>
  );
};
