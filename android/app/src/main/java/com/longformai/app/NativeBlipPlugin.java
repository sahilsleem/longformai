package com.longformai.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeBlip")
public class NativeBlipPlugin extends Plugin {
    private static final String TAG = "NativeBlipPlugin";
    private static final ExecutorService sExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void isReady(PluginCall call) {
        NativeBlipEngine engine = NativeBlipEngine.getInstance();
        JSObject ret = new JSObject();
        ret.put("ready", engine.isReady());
        ret.put("state", engine.getState().name().toLowerCase());
        ret.put("error", engine.getLastError());
        call.resolve(ret);
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        sExecutor.execute(() -> {
            try {
                Log.i(TAG, "NativeBlipPlugin.initialize called");
                NativeBlipEngine.getInstance().initialize(getContext());
                JSObject ret = new JSObject();
                ret.put("ready", true);
                ret.put("state", "ready");
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Initialization failed", e);
                call.reject("Failed to initialize NativeBlip: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void generateCaption(PluginCall call) {
        String imageData = call.getString("imageData");
        if (imageData == null || imageData.isEmpty()) {
            call.reject("Missing imageData parameter");
            return;
        }

        sExecutor.execute(() -> {
            try {
                NativeBlipEngine engine = NativeBlipEngine.getInstance();
                if (!engine.isReady()) {
                    Log.i(TAG, "Engine not ready, initializing now...");
                    engine.initialize(getContext());
                }

                byte[] imageBytes;
                if (imageData.startsWith("data:image")) {
                    int commaIdx = imageData.indexOf(',');
                    if (commaIdx >= 0) {
                        imageBytes = Base64.decode(imageData.substring(commaIdx + 1), Base64.DEFAULT);
                    } else {
                        imageBytes = Base64.decode(imageData, Base64.DEFAULT);
                    }
                } else {
                    imageBytes = Base64.decode(imageData, Base64.DEFAULT);
                }

                Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
                if (bitmap == null) {
                    call.reject("Failed to decode image bytes into Bitmap");
                    return;
                }

                NativeBlipEngine.CaptionResult result = engine.generateCaption(bitmap);
                bitmap.recycle();

                JSObject ret = new JSObject();
                ret.put("status", "success");
                ret.put("caption", result.caption);
                ret.put("totalDurationMs", result.totalDurationMs);
                ret.put("encoderDurationMs", result.encoderDurationMs);
                ret.put("decoderDurationMs", result.decoderDurationMs);
                ret.put("tokenCount", result.tokenCount);

                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Caption generation failed", e);
                call.reject("Caption generation failed: " + e.getMessage(), e);
            }
        });
    }
}
