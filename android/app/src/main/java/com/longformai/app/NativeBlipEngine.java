package com.longformai.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.OrtSession.SessionOptions;

/**
 * LongFormAI Native Android BLIP Inference Engine.
 * Runs Salesforce/blip-image-captioning-base via ONNX Runtime Android with zero Python, zero cloud, zero HTTP.
 * Matches exact preprocessing and decoding logic from server/vision_server.py.
 */
public class NativeBlipEngine {
    private static final String TAG = "NativeBlipEngine";

    public enum State {
        UNINITIALIZED,
        EXTRACTING,
        LOADING,
        READY,
        ERROR
    }

    public static class CaptionResult {
        public final String caption;
        public final List<Integer> tokenIds;
        public final long totalDurationMs;
        public final long encoderDurationMs;
        public final long decoderDurationMs;
        public final int tokenCount;

        public CaptionResult(String caption, List<Integer> tokenIds, long totalDurationMs,
                             long encoderDurationMs, long decoderDurationMs, int tokenCount) {
            this.caption = caption;
            this.tokenIds = tokenIds;
            this.totalDurationMs = totalDurationMs;
            this.encoderDurationMs = encoderDurationMs;
            this.decoderDurationMs = decoderDurationMs;
            this.tokenCount = tokenCount;
        }
    }

    private static final NativeBlipEngine INSTANCE = new NativeBlipEngine();

    private final Object lock = new Object();
    private volatile State state = State.UNINITIALIZED;
    private volatile String lastError = null;

    private OrtEnvironment env = null;
    private OrtSession session0 = null; // Vision Transformer Encoder (split_0.onnx)
    private OrtSession session1 = null; // Text Decoder (split_1.onnx)
    private BertWordPieceTokenizer tokenizer = null;

    // Normalization constants matching server/vision_server.py
    private static final float MEAN_R = 0.48145466f;
    private static final float MEAN_G = 0.4578275f;
    private static final float MEAN_B = 0.40821073f;
    private static final float STD_R = 0.26862954f;
    private static final float STD_G = 0.26130258f;
    private static final float STD_B = 0.27577711f;

    // Special token IDs
    private static final int EOS_TOKEN_ID = 2;
    private static final int SEP_TOKEN_ID = 102;
    private static final int DEFAULT_BOS_TOKEN_ID = 30522;
    private static final int MAX_SEQUENCE_LENGTH = 20;

    private NativeBlipEngine() {}

    public static NativeBlipEngine getInstance() {
        return INSTANCE;
    }

    public State getState() {
        return state;
    }

    public boolean isReady() {
        return state == State.READY && session0 != null && session1 != null && tokenizer != null;
    }

    public String getLastError() {
        return lastError;
    }

    /**
     * Releases in-memory ONNX Runtime inference sessions and tokenizer.
     * Safely resets engine state to UNINITIALIZED so memory can be reclaimed.
     * Preserves model files on disk for instant re-initialization.
     */
    public void releaseModel() {
        synchronized (lock) {
            try {
                if (session0 != null) {
                    session0.close();
                    session0 = null;
                }
            } catch (Exception e) {
                Log.w(TAG, "Error closing session0", e);
            }
            try {
                if (session1 != null) {
                    session1.close();
                    session1 = null;
                }
            } catch (Exception e) {
                Log.w(TAG, "Error closing session1", e);
            }
            tokenizer = null;
            state = State.UNINITIALIZED;
            lastError = null;
            Log.i(TAG, "BLIP model sessions released");
            System.gc();
        }
    }

    private File ensureAssetCopied(Context context, String assetPath, String localSubdir, String fileName, long minExpectedSize) throws IOException {
        File dir = new File(context.getFilesDir(), localSubdir);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        File targetFile = new File(dir, fileName);
        if (targetFile.exists() && (minExpectedSize <= 0 || targetFile.length() >= minExpectedSize)) {
            Log.i(TAG, "Reusing existing file: " + targetFile.getAbsolutePath() + " (" + targetFile.length() + " bytes)");
            return targetFile;
        }

        Log.i(TAG, "Extracting " + assetPath + " to " + targetFile.getAbsolutePath() + "...");
        File tempDest = new File(dir, fileName + ".tmp");
        try (InputStream is = context.getAssets().open(assetPath);
             OutputStream os = new FileOutputStream(tempDest)) {
            byte[] buffer = new byte[131072]; // 128KB chunks
            int read;
            while ((read = is.read(buffer)) != -1) {
                os.write(buffer, 0, read);
            }
            os.flush();
        }

        if (targetFile.exists()) {
            targetFile.delete();
        }
        if (!tempDest.renameTo(targetFile)) {
            throw new IOException("Failed to rename temp file to " + targetFile.getAbsolutePath());
        }

        Log.i(TAG, "Extracted " + fileName + ": " + targetFile.length() + " bytes");
        return targetFile;
    }

    /**
     * Initializes the BLIP sessions and tokenizer on a background thread.
     */
    public void initialize(Context context) throws Exception {
        synchronized (lock) {
            if (isReady()) {
                return;
            }

            state = State.EXTRACTING;
            lastError = null;

            try {
                long startTotal = SystemClock.elapsedRealtime();

                // 1. One-time asset extraction
                File vocabFile = ensureAssetCopied(context, "models/blip/vocab.txt", "models/blip", "vocab.txt", 200_000L);
                ensureAssetCopied(context, "models/blip/model_config.json", "models/blip", "model_config.json", 1_000L);
                File split0File = ensureAssetCopied(context, "models/blip/split_0.onnx", "models/blip", "split_0.onnx", 300_000_000L);
                File split1File = ensureAssetCopied(context, "models/blip/split_1.onnx", "models/blip", "split_1.onnx", 500_000_000L);

                state = State.LOADING;

                // 2. Load tokenizer
                Log.i(TAG, "Loading BertWordPieceTokenizer from " + vocabFile.getAbsolutePath());
                BertWordPieceTokenizer tok = new BertWordPieceTokenizer();
                tok.loadVocab(vocabFile);
                Log.i(TAG, "Tokenizer loaded: " + tok.getVocabSize() + " tokens");

                // 3. Initialize ONNX sessions
                Log.i(TAG, "Initializing ONNX Runtime environment and sessions...");
                OrtEnvironment ortEnv = OrtEnvironment.getEnvironment();

                SessionOptions opts0 = new SessionOptions();
                opts0.setIntraOpNumThreads(4);
                opts0.setOptimizationLevel(SessionOptions.OptLevel.ALL_OPT);

                SessionOptions opts1 = new SessionOptions();
                opts1.setIntraOpNumThreads(4);
                opts1.setOptimizationLevel(SessionOptions.OptLevel.ALL_OPT);

                Log.i(TAG, "Creating session 0 (ViT Encoder: " + split0File.getAbsolutePath() + ")...");
                long t0 = SystemClock.elapsedRealtime();
                OrtSession sess0 = ortEnv.createSession(split0File.getAbsolutePath(), opts0);
                Log.i(TAG, "Session 0 created in " + (SystemClock.elapsedRealtime() - t0) + " ms");

                Log.i(TAG, "Creating session 1 (Text Decoder: " + split1File.getAbsolutePath() + ")...");
                long t1 = SystemClock.elapsedRealtime();
                OrtSession sess1 = ortEnv.createSession(split1File.getAbsolutePath(), opts1);
                Log.i(TAG, "Session 1 created in " + (SystemClock.elapsedRealtime() - t1) + " ms");

                this.env = ortEnv;
                this.session0 = sess0;
                this.session1 = sess1;
                this.tokenizer = tok;
                this.state = State.READY;

                Log.i(TAG, "BLIP engine initialized successfully in " + (SystemClock.elapsedRealtime() - startTotal) + " ms");

            } catch (Exception e) {
                state = State.ERROR;
                lastError = e.getMessage();
                Log.e(TAG, "Failed to initialize NativeBlipEngine", e);
                throw e;
            }
        }
    }

    /**
     * Catmull-Rom cubic spline interpolation kernel (Keys cubic with a = -0.5).
     * Mathematically identical to Pillow's Image.Resampling.BICUBIC filter.
     */
    private static float catmullRom(float t) {
        t = Math.abs(t);
        if (t <= 1.0f) {
            return 1.5f * t * t * t - 2.5f * t * t + 1.0f;
        } else if (t < 2.0f) {
            return -0.5f * t * t * t + 2.5f * t * t - 4.0f * t + 2.0f;
        }
        return 0.0f;
    }

    /**
     * Resizes a Bitmap to 384x384 using separable 2D Bicubic interpolation
     * and normalizes with BLIP mean/std into an NCHW float32 tensor array [1, 3, 384, 384].
     */
    public static float[][][][] preprocessImageBicubic(Bitmap bitmap) {
        int srcW = bitmap.getWidth();
        int srcH = bitmap.getHeight();
        final int targetW = 384;
        final int targetH = 384;

        int[] srcPixels = new int[srcW * srcH];
        bitmap.getPixels(srcPixels, 0, srcW, 0, 0, srcW, srcH);

        // Precompute horizontal weights and source indices
        int[][] hIndices = new int[targetW][4];
        float[][] hWeights = new float[targetW][4];
        float scaleX = (float) srcW / (float) targetW;

        for (int x = 0; x < targetW; x++) {
            float u = (x + 0.5f) * scaleX - 0.5f;
            int x0 = (int) Math.floor(u);
            float f = u - x0;

            float w0 = catmullRom(1.0f + f);
            float w1 = catmullRom(f);
            float w2 = catmullRom(1.0f - f);
            float w3 = catmullRom(2.0f - f);
            float sumW = w0 + w1 + w2 + w3;
            if (sumW != 0.0f) {
                w0 /= sumW;
                w1 /= sumW;
                w2 /= sumW;
                w3 /= sumW;
            }

            hWeights[x][0] = w0;
            hWeights[x][1] = w1;
            hWeights[x][2] = w2;
            hWeights[x][3] = w3;

            hIndices[x][0] = Math.max(0, Math.min(srcW - 1, x0 - 1));
            hIndices[x][1] = Math.max(0, Math.min(srcW - 1, x0));
            hIndices[x][2] = Math.max(0, Math.min(srcW - 1, x0 + 1));
            hIndices[x][3] = Math.max(0, Math.min(srcW - 1, x0 + 2));
        }

        // Horizontal pass: srcW x srcH -> targetW x srcH
        float[][] intermediateR = new float[srcH][targetW];
        float[][] intermediateG = new float[srcH][targetW];
        float[][] intermediateB = new float[srcH][targetW];

        for (int y = 0; y < srcH; y++) {
            int rowOffset = y * srcW;
            for (int x = 0; x < targetW; x++) {
                int p0 = srcPixels[rowOffset + hIndices[x][0]];
                int p1 = srcPixels[rowOffset + hIndices[x][1]];
                int p2 = srcPixels[rowOffset + hIndices[x][2]];
                int p3 = srcPixels[rowOffset + hIndices[x][3]];

                float w0 = hWeights[x][0];
                float w1 = hWeights[x][1];
                float w2 = hWeights[x][2];
                float w3 = hWeights[x][3];

                float r = ((p0 >> 16) & 0xFF) * w0 + ((p1 >> 16) & 0xFF) * w1 +
                          ((p2 >> 16) & 0xFF) * w2 + ((p3 >> 16) & 0xFF) * w3;
                float g = ((p0 >> 8) & 0xFF) * w0 + ((p1 >> 8) & 0xFF) * w1 +
                          ((p2 >> 8) & 0xFF) * w2 + ((p3 >> 8) & 0xFF) * w3;
                float b = (p0 & 0xFF) * w0 + (p1 & 0xFF) * w1 +
                          (p2 & 0xFF) * w2 + (p3 & 0xFF) * w3;

                intermediateR[y][x] = r;
                intermediateG[y][x] = g;
                intermediateB[y][x] = b;
            }
        }

        // Precompute vertical weights and indices
        int[][] vIndices = new int[targetH][4];
        float[][] vWeights = new float[targetH][4];
        float scaleY = (float) srcH / (float) targetH;

        for (int y = 0; y < targetH; y++) {
            float v = (y + 0.5f) * scaleY - 0.5f;
            int y0 = (int) Math.floor(v);
            float g = v - y0;

            float w0 = catmullRom(1.0f + g);
            float w1 = catmullRom(g);
            float w2 = catmullRom(1.0f - g);
            float w3 = catmullRom(2.0f - g);
            float sumW = w0 + w1 + w2 + w3;
            if (sumW != 0.0f) {
                w0 /= sumW;
                w1 /= sumW;
                w2 /= sumW;
                w3 /= sumW;
            }

            vWeights[y][0] = w0;
            vWeights[y][1] = w1;
            vWeights[y][2] = w2;
            vWeights[y][3] = w3;

            vIndices[y][0] = Math.max(0, Math.min(srcH - 1, y0 - 1));
            vIndices[y][1] = Math.max(0, Math.min(srcH - 1, y0));
            vIndices[y][2] = Math.max(0, Math.min(srcH - 1, y0 + 1));
            vIndices[y][3] = Math.max(0, Math.min(srcH - 1, y0 + 2));
        }

        // Vertical pass & normalization: targetW x srcH -> targetW x targetH (NCHW float32)
        float[][][][] tensor = new float[1][3][targetH][targetW];

        for (int y = 0; y < targetH; y++) {
            int yIdx0 = vIndices[y][0];
            int yIdx1 = vIndices[y][1];
            int yIdx2 = vIndices[y][2];
            int yIdx3 = vIndices[y][3];

            float w0 = vWeights[y][0];
            float w1 = vWeights[y][1];
            float w2 = vWeights[y][2];
            float w3 = vWeights[y][3];

            for (int x = 0; x < targetW; x++) {
                float r = intermediateR[yIdx0][x] * w0 + intermediateR[yIdx1][x] * w1 +
                          intermediateR[yIdx2][x] * w2 + intermediateR[yIdx3][x] * w3;
                float g = intermediateG[yIdx0][x] * w0 + intermediateG[yIdx1][x] * w1 +
                          intermediateG[yIdx2][x] * w2 + intermediateG[yIdx3][x] * w3;
                float b = intermediateB[yIdx0][x] * w0 + intermediateB[yIdx1][x] * w1 +
                          intermediateB[yIdx2][x] * w2 + intermediateB[yIdx3][x] * w3;

                // Clamp to [0, 255] and scale to [0, 1]
                float rNorm = (Math.max(0.0f, Math.min(255.0f, r)) / 255.0f - MEAN_R) / STD_R;
                float gNorm = (Math.max(0.0f, Math.min(255.0f, g)) / 255.0f - MEAN_G) / STD_G;
                float bNorm = (Math.max(0.0f, Math.min(255.0f, b)) / 255.0f - MEAN_B) / STD_B;

                tensor[0][0][y][x] = rNorm;
                tensor[0][1][y][x] = gNorm;
                tensor[0][2][y][x] = bNorm;
            }
        }

        return tensor;
    }

    /**
     * Generates a descriptive caption for a single image using the full two-stage ONNX BLIP model.
     * Thread-safe; sequential execution avoids concurrent session contention on CPU.
     */
    public CaptionResult generateCaption(Bitmap bitmap) throws Exception {
        if (!isReady()) {
            throw new IllegalStateException("NativeBlipEngine is not ready: " + lastError);
        }

        long startTotal = SystemClock.elapsedRealtime();

        // 1. Preprocess Bitmap (Bicubic resize to 384x384, normalize to NCHW float32)
        float[][][][] pixelValues = preprocessImageBicubic(bitmap);

        long startEncoder = SystemClock.elapsedRealtime();

        // 2. Stage 1: Vision Transformer Encoder (split_0.onnx)
        long[] encoderAttentionMask;
        float[][][] encoderHiddenStates;

        try (OnnxTensor pixelTensor = OnnxTensor.createTensor(env, pixelValues)) {
            Map<String, OnnxTensor> feeds0 = Collections.singletonMap("pixel_values", pixelTensor);
            try (OrtSession.Result result0 = session0.run(feeds0)) {
                OnnxValue maskVal = result0.get("encoder_attention_mask").orElse(result0.get(0));
                OnnxValue hiddenVal = result0.get("encoder_hidden_states").orElse(result0.get(1));

                encoderAttentionMask = (long[]) ((OnnxTensor) maskVal).getValue();
                encoderHiddenStates = (float[][][]) ((OnnxTensor) hiddenVal).getValue();
            }
        }

        long encoderDurationMs = SystemClock.elapsedRealtime() - startEncoder;

        long startDecoder = SystemClock.elapsedRealtime();

        // 3. Stage 2: Cross-Attention Text Decoder (split_1.onnx) with greedy autoregressive loop
        List<Integer> generatedTokenIds = new ArrayList<>();
        long[][] currentInputIds = new long[][]{ { (long) DEFAULT_BOS_TOKEN_ID } };

        try (OnnxTensor maskTensor = OnnxTensor.createTensor(env, encoderAttentionMask);
             OnnxTensor hiddenTensor = OnnxTensor.createTensor(env, encoderHiddenStates)) {

            for (int step = 0; step < MAX_SEQUENCE_LENGTH; step++) {
                int seqLen = currentInputIds[0].length;
                long[][] currentAttnMask = new long[1][seqLen];
                for (int i = 0; i < seqLen; i++) {
                    currentAttnMask[0][i] = 1L;
                }

                try (OnnxTensor inputIdsTensor = OnnxTensor.createTensor(env, currentInputIds);
                     OnnxTensor attnMaskTensor = OnnxTensor.createTensor(env, currentAttnMask)) {

                    Map<String, OnnxTensor> feeds1 = new HashMap<>(4);
                    feeds1.put("input_ids", inputIdsTensor);
                    feeds1.put("attention_mask", attnMaskTensor);
                    feeds1.put("encoder_attention_mask", maskTensor);
                    feeds1.put("encoder_hidden_states", hiddenTensor);

                    try (OrtSession.Result result1 = session1.run(feeds1)) {
                        OnnxValue logitsVal = result1.get("logits").orElse(result1.get(0));
                        float[][][] logits = (float[][][]) ((OnnxTensor) logitsVal).getValue();

                        // Last position logits [30524]
                        float[] lastLogits = logits[0][logits[0].length - 1];

                        // Exact greedy argmax
                        int nextTokenId = 0;
                        float maxVal = -Float.MAX_VALUE;
                        for (int c = 0; c < lastLogits.length; c++) {
                            if (lastLogits[c] > maxVal) {
                                maxVal = lastLogits[c];
                                nextTokenId = c;
                            }
                        }

                        // Stop on EOS or SEP
                        if (nextTokenId == EOS_TOKEN_ID || nextTokenId == SEP_TOKEN_ID) {
                            break;
                        }

                        generatedTokenIds.add(nextTokenId);

                        // Append next token to input_ids
                        long[][] nextInputIds = new long[1][seqLen + 1];
                        System.arraycopy(currentInputIds[0], 0, nextInputIds[0], 0, seqLen);
                        nextInputIds[0][seqLen] = nextTokenId;
                        currentInputIds = nextInputIds;
                    }
                }
            }
        }

        long decoderDurationMs = SystemClock.elapsedRealtime() - startDecoder;
        long totalDurationMs = SystemClock.elapsedRealtime() - startTotal;

        // 4. WordPiece decode
        String caption = tokenizer.decode(generatedTokenIds, true, DEFAULT_BOS_TOKEN_ID).trim();
        if (caption.isEmpty()) {
            caption = "Scene with no distinct subject.";
        } else {
            caption = caption.substring(0, 1).toUpperCase() + caption.substring(1);
        }

        Log.i(TAG, "Caption: \"" + caption + "\" in " + totalDurationMs + " ms (enc: " + encoderDurationMs + " ms, dec: " + decoderDurationMs + " ms, tokens: " + generatedTokenIds.size() + ")");

        return new CaptionResult(caption, generatedTokenIds, totalDurationMs, encoderDurationMs, decoderDurationMs, generatedTokenIds.size());
    }
}
