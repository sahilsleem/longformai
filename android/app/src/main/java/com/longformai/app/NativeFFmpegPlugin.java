package com.longformai.app;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

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

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

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

    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("Must provide filePath");
            return;
        }

        String rawFilename = call.getString("filename");
        final String filename;
        if (rawFilename == null || rawFilename.trim().isEmpty()) {
            filename = "LongFormAI_" + System.currentTimeMillis() + ".mp4";
        } else if (!rawFilename.endsWith(".mp4")) {
            filename = rawFilename + ".mp4";
        } else {
            filename = rawFilename;
        }

        String rawRelPath = call.getString("relativePath", "Movies/LongFormAI/");
        if (!rawRelPath.endsWith("/")) {
            rawRelPath = rawRelPath + "/";
        }
        final String relativePath = rawRelPath;

        String cleanPath = filePath.startsWith("file://") ? filePath.substring(7) : filePath;
        File srcFile = new File(cleanPath);
        if (!srcFile.exists() || !srcFile.isFile()) {
            call.reject("Source video file does not exist: " + cleanPath);
            return;
        }

        getBridge().execute(() -> {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Video.Media.DISPLAY_NAME, filename);
            values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            long nowSec = System.currentTimeMillis() / 1000;
            values.put(MediaStore.Video.Media.DATE_ADDED, nowSec);
            values.put(MediaStore.Video.Media.DATE_MODIFIED, nowSec);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Video.Media.RELATIVE_PATH, relativePath);
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
            }

            Uri collectionUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                collectionUri = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            } else {
                collectionUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            }

            Uri itemUri = null;
            try {
                itemUri = resolver.insert(collectionUri, values);
                if (itemUri == null) {
                    call.reject("Failed to create MediaStore entry for " + filename);
                    return;
                }

                try (InputStream in = new FileInputStream(srcFile);
                     OutputStream out = resolver.openOutputStream(itemUri)) {
                    if (out == null) {
                        throw new IOException("Failed to open output stream for MediaStore Uri: " + itemUri);
                    }
                    byte[] buffer = new byte[64 * 1024];
                    int bytesRead;
                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                    out.flush();
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear();
                    values.put(MediaStore.Video.Media.IS_PENDING, 0);
                    resolver.update(itemUri, values, null, null);
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("uri", itemUri.toString());
                ret.put("filename", filename);
                ret.put("relativePath", relativePath);
                call.resolve(ret);
            } catch (Exception e) {
                if (itemUri != null) {
                    try {
                        resolver.delete(itemUri, null, null);
                    } catch (Exception delEx) {
                        // ignore cleanup errors
                    }
                }
                call.reject("Failed to save video to Gallery: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void shareVideo(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.trim().isEmpty()) {
            call.reject("Must provide video uri to share");
            return;
        }

        if (!uriStr.startsWith("content://")) {
            call.reject("Invalid MediaStore URI. The video must be exported to Gallery before sharing.");
            return;
        }

        try {
            String title = call.getString("title");
            if (title == null || title.trim().isEmpty()) {
                title = call.getString("filename", "Share Video");
            }

            Uri contentUri = Uri.parse(uriStr);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("video/mp4");
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            shareIntent.setClipData(ClipData.newRawUri("Video", contentUri));
            if (title != null && !title.isEmpty()) {
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            }

            Intent chooser = Intent.createChooser(shareIntent, title != null ? title : "Share Video");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(chooser);
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    } catch (Exception actEx) {
                        call.reject("Failed to open share sheet: " + actEx.getMessage(), actEx);
                    }
                });
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Failed to open share sheet: " + e.getMessage(), e);
        }
    }
}

