package com.longformai.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegSession;
import com.arthenica.ffmpegkit.ReturnCode;

import org.json.JSONException;

@CapacitorPlugin(name = "NativeFFmpeg")
public class NativeFFmpegPlugin extends Plugin {

    @PluginMethod
    public void execute(PluginCall call) {
        JSArray argsArray = call.getArray("arguments");
        if (argsArray == null) {
            call.reject("Must provide an arguments array");
            return;
        }

        try {
            String[] args = new String[argsArray.length()];
            for (int i = 0; i < argsArray.length(); i++) {
                args[i] = argsArray.getString(i);
            }

            // Execute FFmpegKit asynchronously
            FFmpegKit.executeWithArgumentsAsync(args, session -> {
                ReturnCode returnCode = session.getReturnCode();
                
                JSObject ret = new JSObject();
                ret.put("returnCode", returnCode.getValue());
                ret.put("success", ReturnCode.isSuccess(returnCode));
                ret.put("cancel", ReturnCode.isCancel(returnCode));
                ret.put("output", session.getOutput());
                
                call.resolve(ret);
            });
        } catch (JSONException e) {
            call.reject("Error parsing arguments", e);
        }
    }
}
