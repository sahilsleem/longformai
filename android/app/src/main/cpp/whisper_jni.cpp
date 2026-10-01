#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <fstream>
#include <cstring>
#include <cstdio>
#include "whisper.h"

#define TAG "WhisperNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

// UTF-8-validating JSON string escaper.
// Passes valid UTF-8 multi-byte sequences through intact (Devanagari, Arabic, etc.).
// Replaces incomplete/invalid UTF-8 byte fragments (e.g. BPE sub-token pieces)
// with the JSON escape \uFFFD so the output is always valid UTF-8 + valid JSON.
static std::string json_escape(const std::string & s) {
    std::string out;
    out.reserve(s.size() + 16);
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = (unsigned char)s[i];
        if (c == '"')       { out += "\\\""; i++; }
        else if (c == '\\') { out += "\\\\"; i++; }
        else if (c == '\b') { out += "\\b";  i++; }
        else if (c == '\f') { out += "\\f";  i++; }
        else if (c == '\n') { out += "\\n";  i++; }
        else if (c == '\r') { out += "\\r";  i++; }
        else if (c == '\t') { out += "\\t";  i++; }
        else if (c < 0x20) {
            char buf[8];
            snprintf(buf, sizeof(buf), "\\u%04x", c);
            out += buf;
            i++;
        }
        else if (c < 0x80) {
            // Plain ASCII byte
            out += (char)c;
            i++;
        }
        else {
            // Multi-byte UTF-8: determine expected length and validate
            int seq_len = 0;
            if      ((c & 0xE0) == 0xC0) seq_len = 2;
            else if ((c & 0xF0) == 0xE0) seq_len = 3;
            else if ((c & 0xF8) == 0xF0) seq_len = 4;

            bool valid = (seq_len > 0) && (i + seq_len <= s.size());
            if (valid) {
                for (int j = 1; j < seq_len; j++) {
                    if (((unsigned char)s[i + j] & 0xC0) != 0x80) {
                        valid = false;
                        break;
                    }
                }
            }

            if (valid) {
                // Complete, valid UTF-8 sequence — pass through raw bytes
                for (int j = 0; j < seq_len; j++) {
                    out += s[i + j];
                }
                i += seq_len;
            } else {
                // Broken lead byte or incomplete continuation — emit replacement
                out += "\\uFFFD";
                i++;
            }
        }
    }
    return out;
}

// Safe helper: creates a jstring from a UTF-8 std::string via Java's
// new String(byte[], "UTF-8") constructor, avoiding JNI NewStringUTF
// which aborts under CheckJNI if the bytes are not valid Modified-UTF-8.
static jstring safeNewStringUTF(JNIEnv *env, const std::string & str) {
    jbyteArray bytes = env->NewByteArray((jsize)str.size());
    if (!bytes) return env->NewStringUTF("");
    env->SetByteArrayRegion(bytes, 0, (jsize)str.size(),
                            reinterpret_cast<const jbyte *>(str.data()));
    jclass cls = env->FindClass("java/lang/String");
    jmethodID ctor = env->GetMethodID(cls, "<init>", "([BLjava/lang/String;)V");
    jstring charset = env->NewStringUTF("UTF-8");
    jstring result = (jstring)env->NewObject(cls, ctor, bytes, charset);
    env->DeleteLocalRef(charset);
    env->DeleteLocalRef(cls);
    env->DeleteLocalRef(bytes);
    return result;
}

static bool read_wav_16k(const std::string & fname, std::vector<float> & pcmf32) {
    std::ifstream file(fname, std::ios::binary);
    if (!file.is_open()) {
        LOGE("Failed to open WAV file: %s", fname.c_str());
        return false;
    }

    char header[44];
    if (!file.read(header, 44)) {
        LOGE("Failed to read WAV header: %s", fname.c_str());
        return false;
    }

    if (std::memcmp(header, "RIFF", 4) != 0 || std::memcmp(header + 8, "WAVE", 4) != 0) {
        LOGE("Invalid WAV header format: %s", fname.c_str());
        return false;
    }

    uint32_t data_size = 0;
    if (std::memcmp(header + 36, "data", 4) == 0) {
        std::memcpy(&data_size, header + 40, sizeof(uint32_t));
    } else {
        file.seekg(12, std::ios::beg);
        char chunk_id[4];
        uint32_t chunk_size = 0;
        while (file.read(chunk_id, 4) && file.read((char*)&chunk_size, 4)) {
            if (std::memcmp(chunk_id, "data", 4) == 0) {
                data_size = chunk_size;
                break;
            }
            file.seekg(chunk_size, std::ios::cur);
        }
    }

    if (data_size == 0) {
        LOGE("WAV data chunk not found or empty: %s", fname.c_str());
        return false;
    }

    size_t n_samples = data_size / sizeof(int16_t);
    std::vector<int16_t> pcm16(n_samples);
    if (!file.read((char*)pcm16.data(), data_size)) {
        LOGE("Failed to read WAV PCM data (%u bytes)", data_size);
        return false;
    }

    pcmf32.resize(n_samples);
    for (size_t i = 0; i < n_samples; i++) {
        pcmf32[i] = (float)pcm16[i] / 32768.0f;
    }

    LOGI("Successfully loaded %zu audio samples from %s (%.2f seconds)",
         n_samples, fname.c_str(), (double)n_samples / 16000.0);
    return true;
}

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_longformai_app_WhisperBridge_initModel(
        JNIEnv *env, jclass clazz, jstring model_path_str) {
    const char *model_path = env->GetStringUTFChars(model_path_str, NULL);
    LOGI("Initializing whisper context from: %s", model_path);

    struct whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false;

    struct whisper_context *context = whisper_init_from_file_with_params(model_path, cparams);
    env->ReleaseStringUTFChars(model_path_str, model_path);

    if (!context) {
        LOGE("whisper_init_from_file_with_params failed");
        return 0;
    }

    LOGI("Whisper model loaded successfully: %p", context);
    return (jlong) context;
}

JNIEXPORT void JNICALL
Java_com_longformai_app_WhisperBridge_freeModel(
        JNIEnv *env, jclass clazz, jlong context_ptr) {
    struct whisper_context *context = (struct whisper_context *) context_ptr;
    if (context) {
        LOGI("Freeing whisper context: %p", context);
        whisper_free(context);
    }
}

JNIEXPORT jstring JNICALL
Java_com_longformai_app_WhisperBridge_transcribeWav(
        JNIEnv *env, jclass clazz, jlong context_ptr,
        jstring wav_path_str, jstring lang_str, jint num_threads) {
    struct whisper_context *context = (struct whisper_context *) context_ptr;
    if (!context) {
        return env->NewStringUTF("{\"status\":\"error\",\"message\":\"Whisper context is null\"}");
    }

    const char *wav_path = env->GetStringUTFChars(wav_path_str, NULL);
    std::string wav_path_cpp(wav_path);
    env->ReleaseStringUTFChars(wav_path_str, wav_path);

    std::string language = "auto";
    if (lang_str != NULL) {
        const char *l = env->GetStringUTFChars(lang_str, NULL);
        if (l && strlen(l) > 0) {
            language = l;
        }
        env->ReleaseStringUTFChars(lang_str, l);
    }

    std::vector<float> pcmf32;
    if (!read_wav_16k(wav_path_cpp, pcmf32)) {
        return env->NewStringUTF("{\"status\":\"error\",\"message\":\"Failed to read 16kHz WAV file\"}");
    }

    struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_realtime = false;
    params.print_progress = false;
    params.print_timestamps = false;
    params.print_special = false;
    params.translate = false;
    params.no_context = true;
    params.single_segment = false;
    params.token_timestamps = true;
    params.n_threads = num_threads > 0 ? num_threads : 4;

    if (language == "auto" || language.empty()) {
        params.language = "auto";
        params.detect_language = false;
    } else {
        params.language = language.c_str();
        params.detect_language = false;
    }

    LOGI("Starting whisper_full: language=%s, threads=%d, samples=%zu",
         params.language, params.n_threads, pcmf32.size());

    whisper_reset_timings(context);

    if (whisper_full(context, params, pcmf32.data(), pcmf32.size()) != 0) {
        LOGE("whisper_full execution failed");
        return env->NewStringUTF("{\"status\":\"error\",\"message\":\"whisper_full inference failed\"}");
    }

    const int n_segments = whisper_full_n_segments(context);
    LOGI("Transcription completed: %d segments detected", n_segments);

    // Extract detected language
    const int lang_id = whisper_full_lang_id(context);
    const char * detected_lang = whisper_lang_str(lang_id);
    std::string final_lang = detected_lang ? detected_lang : "en";

    // Build JSON result matching LongFormAI TranscriptionResponse
    double max_end_time = 0.0;
    std::string json = "{\"status\":\"success\",\"language\":\"" + final_lang + "\",\"segments\":[";

    for (int i = 0; i < n_segments; ++i) {
        const int64_t t0 = whisper_full_get_segment_t0(context, i);
        const int64_t t1 = whisper_full_get_segment_t1(context, i);
        const char * text = whisper_full_get_segment_text(context, i);

        const double start = (double)t0 * 0.01;
        const double end = (double)t1 * 0.01;
        if (end > max_end_time) {
            max_end_time = end;
        }

        char seg_header[256];
        snprintf(seg_header, sizeof(seg_header),
                 "%s{\"id\":\"seg_%d_%d\",\"start\":%.2f,\"end\":%.2f,\"text\":\"",
                 (i > 0 ? "," : ""), i + 1, (int)(start * 100), start, end);
        json += seg_header;
        json += json_escape(text ? text : "");
        json += "\"";

        // Word / token level timestamps
        const int n_tokens = whisper_full_n_tokens(context, i);
        if (n_tokens > 0) {
            json += ",\"words\":[";
            bool first_word = true;
            for (int j = 0; j < n_tokens; ++j) {
                const char * tok_text = whisper_full_get_token_text(context, i, j);
                if (!tok_text || strlen(tok_text) == 0) continue;

                whisper_token_data tok_data = whisper_full_get_token_data(context, i, j);
                double tok_start = (double)tok_data.t0 * 0.01;
                double tok_end = (double)tok_data.t1 * 0.01;
                if (tok_start < start) tok_start = start;
                if (tok_end > end) tok_end = end;

                char word_buf[256];
                snprintf(word_buf, sizeof(word_buf),
                         "%s{\"word\":\"", (first_word ? "" : ","));
                json += word_buf;
                json += json_escape(tok_text);
                snprintf(word_buf, sizeof(word_buf),
                         "\",\"start\":%.2f,\"end\":%.2f,\"confidence\":%.2f}",
                         tok_start, tok_end, (double)tok_data.p);
                json += word_buf;
                first_word = false;
            }
            json += "]";
        }

        json += "}";
    }

    char dur_buf[64];
    snprintf(dur_buf, sizeof(dur_buf), "],\"duration\":%.2f}", max_end_time);
    json += dur_buf;

    return safeNewStringUTF(env, json);
}

JNIEXPORT jstring JNICALL
Java_com_longformai_app_WhisperBridge_getSystemInfo(JNIEnv *env, jclass clazz) {
    const char *info = whisper_print_system_info();
    return env->NewStringUTF(info ? info : "whisper.cpp");
}

} // extern "C"
