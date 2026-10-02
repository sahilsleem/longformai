package com.longformai.app;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.OrtSession.SessionOptions;

@CapacitorPlugin(name = "NativeMiniLM")
public class NativeMiniLMPlugin extends Plugin {
    private static final String TAG = "NativeMiniLM";

    private static final Object sLock = new Object();
    private static final ExecutorService sExecutor = Executors.newSingleThreadExecutor();

    private static OrtEnvironment sEnv = null;
    private static OrtSession sSession = null;
    private static BertWordPieceTokenizer sTokenizer = null;

    private synchronized File ensureAssetCopied(String assetPath, String localSubdir, String fileName, long minExpectedSize) throws IOException {
        File dir = new File(getContext().getFilesDir(), localSubdir);
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
        try (InputStream is = getContext().getAssets().open(assetPath);
             OutputStream os = new FileOutputStream(tempDest)) {
            byte[] buffer = new byte[65536];
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

    private synchronized void ensureModelAssets() throws IOException {
        ensureAssetCopied("models/minilm/vocab.txt", "models/minilm", "vocab.txt", 200_000L);
        ensureAssetCopied("models/minilm/config.json", "models/minilm", "config.json", 100L);
        ensureAssetCopied("models/minilm/model.onnx", "models/minilm", "model.onnx", 80_000_000L);
    }

    private void initSessionIfNeeded() throws Exception {
        synchronized (sLock) {
            if (sSession != null && sTokenizer != null) {
                return;
            }

            ensureModelAssets();

            File modelDir = new File(getContext().getFilesDir(), "models/minilm");
            File modelFile = new File(modelDir, "model.onnx");
            File vocabFile = new File(modelDir, "vocab.txt");

            if (!modelFile.exists()) {
                throw new IOException("model.onnx not found at " + modelFile.getAbsolutePath());
            }
            if (!vocabFile.exists()) {
                throw new IOException("vocab.txt not found at " + vocabFile.getAbsolutePath());
            }

            Log.i(TAG, "Initializing BertWordPieceTokenizer from " + vocabFile.getAbsolutePath());
            BertWordPieceTokenizer tokenizer = new BertWordPieceTokenizer();
            tokenizer.loadVocab(vocabFile);
            Log.i(TAG, "Tokenizer loaded successfully: " + tokenizer.getVocabSize() + " tokens");

            Log.i(TAG, "Initializing ONNX Runtime session from " + modelFile.getAbsolutePath());
            OrtEnvironment env = OrtEnvironment.getEnvironment();
            SessionOptions opts = new SessionOptions();
            opts.setIntraOpNumThreads(4);
            opts.setOptimizationLevel(SessionOptions.OptLevel.ALL_OPT);

            OrtSession session = env.createSession(modelFile.getAbsolutePath(), opts);
            Log.i(TAG, "ONNX Runtime session initialized successfully");

            sEnv = env;
            sSession = session;
            sTokenizer = tokenizer;
        }
    }

    /**
     * Computes a 384-dimensional unit-normalized embedding for a single text string.
     */
    private float[] computeEmbeddingInternal(String text) throws Exception {
        initSessionIfNeeded();

        BertWordPieceTokenizer.EncodedInputs encoded = sTokenizer.encode(text, 128);

        OnnxTensor inputIdsTensor = OnnxTensor.createTensor(sEnv, encoded.inputIds);
        OnnxTensor attentionMaskTensor = OnnxTensor.createTensor(sEnv, encoded.attentionMask);
        OnnxTensor tokenTypeIdsTensor = OnnxTensor.createTensor(sEnv, encoded.tokenTypeIds);

        Map<String, OnnxTensor> inputMap = new HashMap<>(3);
        inputMap.put("input_ids", inputIdsTensor);
        inputMap.put("attention_mask", attentionMaskTensor);
        inputMap.put("token_type_ids", tokenTypeIdsTensor);

        try (OrtSession.Result result = sSession.run(inputMap)) {
            // rawOutput has shape [1, 128, 384]
            float[][][] lastHiddenState = (float[][][]) result.get(0).getValue();

            // Attention-weighted mean pooling
            float[] pooled = new float[384];
            float sumMask = 0.0f;
            for (int t = 0; t < 128; t++) {
                long maskVal = encoded.attentionMask[0][t];
                if (maskVal > 0) {
                    sumMask += 1.0f;
                    for (int d = 0; d < 384; d++) {
                        pooled[d] += lastHiddenState[0][t][d];
                    }
                }
            }
            if (sumMask < 1e-9f) {
                sumMask = 1e-9f;
            }

            // L2 unit normalization
            float normSq = 0.0f;
            for (int d = 0; d < 384; d++) {
                pooled[d] /= sumMask;
                normSq += pooled[d] * pooled[d];
            }
            float norm = (float) Math.sqrt(normSq);
            if (norm < 1e-9f) {
                norm = 1e-9f;
            }
            for (int d = 0; d < 384; d++) {
                pooled[d] /= norm;
            }

            return pooled;
        } finally {
            inputIdsTensor.close();
            attentionMaskTensor.close();
            tokenTypeIdsTensor.close();
        }
    }

    @PluginMethod
    public void getSystemInfo(PluginCall call) {
        sExecutor.execute(() -> {
            try {
                initSessionIfNeeded();
                JSObject ret = new JSObject();
                ret.put("available", true);
                ret.put("engine", "onnxruntime-android");
                ret.put("model", "sentence-transformers/all-MiniLM-L6-v2");
                ret.put("dimension", 384);
                ret.put("vocabSize", sTokenizer != null ? sTokenizer.getVocabSize() : 30522);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "getSystemInfo error", e);
                call.reject("Native MiniLM not available: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void embed(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            text = "";
        }
        final String inputText = text;

        sExecutor.execute(() -> {
            try {
                float[] emb = computeEmbeddingInternal(inputText);
                JSArray arr = new JSArray();
                for (float v : emb) {
                    arr.put((double) v);
                }
                JSObject ret = new JSObject();
                ret.put("embedding", arr);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "embed error", e);
                call.reject("Embedding failed: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void embedBatch(PluginCall call) {
        JSArray textsArray = call.getArray("texts");
        if (textsArray == null) {
            call.reject("Missing 'texts' array parameter");
            return;
        }

        List<String> textsList = new ArrayList<>();
        try {
            for (int i = 0; i < textsArray.length(); i++) {
                textsList.add(textsArray.getString(i));
            }
        } catch (JSONException e) {
            call.reject("Invalid 'texts' array format: " + e.getMessage(), e);
            return;
        }

        sExecutor.execute(() -> {
            try {
                JSArray outerArray = new JSArray();
                for (String txt : textsList) {
                    float[] emb = computeEmbeddingInternal(txt);
                    JSArray innerArray = new JSArray();
                    for (float v : emb) {
                        innerArray.put((double) v);
                    }
                    outerArray.put(innerArray);
                }
                JSObject ret = new JSObject();
                ret.put("embeddings", outerArray);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "embedBatch error", e);
                call.reject("Batch embedding failed: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void releaseModel(PluginCall call) {
        sExecutor.execute(() -> {
            synchronized (sLock) {
                try {
                    if (sSession != null) {
                        sSession.close();
                        sSession = null;
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Error closing MiniLM session", e);
                }
                sTokenizer = null;
                Log.i(TAG, "MiniLM model session released");
                System.gc();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        synchronized (sLock) {
            try {
                if (sSession != null) {
                    sSession.close();
                    sSession = null;
                }
            } catch (Exception ignored) {}
            sTokenizer = null;
        }
    }
}
