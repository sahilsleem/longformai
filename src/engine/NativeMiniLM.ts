import { registerPlugin } from '@capacitor/core';

export interface NativeMiniLMSystemInfo {
  available: boolean;
  engine: string;
  model: string;
  dimension: number;
  vocabSize: number;
}

export interface NativeMiniLMEmbedOptions {
  text: string;
}

export interface NativeMiniLMEmbedResult {
  embedding: number[];
}

export interface NativeMiniLMEmbedBatchOptions {
  texts: string[];
}

export interface NativeMiniLMEmbedBatchResult {
  embeddings: number[][];
}

export interface NativeMiniLMPlugin {
  getSystemInfo(): Promise<NativeMiniLMSystemInfo>;
  embed(options: NativeMiniLMEmbedOptions): Promise<NativeMiniLMEmbedResult>;
  embedBatch(options: NativeMiniLMEmbedBatchOptions): Promise<NativeMiniLMEmbedBatchResult>;
}

const NativeMiniLM = registerPlugin<NativeMiniLMPlugin>('NativeMiniLM');

export default NativeMiniLM;
