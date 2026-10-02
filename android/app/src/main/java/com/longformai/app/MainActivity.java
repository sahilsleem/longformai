package com.longformai.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeFFmpegPlugin.class);
        registerPlugin(NativeWhisperPlugin.class);
        registerPlugin(NativeMiniLMPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
