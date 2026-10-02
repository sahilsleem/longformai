package com.longformai.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegSession;
import com.arthenica.ffmpegkit.ReturnCode;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeWhisper")
public class NativeWhisperPlugin extends Plugin {
    private static final String TAG = "NativeWhisperPlugin";

    private static long sContextPtr = 0L;
    private static final Object sLock = new Object();
    private static final ExecutorService sExecutor = Executors.newSingleThreadExecutor();

    private synchronized File ensureModelFile() throws IOException {
        File modelsDir = new File(getContext().getFilesDir(), "models");
        if (!modelsDir.exists()) {
            modelsDir.mkdirs();
        }
        File modelFile = new File(modelsDir, "ggml-base.bin");
        if (modelFile.exists() && modelFile.length() > 100_000_000L) {
            Log.i(TAG, "Reusing existing model: " + modelFile.getAbsolutePath() + " (" + modelFile.length() + " bytes)");
            return modelFile;
        }

        Log.i(TAG, "Extracting model from APK assets to " + modelFile.getAbsolutePath() + "...");
        File tempDest = new File(modelsDir, "ggml-base.bin.tmp");
        try (InputStream is = getContext().getAssets().open("models/ggml-base.bin");
             OutputStream os = new FileOutputStream(tempDest)) {
            byte[] buffer = new byte[65536];
            int read;
            while ((read = is.read(buffer)) != -1) {
                os.write(buffer, 0, read);
            }
            os.flush();
        }

        if (modelFile.exists()) {
            modelFile.delete();
        }
        if (!tempDest.renameTo(modelFile)) {
            throw new IOException("Failed to rename temp model to " + modelFile.getAbsolutePath());
        }

        Log.i(TAG, "Model extraction complete: " + modelFile.length() + " bytes");
        return modelFile;
    }

    private long getOrInitContext() throws Exception {
        synchronized (sLock) {
            if (sContextPtr != 0L) {
                return sContextPtr;
            }
            File modelFile = ensureModelFile();
            long ptr = WhisperBridge.initModel(modelFile.getAbsolutePath());
            if (ptr == 0L) {
                throw new Exception("whisper_init_from_file failed to load model at " + modelFile.getAbsolutePath());
            }
            sContextPtr = ptr;
            return sContextPtr;
        }
    }

    @PluginMethod
    public void transcribe(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("Must provide filePath");
            return;
        }

        String language = call.getString("language", "auto");
        int threads = call.getInt("threads", 4);

        sExecutor.execute(() -> {
            File tempWav = null;
            try {
                // Ensure model is ready
                long contextPtr = getOrInitContext();

                // Convert audio to 16kHz mono 16-bit PCM WAV using FFmpegKit
                tempWav = new File(getContext().getCacheDir(), "whisper_temp_" + System.currentTimeMillis() + ".wav");
                String[] ffmpegArgs = new String[]{
                    "-y",
                    "-i", filePath,
                    "-ar", "16000",
                    "-ac", "1",
                    "-c:a", "pcm_s16le",
                    tempWav.getAbsolutePath()
                };

                Log.i(TAG, "Converting audio to 16kHz WAV: " + filePath + " -> " + tempWav.getAbsolutePath());
                FFmpegSession session = FFmpegKit.executeWithArguments(ffmpegArgs);
                ReturnCode returnCode = session.getReturnCode();
                if (!ReturnCode.isSuccess(returnCode)) {
                    String err = "Audio conversion to WAV failed (code " + returnCode + "): " + session.getOutput();
                    Log.e(TAG, err);
                    call.reject(err);
                    return;
                }

                // Run native Whisper transcription
                Log.i(TAG, "Running whisper_full on " + tempWav.getAbsolutePath() + " (lang=" + language + ", threads=" + threads + ")");
                long startMs = System.currentTimeMillis();
                String jsonResult = WhisperBridge.transcribeWav(contextPtr, tempWav.getAbsolutePath(), language, threads);
                long elapsedMs = System.currentTimeMillis() - startMs;
                Log.i(TAG, "Native whisper completed in " + elapsedMs + "ms");

                JSONObject json = new JSONObject(jsonResult);
                String status = json.optString("status", "error");
                if ("error".equals(status)) {
                    String msg = json.optString("message", "Transcription failed in native layer");
                    call.reject(msg);
                } else {
                    JSObject ret = JSObject.fromJSONObject(json);
                    call.resolve(ret);
                }
            } catch (Exception e) {
                Log.e(TAG, "Native transcription error", e);
                call.reject("Native transcription failed: " + e.getMessage(), e);
            } finally {
                if (tempWav != null && tempWav.exists()) {
                    tempWav.delete();
                }
            }
        });
    }

    @PluginMethod
    public void releaseModel(PluginCall call) {
        synchronized (sLock) {
            if (sContextPtr != 0L) {
                WhisperBridge.freeModel(sContextPtr);
                sContextPtr = 0L;
                Log.i(TAG, "Whisper model released");
                System.gc();
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getSystemInfo(PluginCall call) {
        String info = WhisperBridge.getSystemInfo();
        JSObject ret = new JSObject();
        ret.put("systemInfo", info);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        synchronized (sLock) {
            if (sContextPtr != 0L) {
                WhisperBridge.freeModel(sContextPtr);
                sContextPtr = 0L;
            }
        }
    }
}
