import React, { useEffect } from 'react';
import {
  X,
  Film,
  Image as ImageIcon,
  Check,
  ArrowLeftRight,
  Layers,
} from 'lucide-react';
import { MediaAsset } from '../types/project';
import { formatTimecode } from '../engine/schema';

interface ReplaceMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaList: MediaAsset[];
  currentMediaId?: string;
  onSelectMedia: (mediaId: string) => void;
}

export const ReplaceMediaModal: React.FC<ReplaceMediaModalProps> = ({
  isOpen,
  onClose,
  mediaList,
  currentMediaId,
  onSelectMedia,
}) => {
  // ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter only imported visual media assets (video & image)
  const visualMedia = mediaList.filter((m) => m.type === 'video' || m.type === 'image');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-editor-panel border border-editor-panelBorder rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] sm:max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-panelBorder bg-editor-surface/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-slate-100 uppercase tracking-wider truncate">
                Replace this visual
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Select an imported photo or video to replace this clip
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-editor-surface rounded-lg transition-colors shrink-0 ml-2"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Media Grid / Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
          {visualMedia.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500">
              <Layers className="w-10 h-10 mb-2 opacity-30 text-slate-400" />
              <p className="text-sm font-medium text-slate-300">No Visual Media Imported</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Import photos or videos into your project using Add Media in the Media Library first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {visualMedia.map((asset) => {
                const isCurrent = asset.id === currentMediaId;

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      if (isCurrent) {
                        onClose();
                      } else {
                        onSelectMedia(asset.id);
                      }
                    }}
                    className={`group relative flex flex-col rounded-xl overflow-hidden border text-left transition-all aspect-video sm:aspect-16/10 bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-400 active:scale-[0.98] ${
                      isCurrent
                        ? 'border-blue-500 ring-2 ring-blue-500/50 cursor-default opacity-85'
                        : 'border-editor-panelBorder hover:border-blue-400/80 hover:shadow-md hover:shadow-blue-500/10 cursor-pointer'
                    }`}
                  >
                    {/* Visual Media Thumbnail Preview */}
                    <div className="absolute inset-0 overflow-hidden bg-slate-900">
                      {asset.type === 'video' ? (
                        <video
                          src={asset.url}
                          className="w-full h-full object-cover pointer-events-none opacity-70 group-hover:opacity-90 transition-opacity"
                          preload="metadata"
                          muted
                        />
                      ) : (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover pointer-events-none opacity-70 group-hover:opacity-90 transition-opacity"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/60 pointer-events-none" />
                    </div>

                    {/* Top Badges */}
                    <div className="relative z-10 flex items-center justify-between gap-1 p-2">
                      <span className="flex items-center gap-1 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-slate-200 border border-white/10">
                        {asset.type === 'video' ? (
                          <>
                            <Film className="w-2.5 h-2.5 text-blue-400" />
                            <span>{formatTimecode(asset.duration)}</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Photo</span>
                          </>
                        )}
                      </span>

                      {isCurrent && (
                        <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-mono shadow-xs">
                          <Check className="w-2.5 h-2.5" />
                          <span>Current</span>
                        </span>
                      )}
                    </div>

                    {/* Bottom Title Bar */}
                    <div className="relative z-10 mt-auto p-2">
                      <p className="text-[11px] font-medium text-slate-100 truncate group-hover:text-white transition-colors" title={asset.name}>
                        {asset.name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
