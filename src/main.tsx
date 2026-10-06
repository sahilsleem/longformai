import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './engine/NativeBlip';
import { analyzeMediaAsset } from './engine/mediaAnalysis';
import { analyzeKeyframesSemantics, checkVisionWorkerHealth } from './engine/vision';
import { matchMediaForSegment, batchMatchMediaForSegments } from './engine/matching';

if (typeof window !== 'undefined') {
  (window as any).analyzeMediaAsset = analyzeMediaAsset;
  (window as any).analyzeKeyframesSemantics = analyzeKeyframesSemantics;
  (window as any).checkVisionWorkerHealth = checkVisionWorkerHealth;
  (window as any).matchMediaForSegment = matchMediaForSegment;
  (window as any).batchMatchMediaForSegments = batchMatchMediaForSegments;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
import './fonts.css';
