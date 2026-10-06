import React, { useState, useEffect } from 'react';
import { LongFormProject } from '../types/project';
import {
  requestVideoRender,
  shareRenderedVideoNativeAndroid,
} from '../engine/render';
import { formatTimecode } from '../engine/schema';
import { validateProjectForRender } from '../engine/validation';
import { isNativeAndroid } from '../platform/androidMedia';


interface RenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: LongFormProject;
  totalDuration: number;
  
  
  onRelink: () => void;
}

export const RenderModal: React.FC<RenderModalProps> = ({
  isOpen,
  onClose,
  project,
  totalDuration,
  
  
  onRelink
}) => {
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingFiles, setMissingFiles] = useState(0);

  useEffect(() => {
    if (isOpen) {
      validateProjectForRender(project);
      const unlinked = project.media.filter(m => !m.file && (!m.url || m.url.length === 0)).length;
      setMissingFiles(unlinked);
    }
  }, [isOpen, project]);

  const handleStartRender = async () => {
    if (missingFiles > 0) return;
    setIsRendering(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const res = await requestVideoRender(project, (pct) => setProgress(pct));
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Export failed.');
    } finally {
      setIsRendering(false);
    }
  };

  const handleShare = async () => {
    if (result && isNativeAndroid() && result.outputPath) {
      try {
        await shareRenderedVideoNativeAndroid(result.outputPath, result.filename, result.filename);
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (!isOpen) return null;

  const clipCount = project.timeline.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200 select-none">
      <div className="bg-editor-panel rounded-t-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-200">
        
        {/* State 1: Ready to Export */}
        {!isRendering && !result && !error && (
          <div className="flex flex-col items-center">


            

            <div className="text-slate-400 text-sm mb-6 font-mono">
              {formatTimecode(totalDuration)} · {clipCount} clips · 1080p
            </div>

            {missingFiles > 0 ? (
              <div className="w-full flex items-center justify-between bg-slate-800/40 p-4 rounded-xl border border-slate-600/40">
                <span className="text-slate-200 text-sm">{missingFiles} clips are missing files</span>
                <button onClick={() => { onClose(); onRelink(); }} className="text-sm text-black font-semibold bg-white px-4 py-1.5 rounded-full">Fix</button>
              </div>
            ) : (
              <button 
                onClick={handleStartRender}
                className="w-full py-4 bg-white text-black rounded-xl font-semibold text-[15px] active:scale-[0.98] transition-transform"
              >
                Export video
              </button>
            )}
            
            <button onClick={onClose} className="mt-4 text-sm text-slate-400 p-2">Cancel</button>
          </div>
        )}

        {/* State 2: Exporting */}
        {isRendering && (
          <div className="flex flex-col items-center py-8">
            <h2 className="text-lg font-semibold text-white mb-2">Exporting your video…</h2>
            <p className="text-sm text-slate-400 mb-8">Keep AutoCut open.</p>
            
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
            <div className="mt-4 text-2xl font-bold text-white font-mono">{progress.toFixed(0)}%</div>
          </div>
        )}

        {/* State 3: Done */}
        {result && !isRendering && (
          <div className="flex flex-col items-center py-6">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Your video is ready</h2>
            <p className="text-sm text-slate-400 mb-8">Saved to Gallery</p>

            <div className="flex flex-col w-full gap-3">
              <button 
                onClick={handleShare}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold text-[15px] active:scale-[0.98] transition-transform"
              >
                Share
              </button>
              <button 
                onClick={onClose}
                className="w-full py-4 bg-editor-surface text-white rounded-xl font-semibold text-[15px] border border-editor-panelBorder active:scale-[0.98] transition-transform"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isRendering && (
          <div className="flex flex-col items-center py-6">
            <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Export didn't finish</h2>
            <p className="text-sm text-slate-400 mb-8 max-w-[250px] text-center truncate">{error}</p>

            <div className="flex flex-col w-full gap-3">
              <button 
                onClick={handleStartRender}
                className="w-full py-4 bg-white text-black rounded-xl font-semibold text-[15px] active:scale-[0.98] transition-transform"
              >
                Try again
              </button>
              <button 
                onClick={onClose}
                className="w-full py-4 bg-editor-surface text-white rounded-xl font-semibold text-[15px] border border-editor-panelBorder active:scale-[0.98] transition-transform"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};






