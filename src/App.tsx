import { useState } from 'react';
import LongFormEditor from './LongFormEditor';
import ShortsEditor from './ShortsEditor';
import { PlaySquare, Smartphone } from 'lucide-react';

import { AutoCutLogo } from './components/AutoCutLogo';

export default function App() {
  const [mode, setMode] = useState<'home' | 'longform' | 'shorts'>('home');

  if (mode === 'longform') {
    return <LongFormEditor />;
  }

  if (mode === 'shorts') {
    return <ShortsEditor onBack={() => setMode('home')} />;
  }

  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 select-none font-sans">
      <div className="w-full max-w-sm flex flex-col gap-8">
        
        <div className="text-center space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] text-white">
            <AutoCutLogo className="w-full h-full" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-wider uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              AutoCut
            </h1>
            <p className="text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase mt-1">
              Turn clips into videos.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <button 
            onClick={() => setMode('longform')}
            className="flex flex-col items-center justify-center gap-3 p-8 rounded-3xl bg-slate-900 border border-slate-800 hover:border-white/30 hover:bg-slate-800/80 active:scale-95 transition-all shadow-xl group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <PlaySquare className="w-12 h-12 text-slate-300 group-hover:text-white group-hover:scale-110 transition-all duration-300" />
            <div className="text-center z-10">
              <h2 className="text-xl font-bold mb-1">Long-form Video</h2>
              <p className="text-xs text-slate-400 font-medium tracking-wide">HD • Horizontal • Cinematic</p>
            </div>
          </button>

          <button 
            onClick={() => setMode('shorts')}
            className="flex flex-col items-center justify-center gap-3 p-8 rounded-3xl bg-slate-900 border border-slate-800 hover:border-white/30 hover:bg-slate-800/80 active:scale-95 transition-all shadow-xl group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Smartphone className="w-12 h-12 text-slate-300 group-hover:text-white group-hover:scale-110 transition-all duration-300" />
            <div className="text-center z-10">
              <h2 className="text-xl font-bold mb-1">YouTube Short</h2>
              <p className="text-xs text-slate-400 font-medium tracking-wide">Vertical • Fast-paced • 60s</p>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
