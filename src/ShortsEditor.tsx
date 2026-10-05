import { useState, useRef } from 'react';
import { ArrowLeft, Play, Pause, Upload, Sparkles } from 'lucide-react';
import { pickAndroidMedia } from './platform/androidMedia';

interface ShortsEditorProps {
  onBack: () => void;
}

export default function ShortsEditor({ onBack }: ShortsEditorProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'curiosity'>('main');
  const [mainCaption, setMainCaption] = useState('');
  const [curiosityCaption, setCuriosityCaption] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleUpload = async () => {
    try {
      const files = await pickAndroidMedia();
      if (files && files.length > 0) {
        setVideoUrl(files[0].webPath);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-editor-bg text-white font-sans overflow-hidden">
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4 border-b border-editor-panelBorder bg-editor-surface shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-95 transition">
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-xl font-bold tracking-widest uppercase">Cut Studio</h1>
        <div className="w-10"></div> {/* Spacer for centering */}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Video Preview Container (Top Half) */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {!videoUrl ? (
            <button 
              onClick={handleUpload}
              className="flex flex-col items-center gap-4 text-slate-400 hover:text-white transition group"
            >
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center group-hover:scale-110 transition shadow-lg">
                <Upload className="w-8 h-8" />
              </div>
              <span className="font-medium tracking-wide uppercase text-sm">Select Video</span>
            </button>
          ) : (
            <div className="relative h-full aspect-[9/16] bg-slate-900 mx-auto">
              <video 
                ref={videoRef}
                src={videoUrl}
                className="absolute inset-0 w-full h-full object-cover"
                loop
                playsInline
                onClick={togglePlay}
              />
              
              {/* Dimmer Overlay (Outside Crop) */}
              <div className="absolute inset-0 bg-black/60 pointer-events-none z-10" style={{
                clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 0% 25%, 100% 25%, 100% 75%, 0% 75%, 0% 0%)'
              }} />

              {/* Crop Box Frame (1:1) */}
              <div className="absolute left-0 right-0 top-[25%] bottom-[25%] border-2 border-white/50 z-20 pointer-events-none">
                {/* Corner Accents */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white -translate-x-1 -translate-y-1" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white translate-x-1 -translate-y-1" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white -translate-x-1 translate-y-1" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white translate-x-1 translate-y-1" />
                
                {/* Target Guides */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[1px] bg-white/20" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-[1px] bg-white/20" />
              </div>

              {/* Play/Pause Indicator Overlay */}
              <div className="absolute bottom-4 right-4 z-30">
                <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur border border-white/20 flex items-center justify-center">
                  {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-1" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Editor Controls (Bottom Half) */}
        <div className="h-[45%] shrink-0 bg-editor-surface border-t border-editor-panelBorder flex flex-col shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-40 relative">
          
          {/* Tabs */}
          <div className="flex border-b border-editor-panelBorder">
            <button 
              onClick={() => setActiveTab('main')}
              className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition ${activeTab === 'main' ? 'text-white border-b-2 border-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Main
            </button>
            <button 
              onClick={() => setActiveTab('curiosity')}
              className={`flex-1 py-4 text-sm font-bold tracking-widest uppercase transition ${activeTab === 'curiosity' ? 'text-white border-b-2 border-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Curiosity
            </button>
          </div>

          <div className="flex-1 p-4 flex flex-col gap-6 overflow-y-auto">
            
            {/* Caption Input */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold tracking-widest uppercase text-slate-400">
                  {activeTab === 'main' ? 'Main Caption' : 'Reveal Caption'}
                </label>
                <span className="text-[10px] text-slate-600 font-mono">
                  {(activeTab === 'main' ? mainCaption : curiosityCaption).length} / 220
                </span>
              </div>
              <textarea
                value={activeTab === 'main' ? mainCaption : curiosityCaption}
                onChange={(e) => activeTab === 'main' ? setMainCaption(e.target.value) : setCuriosityCaption(e.target.value)}
                placeholder={activeTab === 'main' ? "Capturing the hike vibes... #adventure" : "Wait for it..."}
                className="w-full h-24 bg-editor-bg border border-editor-panelBorder rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-white/40 transition placeholder:text-slate-600"
              />
            </div>

            {/* Trimmer Placeholder */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold tracking-widest uppercase text-slate-400 flex justify-between">
                <span>Timeline Trim</span>
                <span className="text-white font-mono bg-black px-2 py-0.5 rounded">00:00 / 00:00</span>
              </label>
              
              <div className="h-16 bg-black rounded-xl border border-editor-panelBorder relative overflow-hidden flex items-center justify-center">
                <span className="text-slate-600 text-xs font-medium tracking-wide uppercase">
                  (Video Timeline Trimmer Coming Next)
                </span>
              </div>
            </div>

          </div>

          {/* Render Button */}
          <div className="p-4 bg-editor-surface border-t border-editor-panelBorder pb-6">
            <button 
              disabled={!videoUrl}
              className="w-full py-4 bg-white text-black rounded-full font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none"
            >
              <Sparkles className="w-5 h-5 text-black" />
              Render Short
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
