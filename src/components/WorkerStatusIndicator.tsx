import React, { useState, useEffect, useRef } from 'react';
import { checkAllWorkers, WorkerDiagnostic } from '../engine/workers';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { isNativeAndroid } from '../platform/androidMedia';

const SHORT_NAMES: Record<number, string> = {
  8765: 'Transcription',
  8766: 'Vision',
  8767: 'Matching',
  8768: 'Rendering',
};

export const WorkerStatusIndicator: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerDiagnostic[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshStatus = async () => {
    if (isNativeAndroid()) return;
    setIsChecking(true);
    try {
      const results = await checkAllWorkers();
      setWorkers(results);
    } catch (e) {
      console.error('Failed to check workers', e);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (isNativeAndroid()) return;
    refreshStatus();
    const interval = setInterval(refreshStatus, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (isNativeAndroid()) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 rounded border border-editor-panelBorder transition-colors"
          title="On-Device AI Pipeline"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="truncate">On-Device AI • Ready</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-1 w-52 bg-editor-surface border border-editor-panelBorder rounded-md shadow-lg z-50 overflow-hidden text-xs">
            <div className="px-3 py-2 border-b border-editor-panelBorder bg-editor-panel flex justify-between items-center">
              <span className="font-semibold text-slate-200">On-Device AI</span>
              <span className="text-[10px] text-emerald-400 font-mono">100% Local</span>
            </div>
            <div className="p-1 space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1.5 hover:bg-editor-panel/50 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-300 font-medium">Whisper</span>
                </div>
                <span className="text-slate-500 font-mono text-[10px]">C++ / Native</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 hover:bg-editor-panel/50 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-300 font-medium">BLIP</span>
                </div>
                <span className="text-slate-500 font-mono text-[10px]">ONNX / Native</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 hover:bg-editor-panel/50 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-300 font-medium">MiniLM</span>
                </div>
                <span className="text-slate-500 font-mono text-[10px]">ONNX / Native</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 hover:bg-editor-panel/50 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-300 font-medium">FFmpeg</span>
                </div>
                <span className="text-slate-500 font-mono text-[10px]">FFmpegKit</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeCount = workers.filter((w) => w.isOnline && w.statusText === 'Ready').length;
  const totalCount = 4; // Always 4 for the 4 expected workers

  // Determine overall status color
  let indicatorColor = 'bg-slate-500';
  if (workers.length === 0) {
    indicatorColor = 'bg-blue-400 animate-pulse'; // Initial checking
  } else if (activeCount === totalCount) {
    indicatorColor = 'bg-emerald-500'; // Active/reachable
  } else if (activeCount > 0) {
    indicatorColor = 'bg-amber-500'; // Partial
  } else {
    indicatorColor = 'bg-red-500'; // Offline/unreachable
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-editor-surface hover:bg-editor-surfaceHover text-slate-300 rounded border border-editor-panelBorder transition-colors"
        title="Worker Status"
      >
        <span className="hidden sm:inline">Workers</span>
        <div className={`w-2 h-2 rounded-full ${indicatorColor}`} />
        <span>
          {workers.length === 0 ? '--/--' : `${activeCount}/${totalCount}`}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-1 w-48 bg-editor-surface border border-editor-panelBorder rounded-md shadow-lg z-50 overflow-hidden text-xs">
          <div className="px-3 py-2 border-b border-editor-panelBorder bg-editor-panel flex justify-between items-center">
            <span className="font-semibold text-slate-200">Worker Status</span>
            <button 
              onClick={(e) => { e.stopPropagation(); refreshStatus(); }}
              disabled={isChecking}
              className={`text-slate-400 hover:text-white transition-colors ${isChecking ? 'animate-spin' : ''}`}
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="p-1">
            {workers.length === 0 ? (
              <div className="px-2 py-3 text-center text-slate-400">Checking...</div>
            ) : (
              workers.map((w) => {
                const isActive = w.isOnline && w.statusText === 'Ready';
                
                
                let dotClass = 'bg-slate-500';
                if (isActive) dotClass = 'bg-emerald-500';
                else dotClass = 'bg-red-500';

                return (
                  <div key={w.port} className="flex items-center justify-between px-2 py-1.5 hover:bg-editor-panel/50 rounded transition-colors">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                      <span className="text-slate-300 font-medium">
                        {SHORT_NAMES[w.port] || 'Unknown'}
                      </span>
                    </div>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {w.port}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
