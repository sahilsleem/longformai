package com.longformai.app;

import android.util.Log;

public class WhisperBridge {
    private static final String TAG = "WhisperBridge";

    static {
        try {
            System.loadLibrary("whisper_native");
            Log.i(TAG, "libwhisper_native.so loaded successfully");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to load libwhisper_native.so", e);
        }
    }

    public static native long initModel(String modelPath);
    public static native void freeModel(long contextPtr);
    public static native String transcribeWav(long contextPtr, String wavPath, String language, int numThreads);
    public static native String getSystemInfo();
}
